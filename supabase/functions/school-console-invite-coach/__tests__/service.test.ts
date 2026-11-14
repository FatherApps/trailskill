import { createInviteCoach } from '../service.ts';
import { createTestSender } from '../testSender.ts';
import { createMemoryStore } from './fakes.ts';

const SCHOOL = '11111111-1111-4111-8111-111111111111';
const OTHER_SCHOOL = '22222222-2222-4222-8222-222222222222';
const EMAIL = 'coach@example.test';

describe('createTestSender', () => {
  it('sends nothing and records what it was asked to deliver', async () => {
    const sender = createTestSender();
    await sender.deliver({ id: 'i1', schoolId: SCHOOL, email: EMAIL });
    expect(sender.delivered).toEqual([{ id: 'i1', schoolId: SCHOOL, email: EMAIL }]);
  });
});

describe('inviteCoach', () => {
  it('creates the pending invitation and delivers it', async () => {
    const { store, invitations } = createMemoryStore([SCHOOL]);
    const sender = createTestSender();
    const outcome = await createInviteCoach({ store, sender })({ schoolId: SCHOOL, email: EMAIL });
    expect(outcome).toEqual({ ok: true, value: { invitationId: 'invitation-1' } });
    expect(invitations).toHaveLength(1);
    expect(sender.delivered).toEqual([{ id: 'invitation-1', schoolId: SCHOOL, email: EMAIL }]);
  });

  it('refuses a caller who is not an admin of the school, and delivers nothing', async () => {
    const { store, invitations } = createMemoryStore([OTHER_SCHOOL]);
    const sender = createTestSender();
    const outcome = await createInviteCoach({ store, sender })({ schoolId: SCHOOL, email: EMAIL });
    expect(outcome).toEqual({ ok: false, error: { code: 'not_authorized' } });
    expect(invitations).toEqual([]);
    expect(sender.delivered).toEqual([]);
  });

  it('answers unavailable when delivery fails, keeps the invitation, and inviting again reuses it and delivers again', async () => {
    const { store, invitations } = createMemoryStore([SCHOOL]);
    const sender = createTestSender();
    const failing = { deliver: async () => Promise.reject(new Error('down')) };
    expect(await createInviteCoach({ store, sender: failing })({ schoolId: SCHOOL, email: EMAIL })).toEqual({ ok: false, error: { code: 'unavailable' } });
    expect(invitations).toHaveLength(1);
    expect(await createInviteCoach({ store, sender })({ schoolId: SCHOOL, email: EMAIL })).toEqual({ ok: true, value: { invitationId: 'invitation-1' } });
    expect(invitations).toHaveLength(1);
    expect(sender.delivered).toHaveLength(1);
  });

  it('lets a store failure through', async () => {
    const store = { create: async () => Promise.reject(new Error('boom')) };
    await expect(createInviteCoach({ store, sender: createTestSender() })({ schoolId: SCHOOL, email: EMAIL })).rejects.toThrow('boom');
  });
});
