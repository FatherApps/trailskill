import { db } from '../../../core/sync';

export type SchoolAthlete = { id: string; firstName: string; lastName: string; categoryId: string | null; groupIds: string[]; endedAt: string | null };

// The link ended (ended_at) only when no link is active: several links, one active, keep the athlete active. With every link ended, the latest end.
const ENDED_AT_SQL = 'CASE WHEN COUNT(s.athlete_id) = 0 OR SUM(s.ended_at IS NULL) > 0 THEN NULL ELSE MAX(s.ended_at) END';

export interface SchoolAthleteRepository {
  /** Athletes linked to the school through athlete_schools, by last name, first name, id; groupIds are every athlete_groups row of the athlete, sorted, no duplicates; endedAt is the end of the link with that school (the read window of #1418), null while active. Local database only. */
  listBySchool(schoolId: string): Promise<SchoolAthlete[]>;
  /** Every athlete on the device, with or without a school, in the same order; with several schools the smallest category id; endedAt is null unless every link ended. The sync streams already limit what reaches the device. */
  listAll(): Promise<SchoolAthlete[]>;
  /** The athletes with those ids that are on the device, in the same order as listBySchool; unknown ids are ignored. */
  listByIds(ids: string[]): Promise<SchoolAthlete[]>;
}

type AthleteRow = { id: string; first_name: string; last_name: string; category_id: string | null; ended_at: string | null };

// The ids travel as one JSON text, so the number of athletes never reaches SQLite's parameter limit.
async function readAthletes(where: string, params: unknown[]): Promise<SchoolAthlete[]> {
  const athletes = await db.getAll<AthleteRow>(
    `SELECT a.id AS id, a.first_name AS first_name, a.last_name AS last_name, MIN(s.category_id) AS category_id, ${ENDED_AT_SQL} AS ended_at
     FROM athletes a LEFT JOIN athlete_schools s ON s.athlete_id = a.id ${where}
     GROUP BY a.id, a.first_name, a.last_name ORDER BY a.last_name, a.first_name, a.id`,
    params,
  );
  const groups = await db.getAll<{ athlete_id: string; group_id: string }>(
    'SELECT DISTINCT athlete_id, group_id FROM athlete_groups WHERE athlete_id IN (SELECT value FROM json_each(?)) ORDER BY group_id',
    [JSON.stringify(athletes.map((a) => a.id))],
  );
  const byAthlete = new Map<string, string[]>();
  for (const { athlete_id, group_id } of groups) byAthlete.set(athlete_id, [...(byAthlete.get(athlete_id) ?? []), group_id]);
  return athletes.map((a) => ({
    id: a.id,
    firstName: a.first_name,
    lastName: a.last_name,
    categoryId: a.category_id,
    endedAt: a.ended_at,
    groupIds: byAthlete.get(a.id) ?? [],
  }));
}

export function createPowerSyncSchoolAthleteRepository(): SchoolAthleteRepository {
  return {
    async listBySchool(schoolId) {
      // Only the columns the console shows are selected: no other athlete data leaves the database.
      const athletes = await db.getAll<AthleteRow>(
        `SELECT a.id AS id, a.first_name AS first_name, a.last_name AS last_name, MIN(s.category_id) AS category_id, ${ENDED_AT_SQL} AS ended_at
         FROM athletes a JOIN athlete_schools s ON s.athlete_id = a.id
         WHERE s.school_id = ? GROUP BY a.id, a.first_name, a.last_name ORDER BY a.last_name, a.first_name, a.id`,
        [schoolId],
      );
      const groups = await db.getAll<{ athlete_id: string; group_id: string }>(
        `SELECT DISTINCT g.athlete_id AS athlete_id, g.group_id AS group_id FROM athlete_groups g
         WHERE g.athlete_id IN (SELECT athlete_id FROM athlete_schools WHERE school_id = ?) ORDER BY g.group_id`,
        [schoolId],
      );
      const byAthlete = new Map<string, string[]>();
      for (const { athlete_id, group_id } of groups) byAthlete.set(athlete_id, [...(byAthlete.get(athlete_id) ?? []), group_id]);
      return athletes.map((a) => ({
        id: a.id,
        firstName: a.first_name,
        lastName: a.last_name,
        categoryId: a.category_id,
        endedAt: a.ended_at,
        groupIds: byAthlete.get(a.id) ?? [],
      }));
    },
    listAll: () => readAthletes('', []),
    listByIds: (ids) => readAthletes('WHERE a.id IN (SELECT value FROM json_each(?))', [JSON.stringify(ids)]),
  };
}

export type SchoolAthleteRows = {
  athletes: { id: string; firstName: string; lastName: string }[];
  athleteSchools: { athleteId: string; schoolId: string; categoryId: string | null; endedAt?: string | null }[];
  athleteGroups: { athleteId: string; groupId: string }[];
};

export function createInMemorySchoolAthleteRepository(rows: SchoolAthleteRows): SchoolAthleteRepository {
  const compare = (a: SchoolAthlete, b: SchoolAthlete) =>
    a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.id.localeCompare(b.id);
  const read = (keep: (athleteId: string) => boolean, categoryOf: (athleteId: string) => string | null, endedAtOf: (athleteId: string) => string | null): SchoolAthlete[] =>
    rows.athletes
      .filter((a) => keep(a.id))
      .map((a) => ({
        id: a.id,
        firstName: a.firstName,
        lastName: a.lastName,
        categoryId: categoryOf(a.id),
        endedAt: endedAtOf(a.id),
        groupIds: [...new Set(rows.athleteGroups.filter((g) => g.athleteId === a.id).map((g) => g.groupId))].sort(),
      }))
      .sort(compare);
  const smallestCategory = (athleteId: string) =>
    rows.athleteSchools
      .filter((l) => l.athleteId === athleteId && l.categoryId !== null)
      .map((l) => l.categoryId as string)
      .sort()[0] ?? null;
  // Mirrors ENDED_AT_SQL: null with no link or one active link, else the latest end.
  const endedAtOf = (links: SchoolAthleteRows['athleteSchools']) =>
    links.length === 0 || links.some((l) => !l.endedAt) ? null : links.map((l) => l.endedAt as string).sort().at(-1)!;
  const endOfAll = (athleteId: string) => endedAtOf(rows.athleteSchools.filter((l) => l.athleteId === athleteId));
  return {
    async listBySchool(schoolId) {
      const links = rows.athleteSchools.filter((l) => l.schoolId === schoolId);
      const category = new Map(links.map((l) => [l.athleteId, l.categoryId]));
      return read((id) => category.has(id), (id) => category.get(id) ?? null, (id) => endedAtOf(links.filter((l) => l.athleteId === id)));
    },
    listAll: async () => read(() => true, smallestCategory, endOfAll),
    listByIds: async (ids) => read((id) => ids.includes(id), smallestCategory, endOfAll),
  };
}
