import { isDistance, isPool, isStroke } from '../../../src/core/sport/catalogs.ts';
import { keyHasNumber, normalizeNumber } from './identityNumber.ts';
import { SourceUnreachableError, type Affiliation, type Candidate, type NormalizedResult, type ResultsProvider, type TournamentSearch } from './port.ts';
import type { OrganizationData, ProviderRegistry } from './registry.ts';

// The worker's proposal, pending maintainer review: one source query per athlete and provider every 10 minutes, search and refresh alike.
// A results query right after a search the same user confirmed shares that search's claim (see `QueryGate`), so one
// search -> confirm -> results flow is one query.
export const QUERY_INTERVAL_MS = 10 * 60 * 1000;

// Short enough that a passing blip is retried within a minute, long enough that a source that is down is not hammered by repeated taps.
export const RETRY_AFTER_FAILURE_MS = 60 * 1000;

// `claimedAt` is the instant the database stored for the claim, an opaque token for `QueryGate.release`: never parse it.
export type Claim = { status: 'allowed'; claimedAt: string } | { status: 'rate_limited'; retryAt: string } | { status: 'not_authorized' };

/**
 * Implemented by `public.results_import_claim_query(athlete, provider, requested_by, min_interval)`, which atomically checks
 * that the user manages the athlete with `import_official_results` in force and keeps the time of the last source query per
 * athlete and provider: asking the platform never spends the federation's window.
 */
