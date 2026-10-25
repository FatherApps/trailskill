import { db } from '../../../core/sync';

export type StaffSchool = { id: string; name: string };

export interface StaffSchoolRepository {
  /** Schools where the user is a member (any role), by name then id, no duplicates. */
  listStaffSchools(userId: string): Promise<StaffSchool[]>;
}

export function createPowerSyncStaffSchoolRepository(): StaffSchoolRepository {
  return {
    async listStaffSchools(userId) {
      return db.getAll<StaffSchool>(
        `SELECT DISTINCT s.id AS id, s.name AS name FROM schools s
         JOIN school_memberships m ON m.school_id = s.id
         WHERE m.user_id = ? ORDER BY s.name, s.id`,
        [userId],
      );
    },
  };
}

export type StaffMembershipRow = { schoolId: string; schoolName: string; userId: string; role: string };

export function createInMemoryStaffSchoolRepository(rows: StaffMembershipRow[]): StaffSchoolRepository {
  return {
    async listStaffSchools(userId) {
      const schools = new Map<string, StaffSchool>();
      for (const row of rows) if (row.userId === userId) schools.set(row.schoolId, { id: row.schoolId, name: row.schoolName });
      return [...schools.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    },
  };
}
