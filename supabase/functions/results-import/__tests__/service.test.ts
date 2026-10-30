import { ProviderUnavailableError, type NormalizedResult } from '../port.ts';
import { createProviderRegistry, type OrganizationData } from '../registry.ts';
import { createResultsImport, QUERY_INTERVAL_MS, type Claim, type Confirmations, type IdentityNumbers, type QueryGate } from '../service.ts';
import { createFakeProvider } from './fakeProvider.ts';

const ORG = 'fed';
const ATHLETE = 'athlete-1';
const USER = 'user-1';
const NUMBER = '0000000000-synthetic';
const chain: OrganizationData[] = [{ id: ORG, type: 'federation', countryCode: 'ZZ', parentId: null, provider: 'zz-test' }];

const validResult: NormalizedResult = {
  sourceResultKey: 'r-1',
  stroke: 'FR',
  distance: '50m',
  pool: 'LCM',
  hundredths: 2890,
  swumOn: '2026-03-14',
  competition: 'Synthetic Open',
};

// Same rule as results_import_claim_query: authorized users only, one source query per athlete per interval.
function createFakeGate(authorized = true) {
  let now = Date.parse('2026-10-28T10:00:00Z');
  const last = new Map<string, number>();
  const claims: unknown[] = [];
  const gate: QueryGate = {
    async claim(request): Promise<Claim> {
      claims.push(request);
      if (!authorized) return { status: 'not_authorized' };
      const previous = last.get(request.athleteId);
      if (previous !== undefined && now < previous + request.intervalMs) {
        return { status: 'rate_limited', retryAt: new Date(previous + request.intervalMs).toISOString() };
      }
      last.set(request.athleteId, now);
      return { status: 'allowed' };
    },
  };
  return { gate, claims, advance: (ms: number) => (now += ms), now: () => now };
}

function createFakeIdentityNumbers(initial: string | null): IdentityNumbers & { saved: [string, string][]; reads: string[] } {
  const saved: [string, string][] = [];
  const reads: string[] = [];
  return {
    saved,
    reads,
    async read(athleteId) {
      reads.push(athleteId);
      return initial;
    },
    async save(athleteId, identityNumber) {
      saved.push([athleteId, identityNumber]);
    },
  };
}

function createFakeConfirmations(rejectWith?: Error): Confirmations & { recorded: Parameters<Confirmations['record']>[0][] } {
  const recorded: Parameters<Confirmations['record']>[0][] = [];
  return {
    recorded,
    async record(input) {
      if (rejectWith) throw rejectWith;
      recorded.push(input);
    },
  };
}

function setup(options: { number?: string | null; authorized?: boolean; rejectConfirmation?: Error; providerOptions?: Parameters<typeof createFakeProvider>[0]; withProvider?: boolean } = {}) {
  const provider = createFakeProvider({ results: [validResult], ...options.providerOptions });
  const fakeGate = createFakeGate(options.authorized ?? true);
  const identityNumbers = createFakeIdentityNumbers(options.number === undefined ? NUMBER : options.number);
  const confirmations = createFakeConfirmations(options.rejectConfirmation);
  const data = options.withProvider === false ? [{ ...chain[0], provider: null }] : chain;
  const service = createResultsImport({
    registry: createProviderRegistry([provider]),
    gate: fakeGate.gate,
    identityNumbers,
    confirmations,
    organizationChain: async () => data,
  });
  return { provider, fakeGate, identityNumbers, confirmations, service };
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

  it('is unavailable when a source result key contains the identity number', async () => {
    const s = setup({ providerOptions: { results: [validResult, { ...validResult, sourceResultKey: `k-${NUMBER}-1` }] } });
    const outcome = await refresh(s);
    expect(outcome).toEqual(unavailable);
    expect(JSON.stringify(outcome)).not.toContain(NUMBER);
  });

  it('claims with the athlete, the user and the interval', async () => {
    const s = setup();
    await refresh(s);
    expect(s.fakeGate.claims).toEqual([{ athleteId: ATHLETE, userId: USER, intervalMs: QUERY_INTERVAL_MS }]);
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

  it('passes the stored number when there is one', async () => {
    const s = setup({ providerOptions: { candidates: [candidate] } });
    expect(await search(s)).toEqual({ ok: true, value: [candidate] });
    expect(s.provider.calls).toEqual([{ method: 'findCandidates', argument: { firstName: 'Ana', lastName: 'Example', identityNumber: NUMBER } }]);
  });

  it('passes null when there is no stored number', async () => {
    const s = setup({ number: null, providerOptions: { candidates: [candidate] } });
    await search(s);
    expect(s.provider.calls).toEqual([{ method: 'findCandidates', argument: { firstName: 'Ana', lastName: 'Example', identityNumber: null } }]);
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
    expect(await search(s)).toEqual({ ok: true, value: [candidate] });
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
  const confirmed = { sourceAthleteKey: 'k-1', name: 'Ana Example', affiliations: [{ club: 'Synthetic Club', league: null, years: [2025, 2026] }], resultCount: 3 };
  const confirm = (s: ReturnType<typeof setup>) =>
    s.service.confirmCandidate({ userId: USER, athleteId: ATHLETE, organizationId: ORG, candidate: confirmed });

  it('records the evidence without the source reference, then saves the reference, touching neither gate nor provider', async () => {
    const s = setup();
    expect(await confirm(s)).toEqual({ ok: true, value: undefined });
    expect(s.confirmations.recorded).toEqual([
      {
        athleteId: ATHLETE,
        organizationId: ORG,
        userId: USER,
        evidence: { name: 'Ana Example', affiliations: confirmed.affiliations, resultCount: 3 },
      },
    ]);
    expect(JSON.stringify(s.confirmations.recorded)).not.toContain('k-1');
    expect(s.identityNumbers.saved).toEqual([[ATHLETE, 'k-1']]);
    expect(s.fakeGate.claims).toEqual([]);
    expect(s.provider.calls).toEqual([]);
  });

  it('does not save the reference when the confirmation is rejected, and propagates the error', async () => {
    const s = setup({ rejectConfirmation: new Error('not allowed') });
    await expect(confirm(s)).rejects.toThrow('not allowed');
    expect(s.identityNumbers.saved).toEqual([]);
  });
});
