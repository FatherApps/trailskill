import * as SecureStore from 'expo-secure-store';

/**
 * The last share code the phone saw for a swimmer, per user: it lets the code show without signal, and a second account on the same
 * phone never reads the first one's. The server stays the source of truth: the code is refreshed whenever there is signal.
 */
export interface ShareCodeCache {
  get(userId: string, athleteId: string): Promise<string | null>;
  set(userId: string, athleteId: string, code: string): Promise<void>;
  clear(userId: string, athleteId: string): Promise<void>;
  /** Forgets every code of the user, on sign-out. Other users' codes stay. */
  clearUser(userId: string): Promise<void>;
}

export function createInMemoryShareCodeCache(): ShareCodeCache & { entries: Map<string, string> } {
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
    async clear(userId, athleteId) {
      entries.delete(keyOf(userId, athleteId));
    },
    async clearUser(userId) {
      for (const key of [...entries.keys()]) if (key.startsWith(`${userId}:`)) entries.delete(key);
    },
  };
}

// SecureStore cannot list its keys, so all of a user's codes live in one entry ({ athleteId: code }) that one delete removes on sign-out.
// Keys take only letters, digits, ".", "-" and "_": the user id is a UUID.
const keyOf = (userId: string) => `trailskill-share-codes.${userId}`;

// set() and clear() read the entry and write it back, and chips and the profile call them together: one at a time.
let writes: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const run = writes.then(operation);
  writes = run.catch(() => {});
  return run;
}

// Local and encrypted, never synced.
export function createSecureStoreShareCodeCache(): ShareCodeCache {
  async function read(userId: string): Promise<Record<string, unknown>> {
    const raw = await SecureStore.getItemAsync(keyOf(userId));
    try {
      const parsed: unknown = raw === null ? {} : JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  const write = (userId: string, codes: Record<string, unknown>) =>
    Object.keys(codes).length === 0 ? SecureStore.deleteItemAsync(keyOf(userId)) : SecureStore.setItemAsync(keyOf(userId), JSON.stringify(codes));
  return {
    async get(userId, athleteId) {
      const code = (await read(userId))[athleteId];
      return typeof code === 'string' ? code : null;
    },
    set: (userId, athleteId, code) => serialized(async () => write(userId, { ...(await read(userId)), [athleteId]: code })),
    clear: (userId, athleteId) =>
      serialized(async () => {
        const codes = await read(userId);
        delete codes[athleteId];
        await write(userId, codes);
      }),
    clearUser: (userId) => serialized(() => SecureStore.deleteItemAsync(keyOf(userId))),
  };
}
