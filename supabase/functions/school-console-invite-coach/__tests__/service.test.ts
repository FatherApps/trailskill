import type { InvitationSender } from '../port.ts';
import { createInviteCoach } from '../service.ts';
import { createResendSender } from '../resendSender.ts';
import { selectSender } from '../selectSender.ts';
import { createTestSender, TEST_SENDER_LIMIT } from '../testSender.ts';
import { withSendLimit } from '../sendLimit.ts';
import { createMemoryLimiter, createMemoryStore, SCHOOL_NAME } from './fakes.ts';

const SCHOOL = '11111111-1111-4111-8111-111111111111';
const OTHER_SCHOOL = '22222222-2222-4222-8222-222222222222';
const EMAIL = 'coach@example.test';
const INVITATION = { schoolId: SCHOOL, email: EMAIL, schoolName: SCHOOL_NAME };

describe('createTestSender', () => {
  it('sends nothing and records what it was asked to deliver', async () => {
    const sender = createTestSender();
    await expect(sender.deliver({ id: 'i1', ...INVITATION })).resolves.toBe(false);
    expect(sender.delivered).toEqual([{ id: 'i1', ...INVITATION }]);
  });

  it('keeps only the last TEST_SENDER_LIMIT deliveries, in the same array', async () => {
    const sender = createTestSender();
    const delivered = sender.delivered;
    for (let i = 0; i <= TEST_SENDER_LIMIT; i++) await sender.deliver({ id: `i${i}`, ...INVITATION });
    expect(sender.delivered).toBe(delivered);
    expect(delivered).toHaveLength(TEST_SENDER_LIMIT);
    expect(delivered[0].id).toBe('i1');
    expect(delivered[delivered.length - 1].id).toBe(`i${TEST_SENDER_LIMIT}`);
  });
});

