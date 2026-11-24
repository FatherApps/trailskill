import { createAccess, createAthleteProfiles, createConfirmationReader, createConfirmations, createIdentityNumbers, createImportRecorder, createOrganizationChain, createPendingStore, createQueryGate, createTournamentCatalog, type Db, type DbError } from '../adapters.ts';
import { CANDIDATE_TTL_MS, InvalidSourceKeyError, NotAuthorizedError, QUERY_INTERVAL_MS, RETRY_AFTER_FAILURE_MS, TOURNAMENT_REFRESH_INTERVAL_MS } from '../service.ts';
import { tournamentEntry } from './fakeProvider.ts';

const ATHLETE = 'athlete-1';
const USER = 'user-1';
const NUMBER = '0000000000-synthetic';
const PROVIDER = 'zz-test';

type RpcCall = { fn: string; args: Record<string, unknown> };

// Answers each rpc with the queued reply, in order, and records the calls.
function createFakeDb(replies: { data?: unknown; error?: DbError | null }[] = []) {
  const calls: RpcCall[] = [];
  const deleted: [string, string][] = [];
  const tables: Record<string, Record<string, unknown>[]> = {};
  const selects: { table: string; columns: string; equals?: Record<string, string | number> }[] = [];
  let selectError: DbError | null = null;
  let deleteError: DbError | null = null;
  const db: Db = {
    async rpc(fn, args) {
      calls.push({ fn, args });
      const reply = replies.shift() ?? {};
      return { data: reply.data ?? null, error: reply.error ?? null };
    },
    async select(table, columns, equals) {
      selects.push({ table, columns, equals });
      return { data: (tables[table] ?? []).filter((row) => Object.entries(equals ?? {}).every(([column, value]) => row[column] === value)), error: selectError };
    },
    async deleteById(table, id) {
      deleted.push([table, id]);
      return { error: deleteError };
    },
  };
  return { db, calls, deleted, tables, selects, failSelect: (error: DbError) => void (selectError = error), failDelete: (error: DbError) => void (deleteError = error) };
}

const CLAIMED_AT = '2026-10-28T10:00:00.123456+00:00';
const TAKEN = { retry_at: null, claimed_at: CLAIMED_AT };

describe('createQueryGate', () => {
  const claim = (fake: ReturnType<typeof createFakeDb>) => createQueryGate(fake.db).claim({ athleteId: ATHLETE, userId: USER, provider: PROVIDER, intervalMs: QUERY_INTERVAL_MS });

  it('translates a claim taken to allowed, with the instant exactly as the database wrote it (microseconds included)', async () => {
    expect(await claim(createFakeDb([{ data: TAKEN }]))).toEqual({ status: 'allowed', claimedAt: CLAIMED_AT });
  });

  it('accepts the answer as a one-element list too', async () => {
    expect(await claim(createFakeDb([{ data: [TAKEN] }]))).toEqual({ status: 'allowed', claimedAt: CLAIMED_AT });
  });

  it('translates a retry instant to rate_limited with when to retry, as ISO 8601', async () => {
    expect(await claim(createFakeDb([{ data: { retry_at: '2026-10-28T10:10:00+00:00', claimed_at: null } }]))).toEqual({
      status: 'rate_limited',
      retryAt: '2026-10-28T10:10:00.000Z',
    });
  });

  it('translates 42501 to not_authorized', async () => {
    expect(await claim(createFakeDb([{ error: { code: '42501' } }]))).toEqual({ status: 'not_authorized' });
  });

  it('throws on any other error, with only the Postgres code', async () => {
    await expect(claim(createFakeDb([{ error: { code: 'XX000', message: `leaked ${NUMBER}` } }]))).rejects.toThrow('Claiming the source query failed (XX000)');
    await expect(claim(createFakeDb([{ error: { code: 'XX000', message: `leaked ${NUMBER}` } }]))).rejects.not.toThrow(NUMBER);
  });

  it.each([
    ['nothing', null],
    ['a bare timestamp', '2026-10-28T10:10:00+00:00'],
    ['neither instant', { retry_at: null, claimed_at: null }],
    ['an empty claimed instant', { retry_at: null, claimed_at: '' }],
    ['an invalid retry instant', { retry_at: 'tomorrow', claimed_at: null }],
  ])('throws when the answer is %s', async (_name, data) => {
    await expect(claim(createFakeDb([{ data }]))).rejects.toThrow('Claiming the source query failed');
  });

  it('sends the athlete, the provider, the user and the interval as bound parameters', async () => {
    const fake = createFakeDb([{ data: TAKEN }]);
    await claim(fake);
    expect(fake.calls).toEqual([
      { fn: 'results_import_claim_query', args: { athlete: ATHLETE, provider: PROVIDER, requested_by: USER, min_interval: `${QUERY_INTERVAL_MS / 1000} seconds` } },
    ]);
  });
});

