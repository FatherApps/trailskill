import { db, writeRecord } from '../../../core/sync';
import { createInMemoryAdultDirectoryRepository, createPowerSyncAdultDirectoryRepository, type AdultDirectoryRepository } from '../../accounts';

// `name` is null when the coach has no profile on this device: never a guess.
// A deactivated coach keeps their records and authorship; only new recordings stop.
export type Coach = { id: string; name: string | null; deactivated: boolean };

type Names = Pick<AdultDirectoryRepository, 'listNames'>;

export interface CoachRepository {
  /** Members with role 'coach' of the school, by id, no duplicates; name is the coach's profile name, null without a profile. */
  listCoaches(schoolId: string): Promise<Coach[]>;
  /** Deactivates a coach of the school. Rejects when that school has no such coach. There is no way back from here. */
  deactivateCoach(schoolId: string, coachId: string): Promise<void>;
}

export function createPowerSyncCoachRepository(adults: Names = createPowerSyncAdultDirectoryRepository()): CoachRepository {
  return {
    async listCoaches(schoolId) {
      const rows = await db.getAll<{ id: string; deactivated: number }>(
        "SELECT user_id AS id, MAX(deactivated_at IS NOT NULL) AS deactivated FROM school_memberships WHERE school_id = ? AND role = 'coach' GROUP BY user_id ORDER BY user_id",
        [schoolId],
      );
      const names = await adults.listNames(rows.map(({ id }) => id));
      return rows.map(({ id, deactivated }) => ({ id, name: names.get(id) ?? null, deactivated: deactivated === 1 }));
    },
    async deactivateCoach(schoolId, coachId) {
      const [membership] = await db.getAll<{ id: string }>(
        "SELECT id FROM school_memberships WHERE school_id = ? AND user_id = ? AND role = 'coach' LIMIT 1",
        [schoolId, coachId],
      );
      if (!membership) throw new Error('The school has no such coach');
      // The server overwrites the value with its own now(); this one only shows the state on the device until the sync arrives.
      await writeRecord('school_memberships', { id: membership.id, deactivated_at: new Date().toISOString() });
    },
  };
}

export type CoachMembershipRow = { schoolId: string; userId: string; role: string; deactivatedAt?: string | null };

export function createInMemoryCoachRepository(source: CoachMembershipRow[], adults: Names = createInMemoryAdultDirectoryRepository()): CoachRepository {
  // Copied: deactivating marks a row, and the caller's list must not change under it.
  const rows = source.map((row) => ({ ...row }));
  const coachRows = (schoolId: string) => rows.filter((row) => row.schoolId === schoolId && row.role === 'coach');
  return {
    async listCoaches(schoolId) {
      const byId = new Map<string, boolean>();
      for (const row of coachRows(schoolId)) byId.set(row.userId, (byId.get(row.userId) ?? false) || row.deactivatedAt != null);
      const ids = [...byId.keys()].sort();
      const names = await adults.listNames(ids);
      return ids.map((id) => ({ id, name: names.get(id) ?? null, deactivated: byId.get(id) === true }));
    },
    async deactivateCoach(schoolId, coachId) {
      const matches = coachRows(schoolId).filter((row) => row.userId === coachId);
      if (matches.length === 0) throw new Error('The school has no such coach');
      for (const row of matches) row.deactivatedAt = new Date().toISOString();
    },
  };
}
