import { db } from '../../../core/sync';

export type StaffSchool = { id: string; name: string };

export interface StaffSchoolRepository {
  /** Schools where the user is a member (any role), by name then id, no duplicates. */
  listStaffSchools(userId: string): Promise<StaffSchool[]>;
  /** Schools where the user is a school_admin, by name then id, no duplicates. */
  listAdminSchools(userId: string): Promise<StaffSchool[]>;
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
    async listAdminSchools(userId) {
      return db.getAll<StaffSchool>(
        `SELECT DISTINCT s.id AS id, s.name AS name FROM schools s
         JOIN school_memberships m ON m.school_id = s.id
         WHERE m.user_id = ? AND m.role = 'school_admin' ORDER BY s.name, s.id`,
        [userId],
      );
    },
  };
}

export type StaffMembershipRow = { schoolId: string; schoolName: string; userId: string; role: string };

export function createInMemoryStaffSchoolRepository(rows: StaffMembershipRow[]): StaffSchoolRepository {
  const list = (userId: string, keep: (row: StaffMembershipRow) => boolean) => {
    const schools = new Map<string, StaffSchool>();
    for (const row of rows) if (row.userId === userId && keep(row)) schools.set(row.schoolId, { id: row.schoolId, name: row.schoolName });
    return [...schools.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  };
  return {
    async listStaffSchools(userId) {
      return list(userId, () => true);
    },
    async listAdminSchools(userId) {
      return list(userId, (row) => row.role === 'school_admin');
    },
  };
}
