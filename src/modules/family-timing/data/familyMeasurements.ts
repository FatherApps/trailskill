import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import type { Millis } from '../../../core/time';

// The synced table of the times (core/sync/schema.ts): the sync state of a time is read from it.
export const FAMILY_MEASUREMENTS_TABLE = 'family_timing_measurements';

export type FamilySessionType = 'training' | 'competition';

/**
 * A time a guardian (or adult athlete) measured themselves. It is theirs, kept on the server for them only, and never the school's record.
 * The captured time never changes. A competition time may get the event's official time typed by hand; once an official result is
 * imported for the same event and day, the imported one is the official value and the hand-typed one stays only as history.
 */
export type FamilyMeasurement = {
  id: string;
  // Null for a time not given to a swimmer yet ("Sin asignar"), for example a lane of a series with someone else's child.
  athleteId: string | null;
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
  // Competition only: the imported official result the person chose for this time (officialResultKeyOf), when several could go with it.
  officialResultKey?: string | null;
  // Set when deleted: hidden from the list and restorable for 30 days, then the server removes it.
  deletedAt?: string | null;
};

// The distance can be corrected on a training time only (a competition keeps the event it was matched with).
export type FamilyMeasurementEdit = Partial<Pick<FamilyMeasurement, 'stroke' | 'athleteId' | 'distance'>>;

export interface FamilyMeasurementRepository {
  add(measurement: FamilyMeasurement): Promise<void>;
  /** Saves the times of a series together: all of them or none. */
  addMany(measurements: FamilyMeasurement[]): Promise<void>;
  /** Every measurement of the athlete, newest first (by id on a tie); null lists the times not given to a swimmer yet. */
  listByAthlete(athleteId: string | null): Promise<FamilyMeasurement[]>;
  /** Sets or clears (null) the hand-typed official time of a competition measurement. Training measurements refuse it. */
  setOfficial(id: string, officialMillis: Millis | null, at: string): Promise<void>;
  /** Remembers (or forgets, null) which imported official result goes with a competition measurement. Training measurements refuse it. */
  chooseOfficial(id: string, officialResultKey: string | null): Promise<void>;
  /** Corrects the stroke, the swimmer (one the user manages) or, on a training time, the distance; the captured time never changes. Competition times refuse a distance. */
  edit(id: string, changes: FamilyMeasurementEdit): Promise<void>;
  /** Deletes a measurement: it leaves the list and can be restored for 30 days. */
  remove(id: string, at: string): Promise<void>;
  /** Brings back a deleted measurement. */
  restore(id: string): Promise<void>;
  /** The athlete's deleted measurements, most recently deleted first; null for the ones not given to a swimmer. */
  listDeleted(athleteId: string | null): Promise<FamilyMeasurement[]>;
  /**
   * Moves the times this user stored on the phone before they were kept on the server (#967) into the synced table, once.
   * Times of another user on the same phone stay where they are. Returns how many moved.
   */
  moveLocal(userId: string): Promise<number>;
  /** This user's phone-only times the server rejected (kept on the phone, #1021), newest first; null for the ones not given to a swimmer. */
  listRejected(userId: string, athleteId: string | null): Promise<FamilyMeasurement[]>;
  /** Deletes for good one of this user's rejected phone-only times and its upload failure. Any other time (synced, pending, another user's) is refused with UnknownMeasurementError. */
  discardRejected(userId: string, id: string): Promise<void>;
}

export class NotCompetitionError extends Error {
  override name = 'NotCompetitionError';
}

export class NotTrainingError extends Error {
  override name = 'NotTrainingError';
}

export class UnknownMeasurementError extends Error {
  override name = 'UnknownMeasurementError';
}

const newestFirst = (a: FamilyMeasurement, b: FamilyMeasurement) => b.capturedAt.localeCompare(a.capturedAt) || b.id.localeCompare(a.id);

// `rejected` are the phone-only times the server refused: they are listed and discarded apart from `initial`.
export function createInMemoryFamilyMeasurementRepository(
  initial: FamilyMeasurement[] = [],
  rejected: FamilyMeasurement[] = [],
): FamilyMeasurementRepository {
  const rows = new Map(initial.map((m) => [m.id, m]));
  const refused = new Map(rejected.map((m) => [m.id, m]));
  return {
    async add(measurement) {
      rows.set(measurement.id, measurement);
    },
    async addMany(measurements) {
      for (const m of measurements) rows.set(m.id, m);
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
    async chooseOfficial(id, officialResultKey) {
      const row = rows.get(id);
      if (!row) throw new UnknownMeasurementError(id);
      if (row.sessionType !== 'competition') throw new NotCompetitionError(id);
      rows.set(id, { ...row, officialResultKey });
    },
    async edit(id, changes) {
      const row = rows.get(id);
      if (!row) throw new UnknownMeasurementError(id);
      if (changes.distance !== undefined && row.sessionType !== 'training') throw new NotTrainingError(id);
      rows.set(id, { ...row, ...changes });
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
    async listRejected(userId, athleteId) {
      return [...refused.values()].filter((m) => m.createdBy === userId && m.athleteId === athleteId).sort(newestFirst);
    },
    async discardRejected(userId, id) {
      if (refused.get(id)?.createdBy !== userId) throw new UnknownMeasurementError(id);
      refused.delete(id);
    },
  };
}
