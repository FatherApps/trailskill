import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import type { Hundredths } from '../../../core/time';

/** One official result as imported. Immutable: a change at the source becomes a new revision that supersedes this one. */
export type ImportedResult = {
  id: string;
  athleteId: string;
  importId: string;
  provider: string;
  sourceResultKey: string;
  revision: number;
  /** The revision this one replaces, or null for the first. */
  supersedesId: string | null;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  /** Null is a missing time, never 0. */
  hundredths: Hundredths | null;
  /** yyyy-mm-dd */
  swumOn: string;
  competition: string | null;
  createdAt: string;
};

/** The source changed an imported result; the difference waits for the guardian's choice and nothing is overwritten. */
export type PendingResultChange = {
  id: string;
  importedResultId: string;
  athleteId: string;
  importId: string;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  hundredths: Hundredths | null;
  swumOn: string;
  competition: string | null;
  createdAt: string;
};

export interface ImportedResultsRepository {
  /** The current revision of each result of the athlete (a row no other row supersedes), newest swim first (by id on a tie). Reads the local database only. */
  listByAthlete(athleteId: string): Promise<ImportedResult[]>;
  /** Changes still waiting for "Usar el valor nuevo" or "Mantener el actual", oldest first. Reads the local database only. */
  listPendingChanges(athleteId: string): Promise<PendingResultChange[]>;
  /** Every change the source ever proposed for the athlete, answered or not, oldest first. Reads the local database only. */
  listAllChanges(athleteId: string): Promise<PendingResultChange[]>;
  /** When the athlete's results were last imported (ISO), or null before any import. Reads the local database only. */
  lastImportedAt(athleteId: string): Promise<string | null>;
}
