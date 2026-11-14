import { ProviderUnavailableError, SourceUnreachableError, type NormalizedResult } from '../port.ts';
import { createProviderRegistry, type OrganizationData } from '../registry.ts';
import {
  CANDIDATE_TTL_MS,
  createResultsImport,
  InvalidSourceKeyError,
  NotAuthorizedError,
  OrphanedConfirmationError,
  QUERY_INTERVAL_MS,
  RETRY_AFTER_FAILURE_MS,
  type Claim,
  type Confirmations,
  type IdentityNumbers,
  type PendingStore,
  type QueryGate,
} from '../service.ts';
import { createFakePlatform, createFakeProvider, TOURNAMENT_URL } from './fakeProvider.ts';

const ORG = 'fed';
const ATHLETE = 'athlete-1';
const USER = 'user-1';
const NUMBER = '0000000000-synthetic';
const PLATFORM_ORG = 'games';
const PROVIDER = 'zz-test';
const PLATFORM = 'zz-games';
const chain: OrganizationData[] = [
  { id: ORG, type: 'federation', countryCode: 'ZZ', parentId: null, provider: PROVIDER },
  { id: PLATFORM_ORG, type: 'results_platform', countryCode: 'ZZ', parentId: null, provider: PLATFORM },
];
const federationOnly = chain.slice(0, 1).map((organization) => ({ ...organization, provider: null }));

const validResult: NormalizedResult = {
  sourceResultKey: 'r-1',
  stroke: 'FR',
  distance: '50m',
  pool: 'LCM',
  hundredths: 2890,
  swumOn: '2026-03-14',
  competition: 'Synthetic Open',
};

// Same rules as results_import_claim_query, results_import_claim_results_query and results_import_release_claim: authorized users only,
// one source query per athlete and provider per interval, a results query shares the claim of the search its user confirmed, and a release gives
// a claim back only while nobody consumed since. `order` stands for the microsecond ordering of the instants in the database: a
// confirmation counts only when it came after the claim, and the claim's `token` is the instant a release must present.
function createFakeGate(authorized = true) {
  let now = Date.parse('2026-10-28T10:00:00Z');
  let order = 0;
  const last = new Map<string, { at: number; order: number; by: string; token: string }>();
  const confirmed: { athleteId: string; userId: string; provider: string; order: number }[] = [];
  const windowOf = (athleteId: string, provider: string) => `${athleteId}|${provider}`;
  const claims: unknown[] = [];
  const releases: Parameters<QueryGate['release']>[0][] = [];
  let releaseFailure: Error | undefined;
  let releaseFailsSynchronously = false;
  const gate: QueryGate = {
    async claim(request): Promise<Claim> {
      claims.push(request);
      if (!authorized) return { status: 'not_authorized' };
      const previous = last.get(windowOf(request.athleteId, request.provider));
      const shared =
        request.searchTtlMs !== undefined &&
        previous !== undefined &&
        previous.by === request.userId &&
        now < previous.at + request.searchTtlMs &&
        confirmed.some((c) => c.athleteId === request.athleteId && c.userId === request.userId && c.provider === request.provider && c.order > previous.order);
      if (!shared && previous !== undefined && now < previous.at + request.intervalMs) {
        return { status: 'rate_limited', retryAt: new Date(previous.at + request.intervalMs).toISOString() };
      }
      const claimOrder = ++order;
      last.set(windowOf(request.athleteId, request.provider), { at: now, order: claimOrder, by: request.userId, token: String(claimOrder) });
      return { status: 'allowed', claimedAt: String(claimOrder) };
    },
    release(request) {
      releases.push(request);
      // A failure before any promise exists, like a client that throws while building its request.
      if (releaseFailure && releaseFailsSynchronously) throw releaseFailure;
      return giveBack(request);
    },
  };
  const giveBack = async (request: Parameters<QueryGate['release']>[0]) => {
    if (releaseFailure) throw releaseFailure;
    const previous = last.get(windowOf(request.athleteId, request.provider));
    if (!previous || previous.token !== request.claimedAt) return false;
    // Nobody can share a released claim; the wait runs from the release (the failure), as in the database: the next normal claim
    // is allowed `retryAfterMs` after it, however long the failed query took.
    last.set(windowOf(request.athleteId, request.provider), { ...previous, at: now - request.intervalMs + request.retryAfterMs, by: '' });
    return true;
  };
  return {
    gate,
    claims,
    releases,
    failRelease: (error: Error | undefined, synchronously = false) => {
      releaseFailure = error;
      releaseFailsSynchronously = synchronously;
    },
    advance: (ms: number) => (now += ms),
    now: () => now,
    // The confirmation the service records after a search.
    confirmed: (athleteId: string, userId: string, provider: string) => void confirmed.push({ athleteId, userId, provider, order: ++order }),
    lastQueryAt: (athleteId: string, provider = PROVIDER) => last.get(windowOf(athleteId, provider))?.at,
    lastToken: (athleteId: string, provider = PROVIDER) => last.get(windowOf(athleteId, provider))?.token,
  };
}

function createFakeIdentityNumbers(initial: string | null) {
  const saved: [string, string][] = [];
  const reads: string[] = [];
  let saveFailure: Error | undefined;
  return {
    saved,
    reads,
    failSave: (error: Error | undefined) => void (saveFailure = error),
    async read(athleteId: string) {
      reads.push(athleteId);
      return initial;
    },
    async keep(athleteId: string, identityNumber: string) {
      if (saveFailure) throw saveFailure;
      if (initial !== null) return initial === identityNumber;
      saved.push([athleteId, identityNumber]);
      return true;
    },
  } satisfies IdentityNumbers & Record<string, unknown>;
}


function createFakeConfirmations(onRecord: (input: Parameters<Confirmations['record']>[0]) => void = () => {}) {
  const recorded: Parameters<Confirmations['record']>[0][] = [];
  const recordedIds: string[] = [];
  const removed: string[] = [];
  const live = new Set<string>();
  let rejection: Error | undefined;
  let removeFailure: Error | undefined;
  return {
    recorded,
    recordedIds,
    removed,
    stored: () => [...live],
    reject: (error: Error | undefined) => void (rejection = error),
    failRemove: (error: Error | undefined) => void (removeFailure = error),
    async record(input: Parameters<Confirmations['record']>[0]) {
      if (rejection) throw rejection;
      const id = `confirmation-${recordedIds.length + 1}`;
      recorded.push(input);
      onRecord(input);
      recordedIds.push(id);
      live.add(id);
      return id;
    },
    async remove(id: string) {
      if (removeFailure) throw removeFailure;
      removed.push(id);
      live.delete(id);
    },
  } satisfies Confirmations & Record<string, unknown>;
}

// Same rules as results_import_pending_put / _take: single use, only for the user, athlete and kind that stored it, and not after it expires.
function createFakePending(now: () => number) {
  type Put = Parameters<PendingStore['put']>[0];
  const rows = new Map<string, Omit<Put, 'ttlMs' | 'id'> & { expiresAt: number }>();
  let issued = 0;
  const store: PendingStore = {
    async put({ ttlMs, id, ...entry }) {
      const key = id ?? `candidate-${++issued}`;
      rows.set(key, { ...entry, expiresAt: Math.min(now() + ttlMs, entry.restoreUntil ?? Infinity) });
      return key;
    },
    async take({ id, kind, userId, athleteId }) {
      const row = rows.get(id);
      if (!row || row.expiresAt <= now() || row.kind !== kind || row.userId !== userId || row.athleteId !== athleteId) return null;
      rows.delete(id);
      return row;
    },
  };
  return { store, rows };
}

