import * as SecureStore from 'expo-secure-store';

// Whether this person already saw the notice that explains "Mis tiempos". It shows on the first visit only, on this phone.
export interface FamilyTimingNoticeStore {
  seen(userId: string): Promise<boolean>;
  markSeen(userId: string): Promise<void>;
}

// SecureStore keys take letters, digits, ".", "-" and "_"; a user id is a UUID.
const keyOf = (userId: string) => `trailskill-family-timing-notice-${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export function createSecureStoreFamilyTimingNoticeStore(): FamilyTimingNoticeStore {
  return {
    async seen(userId) {
      return (await SecureStore.getItemAsync(keyOf(userId))) === '1';
    },
    async markSeen(userId) {
      await SecureStore.setItemAsync(keyOf(userId), '1');
    },
  };
}

export function createInMemoryFamilyTimingNoticeStore(seenBy: string[] = []): FamilyTimingNoticeStore & { seenBy: Set<string> } {
  const store = new Set(seenBy);
  return {
    seenBy: store,
    async seen(userId) {
      return store.has(userId);
    },
    async markSeen(userId) {
      store.add(userId);
    },
  };
}
