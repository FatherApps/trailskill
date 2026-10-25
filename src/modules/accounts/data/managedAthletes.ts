import { db } from '../../../core/sync';

export interface ManagedAthleteRepository {
  /** Ids of the athletes the user manages (a guardian, or an adult athlete for themselves), sorted, no repeats. Local database only. */
  listManagedAthleteIds(userId: string): Promise<string[]>;
}

export function createPowerSyncManagedAthleteRepository(): ManagedAthleteRepository {
  return {
    async listManagedAthleteIds(userId) {
      const rows = await db.getAll<{ athlete_id: string }>(
        'SELECT DISTINCT athlete_id FROM athlete_managers WHERE user_id = ? ORDER BY athlete_id',
        [userId],
      );
      return rows.map((row) => row.athlete_id);
    },
  };
}

export type ManagedAthleteRow = { userId: string; athleteId: string };

export function createInMemoryManagedAthleteRepository(rows: ManagedAthleteRow[]): ManagedAthleteRepository {
  return {
    async listManagedAthleteIds(userId) {
      return [...new Set(rows.filter((row) => row.userId === userId).map((row) => row.athleteId))].sort();
    },
  };
}
