import { isDistance, isPool, isStroke } from '../../../src/core/sport/catalogs.ts';
import type { Affiliation, Candidate, NormalizedResult, ResultsProvider } from './port.ts';
import type { OrganizationData, ProviderRegistry } from './registry.ts';

// The worker's proposal, pending maintainer review: one source query per athlete every 10 minutes, search and refresh alike.
export const QUERY_INTERVAL_MS = 10 * 60 * 1000;

export type Claim = { status: 'allowed' } | { status: 'rate_limited'; retryAt: string } | { status: 'not_authorized' };

/**
 * Implemented by `public.results_import_claim_query(athlete, requested_by, min_interval)`, which atomically checks
 * that the user manages the athlete with `import_official_results` in force and keeps the time of the last source query per athlete.
 */
export interface QueryGate {
  claim(request: { athleteId: string; userId: string; intervalMs: number }): Promise<Claim>;
}

/**
 * Implemented by #799's service_role functions `public.athlete_identity_number(athlete_id)` and
 * `public.save_athlete_identity_number_as_service(athlete_id, identity_number)`. The number lives only in memory here.
 */
export interface IdentityNumbers {
  read(athleteId: string): Promise<string | null>;
  save(athleteId: string, identityNumber: string): Promise<void>;
}

/**
 * Implemented by `public.record_results_import_confirmation(athlete, organization, confirmed_by, evidence)`, which rejects (42501)
 * unless the user manages the athlete with `import_official_results` in force. The evidence never includes the source reference.
 */
export interface Confirmations {
  record(input: {
    athleteId: string;
    organizationId: string;
    userId: string;
    evidence: { name: string; affiliations: Affiliation[]; resultCount: number };
  }): Promise<void>;
}

export type ImportError =
  | { code: 'not_authorized' }
  | { code: 'rate_limited'; retryAt: string }
  | { code: 'no_provider' }
  | { code: 'unavailable' };

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: ImportError };

const fail = (error: ImportError): { ok: false; error: ImportError } => ({ ok: false, error });
const UNAVAILABLE = fail({ code: 'unavailable' });

type Record_ = Record<string, unknown>;
const isRecord = (value: unknown): value is Record_ => typeof value === 'object' && value !== null;
const isKey = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isTextOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string';

function isRealDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// Trust boundary: rebuild each item with only the declared fields, so anything else an adapter returns (an idNumber, a birthDate) is dropped.
function cleanResult(raw: unknown): NormalizedResult | null {
  if (!isRecord(raw)) return null;
  const { sourceResultKey, stroke, distance, pool, hundredths, swumOn, competition } = raw;
  if (!isKey(sourceResultKey) || !isStroke(stroke) || !isDistance(distance) || !isPool(pool)) return null;
  if (hundredths !== null && !(Number.isInteger(hundredths) && (hundredths as number) > 0)) return null;
  if (!isRealDate(swumOn) || !isTextOrNull(competition)) return null;
  return { sourceResultKey, stroke, distance, pool, hundredths: hundredths as number | null, swumOn, competition };
}

function cleanAffiliation(raw: unknown): Affiliation | null {
  if (!isRecord(raw)) return null;
  const { club, league, years } = raw;
  if (!isTextOrNull(club) || !isTextOrNull(league)) return null;
  if (!Array.isArray(years) || !years.every((year) => Number.isInteger(year))) return null;
  return { club, league, years: [...years] };
}

function cleanCandidate(raw: unknown): Candidate | null {
  if (!isRecord(raw)) return null;
  const { sourceAthleteKey, name, affiliations, resultCount } = raw;
  if (!isKey(sourceAthleteKey) || typeof name !== 'string' || !Array.isArray(affiliations)) return null;
  if (!Number.isInteger(resultCount) || (resultCount as number) < 0) return null;
  const clean = affiliations.map(cleanAffiliation);
  if (clean.some((affiliation) => affiliation === null)) return null;
  return { sourceAthleteKey, name, affiliations: clean as Affiliation[], resultCount: resultCount as number };
}

function cleanList<T>(raw: unknown, cleanItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(raw)) return null;
  const items = raw.map(cleanItem);
  return items.some((item) => item === null) ? null : (items as T[]);
}

type Dependencies = {
  registry: ProviderRegistry;
  gate: QueryGate;
  identityNumbers: IdentityNumbers;
  confirmations: Confirmations;
  organizationChain: (organizationId: string) => Promise<OrganizationData[]>;
};

type Who = { userId: string; athleteId: string; organizationId: string };

export function createResultsImport({ registry, gate, identityNumbers, confirmations, organizationChain }: Dependencies) {
  const providerFor = async (organizationId: string) => registry.resolve(await organizationChain(organizationId), organizationId);

  async function claim({ userId, athleteId }: Who): Promise<ImportError | null> {
    const result = await gate.claim({ athleteId, userId, intervalMs: QUERY_INTERVAL_MS });
    if (result.status === 'allowed') return null;
    return result.status === 'rate_limited' ? { code: 'rate_limited', retryAt: result.retryAt } : { code: 'not_authorized' };
  }

  // Any adapter failure is the same typed "unavailable"; the error is dropped on purpose so no number or key can leak through it.
  async function query<T>(call: () => Promise<unknown>, cleanItem: (item: unknown) => T | null): Promise<Outcome<T[]>> {
    try {
      const value = cleanList(await call(), cleanItem);
      return value === null ? UNAVAILABLE : { ok: true, value };
    } catch {
      return UNAVAILABLE;
    }
  }

  return {
    async findCandidates(who: Who & { firstName: string; lastName: string }): Promise<Outcome<Candidate[]>> {
      const provider: ResultsProvider | null = await providerFor(who.organizationId);
      if (!provider) return fail({ code: 'no_provider' });
      const denied = await claim(who);
      if (denied) return fail(denied);
      const identityNumber = await identityNumbers.read(who.athleteId);
      return query(() => provider.findCandidates({ firstName: who.firstName, lastName: who.lastName, identityNumber }), cleanCandidate);
    },

    async refreshResults(who: Who): Promise<Outcome<NormalizedResult[]>> {
      const provider = await providerFor(who.organizationId);
      if (!provider) return fail({ code: 'no_provider' });
      // Authorize first, so a caller who may not import learns nothing about whether a number exists.
      const denied = await claim(who);
      if (denied) return fail(denied);
      // Without a number the refresh is unavailable: never a hidden name search. The claim is already spent.
      const identityNumber = await identityNumbers.read(who.athleteId);
      if (identityNumber === null) return UNAVAILABLE;
      const outcome = await query(() => provider.fetchResults(identityNumber), cleanResult);
      // The result key syncs to the device: it must not carry the number.
      if (outcome.ok && outcome.value.some((result) => result.sourceResultKey.includes(identityNumber))) return UNAVAILABLE;
      return outcome;
    },

    // The guardian confirmed "Is this person?". The confirmation is recorded first because its function checks that the user
    // manages the athlete (#799's service_role save only checks consent); a rejection propagates and nothing is saved.
    async confirmCandidate({ userId, athleteId, organizationId, candidate }: Who & { candidate: Candidate }): Promise<Outcome<void>> {
      const { name, affiliations, resultCount } = candidate;
      await confirmations.record({ athleteId, organizationId, userId, evidence: { name, affiliations, resultCount } });
      await identityNumbers.save(athleteId, candidate.sourceAthleteKey);
      return { ok: true, value: undefined };
    },
  };
}
