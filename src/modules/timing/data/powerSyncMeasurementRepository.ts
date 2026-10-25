import { db, editRecord, writeRecord } from '../../../core/sync';
import { assertEditableTime, type Measurement, type MeasurementRepository } from './measurements';

type MeasurementRow = {
  id: string;
  kind: Measurement['kind'];
  athlete_id: string | null;
  series_id: string | null;
  arrival_position: number | null;
  hundredths: number | null;
  stroke: Measurement['stroke'];
  distance: Measurement['distance'];
  pool: Measurement['pool'];
  session_type: Measurement['sessionType'];
  source: Measurement['source'];
  created_by: string;
  device_id: string;
  captured_at: string;
  parent_id: string | null;
  version: number | null;
  edited_by: string | null;
  edited_at: string | null;
  edit_reason: string | null;
  discarded_at: string | null;
  discarded_by: string | null;
};

// Rows are trusted: the server enforces the kind/hundredths rule, so the union is restored by cast.
function toMeasurement(row: MeasurementRow): Measurement {
  return {
    id: row.id,
    kind: row.kind,
    athleteId: row.athlete_id,
    seriesId: row.series_id,
    arrivalPosition: row.arrival_position,
    hundredths: row.hundredths,
    stroke: row.stroke,
    distance: row.distance,
    pool: row.pool,
    sessionType: row.session_type,
    source: row.source,
    createdBy: row.created_by,
    deviceId: row.device_id,
    capturedAt: row.captured_at,
    parentId: row.parent_id,
    // A row not uploaded yet has no server version: the server starts every measurement at 1.
    version: row.version ?? 1,
    editedBy: row.edited_by,
    editedAt: row.edited_at,
    editReason: row.edit_reason,
  } as Measurement;
}

// The columns a new measurement is written with; the server owns the edit trail.
export function measurementRow(m: Measurement) {
  return {
    id: m.id,
    kind: m.kind,
    athlete_id: m.athleteId,
    series_id: m.seriesId,
    arrival_position: m.arrivalPosition,
    hundredths: m.hundredths,
    stroke: m.stroke,
    distance: m.distance,
    pool: m.pool,
    session_type: m.sessionType,
    source: m.source,
    created_by: m.createdBy,
    device_id: m.deviceId,
    captured_at: m.capturedAt,
    parent_id: m.parentId,
  };
}

export function createPowerSyncMeasurementRepository(): MeasurementRepository {
  return {
    async add(m) {
      await writeRecord('measurements', measurementRow(m));
    },
    async edit(id, { hundredths, athleteId }, { deviceId, editReason }) {
      // kind is not editable, so reading it before the edit cannot race; a missing row is left to editRecord to reject.
      const [stored] = await db.getAll<{ kind: Measurement['kind'] }>('SELECT kind FROM measurements WHERE id = ?', [id]);
      if (stored) assertEditableTime(stored.kind, hundredths);
      await editRecord(
        'measurements',
        id,
        {
          ...(hundredths !== undefined && { hundredths }),
          ...(athleteId !== undefined && { athlete_id: athleteId }),
        },
        // Always sent, so the server never keeps an older device or reason for this version.
        { edited_device_id: deviceId, edit_reason: editReason ?? null },
      );
    },
    async listBySeries(seriesId) {
      // `IS NULL` sorts first in SQLite; the flag puts unplaced arrivals last, like the in-memory repository.
      const rows = await db.getAll<MeasurementRow>(
        'SELECT * FROM measurements WHERE series_id = ? AND discarded_at IS NULL ORDER BY arrival_position IS NULL, arrival_position',
        [seriesId],
      );
      return rows.map(toMeasurement);
    },
    async listByAthleteEvent(athleteId, { stroke, distance, pool }) {
      const rows = await db.getAll<MeasurementRow>(
        'SELECT * FROM measurements WHERE athlete_id = ? AND discarded_at IS NULL AND stroke = ? AND distance = ? AND pool = ? ORDER BY captured_at DESC, id',
        [athleteId, stroke, distance, pool],
      );
      return rows.map(toMeasurement);
    },
    async listByAthletesEvent(athleteIds, { stroke, distance, pool }) {
      if (athleteIds.length === 0) return [];
      // The ids travel as one JSON parameter, so a big school never hits SQLite's parameter limit.
      const rows = await db.getAll<MeasurementRow>(
        'SELECT * FROM measurements WHERE athlete_id IN (SELECT value FROM json_each(?)) AND discarded_at IS NULL AND stroke = ? AND distance = ? AND pool = ? ORDER BY captured_at DESC, id',
        [JSON.stringify(athleteIds), stroke, distance, pool],
      );
      return rows.map(toMeasurement);
    },
    async listByAthlete(athleteId) {
      const rows = await db.getAll<MeasurementRow>('SELECT * FROM measurements WHERE athlete_id = ? AND discarded_at IS NULL ORDER BY captured_at DESC, id', [athleteId]);
      return rows.map(toMeasurement);
    },
    async countCapturedSince(athleteIds, since) {
      if (athleteIds.length === 0) return 0;
      // julianday compares moments: synced rows may use a space instead of 'T' between date and time.
      // The ids travel as one JSON parameter, so a big school never hits SQLite's parameter limit.
      const [row] = await db.getAll<{ total: number }>(
        'SELECT COUNT(*) AS total FROM measurements WHERE athlete_id IN (SELECT value FROM json_each(?)) AND discarded_at IS NULL AND julianday(captured_at) >= julianday(?)',
        [JSON.stringify(athleteIds), since],
      );
      return row?.total ?? 0;
    },
  };
}
