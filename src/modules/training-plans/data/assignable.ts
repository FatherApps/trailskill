import type { SchoolAthlete, SchoolAthleteRepository } from '../../athletes';
import type { SchoolCategory, SchoolGroup, SchoolStructureRepository, StaffSchoolRepository } from '../../school-console';
import {
  athletesOfTarget,
  TargetNotInChargeError,
  TargetOutsideSchoolError,
  type Assignment,
  type AssignmentRepository,
  type AssignmentTarget,
  type NewAssignment,
} from './assignments';

/** What a user can pick as the target of an assignment in one school. */
export type AssignScope = {
  schoolId: string;
  // Everything in the school, to tell a target of another school from one that is just not in charge.
  inSchool: { athletes: SchoolAthlete[]; groups: SchoolGroup[]; categories: SchoolCategory[] };
  // What the user may assign: an administrator, the whole school; a coach, own athletes and groups only.
  athletes: SchoolAthlete[];
  groups: SchoolGroup[];
  categories: SchoolCategory[];
  school: boolean;
};

type ScopeSources = { schools: StaffSchoolRepository; athletes: SchoolAthleteRepository; structure: SchoolStructureRepository };

export async function loadAssignScope({ schools, athletes, structure }: ScopeSources, userId: string, schoolId: string): Promise<AssignScope> {
  const [admins, schoolAthletes, groups, categories] = await Promise.all([
    schools.listAdminSchools(userId),
    athletes.listBySchool(schoolId),
    structure.listGroups(schoolId),
    structure.listCategories(schoolId),
  ]);
  const inSchool = { athletes: schoolAthletes, groups, categories };
  if (admins.some((school) => school.id === schoolId)) return { schoolId, inSchool, ...inSchool, school: true };

  const mine = (await structure.listCoachAssignments(schoolId, schoolAthletes.map((a) => a.id))).filter((a) => a.coachId === userId);
  const groupIds = new Set(mine.flatMap((a) => (a.groupId ? [a.groupId] : [])));
  const directIds = new Set(mine.flatMap((a) => (a.athleteId ? [a.athleteId] : [])));
  return {
    schoolId,
    inSchool,
    athletes: schoolAthletes.filter((a) => directIds.has(a.id) || a.groupIds.some((id) => groupIds.has(id))),
    groups: groups.filter((g) => groupIds.has(g.id)),
    categories: [],
    school: false,
  };
}

function isIn(list: { id: string }[], id: string) {
  return list.some((entry) => entry.id === id);
}

/** Throws TargetOutsideSchoolError for a target of another school and TargetNotInChargeError for one the user may not assign. */
export function checkTarget(scope: AssignScope, target: AssignmentTarget): void {
  const { inSchool } = scope;
  switch (target.kind) {
    case 'athlete':
      if (!isIn(inSchool.athletes, target.athleteId)) throw new TargetOutsideSchoolError(target);
      if (!isIn(scope.athletes, target.athleteId)) throw new TargetNotInChargeError(target);
      return;
    case 'group':
      if (!isIn(inSchool.groups, target.groupId)) throw new TargetOutsideSchoolError(target);
      if (!isIn(scope.groups, target.groupId)) throw new TargetNotInChargeError(target);
      return;
    case 'category':
      if (!isIn(inSchool.categories, target.categoryId)) throw new TargetOutsideSchoolError(target);
      if (!isIn(scope.categories, target.categoryId)) throw new TargetNotInChargeError(target);
      return;
    case 'school':
      if (!scope.school) throw new TargetNotInChargeError(target);
  }
}

/** Whether the user may withdraw an assignment: the same scope that lets them make it (an assignment of another school never gets here). */
export function canWithdraw(scope: AssignScope, target: AssignmentTarget): boolean {
  try {
    checkTarget(scope, target);
    return true;
  } catch (error) {
    if (error instanceof TargetNotInChargeError || error instanceof TargetOutsideSchoolError) return false;
    throw error;
  }
}

/** Saves the assignment when the user may make it; nothing is written otherwise. Returns the assignment id. */
export async function assignPlan(repository: AssignmentRepository, scope: AssignScope, assignment: Omit<NewAssignment, 'schoolId'>): Promise<string> {
  checkTarget(scope, assignment.target);
  return repository.create({ ...assignment, schoolId: scope.schoolId });
}

/** The assignments of a day with the athletes each one reaches (6.4 and 6.6 read the day through this). */
export async function listAssignmentsOfDay(
  sources: { assignments: AssignmentRepository; athletes: SchoolAthleteRepository },
  schoolId: string,
  sessionDate: string,
): Promise<{ assignment: Assignment; athleteIds: string[] }[]> {
  const [assignments, athletes] = await Promise.all([sources.assignments.list(schoolId, sessionDate), sources.athletes.listBySchool(schoolId)]);
  return assignments.map((assignment) => ({ assignment, athleteIds: athletesOfTarget(assignment.target, athletes) }));
}
