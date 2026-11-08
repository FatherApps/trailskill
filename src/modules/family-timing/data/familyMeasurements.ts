import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import type { Millis } from '../../../core/time';

export type FamilySessionType = 'training' | 'competition';

/**
 * A time a guardian (or adult athlete) measured on their own phone. It is theirs: it stays on this phone and is never the school's record.
 * The captured time never changes. A competition time may get the event's official time typed by hand; once an official result is
 * imported for the same event and day, the imported one is the official value and the hand-typed one stays only as history.
 */
export type FamilyMeasurement = {
  id: string;
  athleteId: string;
  createdBy: string;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  sessionType: FamilySessionType;
  // Free text for a competition, for example the meet's name; null for training.
  competition: string | null;
  capturedAt: string; // ISO 8601
  // The measured time. Null when the stop came at the very instant of the start: a missing time is never 0.
  millis: Millis | null;
  // Cumulative splits since the start.
  splits: Millis[];
  // Competition only: the event's official time typed by the guardian, and when.
  officialMillis: Millis | null;
  officialSetAt: string | null;
};

export interface FamilyMeasurementRepository {
  add(measurement: FamilyMeasurement): Promise<void>;
  /** Every measurement of the athlete, newest first (by id on a tie). */
  listByAthlete(athleteId: string): Promise<FamilyMeasurement[]>;
  /** Sets or clears (null) the hand-typed official time of a competition measurement. Training measurements refuse it. */
  setOfficial(id: string, officialMillis: Millis | null, at: string): Promise<void>;
}

export class NotCompetitionError extends Error {
  override name = 'NotCompetitionError';
}

export class UnknownMeasurementError extends Error {
  override name = 'UnknownMeasurementError';
}

const newestFirst = (a: FamilyMeasurement, b: FamilyMeasurement) => b.capturedAt.localeCompare(a.capturedAt) || b.id.localeCompare(a.id);

export function createInMemoryFamilyMeasurementRepository(initial: FamilyMeasurement[] = []): FamilyMeasurementRepository {
  const rows = new Map(initial.map((m) => [m.id, m]));
  return {
    async add(measurement) {
      rows.set(measurement.id, measurement);
    },
    async listByAthlete(athleteId) {
      return [...rows.values()].filter((m) => m.athleteId === athleteId).sort(newestFirst);
    },
    async setOfficial(id, officialMillis, at) {
      const row = rows.get(id);
      if (!row) throw new UnknownMeasurementError(id);
      if (row.sessionType !== 'competition') throw new NotCompetitionError(id);
      rows.set(id, { ...row, officialMillis, officialSetAt: officialMillis === null ? null : at });
    },
  };
}
