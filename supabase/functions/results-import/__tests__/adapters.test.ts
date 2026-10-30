import { createAccess, createConfirmationReader, createConfirmations, createIdentityNumbers, createImportRecorder, createOrganizationChain, createPendingStore, createQueryGate, type Db, type DbError } from '../adapters.ts';
import { InvalidSourceKeyError, NotAuthorizedError, QUERY_INTERVAL_MS } from '../service.ts';

const ATHLETE = 'athlete-1';
const USER = 'user-1';
const NUMBER = '0000000000-synthetic';

type RpcCall = { fn: string; args: Record<string, unknown> };

// Answers each rpc with the queued reply, in order, and records the calls.
function createFakeDb(replies: { data?: unknown; error?: DbError | null }[] = []) {
  const calls: RpcCall[] = [];
  const deleted: [string, string][] = [];
  const tables: Record<string, Record<string, unknown>[]> = {};
  let deleteError: DbError | null = null;
  const db: Db = {
    async rpc(fn, args) {
      calls.push({ fn, args });
      const reply = replies.shift() ?? {};
      return { data: reply.data ?? null, error: reply.error ?? null };
    },
    async select(table) {
      return { data: tables[table] ?? [], error: null };
    },
    async deleteById(table, id) {
      deleted.push([table, id]);
      return { error: deleteError };
    },
  };
  return { db, calls, deleted, tables, failDelete: (error: DbError) => void (deleteError = error) };
}

describe('createQueryGate', () => {
  const claim = (fake: ReturnType<typeof createFakeDb>) => createQueryGate(fake.db).claim({ athleteId: ATHLETE, userId: USER, intervalMs: QUERY_INTERVAL_MS });

  it('translates null (the claim was taken) to allowed', async () => {
    expect(await claim(createFakeDb([{ data: null }]))).toEqual({ status: 'allowed' });
  });

  it('translates a timestamp to rate_limited with when to retry, as ISO 8601', async () => {
    const fake = createFakeDb([{ data: '2026-10-28T10:10:00+00:00' }]);
    expect(await claim(fake)).toEqual({ status: 'rate_limited', retryAt: '2026-10-28T10:10:00.000Z' });
  });

  it('translates 42501 to not_authorized', async () => {
    expect(await claim(createFakeDb([{ error: { code: '42501' } }]))).toEqual({ status: 'not_authorized' });
  });

  it('throws on any other error, and the error carries only the code', async () => {
    await expect(claim(createFakeDb([{ error: { code: 'XX000' } }]))).rejects.toThrow('Claiming the source query failed (XX000)');
  });

  it('throws on an answer that is neither null nor a timestamp', async () => {
    await expect(claim(createFakeDb([{ data: 'tomorrow' }]))).rejects.toThrow('Claiming the source query failed');
  });

  it('sends the athlete, the user and the interval as bound parameters', async () => {
    const fake = createFakeDb([{ data: null }]);
    await claim(fake);
    expect(fake.calls).toEqual([
      { fn: 'results_import_claim_query', args: { athlete: ATHLETE, requested_by: USER, min_interval: `${QUERY_INTERVAL_MS / 1000} seconds` } },
    ]);
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
  it('reads the newest confirmation of the athlete', async () => {
    const fake = createFakeDb([{ data: [{ organization_id: 'org-1', confirmed_at: '2026-10-28T10:00:00+00:00', candidate_name: 'Synthetic Swimmer' }] }]);
    expect(await createConfirmationReader(fake.db).latest(ATHLETE)).toEqual({ organizationId: 'org-1', confirmedAt: '2026-10-28T10:00:00.000Z', candidateName: 'Synthetic Swimmer' });
    expect(fake.calls).toEqual([{ fn: 'results_import_latest_confirmation', args: { athlete: ATHLETE } }]);
  });

  it('is null when the athlete was never confirmed', async () => {
    expect(await createConfirmationReader(createFakeDb([{ data: [] }]).db).latest(ATHLETE)).toBeNull();
  });

  it('throws on an error or a row it does not understand', async () => {
    await expect(createConfirmationReader(createFakeDb([{ error: { code: 'XX000' } }]).db).latest(ATHLETE)).rejects.toThrow('(XX000)');
    await expect(createConfirmationReader(createFakeDb([{ data: [{ organization_id: 1 }] }]).db).latest(ATHLETE)).rejects.toThrow();
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