describe('createQueryGate with a search time to live', () => {
  const claim = (fake: ReturnType<typeof createFakeDb>) =>
    createQueryGate(fake.db).claim({ athleteId: ATHLETE, userId: USER, provider: PROVIDER, intervalMs: QUERY_INTERVAL_MS, searchTtlMs: CANDIDATE_TTL_MS });

  it('calls results_import_claim_results_query with the interval and the time to live as bound parameters', async () => {
    const fake = createFakeDb([{ data: TAKEN }]);
    await claim(fake);
    expect(fake.calls).toEqual([
      {
        fn: 'results_import_claim_results_query',
        args: { athlete: ATHLETE, provider: PROVIDER, requested_by: USER, min_interval: '60 seconds', search_ttl: '900 seconds' },
      },
    ]);
  });

  it('translates a taken claim to allowed, a retry instant to rate_limited and 42501 to not_authorized', async () => {
    expect(await claim(createFakeDb([{ data: TAKEN }]))).toEqual({ status: 'allowed', claimedAt: CLAIMED_AT });
    expect(await claim(createFakeDb([{ data: { retry_at: '2026-10-28T10:10:00+00:00', claimed_at: null } }]))).toEqual({ status: 'rate_limited', retryAt: '2026-10-28T10:10:00.000Z' });
    expect(await claim(createFakeDb([{ error: { code: '42501' } }]))).toEqual({ status: 'not_authorized' });
  });

  it('throws on any other error', async () => {
    await expect(claim(createFakeDb([{ error: { code: '22023' } }]))).rejects.toThrow('Claiming the source query failed (22023)');
  });
});

describe('createQueryGate release', () => {
  const release = (fake: ReturnType<typeof createFakeDb>) =>
    createQueryGate(fake.db).release({ athleteId: ATHLETE, provider: PROVIDER, claimedAt: CLAIMED_AT, intervalMs: QUERY_INTERVAL_MS, retryAfterMs: RETRY_AFTER_FAILURE_MS });

  it('calls results_import_release_claim with the provider, the claim exactly as received and the durations as bound parameters', async () => {
    const fake = createFakeDb([{ data: true }]);
    await release(fake);
    expect(fake.calls).toEqual([
      { fn: 'results_import_release_claim', args: { athlete: ATHLETE, provider: PROVIDER, claimed_at: CLAIMED_AT, min_interval: '60 seconds', retry_after: '60 seconds' } },
    ]);
  });

  it('answers whether the claim was released', async () => {
    expect(await release(createFakeDb([{ data: true }]))).toBe(true);
    expect(await release(createFakeDb([{ data: false }]))).toBe(false);
  });

  it('throws with only the Postgres code on an error', async () => {
    await expect(release(createFakeDb([{ error: { code: '22023', message: `leaked ${NUMBER}` } }]))).rejects.toThrow('Releasing the source query failed (22023)');
    await expect(release(createFakeDb([{ error: { code: '22023', message: `leaked ${NUMBER}` } }]))).rejects.not.toThrow(NUMBER);
  });

  it('throws when the answer is not a boolean', async () => {
    await expect(release(createFakeDb([{ data: 'yes' }]))).rejects.toThrow('Releasing the source query failed');
    await expect(release(createFakeDb([{ data: null }]))).rejects.toThrow('Releasing the source query failed');
  });
});

