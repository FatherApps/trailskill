import { PlanNotAssignableError, validateSessionDate, type AssignmentRepository } from './assignments';
import type { InMemoryTrainingPlanRepository } from './inMemoryTrainingPlanRepository';

// Shares the plan repository's store, so editing a plan sees its sessions and moves the ones without marks.
// `sessionUser` is who is signed in now; a write with `asUser` checks it like the local database does.
export function createInMemoryAssignmentRepository(plans: InMemoryTrainingPlanRepository, sessionUser: () => string | undefined = () => undefined): AssignmentRepository {
  const { assignments, versions, tick } = plans.store;
  const checkUser = (asUser: string | undefined) => {
    if (asUser !== undefined && asUser !== sessionUser()) throw new Error(`Discarded a write of user ${asUser}: the session belongs to another user now`);
  };
  return {
    async list(schoolId, sessionDate) {
      return assignments
        .filter((a) => a.schoolId === schoolId && a.sessionDate === sessionDate && !a.withdrawn)
        .map(({ withdrawn: _withdrawn, createdAt, ...a }) => ({
          ...a,
          versionChanged: versions.get(a.planId)!.find((v) => v.id === a.versionId)!.createdAt > createdAt,
        }));
    },
    async create(assignment, asUser) {
      validateSessionDate(assignment.sessionDate);
      const plan = await plans.get(assignment.planId);
      if (!plan || plan.schoolId !== assignment.schoolId) throw new PlanNotAssignableError(assignment.planId);
      const id = `assignment-${assignments.length + 1}`;
      const versionId = versions.get(assignment.planId)!.at(-1)!.id;
      checkUser(asUser);
      assignments.push({ ...assignment, id, versionId, versionChanged: false, withdrawn: false, createdAt: tick() });
      return id;
    },
    async withdraw(id, asUser) {
      const stored = assignments.find((a) => a.id === id);
      if (!stored) throw new Error(`Cannot withdraw assignment ${id}: it is not on this device`);
      checkUser(asUser);
      stored.withdrawn = true;
    },
  };
}
