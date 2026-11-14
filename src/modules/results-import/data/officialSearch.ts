import { supabase } from '../../../core/sync';
import type { FoundResult } from './officialResults';

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
  // A tournament has no federation to resolve the person: without a stored number and none typed, nothing is asked.
  | { code: 'identity_number_required' }
  | { code: 'offline' }
  | { code: 'unexpected' };

export type SearchOutcome<T> = { ok: true; value: T } | { ok: false; error: SearchFailure };

/** What the device sees of a person found in a tournament: only a name and a club, never a document or a birth date. */
export type TournamentCandidate = { id: string; name: string; club: string | null; resultCount: number };

/** A result the server offers once the tournament was confirmed; importing it is a separate call that names these ids. */
export type TournamentResult = FoundResult;

/**
 * A source of official results, from data: an `organizations` row that has a provider registered. A federation is searched by
 * person; a results platform is asked with the address of one tournament and dates each result by its session.
 */
export type ImportSource = {
  organizationId: string;
  name: string;
  kind: 'federation' | 'platform';
  /** The adapter registered for it, as stored on each imported result. */
  provider: string;
};

export interface OfficialSearchRepository {
  /** Online only. Looks for one athlete at the source; spends the server's rate limit. */
  search(input: { athleteId: string; organizationId: string; firstName: string; lastName: string }): Promise<SearchOutcome<SearchCandidate[]>>;
  /** Online only. Confirms "Is this person?" for a candidate id that `search` returned. */
  confirm(input: { athleteId: string; organizationId: string; candidateId: string }): Promise<SearchOutcome<void>>;
  /** Online only. Looks for the athlete in the tournament at this address; `null` when the athlete is not in it. Spends the platform's rate limit. */
  tournament(input: { athleteId: string; url: string; identityNumber?: string }): Promise<SearchOutcome<{ organizationId: string; candidate: TournamentCandidate | null }>>;
  /** Online only. Confirms "Is this person?" for a tournament candidate and returns the results the server now offers. Nothing is saved yet. */
  confirmTournament(input: { athleteId: string; organizationId: string; candidateId: string }): Promise<SearchOutcome<TournamentResult[]>>;
}

export interface ImportSourcesRepository {
  /** Online only. Empty when no federation has a provider registered. */
  list(): Promise<ImportSource[]>;
}

type FunctionsError = { name?: string; context?: { json(): Promise<unknown> } };
export type FunctionsClient = {
  functions: { invoke(name: string, options: { body: Record<string, unknown> }): Promise<{ data: unknown; error: FunctionsError | null }> };
};

const KNOWN_FAILURES = ['not_authorized', 'rate_limited', 'no_provider', 'unavailable', 'unknown_id', 'identity_number_conflict', 'identity_number_required'] as const;

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
    tournament: ({ athleteId, url, identityNumber }) =>
      call(client, { action: 'tournament', athleteId, url, ...(identityNumber ? { identityNumber } : {}) }, (value) => value as { organizationId: string; candidate: TournamentCandidate | null }),
    confirmTournament: ({ athleteId, organizationId, candidateId }) =>
      call(client, { action: 'confirm', athleteId, organizationId, candidateId }, (value) => (value as { results?: TournamentResult[] } | null)?.results ?? []),
  };
}

export function createSupabaseImportSourcesRepository(): ImportSourcesRepository {
  return {
    async list() {
      const { data, error } = await supabase.from('results_import_sources').select('organization_id, provider, organizations(name, type)').order('organization_id');
      if (error) throw new Error(`Reading the import sources failed (${error.code})`);
      return (data ?? []).flatMap((row) => {
        // PostgREST embeds the one related row as an object, or as a list of one.
        const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
        return organization?.name
          ? [{ organizationId: row.organization_id as string, name: organization.name as string, kind: organization.type === 'results_platform' ? ('platform' as const) : ('federation' as const), provider: row.provider as string }]
          : [];
      });
    },
  };
}

/** For tests and the gallery: a source of official results that answers with what it was given. */
export function createInMemoryOfficialSearchRepository(options: {
  candidates?: SearchCandidate[];
  searchFailure?: SearchFailure;
  confirmFailure?: SearchFailure;
  tournament?: { organizationId: string; candidate: TournamentCandidate | null };
  tournamentFailure?: SearchFailure;
  tournamentResults?: TournamentResult[];
  confirmTournamentFailure?: SearchFailure;
} = {}) {
  const searches: { athleteId: string; organizationId: string; firstName: string; lastName: string }[] = [];
  const confirmed: { athleteId: string; organizationId: string; candidateId: string }[] = [];
  const tournaments: { athleteId: string; url: string; identityNumber?: string }[] = [];
  const tournamentConfirmed: { athleteId: string; organizationId: string; candidateId: string }[] = [];
  return {
    searches,
    confirmed,
    tournaments,
    tournamentConfirmed,
    async search(input) {
      searches.push(input);
      return options.searchFailure ? { ok: false, error: options.searchFailure } : { ok: true, value: options.candidates ?? [] };
    },
    async confirm(input) {
      confirmed.push(input);
      return options.confirmFailure ? { ok: false, error: options.confirmFailure } : { ok: true, value: undefined };
    },
    async tournament(input) {
      tournaments.push(input);
      return options.tournamentFailure
        ? { ok: false, error: options.tournamentFailure }
        : { ok: true, value: options.tournament ?? { organizationId: 'org-platform', candidate: null } };
    },
    async confirmTournament(input) {
      tournamentConfirmed.push(input);
      return options.confirmTournamentFailure ? { ok: false, error: options.confirmTournamentFailure } : { ok: true, value: options.tournamentResults ?? [] };
    },
  } satisfies OfficialSearchRepository & { searches: unknown[]; confirmed: unknown[]; tournaments: unknown[]; tournamentConfirmed: unknown[] };
}
