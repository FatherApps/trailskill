import { createInMemoryInvitationRepository } from '../data/invitations';
import { acceptPendingInvitations, createInMemoryPendingInvitationRepository, queueInvitation } from '../data/pendingInvitations';
import { DRAFT_TTL_MS } from '../data/registrationDraft';

// The pending store is SecureStore-backed next to the in-memory one.
jest.mock('expo-secure-store', () => ({}));
jest.mock('../../../core/sync', () => ({ supabase: {} }));

// Synthetic token and ids only.
const token = 'a'.repeat(32);
// What the screen stores when the person accepts: the three purposes with the text shown, for one athlete.
const consent = {
  acceptedAt: '2026-11-01T10:00:00.000Z',
  authorizations: [
    { id: 'id-record', purpose: 'record_times' as const, textId: 't-record' },
    { id: 'id-import', purpose: 'import_official_results' as const, textId: 't-import' },
    { id: 'id-share', purpose: 'share_results_with_school' as const, textId: 't-share' },
  ],
};

function setup() {
  return { pending: createInMemoryPendingInvitationRepository(), invitations: createInMemoryInvitationRepository() };
}

describe('pending invitations', () => {
  it('accepts a queued invitation with its category and forgets it', async () => {
    const { pending, invitations } = setup();

    await queueInvitation(pending, invitations, { userId: 'u1', token, athleteId: 'a1', categoryId: 'c1', consent });

    expect(invitations.accepted).toEqual([{ token, athleteId: 'a1', categoryId: 'c1', consent }]);
    expect(await pending.list()).toEqual([]);
  });

  it('reports the athletes the server accepted, and not the ones that stay queued or are dropped for good', async () => {
    const { pending, invitations } = setup();
    await pending.add({ userId: 'u1', token, athleteId: 'a1' });
    await pending.setConsent('a1', consent);
    invitations.offline = true;
    expect(await acceptPendingInvitations('u1', pending, invitations)).toEqual([]);
    invitations.offline = false;
    invitations.rejectWith = 'P0002';
    expect(await acceptPendingInvitations('u1', pending, invitations)).toEqual([]);
    expect(await pending.list()).toEqual([]);

    await pending.add({ userId: 'u1', token, athleteId: 'a2' });
    await pending.setConsent('a2', consent);
    invitations.rejectWith = undefined;
    expect(await acceptPendingInvitations('u1', pending, invitations)).toEqual(['a2']);
  });

  it('keeps the invitation without a network and accepts it once, when the connection returns', async () => {
    const { pending, invitations } = setup();
    invitations.offline = true;

    await queueInvitation(pending, invitations, { userId: 'u1', token, athleteId: 'a1', consent });
    expect(await pending.list()).toHaveLength(1);

    invitations.offline = false;
    await acceptPendingInvitations('u1', pending, invitations);
    await acceptPendingInvitations('u1', pending, invitations);

    expect(invitations.accepted).toEqual([{ token, athleteId: 'a1', consent }]);
    expect(await pending.list()).toEqual([]);
  });

  it('keeps the invitation while the server does not know the athlete yet (not managed by the caller)', async () => {
    const { pending, invitations } = setup();
    invitations.rejectWith = '42501';

    await queueInvitation(pending, invitations, { userId: 'u1', token, athleteId: 'a1', consent });
    expect(await pending.list()).toHaveLength(1);

    invitations.rejectWith = undefined;
    await acceptPendingInvitations('u1', pending, invitations);

    expect(invitations.accepted).toEqual([{ token, athleteId: 'a1', consent }]);
    expect(await pending.list()).toEqual([]);
  });

  it.each(['P0002', '22023'])('drops an invitation the server rejects for good (%s)', async (code) => {
    const { pending, invitations } = setup();
    invitations.rejectWith = code;

    await queueInvitation(pending, invitations, { userId: 'u1', token, athleteId: 'a1', consent });

    expect(await pending.list()).toEqual([]);
  });

  it('an inactive category (23514) is retried at once without it, so the athlete still joins the school and group', async () => {
    const { pending, invitations } = setup();
    invitations.rejectCategoryWith = '23514';

    await queueInvitation(pending, invitations, { userId: 'u1', token, athleteId: 'a1', categoryId: 'c1', consent });

    expect(invitations.accepted).toEqual([{ token, athleteId: 'a1', consent }]);
    expect(await pending.list()).toEqual([]);
  });

  it('never sends an entry that has no consent: it waits for the person to accept', async () => {
    const { pending, invitations } = setup();

    await queueInvitation(pending, invitations, { userId: 'u1', token, athleteId: 'a1' });
    await acceptPendingInvitations('u1', pending, invitations);

    expect(invitations.accepted).toEqual([]);
    expect(await pending.list()).toHaveLength(1);
  });

  it('setConsent stores the consent on the entry of that athlete only, and the next run sends it', async () => {
    const { pending, invitations } = setup();
    await pending.add({ userId: 'u1', token, athleteId: 'a1' });
    await pending.add({ userId: 'u1', token, athleteId: 'a2' });

    await pending.setConsent('a1', consent);
    await acceptPendingInvitations('u1', pending, invitations);

    expect(invitations.accepted).toEqual([{ token, athleteId: 'a1', consent }]);
    expect((await pending.list()).map((item) => item.athleteId)).toEqual(['a2']);
  });

  it('setConsent on an athlete that is not queued changes nothing', async () => {
    const { pending } = setup();
    await pending.add({ userId: 'u1', token, athleteId: 'a1' });

    await pending.setConsent('a9', consent);

    expect(await pending.list()).toEqual([{ userId: 'u1', token, athleteId: 'a1', queuedAt: expect.any(Number) }]);
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

    expect(await pending.list()).toEqual([{ userId: 'u1', token, athleteId: 'a1', queuedAt: expect.any(Number) }]);
  });

  describe('expiry and sign-out', () => {
    afterEach(() => jest.useRealTimers());

    it('drops an entry queued longer ago than the draft lifetime without calling accept', async () => {
      jest.useFakeTimers({ now: 1_000_000 });
      const { pending, invitations } = setup();
      invitations.rejectWith = '42501';
      await queueInvitation(pending, invitations, { userId: 'u1', token, athleteId: 'a1', consent });
      invitations.rejectWith = undefined;
      invitations.accepted.length = 0;

      await acceptPendingInvitations('u1', pending, invitations, 1_000_000 + DRAFT_TTL_MS + 1);

      expect(invitations.accepted).toEqual([]);
      expect(await pending.list()).toEqual([]);
    });

    it('drops an entry without consent once it is older than the draft lifetime, and never sends it', async () => {
      jest.useFakeTimers({ now: 1_000_000 });
      const { pending, invitations } = setup();
      await pending.add({ userId: 'u1', token, athleteId: 'a1' });

      await acceptPendingInvitations('u1', pending, invitations, 1_000_000 + DRAFT_TTL_MS);
      expect(await pending.list()).toHaveLength(1);

      await acceptPendingInvitations('u1', pending, invitations, 1_000_000 + DRAFT_TTL_MS + 1);
      expect(invitations.accepted).toEqual([]);
      expect(await pending.list()).toEqual([]);
    });

    it('still accepts an entry queued within the draft lifetime', async () => {
      jest.useFakeTimers({ now: 1_000_000 });
      const { pending, invitations } = setup();
      invitations.rejectWith = '42501';
      await queueInvitation(pending, invitations, { userId: 'u1', token, athleteId: 'a1', consent });
      invitations.rejectWith = undefined;

      await acceptPendingInvitations('u1', pending, invitations, 1_000_000 + DRAFT_TTL_MS);

      expect(invitations.accepted).toEqual([{ token, athleteId: 'a1', consent }]);
    });

    it('clear removes the entries of that account and keeps the others', async () => {
      const { pending } = setup();
      await pending.add({ userId: 'u1', token, athleteId: 'a1' });
      await pending.add({ userId: 'u2', token, athleteId: 'a2' });

      await pending.clear('u1');

      expect((await pending.list()).map((item) => item.athleteId)).toEqual(['a2']);
    });
  });
});
