import { createHandler } from '../handler.ts';
import { createAccountDeletion } from '../service.ts';
import { CODE, createMemoryStore, createRecordingMailer, DELETE_AFTER } from './fakes.ts';

const SCHOOLS = [{ id: 's1', name: 'Escuela de prueba' }];

function setup(options: { userId?: string | null; answers?: Parameters<typeof createMemoryStore>[0]; mailer?: Parameters<typeof createRecordingMailer>[0] } = {}) {
  const { store, calls } = createMemoryStore(options.answers);
  const { mailer, emails } = createRecordingMailer(options.mailer);
  const handle = createHandler({
    authenticate: async () => (options.userId === undefined ? 'user-from-jwt' : options.userId),
    service: createAccountDeletion({ store, mailer, newKey: () => 'key' }),
  });
  const post = (body: unknown) => handle(new Request('http://example.test/functions/v1/accounts-delete-account', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { handle, post, calls, emails };
}

describe('accounts-delete-account handler', () => {
  let error: jest.SpyInstance;
  let log: jest.SpyInstance;
  beforeEach(() => {
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('answers 405 to anything but POST and touches nothing', async () => {
    const s = setup();
    const response = await s.handle(new Request('http://example.test/x', { method: 'GET' }));
    expect(response.status).toBe(405);
    expect(s.calls).toEqual([]);
  });

  it('answers 401 without a verified user and touches nothing', async () => {
    const s = setup({ userId: null });
    const response = await s.post({ step: 'request' });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'unauthenticated' } });
    expect(s.calls).toEqual([]);
    expect(s.emails).toEqual([]);
  });

  it('takes the user only from the token: a userId in the body is ignored', async () => {
    const s = setup();
    for (const body of [{ step: 'request', userId: 'attacker', user_id: 'attacker' }, { step: 'confirm', code: CODE, userId: 'attacker' }, { step: 'cancel', userId: 'attacker' }]) await s.post(body);
    expect(s.calls.map((c) => c.args[0])).toEqual(['user-from-jwt', 'user-from-jwt', 'user-from-jwt']);
    expect(JSON.stringify(s.calls)).not.toContain('attacker');
  });

  describe('request', () => {
    it('answers 200 code_sent, emails the code, and the code is in no answer or log', async () => {
      const s = setup();
      const response = await s.post({ step: 'request' });
      const text = await response.text();
      expect(response.status).toBe(200);
      expect(JSON.parse(text)).toEqual({ ok: true, value: { status: 'code_sent', emailSent: true } });
      expect(text).not.toContain(CODE);
      expect(s.emails[0].text).toContain(CODE);
      for (const spy of [error, log]) expect(JSON.stringify(spy.mock.calls)).not.toContain(CODE);
    });

    it('answers emailSent false for the test mailer', async () => {
      const response = await setup({ mailer: { sent: false } }).post({ step: 'request' });
      expect(await response.json()).toEqual({ ok: true, value: { status: 'code_sent', emailSent: false } });
    });

    it('answers 502 unavailable when the email fails', async () => {
      const response = await setup({ mailer: { failWith: new Error('Resend delivery failed (network)') } }).post({ step: 'request' });
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ ok: false, error: { code: 'unavailable' } });
    });

    it.each([
      ['school', 'blocked_by_school'],
      ['platform_admin', 'platform_admin'],
    ] as const)('answers 403 %s with the schools', async (reason, code) => {
      const response = await setup({ answers: { request: { status: 'blocked', reason, schools: SCHOOLS } } }).post({ step: 'request' });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false, error: { code, schools: SCHOOLS } });
    });

    it('answers 429 rate_limited', async () => {
      const response = await setup({ answers: { request: { status: 'rate_limited' } } }).post({ step: 'request' });
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ ok: false, error: { code: 'rate_limited' } });
    });

    it('answers 200 already_marked with the date', async () => {
      const response = await setup({ answers: { request: { status: 'already_marked', deleteAfter: DELETE_AFTER } } }).post({ step: 'request' });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, value: { status: 'already_marked', deleteAfter: DELETE_AFTER } });
    });
  });

  describe('confirm', () => {
    it('answers 200 marked with the date and the email flag', async () => {
      const s = setup();
      const response = await s.post({ step: 'confirm', code: CODE });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, value: { status: 'marked', deleteAfter: DELETE_AFTER, emailSent: true } });
      expect(s.calls).toEqual([{ method: 'confirm', args: ['user-from-jwt', CODE] }]);
    });

    it('answers 200 marked with emailSent false when the email fails after marking', async () => {
      const response = await setup({ mailer: { failWith: new Error('Resend delivery failed (network)') } }).post({ step: 'confirm', code: CODE });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, value: { status: 'marked', deleteAfter: DELETE_AFTER, emailSent: false } });
    });

    it.each([
      ['invalid_code', 400],
      ['code_expired', 410],
      ['too_many_attempts', 429],
    ] as const)('answers %s with %i', async (status, http) => {
      const response = await setup({ answers: { confirm: { status } } }).post({ step: 'confirm', code: CODE });
      expect(response.status).toBe(http);
      expect(await response.json()).toEqual({ ok: false, error: { code: status } });
    });

    it('answers 403 when blocked, with the schools', async () => {
      const response = await setup({ answers: { confirm: { status: 'blocked', reason: 'school', schools: SCHOOLS } } }).post({ step: 'confirm', code: CODE });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false, error: { code: 'blocked_by_school', schools: SCHOOLS } });
    });

    it('answers 200 already_marked', async () => {
      const response = await setup({ answers: { confirm: { status: 'already_marked', deleteAfter: DELETE_AFTER } } }).post({ step: 'confirm', code: CODE });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, value: { status: 'already_marked', deleteAfter: DELETE_AFTER } });
    });

    it.each([
      ['no code', { step: 'confirm' }],
      ['a code that is not a string', { step: 'confirm', code: 123456 }],
      ['5 digits', { step: 'confirm', code: '12345' }],
      ['7 digits', { step: 'confirm', code: '1234567' }],
      ['letters', { step: 'confirm', code: '12345a' }],
      ['spaces around', { step: 'confirm', code: ' 123456 ' }],
      ['a trailing newline', { step: 'confirm', code: '123456\n' }],
    ])('answers 400 bad_request for %s, and asks the database nothing', async (_name, body) => {
      const s = setup();
      const response = await s.post(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, error: { code: 'bad_request' } });
      expect(s.calls).toEqual([]);
    });
  });

  describe('cancel', () => {
    it.each(['cancelled', 'not_marked'] as const)('answers 200 %s', async (status) => {
      const response = await setup({ answers: { cancel: { status } } }).post({ step: 'cancel' });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, value: { status } });
    });
  });

  it.each([
    ['malformed JSON', '{nope'],
    ['a JSON array', '[]'],
    ['JSON null', 'null'],
    ['no step', '{}'],
    ['an unknown step', '{"step":"delete"}'],
    ['a step that is not a string', '{"step":1}'],
  ])('answers 400 for %s, and touches nothing', async (_name, body) => {
    const s = setup();
    const response = await s.post(body);
    expect(response.status).toBe(400);
    expect(s.calls).toEqual([]);
  });

  it('answers 500 internal on an unexpected failure and logs only the error name', async () => {
    const { mailer } = createRecordingMailer();
    const { store } = createMemoryStore();
    store.request = async () => {
      throw new TypeError(`secret-detail ${CODE}`);
    };
    const handle = createHandler({ authenticate: async () => 'user-from-jwt', service: createAccountDeletion({ store, mailer }) });
    const response = await handle(new Request('http://example.test/x', { method: 'POST', body: '{"step":"request"}' }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'internal' } });
    expect(error).toHaveBeenCalledWith('accounts-delete-account failed: TypeError');
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret-detail');
  });
});
