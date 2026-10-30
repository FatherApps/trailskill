import { createHandler } from '../handler.ts';
import { OrphanedConfirmationError, type ImportError, type Outcome, type PublicCandidate } from '../service.ts';

const ATHLETE = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const USER = 'user-from-jwt';
const SECRET = 'secret-internal-detail';

type Calls = { method: string; argument: unknown }[];

function setup(options: { userId?: string | null; search?: Outcome<PublicCandidate[]>; confirm?: Outcome<void> | Error } = {}) {
  const calls: Calls = [];
  const handle = createHandler({
    authenticate: async () => (options.userId === undefined ? USER : options.userId),
    service: {
      async findCandidates(argument) {
        calls.push({ method: 'findCandidates', argument });
        return options.search ?? { ok: true, value: [] };
      },
      async confirmCandidate(argument) {
        calls.push({ method: 'confirmCandidate', argument });
        if (options.confirm instanceof Error) throw options.confirm;
        return options.confirm ?? { ok: true, value: undefined };
      },
    },
  });
  const post = (body: unknown, init: RequestInit = {}) =>
    handle(new Request('https://example.test/functions/v1/results-import', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), ...init }));
  return { calls, handle, post };
}

const searchBody = { action: 'search', athleteId: ATHLETE, organizationId: ORG, firstName: 'Ana', lastName: 'Example' };
const confirmBody = { action: 'confirm', athleteId: ATHLETE, organizationId: ORG, candidateId: 'candidate-1' };

describe('results-import handler', () => {
  it('answers 401 without a verified user, and calls nothing', async () => {
    const s = setup({ userId: null });
    const response = await s.post(searchBody);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'unauthenticated' } });
    expect(s.calls).toEqual([]);
  });

  it('answers 405 to anything but POST', async () => {
    const s = setup();
    expect((await s.handle(new Request('https://example.test/', { method: 'GET' }))).status).toBe(405);
  });

  it.each([
    ['invalid JSON', '{nope'],
    ['a body that is not an object', '[]'],
    ['an unknown action', { action: 'refresh', athleteId: ATHLETE }],
    ['a search without a name', { ...searchBody, firstName: '  ' }],
    ['a search with a name that is too long', { ...searchBody, lastName: 'a'.repeat(101) }],
    ['a search with a non-text name', { ...searchBody, firstName: 5 }],
    ['a confirm without a candidate id', { ...confirmBody, candidateId: '' }],
    ['an athlete id that is not a uuid', { ...searchBody, athleteId: 'athlete-1' }],
    ['an organization id that is not a uuid', { ...searchBody, organizationId: 7 }],
  ])('answers 400 for %s, and calls nothing', async (_name, body) => {
    const s = setup();
    const response = await s.post(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'bad_request' } });
    expect(s.calls).toEqual([]);
  });

  it('searches as the user of the token, ignoring a user id in the body', async () => {
    const candidates = [{ id: 'candidate-1', name: 'Ana Example', affiliations: [], resultCount: 2 }];
    const s = setup({ search: { ok: true, value: candidates } });
    const response = await s.post({ ...searchBody, userId: 'someone-else', firstName: ' Ana ' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, value: { candidates } });
    expect(s.calls).toEqual([
      { method: 'findCandidates', argument: { userId: USER, athleteId: ATHLETE, organizationId: ORG, firstName: 'Ana', lastName: 'Example' } },
    ]);
  });

  it('confirms by candidate id only, as the user of the token', async () => {
    const s = setup();
    const response = await s.post({ ...confirmBody, userId: 'someone-else', candidate: { sourceAthleteKey: 'forged' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, value: {} });
    expect(s.calls).toEqual([
      { method: 'confirmCandidate', argument: { userId: USER, athleteId: ATHLETE, organizationId: ORG, candidateId: 'candidate-1' } },
    ]);
  });

  it.each<[ImportError, number]>([
    [{ code: 'not_authorized' }, 403],
    [{ code: 'rate_limited', retryAt: '2026-10-28T10:10:00.000Z' }, 429],
    [{ code: 'no_provider' }, 404],
    [{ code: 'unavailable' }, 502],
    [{ code: 'unknown_id' }, 410],
    [{ code: 'identity_number_conflict' }, 409],
  ])('maps %j to HTTP %i and keeps the error body', async (error, status) => {
    const s = setup({ search: { ok: false, error }, confirm: { ok: false, error } });
    for (const body of [searchBody, confirmBody]) {
      const response = await s.post(body);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ ok: false, error });
    }
  });

  it('answers 500 with no detail when something unexpected throws, and logs only the error name', async () => {
    const logged: unknown[][] = [];
    const spy = jest.spyOn(console, 'error').mockImplementation((...args) => void logged.push(args));
    const s = setup({ confirm: new OrphanedConfirmationError() });
    const response = await s.post({ ...confirmBody });
    spy.mockRestore();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'internal' } });
    expect(JSON.stringify(logged)).toContain('OrphanedConfirmationError');
    expect(JSON.stringify(logged)).not.toContain(SECRET);
  });
});