function setup(
  options: {
    number?: string | null;
    authorized?: boolean;
    providerOptions?: Parameters<typeof createFakeProvider>[0];
    platformOptions?: Parameters<typeof createFakePlatform>[0];
    withProvider?: boolean;
    withPlatform?: boolean;
  } = {},
) {
  const provider = createFakeProvider({ results: [validResult], ...options.providerOptions });
  const platform = createFakePlatform(options.platformOptions);
  const fakeGate = createFakeGate(options.authorized ?? true);
  const identityNumbers = createFakeIdentityNumbers(options.number === undefined ? NUMBER : options.number);
  const providerOfOrganization = (organizationId: string) => (organizationId === PLATFORM_ORG ? PLATFORM : PROVIDER);
  const confirmations = createFakeConfirmations(({ athleteId, userId, organizationId }) => fakeGate.confirmed(athleteId, userId, providerOfOrganization(organizationId)));
  const organizations = (federation: boolean, platformOrganization: boolean) => [
    ...(federation ? [chain[0]] : federationOnly),
    ...(platformOrganization ? [chain[1]] : []),
  ];
  let data = organizations(options.withProvider !== false, options.withPlatform !== false);
  let clock = Date.parse('2026-10-28T10:00:00Z');
  const pending = createFakePending(() => clock);
  const service = createResultsImport({
    registry: createProviderRegistry([provider], [platform]),
    gate: fakeGate.gate,
    identityNumbers,
    confirmations,
    organizationChain: async () => data,
    pending: pending.store,
    now: () => clock,
  });
  return {
    provider,
    platform,
    fakeGate,
    identityNumbers,
    confirmations,
    pending,
    service,
    advanceClock: (ms: number) => void (clock += ms),
    removeProvider: () => void (data = organizations(false, true)),
    removePlatform: () => void (data = organizations(true, false)),
  };
}
const refresh = (s: ReturnType<typeof setup>) => s.service.refreshResults({ userId: USER, athleteId: ATHLETE, organizationId: ORG });
const search = (s: ReturnType<typeof setup>) =>
  s.service.findCandidates({ userId: USER, athleteId: ATHLETE, organizationId: ORG, firstName: 'Ana', lastName: 'Example' });
const unavailable = { ok: false, error: { code: 'unavailable' } };

describe('refreshResults', () => {
  it('uses the number returned by the identity read function and returns normalized results', async () => {
    const s = setup();
    expect(await refresh(s)).toEqual({ ok: true, value: [validResult] });
    expect(s.provider.calls).toEqual([{ method: 'fetchResults', argument: NUMBER }]);
  });

  it('is unavailable without a number and does not query the source', async () => {
    const s = setup({ number: null });
    expect(await refresh(s)).toEqual(unavailable);
    expect(s.provider.calls).toEqual([]);
    // The claim is spent first: authorization and the rate limit come before the number is read.
    expect(s.fakeGate.claims).toHaveLength(1);
  });

  it('does not tell an unauthorized caller whether a number exists', async () => {
    const withNumber = await refresh(setup({ authorized: false }));
    const withoutNumber = await refresh(setup({ authorized: false, number: null }));
    expect(withNumber).toEqual({ ok: false, error: { code: 'not_authorized' } });
    expect(withoutNumber).toEqual(withNumber);
  });

  it.each([
    ['is the identity number', NUMBER],
    ['has a segment that is the identity number', `tournament|event|${NUMBER}`],
    ['has a segment that is the identity number once normalized', 'tournament|event|0000000000.SYNTHETIC'],
    ['has a segment that is the identity number once spaces and case are ignored', 'tournament| 0000000000 synthetic |1'],
  ])('is unavailable when a source result key %s, and never repeats the number', async (_name, sourceResultKey) => {
    const s = setup({ providerOptions: { results: [validResult, { ...validResult, sourceResultKey }] } });
    const outcome = await refresh(s);
    expect(outcome).toEqual(unavailable);
    expect(JSON.stringify(outcome)).not.toContain(NUMBER);
  });

  it('accepts a source result key that only holds the identity number inside a longer segment', async () => {
    const results = [{ ...validResult, sourceResultKey: `k-${NUMBER}-1` }, { ...validResult, sourceResultKey: `tournament|event|${NUMBER}0` }];
    expect(await refresh(setup({ providerOptions: { results } }))).toEqual({ ok: true, value: results });
  });

  it('claims with the athlete, the user, the provider, the interval and the time a confirmed search lends its claim', async () => {
    const s = setup();
    await refresh(s);
    expect(s.fakeGate.claims).toEqual([{ athleteId: ATHLETE, userId: USER, provider: PROVIDER, intervalMs: QUERY_INTERVAL_MS, searchTtlMs: CANDIDATE_TTL_MS }]);
  });

  it('does not query the source again within the interval and reports when to retry', async () => {
    const s = setup();
    const startedAt = s.fakeGate.now();
    await refresh(s);
    s.fakeGate.advance(60_000);
    const second = await refresh(s);
    expect(second).toEqual({ ok: false, error: { code: 'rate_limited', retryAt: new Date(startedAt + QUERY_INTERVAL_MS).toISOString() } });
    expect(s.provider.calls).toHaveLength(1);
  });

  it('queries again after the interval', async () => {
    const s = setup();
    await refresh(s);
    s.fakeGate.advance(QUERY_INTERVAL_MS);
    expect((await refresh(s)).ok).toBe(true);
    expect(s.provider.calls).toHaveLength(2);
  });

  it('does not read the identity number nor query the source when import_official_results is not in force', async () => {
    const s = setup({ authorized: false });
    expect(await refresh(s)).toEqual({ ok: false, error: { code: 'not_authorized' } });
    expect(s.identityNumbers.reads).toEqual([]);
    expect(s.provider.calls).toEqual([]);
  });

  it('answers no_provider without spending a claim', async () => {
    const s = setup({ withProvider: false });
    expect(await refresh(s)).toEqual({ ok: false, error: { code: 'no_provider' } });
    expect(s.fakeGate.claims).toEqual([]);
  });

  it('keeps a missing time as null', async () => {
    const s = setup({ providerOptions: { results: [{ ...validResult, hundredths: null }] } });
    expect(await refresh(s)).toEqual({ ok: true, value: [{ ...validResult, hundredths: null }] });
  });

  it('drops fields that are not part of a normalized result', async () => {
    const s = setup({ providerOptions: { results: [{ ...validResult, idNumber: NUMBER, birthDate: '2012-01-01' }] } });
    const outcome = await refresh(s);
    expect(outcome).toEqual({ ok: true, value: [validResult] });
    expect(JSON.stringify(outcome)).not.toContain(NUMBER);
    expect(JSON.stringify(outcome)).not.toContain('2012-01-01');
  });

  it('returns an empty list when the source has no results', async () => {
    const s = setup({ providerOptions: { results: undefined } });
    expect(await refresh(s)).toEqual({ ok: true, value: [] });
  });

  it.each<[string, Record<string, unknown>]>([
    ['unknown stroke', { stroke: 'XX' }],
    ['unknown distance', { distance: '33m' }],
    ['unknown pool', { pool: 'YDS' }],
    ['zero time', { hundredths: 0 }],
    ['negative time', { hundredths: -5 }],
    ['fractional time', { hundredths: 28.9 }],
    ['time as text', { hundredths: '2890' }],
    ['undefined time', { hundredths: undefined }],
    ['date in another format', { swumOn: '14/03/2026' }],
    ['date that does not exist', { swumOn: '2026-02-30' }],
    ['missing date', { swumOn: undefined }],
    ['empty source key', { sourceResultKey: '' }],
    ['numeric source key', { sourceResultKey: 12 }],
    ['competition of another type', { competition: 5 }],
    ['undefined competition', { competition: undefined }],
  ])('makes the whole call unavailable for %s', async (_name, override) => {
    const s = setup({ providerOptions: { results: [validResult, { ...validResult, ...override }] } });
    expect(await refresh(s)).toEqual(unavailable);
  });

  it('is unavailable when the source does not return a list or an item is not an object', async () => {
    expect(await refresh(setup({ providerOptions: { results: ['x'] } }))).toEqual(unavailable);
    expect(await refresh(setup({ providerOptions: { results: [null] } }))).toEqual(unavailable);
  });

  it.each([new ProviderUnavailableError('source down'), new Error('boom')])('maps an adapter throw to unavailable without leaking it', async (failWith) => {
    const s = setup({ providerOptions: { failWith } });
    const outcome = await refresh(s);
    expect(outcome).toEqual(unavailable);
    expect(JSON.stringify(outcome)).not.toContain(NUMBER);
  });
});

