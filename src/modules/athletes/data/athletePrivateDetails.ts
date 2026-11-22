import { db, writeBatch } from '../../../core/sync';

// Issue 1366 (server) and 1367 (this screen). The table athlete_private_details holds one row per swimmer, found by athlete_id (its own id
// is only PowerSync's key), and syncs only to who manages the swimmer. Same limits as the server: a date from 1900-01-01 to today, and a
// gender that is null (not answered), 'F', 'M' or 'undisclosed'.
export const MIN_BIRTH_DATE = '1900-01-01';
export const GENDERS = ['F', 'M', 'undisclosed'] as const;
export type Gender = (typeof GENDERS)[number];

export type PrivateDetailsInput = { birthDate: string | null; gender: Gender | null };
export type PrivateDetails = PrivateDetailsInput & { id: string };

export type PrivateDetailsRepository = {
  /** What this device has for the swimmer, or null when there is no row (nothing answered, or not synced yet). */
  get(athleteId: string): Promise<PrivateDetails | null>;
  /** Writes the row of the swimmer on the device (offline included) and returns its id; throws, writing nothing, for a value the server would refuse. */
  save(athleteId: string, input: PrivateDetailsInput): Promise<string>;
};

/** The date on the phone (local time, never UTC): the server compares with its own date, but a family at 11 pm is still on "today". */
export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A real calendar date written YYYY-MM-DD, from 1900-01-01 to `today` (both included). */
export function isValidBirthDate(iso: string, today: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Date.UTC rolls over days that do not exist (Feb 30, Feb 29 in a common year); the round trip rejects them.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) return false;
  // ISO dates compare as text.
  return iso >= MIN_BIRTH_DATE && iso <= today;
}

/** The stored form: the date trimmed (empty is null), or a thrown error: a repository never writes what the server would reject for good. */
export function cleanPrivateDetails(input: PrivateDetailsInput, today: string): PrivateDetailsInput {
  const birthDate = input.birthDate?.trim() || null;
  if (birthDate !== null && !isValidBirthDate(birthDate, today)) throw new Error('Invalid birth date: a real date from 1900-01-01 to today');
  if (input.gender !== null && !GENDERS.includes(input.gender)) throw new Error('Invalid gender');
  return { birthDate, gender: input.gender };
}

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
