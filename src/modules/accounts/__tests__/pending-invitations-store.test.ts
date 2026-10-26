import { createSecureStorePendingInvitationRepository } from '../data/pendingInvitations';

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

// Synthetic token and ids only.
const token = 'a'.repeat(32);

describe('SecureStore pending invitations', () => {
  it('a concurrent add and remove never lose an entry', async () => {
    const pending = createSecureStorePendingInvitationRepository();
    await pending.add({ userId: 'u1', token, athleteId: 'a' });

    await Promise.all([pending.add({ userId: 'u1', token, athleteId: 'b' }), pending.remove('a')]);

    expect((await pending.list()).map((item) => item.athleteId)).toEqual(['b']);
  });
});