describe('inviteCoach', () => {
  it('creates the pending invitation and delivers it', async () => {
    const { store, invitations } = createMemoryStore([SCHOOL]);
    const sender = createTestSender();
    const outcome = await createInviteCoach({ store, sender })({ schoolId: SCHOOL, email: EMAIL });
    expect(outcome).toEqual({ ok: true, value: { invitationId: 'invitation-1', emailSent: false } });
    expect(invitations).toHaveLength(1);
    expect(sender.delivered).toEqual([{ id: 'invitation-1', ...INVITATION }]);
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
    const failing = { deliver: async (): Promise<boolean> => Promise.reject(new Error('down')) };
    expect(await createInviteCoach({ store, sender: failing })({ schoolId: SCHOOL, email: EMAIL })).toEqual({ ok: false, error: { code: 'unavailable', invitationId: 'invitation-1' } });
    expect(invitations).toHaveLength(1);
    expect(await createInviteCoach({ store, sender })({ schoolId: SCHOOL, email: EMAIL })).toEqual({ ok: true, value: { invitationId: 'invitation-1', emailSent: false } });
    expect(invitations).toHaveLength(1);
    expect(sender.delivered).toHaveLength(1);
  });

  it('answers unavailable when Resend fails, leaks nothing, and inviting again reuses the invitation and delivers', async () => {
    const KEY = 're_test_not_a_real_key';
    const { store, invitations } = createMemoryStore([SCHOOL]);
    const calls: string[] = [];
    let status = 500;
    const fetch = (async (_url: string, init: RequestInit) => {
      calls.push(init.body as string);
      return new Response(`secret-body-detail ${KEY}`, { status });
    }) as unknown as typeof globalThis.fetch;
    const inviteCoach = createInviteCoach({ store, sender: createResendSender({ apiKey: KEY, from: 'Swimcro <no-reply@example.test>', fetch }) });

    const outcome = await inviteCoach({ schoolId: SCHOOL, email: EMAIL });
    expect(outcome).toEqual({ ok: false, error: { code: 'unavailable', invitationId: 'invitation-1' } });
    expect(JSON.stringify(outcome)).not.toMatch(/re_test|secret-body-detail/);
    expect(invitations).toHaveLength(1);

    status = 200;
    expect(await inviteCoach({ schoolId: SCHOOL, email: EMAIL })).toEqual({ ok: true, value: { invitationId: 'invitation-1', emailSent: true } });
    expect(invitations).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it('answers unavailable when Resend times out, keeps the invitation, and inviting again reuses it and sends the same Idempotency-Key', async () => {
    const { store, invitations } = createMemoryStore([SCHOOL]);
    const keys: string[] = [];
    let answers = false;
    const fetch = (async (_url: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)['Idempotency-Key']);
      if (answers) return new Response('{}', { status: 200 });
      return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
    }) as unknown as typeof globalThis.fetch;
    const inviteCoach = createInviteCoach({ store, sender: createResendSender({ apiKey: 're_test_not_a_real_key', from: 'Swimcro <no-reply@example.test>', fetch, timeoutMs: 20 }) });

    expect(await inviteCoach({ schoolId: SCHOOL, email: EMAIL })).toEqual({ ok: false, error: { code: 'unavailable', invitationId: 'invitation-1' } });
    expect(invitations).toHaveLength(1);

    answers = true;
    expect(await inviteCoach({ schoolId: SCHOOL, email: EMAIL })).toEqual({ ok: true, value: { invitationId: 'invitation-1', emailSent: true } });
    expect(invitations).toHaveLength(1);
    expect(keys).toEqual(['coach-invitation/invitation-1', 'coach-invitation/invitation-1']);
  });

  describe('logging a failed delivery', () => {
    const KEY = 're_test_not_a_real_key';
    const BODY = 'secret-body-detail';
    const FROM = 'Swimcro <no-reply@example.test>';
    let error: jest.SpyInstance;
    beforeEach(() => {
      error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => error.mockRestore());

    // What this one failed delivery logged.
    const fail = async (sender: InvitationSender) => {
      error.mockClear();
      const { store } = createMemoryStore([SCHOOL]);
      expect(await createInviteCoach({ store, sender })({ schoolId: SCHOOL, email: EMAIL })).toEqual({ ok: false, error: { code: 'unavailable', invitationId: 'invitation-1' } });
      return error.mock.calls.map((call) => call.join(' '));
    };
    const respond = (status: number) => (async () => new Response(`${BODY} ${KEY} ${EMAIL}`, { status })) as unknown as typeof globalThis.fetch;

    it('logs only the fixed text of a Resend HTTP failure, a missing sender address, a network failure and a timeout', async () => {
      const abort = (async (_url: string, init: RequestInit) => new Promise<Response>((_r, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)))) as unknown as typeof globalThis.fetch;
      const down = (async () => Promise.reject(new Error(`${KEY} ${EMAIL}`))) as unknown as typeof globalThis.fetch;
      const logged = [
        ...(await fail(createResendSender({ apiKey: KEY, from: FROM, fetch: respond(401) }))),
        ...(await fail(selectSender({ RESEND_API_KEY: KEY }, respond(200)))),
        ...(await fail(createResendSender({ apiKey: KEY, from: FROM, fetch: down }))),
        ...(await fail(createResendSender({ apiKey: KEY, from: FROM, fetch: abort, timeoutMs: 20 }))),
      ];
      expect(logged).toEqual([
        'school-console-invite-coach delivery failed: Resend delivery failed (HTTP 401)',
        'school-console-invite-coach delivery failed: Resend sender is not configured',
        'school-console-invite-coach delivery failed: Resend delivery failed (network)',
        'school-console-invite-coach delivery failed: Resend delivery failed (network)',
      ]);
      for (const secret of [KEY, 'invitation-1', EMAIL, BODY]) expect(logged.join('\n')).not.toContain(secret);
    });

    it('logs unknown for any other rejection, whatever its message carries', async () => {
      const logged = [
        ...(await fail({ deliver: async () => Promise.reject(new Error(`${EMAIL} invitation-1 ${KEY}`)) })),
        ...(await fail({ deliver: async () => Promise.reject(`${EMAIL} ${KEY}`) })),
      ];
      expect(logged).toEqual(['school-console-invite-coach delivery failed: unknown', 'school-console-invite-coach delivery failed: unknown']);
    });
  });

  describe('with the send limit', () => {
    const OTHER_EMAIL = 'other-coach@example.test';
    const limited = (limits: { callerLimit: number; recipientLimit: number }) => {
      const { store } = createMemoryStore([SCHOOL]);
      const limiter = createMemoryLimiter(limits);
      const sender = createTestSender();
      return { inviteCoach: createInviteCoach({ store: withSendLimit(store, limiter.rpc), sender }), sender, limiter };
    };

    it('resends under the limit', async () => {
      const { inviteCoach, sender } = limited({ callerLimit: 5, recipientLimit: 2 });
      expect(await inviteCoach({ schoolId: SCHOOL, email: EMAIL })).toEqual({ ok: true, value: { invitationId: 'invitation-1', emailSent: false } });
      expect(await inviteCoach({ schoolId: SCHOOL, email: EMAIL })).toEqual({ ok: true, value: { invitationId: 'invitation-1', emailSent: false } });
      expect(sender.delivered).toHaveLength(2);
    });

    it('answers recipient_rate_limited above the recipient limit and sends no email, while another recipient still gets theirs', async () => {
      const { inviteCoach, sender } = limited({ callerLimit: 5, recipientLimit: 2 });
      await inviteCoach({ schoolId: SCHOOL, email: EMAIL });
      await inviteCoach({ schoolId: SCHOOL, email: EMAIL });
      expect(await inviteCoach({ schoolId: SCHOOL, email: EMAIL })).toEqual({ ok: false, error: { code: 'recipient_rate_limited' } });
      expect(sender.delivered).toHaveLength(2);
      expect(await inviteCoach({ schoolId: SCHOOL, email: OTHER_EMAIL })).toEqual({ ok: true, value: { invitationId: 'invitation-2', emailSent: false } });
      expect(sender.delivered).toHaveLength(3);
    });

    it('answers caller_rate_limited above the caller limit, whatever the recipient, and sends no email', async () => {
      const { inviteCoach, sender } = limited({ callerLimit: 2, recipientLimit: 5 });
      await inviteCoach({ schoolId: SCHOOL, email: EMAIL });
      await inviteCoach({ schoolId: SCHOOL, email: OTHER_EMAIL });
      expect(await inviteCoach({ schoolId: SCHOOL, email: 'third-coach@example.test' })).toEqual({ ok: false, error: { code: 'caller_rate_limited' } });
      expect(sender.delivered).toHaveLength(2);
    });
  });

  it('lets a store failure through', async () => {
    const store = { create: async () => Promise.reject(new Error('boom')) };
    await expect(createInviteCoach({ store, sender: createTestSender() })({ schoolId: SCHOOL, email: EMAIL })).rejects.toThrow('boom');
  });
});
