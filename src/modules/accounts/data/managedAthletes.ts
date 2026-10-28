import { db } from '../../../core/sync';

export interface ManagedAthleteRepository {
  /** Ids of the athletes the user manages (a guardian, or an adult athlete for themselves), sorted, no repeats. Local database only. */
  listManagedAthleteIds(userId: string): Promise<string[]>;
  /** Id of the athlete profile the user has for themselves (relation 'self'), or null. Only the user's own links count: a coach's device also holds other people's. Local database only. */
  getSelfAthleteId(userId: string): Promise<string | null>;
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
    async getSelfAthleteId(userId) {
      const [own] = await db.getAll<{ athlete_id: string }>("SELECT athlete_id FROM athlete_managers WHERE user_id = ? AND relation = 'self' LIMIT 1", [userId]);
      return own?.athlete_id ?? null;
    },
  };
}

export type ManagedAthleteRow = { userId: string; athleteId: string; relation?: 'guardian' | 'self' };

export function createInMemoryManagedAthleteRepository(rows: ManagedAthleteRow[]): ManagedAthleteRepository {
  return {
    async listManagedAthleteIds(userId) {
      return [...new Set(rows.filter((row) => row.userId === userId).map((row) => row.athleteId))].sort();
    },
    async getSelfAthleteId(userId) {
      return rows.find((row) => row.userId === userId && row.relation === 'self')?.athleteId ?? null;
    },
  };
}
