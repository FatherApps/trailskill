import { db, editRecord, writeRecord } from '../../../core/sync';
import type { Measurement, MeasurementRepository } from './measurements';

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

export function createPowerSyncMeasurementRepository(): MeasurementRepository {
  return {
    async add(m) {
      await writeRecord('measurements', {
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
      });
    },
    async edit(id, { hundredths, athleteId }, { deviceId, editReason }) {
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
        'SELECT * FROM measurements WHERE series_id = ? ORDER BY arrival_position IS NULL, arrival_position',
        [seriesId],
      );
      return rows.map(toMeasurement);
    },
    async listByAthleteEvent(athleteId, { stroke, distance, pool }) {
      const rows = await db.getAll<MeasurementRow>(
        'SELECT * FROM measurements WHERE athlete_id = ? AND stroke = ? AND distance = ? AND pool = ? ORDER BY captured_at DESC, id',
        [athleteId, stroke, distance, pool],
      );
      return rows.map(toMeasurement);
    },
  };
}