describe('createIdentityNumbers', () => {
  it('reads the number with athlete_identity_number', async () => {
    const fake = createFakeDb([{ data: NUMBER }]);
    expect(await createIdentityNumbers(fake.db).read(ATHLETE)).toBe(NUMBER);
    expect(fake.calls).toEqual([{ fn: 'athlete_identity_number', args: { athlete_id: ATHLETE } }]);
  });

  it('reads null when there is no number', async () => {
    expect(await createIdentityNumbers(createFakeDb([{ data: null }]).db).read(ATHLETE)).toBeNull();
  });

  it('keeps with the one-step function and the number as a bound parameter, and answers whether it was kept', async () => {
    const fake = createFakeDb([{ data: true }, { data: false }]);
    expect(await createIdentityNumbers(fake.db).keep(ATHLETE, NUMBER)).toBe(true);
    expect(await createIdentityNumbers(fake.db).keep(ATHLETE, NUMBER)).toBe(false);
    expect(fake.calls[0]).toEqual({ fn: 'results_import_keep_identity_number', args: { athlete: ATHLETE, identity_number: NUMBER } });
  });

  it('tells a key that is not a number, and a withdrawn authorization, from any other failure', async () => {
    await expect(createIdentityNumbers(createFakeDb([{ error: { code: '22023' } }]).db).keep(ATHLETE, NUMBER)).rejects.toBeInstanceOf(InvalidSourceKeyError);
    await expect(createIdentityNumbers(createFakeDb([{ error: { code: '55000' } }]).db).keep(ATHLETE, NUMBER)).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(createIdentityNumbers(createFakeDb([{ data: 'yes' }]).db).keep(ATHLETE, NUMBER)).rejects.toThrow('Keeping the identity number failed');
  });

  it('never puts the number in an error', async () => {
    const saving = createIdentityNumbers(createFakeDb([{ error: { code: '23514', message: `bad ${NUMBER}` } }]).db).keep(ATHLETE, NUMBER);
    await expect(saving).rejects.toThrow('Keeping the identity number failed (23514)');
    await saving.catch((error: Error) => expect(error.message).not.toContain(NUMBER));
    const reading = createIdentityNumbers(createFakeDb([{ error: { code: 'XX000', message: NUMBER } }]).db).read(ATHLETE);
    await expect(reading).rejects.toThrow('Reading the identity number failed (XX000)');
  });

  it('refuses a non-text answer to the read', async () => {
    await expect(createIdentityNumbers(createFakeDb([{ data: 5 }]).db).read(ATHLETE)).rejects.toThrow('Reading the identity number failed');
  });
});

describe('createConfirmations', () => {
  const evidence = { name: 'Ana Example', affiliations: [{ club: 'Synthetic Club', league: null, years: [2026] }], resultCount: 3 };
  const input = { athleteId: ATHLETE, organizationId: 'org-1', userId: USER, evidence };

  it('records with the function and returns the id of the evidence', async () => {
    const fake = createFakeDb([{ data: 'evidence-1' }]);
    expect(await createConfirmations(fake.db).record(input)).toBe('evidence-1');
    expect(fake.calls).toEqual([
      { fn: 'record_results_import_confirmation', args: { athlete: ATHLETE, organization: 'org-1', confirmed_by: USER, evidence } },
    ]);
  });

  it('translates 42501 to NotAuthorizedError', async () => {
    await expect(createConfirmations(createFakeDb([{ error: { code: '42501' } }]).db).record(input)).rejects.toBeInstanceOf(NotAuthorizedError);
  });

  it('throws on any other error with only the code', async () => {
    await expect(createConfirmations(createFakeDb([{ error: { code: '22023' } }]).db).record(input)).rejects.toThrow('Recording the confirmation failed (22023)');
  });

  it('removes evidence by id', async () => {
    const fake = createFakeDb();
    await createConfirmations(fake.db).remove('evidence-1');
    expect(fake.deleted).toEqual([['results_import_confirmations', 'evidence-1']]);
  });

  it('throws when the removal fails', async () => {
    const fake = createFakeDb();
    fake.failDelete({ code: 'XX000' });
    await expect(createConfirmations(fake.db).remove('evidence-1')).rejects.toThrow('Removing the confirmation failed (XX000)');
  });
});

