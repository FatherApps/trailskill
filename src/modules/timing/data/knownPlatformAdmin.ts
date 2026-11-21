import * as SecureStore from 'expo-secure-store';

/**
 * The last answer of the server to «is this person a platform admin» for the account that is signed in (issue 1311), so the landing
 * does not wait for the server at every start. It holds the own user id and a boolean, nothing else, and an answer remembered for
 * another person is never read as this one's. Unknown is never an answer: it reads as `null`, and the caller then treats it as «no».
 */
export interface KnownPlatformAdminRepository {
  read(userId: string): Promise<boolean | null>;
  write(userId: string, admin: boolean): Promise<void>;
  /** Forgets it: the person signed out. */
  clear(): Promise<void>;
}

// SecureStore keys allow only letters, digits, ".", "-" and "_". One key: a different person's answer replaces the earlier one.
const KEY = 'trailskill-platform-admin';

export function createInMemoryKnownPlatformAdminRepository(initial?: { userId: string; admin: boolean }): KnownPlatformAdminRepository & { calls: string[] } {
  let stored = initial;
  const calls: string[] = [];
  return {
    calls,
    async read(userId) {
      calls.push('read');
      return stored?.userId === userId ? stored.admin : null;
    },
    async write(userId, admin) {
      calls.push('write');
      stored = { userId, admin };
    },
    async clear() {
      calls.push('clear');
      stored = undefined;
    },
  };
}

// Local, encrypted and never synced; PowerSync's clear on sign-in does not touch it. The backend still decides what a platform admin may do.
export function createSecureStoreKnownPlatformAdminRepository(): KnownPlatformAdminRepository {
  return {
    async read(userId) {
      try {
        const raw = await SecureStore.getItemAsync(KEY);
        if (raw === null) return null;
        const value = JSON.parse(raw) as { userId?: unknown; admin?: unknown };
        return value.userId === userId && typeof value.admin === 'boolean' ? value.admin : null;
      } catch {
        return null;
      }
    },
    write: (userId, admin) => SecureStore.setItemAsync(KEY, JSON.stringify({ userId, admin })),
    clear: () => SecureStore.deleteItemAsync(KEY),
  };
}