describe('findCandidates', () => {
  const candidate = { sourceAthleteKey: 'k-1', name: 'Ana Example', affiliations: [{ club: 'Synthetic Club', league: null, years: [2025, 2026] }], resultCount: 3 };
  const shown = { id: expect.any(String), name: 'Ana Example', affiliations: candidate.affiliations, resultCount: 3 };

  it('passes the stored number when there is one', async () => {
    const s = setup({ providerOptions: { candidates: [candidate] } });
    expect(await search(s)).toEqual({ ok: true, value: [shown] });
    expect(s.provider.calls).toEqual([{ method: 'findCandidates', argument: { firstName: 'Ana', lastName: 'Example', identityNumber: NUMBER } }]);
  });

  it('passes null when there is no stored number', async () => {
    const s = setup({ number: null, providerOptions: { candidates: [candidate] } });
    await search(s);
    expect(s.provider.calls).toEqual([{ method: 'findCandidates', argument: { firstName: 'Ana', lastName: 'Example', identityNumber: null } }]);
  });

  it('never returns the source reference to the device', async () => {
    const s = setup({ providerOptions: { candidates: [candidate, { ...candidate, sourceAthleteKey: 'k-2' }] } });
    const outcome = await search(s);
    expect(outcome.ok && outcome.value.every((c) => !('sourceAthleteKey' in c))).toBe(true);
    expect(JSON.stringify(outcome)).not.toMatch(/k-1|k-2/);
  });

  it('gives each candidate its own opaque id that does not contain the reference', async () => {
    const s = setup({ providerOptions: { candidates: [candidate, { ...candidate, sourceAthleteKey: 'k-2' }] } });
    const outcome = await search(s);
    if (!outcome.ok) throw new Error('expected candidates');
    const [first, second] = outcome.value;
    expect(first.id).not.toEqual(second.id);
    expect(first.id).not.toContain('k-1');
  });

  it('claims without a search time to live: a search is always an independent query', async () => {
    const s = setup({ providerOptions: { candidates: [candidate] } });
    await search(s);
    expect(s.fakeGate.claims).toEqual([{ athleteId: ATHLETE, userId: USER, provider: PROVIDER, intervalMs: QUERY_INTERVAL_MS }]);
  });

  it('shares the rate limit with refresh', async () => {
    const s = setup({ providerOptions: { candidates: [candidate] } });
    await search(s);
    const second = await refresh(s);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('rate_limited');
    expect(s.provider.calls).toHaveLength(1);
  });

  it('does not query the source within the interval and queries again after it', async () => {
    const s = setup({ providerOptions: { candidates: [candidate] } });
    const startedAt = s.fakeGate.now();
    await search(s);
    expect(await search(s)).toEqual({ ok: false, error: { code: 'rate_limited', retryAt: new Date(startedAt + QUERY_INTERVAL_MS).toISOString() } });
    expect(s.provider.calls).toHaveLength(1);
    s.fakeGate.advance(QUERY_INTERVAL_MS);
    expect((await search(s)).ok).toBe(true);
    expect(s.provider.calls).toHaveLength(2);
  });

  it('does not query the source when the user is not authorized, nor without a provider', async () => {
    const denied = setup({ authorized: false });
    expect(await search(denied)).toEqual({ ok: false, error: { code: 'not_authorized' } });
    expect(denied.identityNumbers.reads).toEqual([]);
    expect(denied.provider.calls).toEqual([]);
    const none = setup({ withProvider: false });
    expect(await search(none)).toEqual({ ok: false, error: { code: 'no_provider' } });
    expect(none.fakeGate.claims).toEqual([]);
  });

  it('keeps only the candidate fields', async () => {
    const s = setup({ providerOptions: { candidates: [{ ...candidate, idNumber: NUMBER, birthDate: '2012-01-01' }] } });
    const outcome = await search(s);
    expect(outcome).toEqual({ ok: true, value: [shown] });
    expect(JSON.stringify(outcome)).not.toContain(NUMBER);
    expect(JSON.stringify(outcome)).not.toContain('2012-01-01');
  });

  it.each<[string, Record<string, unknown>]>([
    ['empty key', { sourceAthleteKey: '' }],
    ['name of another type', { name: 7 }],
    ['affiliations not a list', { affiliations: 'x' }],
    ['club of another type', { affiliations: [{ club: 4, league: null, years: [] }] }],
    ['missing league', { affiliations: [{ club: null, years: [] }] }],
    ['fractional year', { affiliations: [{ club: null, league: null, years: [2025.5] }] }],
    ['negative count', { resultCount: -1 }],
    ['fractional count', { resultCount: 1.5 }],
  ])('makes the whole call unavailable for %s', async (_name, override) => {
    const s = setup({ providerOptions: { candidates: [{ ...candidate, ...override }] } });
    expect(await search(s)).toEqual(unavailable);
  });

  it('maps an adapter throw to unavailable', async () => {
    const s = setup({ providerOptions: { failWith: new ProviderUnavailableError('changed shape') } });
    expect(await search(s)).toEqual(unavailable);
  });
});

