import type { NormalizedResult } from '../port.ts';
import { createProviderRegistry, type OrganizationData } from '../registry.ts';
import { createResultsImport, type Claim, type Confirmations, type IdentityNumbers, type PendingEntry, type PendingStore, type QueryGate } from '../service.ts';
import {
  createOfficialResultsActions,
  MAX_IDS,
  PENDING_TTL_MS,
  type ImportRecorder,
} from '../actions.ts';
import { createFakeProvider } from './fakeProvider.ts';

const ORG = 'fed';
const ATHLETE = 'athlete-1';
const USER = 'user-1';
const NUMBER = '0000000123-synthetic';
const chain: OrganizationData[] = [{ id: ORG, type: 'federation', countryCode: 'ZZ', parentId: null, provider: 'zz-test' }];

const result = (key: string, overrides: Partial<NormalizedResult> = {}): NormalizedResult => ({
  sourceResultKey: key,
  stroke: 'FR',
  distance: '50m',
  pool: 'LCM',
  hundredths: 2890,
  swumOn: '2026-03-14',
  competition: 'Synthetic Open',
  ...overrides,
});

// Same semantics as results_import_pending_put / _take: one row per id, deleted when taken, bound to kind, user and athlete.
const clock = { now: Date.parse('2026-10-29T12:00:00Z') };

type Row = PendingEntry & { expiresAt: number };

function createFakePending(): PendingStore & { rows: Map<string, Row>; puts: Parameters<PendingStore['put']>[0][] } {
  const rows = new Map<string, Row>();
  const puts: Parameters<PendingStore['put']>[0][] = [];
  let next = 0;
  return {
    rows,
    puts,
    async put(input) {
      puts.push(input);
      if (input.ttlMs < 0 || input.ttlMs > PENDING_TTL_MS) throw new Error('22023');
      const id = input.id ?? `p${++next}`;
      const { ttlMs, id: _id, restoreUntil, ...entry } = input;
      rows.set(id, { ...entry, expiresAt: restoreUntil ?? clock.now + ttlMs });
      return id;
    },
    async take({ id, kind, userId, athleteId }) {
      const row = rows.get(id);
      if (!row || row.kind !== kind || row.userId !== userId || row.athleteId !== athleteId) return null;
      rows.delete(id);
      return row;
    },
  };
}

function setup(
  options: {
    allowed?: boolean;
    confirmed?: boolean;
    number?: string | null;
    results?: NormalizedResult[];
    claim?: Claim;
    recordFails?: boolean;
    providerKey?: string | null;
  } = {},
) {
  const provider = createFakeProvider({ results: options.results ?? [result('r-1'), result('r-2', { distance: '100m' })] });
  const pending = createFakePending();
  const claims: unknown[] = [];
  const gate: QueryGate = {
    async claim(request) {
      claims.push(request);
      return options.claim ?? { status: 'allowed' };
    },
  };
  const identityNumbers: IdentityNumbers = {
    async read() {
      return options.number === undefined ? NUMBER : options.number;
    },
    async keep() {
      return true;
    },
  };
  const confirmations: Confirmations = {
    async record() {
      return 'evidence-1';
    },
    async remove() {},
  };
  const service = createResultsImport({
    registry: createProviderRegistry([provider]),
    gate,
    identityNumbers,
    confirmations,
    organizationChain: async () => chain,
    pending,
  });
  const recorded: Parameters<ImportRecorder['record']>[0][] = [];
  const recorder: ImportRecorder = {
    async record(input) {
      if (options.recordFails) throw new Error('db down');
      recorded.push(input);
      return { importId: 'import-1', inserted: input.results.length, duplicates: 0, changes: 0 };
    },
  };
  const actions = createOfficialResultsActions({
    service,
    identityNumbers,
    pending,
    recorder,
    access: { allowed: async () => options.allowed ?? true },
    confirmations: {
      latest: async () => (options.confirmed === false ? null : { organizationId: ORG, confirmedAt: '2026-10-28T10:00:00Z', candidateName: 'Synthetic Swimmer' }),
    },
    providerKeyFor: async () => (options.providerKey === undefined ? 'zz-test' : options.providerKey),
    now: () => clock.now,
  });
  return { actions, pending, recorded, claims, provider };
}

const who = { userId: USER, athleteId: ATHLETE };

