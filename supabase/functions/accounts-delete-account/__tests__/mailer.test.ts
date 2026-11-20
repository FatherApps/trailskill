import { createTestMailer, selectMailer, TEST_MAILER_LIMIT } from '../mailer.ts';

const EMAIL = { to: 'user@example.test', subject: 'Asunto', text: 'Texto', idempotencyKey: 'k/1' };

describe('mailer', () => {
  afterEach(() => jest.restoreAllMocks());

  it('the test mailer sends nothing, records the last emails and answers false', async () => {
    const mailer = createTestMailer();
    for (let i = 0; i < TEST_MAILER_LIMIT + 5; i++) expect(await mailer.send({ ...EMAIL, idempotencyKey: `k/${i}` })).toBe(false);
    expect(mailer.delivered).toHaveLength(TEST_MAILER_LIMIT);
    expect(mailer.delivered[0].idempotencyKey).toBe('k/5');
  });

  it('selects the test mailer without a key, with a fixed warning', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetch = jest.fn();
    expect(await selectMailer({}, fetch as unknown as typeof globalThis.fetch, 'accounts-delete-account').send(EMAIL)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('accounts-delete-account: RESEND_API_KEY is not set; no email is sent');
  });

  it('selects Resend with a key and sends the email with its Idempotency-Key', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const mailer = selectMailer({ RESEND_API_KEY: 're_test_not_a_real_key', RESEND_FROM: 'Swimcro <no-reply@example.test>' }, fetch, 'accounts-delete-account');
    expect(await mailer.send(EMAIL)).toBe(true);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect(calls[0].init.headers).toMatchObject({ 'Idempotency-Key': 'k/1' });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ from: 'Swimcro <no-reply@example.test>', to: ['user@example.test'], subject: 'Asunto', text: 'Texto' });
  });

  it('rejects when Resend is not configured with a sender', async () => {
    const mailer = selectMailer({ RESEND_API_KEY: 're_test_not_a_real_key' }, jest.fn() as unknown as typeof globalThis.fetch, 'accounts-delete-account');
    await expect(mailer.send(EMAIL)).rejects.toThrow('Resend sender is not configured');
  });
});