describe('createOrganizationChain', () => {
  it('joins organizations with the provider of their results source', async () => {
    const fake = createFakeDb();
    fake.tables.organizations = [
      { id: 'fed', type: 'federation', country_code: 'ZZ', parent_organization_id: null },
      { id: 'club', type: 'club', country_code: null, parent_organization_id: 'fed' },
    ];
    fake.tables.results_import_sources = [{ organization_id: 'fed', provider: 'zz-test' }];
    expect(await createOrganizationChain(fake.db)('club')).toEqual([
      { id: 'fed', type: 'federation', countryCode: 'ZZ', parentId: null, provider: 'zz-test' },
      { id: 'club', type: 'club', countryCode: null, parentId: 'fed', provider: null },
    ]);
  });
});

describe('createPendingStore', () => {
  const entry = {
    kind: 'search' as const,
    userId: USER,
    athleteId: ATHLETE,
    organizationId: 'org-1',
    provider: 'zz-test',
    reference: 'REF-SECRET-1',
    payload: { name: 'Ana Example', affiliations: [], resultCount: 2 },
  };

  it('puts with the function, the reference and the lifetime as bound parameters, and answers the id', async () => {
    const fake = createFakeDb([{ data: 'pending-1' }]);
    expect(await createPendingStore(fake.db).put({ ...entry, ttlMs: 900_000 })).toBe('pending-1');
    expect(fake.calls).toEqual([
      {
        fn: 'results_import_pending_put',
        args: { kind: 'search', requested_by: USER, athlete: ATHLETE, organization: 'org-1', provider: 'zz-test', reference: 'REF-SECRET-1', payload: entry.payload, ttl: '900 seconds', pending_id: null, restore_until: null },
      },
    ]);
  });

  it('puts back under an old id', async () => {
    const fake = createFakeDb([{ data: 'pending-1' }]);
    await createPendingStore(fake.db).put({ ...entry, ttlMs: 1500, id: 'pending-1', restoreUntil: Date.parse('2026-10-29T10:15:00Z') });
    expect(fake.calls[0].args).toMatchObject({ pending_id: 'pending-1', ttl: '1.5 seconds', restore_until: '2026-10-29T10:15:00.000Z' });
  });

  it('translates 42501 on put to NotAuthorizedError, and any other error to one with only the code', async () => {
    await expect(createPendingStore(createFakeDb([{ error: { code: '42501' } }]).db).put({ ...entry, ttlMs: 1000 })).rejects.toBeInstanceOf(NotAuthorizedError);
    const failing = createPendingStore(createFakeDb([{ error: { code: 'TS001', message: 'REF-SECRET-1' } }]).db).put({ ...entry, ttlMs: 1000 });
    await expect(failing).rejects.toThrow('Storing the pending entry failed (TS001)');
    await failing.catch((error: Error) => expect(error.message).not.toContain('REF-SECRET'));
  });

  it('takes the row, with when it expires', async () => {
    const fake = createFakeDb([
      { data: [{ organization_id: 'org-1', provider: 'zz-test', reference: 'REF-SECRET-1', payload: entry.payload, expires_at: '2026-10-29T10:15:00+00:00' }] },
    ]);
    expect(await createPendingStore(fake.db).take({ id: 'pending-1', kind: 'search', userId: USER, athleteId: ATHLETE })).toEqual({
      ...entry,
      expiresAt: Date.parse('2026-10-29T10:15:00Z'),
    });
    expect(fake.calls).toEqual([{ fn: 'results_import_pending_take', args: { pending: 'pending-1', kind: 'search', requested_by: USER, athlete: ATHLETE } }]);
  });

  it('answers null when there is no row', async () => {
    const take = (fake: ReturnType<typeof createFakeDb>) => createPendingStore(fake.db).take({ id: 'x', kind: 'search', userId: USER, athleteId: ATHLETE });
    expect(await take(createFakeDb([{ data: [] }]))).toBeNull();
    expect(await take(createFakeDb([{ data: null }]))).toBeNull();
  });

  it('throws on an error or a row of the wrong shape, with only the code', async () => {
    const take = (fake: ReturnType<typeof createFakeDb>) => createPendingStore(fake.db).take({ id: 'x', kind: 'search', userId: USER, athleteId: ATHLETE });
    await expect(take(createFakeDb([{ error: { code: 'TS001' } }]))).rejects.toThrow('Taking the pending entry failed (TS001)');
    await expect(take(createFakeDb([{ data: [{ organization_id: 'org-1' }] }]))).rejects.toThrow('Taking the pending entry failed');
  });
});

