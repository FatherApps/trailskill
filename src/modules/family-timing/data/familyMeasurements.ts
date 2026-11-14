import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import type { Millis } from '../../../core/time';

export type FamilySessionType = 'training' | 'competition';

/**
 * A time a guardian (or adult athlete) measured themselves. It is theirs, kept on the server for them only, and never the school's record.
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
  // Set when deleted: hidden from the list and restorable for 30 days, then the server removes it.
  deletedAt?: string | null;
};

export interface FamilyMeasurementRepository {
  add(measurement: FamilyMeasurement): Promise<void>;
  /** Every measurement of the athlete, newest first (by id on a tie). */
  listByAthlete(athleteId: string): Promise<FamilyMeasurement[]>;
  /** Sets or clears (null) the hand-typed official time of a competition measurement. Training measurements refuse it. */
  setOfficial(id: string, officialMillis: Millis | null, at: string): Promise<void>;
  /** Deletes a measurement: it leaves the list and can be restored for 30 days. */
  remove(id: string, at: string): Promise<void>;
  /** Brings back a deleted measurement. */
  restore(id: string): Promise<void>;
  /** The athlete's deleted measurements, most recently deleted first. */
  listDeleted(athleteId: string): Promise<FamilyMeasurement[]>;
  /**
   * Moves the times this user stored on the phone before they were kept on the server (#967) into the synced table, once.
   * Times of another user on the same phone stay where they are. Returns how many moved.
   */
  moveLocal(userId: string): Promise<number>;
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
      return [...rows.values()].filter((m) => m.athleteId === athleteId && !m.deletedAt).sort(newestFirst);
    },
    async setOfficial(id, officialMillis, at) {
      const row = rows.get(id);
      if (!row) throw new UnknownMeasurementError(id);
      if (row.sessionType !== 'competition') throw new NotCompetitionError(id);
      rows.set(id, { ...row, officialMillis, officialSetAt: officialMillis === null ? null : at });
    },
    async remove(id, at) {
      const row = rows.get(id);
      if (!row) throw new UnknownMeasurementError(id);
      rows.set(id, { ...row, deletedAt: at });
    },
    async restore(id) {
      const row = rows.get(id);
      if (!row) throw new UnknownMeasurementError(id);
      rows.set(id, { ...row, deletedAt: null });
    },
    async listDeleted(athleteId) {
      return [...rows.values()]
        .filter((m): m is FamilyMeasurement & { deletedAt: string } => m.athleteId === athleteId && !!m.deletedAt)
        .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt) || b.id.localeCompare(a.id));
    },
    async moveLocal() {
      return 0;
    },
  };
}
