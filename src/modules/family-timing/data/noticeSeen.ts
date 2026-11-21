import * as SecureStore from 'expo-secure-store';

// Whether this person already saw a notice: the one that explains "Mis tiempos", the one before the camera permissions (#1173), or the one before the QR scanner's (issue 1322). Each shows on the first visit only, on this phone.
export interface FamilyTimingNoticeStore {
  seen(userId: string): Promise<boolean>;
  markSeen(userId: string): Promise<void>;
}

export type FamilyTimingNoticeKind = 'notice' | 'video-intro' | 'qr-intro';

// SecureStore keys take letters, digits, ".", "-" and "_"; a user id is a UUID. The first kind keeps the key it always had.
const keyOf = (kind: FamilyTimingNoticeKind, userId: string) => `trailskill-family-timing-${kind}-${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export function createSecureStoreFamilyTimingNoticeStore(kind: FamilyTimingNoticeKind = 'notice'): FamilyTimingNoticeStore {
  return {
    async seen(userId) {
      return (await SecureStore.getItemAsync(keyOf(kind, userId))) === '1';
    },
    async markSeen(userId) {
      await SecureStore.setItemAsync(keyOf(kind, userId), '1');
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