describe('createAccess', () => {
  it('asks results_import_access with the user and the athlete as bound arguments', async () => {
    const fake = createFakeDb([{ data: true }]);
    expect(await createAccess(fake.db).allowed({ userId: USER, athleteId: ATHLETE })).toBe(true);
    expect(fake.calls).toEqual([{ fn: 'results_import_access', args: { athlete: ATHLETE, requested_by: USER } }]);
  });

  it('is false when the function answers false', async () => {
    expect(await createAccess(createFakeDb([{ data: false }]).db).allowed({ userId: USER, athleteId: ATHLETE })).toBe(false);
  });

  it('throws, never allows, on an error or an answer that is not a boolean', async () => {
    await expect(createAccess(createFakeDb([{ error: { code: 'XX000', message: NUMBER } }]).db).allowed({ userId: USER, athleteId: ATHLETE })).rejects.toThrow('(XX000)');
    await expect(createAccess(createFakeDb([{ data: 'true' }]).db).allowed({ userId: USER, athleteId: ATHLETE })).rejects.toThrow();
  });
});

describe('createConfirmationReader', () => {
  const row = { organization_id: 'org-1', confirmed_at: '2026-10-28T10:00:00+00:00', candidate_name: 'Synthetic Swimmer' };

  it('reads the newest confirmation of the athlete, of the federation when no organization is asked for', async () => {
    const fake = createFakeDb([{ data: [row] }]);
    expect(await createConfirmationReader(fake.db).latest(ATHLETE, null)).toEqual({ organizationId: 'org-1', confirmedAt: '2026-10-28T10:00:00.000Z', candidateName: 'Synthetic Swimmer' });
    expect(fake.calls).toEqual([{ fn: 'results_import_latest_confirmation', args: { athlete: ATHLETE, organization: null } }]);
  });

  it('reads the newest confirmation of the organization asked for', async () => {
    const fake = createFakeDb([{ data: [row] }]);
    await createConfirmationReader(fake.db).latest(ATHLETE, 'org-1');
    expect(fake.calls).toEqual([{ fn: 'results_import_latest_confirmation', args: { athlete: ATHLETE, organization: 'org-1' } }]);
  });

  it('is null when the athlete was never confirmed', async () => {
    expect(await createConfirmationReader(createFakeDb([{ data: [] }]).db).latest(ATHLETE, null)).toBeNull();
  });

  it('throws on an error or a row it does not understand', async () => {
    await expect(createConfirmationReader(createFakeDb([{ error: { code: 'XX000' } }]).db).latest(ATHLETE, null)).rejects.toThrow('(XX000)');
    await expect(createConfirmationReader(createFakeDb([{ data: [{ organization_id: 1 }] }]).db).latest(ATHLETE, null)).rejects.toThrow();
  });
});

