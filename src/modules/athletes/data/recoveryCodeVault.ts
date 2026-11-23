import * as SecureStore from 'expo-secure-store';

/**
 * The permanent code of a swimmer, per user, on this phone only. The server never knows the text, so if it is lost nobody can read it
 * again: it is not cleared on sign-out. Another account on the same phone never reads it (the key carries the user). The recovery codes
 * are never saved here. It is local and encrypted, outside every synced table, so it is never uploaded.
 */
export interface RecoveryCodeVault {
  get(userId: string, athleteId: string): Promise<string | null>;
  set(userId: string, athleteId: string, code: string): Promise<void>;
}

export function createInMemoryRecoveryCodeVault(): RecoveryCodeVault & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  const keyOf = (userId: string, athleteId: string) => `${userId}:${athleteId}`;
  return {
    entries,
    async get(userId, athleteId) {
      return entries.get(keyOf(userId, athleteId)) ?? null;
    },
    async set(userId, athleteId, code) {
      entries.set(keyOf(userId, athleteId), code);
    },
  };
}

// SecureStore cannot list its keys, so all of a user's codes live in one entry ({ athleteId: code }). Keys take only letters, digits,
// ".", "-" and "_": the user id is a UUID.
const keyOf = (userId: string) => `trailskill-recovery-codes.${userId}`;

// set() reads the entry and writes it back: one at a time.
let writes: Promise<unknown> = Promise.resolve();

export function createSecureStoreRecoveryCodeVault(): RecoveryCodeVault {
  async function read(userId: string): Promise<Record<string, unknown>> {
    const raw = await SecureStore.getItemAsync(keyOf(userId));
    try {
      const parsed: unknown = raw === null ? {} : JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {
    async get(userId, athleteId) {
      const code = (await read(userId))[athleteId];
      return typeof code === 'string' ? code : null;
    },
    set(userId, athleteId, code) {
      const run = writes.then(async () => SecureStore.setItemAsync(keyOf(userId), JSON.stringify({ ...(await read(userId)), [athleteId]: code })));
      writes = run.catch(() => {});
      return run;
    },
  };
}
