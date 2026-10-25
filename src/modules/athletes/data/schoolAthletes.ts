import { db } from '../../../core/sync';

export type SchoolAthlete = { id: string; firstName: string; lastName: string; categoryId: string | null; groupIds: string[] };

export interface SchoolAthleteRepository {
  /** Athletes linked to the school through athlete_schools, by last name, first name, id; groupIds are every athlete_groups row of the athlete, sorted, no duplicates. Local database only. */
  listBySchool(schoolId: string): Promise<SchoolAthlete[]>;
}

export function createPowerSyncSchoolAthleteRepository(): SchoolAthleteRepository {
  return {
    async listBySchool(schoolId) {
      // Only the columns the console shows are selected: no other athlete data leaves the database.
      const athletes = await db.getAll<{ id: string; first_name: string; last_name: string; category_id: string | null }>(
        `SELECT a.id AS id, a.first_name AS first_name, a.last_name AS last_name, MIN(s.category_id) AS category_id
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
        groupIds: byAthlete.get(a.id) ?? [],
      }));
    },
  };
}

export type SchoolAthleteRows = {
  athletes: { id: string; firstName: string; lastName: string }[];
  athleteSchools: { athleteId: string; schoolId: string; categoryId: string | null }[];
  athleteGroups: { athleteId: string; groupId: string }[];
};

export function createInMemorySchoolAthleteRepository(rows: SchoolAthleteRows): SchoolAthleteRepository {
  return {
    async listBySchool(schoolId) {
      const links = new Map(rows.athleteSchools.filter((l) => l.schoolId === schoolId).map((l) => [l.athleteId, l.categoryId]));
      return rows.athletes
        .filter((a) => links.has(a.id))
        .map((a) => ({
          id: a.id,
          firstName: a.firstName,
          lastName: a.lastName,
          categoryId: links.get(a.id) ?? null,
          groupIds: [...new Set(rows.athleteGroups.filter((g) => g.athleteId === a.id).map((g) => g.groupId))].sort(),
        }))
        .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.id.localeCompare(b.id));
    },
  };
}
