import * as SecureStore from 'expo-secure-store';

/** What the phone last learned about whether the signed-in account is marked for deletion: the state and, when marked, the date. */
export type KnownDeletionStatus = { state: 'active' } | { state: 'marked'; deleteAfter: string };

/**
 * The last answer of the server about the account that is signed in (issue 1311), so the app opens from it and asks again in the
 * background. It holds nothing else, and an answer remembered for another person is never read as this one's.
 */
export interface KnownDeletionStatusRepository {
  read(userId: string): Promise<KnownDeletionStatus | null>;
  write(userId: string, status: KnownDeletionStatus): Promise<void>;
  /** Forgets it: the person signed out. */
  clear(): Promise<void>;
}

// SecureStore keys allow only letters, digits, ".", "-" and "_". One key: a different person's answer replaces the earlier one.
const KEY = 'trailskill-deletion-status';

// Every write and clear goes through one line, whichever repository object asks: a clear (the sign-out) always runs after the writes
// that were asked before it, so a slow write can never put the value back on the phone afterwards.
let tail: Promise<unknown> = Promise.resolve();
function inOrder<T>(operation: () => Promise<T>): Promise<T> {
  const run = tail.then(operation, operation);
  tail = run.catch(() => {});
  return run;
}

export function createInMemoryKnownDeletionStatusRepository(initial?: { userId: string; status: KnownDeletionStatus }): KnownDeletionStatusRepository {
  let stored = initial;
  return {
    async read(userId) {
      return stored?.userId === userId ? stored.status : null;
    },
    async write(userId, status) {
      stored = { userId, status };
    },
    async clear() {
      stored = undefined;
    },
  };
}

// Local, encrypted and never synced; PowerSync's clear on sign-in does not touch it.
export function createSecureStoreKnownDeletionStatusRepository(): KnownDeletionStatusRepository {
  return {
    async read(userId) {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw === null) return null;
      try {
        const value = JSON.parse(raw) as { userId?: unknown; state?: unknown; deleteAfter?: unknown };
        if (value.userId !== userId) return null;
        if (value.state === 'active') return { state: 'active' };
        // A marked account with no date is a damaged value, never an answer.
        return value.state === 'marked' && typeof value.deleteAfter === 'string' ? { state: 'marked', deleteAfter: value.deleteAfter } : null;
      } catch {
        return null;
      }
    },
    write: (userId, status) => inOrder(() => SecureStore.setItemAsync(KEY, JSON.stringify({ userId, ...status }))),
    clear: () => inOrder(() => SecureStore.deleteItemAsync(KEY)),
  };
}
