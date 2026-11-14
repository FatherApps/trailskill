import { createHandler } from '../handler.ts';
import type { ActionOutcome } from '../actions.ts';
import { OrphanedConfirmationError, type ImportError, type Outcome, type PublicCandidate } from '../service.ts';

const ATHLETE = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const USER = 'user-from-jwt';
const SECRET = 'secret-internal-detail';

type Calls = { method: string; argument: unknown }[];

function setup(
  options: {
    userId?: string | null;
    search?: Outcome<PublicCandidate[]>;
    confirm?: Outcome<unknown> | Error;
    tournament?: Outcome<unknown>;
    official?: ActionOutcome<unknown>;
  } = {},
) {
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
        return (options.confirm ?? { ok: true, value: undefined }) as Awaited<ReturnType<Parameters<typeof createHandler>[0]['service']['confirmCandidate']>>;
      },
      async findInTournament(argument) {
        calls.push({ method: 'findInTournament', argument });
        return (options.tournament ?? { ok: true, value: { organizationId: ORG, candidate: null } }) as Awaited<ReturnType<Parameters<typeof createHandler>[0]['service']['findInTournament']>>;
      },
    },
    official: {
      async status(argument) {
        calls.push({ method: 'status', argument });
        return (options.official ?? { ok: true, value: { confirmed: false } }) as Awaited<ReturnType<Parameters<typeof createHandler>[0]['official']['status']>>;
      },
      async results(argument) {
        calls.push({ method: 'results', argument });
        return (options.official ?? { ok: true, value: { results: [] } }) as Awaited<ReturnType<Parameters<typeof createHandler>[0]['official']['results']>>;
      },
      async import(argument) {
        calls.push({ method: 'import', argument });
        return (options.official ?? { ok: true, value: { importId: 'i1', inserted: 1, duplicates: 0, changes: 0 } }) as Awaited<ReturnType<Parameters<typeof createHandler>[0]['official']['import']>>;
      },
    },
  });
  const post = (body: unknown, init: RequestInit = {}) =>
    handle(new Request('https://example.test/functions/v1/results-import', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), ...init }));
  return { calls, handle, post };
}

const searchBody = { action: 'search', athleteId: ATHLETE, organizationId: ORG, firstName: 'Ana', lastName: 'Example' };
const CANDIDATE = '81a00000-0000-4000-8000-0000000000c1';
const confirmBody = { action: 'confirm', athleteId: ATHLETE, organizationId: ORG, candidateId: CANDIDATE };

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

  it('answers what the confirmation offers, when it offers something', async () => {
    const value = { results: [{ id: 'result-1', stroke: 'FR', distance: '50m', pool: 'LCM', hundredths: 2890, swumOn: '2026-03-14', competition: null }] };
    const response = await setup({ confirm: { ok: true, value } }).post(confirmBody);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, value });
  });

  it.each([
    ['invalid JSON', '{nope'],
    ['a body that is not an object', '[]'],
    ['an unknown action', { action: 'refresh', athleteId: ATHLETE }],
    ['a search without a name', { ...searchBody, firstName: '  ' }],
    ['a search with a name that is too long', { ...searchBody, lastName: 'a'.repeat(101) }],
    ['a search with a non-text name', { ...searchBody, firstName: 5 }],
    ['a confirm without a candidate id', { ...confirmBody, candidateId: '' }],
    ['a confirm with a candidate id that is not a UUID', { ...confirmBody, candidateId: 'candidate-1' }],
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
      { method: 'confirmCandidate', argument: { userId: USER, athleteId: ATHLETE, organizationId: ORG, candidateId: CANDIDATE } },
    ]);
  });

  it.each<[ImportError, number]>([
    [{ code: 'not_authorized' }, 403],
    [{ code: 'rate_limited', retryAt: '2026-10-28T10:10:00.000Z' }, 429],
    [{ code: 'no_provider' }, 404],
    [{ code: 'unavailable' }, 502],
    [{ code: 'unknown_id' }, 410],
    [{ code: 'identity_number_conflict' }, 409],
    [{ code: 'identity_number_required' }, 409],
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

describe('results-import handler: official results update', () => {
  it.each(['status', 'results'])('%s asks for the athlete of the body and the user of the JWT', async (action) => {
    const s = setup();
    const response = await s.post({ action, athleteId: ATHLETE, userId: 'someone-else' });
    expect(response.status).toBe(200);
    expect(s.calls).toEqual([{ method: action, argument: { userId: USER, athleteId: ATHLETE, organizationId: null } }]);
  });

  it.each(['status', 'results'])('%s passes the organization of the body when there is one, and null when it is null', async (action) => {
    const s = setup();
    await s.post({ action, athleteId: ATHLETE, organizationId: ORG });
    await s.post({ action, athleteId: ATHLETE, organizationId: null });
    expect(s.calls).toEqual([
      { method: action, argument: { userId: USER, athleteId: ATHLETE, organizationId: ORG } },
      { method: action, argument: { userId: USER, athleteId: ATHLETE, organizationId: null } },
    ]);
  });

  it.each(['status', 'results'])('answers 400 to %s with an organization id that is not a uuid, and calls nothing', async (action) => {
    const s = setup();
    for (const organizationId of ['org-1', 7, '']) expect((await s.post({ action, athleteId: ATHLETE, organizationId })).status).toBe(400);
    expect(s.calls).toEqual([]);
  });

  it('passes the chosen ids to import untouched, so the action checks them', async () => {
    const s = setup();
    const response = await s.post({ action: 'import', athleteId: ATHLETE, resultIds: ['p1', 'p2'] });
    expect(await response.json()).toEqual({ ok: true, value: { importId: 'i1', inserted: 1, duplicates: 0, changes: 0 } });
    expect(s.calls).toEqual([{ method: 'import', argument: { userId: USER, athleteId: ATHLETE, resultIds: ['p1', 'p2'] } }]);
  });

  it.each(['status', 'results', 'import'])('answers 400 to %s with an athlete id that is not a uuid, and calls nothing', async (action) => {
    const s = setup();
    expect((await s.post({ action, athleteId: 'athlete-1', resultIds: ['p1'] })).status).toBe(400);
    expect(s.calls).toEqual([]);
  });

  it.each([
    ['not_confirmed', 409],
    ['not_authorized', 403],
    ['unknown_id', 410],
    ['bad_request', 400],
    ['no_provider', 404],
    ['unavailable', 502],
  ])('answers %s with %i and the typed error', async (code, status) => {
    const s = setup({ official: { ok: false, error: { code } as never } });
    const response = await s.post({ action: 'results', athleteId: ATHLETE });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false, error: { code } });
  });

  it('answers rate_limited with 429 and when to retry', async () => {
    const s = setup({ official: { ok: false, error: { code: 'rate_limited', retryAt: '2026-10-29T12:10:00.000Z' } } });
    const response = await s.post({ action: 'results', athleteId: ATHLETE });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'rate_limited', retryAt: '2026-10-29T12:10:00.000Z' } });
  });
});

