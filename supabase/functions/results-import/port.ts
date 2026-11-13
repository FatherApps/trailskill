import type { DistanceCode, PoolCode, StrokeCode } from '../../../src/core/sport/catalogs.ts';

// This and nothing more is what an adapter returns: never an identity document or a birth date.
export type NormalizedResult = {
  sourceResultKey: string;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  /** Null is a missing time, never 0. */
  hundredths: number | null;
  /** yyyy-mm-dd */
  swumOn: string;
  competition: string | null;
};

/** With an identity number the adapter searches by number; without it, by name, and returns candidates only. */
export type CandidateQuery = { firstName: string; lastName: string; identityNumber: string | null };

export type Affiliation = { club: string | null; league: string | null; years: number[] };

// sourceAthleteKey is the source's reference, treated as an identity number: server-side only,
// never stored by results-import, never sent to the device or logged.
export type Candidate = { sourceAthleteKey: string; name: string; affiliations: Affiliation[]; resultCount: number };

/** What an adapter throws when the source fails or changes shape. */
export class ProviderUnavailableError extends Error {
  constructor(message = 'Results provider unavailable') {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

/** The source did not answer: network failure, timeout or HTTP 5xx. Retrying soon may work; any other `ProviderUnavailableError` will not. */
export class SourceUnreachableError extends ProviderUnavailableError {
  constructor() {
    super('Results source unreachable');
    this.name = 'SourceUnreachableError';
  }
}

export interface ResultsProvider {
  /** '<country>-<organization>', lower case, the organization's ISO country code first. */
  readonly key: string;
  findCandidates(query: CandidateQuery): Promise<Candidate[]>;
  fetchResults(sourceAthleteKey: string): Promise<NormalizedResult[]>;
}

/** What a tournament lookup finds for one identity number: the athlete's name and club, and that athlete's rows. Never the number or a birth date. */
export type TournamentSearch = { found: false } | { found: true; athlete: { name: string; club: string | null }; results: NormalizedResult[] };

/** A results platform: the person pastes the address of one tournament and the adapter reads that tournament only, by identity number. */
export interface TournamentProvider {
  /** '<country>-<platform>', lower case, the organization's ISO country code first. */
  readonly key: string;
  /** Whether this adapter handles the address. It never throws. */
  accepts(url: string): boolean;
  lookup(url: string, identityNumber: string): Promise<TournamentSearch>;
}