describe('confirmCandidate', () => {
  const candidate = { sourceAthleteKey: 'k-1', name: 'Ana Example', affiliations: [{ club: 'Synthetic Club', league: null, years: [2025, 2026] }], resultCount: 3 };

  async function searched(options: Parameters<typeof setup>[0] = {}) {
    const s = setup({ number: null, ...options, providerOptions: { candidates: [candidate] } });
    const outcome = await search(s);
    if (!outcome.ok) throw new Error('search failed');
    return { s, candidateId: outcome.value[0].id };
  }
  const confirm = (s: ReturnType<typeof setup>, candidateId: string, overrides: Partial<{ userId: string; athleteId: string; organizationId: string }> = {}) =>
    s.service.confirmCandidate({ userId: USER, athleteId: ATHLETE, organizationId: ORG, candidateId, ...overrides });

  it('records the evidence without the source reference, then saves the reference', async () => {
    const { s, candidateId } = await searched();
    expect(await confirm(s, candidateId)).toEqual({ ok: true, value: undefined });
    expect(s.confirmations.recorded).toEqual([
      {
        athleteId: ATHLETE,
        organizationId: ORG,
        userId: USER,
        evidence: { name: 'Ana Example', affiliations: candidate.affiliations, resultCount: 3 },
      },
    ]);
    expect(JSON.stringify(s.confirmations.recorded)).not.toContain('k-1');
    expect(s.identityNumbers.saved).toEqual([[ATHLETE, 'k-1']]);
    expect(s.confirmations.recorded).toHaveLength(1);
    expect(s.confirmations.removed).toEqual([]);
  });

  it('does not spend the rate-limit claim, so the first results query after confirming is allowed', async () => {
    const { s, candidateId } = await searched();
    const claimsBefore = s.fakeGate.claims.length;
    await confirm(s, candidateId);
    expect(s.fakeGate.claims).toHaveLength(claimsBefore);
  });

  it('rejects an id that findCandidates did not return, with nothing recorded or saved', async () => {
    const { s } = await searched();
    expect(await confirm(s, 'made-up-id')).toEqual({ ok: false, error: { code: 'unknown_id' } });
    expect(s.confirmations.recorded).toEqual([]);
    expect(s.identityNumbers.saved).toEqual([]);
  });

  it('never uses a candidate built by the caller: the source reference of the request is ignored', async () => {
    const { s, candidateId } = await searched();
    const forged = { userId: USER, athleteId: ATHLETE, organizationId: ORG, candidateId, candidate: { ...candidate, sourceAthleteKey: 'forged-key', name: 'Someone Else' } };
    await s.service.confirmCandidate(forged as unknown as Parameters<typeof s.service.confirmCandidate>[0]);
    expect(s.identityNumbers.saved).toEqual([[ATHLETE, 'k-1']]);
    expect(s.confirmations.recorded[0].evidence.name).toBe('Ana Example');
  });

  it.each<[string, Partial<{ userId: string; athleteId: string; organizationId: string }>]>([
    ['another user', { userId: 'user-2' }],
    ['another athlete', { athleteId: 'athlete-2' }],
    ['another organization', { organizationId: 'other-org' }],
  ])('rejects an id issued for %s', async (_name, overrides) => {
    const { s, candidateId } = await searched();
    expect(await confirm(s, candidateId, overrides)).toEqual({ ok: false, error: { code: 'unknown_id' } });
    expect(s.confirmations.recorded).toEqual([]);
  });

  it('rejects an id after its lifetime', async () => {
    const { s, candidateId } = await searched();
    s.advanceClock(CANDIDATE_TTL_MS + 1);
    expect(await confirm(s, candidateId)).toEqual({ ok: false, error: { code: 'unknown_id' } });
  });

  it('accepts an id only once', async () => {
    const { s, candidateId } = await searched();
    await confirm(s, candidateId);
    expect(await confirm(s, candidateId)).toEqual({ ok: false, error: { code: 'unknown_id' } });
    expect(s.confirmations.recorded).toHaveLength(1);
  });

  it('is not confirmed when import_official_results is not in force, and saves nothing', async () => {
    const { s, candidateId } = await searched();
    const readsBefore = s.identityNumbers.reads.length;
    s.confirmations.reject(new NotAuthorizedError());
    expect(await confirm(s, candidateId)).toEqual({ ok: false, error: { code: 'not_authorized' } });
    expect(s.identityNumbers.saved).toEqual([]);
    expect(s.identityNumbers.reads).toHaveLength(readsBefore);
  });

  it('answers no_provider when the organization lost its provider after the search', async () => {
    const { s, candidateId } = await searched();
    s.removeProvider();
    expect(await confirm(s, candidateId)).toEqual({ ok: false, error: { code: 'no_provider' } });
    expect(s.confirmations.recorded).toEqual([]);
  });

  it('removes the evidence when saving the number fails, so none is left without a number', async () => {
    const { s, candidateId } = await searched();
    s.identityNumbers.failSave(new Error('database down'));
    await expect(confirm(s, candidateId)).rejects.toThrow('database down');
    expect(s.confirmations.recorded).toHaveLength(1);
    expect(s.confirmations.removed).toEqual(s.confirmations.recordedIds);
    expect(s.confirmations.stored()).toEqual([]);
  });

  it('can be retried after a failed save', async () => {
    const { s, candidateId } = await searched();
    s.identityNumbers.failSave(new Error('database down'));
    await expect(confirm(s, candidateId)).rejects.toThrow();
    s.identityNumbers.failSave(undefined);
    expect(await confirm(s, candidateId)).toEqual({ ok: true, value: undefined });
    expect(s.confirmations.stored()).toHaveLength(1);
  });

  it('reports the failure and the orphan when the compensation fails too', async () => {
    const { s, candidateId } = await searched();
    s.identityNumbers.failSave(new Error('database down'));
    s.confirmations.failRemove(new Error('also down'));
    await expect(confirm(s, candidateId)).rejects.toThrow(OrphanedConfirmationError);
  });

  it('keeps a stored number when it is the same one, without saving it again', async () => {
    const { s, candidateId } = await searched({ number: 'k-1' });
    expect(await confirm(s, candidateId)).toEqual({ ok: true, value: undefined });
    expect(s.identityNumbers.saved).toEqual([]);
    expect(s.confirmations.stored()).toHaveLength(1);
  });

  it('never replaces a different stored number: nothing is saved and the evidence is removed', async () => {
    const { s, candidateId } = await searched({ number: NUMBER });
    const outcome = await confirm(s, candidateId);
    expect(outcome).toEqual({ ok: false, error: { code: 'identity_number_conflict' } });
    expect(JSON.stringify(outcome)).not.toContain(NUMBER);
    expect(s.identityNumbers.saved).toEqual([]);
    expect(s.confirmations.stored()).toEqual([]);
  });

  it('leaves no pending entry after confirming', async () => {
    const { s, candidateId } = await searched();
    expect(s.pending.rows.has(candidateId)).toBe(true);
    await confirm(s, candidateId);
    expect(s.pending.rows.size).toBe(0);
  });

  it('keeps the source reference only in the pending entry, never in anything the device receives', async () => {
    const { s, candidateId } = await searched();
    expect(s.pending.rows.get(candidateId)).toMatchObject({ reference: 'k-1', provider: 'zz-test' });
  });

  it('rejects an entry of another provider than the organization resolves to now', async () => {
    const { s } = await searched();
    const id = await s.pending.store.put({
      kind: 'search', userId: USER, athleteId: ATHLETE, organizationId: ORG, provider: 'zz-other', reference: 'k-9',
      payload: { name: 'Ana Example', affiliations: [], resultCount: 1 }, ttlMs: 60_000,
    });
    expect(await confirm(s, id)).toEqual({ ok: false, error: { code: 'unknown_id' } });
    expect(s.confirmations.recorded).toEqual([]);
    expect(s.identityNumbers.saved).toEqual([]);
  });

  it('puts the entry back with the time it had left after a failure, never with a longer life', async () => {
    const { s, candidateId } = await searched();
    const expiresAt = s.pending.rows.get(candidateId)!.expiresAt;
    s.advanceClock(5 * 60 * 1000);
    s.identityNumbers.failSave(new Error('database down'));
    await expect(confirm(s, candidateId)).rejects.toThrow('database down');
    expect(s.pending.rows.get(candidateId)?.expiresAt).toBe(expiresAt);
  });

  it('asks the store not to let the restored entry live past the instant it was due to expire', async () => {
    const { s, candidateId } = await searched();
    const expiresAt = s.pending.rows.get(candidateId)!.expiresAt;
    s.identityNumbers.failSave(new Error('database down'));
    await expect(confirm(s, candidateId)).rejects.toThrow('database down');
    expect(s.pending.rows.get(candidateId)).toMatchObject({ restoreUntil: expiresAt });
  });

  it('removes the evidence and spends the entry when the source key is not a valid number: retrying cannot work', async () => {
    const { s, candidateId } = await searched();
    s.identityNumbers.failSave(new InvalidSourceKeyError());
    expect(await confirm(s, candidateId)).toEqual({ ok: false, error: { code: 'unavailable' } });
    expect(s.confirmations.stored()).toEqual([]);
    expect(s.pending.rows.has(candidateId)).toBe(false);
  });

  it('answers not_authorized, with the evidence removed, when the authorization is withdrawn while keeping the number', async () => {
    const { s, candidateId } = await searched();
    s.identityNumbers.failSave(new NotAuthorizedError());
    expect(await confirm(s, candidateId)).toEqual({ ok: false, error: { code: 'not_authorized' } });
    expect(s.confirmations.stored()).toEqual([]);
    expect(s.pending.rows.has(candidateId)).toBe(true);
  });

  it.each([
    ['a conflicting number', { number: NUMBER }],
    ['a missing authorization', { number: null }],
  ])('keeps the id usable for another try after %s', async (name, options) => {
    const { s, candidateId } = await searched(options);
    if (name === 'a missing authorization') s.confirmations.reject(new NotAuthorizedError());
    expect((await confirm(s, candidateId)).ok).toBe(false);
    expect(s.pending.rows.has(candidateId)).toBe(true);
  });

  it('does not put the entry back after a success: the id cannot be reused', async () => {
    const { s, candidateId } = await searched();
    await confirm(s, candidateId);
    expect(await confirm(s, candidateId)).toEqual({ ok: false, error: { code: 'unknown_id' } });
    expect(s.pending.rows.has(candidateId)).toBe(false);
  });

  it('records one piece of evidence when two requests confirm the same id at once, and the other gets unknown_id', async () => {
    const { s, candidateId } = await searched();
    const [first, second] = await Promise.all([confirm(s, candidateId), confirm(s, candidateId)]);
    expect([first, second].filter((outcome) => outcome.ok)).toHaveLength(1);
    expect([first, second].filter((outcome) => !outcome.ok && outcome.error.code === 'unknown_id')).toHaveLength(1);
    expect(s.confirmations.recorded).toHaveLength(1);
    expect(s.confirmations.stored()).toHaveLength(1);
    expect(s.identityNumbers.saved).toEqual([[ATHLETE, 'k-1']]);
  });
});

