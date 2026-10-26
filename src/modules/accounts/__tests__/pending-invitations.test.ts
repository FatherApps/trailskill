import { createInMemoryInvitationRepository } from '../data/invitations';
import { acceptPendingInvitations, createInMemoryPendingInvitationRepository, queueInvitation } from '../data/pendingInvitations';

// The pending store is SecureStore-backed next to the in-memory one.
jest.mock('expo-secure-store', () => ({}));
jest.mock('../../../core/sync', () => ({ supabase: {} }));

// Synthetic token and ids only.
const token = 'a'.repeat(32);

function setup() {
  return { pending: createInMemoryPendingInvitationRepository(), invitations: createInMemoryInvitationRepository() };
}

describe('pending invitations', () => {
  it('accepts a queued invitation with its category and forgets it', async () => {
    const { pending, invitations } = setup();

    await queueInvitation(pending, invitations, { userId: 'u1', token, athleteId: 'a1', categoryId: 'c1' });

    expect(invitations.accepted).toEqual([{ token, athleteId: 'a1', categoryId: 'c1' }]);
    expect(await pending.list()).toEqual([]);
  });

  it('keeps the invitation without a network and accepts it once, when the connection returns', async () => {
    const { pending, invitations } = setup();
    invitations.offline = true;

    await queueInvitation(pending, invitations, { userId: 'u1', token, athleteId: 'a1' });
    expect(await pending.list()).toHaveLength(1);

    invitations.offline = false;
    await acceptPendingInvitations('u1', pending, invitations);
    await acceptPendingInvitations('u1', pending, invitations);

    expect(invitations.accepted).toEqual([{ token, athleteId: 'a1' }]);
    expect(await pending.list()).toEqual([]);
  });

  it('keeps the invitation while the server does not know the athlete yet (not managed by the caller)', async () => {
    const { pending, invitations } = setup();
    invitations.rejectWith = '42501';

    await queueInvitation(pending, invitations, { userId: 'u1', token, athleteId: 'a1' });
    expect(await pending.list()).toHaveLength(1);

    invitations.rejectWith = undefined;
    await acceptPendingInvitations('u1', pending, invitations);

    expect(invitations.accepted).toEqual([{ token, athleteId: 'a1' }]);
    expect(await pending.list()).toEqual([]);
  });

  it.each(['P0002', '22023'])('drops an invitation the server rejects for good (%s)', async (code) => {
    const { pending, invitations } = setup();
    invitations.rejectWith = code;

    await queueInvitation(pending, invitations, { userId: 'u1', token, athleteId: 'a1' });

    expect(await pending.list()).toEqual([]);
  });

  it("never tries another account's invitations", async () => {
    const { pending, invitations } = setup();
    await pending.add({ userId: 'u2', token, athleteId: 'a2' });

    await acceptPendingInvitations('u1', pending, invitations);

    expect(invitations.accepted).toEqual([]);
    expect(await pending.list()).toHaveLength(1);
  });

  it('queues one entry per athlete', async () => {
    const { pending } = setup();
    await pending.add({ userId: 'u1', token, athleteId: 'a1' });
    await pending.add({ userId: 'u1', token, athleteId: 'a1', categoryId: 'c1' });

    expect(await pending.list()).toEqual([{ userId: 'u1', token, athleteId: 'a1' }]);
  });
});
