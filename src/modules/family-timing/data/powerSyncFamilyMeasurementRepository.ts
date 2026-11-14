import { db } from '../../../core/sync';
import {
  NotCompetitionError,
  UnknownMeasurementError,
  type FamilyMeasurement,
  type FamilyMeasurementRepository,
} from './familyMeasurements';

type Row = {
  id: string;
  athlete_id: string;
  created_by: string;
  stroke: FamilyMeasurement['stroke'];
  distance: FamilyMeasurement['distance'];
  pool: FamilyMeasurement['pool'];
  session_type: FamilyMeasurement['sessionType'];
  competition: string | null;
  captured_at: string;
  millis: number | null;
  splits: string | null;
  official_millis: number | null;
  official_set_at: string | null;
};

function parseSplits(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === 'number') : [];
  } catch {
    return [];
  }
}

const toMeasurement = (row: Row): FamilyMeasurement => ({
  id: row.id,
  athleteId: row.athlete_id,
  createdBy: row.created_by,
  stroke: row.stroke,
  distance: row.distance,
  pool: row.pool,
  sessionType: row.session_type,
  competition: row.competition,
  capturedAt: row.captured_at,
  millis: row.millis,
  splits: parseSplits(row.splits),
  officialMillis: row.official_millis,
  officialSetAt: row.official_set_at,
});

// The table is local only (core/sync/schema.ts): nothing is uploaded, so writes skip the outbox.
// shortcut: signing out clears the local database, these times included; syncing them needs a server table and the maintainer's approval.
export function createPowerSyncFamilyMeasurementRepository(): FamilyMeasurementRepository {
  return {
    async add(m) {
      await db.execute(
        `INSERT INTO family_measurements (id, created_at, created_by, athlete_id, stroke, distance, pool, session_type, competition,
           captured_at, millis, splits, official_millis, official_set_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m.id,
          m.capturedAt,
          m.createdBy,
          m.athleteId,
          m.stroke,
          m.distance,
          m.pool,
          m.sessionType,
          m.competition,
          m.capturedAt,
          m.millis,
          JSON.stringify(m.splits),
          m.officialMillis,
          m.officialSetAt,
        ],
      );
    },
    async listByAthlete(athleteId) {
      const rows = await db.getAll<Row>('SELECT * FROM family_measurements WHERE athlete_id = ? ORDER BY captured_at DESC, id DESC', [athleteId]);
      return rows.map(toMeasurement);
    },
    async setOfficial(id, officialMillis, at) {
      const row = await db.getOptional<{ session_type: string }>('SELECT session_type FROM family_measurements WHERE id = ?', [id]);
      if (!row) throw new UnknownMeasurementError(id);
      if (row.session_type !== 'competition') throw new NotCompetitionError(id);
      await db.execute('UPDATE family_measurements SET official_millis = ?, official_set_at = ? WHERE id = ?', [
        officialMillis,
        officialMillis === null ? null : at,
        id,
      ]);
    },
  };
}