describe('createImportRecorder', () => {
  const input = { athleteId: ATHLETE, organizationId: 'org-1', requestedBy: USER, results: [] };

  it('records through record_imported_results and returns the summary', async () => {
    const fake = createFakeDb([{ data: { importId: 'i1', inserted: 2, duplicates: 1, changes: 1 } }]);
    expect(await createImportRecorder(fake.db).record(input)).toEqual({ importId: 'i1', inserted: 2, duplicates: 1, changes: 1 });
    expect(fake.calls).toEqual([{ fn: 'record_imported_results', args: { athlete: ATHLETE, organization: 'org-1', requested_by: USER, results: [] } }]);
  });

  it('turns 42501 (access lost) into NotAuthorizedError', async () => {
    await expect(createImportRecorder(createFakeDb([{ error: { code: '42501', message: NUMBER } }]).db).record(input)).rejects.toBeInstanceOf(NotAuthorizedError);
  });

  it('throws, repeating nothing of the message, when the database fails or answers something else', async () => {
    await expect(createImportRecorder(createFakeDb([{ error: { code: 'XX000', message: NUMBER } }]).db).record(input)).rejects.toThrow('Recording the imported results failed (XX000)');
    await expect(createImportRecorder(createFakeDb([{ data: { importId: 'i1' } }]).db).record(input)).rejects.toThrow();
  });
});

