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
