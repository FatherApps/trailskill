import { db } from '../../../core/sync';

export type SchoolCategory = { id: string; name: string; sortOrder: number };
export type SchoolGroup = { id: string; name: string };
// A coach is assigned to a group or directly to an athlete: exactly one of the two ids is set.
export type CoachAssignment = { coachId: string; groupId: string | null; athleteId: string | null };

export interface SchoolStructureRepository {
  /** Categories of the school by sort order, name, id. Local database only. */
  listCategories(schoolId: string): Promise<SchoolCategory[]>;
  /** Training groups of the school by name, id. Local database only. */
  listGroups(schoolId: string): Promise<SchoolGroup[]>;
  /**
   * Coach assignments to the groups of the school and to the given athletes (the caller supplies the school's athletes).
   * A direct assignment counts only for a coach of this school. Local database only.
   */
  listCoachAssignments(schoolId: string, athleteIds: readonly string[]): Promise<CoachAssignment[]>;
}

export function createPowerSyncSchoolStructureRepository(): SchoolStructureRepository {
  return {
    async listCategories(schoolId) {
      return db.getAll<SchoolCategory>(
        'SELECT id AS id, name AS name, sort_order AS sortOrder FROM categories WHERE school_id = ? ORDER BY sort_order, name, id',
        [schoolId],
      );
    },
    async listGroups(schoolId) {
      return db.getAll<SchoolGroup>('SELECT id AS id, name AS name FROM training_groups WHERE school_id = ? ORDER BY name, id', [schoolId]);
    },
    async listCoachAssignments(schoolId, athleteIds) {
      return db.getAll<CoachAssignment>(
        `SELECT DISTINCT a.coach_user_id AS coachId, a.group_id AS groupId, NULL AS athleteId
         FROM coach_group_assignments a JOIN training_groups g ON g.id = a.group_id WHERE g.school_id = ?
         UNION
         SELECT DISTINCT d.coach_user_id AS coachId, NULL AS groupId, d.athlete_id AS athleteId
         FROM coach_athlete_assignments d WHERE d.school_id = ? AND d.athlete_id IN (SELECT value FROM json_each(?))
         -- The membership check hides a coach who has since lost their coach role in this school.
         AND EXISTS (SELECT 1 FROM school_memberships m WHERE m.school_id = ? AND m.user_id = d.coach_user_id AND m.role = 'coach')`,
        [schoolId, schoolId, JSON.stringify(athleteIds), schoolId],
      );
    },
  };
}

export type SchoolStructureRows = {
  categories: (SchoolCategory & { schoolId: string })[];
  groups: (SchoolGroup & { schoolId: string })[];
  groupAssignments: { coachId: string; groupId: string }[];
  athleteAssignments: { coachId: string; athleteId: string; schoolId: string }[];
  // Coaches by school (school_memberships with role 'coach').
  coachMemberships: { coachId: string; schoolId: string }[];
};

export function createInMemorySchoolStructureRepository(rows: SchoolStructureRows): SchoolStructureRepository {
  return {
    async listCategories(schoolId) {
      return rows.categories
        .filter((c) => c.schoolId === schoolId)
        .map(({ id, name, sortOrder }) => ({ id, name, sortOrder }))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    },
    async listGroups(schoolId) {
      return rows.groups
        .filter((g) => g.schoolId === schoolId)
        .map(({ id, name }) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    },
    async listCoachAssignments(schoolId, athleteIds) {
      const groupIds = new Set(rows.groups.filter((g) => g.schoolId === schoolId).map((g) => g.id));
      const wanted = new Set(athleteIds);
      const coaches = new Set(rows.coachMemberships.filter((m) => m.schoolId === schoolId).map((m) => m.coachId));
      const unique = <T extends { coachId: string }>(list: T[], key: (a: T) => string) => [...new Map(list.map((a) => [`${a.coachId}|${key(a)}`, a])).values()];
      return [
        ...unique(rows.groupAssignments.filter((a) => groupIds.has(a.groupId)), (a) => a.groupId).map((a) => ({ coachId: a.coachId, groupId: a.groupId, athleteId: null })),
        ...unique(rows.athleteAssignments.filter((a) => a.schoolId === schoolId && wanted.has(a.athleteId) && coaches.has(a.coachId)), (a) => a.athleteId).map((a) => ({ coachId: a.coachId, groupId: null, athleteId: a.athleteId })),
      ];
    },
  };
}
