import { db, writeBatch } from '../../../core/sync';
import { cleanPrivateDetails, GENDERS, todayLocal, type PrivateDetails, type PrivateDetailsInput } from './athletePrivateDetailsRules';

export * from './athletePrivateDetailsRules';

export type PrivateDetailsRepository = {
  /** What this device has for the swimmer, or null when there is no row (nothing answered, or not synced yet). */
  get(athleteId: string): Promise<PrivateDetails | null>;
  /** Writes the row of the swimmer on the device (offline included) and returns its id; throws, writing nothing, for a value the server would refuse. */
  save(athleteId: string, input: PrivateDetailsInput): Promise<string>;
};

type Row = { id: string; birth_date: string | null; gender: string | null };

export function createPowerSyncPrivateDetailsRepository(): PrivateDetailsRepository {
  return {
    async get(athleteId) {
      const [row] = await db.getAll<Row>('SELECT id, birth_date, gender FROM athlete_private_details WHERE athlete_id = ? LIMIT 1', [athleteId]);
      if (!row) return null;
      return { id: row.id, birthDate: row.birth_date, gender: GENDERS.find((gender) => gender === row.gender) ?? null };
    },
    async save(athleteId, input) {
      const { birthDate, gender } = cleanPrivateDetails(input, todayLocal());
      return writeBatch(async (batch) => {
        // By athlete_id, never by the row id: the server keeps one row per swimmer and the id is its own (a row from another device has another id).
        const [existing] = await batch.getAll<{ id: string }>('SELECT id FROM athlete_private_details WHERE athlete_id = ? LIMIT 1', [athleteId]);
        const values = { birth_date: birthDate, gender };
        // A new row carries athlete_id; the connector upserts on it, so a row that exists on the server but has not reached this phone yet is updated.
        return batch.write('athlete_private_details', existing ? { id: existing.id, ...values } : { athlete_id: athleteId, ...values });
      });
    },
  };
}

/** Test fake: one entry per athlete, with the same checks. */
export function createInMemoryPrivateDetailsRepository(): PrivateDetailsRepository {
  const rows = new Map<string, PrivateDetails>();
  return {
    async get(athleteId) {
      return rows.get(athleteId) ?? null;
    },
    async save(athleteId, input) {
      const cleaned = cleanPrivateDetails(input, todayLocal());
      const id = rows.get(athleteId)?.id ?? `details-${rows.size + 1}`;
      rows.set(athleteId, { id, ...cleaned });
      return id;
    },
  };
}
