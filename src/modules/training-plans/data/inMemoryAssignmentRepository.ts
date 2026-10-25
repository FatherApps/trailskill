import { PlanNotAssignableError, validateSessionDate, type Assignment, type AssignmentRepository } from './assignments';
import type { TrainingPlanRepository } from './plans';

// The in-memory plans have no versions: every plan has one, named after it.
export function createInMemoryAssignmentRepository(plans: Pick<TrainingPlanRepository, 'get'>): AssignmentRepository {
  const stored: Assignment[] = [];
  const withdrawn = new Set<string>();
  return {
    async list(schoolId, sessionDate) {
      return stored.filter((a) => a.schoolId === schoolId && a.sessionDate === sessionDate && !withdrawn.has(a.id)).map((a) => ({ ...a }));
    },
    async create(assignment) {
      validateSessionDate(assignment.sessionDate);
      const plan = await plans.get(assignment.planId);
      if (!plan || plan.schoolId !== assignment.schoolId) throw new PlanNotAssignableError(assignment.planId);
      const id = `assignment-${stored.length + 1}`;
      stored.push({ ...assignment, id, versionId: `${assignment.planId}-v1` });
      return id;
    },
    async withdraw(id) {
      if (!stored.some((a) => a.id === id)) throw new Error(`Cannot withdraw assignment ${id}: it is not on this device`);
      withdrawn.add(id);
    },
  };
}
