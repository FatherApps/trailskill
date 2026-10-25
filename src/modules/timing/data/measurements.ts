import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import type { Hundredths, TimeKind } from '../../../core/time';
import type { AthleteId } from '../domain/series';

/** The five measurement kinds; `completed` records a done repetition without a time. */
export type MeasurementKind = TimeKind | 'completed';
export type SessionType = 'training' | 'competition';
export type MeasurementSource = 'screen_stopwatch' | 'screen_button' | 'external_button';

type MeasurementBase = {
  id: string;
  athleteId: AthleteId | null; // null: an arrival not yet assigned to an athlete
  seriesId: string | null;
  arrivalPosition: number | null;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  sessionType: SessionType;
  source: MeasurementSource;
  createdBy: string;
  // The school the time is for: the server accepts it only from a coach or admin of that school, for an athlete of that school.
  schoolId: string;
  deviceId: string;
  capturedAt: string; // ISO 8601
  parentId: string | null;
  // Edit trail (issue #55). The server owns them: `version` starts at 1 and goes up with each applied edit.
  version: number;
  editedBy: string | null; // null while never edited
  editedAt: string | null; // ISO 8601
  editReason: string | null;
};

// A missing time is null, never 0; a completed measurement never has one.
export type Measurement = MeasurementBase &
  ({ kind: TimeKind; hundredths: Hundredths | null } | { kind: 'completed'; hundredths: null });

export type MeasurementEvent = { stroke: StrokeCode; distance: DistanceCode; pool: PoolCode };

export interface MeasurementRepository {
  add(measurement: Measurement): Promise<void>;
  /** Every measurement of the series, assigned or not, by arrival position. */
  listBySeries(seriesId: string): Promise<Measurement[]>;
  /** Every kind of measurement of the athlete in the event, newest first (by id on a tie). */
  listByAthleteEvent(athleteId: string, event: MeasurementEvent): Promise<Measurement[]>;
  /** Every kind of measurement of the listed athletes in the event, newest first (by id on a tie). An empty list returns nothing. */
  listByAthletesEvent(athleteIds: readonly string[], event: MeasurementEvent): Promise<Measurement[]>;
  /** Every measurement of the athlete, all events and kinds, newest first (by id on a tie). */
  listByAthlete(athleteId: string): Promise<Measurement[]>;
  /** How many measurements of the athletes were captured at or after `since` (ISO 8601). An empty list counts 0. */
  countCapturedSince(athleteIds: readonly string[], since: string): Promise<number>;
  /**
   * Marks the measurement as discarded by its author ("Deshacer última", or unticking "Completado"). The row stays, with who and when,
   * and every read leaves it out. Never a delete: the server cannot undo one. A missing or already discarded measurement changes nothing.
   */
  discard(id: string, discardedBy: string): Promise<void>;
  /**
   * Edits an existing measurement: only the time and the athlete can change. The edit is sent with the version it was based on
   * and the editing device, so another device's different edit becomes a conflict ("Revisar") instead of overwriting. Rejects a missing id.
   * `undefined` leaves a field as it is; `null` clears it.
   */
  edit(
    id: string,
    changes: { hundredths?: Hundredths | null; athleteId?: AthleteId | null },
    meta: { deviceId: string; editReason?: string },
  ): Promise<void>;
}

/** A completed measurement records a done repetition without a time, so a time cannot be set on it. */
export class CompletedMeasurementTimeError extends Error {
  override name = 'CompletedMeasurementTimeError';
}

/** A discarded arrival ("Deshacer última") never changes again: the server refuses a new time or athlete on it for good. */
export class DiscardedMeasurementError extends Error {
  override name = 'DiscardedMeasurementError';
}

/** A time is above zero: a missing time is null, never 0. */
export class InvalidMeasurementTimeError extends Error {
  override name = 'InvalidMeasurementTimeError';
}

/** Rejects a time the server would turn into a permanent upload failure (zero, negative or non-integer), so the change is refused before anything is written. */
export function assertEditableTime(kind: MeasurementKind, hundredths: number | null | undefined): void {
  if (typeof hundredths !== 'number') return;
  if (kind === 'completed') throw new CompletedMeasurementTimeError('A completed measurement has no time');
  if (!Number.isInteger(hundredths) || hundredths <= 0) throw new InvalidMeasurementTimeError('A time must be greater than 0');
}
