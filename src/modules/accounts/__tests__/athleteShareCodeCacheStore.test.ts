import { createSecureStoreShareCodeCache } from '../data/athleteShareCodeCache';

const mockStore = new Map<string, string>();
// Each call yields first, so an unserialized read-modify-write interleaves with the next one.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => {
    await tick();
    return mockStore.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    await tick();
    mockStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    await tick();
    mockStore.delete(key);
  },
}));

// Synthetic ids and codes only.
describe('SecureStore share code cache', () => {
  beforeEach(() => mockStore.clear());

  it('keeps each user and swimmer apart, and two writes at once lose neither', async () => {
    const cache = createSecureStoreShareCodeCache();
    await Promise.all([cache.set('u1', 'a1', 'TS-AAAAAA'), cache.set('u1', 'a2', 'TS-BBBBBB'), cache.set('u2', 'a1', 'TS-CCCCCC')]);

    expect(await cache.get('u1', 'a1')).toBe('TS-AAAAAA');
    expect(await cache.get('u1', 'a2')).toBe('TS-BBBBBB');
    expect(await cache.get('u2', 'a1')).toBe('TS-CCCCCC');
    expect(await cache.get('u3', 'a1')).toBeNull();
  });

  it('clears one swimmer, and removes the whole entry of a user without touching another', async () => {
    const cache = createSecureStoreShareCodeCache();
    await cache.set('u1', 'a1', 'TS-AAAAAA');
    await cache.set('u1', 'a2', 'TS-BBBBBB');
    await cache.set('u2', 'a1', 'TS-CCCCCC');

    await cache.clear('u1', 'a1');
    expect(await cache.get('u1', 'a1')).toBeNull();
    expect(await cache.get('u1', 'a2')).toBe('TS-BBBBBB');

    await cache.clearUser('u1');
    expect(await cache.get('u1', 'a2')).toBeNull();
    expect(await cache.get('u2', 'a1')).toBe('TS-CCCCCC');
    expect([...mockStore.keys()].filter((key) => key.includes('u1'))).toEqual([]);
  });

  it('treats a damaged entry as empty', async () => {
    mockStore.set('trailskill-share-codes.u1', '[not json');
    const cache = createSecureStoreShareCodeCache();
    expect(await cache.get('u1', 'a1')).toBeNull();
    await cache.set('u1', 'a1', 'TS-AAAAAA');
    expect(await cache.get('u1', 'a1')).toBe('TS-AAAAAA');
  });
});
