import { db } from '../../../core/sync';

export type AthleteSchoolLink = { schoolId: string; categoryId: string | null };

// One row of the local table; `endedAt` is set when the school ended the link (issue 1243), `null` or absent while it is active.
export type AthleteSchoolRow = AthleteSchoolLink & { athleteId: string; endedAt?: string | null };

export interface AthleteSchoolRepository {
  /** The schools the athlete belongs to with the category in each, by school id. Local database only. The ended links are listed too. */
  listByAthlete(athleteId: string): Promise<AthleteSchoolLink[]>;
  /**
   * Is the athlete still active in some school, and in which? The ids of the schools whose link is not ended, by school id; empty when
   * every link is ended or there is none. Local database only.
   */
  listActiveSchools(athleteId: string): Promise<string[]>;
}

export function createPowerSyncAthleteSchoolRepository(): AthleteSchoolRepository {
  return {
    async listByAthlete(athleteId) {
      return db.getAll<AthleteSchoolLink>(
        'SELECT DISTINCT school_id AS schoolId, category_id AS categoryId FROM athlete_schools WHERE athlete_id = ? ORDER BY school_id',
        [athleteId],
      );
    },
    async listActiveSchools(athleteId) {
      const rows = await db.getAll<{ schoolId: string }>(
        'SELECT DISTINCT school_id AS schoolId FROM athlete_schools WHERE athlete_id = ? AND ended_at IS NULL ORDER BY school_id',
        [athleteId],
      );
      return rows.map((row) => row.schoolId);
    },
  };
}

const bySchool = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Reads the rows it is given on every call, so a fake that ends a link on the same array is seen at once.
export function createInMemoryAthleteSchoolRepository(rows: AthleteSchoolRow[]): AthleteSchoolRepository {
  return {
    async listByAthlete(athleteId) {
      return rows
        .filter((row) => row.athleteId === athleteId)
        .map(({ schoolId, categoryId }) => ({ schoolId, categoryId }))
        .sort((a, b) => bySchool(a.schoolId, b.schoolId));
    },
    async listActiveSchools(athleteId) {
      return rows
        .filter((row) => row.athleteId === athleteId && !row.endedAt)
        .map((row) => row.schoolId)
        .sort(bySchool);
    },
  };
}
