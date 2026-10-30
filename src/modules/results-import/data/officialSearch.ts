import { supabase } from '../../../core/sync';

/** What the device sees of a person found at the source: an opaque id, never the source's own reference. */
export type SearchCandidate = {
  id: string;
  name: string;
  affiliations: { club: string | null; league: string | null; years: number[] }[];
  resultCount: number;
};

/** The server's typed errors (see supabase/functions/results-import/handler.ts), plus the two only the device can tell. */
export type SearchFailure =
  | { code: 'not_authorized' }
  | { code: 'rate_limited'; retryAt: string }
  | { code: 'no_provider' }
  | { code: 'unavailable' }
  | { code: 'unknown_id' }
  | { code: 'identity_number_conflict' }
  | { code: 'offline' }
  | { code: 'unexpected' };

export type SearchOutcome<T> = { ok: true; value: T } | { ok: false; error: SearchFailure };

/** A source of official results, from data: the federation (an `organizations` row) that has a provider registered. */
export type ImportSource = { organizationId: string; name: string };

export interface OfficialSearchRepository {
  /** Online only. Looks for one athlete at the source; spends the server's rate limit. */
  search(input: { athleteId: string; organizationId: string; firstName: string; lastName: string }): Promise<SearchOutcome<SearchCandidate[]>>;
  /** Online only. Confirms "Is this person?" for a candidate id that `search` returned. */
  confirm(input: { athleteId: string; organizationId: string; candidateId: string }): Promise<SearchOutcome<void>>;
}

export interface ImportSourcesRepository {
  /** Online only. Empty when no federation has a provider registered. */
  list(): Promise<ImportSource[]>;
}

type FunctionsError = { name?: string; context?: { json(): Promise<unknown> } };
export type FunctionsClient = {
  functions: { invoke(name: string, options: { body: Record<string, unknown> }): Promise<{ data: unknown; error: FunctionsError | null }> };
};

const KNOWN_FAILURES = ['not_authorized', 'rate_limited', 'no_provider', 'unavailable', 'unknown_id', 'identity_number_conflict'] as const;

// The body of a refusal is the server's `{ ok: false, error: { code, retryAt? } }`; anything else is unexpected.
function failureFrom(body: unknown): SearchFailure {
  const error = (body as { error?: { code?: unknown; retryAt?: unknown } } | null)?.error;
  const code = KNOWN_FAILURES.find((known) => known === error?.code);
  if (code === 'rate_limited') return typeof error?.retryAt === 'string' ? { code, retryAt: error.retryAt } : { code: 'unexpected' };
  return code ? { code } : { code: 'unexpected' };
}

async function call<T>(client: FunctionsClient, body: Record<string, unknown>, pick: (value: unknown) => T): Promise<SearchOutcome<T>> {
  const { data, error } = await client.functions.invoke('results-import', { body });
  if (error) {
    // A response with a refusal carries its body; no response at all is a connection that is not there.
    if (error.name === 'FunctionsHttpError' && error.context) return { ok: false, error: failureFrom(await error.context.json().catch(() => null)) };
    return { ok: false, error: { code: error.name === 'FunctionsFetchError' ? 'offline' : 'unexpected' } };
  }
  return { ok: true, value: pick((data as { value?: unknown } | null)?.value) };
}

export function createSupabaseOfficialSearchRepository(client: FunctionsClient = supabase): OfficialSearchRepository {
  return {
    search: ({ athleteId, organizationId, firstName, lastName }) =>
      call(client, { action: 'search', athleteId, organizationId, firstName, lastName }, (value) => (value as { candidates: SearchCandidate[] }).candidates),
    confirm: ({ athleteId, organizationId, candidateId }) =>
      call(client, { action: 'confirm', athleteId, organizationId, candidateId }, () => undefined),
  };
}

export function createSupabaseImportSourcesRepository(): ImportSourcesRepository {
  return {
    async list() {
      const { data, error } = await supabase.from('results_import_sources').select('organization_id, organizations(name)');
      if (error) throw new Error(`Reading the import sources failed (${error.code})`);
      return (data ?? []).flatMap((row) => {
        // PostgREST embeds the one related row as an object, or as a list of one.
        const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
        return organization?.name ? [{ organizationId: row.organization_id as string, name: organization.name as string }] : [];
      });
    },
  };
}

/** For tests and the gallery: a source of official results that answers with what it was given. */
export function createInMemoryOfficialSearchRepository(options: {
  candidates?: SearchCandidate[];
  searchFailure?: SearchFailure;
  confirmFailure?: SearchFailure;
} = {}) {
  const searches: { athleteId: string; organizationId: string; firstName: string; lastName: string }[] = [];
  const confirmed: { athleteId: string; organizationId: string; candidateId: string }[] = [];
  return {
    searches,
    confirmed,
    async search(input) {
      searches.push(input);
      return options.searchFailure ? { ok: false, error: options.searchFailure } : { ok: true, value: options.candidates ?? [] };
    },
    async confirm(input) {
      confirmed.push(input);
      return options.confirmFailure ? { ok: false, error: options.confirmFailure } : { ok: true, value: undefined };
    },
  } satisfies OfficialSearchRepository & { searches: unknown[]; confirmed: unknown[] };
}
