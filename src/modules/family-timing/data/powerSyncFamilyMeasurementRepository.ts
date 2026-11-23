import { db, writeBatch, writeRecord } from '../../../core/sync';
import {
  cleanNote,
  FAMILY_MEASUREMENTS_TABLE,
  NotCompetitionError,
  NotTrainingError,
  parseSplitMeters,
  UnknownMeasurementError,
  type FamilyMeasurement,
  type FamilyMeasurementRepository,
} from './familyMeasurements';

// The synced table (core/sync/schema.ts) and the phone-only one the times lived in before #967.
const TABLE = FAMILY_MEASUREMENTS_TABLE;
const LOCAL_TABLE = 'family_measurements';
// The notes on times without a swimmer, on this phone only (core/sync/schema.ts): they name someone else's child.
const NOTES_TABLE = 'family_timing_notes';

type Row = {
  id: string;
  athlete_id: string | null;
  captured_by: string;
  stroke: FamilyMeasurement['stroke'];
  distance: FamilyMeasurement['distance'];
  pool: FamilyMeasurement['pool'];
  session_type: FamilyMeasurement['sessionType'];
  competition: string | null;
  captured_at: string;
  millis: number | null;
  splits: string | null;
  // Absent on the phone-only table of #967.
  split_meters?: string | null;
  official_millis: number | null;
  official_set_at: string | null;
  official_result_key?: string | null;
  deleted_at: string | null;
  note?: string | null;
};

type LocalRow = Omit<Row, 'captured_by' | 'deleted_at'> & { created_by: string };

// Each row with its note, read from the phone-only table; only a time without a swimmer shows one.
const withNote = (table: string) =>
  `SELECT t.*, (SELECT n.note FROM ${NOTES_TABLE} n WHERE n.measurement_id = t.id AND t.athlete_id IS NULL) AS note FROM ${table} t`;

// Saves (or clears, null) the note of a time. Phone-only table: no outbox.
async function writeNote(id: string, note: string | null) {
  await db.writeTransaction(async (tx) => {
    await tx.execute(`DELETE FROM ${NOTES_TABLE} WHERE measurement_id = ?`, [id]);
    if (note) {
      await tx.execute(`INSERT INTO ${NOTES_TABLE} (id, created_at, measurement_id, note) VALUES (uuid(), ?, ?, ?)`, [new Date().toISOString(), id, note]);
    }
  });
}

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
  splitMeters: parseSplitMeters(row.split_meters),
  officialMillis: row.official_millis,
  officialSetAt: row.official_set_at,
  officialResultKey: row.official_result_key ?? null,
  deletedAt: row.deleted_at,
  note: row.athlete_id === null ? (row.note ?? null) : null,
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
  split_meters: m.splitMeters ? JSON.stringify(m.splitMeters) : null,
  official_millis: m.officialMillis,
  official_set_at: m.officialSetAt,
  official_result_key: m.officialResultKey ?? null,
});

// A time not given to a swimmer has no athlete: SQL never matches NULL with "=".
const athleteIs = (athleteId: string | null) => (athleteId === null ? 'athlete_id IS NULL' : 'athlete_id = ?');
const athleteParams = (athleteId: string | null) => (athleteId === null ? [] : [athleteId]);

async function existing(id: string): Promise<{ session_type: string }> {
  const [row] = await db.getAll<{ session_type: string }>(`SELECT session_type FROM ${TABLE} WHERE id = ?`, [id]);
  if (!row) throw new UnknownMeasurementError(id);
  return row;
}

// The outbox marks of core/sync (writes.ts, connector.ts) for one table: an upload not yet answered, and one the server rejected.
const pending = 'SELECT record_id FROM pending_writes WHERE table_name = ?';
const failed = 'SELECT record_id FROM upload_failures WHERE table_name = ?';

