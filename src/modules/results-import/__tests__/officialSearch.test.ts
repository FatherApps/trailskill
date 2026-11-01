import { supabase } from '../../../core/sync';
import {
  createInMemoryOfficialSearchRepository,
  createSupabaseImportSourcesRepository,
  createSupabaseOfficialSearchRepository,
  type FunctionsClient,
} from '../data/officialSearch';

jest.mock('../../../core/sync', () => ({ supabase: { from: jest.fn() } }));


const ids = { athleteId: 'athlete-1', organizationId: 'org-1' };
const candidate = { id: 'candidate-1', name: 'Ana Example', affiliations: [{ club: 'Synthetic Club', league: null, years: [2026] }], resultCount: 3 };

type Reply = { data?: unknown; error?: { name?: string; context?: { json(): Promise<unknown> } } | null };

function clientReplying(reply: Reply) {
  const calls: { name: string; body: unknown }[] = [];
  const client: FunctionsClient = {
    functions: {
      async invoke(name, { body }) {
        calls.push({ name, body });
        return { data: reply.data ?? null, error: reply.error ?? null };
      },
    },
  };
  return { client, calls };
}

const refusal = (body: unknown) => ({ error: { name: 'FunctionsHttpError', context: { json: async () => body } } });

describe('createSupabaseOfficialSearchRepository', () => {
  it('searches with the athlete, the organization and the name, and answers the candidates', async () => {
    const { client, calls } = clientReplying({ data: { ok: true, value: { candidates: [candidate] } } });
    const outcome = await createSupabaseOfficialSearchRepository(client).search({ ...ids, firstName: 'Ana', lastName: 'Example' });
    expect(outcome).toEqual({ ok: true, value: [candidate] });
    expect(calls).toEqual([{ name: 'results-import', body: { action: 'search', ...ids, firstName: 'Ana', lastName: 'Example' } }]);
  });

  it('confirms with the candidate id and nothing else about the candidate', async () => {
    const { client, calls } = clientReplying({ data: { ok: true, value: {} } });
    expect(await createSupabaseOfficialSearchRepository(client).confirm({ ...ids, candidateId: 'candidate-1' })).toEqual({ ok: true, value: undefined });
    expect(calls).toEqual([{ name: 'results-import', body: { action: 'confirm', ...ids, candidateId: 'candidate-1' } }]);
  });

  it.each([
    [{ code: 'not_authorized' }],
    [{ code: 'rate_limited', retryAt: '2026-10-28T10:10:00.000Z' }],
    [{ code: 'no_provider' }],
    [{ code: 'unavailable' }],
    [{ code: 'unknown_id' }],
    [{ code: 'identity_number_conflict' }],
  ])('keeps the typed refusal %j of the server', async (error) => {
    const { client } = clientReplying(refusal({ ok: false, error }));
    expect(await createSupabaseOfficialSearchRepository(client).search({ ...ids, firstName: 'Ana', lastName: 'Example' })).toEqual({ ok: false, error });
  });

  it.each([
    ['a rate limit without when to retry', { ok: false, error: { code: 'rate_limited' } }],
    ['a code it does not know', { ok: false, error: { code: 'internal' } }],
    ['a body without an error', { ok: true }],
  ])('treats %s as unexpected', async (_name, body) => {
    const { client } = clientReplying(refusal(body));
    expect(await createSupabaseOfficialSearchRepository(client).confirm({ ...ids, candidateId: 'c' })).toEqual({ ok: false, error: { code: 'unexpected' } });
  });

  it('treats a refusal whose body cannot be read as unexpected', async () => {
    const { client } = clientReplying({ error: { name: 'FunctionsHttpError', context: { json: async () => Promise.reject(new Error('not json')) } } });
    expect(await createSupabaseOfficialSearchRepository(client).confirm({ ...ids, candidateId: 'c' })).toEqual({ ok: false, error: { code: 'unexpected' } });
  });

  it('tells a missing connection from other failures', async () => {
    const offline = clientReplying({ error: { name: 'FunctionsFetchError' } }).client;
    const other = clientReplying({ error: { name: 'FunctionsRelayError' } }).client;
    expect(await createSupabaseOfficialSearchRepository(offline).confirm({ ...ids, candidateId: 'c' })).toEqual({ ok: false, error: { code: 'offline' } });
    expect(await createSupabaseOfficialSearchRepository(other).confirm({ ...ids, candidateId: 'c' })).toEqual({ ok: false, error: { code: 'unexpected' } });
  });
});

describe('createInMemoryOfficialSearchRepository', () => {
  it('records what it is asked and answers what it was given', async () => {
    const fake = createInMemoryOfficialSearchRepository({ candidates: [candidate] });
    expect(await fake.search({ ...ids, firstName: 'Ana', lastName: 'Example' })).toEqual({ ok: true, value: [candidate] });
    expect(await fake.confirm({ ...ids, candidateId: 'candidate-1' })).toEqual({ ok: true, value: undefined });
    expect(fake.searches).toHaveLength(1);
    expect(fake.confirmed).toEqual([{ ...ids, candidateId: 'candidate-1' }]);
  });

  it('can refuse', async () => {
    const fake = createInMemoryOfficialSearchRepository({ searchFailure: { code: 'unavailable' }, confirmFailure: { code: 'unknown_id' } });
    expect(await fake.search({ ...ids, firstName: 'A', lastName: 'B' })).toEqual({ ok: false, error: { code: 'unavailable' } });
    expect(await fake.confirm({ ...ids, candidateId: 'x' })).toEqual({ ok: false, error: { code: 'unknown_id' } });
  });
});

describe('createSupabaseImportSourcesRepository', () => {
  const answer = (result: { data: unknown; error: { code: string } | null }) =>
    (supabase.from as jest.Mock).mockReturnValue({ select: () => ({ order: async () => result }) });

  it('asks the sources in a fixed order, so the profile and the import route pick the same one', async () => {
    const order = jest.fn().mockResolvedValue({ data: [], error: null });
    (supabase.from as jest.Mock).mockReturnValue({ select: () => ({ order }) });
    await createSupabaseImportSourcesRepository().list();
    expect(order).toHaveBeenCalledWith('organization_id');
  });

  it('lists the federations that have a source, with the name from data', async () => {
    answer({
      data: [
        { organization_id: 'org-1', organizations: { name: 'Synthetic Federation' } },
        { organization_id: 'org-2', organizations: [{ name: 'Second Federation' }] },
        { organization_id: 'org-3', organizations: null },
      ],
      error: null,
    });
    expect(await createSupabaseImportSourcesRepository().list()).toEqual([
      { organizationId: 'org-1', name: 'Synthetic Federation' },
      { organizationId: 'org-2', name: 'Second Federation' },
    ]);
    expect(supabase.from).toHaveBeenCalledWith('results_import_sources');
  });

  it('lists nothing when there is no source', async () => {
    answer({ data: [], error: null });
    expect(await createSupabaseImportSourcesRepository().list()).toEqual([]);
  });

  it('throws on an error, with only its code', async () => {
    answer({ data: null, error: { code: '42501' } });
    await expect(createSupabaseImportSourcesRepository().list()).rejects.toThrow('Reading the import sources failed (42501)');
  });
});
