import { createHandler, safeEqual } from '../handler.ts';
import { createRunWorker } from '../service.ts';
import { createFakeClock, createMemoryStore, createRecordingMailer, mail } from './fakes.ts';

const SECRET = 'worker-secret-for-tests';

function setup(secret: string | undefined = SECRET) {
  const memory = createMemoryStore({ due: ['r1'], mails: [mail('reminder', 'r2')] });
  const { mailer, emails } = createRecordingMailer();
  const handle = createHandler({ secret, service: { run: createRunWorker({ store: memory.store, mailer, clock: createFakeClock().clock }) } });
  const post = (headers: Record<string, string> = { 'x-worker-secret': SECRET }) => handle(new Request('http://example.test/functions/v1/accounts-deletion-worker', { method: 'POST', headers }));
  return { handle, post, calls: memory.calls, emails };
}

describe('accounts-deletion-worker handler', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('runs with the right secret and answers the summary', async () => {
    const s = setup();
    const response = await s.post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, value: { erased: 1, stopped: 0, skipped: 0, sent: { reminder: 1, deleted: 0, stopped: 0 }, failed: 0 } });
  });

  it.each<[string, Record<string, string>]>([
    ['no header', {}],
    ['a wrong secret', { 'x-worker-secret': 'nope' }],
    ['a secret that only starts like the right one', { 'x-worker-secret': `${SECRET}x` }],
    ['an empty secret', { 'x-worker-secret': '' }],
  ])('answers 401 for %s and runs nothing', async (_name, headers) => {
    const s = setup();
    const response = await s.post(headers);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'unauthenticated' } });
    expect(s.calls).toEqual([]);
    expect(s.emails).toEqual([]);
  });

  it.each([undefined, ''])('answers 401 and runs nothing when the secret is not configured (%p), even with an empty header', async (secret) => {
    const s = setup(secret);
    const variants: Record<string, string>[] = [{ 'x-worker-secret': '' }, { 'x-worker-secret': 'anything' }, {}];
    for (const headers of variants) expect((await s.post(headers)).status).toBe(401);
    expect(s.calls).toEqual([]);
  });

  it('answers 405 to anything but POST and runs nothing', async () => {
    const s = setup();
    const response = await s.handle(new Request('http://example.test/x', { method: 'GET', headers: { 'x-worker-secret': SECRET } }));
    expect(response.status).toBe(405);
    expect(s.calls).toEqual([]);
  });

  it('answers 500 internal on an unexpected failure and logs only the error name', async () => {
    const handle = createHandler({
      secret: SECRET,
      service: {
        run: async () => {
          throw new TypeError('secret-detail user@example.test');
        },
      },
    });
    const response = await handle(new Request('http://example.test/x', { method: 'POST', headers: { 'x-worker-secret': SECRET } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'internal' } });
    expect(console.error).toHaveBeenCalledWith('accounts-deletion-worker failed: TypeError');
  });
});

describe('safeEqual', () => {
  it.each([
    ['same', 'abc', 'abc', true],
    ['different', 'abc', 'abd', false],
    ['shorter', 'abc', 'ab', false],
    ['longer', 'ab', 'abc', false],
    ['a trailing NUL', 'abc', 'abc\0', false],
    ['both empty', '', '', true],
  ])('%s', (_name, a, b, expected) => {
    expect(safeEqual(a, b)).toBe(expected);
  });
});
