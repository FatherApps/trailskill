import { db } from '../../../core/sync';

// `name` is null while coach names are not readable by school admins (issue 220).
export type Coach = { id: string; name: string | null };

export interface CoachRepository {
  /** Members with role 'coach' of the school, by id, no duplicates; name is null (issue 220: admins cannot read coach names). */
  listCoaches(schoolId: string): Promise<Coach[]>;
}

export function createPowerSyncCoachRepository(): CoachRepository {
  return {
    async listCoaches(schoolId) {
      const rows = await db.getAll<{ id: string }>(
        "SELECT DISTINCT user_id AS id FROM school_memberships WHERE school_id = ? AND role = 'coach' ORDER BY user_id",
        [schoolId],
      );
      return rows.map(({ id }) => ({ id, name: null }));
    },
  };
}

export type CoachMembershipRow = { schoolId: string; userId: string; role: string };

export function createInMemoryCoachRepository(rows: CoachMembershipRow[]): CoachRepository {
  return {
    async listCoaches(schoolId) {
      const ids = new Set(rows.filter((row) => row.schoolId === schoolId && row.role === 'coach').map((row) => row.userId));
      return [...ids].sort().map((id) => ({ id, name: null }));
    },
  };
}
