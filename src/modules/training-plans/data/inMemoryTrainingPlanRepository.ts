import type { Assignment } from './assignments';
import { normalizeBlock, validatePlan, type Plan, type PlanSummary, type TrainingPlanRepository } from './plans';

const clone = (plan: Plan): Plan => ({ ...plan, blocks: plan.blocks.map(normalizeBlock) });

type Version = { id: string; number: number; blocks: Plan['blocks']; createdAt: number };
/** A session as the assignment repository keeps it: `createdAt` orders it against the versions. */
export type StoredAssignment = Assignment & { withdrawn: boolean; createdAt: number };

/** What the in-memory plan, assignment and fulfillment repositories share, so a plan save sees the sessions and their marks. */
export type PlanStore = {
  versions: Map<string, Version[]>;
  assignments: StoredAssignment[];
  // The sessions with at least one fulfillment mark.
  marked: Set<string>;
  // Creation order across versions and assignments, standing in for server timestamps.
  tick: () => number;
};

export type InMemoryTrainingPlanRepository = TrainingPlanRepository & { store: PlanStore; versionCount: (planId: string) => number };

export function createInMemoryTrainingPlanRepository(): InMemoryTrainingPlanRepository {
  const byId = new Map<string, Plan>();
  let ids = 0;
  const next = () => `copy-${++ids}`;
  let clock = 0;
  const store: PlanStore = { versions: new Map(), assignments: [], marked: new Set(), tick: () => ++clock };

  const latest = (planId: string) => store.versions.get(planId)?.at(-1);
  const fresh = (blocks: Plan['blocks']) => blocks.map((block) => ({ ...normalizeBlock(block), id: next() }));

  function saveVersion(plan: Plan): void {
    const versions = store.versions.get(plan.id) ?? [];
    const current = versions.at(-1);
    const blocks = clone(plan).blocks;
    if (current && !store.assignments.some((a) => a.versionId === current.id)) {
      // Not assigned: edited in place. A block of another version is saved as a new block, so that version is never touched.
      const ofOthers = new Set(versions.filter((v) => v !== current).flatMap((v) => v.blocks.map((b) => b.id)));
      current.blocks = blocks.map((block) => (ofOthers.has(block.id) ? { ...block, id: next() } : block));
      return;
    }
    const version = { id: `${plan.id}-v${versions.length + 1}`, number: versions.length + 1, blocks: current ? fresh(blocks) : blocks, createdAt: store.tick() };
    store.versions.set(plan.id, [...versions, version]);
    // Sessions without marks run the new version, the others keep theirs.
    for (const session of store.assignments) {
      if (session.planId === plan.id && !session.withdrawn && !store.marked.has(session.id)) session.versionId = version.id;
    }
  }

  const repository: InMemoryTrainingPlanRepository = {
    store,
    versionCount: (planId) => store.versions.get(planId)?.length ?? 0,
    async get(id, versionId) {
      const plan = byId.get(id);
      const version = versionId ? store.versions.get(id)?.find((v) => v.id === versionId) : latest(id);
      return plan && (version || !versionId) ? clone({ ...plan, blocks: version?.blocks ?? [] }) : null;
    },
    async list(schoolId) {
      return [...byId.values()]
        .filter((plan) => plan.schoolId === schoolId)
        .map(({ id, name, isTemplate }): PlanSummary => ({ id, name, isTemplate }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    },
    async save(plan) {
      validatePlan(plan);
      byId.set(plan.id, clone(plan));
      saveVersion(plan);
    },
    async copy(id, asTemplate) {
      const source = await repository.get(id);
      if (!source) throw new Error(`Plan ${id} does not exist`);
      const copyId = next();
      await repository.save({ ...source, id: copyId, isTemplate: asTemplate, blocks: fresh(source.blocks) });
      return copyId;
    },
  };
  return repository;
}
