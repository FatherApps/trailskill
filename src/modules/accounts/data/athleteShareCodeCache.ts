import * as SecureStore from 'expo-secure-store';

/**
 * The last share code the phone saw for a swimmer, per user: it lets the code show without signal, and a second account on the same
 * phone never reads the first one's. The server stays the source of truth: the code is refreshed whenever there is signal.
 */
export interface ShareCodeCache {
  get(userId: string, athleteId: string): Promise<string | null>;
  set(userId: string, athleteId: string, code: string): Promise<void>;
  clear(userId: string, athleteId: string): Promise<void>;
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
  };
}

// Local and encrypted, never synced. SecureStore keys take only letters, digits, ".", "-" and "_": ids are UUIDs, so "." separates them.
const keyOf = (userId: string, athleteId: string) => `trailskill-share-code.${userId}.${athleteId}`;

export function createSecureStoreShareCodeCache(): ShareCodeCache {
  return {
    get: (userId, athleteId) => SecureStore.getItemAsync(keyOf(userId, athleteId)),
    set: (userId, athleteId, code) => SecureStore.setItemAsync(keyOf(userId, athleteId), code),
    clear: (userId, athleteId) => SecureStore.deleteItemAsync(keyOf(userId, athleteId)),
  };
}
