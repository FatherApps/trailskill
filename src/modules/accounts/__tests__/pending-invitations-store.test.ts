import { createInMemoryInvitationRepository } from '../data/invitations';
import { acceptPendingInvitations, createSecureStorePendingInvitationRepository } from '../data/pendingInvitations';

jest.mock('../../../core/sync', () => ({ supabase: {} }));
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

  it('stamps when an entry was queued, and treats an entry saved without a stamp as expired', async () => {
    const pending = createSecureStorePendingInvitationRepository();
    mockStore.set('trailskill-pending-invitations', JSON.stringify([{ userId: 'u1', token, athleteId: 'old' }]));
    await pending.add({ userId: 'u1', token, athleteId: 'new' });

    const invitations = createInMemoryInvitationRepository();
    await acceptPendingInvitations('u1', pending, invitations);

    expect(invitations.accepted).toEqual([{ token, athleteId: 'new' }]);
    expect(await pending.list()).toEqual([]);
  });

  it('clear deletes the entries of the account and leaves the other accounts alone', async () => {
    const pending = createSecureStorePendingInvitationRepository();
    await pending.add({ userId: 'u1', token, athleteId: 'a' });
    await pending.add({ userId: 'u2', token, athleteId: 'b' });

    await pending.clear('u1');

    expect((await pending.list()).map((item) => item.athleteId)).toEqual(['b']);
  });
});