// Issue #836: search -> confirm -> results of the same person and athlete is one flow, one claim.
describe('search, confirm and results as one flow', () => {
  const candidate = { sourceAthleteKey: 'k-1', name: 'Ana Example', affiliations: [], resultCount: 1 };
  const THIRTY_SIX_SECONDS = 36_000;

  // The athlete's number is the candidate's key, so the refresh after confirming can read it.
  async function searchedAndConfirmed() {
    const s = setup({ number: 'k-1', providerOptions: { candidates: [candidate], results: [validResult] } });
    const startedAt = s.fakeGate.now();
    const outcome = await search(s);
    if (!outcome.ok) throw new Error('search failed');
    const confirmed = await s.service.confirmCandidate({ userId: USER, athleteId: ATHLETE, organizationId: ORG, candidateId: outcome.value[0].id });
    expect(confirmed.ok).toBe(true);
    return { s, startedAt };
  }

  it('lets the first results query after the confirmed search through, where it used to be rate limited', async () => {
    const { s } = await searchedAndConfirmed();
    s.fakeGate.advance(THIRTY_SIX_SECONDS);
    expect(await refresh(s)).toEqual({ ok: true, value: [validResult] });
    expect(s.provider.calls.map((call) => call.method)).toEqual(['findCandidates', 'fetchResults']);
  });

  it("spends the search's claim once: a second results query right after is rate limited from the moment the claim was used", async () => {
    const { s } = await searchedAndConfirmed();
    s.fakeGate.advance(THIRTY_SIX_SECONDS);
    const usedAt = s.fakeGate.now();
    await refresh(s);
    s.fakeGate.advance(1_000);
    expect(await refresh(s)).toEqual({ ok: false, error: { code: 'rate_limited', retryAt: new Date(usedAt + QUERY_INTERVAL_MS).toISOString() } });
    expect(s.provider.calls.map((call) => call.method)).toEqual(['findCandidates', 'fetchResults']);
  });

  it('keeps the limit of independent searches: a second search inside the interval is rate limited and does not move the window', async () => {
    const { s, startedAt } = await searchedAndConfirmed();
    s.fakeGate.advance(THIRTY_SIX_SECONDS);
    expect(await search(s)).toEqual({ ok: false, error: { code: 'rate_limited', retryAt: new Date(startedAt + QUERY_INTERVAL_MS).toISOString() } });
    expect(s.fakeGate.lastQueryAt(ATHLETE)).toBe(startedAt);
    // The refused search left the shared claim in place.
    expect((await refresh(s)).ok).toBe(true);
  });

  it("asks for a claim of its own past the search's time to live", async () => {
    const { s } = await searchedAndConfirmed();
    s.fakeGate.advance(CANDIDATE_TTL_MS + 1);
    const askedAt = s.fakeGate.now();
    expect((await refresh(s)).ok).toBe(true);
    // Not the shared path: the window moved to this query, so another one right after is refused.
    expect(s.fakeGate.lastQueryAt(ATHLETE)).toBe(askedAt);
    expect((await refresh(s)).ok).toBe(false);
  });

  it('does not share the claim of a search that was never confirmed', async () => {
    const s = setup({ number: 'k-1', providerOptions: { candidates: [candidate], results: [validResult] } });
    await search(s);
    s.fakeGate.advance(THIRTY_SIX_SECONDS);
    const outcome = await refresh(s);
    expect(!outcome.ok && outcome.error.code).toBe('rate_limited');
  });

  it('gives back the shared claim when the results query fails: a short wait, then the results query is allowed', async () => {
    const { s } = await searchedAndConfirmed();
    s.fakeGate.advance(THIRTY_SIX_SECONDS);
    const failedAt = s.fakeGate.now();
    s.provider.setFailure(new SourceUnreachableError());
    expect(await refresh(s)).toEqual(unavailable);
    s.fakeGate.advance(RETRY_AFTER_FAILURE_MS - 1_000);
    // The released claim is not shared again: it waits the short time, not the rest of the search's interval.
    expect(await refresh(s)).toEqual({ ok: false, error: { code: 'rate_limited', retryAt: new Date(failedAt + RETRY_AFTER_FAILURE_MS).toISOString() } });
    s.fakeGate.advance(1_000);
    s.provider.setFailure(undefined);
    expect(await refresh(s)).toEqual({ ok: true, value: [validResult] });
  });
});

