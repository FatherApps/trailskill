import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import type { Hundredths } from '../../../core/time';

/** One result as the server lists it, before the guardian imports it. The id is opaque and expires; no document or birth date reaches the app. */
export type FoundResult = {
  id: string;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  /** Null is a missing time, never 0. */
  hundredths: Hundredths | null;
  /** yyyy-mm-dd */
  swumOn: string;
  competition: string | null;
};

export type OfficialResultsError =
  | { code: 'not_authorized' }
  | { code: 'rate_limited'; retryAt: string }
  | { code: 'no_provider' }
  | { code: 'unavailable' }
  | { code: 'unknown_id' }
  | { code: 'not_confirmed' }
  | { code: 'identity_number_conflict' }
  | { code: 'bad_request' };

export type OfficialResultsOutcome<T> = { ok: true; value: T } | { ok: false; error: OfficialResultsError };

/** What the server knows about the guardian's answer to "¿Es esta persona?". It is not synced: the app asks. */
export type IdentityStatus = {
  confirmed: boolean;
  organizationId: string | null;
  confirmedAt: string | null;
  candidateName: string | null;
  hasNumber: boolean;
  lastThree: string | null;
};

export type ImportSummary = { importId: string; inserted: number; duplicates: number; changes: number };

/** The `results-import` Edge Function (contract of #81). The user comes from the JWT; the rate limit lives on the server. */
export interface OfficialResultsService {
  /** Neither asks the source nor spends the rate limit. */
  status(athleteId: string): Promise<OfficialResultsOutcome<IdentityStatus>>;
  /** Asks the source for this athlete only and imports nothing. Needs the identity confirmed. */
  results(athleteId: string): Promise<OfficialResultsOutcome<FoundResult[]>>;
  /** Imports exactly these listed results; the server skips duplicates and records a pending change when a value moved. */
  importChosen(athleteId: string, resultIds: string[]): Promise<OfficialResultsOutcome<ImportSummary>>;
}

/** Whether the guardian already answered "¿Es esta persona?" for the athlete. */
export interface IdentityConfirmation {
  isConfirmed(athleteId: string): Promise<boolean>;
}

export const unconfirmedIdentity: IdentityConfirmation = { isConfirmed: async () => false };

/** Offline or any failure is "not confirmed": the button stays hidden instead of guessing. */
export function createIdentityConfirmation(service: Pick<OfficialResultsService, 'status'>): IdentityConfirmation {
  return {
    async isConfirmed(athleteId) {
      try {
        const outcome = await service.status(athleteId);
        return outcome.ok && outcome.value.confirmed;
      } catch {
        return false;
      }
    },
  };
}

export type ChangeChoice = 'use_new' | 'keep_current';

/** Records the guardian's choice on a pending change (`public.resolve_imported_result_change`). Nothing changes without it. */
export interface PendingChangeResolver {
  resolve(changeId: string, choice: ChangeChoice): Promise<boolean>;
}
