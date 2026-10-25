import { normalizeBlock, validatePlan, type Plan, type PlanSummary, type TrainingPlanRepository } from './plans';

const clone = (plan: Plan): Plan => ({ ...plan, blocks: plan.blocks.map(normalizeBlock) });

export function createInMemoryTrainingPlanRepository(): TrainingPlanRepository {
  const byId = new Map<string, Plan>();
  let copies = 0;
  const next = () => `copy-${++copies}`;

  const repository: TrainingPlanRepository = {
    async get(id) {
      const plan = byId.get(id);
      return plan ? clone(plan) : null;
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
    },
    async copy(id, asTemplate) {
      const source = byId.get(id);
      if (!source) throw new Error(`Plan ${id} does not exist`);
      const copyId = next();
      byId.set(copyId, { ...clone(source), id: copyId, isTemplate: asTemplate, blocks: source.blocks.map((b) => ({ ...normalizeBlock(b), id: next() })) });
      return copyId;
    },
  };
  return repository;
}