export interface QueryGate {
  claim(request: {
    athleteId: string;
    userId: string;
    /** The provider key of the source about to be asked. */
    provider: string;
    intervalMs: number;
    /**
     * When given, a results query of the same user inside this time after a search they confirmed uses that search's claim;
     * implemented by `public.results_import_claim_results_query`. Otherwise it is a normal claim.
     */
    searchTtlMs?: number;
  }): Promise<Claim>;
  /**
   * Gives back a claim whose source query failed, atomically and only if nobody claimed since: the next query is allowed
   * `retryAfterMs` after that claim instead of a whole interval, and the claim can no longer be shared. `false` when it no
   * longer matches. Implemented by `public.results_import_release_claim`.
   */
  release(request: { athleteId: string; provider: string; claimedAt: string; intervalMs: number; retryAfterMs: number }): Promise<boolean>;
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
  | { code: 'identity_number_conflict' }
  | { code: 'identity_number_required' };

/** What the device sees of a candidate: an opaque id, never the source's reference. */
export type PublicCandidate = { id: string; name: string; affiliations: Affiliation[]; resultCount: number };

/** A result offered after a platform confirmation: an opaque id and the values, never the source key. */
export type OfferedResult = Omit<NormalizedResult, 'sourceResultKey'> & { id: string };

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

// The platform's whole answer, rebuilt with only the declared fields: the athlete's name and club, and cleaned rows.
function cleanSearch(raw: unknown): TournamentSearch | null {
  if (!isRecord(raw)) return null;
  if (raw.found === false) return { found: false };
  if (raw.found !== true || !isRecord(raw.athlete)) return null;
  const { name, club } = raw.athlete;
  const results = cleanList(raw.results, cleanResult);
  return typeof name === 'string' && isTextOrNull(club) && results !== null ? { found: true, athlete: { name, club }, results } : null;
}

// Typed number against the stored one, as the sources compare them. One that does not normalize never matches.
function sameNumber(typed: string, stored: string): boolean {
  try {
    return normalizeNumber(typed) === normalizeNumber(stored);
  } catch {
    return false;
  }
}

type Dependencies = {
  registry: ProviderRegistry;
  gate: QueryGate;
  identityNumbers: IdentityNumbers;
  confirmations: Confirmations;
  /** Every organization with its provider key; the id is only a hint, because the registry walks the parents itself. */
  organizationChain: (organizationId?: string) => Promise<OrganizationData[]>;
  pending: PendingStore;
};

type Who = { userId: string; athleteId: string; organizationId: string };

export function createResultsImport({ registry, gate, identityNumbers, confirmations, organizationChain, pending, now = Date.now }: Dependencies & { now?: () => number }) {
  const providerFor = async (organizationId: string) => registry.resolve(await organizationChain(organizationId), organizationId);

  // Returns the claim taken or the reason it was refused. The window is the athlete's with this provider only.
  async function claim({ userId, athleteId }: Who, provider: string, searchTtlMs?: number): Promise<{ claimedAt: string } | { denied: ImportError }> {
    const result = await gate.claim({ athleteId, userId, provider, intervalMs: QUERY_INTERVAL_MS, ...(searchTtlMs === undefined ? {} : { searchTtlMs }) });
    if (result.status === 'allowed') return { claimedAt: result.claimedAt };
    return { denied: result.status === 'rate_limited' ? { code: 'rate_limited', retryAt: result.retryAt } : { code: 'not_authorized' } };
  }

  // Any adapter failure is the same typed "unavailable"; the error is dropped on purpose so no number or key can leak through it.
  // The adapter saying the source did not answer (`SourceUnreachableError`: network, timeout, 5xx) gives the claim back, so a
  // source that failed does not cost the whole window. So does a cleaner that throws on what the source sent (a failure on our
  // side, not an answer). Any other failure (the source answered something unusable: a 4xx, a changed page, an invalid list)
  // keeps it spent. A release that fails leaves the claim spent too.
  // `clean` takes the adapter's whole answer and returns the value rebuilt with only what the service declares, or null when it is invalid.
  async function query<T>(who: Who, provider: string, claimedAt: string, call: () => Promise<unknown>, clean: (raw: unknown) => T | null): Promise<Outcome<T>> {
    const giveBack = async () => {
      try {
        await gate.release({ athleteId: who.athleteId, provider, claimedAt, intervalMs: QUERY_INTERVAL_MS, retryAfterMs: RETRY_AFTER_FAILURE_MS });
      } catch {
        // The claim simply stays spent.
      }
    };
    let raw: unknown;
    try {
      raw = await call();
    } catch (error) {
      if (error instanceof SourceUnreachableError) await giveBack();
      return UNAVAILABLE;
    }
    let value: T | null;
    try {
      value = clean(raw);
    } catch {
      await giveBack();
      return UNAVAILABLE;
    }
    return value === null ? UNAVAILABLE : { ok: true, value };
  }

  return {
    async findCandidates(who: Who & { firstName: string; lastName: string }): Promise<Outcome<PublicCandidate[]>> {
      const provider: ResultsProvider | null = await providerFor(who.organizationId);
      if (!provider) return fail({ code: 'no_provider' });
      const claimed = await claim(who, provider.key);
      if ('denied' in claimed) return fail(claimed.denied);
      const identityNumber = await identityNumbers.read(who.athleteId);
      const outcome = await query(who, provider.key, claimed.claimedAt, () => provider.findCandidates({ firstName: who.firstName, lastName: who.lastName, identityNumber }), (raw) => cleanList(raw, cleanCandidate));
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
      // Right after a confirmed search this uses the search's claim instead of asking for a new one.
      const claimed = await claim(who, provider.key, CANDIDATE_TTL_MS);
      if ('denied' in claimed) return fail(claimed.denied);
      // Without a number the refresh is unavailable: never a hidden name search. The claim is already spent.
      const identityNumber = await identityNumbers.read(who.athleteId);
      if (identityNumber === null) return UNAVAILABLE;
      const outcome = await query(who, provider.key, claimed.claimedAt, () => provider.fetchResults(identityNumber), (raw) => cleanList(raw, cleanResult));
      // The result key syncs to the device: it must not carry the number (a segment of it, not just any substring of an id).
      if (outcome.ok && outcome.value.some((result) => keyHasNumber(result.sourceResultKey, identityNumber))) return UNAVAILABLE;
      return outcome;
    },

    // The person pasted a tournament address of a results platform. The address, not the organization chain, picks the platform and
    // its organization. The platform has its own window (`claim` is per provider), so asking it never spends the federation's.
    // The number is the stored one, else the typed one; a typed one that differs from the stored one is a conflict, found before
    // the platform is asked. Without either, the claim is already spent, as in `refreshResults`.
    async findInTournament({ userId, athleteId, url, identityNumber }: { userId: string; athleteId: string; url: string; identityNumber: string | null }): Promise<
      Outcome<{ organizationId: string; candidate: { id: string; name: string; club: string | null; resultCount: number } | null }>
    > {
      const resolved = registry.resolveUrl(await organizationChain(), url);
      if (!resolved) return fail({ code: 'no_provider' });
      const { provider, organizationId } = resolved;
      const who = { userId, athleteId, organizationId };
      const claimed = await claim(who, provider.key);
      if ('denied' in claimed) return fail(claimed.denied);
      const stored = await identityNumbers.read(athleteId);
      if (identityNumber !== null && stored !== null && !sameNumber(identityNumber, stored)) return fail({ code: 'identity_number_conflict' });
      const number = stored ?? identityNumber;
      if (number === null) return fail({ code: 'identity_number_required' });
      const outcome = await query(who, provider.key, claimed.claimedAt, () => provider.lookup(url, number), cleanSearch);
      if (!outcome.ok) return outcome;
      const search = outcome.value;
      if (!search.found) return { ok: true, value: { organizationId, candidate: null } };
      // The result key syncs to the device: it must not carry the number.
      if (search.results.some((result) => keyHasNumber(result.sourceResultKey, number))) return UNAVAILABLE;
      const { name, club } = search.athlete;
      const resultCount = search.results.length;
      try {
        // The number is the reference, encrypted on the server; the rows wait there too, behind the one id the device gets.
        const id = await pending.put({
          kind: 'search',
          userId,
          athleteId,
          organizationId,
          provider: provider.key,
          reference: number,
          payload: { name, affiliations: [{ club, league: null, years: [] }], resultCount, results: search.results },
          ttlMs: CANDIDATE_TTL_MS,
        });
        return { ok: true, value: { organizationId, candidate: { id, name, club, resultCount } } };
      } catch (error) {
        if (error instanceof NotAuthorizedError) return fail({ code: 'not_authorized' });
        throw error;
      }
    },

    // The guardian confirmed "Is this person?". The candidate comes from the server's pending store by its opaque id, never from the request.
    // The id is consumed by one atomic take, so it works once, only for the user and athlete it was issued to.
    // Authorization is enforced by `record` (42501), which does not spend the rate-limit claim the next results query needs.
    // Evidence and number are all or nothing: if the number cannot be kept, the evidence is removed again.
    // Any failure before the end puts the entry back with the time it had left, so a retry does not cost another source query.
    // A platform entry also carries the tournament rows: once confirmed they are offered behind opaque ids, as `results` does.
    async confirmCandidate({ userId, athleteId, organizationId, candidateId }: Who & { candidateId: string }): Promise<Outcome<{ results: OfferedResult[] } | undefined>> {
      const taken = await pending.take({ id: candidateId, kind: 'search', userId, athleteId });
      if (!taken) return fail({ code: 'unknown_id' });

      let confirmed = false;
      try {
        // The entry must belong to the organization asked for and to the provider that organization resolves to now:
        // a federation's, or the platform's when the organization is a results platform.
        if (taken.organizationId !== organizationId) return fail({ code: 'unknown_id' });
        const organizations = await organizationChain(organizationId);
        const provider = registry.resolve(organizations, organizationId) ?? registry.platformFor(organizations, organizationId);
        if (!provider) return fail({ code: 'no_provider' });
        if (taken.provider !== provider.key) return fail({ code: 'unknown_id' });

        const { name, affiliations, resultCount, results } = taken.payload as { name: string; affiliations: Affiliation[]; resultCount: number; results?: NormalizedResult[] };
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
        if (!results) return { ok: true, value: undefined };
        try {
          const offered = await Promise.all(
            results.map(async ({ sourceResultKey, ...values }) => {
              const id = await pending.put({ kind: 'results', userId, athleteId, organizationId, provider: provider.key, reference: sourceResultKey, payload: values, ttlMs: CANDIDATE_TTL_MS });
              return { id, ...values };
            }),
          );
          return { ok: true, value: { results: offered } };
        } catch {
          // The person is confirmed and the number kept, and the entry is spent; the rows were never offered, so they search the tournament again.
          return UNAVAILABLE;
        }
      } finally {
        // Only the failure path puts the entry back. If this fails too, the person searches again.
        const { expiresAt, ...entry } = taken;
        if (!confirmed && expiresAt > now()) await pending.put({ ...entry, ttlMs: expiresAt - now(), restoreUntil: expiresAt, id: candidateId }).catch(() => undefined);
      }
    },
  };
}
