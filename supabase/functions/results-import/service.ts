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
 * `public.athlete_identity_number(athlete_id)` and `public.results_import_keep_identity_number(athlete, identity_number)`. The number lives only in memory here.
 * Implementations pass the number only as a bound RPC parameter, never interpolated into SQL text, so it does not reach a
 * statement or the Postgres log. `read` must only be called after the gate confirmed `import_official_results` is in force,
 * because #799's read does not re-check it.
 */
export interface IdentityNumbers {
  read(athleteId: string): Promise<string | null>;
  /**
   * Keeps the number the source returned, in one database step: saves it when the athlete has none, `true` when the stored one is
   * the same, `false` when it differs (nothing is replaced). Throws `InvalidSourceKeyError` when the source's key is not a valid
   * number and `NotAuthorizedError` when `import_official_results` is no longer in force.
   */
  keep(athleteId: string, identityNumber: string): Promise<boolean>;
}

/** The source returned a key that is not an identity number; retrying the same entry can never work. */
export class InvalidSourceKeyError extends Error {
  constructor() {
    super('The source returned an invalid key');
    this.name = 'InvalidSourceKeyError';
  }
}

/**
 * Implemented by `public.record_results_import_confirmation(athlete, organization, confirmed_by, evidence)`, which rejects (42501)
 * unless the user manages the athlete with `import_official_results` in force. The evidence never includes the source reference.
 */
export interface Confirmations {
  /** Returns the id of the evidence. Throws `NotAuthorizedError` when the function rejects with 42501. */
  record(input: {
    athleteId: string;
    organizationId: string;
    userId: string;
    evidence: { name: string; affiliations: Affiliation[]; resultCount: number };
  }): Promise<string>;
  /** Deletes evidence recorded a moment ago (service_role may delete); used to leave nothing behind when the number cannot be saved. */
  remove(id: string): Promise<void>;
}

/** What `Confirmations.record` throws when the user does not manage the athlete or `import_official_results` is not in force. */
export class NotAuthorizedError extends Error {
  constructor() {
    super('Results import not authorized');
    this.name = 'NotAuthorizedError';
  }
}

/** The evidence was recorded, the number could not be saved, and the evidence could not be removed. Needs a person to clean up. */
export class OrphanedConfirmationError extends Error {
  constructor() {
    super('Confirmation recorded without an identity number and could not be removed');
    this.name = 'OrphanedConfirmationError';
  }
}

// A candidate id is good for one confirmation within this time; the database allows nothing longer.
export const CANDIDATE_TTL_MS = 15 * 60 * 1000;

export type PendingKind = 'search' | 'results';
export type PendingEntry = {
  kind: PendingKind;
  userId: string;
  athleteId: string;
  organizationId: string;
  provider: string;
  /** The source's key. Encrypted at rest; never leaves the server. */
  reference: string;
  payload: Record<string, unknown>;
};

/**
 * Implemented by `public.results_import_pending_put` / `_take` (service_role): what the source found waits there, encrypted,
 * for at most 15 minutes, and one `take` consumes it. The device only ever holds the id.
 */
export interface PendingStore {
  /**
   * Returns the id. With `id`, puts back a taken entry so the device's id keeps working; `ttlMs` is the time it had left and
   * `restoreUntil` the absolute instant it was due to expire, which the database never exceeds, whatever the clocks say.
   */
  put(entry: PendingEntry & { ttlMs: number; id?: string; restoreUntil?: number }): Promise<string>;
  /** Atomic and single-use: null for an id that is expired, already taken, never issued, or of another kind, user or athlete. */
  take(request: { id: string; kind: PendingKind; userId: string; athleteId: string }): Promise<(PendingEntry & { expiresAt: number }) | null>;
}

export type ImportError =
  | { code: 'not_authorized' }
  | { code: 'rate_limited'; retryAt: string }
  | { code: 'no_provider' }
  | { code: 'unavailable' }
  | { code: 'unknown_id' }
  | { code: 'identity_number_conflict' };

/** What the device sees of a candidate: an opaque id, never the source's reference. */
export type PublicCandidate = { id: string; name: string; affiliations: Affiliation[]; resultCount: number };

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
  pending: PendingStore;
};

type Who = { userId: string; athleteId: string; organizationId: string };

