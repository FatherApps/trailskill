import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import type { Hundredths } from '../../../core/time';

/** One result as the source reports it, before the guardian imports it. No document or birth date ever reaches the app. */
export type FoundResult = {
  sourceResultKey: string;
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
  | { code: 'unavailable' };

export type OfficialResultsOutcome<T> = { ok: true; value: T } | { ok: false; error: OfficialResultsError };

/**
 * What the screen needs from the server. The concrete client (HTTP handler of the Edge Function) is owned by #81;
 * this is the seam the app uses until it lands. The rate limit lives on the server.
 */
export interface OfficialResultsService {
  /** Asks the source for the results of this athlete only. Imports nothing. */
  refresh(athleteId: string): Promise<OfficialResultsOutcome<FoundResult[]>>;
  /** Imports exactly these results; the server skips duplicates and records a pending change when a value moved. */
  importChosen(athleteId: string, results: FoundResult[]): Promise<OfficialResultsOutcome<void>>;
}

/** Whether the guardian already answered "¿Es esta persona?" for the athlete. Defined by #81; until it lands nobody is confirmed. */
export interface IdentityConfirmation {
  isConfirmed(athleteId: string): Promise<boolean>;
}

export const unconfirmedIdentity: IdentityConfirmation = { isConfirmed: async () => false };

export type ChangeChoice = 'use_new' | 'keep_current';

/** Records the guardian's choice on a pending change (`public.resolve_imported_result_change`). Nothing changes without it. */
export interface PendingChangeResolver {
  resolve(changeId: string, choice: ChangeChoice): Promise<boolean>;
}
