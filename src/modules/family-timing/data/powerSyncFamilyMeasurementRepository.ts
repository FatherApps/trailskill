import { db, writeBatch, writeRecord } from '../../../core/sync';
import {
  NotCompetitionError,
  UnknownMeasurementError,
  type FamilyMeasurement,
  type FamilyMeasurementRepository,
} from './familyMeasurements';

// The synced table (core/sync/schema.ts) and the phone-only one the times lived in before #967.
const TABLE = 'family_timing_measurements';
const LOCAL_TABLE = 'family_measurements';

type Row = {
  id: string;
  athlete_id: string;
  captured_by: string;
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
  deleted_at: string | null;
};

type LocalRow = Omit<Row, 'captured_by' | 'deleted_at'> & { created_by: string };

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
  createdBy: row.captured_by,
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
  deletedAt: row.deleted_at,
});

// Every column of a new row. The owner is who captured it; the server checks both are the signed-in user.
const newRow = (m: FamilyMeasurement) => ({
  id: m.id,
  created_at: m.capturedAt,
  owner_user_id: m.createdBy,
  captured_by: m.createdBy,
  athlete_id: m.athleteId,
  stroke: m.stroke,
  distance: m.distance,
  pool: m.pool,
  session_type: m.sessionType,
  competition: m.competition,
  captured_at: m.capturedAt,
  millis: m.millis,
  splits: JSON.stringify(m.splits),
  official_millis: m.officialMillis,
  official_set_at: m.officialSetAt,
});

async function existing(id: string): Promise<{ session_type: string }> {
  const [row] = await db.getAll<{ session_type: string }>(`SELECT session_type FROM ${TABLE} WHERE id = ?`, [id]);
  if (!row) throw new UnknownMeasurementError(id);
  return row;
}

// Saved on the device first and queued for upload in the same transaction (core/sync writes), so a time survives no signal.
export function createPowerSyncFamilyMeasurementRepository(): FamilyMeasurementRepository {
  return {
    async add(m) {
      await writeRecord(TABLE, newRow(m));
    },
    async listByAthlete(athleteId) {
      const rows = await db.getAll<Row>(`SELECT * FROM ${TABLE} WHERE athlete_id = ? AND deleted_at IS NULL ORDER BY captured_at DESC, id DESC`, [athleteId]);
      return rows.map(toMeasurement);
    },
    async setOfficial(id, officialMillis, at) {
      const row = await existing(id);
      if (row.session_type !== 'competition') throw new NotCompetitionError(id);
      await writeRecord(TABLE, { id, official_millis: officialMillis, official_set_at: officialMillis === null ? null : at });
    },
    async remove(id, at) {
      await existing(id);
      await writeRecord(TABLE, { id, deleted_at: at });
    },
    async restore(id) {
      await existing(id);
      await writeRecord(TABLE, { id, deleted_at: null });
    },
    async listDeleted(athleteId) {
      const rows = await db.getAll<Row>(`SELECT * FROM ${TABLE} WHERE athlete_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC`, [
        athleteId,
      ]);
      return rows.map(toMeasurement);
    },
    async moveLocal(userId) {
      const local = await db.getAll<LocalRow>(`SELECT * FROM ${LOCAL_TABLE} WHERE created_by = ?`, [userId]);
      if (local.length === 0) return 0;
      // Same ids: if the app dies before the phone copies are removed, the next run updates the moved rows instead of duplicating them.
      await writeBatch(async (batch) => {
        for (const row of local) {
          await batch.write(TABLE, newRow(toMeasurement({ ...row, captured_by: row.created_by, deleted_at: null })));
        }
      }, userId);
      // The phone-only table is never uploaded, so removing its rows needs no outbox.
      await db.writeTransaction((tx) => tx.execute(`DELETE FROM ${LOCAL_TABLE} WHERE created_by = ? AND id IN (SELECT id FROM ${TABLE})`, [userId]));
      return local.length;
    },
  };
}
