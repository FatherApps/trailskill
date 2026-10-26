import { db } from '../../../core/sync';

export type AthleteSchoolLink = { schoolId: string; categoryId: string | null };

export interface AthleteSchoolRepository {
  /** The schools the athlete belongs to with the category in each, by school id. Local database only. */
  listByAthlete(athleteId: string): Promise<AthleteSchoolLink[]>;
}

export function createPowerSyncAthleteSchoolRepository(): AthleteSchoolRepository {
  return {
    async listByAthlete(athleteId) {
      return db.getAll<AthleteSchoolLink>(
        'SELECT DISTINCT school_id AS schoolId, category_id AS categoryId FROM athlete_schools WHERE athlete_id = ? ORDER BY school_id',
        [athleteId],
      );
    },
  };
}

export function createInMemoryAthleteSchoolRepository(rows: (AthleteSchoolLink & { athleteId: string })[]): AthleteSchoolRepository {
  return {
    async listByAthlete(athleteId) {
      return rows
        .filter((row) => row.athleteId === athleteId)
        .map(({ schoolId, categoryId }) => ({ schoolId, categoryId }))
        .sort((a, b) => (a.schoolId < b.schoolId ? -1 : a.schoolId > b.schoolId ? 1 : 0));
    },
  };
}
