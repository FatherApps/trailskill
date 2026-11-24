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

/** The source answered that the tournament has no results file (yet). Not a failure of the source: the same ask answers the same until the file is published. */
export class NoFileError extends ProviderUnavailableError {
  constructor() {
    super('The tournament has no published results file');
    this.name = 'NoFileError';
  }
}

export interface ResultsProvider {
  /** '<country>-<organization>', lower case, the organization's ISO country code first. */
  readonly key: string;
  findCandidates(query: CandidateQuery): Promise<Candidate[]>;
  fetchResults(sourceAthleteKey: string): Promise<NormalizedResult[]>;
}

/** A row of a tournament. Its pool length is null only until the guardian confirms (a tournament read from its PDF may not say it): the service fills it before the row is offered. */
export type TournamentResult = Omit<NormalizedResult, 'pool'> & { pool: PoolCode | null };

/** The athlete as the server knows them, to find them in a tournament that has no identity numbers: the first name and surname, the birth date (`YYYY-MM-DD`) and, when known, F or M. Never leaves the server. */
export type TournamentAthlete = { identityNumber: string; name: { firstName: string; lastName: string }; birthDate: string | null; gender: 'F' | 'M' | null };

/** How a person was found: by the identity number the file holds (the Lenex file), or by the name and birth date a PDF shows. */
export type MatchedBy = 'identity_number' | 'name_and_birth_date';

/**
 * What a tournament lookup finds for one athlete: the athlete's name and club, and that athlete's rows. Never the number or a birth date.
 * `matchedBy` is `identity_number` and `course` null when absent (the Lenex file). `course` is the pool length the tournament says in so many words (its PDF's header), if it does.
 */
export type TournamentSearch =
  | { found: false }
  | { found: true; athlete: { name: string; club: string | null }; results: TournamentResult[]; matchedBy?: MatchedBy; course?: PoolCode | null };

/** The tournament has no Lenex file and the athlete has no birth date to look them up by in its PDF. Nothing can be asked until a guardian saves it. */
export class BirthDateRequiredError extends ProviderUnavailableError {
  constructor() {
    super('The athlete has no birth date to find them in the tournament PDF');
    this.name = 'BirthDateRequiredError';
  }
}

/**
 * One tournament of a platform's list. `dateKey` is `YYYYMMDD`, the platform's own key for the tournament; `city` has the platform's
 * department prefix out and a consistent spelling; `discipline` is the platform's code (for example SW, PO or D). `course` is the pool
 * length only when the platform says it in so many words; otherwise it is null: a missing length is never a guess.
 */
export type TournamentEntry = {
  dateKey: string;
  year: number;
  name: string;
  city: string;
  discipline: string;
  course: PoolCode | null;
  sourceUrl: string;
};

/** A results platform: the person picks a tournament from its list, or pastes its address, and the adapter reads that tournament only, by identity number or, in a PDF, by name and birth date. */
export interface TournamentProvider {
  /** '<country>-<platform>', lower case, the organization's ISO country code first. */
  readonly key: string;
  /** Whether this adapter handles the address. It never throws. */
  accepts(url: string): boolean;
  /** The tournaments of those years the platform lists, each with its own `year`, from one read of the platform. A source that answers in a shape this does not know throws `ProviderUnavailableError`, never an empty list. */
  listTournaments(years: readonly number[]): Promise<TournamentEntry[]>;
  /**
   * Optional: asks the platform about each of those days (`YYYYMMDD`) in order, one request at a time, for a tournament its list did not show.
   * `probed` counts the days answered, `found` those that had a tournament, `entries` those whose name and city could be read (a day without
   * them is counted in `found` and left out: nothing is guessed). A day the platform does not answer cleanly stops the run: that day is
   * `stoppedBy`, it is not counted, and no later day is asked.
   */
  probeTournaments?(dateKeys: readonly string[]): Promise<{ probed: number; found: number; entries: TournamentEntry[]; stoppedBy?: string }>;
  lookup(url: string, athlete: TournamentAthlete): Promise<TournamentSearch>;
  /** The same lookup for a tournament of the list, by its year and key. */
  lookup(year: number, dateKey: string, athlete: TournamentAthlete): Promise<TournamentSearch>;
}
