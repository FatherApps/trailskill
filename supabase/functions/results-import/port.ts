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

export interface ResultsProvider {
  /** '<country>-<organization>', lower case, the organization's ISO country code first. */
  readonly key: string;
  findCandidates(query: CandidateQuery): Promise<Candidate[]>;
  fetchResults(sourceAthleteKey: string): Promise<NormalizedResult[]>;
}