// Issue #888: a source query that fails (timeout, 5xx, network) does not spend the whole window.
describe('a source query that fails', () => {
  const down = new SourceUnreachableError();
  const rateLimitedAt = (at: number) => ({ ok: false, error: { code: 'rate_limited', retryAt: new Date(at).toISOString() } });

  it('gives the search claim back: a short wait, then a search is allowed again', async () => {
    const s = setup({ providerOptions: { failWith: down } });
    const failedAt = s.fakeGate.now();
    expect(await search(s)).toEqual(unavailable);
    s.fakeGate.advance(59_000);
    expect(await search(s)).toEqual(rateLimitedAt(failedAt + RETRY_AFTER_FAILURE_MS));
    s.fakeGate.advance(1_000);
    s.provider.setFailure(undefined);
    expect((await search(s)).ok).toBe(true);
    expect(s.provider.calls.map((call) => call.method)).toEqual(['findCandidates', 'findCandidates']);
  });

  it('gives the refresh claim back: a short wait, then a refresh is allowed again', async () => {
    const s = setup({ providerOptions: { failWith: down } });
    const failedAt = s.fakeGate.now();
    expect(await refresh(s)).toEqual(unavailable);
    s.fakeGate.advance(59_000);
    expect(await refresh(s)).toEqual(rateLimitedAt(failedAt + RETRY_AFTER_FAILURE_MS));
    s.fakeGate.advance(1_000);
    s.provider.setFailure(undefined);
    expect(await refresh(s)).toEqual({ ok: true, value: [validResult] });
  });

  // The port tells a source that did not answer (network, timeout, 5xx) from one that answered something unusable (4xx, a changed page).
  it.each<[string, Error]>([
    ['an unavailable error that is not about reaching the source', new ProviderUnavailableError('changed shape')],
    ['any other error', new Error('boom')],
  ])('keeps the whole window when the adapter throws %s: retrying soon cannot work', async (_name, failWith) => {
    const s = setup({ providerOptions: { failWith } });
    const startedAt = s.fakeGate.now();
    expect(await refresh(s)).toEqual(unavailable);
    expect(s.fakeGate.releases).toEqual([]);
    s.fakeGate.advance(2 * 60_000);
    expect(await refresh(s)).toEqual(rateLimitedAt(startedAt + QUERY_INTERVAL_MS));
    expect(await search(s)).toEqual(rateLimitedAt(startedAt + QUERY_INTERVAL_MS));
  });

  it('releases with the athlete, the provider, the exact claim it took, the interval and the short wait', async () => {
    const s = setup({ providerOptions: { failWith: down } });
    await refresh(s);
    expect(s.fakeGate.releases).toEqual([
      { athleteId: ATHLETE, provider: PROVIDER, claimedAt: s.fakeGate.lastToken(ATHLETE), intervalMs: QUERY_INTERVAL_MS, retryAfterMs: RETRY_AFTER_FAILURE_MS },
    ]);
  });

  it('keeps the whole window after a success: past the short wait the next query is still rate limited', async () => {
    const s = setup();
    const startedAt = s.fakeGate.now();
    expect((await refresh(s)).ok).toBe(true);
    s.fakeGate.advance(2 * 60_000);
    expect(await refresh(s)).toEqual(rateLimitedAt(startedAt + QUERY_INTERVAL_MS));
    s.fakeGate.advance(QUERY_INTERVAL_MS - 2 * 60_000 - 1_000);
    expect((await refresh(s)).ok).toBe(false);
    s.fakeGate.advance(1_000);
    expect((await refresh(s)).ok).toBe(true);
    expect(s.fakeGate.releases).toEqual([]);
  });

  it.each<[string, 'refresh' | 'search', Record<string, unknown[]>]>([
    ['a refresh whose results fail cleaning', 'refresh', { results: [validResult, { ...validResult, stroke: 'XX' }] }],
    ['a refresh whose result key has a segment that is the number', 'refresh', { results: [{ ...validResult, sourceResultKey: `t|e|${NUMBER}` }] }],
    ['a search whose list is not valid', 'search', { candidates: ['x'] }],
  ])('does not give the claim back when the source answered: %s', async (_name, action, providerOptions) => {
    const s = setup({ providerOptions });
    const startedAt = s.fakeGate.now();
    expect(await (action === 'refresh' ? refresh(s) : search(s))).toEqual(unavailable);
    expect(s.fakeGate.releases).toEqual([]);
    s.fakeGate.advance(RETRY_AFTER_FAILURE_MS);
    expect(await (action === 'refresh' ? refresh(s) : search(s))).toEqual(rateLimitedAt(startedAt + QUERY_INTERVAL_MS));
  });

  // Issue #907: a cleaner that throws is a failure on our side, not an answer from the source.
  const unreadable = () => {
    throw new Error('unreadable');
  };
  it.each<[string, 'refresh' | 'search', Record<string, unknown[]>]>([
    ['a list that throws while it is cleaned', 'refresh', { results: new Proxy([], { get: (_target, key) => (key === 'then' ? undefined : unreadable()) }) as unknown as unknown[] }],
    ['a result that throws while it is cleaned', 'refresh', { results: [Object.defineProperty({}, 'sourceResultKey', { get: unreadable, enumerable: true })] }],
    ['a candidate that throws while it is cleaned', 'search', { candidates: [Object.defineProperty({}, 'sourceAthleteKey', { get: unreadable, enumerable: true })] }],
  ])('is unavailable and gives the claim back for %s', async (_name, action, providerOptions) => {
    const s = setup({ providerOptions });
    const failedAt = s.fakeGate.now();
    const run = () => (action === 'refresh' ? refresh(s) : search(s));
    expect(await run()).toEqual(unavailable);
    expect(s.fakeGate.releases).toHaveLength(1);
    s.fakeGate.advance(RETRY_AFTER_FAILURE_MS - 1_000);
    expect(await run()).toEqual(rateLimitedAt(failedAt + RETRY_AFTER_FAILURE_MS));
  });

  it('does not give the claim back when there is no number: the source was never asked', async () => {
    const s = setup({ number: null });
    expect(await refresh(s)).toEqual(unavailable);
    expect(s.fakeGate.releases).toEqual([]);
  });

  it('does not give the claim back when the caller is not authorized or the claim is refused', async () => {
    const s = setup({ authorized: false, providerOptions: { failWith: down } });
    await refresh(s);
    expect(s.fakeGate.releases).toEqual([]);
  });

  it('is still unavailable when giving the claim back fails: the claim just stays spent', async () => {
    const s = setup({ providerOptions: { failWith: down } });
    const startedAt = s.fakeGate.now();
    s.fakeGate.failRelease(new Error('database down'));
    expect(await refresh(s)).toEqual(unavailable);
    s.fakeGate.advance(RETRY_AFTER_FAILURE_MS);
    expect(await refresh(s)).toEqual(rateLimitedAt(startedAt + QUERY_INTERVAL_MS));
  });

  it('is still unavailable when giving the claim back throws before it returns a promise', async () => {
    const s = setup({ providerOptions: { failWith: down } });
    s.fakeGate.failRelease(new Error('client broke'), true);
    expect(await refresh(s)).toEqual(unavailable);
    expect(s.fakeGate.releases).toHaveLength(1);
  });
});

