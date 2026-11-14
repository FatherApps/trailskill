import { db } from '../../../core/sync';
import { createInMemoryAdultDirectoryRepository, createPowerSyncAdultDirectoryRepository, type AdultDirectoryRepository } from '../../accounts';

// `name` is null when the coach has no profile on this device: never a guess.
export type Coach = { id: string; name: string | null };

type Names = Pick<AdultDirectoryRepository, 'listNames'>;

export interface CoachRepository {
  /** Members with role 'coach' of the school, by id, no duplicates; name is the coach's profile name, null without a profile. */
  listCoaches(schoolId: string): Promise<Coach[]>;
}

export function createPowerSyncCoachRepository(adults: Names = createPowerSyncAdultDirectoryRepository()): CoachRepository {
  return {
    async listCoaches(schoolId) {
      const rows = await db.getAll<{ id: string }>(
        "SELECT DISTINCT user_id AS id FROM school_memberships WHERE school_id = ? AND role = 'coach' ORDER BY user_id",
        [schoolId],
      );
      const names = await adults.listNames(rows.map(({ id }) => id));
      return rows.map(({ id }) => ({ id, name: names.get(id) ?? null }));
    },
  };
}

export type CoachMembershipRow = { schoolId: string; userId: string; role: string };

export function createInMemoryCoachRepository(rows: CoachMembershipRow[], adults: Names = createInMemoryAdultDirectoryRepository()): CoachRepository {
  return {
    async listCoaches(schoolId) {
      const ids = [...new Set(rows.filter((row) => row.schoolId === schoolId && row.role === 'coach').map((row) => row.userId))].sort();
      const names = await adults.listNames(ids);
      return ids.map((id) => ({ id, name: names.get(id) ?? null }));
    },
  };
}