describe('createTournamentCatalog', () => {
  const ORGANIZATION = 'platform-1';
  const interval = { organizationId: ORGANIZATION, intervalMs: TOURNAMENT_REFRESH_INTERVAL_MS };

  it('claims by platform and interval, and answers the instant it took exactly as the database wrote it', async () => {
    const fake = createFakeDb([{ data: TAKEN }]);
    expect(await createTournamentCatalog(fake.db).claim(interval)).toEqual({ status: 'allowed', claimedAt: CLAIMED_AT });
    expect(fake.calls).toEqual([{ fn: 'results_import_claim_tournament_refresh', args: { organization: ORGANIZATION, min_interval: '86400 seconds' } }]);
  });

  it('accepts the answer as a one-element list, and translates a retry instant to fresh, as ISO 8601', async () => {
    expect(await createTournamentCatalog(createFakeDb([{ data: [TAKEN] }]).db).claim(interval)).toEqual({ status: 'allowed', claimedAt: CLAIMED_AT });
    expect(await createTournamentCatalog(createFakeDb([{ data: { retry_at: '2026-10-29T10:00:00+00:00', claimed_at: null } }]).db).claim(interval)).toEqual({
      status: 'fresh',
      retryAt: '2026-10-29T10:00:00.000Z',
    });
  });

  it('throws on an error or an answer it does not know, with only the Postgres code', async () => {
    await expect(createTournamentCatalog(createFakeDb([{ error: { code: '23514', message: 'leaked message' } }]).db).claim(interval)).rejects.toThrow('Claiming the tournament refresh failed (23514)');
    await expect(createTournamentCatalog(createFakeDb([{ data: { retry_at: 'never', claimed_at: null } }]).db).claim(interval)).rejects.toThrow('Claiming the tournament refresh failed');
    await expect(createTournamentCatalog(createFakeDb([{ data: null }]).db).claim(interval)).rejects.toThrow('Claiming the tournament refresh failed');
  });

  it('releases with the instant of the claim and the waits, and answers whether it gave the claim back', async () => {
    const fake = createFakeDb([{ data: true }, { data: false }]);
    const catalog = createTournamentCatalog(fake.db);
    const request = { ...interval, claimedAt: CLAIMED_AT, retryAfterMs: RETRY_AFTER_FAILURE_MS };
    expect(await catalog.release(request)).toBe(true);
    expect(await catalog.release(request)).toBe(false);
    expect(fake.calls[0]).toEqual({
      fn: 'results_import_release_tournament_refresh',
      args: { organization: ORGANIZATION, claimed_at: CLAIMED_AT, min_interval: '86400 seconds', retry_after: '60 seconds' },
    });
    await expect(createTournamentCatalog(createFakeDb([{ data: 'yes' }]).db).release(request)).rejects.toThrow('Releasing the tournament refresh failed');
  });

  it('saves the tournaments with the names of the columns, and answers how many rows the database saved', async () => {
    const fake = createFakeDb([{ data: 2 }]);
    const entries = [tournamentEntry('20261010'), tournamentEntry('20261011', { name: 'Other Open' })];
    expect(await createTournamentCatalog(fake.db).save(ORGANIZATION, entries)).toBe(2);
    expect(fake.calls).toEqual([
      {
        fn: 'results_import_save_tournaments',
        args: {
          organization: ORGANIZATION,
          rows: entries.map((entry) => ({
            year: 2026,
            date_key: entry.dateKey,
            name: entry.name,
            city: 'Example City',
            discipline: 'SW',
            course: null,
            source_url: entry.sourceUrl,
          })),
        },
      },
    ]);
  });

  it('throws when the save fails or answers something else than a count, with only the Postgres code', async () => {
    await expect(createTournamentCatalog(createFakeDb([{ error: { code: '23514', message: 'leaked Synthetic Open' } }]).db).save(ORGANIZATION, [])).rejects.toThrow('Saving the tournaments failed (23514)');
    await expect(createTournamentCatalog(createFakeDb([{ data: null }]).db).save(ORGANIZATION, [])).rejects.toThrow('Saving the tournaments failed');
  });

  it('finds the platforms that hold a day by asking the table for exactly that key', async () => {
    const fake = createFakeDb();
    fake.tables.results_import_tournaments = [
      { organization_id: ORGANIZATION, year: 2026, date_key: '20261010', course: 'LCM' },
      { organization_id: 'platform-2', year: 2026, date_key: '20261011', course: null },
    ];
    expect(await createTournamentCatalog(fake.db).find('20261010')).toEqual([{ organizationId: ORGANIZATION, year: 2026, course: 'LCM' }]);
    expect(fake.selects).toEqual([{ table: 'results_import_tournaments', columns: 'organization_id,year,course', equals: { date_key: '20261010' } }]);
  });

  it('answers a day without a pool length as null, and refuses a length that is not a pool', async () => {
    const fake = createFakeDb();
    fake.tables.results_import_tournaments = [{ organization_id: ORGANIZATION, year: 2026, date_key: '20261010', course: null }];
    expect(await createTournamentCatalog(fake.db).find('20261010')).toEqual([{ organizationId: ORGANIZATION, year: 2026, course: null }]);
    fake.tables.results_import_tournaments = [{ organization_id: ORGANIZATION, year: 2026, date_key: '20261010', course: '25m' }];
    await expect(createTournamentCatalog(fake.db).find('20261010')).rejects.toThrow('Reading the tournaments failed');
  });

  it('sets the pool length through the RPC with bound arguments, and says whether it set one', async () => {
    const fake = createFakeDb([{ data: true }, { data: false }]);
    const catalog = createTournamentCatalog(fake.db);
    expect(await catalog.setCourse(ORGANIZATION, '20261010', 'SCM')).toBe(true);
    expect(await catalog.setCourse(ORGANIZATION, '20261010', 'LCM')).toBe(false);
    expect(fake.calls[0]).toEqual({ fn: 'results_import_set_tournament_course', args: { platform: ORGANIZATION, date_key: '20261010', course: 'SCM' } });
  });

  it('throws when setting the pool length fails or answers something else than a boolean, with only the Postgres code', async () => {
    await expect(createTournamentCatalog(createFakeDb([{ error: { code: '22023', message: 'leaked Synthetic Open' } }]).db).setCourse(ORGANIZATION, '20261010', 'SCM')).rejects.toThrow('Saving the tournament pool length failed (22023)');
    await expect(createTournamentCatalog(createFakeDb([{ data: 1 }]).db).setCourse(ORGANIZATION, '20261010', 'SCM')).rejects.toThrow('Saving the tournament pool length failed');
  });

  it('lists the days a platform holds in one year by asking the table for exactly that platform and year', async () => {
    const fake = createFakeDb();
    fake.tables.results_import_tournaments = [
      { organization_id: ORGANIZATION, year: 2026, date_key: '20261010' },
      { organization_id: ORGANIZATION, year: 2025, date_key: '20251011' },
      { organization_id: 'platform-2', year: 2026, date_key: '20261012' },
    ];
    expect(await createTournamentCatalog(fake.db).held(ORGANIZATION, 2026)).toEqual(['20261010']);
    expect(fake.selects).toEqual([{ table: 'results_import_tournaments', columns: 'date_key', equals: { organization_id: ORGANIZATION, year: 2026 } }]);
  });

  it('throws when the days held cannot be read or a row is not what it should be', async () => {
    const failing = createFakeDb();
    failing.failSelect({ code: 'XX000', message: 'leaked' });
    await expect(createTournamentCatalog(failing.db).held(ORGANIZATION, 2026)).rejects.toThrow('Reading the tournaments failed (XX000)');
    const odd = createFakeDb();
    odd.tables.results_import_tournaments = [{ organization_id: ORGANIZATION, year: 2026, date_key: 20261010 }];
    await expect(createTournamentCatalog(odd.db).held(ORGANIZATION, 2026)).rejects.toThrow('Reading the tournaments failed');
  });

  it('throws when the table cannot be read or a row is not what it should be', async () => {
    const failing = createFakeDb();
    failing.failSelect({ code: 'XX000', message: 'leaked' });
    await expect(createTournamentCatalog(failing.db).find('20261010')).rejects.toThrow('Reading the tournaments failed (XX000)');
    const odd = createFakeDb();
    odd.tables.results_import_tournaments = [{ organization_id: ORGANIZATION, year: '2026', date_key: '20261010' }];
    await expect(createTournamentCatalog(odd.db).find('20261010')).rejects.toThrow('Reading the tournaments failed');
  });
});