// Issue #896: the results platform. The person pastes a tournament address; the platform is queried by the address and the
// number, its window is its own, and confirming it offers the tournament's rows.
describe('findInTournament', () => {
  const found = {
    found: true,
    athlete: { name: 'Ana Example', club: 'Synthetic Club' },
    results: [validResult, { ...validResult, sourceResultKey: 'r-2', distance: '100m' }],
  };
  const TYPED = '7654321';
  const tournament = (s: ReturnType<typeof setup>, overrides: Partial<Parameters<ReturnType<typeof setup>['service']['findInTournament']>[0]> = {}) =>
    s.service.findInTournament({ userId: USER, athleteId: ATHLETE, url: TOURNAMENT_URL, identityNumber: null, ...overrides });
  const shown = { id: expect.any(String), name: 'Ana Example', club: 'Synthetic Club', resultCount: 2 };

  it('claims the window of the platform provider, never the federation one, and leaves the federation window untouched', async () => {
    const s = setup({ platformOptions: { search: found } });
    expect((await tournament(s)).ok).toBe(true);
    expect(s.fakeGate.claims).toEqual([{ athleteId: ATHLETE, userId: USER, provider: PLATFORM, intervalMs: QUERY_INTERVAL_MS }]);
    expect(s.fakeGate.lastQueryAt(ATHLETE, PROVIDER)).toBeUndefined();
    // The federation can be asked right away: the platform query did not spend its window.
    expect((await refresh(s)).ok).toBe(true);
    expect(s.provider.calls).toHaveLength(1);
  });

  it("does not spend the platform window when the federation was asked", async () => {
    const s = setup({ platformOptions: { search: found } });
    expect((await refresh(s)).ok).toBe(true);
    expect((await tournament(s)).ok).toBe(true);
    expect(s.fakeGate.claims.map((claim) => (claim as { provider: string }).provider)).toEqual([PROVIDER, PLATFORM]);
  });

  it('rate limits a second query to the platform from the first one, and reports when to retry', async () => {
    const s = setup({ platformOptions: { search: found } });
    const startedAt = s.fakeGate.now();
    await tournament(s);
    s.fakeGate.advance(60_000);
    expect(await tournament(s)).toEqual({ ok: false, error: { code: 'rate_limited', retryAt: new Date(startedAt + QUERY_INTERVAL_MS).toISOString() } });
    expect(s.platform.calls).toHaveLength(1);
  });

  it('answers no_provider, with no claim and no request, for an address no platform accepts', async () => {
    const s = setup({ platformOptions: { search: found } });
    expect(await tournament(s, { url: 'https://other.example.test/tournament/1' })).toEqual({ ok: false, error: { code: 'no_provider' } });
    expect(s.fakeGate.claims).toEqual([]);
    expect(s.identityNumbers.reads).toEqual([]);
    expect(s.platform.calls).toEqual([]);
  });

  it('answers no_provider, with no claim and no request, when no organization holds the platform', async () => {
    const s = setup({ withPlatform: false, platformOptions: { search: found } });
    expect(await tournament(s)).toEqual({ ok: false, error: { code: 'no_provider' } });
    expect(s.fakeGate.claims).toEqual([]);
    expect(s.platform.calls).toEqual([]);
  });

  it('does not read the number nor query the platform when import_official_results is not in force', async () => {
    const s = setup({ authorized: false });
    expect(await tournament(s)).toEqual({ ok: false, error: { code: 'not_authorized' } });
    expect(s.identityNumbers.reads).toEqual([]);
    expect(s.platform.calls).toEqual([]);
  });

  it('looks up with the stored number when there is one', async () => {
    const s = setup({ platformOptions: { search: found } });
    await tournament(s);
    expect(s.platform.calls).toEqual([{ url: TOURNAMENT_URL, identityNumber: NUMBER }]);
  });

  it('looks up with the typed number when none is stored', async () => {
    const s = setup({ number: null, platformOptions: { search: found } });
    await tournament(s, { identityNumber: TYPED });
    expect(s.platform.calls).toEqual([{ url: TOURNAMENT_URL, identityNumber: TYPED }]);
  });

  it('uses the stored number when the typed one is the same after normalizing', async () => {
    const s = setup({ number: '1234567', platformOptions: { search: found } });
    expect((await tournament(s, { identityNumber: '1.234.567' })).ok).toBe(true);
    expect(s.platform.calls).toEqual([{ url: TOURNAMENT_URL, identityNumber: '1234567' }]);
  });

  it('answers identity_number_conflict, without the number and without a request, when the typed number differs from the stored one', async () => {
    const s = setup({ platformOptions: { search: found } });
    const outcome = await tournament(s, { identityNumber: TYPED });
    expect(outcome).toEqual({ ok: false, error: { code: 'identity_number_conflict' } });
    expect(JSON.stringify(outcome)).not.toContain(NUMBER);
    expect(JSON.stringify(outcome)).not.toContain(TYPED);
    expect(s.platform.calls).toEqual([]);
    expect(s.pending.rows.size).toBe(0);
  });

  it('answers identity_number_required, with the claim spent, when there is no stored nor typed number', async () => {
    const s = setup({ number: null, platformOptions: { search: found } });
    expect(await tournament(s)).toEqual({ ok: false, error: { code: 'identity_number_required' } });
    expect(s.fakeGate.claims).toHaveLength(1);
    expect(s.platform.calls).toEqual([]);
    expect(s.fakeGate.releases).toEqual([]);
  });

  it('answers a null candidate, and keeps nothing, when the tournament does not have the number', async () => {
    const s = setup({ platformOptions: { search: { found: false } } });
    expect(await tournament(s)).toEqual({ ok: true, value: { organizationId: PLATFORM_ORG, candidate: null } });
    expect(s.pending.rows.size).toBe(0);
  });

  it('offers one candidate and keeps the tournament rows on the server, encrypted, with the number as the reference', async () => {
    const s = setup({ number: null, platformOptions: { search: found } });
    const outcome = await tournament(s, { identityNumber: TYPED });
    expect(outcome).toEqual({ ok: true, value: { organizationId: PLATFORM_ORG, candidate: shown } });
    if (!outcome.ok || !outcome.value.candidate) throw new Error('expected a candidate');
    expect(s.pending.rows.size).toBe(1);
    expect(s.pending.rows.get(outcome.value.candidate.id)).toEqual({
      kind: 'search',
      userId: USER,
      athleteId: ATHLETE,
      organizationId: PLATFORM_ORG,
      provider: PLATFORM,
      reference: TYPED,
      payload: { name: 'Ana Example', affiliations: [{ club: 'Synthetic Club', league: null, years: [] }], resultCount: 2, results: found.results },
      expiresAt: Date.parse('2026-10-28T10:00:00Z') + CANDIDATE_TTL_MS,
    });
    // The device gets the id, the name, the club and the count: no number, no key, no row.
    const shownText = JSON.stringify(outcome);
    for (const secret of [TYPED, 'r-1', 'r-2', 'Synthetic Open']) expect(shownText).not.toContain(secret);
  });

  it('keeps only the declared fields of what the platform answers', async () => {
    const extra = { ...found, athlete: { ...found.athlete, birthDate: '2012-01-01', license: NUMBER }, results: [{ ...validResult, idNumber: NUMBER, birthDate: '2012-01-01' }] };
    const s = setup({ platformOptions: { search: extra } });
    const outcome = await tournament(s);
    expect(outcome.ok).toBe(true);
    const [row] = [...s.pending.rows.values()];
    expect(row.payload).toEqual({ name: 'Ana Example', affiliations: [{ club: 'Synthetic Club', league: null, years: [] }], resultCount: 1, results: [validResult] });
    expect(JSON.stringify(outcome)).not.toMatch(/2012-01-01|0000000000/);
  });

  it('accepts an athlete without a club', async () => {
    const s = setup({ platformOptions: { search: { ...found, athlete: { name: 'Ana Example', club: null } } } });
    expect(await tournament(s)).toEqual({ ok: true, value: { organizationId: PLATFORM_ORG, candidate: { ...shown, club: null } } });
  });

  it.each<[string, unknown]>([
    ['an answer that is not an object', 'x'],
    ['an answer without found', {}],
    ['found as text', { ...found, found: 'yes' }],
    ['no athlete', { found: true, results: [] }],
    ['a name of another type', { ...found, athlete: { name: 7, club: null } }],
    ['a club of another type', { ...found, athlete: { name: 'Ana', club: 4 } }],
    ['results that are not a list', { ...found, results: 'x' }],
    ['a result that is not valid', { ...found, results: [validResult, { ...validResult, stroke: 'XX' }] }],
  ])('is unavailable, and keeps nothing, for %s', async (_name, search) => {
    const s = setup({ platformOptions: { search } });
    expect(await tournament(s)).toEqual(unavailable);
    expect(s.pending.rows.size).toBe(0);
    // The platform answered something unusable: the window stays spent.
    expect(s.fakeGate.releases).toEqual([]);
  });

  it('is unavailable, with nothing kept, when a result key has a segment that is the number; a number inside a longer id is fine', async () => {
    const bad = setup({ platformOptions: { search: { ...found, results: [validResult, { ...validResult, sourceResultKey: `t|e|${NUMBER}` }] } } });
    const outcome = await tournament(bad);
    expect(outcome).toEqual(unavailable);
    expect(JSON.stringify(outcome)).not.toContain(NUMBER);
    expect(bad.pending.rows.size).toBe(0);
    const fine = setup({ platformOptions: { search: { ...found, results: [{ ...validResult, sourceResultKey: `t|e|${NUMBER}-1` }] } } });
    expect((await tournament(fine)).ok).toBe(true);
  });

  it('gives the platform claim back, with the platform provider, when the platform did not answer', async () => {
    const s = setup({ platformOptions: { failWith: new SourceUnreachableError() } });
    const failedAt = s.fakeGate.now();
    expect(await tournament(s)).toEqual(unavailable);
    expect(s.fakeGate.releases).toEqual([
      { athleteId: ATHLETE, provider: PLATFORM, claimedAt: s.fakeGate.lastToken(ATHLETE, PLATFORM), intervalMs: QUERY_INTERVAL_MS, retryAfterMs: RETRY_AFTER_FAILURE_MS },
    ]);
    s.fakeGate.advance(RETRY_AFTER_FAILURE_MS - 1_000);
    expect(await tournament(s)).toEqual({ ok: false, error: { code: 'rate_limited', retryAt: new Date(failedAt + RETRY_AFTER_FAILURE_MS).toISOString() } });
    s.fakeGate.advance(1_000);
    s.platform.setFailure(undefined);
    expect((await tournament(s)).ok).toBe(true);
  });

  it.each<[string, Error]>([
    ['an unavailable error that is not about reaching the platform', new ProviderUnavailableError('changed shape')],
    ['any other error', new Error('boom')],
  ])('keeps the whole platform window when the adapter throws %s, and never repeats it', async (_name, failWith) => {
    const s = setup({ platformOptions: { failWith } });
    const startedAt = s.fakeGate.now();
    const outcome = await tournament(s);
    expect(outcome).toEqual(unavailable);
    expect(JSON.stringify(outcome)).not.toContain(NUMBER);
    expect(s.fakeGate.releases).toEqual([]);
    s.fakeGate.advance(2 * 60_000);
    expect(await tournament(s)).toEqual({ ok: false, error: { code: 'rate_limited', retryAt: new Date(startedAt + QUERY_INTERVAL_MS).toISOString() } });
  });

  it('gives the claim back when an answer throws while it is cleaned: a failure on our side', async () => {
    const unreadable = Object.defineProperty({}, 'found', { get: () => { throw new Error('unreadable'); }, enumerable: true });
    const s = setup({ platformOptions: { search: unreadable } });
    expect(await tournament(s)).toEqual(unavailable);
    expect(s.fakeGate.releases).toHaveLength(1);
  });

  it('answers not_authorized when the authorization is withdrawn while keeping the candidate', async () => {
    const s = setup({ platformOptions: { search: found } });
    s.pending.store.put = async () => {
      throw new NotAuthorizedError();
    };
    expect(await tournament(s)).toEqual({ ok: false, error: { code: 'not_authorized' } });
  });
});