describe('status', () => {
  it('says what was confirmed, and that a number exists with only its last three characters', async () => {
    const { actions, claims, provider } = setup();
    expect(await actions.status(who)).toEqual({
      ok: true,
      value: { confirmed: true, organizationId: ORG, confirmedAt: '2026-10-28T10:00:00Z', candidateName: 'Synthetic Swimmer', hasNumber: true, lastThree: 'tic' },
    });
    // It neither asks the source nor spends the rate limit.
    expect(provider.calls).toEqual([]);
    expect(claims).toEqual([]);
  });

  it('is not confirmed before the guardian answered, without reading anything else', async () => {
    const { actions } = setup({ confirmed: false });
    expect(await actions.status(who)).toEqual({
      ok: true,
      value: { confirmed: false, organizationId: null, confirmedAt: null, candidateName: null, hasNumber: false, lastThree: null },
    });
  });

  it('has no number to show when none is stored', async () => {
    const { actions } = setup({ number: null });
    expect(await actions.status(who)).toMatchObject({ ok: true, value: { confirmed: true, hasNumber: false, lastThree: null } });
  });

  it('refuses a caller who may not import, and learns nothing', async () => {
    expect(await setup({ allowed: false }).actions.status(who)).toEqual({ ok: false, error: { code: 'not_authorized' } });
  });
});

describe('results', () => {
  it('offers an opaque id per result and never the source key', async () => {
    const { actions, pending } = setup();
    const outcome = await actions.results(who);

    expect(outcome).toEqual({
      ok: true,
      value: {
        results: [
          { id: 'p1', stroke: 'FR', distance: '50m', pool: 'LCM', hundredths: 2890, swumOn: '2026-03-14', competition: 'Synthetic Open' },
          { id: 'p2', stroke: 'FR', distance: '100m', pool: 'LCM', hundredths: 2890, swumOn: '2026-03-14', competition: 'Synthetic Open' },
        ],
      },
    });
    expect(JSON.stringify(outcome)).not.toContain('r-1');
    // The key and the values wait on the server for the import, for 15 minutes.
    expect(pending.puts[0]).toMatchObject({ kind: 'results', userId: USER, athleteId: ATHLETE, organizationId: ORG, provider: 'zz-test', reference: 'r-1', ttlMs: PENDING_TTL_MS });
  });

  it('keeps a missing time as null, never zero', async () => {
    const { actions } = setup({ results: [result('r-1', { hundredths: null })] });
    const outcome = await actions.results(who);
    expect(outcome.ok && outcome.value.results[0]?.hundredths).toBeNull();
  });

  it('needs the identity confirmed and spends no rate limit without it', async () => {
    const { actions, claims, provider } = setup({ confirmed: false });
    expect(await actions.results(who)).toEqual({ ok: false, error: { code: 'not_confirmed' } });
    expect(claims).toEqual([]);
    expect(provider.calls).toEqual([]);
  });

  it('refuses a caller who may not import before anything else', async () => {
    const { actions, claims } = setup({ allowed: false, confirmed: false });
    expect(await actions.results(who)).toEqual({ ok: false, error: { code: 'not_authorized' } });
    expect(claims).toEqual([]);
  });

  it('passes the rate limit through with the time to retry', async () => {
    const claim = { status: 'rate_limited', retryAt: '2026-10-29T12:10:00Z' } as const;
    expect(await setup({ claim }).actions.results(who)).toEqual({ ok: false, error: { code: 'rate_limited', retryAt: claim.retryAt } });
  });

  it('is unavailable when the source has no number to search by', async () => {
    expect(await setup({ number: null }).actions.results(who)).toEqual({ ok: false, error: { code: 'unavailable' } });
  });

  it('stores nothing when the source answers nothing', async () => {
    const { actions, pending } = setup({ results: [] });
    expect(await actions.results(who)).toEqual({ ok: true, value: { results: [] } });
    expect(pending.puts).toEqual([]);
  });
});

async function offered(options: Parameters<typeof setup>[0] = {}) {
  const s = setup(options);
  const outcome = await s.actions.results(who);
  if (!outcome.ok) throw new Error('setup failed');
  return { ...s, ids: outcome.value.results.map((r) => r.id) };
}

