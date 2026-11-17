import { createInvitationStore, type Db } from '../adapters.ts';
import { createHandler } from '../handler.ts';
import { createInviteCoach } from '../service.ts';
import { createTestSender } from '../testSender.ts';
import { withSendLimit } from '../sendLimit.ts';
import { createMemoryLimiter, createMemoryStore, SCHOOL_NAME } from './fakes.ts';

const SCHOOL = '11111111-1111-4111-8111-111111111111';
const OTHER_SCHOOL = '22222222-2222-4222-8222-222222222222';

function setup(options: { userId?: string | null; adminOf?: string[]; sender?: { deliver: () => Promise<void> } } = {}) {
  const { store, invitations } = createMemoryStore(options.adminOf ?? [SCHOOL]);
  const testSender = createTestSender();
  const handle = createHandler({
    authenticate: async () => (options.userId === undefined ? 'user-from-jwt' : options.userId),
    service: { inviteCoach: createInviteCoach({ store, sender: options.sender ?? testSender }) },
  });
  const post = (body: unknown) =>
    handle(new Request('http://example.test/functions/v1/school-console-invite-coach', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { handle, post, invitations, delivered: testSender.delivered };
}

describe('school-console-invite-coach handler', () => {
  it('creates the invitation with the normalized email and delivers it to the test sender', async () => {
    const s = setup();
    const response = await s.post({ schoolId: SCHOOL, email: '  Coach@Example.TEST ' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, value: { invitationId: 'invitation-1' } });
    expect(s.invitations).toEqual([{ id: 'invitation-1', schoolId: SCHOOL, email: 'coach@example.test', schoolName: SCHOOL_NAME }]);
    expect(s.delivered).toEqual(s.invitations);
  });

  it.each([
    ['an email without a domain', { schoolId: SCHOOL, email: 'not-an-email' }],
    ['an email without a dot in the domain', { schoolId: SCHOOL, email: 'coach@example' }],
    ['an email with spaces inside', { schoolId: SCHOOL, email: 'co ach@example.test' }],
    ['an email of more than 254 characters', { schoolId: SCHOOL, email: `${'a'.repeat(250)}@example.test` }],
    ['an email that is not a string', { schoolId: SCHOOL, email: 42 }],
    ['a missing email', { schoolId: SCHOOL }],
    ['a school id that is not a uuid', { schoolId: 'school', email: 'coach@example.test' }],
    ['a missing school id', { email: 'coach@example.test' }],
  ])('answers 400 for %s, and creates and delivers nothing', async (_name, body) => {
    const s = setup();
    const response = await s.post(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'bad_request' } });
    expect(s.invitations).toEqual([]);
    expect(s.delivered).toEqual([]);
  });

  it.each([['malformed JSON', '{nope'], ['a JSON array', '[]'], ['JSON null', 'null']])('answers 400 for %s', async (_name, body) => {
    const response = await setup().post(body);
    expect(response.status).toBe(400);
  });

  it('answers 400, not 500, when the database email check refuses what the handler normalized, and delivers nothing', async () => {
    // 'İ' lowercases differently in JavaScript than in the database, so `email = lower(btrim(email))` can refuse it (23514).
    const db: Db = { insert: async () => ({ data: null, error: { code: '23514' } }), selectOne: async () => ({ data: null, error: null }) };
    const sender = createTestSender();
    const handle = createHandler({ authenticate: async () => 'user-from-jwt', service: { inviteCoach: createInviteCoach({ store: createInvitationStore(db), sender }) } });
    const response = await handle(new Request('http://example.test/x', { method: 'POST', body: JSON.stringify({ schoolId: SCHOOL, email: 'COACİ@example.test' }) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'bad_request' } });
    expect(sender.delivered).toEqual([]);
  });

  it.each([
    ['caller_rate_limited', { callerLimit: 0, recipientLimit: 3 }],
    ['recipient_rate_limited', { callerLimit: 5, recipientLimit: 0 }],
  ])('answers 429 with %s when the send limit is reached, and delivers nothing', async (code, limits) => {
    const { store } = createMemoryStore([SCHOOL]);
    const sender = createTestSender();
    const handle = createHandler({
      authenticate: async () => 'user-from-jwt',
      service: { inviteCoach: createInviteCoach({ store: withSendLimit(store, createMemoryLimiter(limits).rpc), sender }) },
    });
    const response = await handle(new Request('http://example.test/x', { method: 'POST', body: JSON.stringify({ schoolId: SCHOOL, email: 'coach@example.test' }) }));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ ok: false, error: { code } });
    expect(sender.delivered).toEqual([]);
  });

  it('answers 405 to anything but POST', async () => {
    const response = await setup().handle(new Request('http://example.test/x', { method: 'GET' }));
    expect(response.status).toBe(405);
  });

  it('answers 401 without a verified user, and creates nothing', async () => {
    const s = setup({ userId: null });
    const response = await s.post({ schoolId: SCHOOL, email: 'coach@example.test' });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'unauthenticated' } });
    expect(s.invitations).toEqual([]);
  });

  it('answers 403 when the caller is not an admin of the school', async () => {
    const s = setup({ adminOf: [OTHER_SCHOOL] });
    const response = await s.post({ schoolId: SCHOOL, email: 'coach@example.test' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'not_authorized' } });
    expect(s.invitations).toEqual([]);
    expect(s.delivered).toEqual([]);
  });

  it('answers 502 when delivery fails, and inviting again reuses the pending invitation', async () => {
    const failing = setup({ sender: { deliver: async () => Promise.reject(new Error('down')) } });
    const response = await failing.post({ schoolId: SCHOOL, email: 'coach@example.test' });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'unavailable' } });
    expect(failing.invitations).toHaveLength(1);

    const s = setup();
    await s.post({ schoolId: SCHOOL, email: 'coach@example.test' });
    const again = await s.post({ schoolId: SCHOOL, email: 'COACH@example.test' });
    expect(await again.json()).toEqual({ ok: true, value: { invitationId: 'invitation-1' } });
    expect(s.invitations).toHaveLength(1);
    expect(s.delivered).toHaveLength(2);
  });

  it('answers 500 without the error message when something throws', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const handle = createHandler({
      authenticate: async () => 'u',
      service: { inviteCoach: async () => Promise.reject(new Error('secret-internal-detail')) },
    });
    const response = await handle(new Request('http://example.test/x', { method: 'POST', body: JSON.stringify({ schoolId: SCHOOL, email: 'coach@example.test' }) }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('secret-internal-detail');
    expect(error.mock.calls.flat().join(' ')).not.toContain('secret-internal-detail');
    error.mockRestore();
  });
});