describe('confirming a candidate of the platform', () => {
  const TYPED = '7654321';
  const second = { ...validResult, sourceResultKey: 'r-2', distance: '100m' };
  const answer = { found: true, athlete: { name: 'Ana Example', club: 'Synthetic Club' }, results: [validResult, second] };
  const { sourceResultKey: _key, ...firstPayload } = validResult;
  const { sourceResultKey: _key2, ...secondPayload } = second;

  async function searched(options: Parameters<typeof setup>[0] = {}) {
    const s = setup({ number: null, platformOptions: { search: answer }, ...options });
    const outcome = await s.service.findInTournament({ userId: USER, athleteId: ATHLETE, url: TOURNAMENT_URL, identityNumber: TYPED });
    if (!outcome.ok || !outcome.value.candidate) throw new Error('search failed');
    return { s, candidateId: outcome.value.candidate.id };
  }
  const confirm = (s: ReturnType<typeof setup>, candidateId: string, organizationId = PLATFORM_ORG) =>
    s.service.confirmCandidate({ userId: USER, athleteId: ATHLETE, organizationId, candidateId });

  it('records the evidence without the rows or the key, and keeps the typed number', async () => {
    const { s, candidateId } = await searched();
    await confirm(s, candidateId);
    expect(s.confirmations.recorded).toEqual([
      {
        athleteId: ATHLETE,
        organizationId: PLATFORM_ORG,
        userId: USER,
        evidence: { name: 'Ana Example', affiliations: [{ club: 'Synthetic Club', league: null, years: [] }], resultCount: 2 },
      },
    ]);
    expect(JSON.stringify(s.confirmations.recorded)).not.toMatch(/"r-[12]"/);
    expect(s.identityNumbers.saved).toEqual([[ATHLETE, TYPED]]);
  });

  it('offers each row behind an opaque id and nothing else, and waits for the guardian to choose', async () => {
    const { s, candidateId } = await searched();
    const outcome = await confirm(s, candidateId);
    expect(outcome).toEqual({
      ok: true,
      value: { results: [{ id: expect.any(String), ...firstPayload }, { id: expect.any(String), ...secondPayload }] },
    });
    expect(JSON.stringify(outcome)).not.toMatch(/"r-[12]"/);
    if (!outcome.ok || !outcome.value) throw new Error('expected results');
    const [first, other] = outcome.value.results;
    expect(first.id).not.toEqual(other.id);
    // The entries are what `results` leaves for `import`: kind results, the key as the reference, the rest as the payload, 15 minutes.
    expect(s.pending.rows.get(first.id)).toEqual({
      kind: 'results',
      userId: USER,
      athleteId: ATHLETE,
      organizationId: PLATFORM_ORG,
      provider: PLATFORM,
      reference: 'r-1',
      payload: firstPayload,
      expiresAt: Date.parse('2026-10-28T10:00:00Z') + 15 * 60 * 1000,
    });
    expect(s.pending.rows.get(other.id)).toMatchObject({ kind: 'results', reference: 'r-2', payload: secondPayload });
    expect(s.pending.rows.size).toBe(2);
  });

  it('offers no rows when the athlete has none in the tournament, and still confirms', async () => {
    const { s, candidateId } = await searched({ platformOptions: { search: { ...answer, results: [] } } });
    expect(await confirm(s, candidateId)).toEqual({ ok: true, value: { results: [] } });
    expect(s.confirmations.stored()).toHaveLength(1);
  });

  it('does not spend the platform window: the confirmation asks the platform for nothing', async () => {
    const { s, candidateId } = await searched();
    const claims = s.fakeGate.claims.length;
    await confirm(s, candidateId);
    expect(s.fakeGate.claims).toHaveLength(claims);
    expect(s.platform.calls).toHaveLength(1);
  });

  it('offers nothing and removes the evidence when a different number is already stored', async () => {
    const s = setup({ number: NUMBER });
    const id = await s.pending.store.put({
      kind: 'search', userId: USER, athleteId: ATHLETE, organizationId: PLATFORM_ORG, provider: PLATFORM, reference: TYPED,
      payload: { name: 'Ana Example', affiliations: [], resultCount: 1, results: [validResult] }, ttlMs: 60_000,
    });
    expect(await confirm(s, id)).toEqual({ ok: false, error: { code: 'identity_number_conflict' } });
    expect(s.confirmations.stored()).toEqual([]);
    expect([...s.pending.rows.values()].filter((row) => row.kind === 'results')).toEqual([]);
  });

  it('answers unavailable, keeping the confirmation, when the rows cannot be put behind their ids', async () => {
    const { s, candidateId } = await searched();
    const put = s.pending.store.put;
    s.pending.store.put = async (entry) => {
      if (entry.kind === 'results') throw new Error('database down');
      return put(entry);
    };
    expect(await confirm(s, candidateId)).toEqual(unavailable);
    // The person is confirmed and the number kept; the entry is spent and they search the tournament again.
    expect(s.confirmations.stored()).toHaveLength(1);
    expect(s.identityNumbers.saved).toEqual([[ATHLETE, TYPED]]);
    expect(s.pending.rows.has(candidateId)).toBe(false);
  });

  it('answers unknown_id for an entry of another provider than the platform organization has now', async () => {
    const { s } = await searched();
    const id = await s.pending.store.put({
      kind: 'search', userId: USER, athleteId: ATHLETE, organizationId: PLATFORM_ORG, provider: 'zz-other', reference: TYPED,
      payload: { name: 'Ana Example', affiliations: [], resultCount: 1, results: [] }, ttlMs: 60_000,
    });
    expect(await confirm(s, id)).toEqual({ ok: false, error: { code: 'unknown_id' } });
    expect(s.confirmations.recorded).toEqual([]);
  });

  it('answers unknown_id for a platform entry confirmed against the federation organization', async () => {
    const { s, candidateId } = await searched();
    expect(await confirm(s, candidateId, ORG)).toEqual({ ok: false, error: { code: 'unknown_id' } });
    expect(s.confirmations.recorded).toEqual([]);
  });

  it('answers no_provider when the platform organization lost its provider after the search', async () => {
    const { s, candidateId } = await searched();
    s.removePlatform();
    expect(await confirm(s, candidateId)).toEqual({ ok: false, error: { code: 'no_provider' } });
    expect(s.confirmations.recorded).toEqual([]);
  });

  it('keeps a federation confirmation answering nothing', async () => {
    const s = setup({ number: null, providerOptions: { candidates: [{ sourceAthleteKey: 'k-1', name: 'Ana Example', affiliations: [], resultCount: 1 }] } });
    const outcome = await search(s);
    if (!outcome.ok) throw new Error('search failed');
    expect(await confirm(s, outcome.value[0].id, ORG)).toEqual({ ok: true, value: undefined });
    expect([...s.pending.rows.values()].filter((row) => row.kind === 'results')).toEqual([]);
  });
});
