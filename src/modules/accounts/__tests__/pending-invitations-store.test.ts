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
// An entry is sent only with the consent the person gave when they accepted.
const consent = { acceptedAt: '2026-11-01T10:00:00.000Z', authorizations: [{ id: 'id-record', purpose: 'record_times' as const, textId: 't-record' }] };

describe('SecureStore pending invitations', () => {
  beforeEach(() => mockStore.clear());

  it('a concurrent add and remove never lose an entry', async () => {
    const pending = createSecureStorePendingInvitationRepository();
    await pending.add({ userId: 'u1', token, athleteId: 'a' });

    await Promise.all([pending.add({ userId: 'u1', token, athleteId: 'b' }), pending.remove('a')]);

    expect((await pending.list()).map((item) => item.athleteId)).toEqual(['b']);
  });

  it('stamps when an entry was queued, and treats an entry saved without a stamp as expired', async () => {
    const pending = createSecureStorePendingInvitationRepository();
    mockStore.set('trailskill-pending-invitations', JSON.stringify([{ userId: 'u1', token, athleteId: 'old' }]));
    await pending.add({ userId: 'u1', token, athleteId: 'new', consent });

    const invitations = createInMemoryInvitationRepository();
    await acceptPendingInvitations('u1', pending, invitations);

    expect(invitations.accepted).toEqual([{ token, athleteId: 'new', consent }]);
    expect(await pending.list()).toEqual([]);
  });

  it('setConsent stores the consent on the entry of the athlete, even next to a concurrent add', async () => {
    const pending = createSecureStorePendingInvitationRepository();
    await pending.add({ userId: 'u1', token, athleteId: 'a' });

    await Promise.all([pending.setConsent('a', consent), pending.add({ userId: 'u1', token, athleteId: 'b' })]);

    expect((await pending.list()).map((item) => [item.athleteId, item.consent])).toEqual([
      ['a', consent],
      ['b', undefined],
    ]);
  });

  it('clear deletes the entries of the account and leaves the other accounts alone', async () => {
    const pending = createSecureStorePendingInvitationRepository();
    await pending.add({ userId: 'u1', token, athleteId: 'a' });
    await pending.add({ userId: 'u2', token, athleteId: 'b' });

    await pending.clear('u1');

    expect((await pending.list()).map((item) => item.athleteId)).toEqual(['b']);
  });
});
