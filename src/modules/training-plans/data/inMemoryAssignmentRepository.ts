import { PlanNotAssignableError, validateSessionDate, type AssignmentRepository } from './assignments';
import type { InMemoryTrainingPlanRepository } from './inMemoryTrainingPlanRepository';

// Shares the plan repository's store, so editing a plan sees its sessions and moves the ones without marks.
export function createInMemoryAssignmentRepository(plans: InMemoryTrainingPlanRepository): AssignmentRepository {
  const { assignments, versions, tick } = plans.store;
  return {
    async list(schoolId, sessionDate) {
      return assignments
        .filter((a) => a.schoolId === schoolId && a.sessionDate === sessionDate && !a.withdrawn)
        .map(({ withdrawn: _withdrawn, createdAt, ...a }) => ({
          ...a,
          versionChanged: versions.get(a.planId)!.find((v) => v.id === a.versionId)!.createdAt > createdAt,
        }));
    },
    async create(assignment) {
      validateSessionDate(assignment.sessionDate);
      const plan = await plans.get(assignment.planId);
      if (!plan || plan.schoolId !== assignment.schoolId) throw new PlanNotAssignableError(assignment.planId);
      const id = `assignment-${assignments.length + 1}`;
      const versionId = versions.get(assignment.planId)!.at(-1)!.id;
      assignments.push({ ...assignment, id, versionId, versionChanged: false, withdrawn: false, createdAt: tick() });
      return id;
    },
    async withdraw(id) {
      const stored = assignments.find((a) => a.id === id);
      if (!stored) throw new Error(`Cannot withdraw assignment ${id}: it is not on this device`);
      stored.withdrawn = true;
    },
  };
}
