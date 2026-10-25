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
  /** Coach assignments to the groups of the school and to the athletes linked to it. Local database only. */
  listCoachAssignments(schoolId: string): Promise<CoachAssignment[]>;
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
    async listCoachAssignments(schoolId) {
      // athlete_schools only scopes the direct assignments; it is not returned.
      return db.getAll<CoachAssignment>(
        `SELECT DISTINCT a.coach_user_id AS coachId, a.group_id AS groupId, NULL AS athleteId
         FROM coach_group_assignments a JOIN training_groups g ON g.id = a.group_id WHERE g.school_id = ?
         UNION
         SELECT DISTINCT d.coach_user_id AS coachId, NULL AS groupId, d.athlete_id AS athleteId
         FROM coach_athlete_assignments d WHERE d.athlete_id IN (SELECT athlete_id FROM athlete_schools WHERE school_id = ?)`,
        [schoolId, schoolId],
      );
    },
  };
}

export type SchoolStructureRows = {
  categories: (SchoolCategory & { schoolId: string })[];
  groups: (SchoolGroup & { schoolId: string })[];
  groupAssignments: { coachId: string; groupId: string }[];
  athleteAssignments: { coachId: string; athleteId: string }[];
  athleteSchools: { athleteId: string; schoolId: string }[];
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
    async listCoachAssignments(schoolId) {
      const groupIds = new Set(rows.groups.filter((g) => g.schoolId === schoolId).map((g) => g.id));
      const athleteIds = new Set(rows.athleteSchools.filter((l) => l.schoolId === schoolId).map((l) => l.athleteId));
      return [
        ...rows.groupAssignments.filter((a) => groupIds.has(a.groupId)).map((a) => ({ coachId: a.coachId, groupId: a.groupId, athleteId: null })),
        ...rows.athleteAssignments.filter((a) => athleteIds.has(a.athleteId)).map((a) => ({ coachId: a.coachId, groupId: null, athleteId: a.athleteId })),
      ];
    },
  };
}