// Saved on the device first and queued for upload in the same transaction (core/sync writes), so a time survives no signal.
export function createPowerSyncFamilyMeasurementRepository(): FamilyMeasurementRepository {
  return {
    async add(m) {
      await writeRecord(TABLE, newRow(m));
      const note = m.athleteId === null ? cleanNote(m.note) : null;
      if (note) await writeNote(m.id, note);
    },
    async addMany(measurements) {
      if (measurements.length === 0) return;
      await writeBatch(async (batch) => {
        for (const m of measurements) await batch.write(TABLE, newRow(m));
      }, measurements[0].createdBy);
    },
    async listByAthlete(athleteId) {
      const rows = await db.getAll<Row>(
        `${withNote(TABLE)} WHERE ${athleteIs(athleteId)} AND deleted_at IS NULL ORDER BY captured_at DESC, id DESC`,
        athleteParams(athleteId),
      );
      return rows.map(toMeasurement);
    },
    async setOfficial(id, officialMillis, at) {
      const row = await existing(id);
      if (row.session_type !== 'competition') throw new NotCompetitionError(id);
      await writeRecord(TABLE, { id, official_millis: officialMillis, official_set_at: officialMillis === null ? null : at });
    },
    async chooseOfficial(id, officialResultKey) {
      const row = await existing(id);
      if (row.session_type !== 'competition') throw new NotCompetitionError(id);
      await writeRecord(TABLE, { id, official_result_key: officialResultKey });
    },
    async edit(id, changes) {
      const row = await existing(id);
      if (changes.distance !== undefined && row.session_type !== 'training') throw new NotTrainingError(id);
      const values: Record<string, unknown> = { id };
      if (changes.stroke !== undefined) values.stroke = changes.stroke;
      if (changes.distance !== undefined) values.distance = changes.distance;
      if (changes.athleteId !== undefined) values.athlete_id = changes.athleteId;
      if (Object.keys(values).length > 1) await writeRecord(TABLE, values);
      // Given to a swimmer, the time keeps no note.
      if (changes.athleteId) await writeNote(id, null);
      else if (changes.note !== undefined) await writeNote(id, cleanNote(changes.note));
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
      const rows = await db.getAll<Row>(
        `${withNote(TABLE)} WHERE ${athleteIs(athleteId)} AND deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC`,
        athleteParams(athleteId),
      );
      return rows.map(toMeasurement);
    },
    async moveLocal(userId) {
      // Copied once: a row already in the synced table, or one the server rejected, is not queued again on every launch.
      const local = await db.getAll<LocalRow>(
        `SELECT * FROM ${LOCAL_TABLE} WHERE created_by = ? AND id NOT IN (SELECT id FROM ${TABLE}) AND id NOT IN (${failed})`,
        [userId, TABLE],
      );
      if (local.length > 0) {
        await writeBatch(async (batch) => {
          for (const row of local) {
            await batch.write(TABLE, newRow(toMeasurement({ ...row, captured_by: row.created_by, deleted_at: null })));
          }
        }, userId);
      }
      // A phone copy goes only once the server accepted the upload: a rejected one can vanish from the synced table on the next sync.
      // The phone-only table is never uploaded, so removing its rows needs no outbox.
      await db.writeTransaction((tx) =>
        tx.execute(
          `DELETE FROM ${LOCAL_TABLE} WHERE created_by = ? AND id IN (SELECT id FROM ${TABLE}) AND id NOT IN (${pending}) AND id NOT IN (${failed})`,
          [userId, TABLE, TABLE],
        ),
      );
      return local.length;
    },
    async forgetGoneNotes() {
      // A time gone from both tables left this person's times: accepted by another family, or removed by the server after 30 days.
      const gone = `measurement_id NOT IN (SELECT id FROM ${TABLE}) AND measurement_id NOT IN (SELECT id FROM ${LOCAL_TABLE})`;
      const assigned = `measurement_id IN (SELECT id FROM ${TABLE} WHERE athlete_id IS NOT NULL)`;
      const [{ count }] = await db.getAll<{ count: number }>(`SELECT count(*) AS count FROM ${NOTES_TABLE} WHERE (${gone}) OR ${assigned}`);
      if (count > 0) await db.writeTransaction((tx) => tx.execute(`DELETE FROM ${NOTES_TABLE} WHERE (${gone}) OR ${assigned}`));
      return count;
    },
    async listRejected(userId, athleteId) {
      // Gone from the synced table (the sync dropped the rejected upload) but still on the phone, with its failure recorded and no new upload waiting.
      const rows = await db.getAll<LocalRow>(
        `${withNote(LOCAL_TABLE)} WHERE created_by = ? AND ${athleteIs(athleteId)} AND id IN (${failed}) AND id NOT IN (${pending}) AND id NOT IN (SELECT id FROM ${TABLE})
         ORDER BY captured_at DESC, id DESC`,
        [userId, ...athleteParams(athleteId), TABLE, TABLE],
      );
      return rows.map((row) => toMeasurement({ ...row, captured_by: row.created_by, deleted_at: null }));
    },
    async discardRejected(userId, id) {
      // Both tables are phone-only (never uploaded), so deleting from them needs no outbox. One transaction: the time and its failure go together.
      await db.writeTransaction(async (tx) => {
        const row = await tx.getOptional<{ id: string }>(
          `SELECT id FROM ${LOCAL_TABLE} WHERE id = ? AND created_by = ? AND id IN (${failed}) AND id NOT IN (${pending}) AND id NOT IN (SELECT id FROM ${TABLE})`,
          [id, userId, TABLE, TABLE],
        );
        if (!row) throw new UnknownMeasurementError(id);
        await tx.execute(`DELETE FROM ${LOCAL_TABLE} WHERE id = ? AND created_by = ?`, [id, userId]);
        await tx.execute('DELETE FROM upload_failures WHERE table_name = ? AND record_id = ?', [TABLE, id]);
        await tx.execute(`DELETE FROM ${NOTES_TABLE} WHERE measurement_id = ?`, [id]);
      });
    },
  };
}