describe('results-import handler: tournament', () => {
  const URL_ = 'https://games.example.test/tournament/1';
  const body = { action: 'tournament', athleteId: ATHLETE, url: URL_ };
  const candidate = { organizationId: ORG, candidate: { id: 'candidate-1', name: 'Ana Example', club: 'Synthetic Club', resultCount: 2 } };

  it('looks the tournament up as the user of the token, with no number when none is typed', async () => {
    const s = setup({ tournament: { ok: true, value: candidate } });
    const response = await s.post({ ...body, userId: 'someone-else' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, value: candidate });
    expect(s.calls).toEqual([{ method: 'findInTournament', argument: { userId: USER, athleteId: ATHLETE, url: URL_, identityNumber: null } }]);
  });

  it('trims the address, and passes a typed number normalized', async () => {
    const s = setup();
    await s.post({ ...body, url: `  ${URL_}\n`, identityNumber: ' 1.234-567 ' });
    await s.post({ ...body, identityNumber: null });
    expect(s.calls).toEqual([
      { method: 'findInTournament', argument: { userId: USER, athleteId: ATHLETE, url: URL_, identityNumber: '1234567' } },
      { method: 'findInTournament', argument: { userId: USER, athleteId: ATHLETE, url: URL_, identityNumber: null } },
    ]);
  });

  it.each([
    ['an athlete id that is not a uuid', { athleteId: 'athlete-1' }],
    ['no address', { url: undefined }],
    ['an empty address', { url: '   ' }],
    ['an address that is not text', { url: 5 }],
    ['an address longer than 500 characters', { url: `https://games.example.test/${'a'.repeat(500)}` }],
    ['a number that is not text', { identityNumber: 1234567 }],
    ['a number that is empty', { identityNumber: '  ' }],
    ['a number with characters it does not accept', { identityNumber: '12/34' }],
    ['a number that is too long', { identityNumber: 'x'.repeat(21) }],
  ])('answers 400 for %s, and calls nothing', async (_name, override) => {
    const s = setup();
    const response = await s.post({ ...body, ...override });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'bad_request' } });
    expect(s.calls).toEqual([]);
  });

  it('accepts an address of exactly 500 characters', async () => {
    const s = setup();
    expect((await s.post({ ...body, url: 'u'.repeat(500) })).status).toBe(200);
  });

  it.each<[ImportError, number]>([
    [{ code: 'identity_number_required' }, 409],
    [{ code: 'identity_number_conflict' }, 409],
    [{ code: 'no_provider' }, 404],
    [{ code: 'not_authorized' }, 403],
    [{ code: 'rate_limited', retryAt: '2026-10-28T10:10:00.000Z' }, 429],
    [{ code: 'unavailable' }, 502],
  ])('maps %j to HTTP %i and keeps the error body', async (error, status) => {
    const response = await setup({ tournament: { ok: false, error } }).post(body);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false, error });
  });
});
