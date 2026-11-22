// Pure rules, no database: the form imports them too. The repository (athletePrivateDetails.ts) re-exports them.
// Issue 1366 (server) and 1367 (this screen). The table athlete_private_details holds one row per swimmer, found by athlete_id (its own id
// is only PowerSync's key), and syncs only to who manages the swimmer. Same limits as the server: a date from 1900-01-01 to today, and a
// gender that is null (not answered), 'F', 'M' or 'undisclosed'.
export const MIN_BIRTH_DATE = '1900-01-01';
export const GENDERS = ['F', 'M', 'undisclosed'] as const;
export type Gender = (typeof GENDERS)[number];

export type PrivateDetailsInput = { birthDate: string | null; gender: Gender | null };
export type PrivateDetails = PrivateDetailsInput & { id: string };

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
