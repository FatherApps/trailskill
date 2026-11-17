import * as SecureStore from 'expo-secure-store';

import { createSecureStoreFamilyTimingNoticeStore } from '../data/noticeSeen';

const mockValues = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockValues.set(key, value)),
}));

describe('the seen notices on this phone', () => {
  beforeEach(() => mockValues.clear());

  it('keeps the key the Mis tiempos notice always had', async () => {
    await createSecureStoreFamilyTimingNoticeStore().markSeen('user-1');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('trailskill-family-timing-notice-user-1', '1');
  });

  it('remembers the explanation before the camera permissions apart from the Mis tiempos notice', async () => {
    const notice = createSecureStoreFamilyTimingNoticeStore();
    const intro = createSecureStoreFamilyTimingNoticeStore('video-intro');
    await intro.markSeen('user-1');
    expect(await intro.seen('user-1')).toBe(true);
    expect(await notice.seen('user-1')).toBe(false);
    expect(await intro.seen('user-2')).toBe(false);
  });
});