describe('createAthleteProfiles', () => {
  const profiles = (athletes: Record<string, unknown>[], details: Record<string, unknown>[]) => {
    const fake = createFakeDb();
    fake.tables.athletes = athletes;
    fake.tables.athlete_private_details = details;
    return { fake, read: createAthleteProfiles(fake.db).read(ATHLETE) };
  };

  it('reads the names and the birth date and gender of exactly that athlete, each as a bound filter', async () => {
    const { fake, read } = profiles(
      [{ id: ATHLETE, first_name: 'Ana', last_name: 'Perez' }, { id: 'other', first_name: 'Otra', last_name: 'Persona' }],
      [{ athlete_id: ATHLETE, birth_date: '2012-03-04', gender: 'F' }, { athlete_id: 'other', birth_date: '2011-01-01', gender: 'M' }],
    );
    expect(await read).toEqual({ firstName: 'Ana', lastName: 'Perez', birthDate: '2012-03-04', gender: 'F' });
    expect(fake.selects).toEqual([
      { table: 'athletes', columns: 'first_name,last_name', equals: { id: ATHLETE } },
      { table: 'athlete_private_details', columns: 'birth_date,gender', equals: { athlete_id: ATHLETE } },
    ]);
  });

  it('has no birth date and no gender when the details are missing, empty or not a gender', async () => {
    expect(await profiles([{ id: ATHLETE, first_name: 'Ana', last_name: 'Perez' }], []).read).toEqual({ firstName: 'Ana', lastName: 'Perez', birthDate: null, gender: null });
    expect(await profiles([{ id: ATHLETE, first_name: 'Ana', last_name: 'Perez' }], [{ athlete_id: ATHLETE, birth_date: null, gender: 'undisclosed' }]).read).toEqual({ firstName: 'Ana', lastName: 'Perez', birthDate: null, gender: null });
  });

  it('answers null for an athlete that does not exist, and throws with only the Postgres code when a read fails', async () => {
    expect(await profiles([], []).read).toBeNull();
    const fake = createFakeDb();
    fake.failSelect({ code: '42501', message: 'leaked Ana' });
    await expect(createAthleteProfiles(fake.db).read(ATHLETE)).rejects.toThrow('Reading the athlete failed (42501)');
  });
});