export function createResultsImport({ registry, gate, identityNumbers, confirmations, organizationChain, pending, now = Date.now }: Dependencies & { now?: () => number }) {
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
    async findCandidates(who: Who & { firstName: string; lastName: string }): Promise<Outcome<PublicCandidate[]>> {
      const provider: ResultsProvider | null = await providerFor(who.organizationId);
      if (!provider) return fail({ code: 'no_provider' });
      const denied = await claim(who);
      if (denied) return fail(denied);
      const identityNumber = await identityNumbers.read(who.athleteId);
      const outcome = await query(() => provider.findCandidates({ firstName: who.firstName, lastName: who.lastName, identityNumber }), cleanCandidate);
      if (!outcome.ok) return outcome;
      const { userId, athleteId, organizationId } = who;
      const candidates: PublicCandidate[] = [];
      // The device gets the id of each pending entry; the source's key stays on the server, encrypted.
      for (const { sourceAthleteKey, name, affiliations, resultCount } of outcome.value) {
        try {
          const id = await pending.put({
            kind: 'search',
            userId,
            athleteId,
            organizationId,
            provider: provider.key,
            reference: sourceAthleteKey,
            payload: { name, affiliations, resultCount },
            ttlMs: CANDIDATE_TTL_MS,
          });
          candidates.push({ id, name, affiliations, resultCount });
        } catch (error) {
          if (error instanceof NotAuthorizedError) return fail({ code: 'not_authorized' });
          throw error;
        }
      }
      return { ok: true, value: candidates };
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

    // The guardian confirmed "Is this person?". The candidate comes from the server's pending store by its opaque id, never from the request.
    // The id is consumed by one atomic take, so it works once, only for the user and athlete it was issued to.
    // Authorization is enforced by `record` (42501), which does not spend the rate-limit claim the next results query needs.
    // Evidence and number are all or nothing: if the number cannot be kept, the evidence is removed again.
    // Any failure before the end puts the entry back with the time it had left, so a retry does not cost another source query.
    async confirmCandidate({ userId, athleteId, organizationId, candidateId }: Who & { candidateId: string }): Promise<Outcome<void>> {
      const taken = await pending.take({ id: candidateId, kind: 'search', userId, athleteId });
      if (!taken) return fail({ code: 'unknown_id' });

      let confirmed = false;
      try {
        // The entry must belong to the organization asked for and to the provider that organization resolves to now.
        if (taken.organizationId !== organizationId) return fail({ code: 'unknown_id' });
        const provider = await providerFor(organizationId);
        if (!provider) return fail({ code: 'no_provider' });
        if (taken.provider !== provider.key) return fail({ code: 'unknown_id' });

        const { name, affiliations, resultCount } = taken.payload as { name: string; affiliations: Affiliation[]; resultCount: number };
        let evidenceId: string;
        try {
          evidenceId = await confirmations.record({ athleteId, organizationId, userId, evidence: { name, affiliations, resultCount } });
        } catch (error) {
          if (error instanceof NotAuthorizedError) return fail({ code: 'not_authorized' });
          throw error;
        }

        const undo = async () => {
          try {
            await confirmations.remove(evidenceId);
          } catch {
            throw new OrphanedConfirmationError();
          }
        };
        try {
          // One database step: it saves a first number and never replaces another one, even when two confirmations race.
          if (!(await identityNumbers.keep(athleteId, taken.reference))) {
            await undo();
            return fail({ code: 'identity_number_conflict' });
          }
        } catch (error) {
          if (error instanceof OrphanedConfirmationError) throw error;
          await undo();
          if (error instanceof NotAuthorizedError) return fail({ code: 'not_authorized' });
          if (error instanceof InvalidSourceKeyError) {
            // The entry is spent: putting it back would only repeat the same failure until it expires.
            confirmed = true;
            return fail({ code: 'unavailable' });
          }
          throw error;
        }
        confirmed = true;
        return { ok: true, value: undefined };
      } finally {
        // Only the failure path puts the entry back. If this fails too, the person searches again.
        const { expiresAt, ...entry } = taken;
        if (!confirmed && expiresAt > now()) await pending.put({ ...entry, ttlMs: expiresAt - now(), restoreUntil: expiresAt, id: candidateId }).catch(() => undefined);
      }
    },
  };
}
