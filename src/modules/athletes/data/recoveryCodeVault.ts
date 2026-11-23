import * as SecureStore from 'expo-secure-store';

/**
 * The permanent code of a swimmer, per user, on this phone only. The server never knows the text, so if it is lost nobody can read it
 * again: it is not cleared on sign-out. Another account on the same phone never reads it (the key carries the user). The recovery codes
 * are never saved here. It is local and encrypted, outside every synced table, so it is never uploaded.
 *
 * It fails closed: a stored value that is not a code is never read as one and never overwritten (a code may still be inside it), and a
 * different code is never written over a stored one. `get` and `set` reject with `recovery_code_unreadable` / `recovery_code_conflict`.
 */
export interface RecoveryCodeVault {
  /** The saved code, or `null` when there is none. Rejects with `recovery_code_unreadable` when something else is stored. */
  get(userId: string, athleteId: string): Promise<string | null>;
  /** Saves the code. Saving the same code again is harmless; another code over a stored one rejects with `recovery_code_conflict`. */
  set(userId: string, athleteId: string, code: string): Promise<void>;
  /** Forgets a code the server no longer honours (its set was replaced). The only way a stored code is removed. */
  remove(userId: string, athleteId: string): Promise<void>;
  /** Whether the code was saved here but the server was not told yet (`confirm_athlete_recovery_codes`). Kept until it is. */
  isConfirmPending(userId: string, athleteId: string): Promise<boolean>;
  setConfirmPending(userId: string, athleteId: string, pending: boolean): Promise<void>;
}

// The shape of what the server issues: TR-XXXX-XXXX-XXXX-XXXX. Anything else in the entry is not a code.
const CODE = /^TR-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/;
// The in-memory fake and tests use synthetic texts that need not follow the server's alphabet.
const isCode = (value: string, strict: boolean) => (strict ? CODE.test(value) : /^TR-[A-Za-z0-9-]+$/.test(value));

// One entry per swimmer: no entry is ever read, changed and written back with others, so one that cannot be read never costs another.
// Keys take only letters, digits, ".", "-" and "_": ids are UUIDs.
const codeKey = (userId: string, athleteId: string) => `trailskill-recovery-code.${userId}.${athleteId}`;
const pendingKey = (userId: string, athleteId: string) => `trailskill-recovery-confirm.${userId}.${athleteId}`;

function unreadable(): Error {
  return new Error('recovery_code_unreadable');
}

export function createInMemoryRecoveryCodeVault(): RecoveryCodeVault & { entries: Map<string, string>; pending: Set<string> } {
  const entries = new Map<string, string>();
  const pending = new Set<string>();
  const keyOf = (userId: string, athleteId: string) => `${userId}:${athleteId}`;
  return {
    entries,
    pending,
    async get(userId, athleteId) {
      const stored = entries.get(keyOf(userId, athleteId));
      if (stored === undefined) return null;
      if (!isCode(stored, false)) throw unreadable();
      return stored;
    },
    async set(userId, athleteId, code) {
      const stored = entries.get(keyOf(userId, athleteId));
      if (stored !== undefined && stored !== code) throw new Error('recovery_code_conflict');
      entries.set(keyOf(userId, athleteId), code);
    },
    async remove(userId, athleteId) {
      entries.delete(keyOf(userId, athleteId));
      pending.delete(keyOf(userId, athleteId));
    },
    async isConfirmPending(userId, athleteId) {
      return pending.has(keyOf(userId, athleteId));
    },
    async setConfirmPending(userId, athleteId, value) {
      if (value) pending.add(keyOf(userId, athleteId));
      else pending.delete(keyOf(userId, athleteId));
    },
  };
}

export function createSecureStoreRecoveryCodeVault(): RecoveryCodeVault {
  return {
    async get(userId, athleteId) {
      const stored = await SecureStore.getItemAsync(codeKey(userId, athleteId));
      if (stored === null) return null;
      if (!isCode(stored, true)) throw unreadable();
      return stored;
    },
    async set(userId, athleteId, code) {
      const stored = await SecureStore.getItemAsync(codeKey(userId, athleteId));
      if (stored !== null && stored !== code) throw new Error(isCode(stored, true) ? 'recovery_code_conflict' : 'recovery_code_unreadable');
      if (stored === null) await SecureStore.setItemAsync(codeKey(userId, athleteId), code);
    },
    async remove(userId, athleteId) {
      await SecureStore.deleteItemAsync(codeKey(userId, athleteId));
      await SecureStore.deleteItemAsync(pendingKey(userId, athleteId));
    },
    async isConfirmPending(userId, athleteId) {
      return (await SecureStore.getItemAsync(pendingKey(userId, athleteId))) !== null;
    },
    async setConfirmPending(userId, athleteId, pending) {
      if (pending) await SecureStore.setItemAsync(pendingKey(userId, athleteId), '1');
      else await SecureStore.deleteItemAsync(pendingKey(userId, athleteId));
    },
  };
}