describe('import', () => {
  it('records the chosen results with their source keys and says what happened', async () => {
    const { actions, recorded, ids } = await offered();
    expect(await actions.import({ ...who, resultIds: [ids[1]!] })).toEqual({ ok: true, value: { importId: 'import-1', inserted: 1, duplicates: 0, changes: 0 } });
    expect(recorded).toEqual([{ athleteId: ATHLETE, organizationId: ORG, requestedBy: USER, results: [result('r-2', { distance: '100m' })] }]);
  });

  it('neither asks the source nor spends the rate limit', async () => {
    const { actions, claims, provider, ids } = await offered();
    const callsBefore = provider.calls.length;
    const claimsBefore = claims.length;
    await actions.import({ ...who, resultIds: ids });
    expect(provider.calls).toHaveLength(callsBefore);
    expect(claims).toHaveLength(claimsBefore);
  });

  it('uses an id once: importing the same ids again is unknown_id', async () => {
    const { actions, ids } = await offered();
    await actions.import({ ...who, resultIds: ids });
    expect(await actions.import({ ...who, resultIds: ids })).toEqual({ ok: false, error: { code: 'unknown_id' } });
  });

  it('records a repeated id once', async () => {
    const { actions, recorded, ids } = await offered();
    await actions.import({ ...who, resultIds: [ids[0]!, ids[0]!] });
    expect(recorded[0]?.results).toHaveLength(1);
  });

  it('rejects everything and takes none when only part of the ids are valid', async () => {
    const { actions, pending, recorded, ids } = await offered();
    expect(await actions.import({ ...who, resultIds: [ids[0]!, 'never-issued'] })).toEqual({ ok: false, error: { code: 'unknown_id' } });

    // The valid one was put back, so the guardian can try again with it.
    expect(pending.rows.has(ids[0]!)).toBe(true);
    expect(recorded).toEqual([]);
    expect(await actions.import({ ...who, resultIds: [ids[0]!] })).toMatchObject({ ok: true });
  });

  it('puts a taken id back with the time it had left, never more', async () => {
    const { actions, pending, ids } = await offered({ recordFails: true });
    clock.now += 6 * 60 * 1000;
    await actions.import({ ...who, resultIds: ids });

    const restored = pending.puts.filter((put) => put.id !== undefined);
    expect(restored).toHaveLength(ids.length);
    expect(restored.every((put) => put.ttlMs === PENDING_TTL_MS - 6 * 60 * 1000 && put.restoreUntil === clock.now - 6 * 60 * 1000 + PENDING_TTL_MS)).toBe(true);
    clock.now -= 6 * 60 * 1000;
  });

  it('does not bring back an id that expired while it was taken', async () => {
    const { actions, pending, ids } = await offered({ recordFails: true });
    clock.now += PENDING_TTL_MS + 1;
    await actions.import({ ...who, resultIds: ids });
    // Taken before it expired in the fake, so there is nothing left to restore.
    expect(pending.puts.filter((put) => put.id !== undefined)).toEqual([]);
    clock.now -= PENDING_TTL_MS + 1;
  });

  it('treats an id of another user or another athlete as unknown_id', async () => {
    const { actions, ids } = await offered();
    expect(await actions.import({ userId: 'someone-else', athleteId: ATHLETE, resultIds: ids })).toEqual({ ok: false, error: { code: 'unknown_id' } });
    expect(await actions.import({ userId: USER, athleteId: 'athlete-2', resultIds: ids })).toEqual({ ok: false, error: { code: 'unknown_id' } });
  });

  it('puts the taken ids back when recording fails, so a retry works', async () => {
    const failing = await offered({ recordFails: true });
    expect(await failing.actions.import({ ...who, resultIds: failing.ids })).toEqual({ ok: false, error: { code: 'unavailable' } });
    expect([...failing.pending.rows.keys()].sort()).toEqual([...failing.ids].sort());
  });

  it.each([
    ['no ids', []],
    ['an id that is not a string', [1]],
    ['an empty id', ['']],
    ['too many ids', Array.from({ length: MAX_IDS + 1 }, (_, i) => `p${i}`)],
  ])('answers bad_request for %s, and takes nothing', async (_name, resultIds) => {
    const { actions, pending, ids } = await offered();
    expect(await actions.import({ ...who, resultIds: resultIds as string[] })).toEqual({ ok: false, error: { code: 'bad_request' } });
    expect(pending.rows.size).toBe(ids.length);
  });

  it('answers bad_request when the ids come from different organizations, and puts them back', async () => {
    const { actions, pending, ids } = await offered();
    pending.rows.set(ids[1]!, { ...pending.rows.get(ids[1]!)!, organizationId: 'other-org' });
    expect(await actions.import({ ...who, resultIds: ids })).toEqual({ ok: false, error: { code: 'bad_request' } });
    expect(pending.rows.size).toBe(ids.length);
  });

  it('refuses a caller who may not import', async () => {
    const { actions, ids } = await offered();
    const denied = setup({ allowed: false });
    expect(await denied.actions.import({ ...who, resultIds: ids })).toEqual({ ok: false, error: { code: 'not_authorized' } });
    expect(denied.recorded).toEqual([]);
  });
});
