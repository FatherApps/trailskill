import { distances, isStroke } from '../../../core/sport';
import { db, deleteRecord, writeRecord } from '../../../core/sync';
import type { BlockPhase, BlockRecording, PlanBlock } from '../types';
import { normalizeBlock, validatePlan, type PlanSummary, type TrainingPlanRepository } from './plans';

type PlanRow = { id: string; school_id: string; name: string; is_template: number };
type BlockRow = {
  id: string;
  repetitions: number;
  distance: string;
  stroke: string | null;
  drill: string | null;
  equipment: string | null;
  send_off_seconds: number | null;
  phase: BlockPhase;
  recording: BlockRecording;
};

// Rows are trusted: the server checks the catalogs, so an unknown distance code would be a sync bug.
function toBlock(row: BlockRow): PlanBlock {
  return {
    id: row.id,
    phase: row.phase,
    repetitions: row.repetitions,
    distance: distances.find((d) => d.code === row.distance)?.meters ?? 0,
    activity: row.stroke ?? row.drill ?? '',
    equipment: row.equipment ? (JSON.parse(row.equipment) as string[]) : [],
    sendOffSeconds: row.send_off_seconds,
    recording: row.recording,
  };
}

async function latestVersionId(planId: string): Promise<string | null> {
  const [version] = await db.getAll<{ id: string }>(
    'SELECT id FROM training_plan_versions WHERE plan_id = ? ORDER BY version DESC LIMIT 1',
    [planId],
  );
  return version?.id ?? null;
}

async function blocksOf(versionId: string): Promise<BlockRow[]> {
  return db.getAll<BlockRow>('SELECT * FROM training_plan_blocks WHERE version_id = ? ORDER BY position, id', [versionId]);
}

export function createPowerSyncTrainingPlanRepository(): TrainingPlanRepository {
  const newId = async () => (await db.getAll<{ id: string }>('SELECT uuid() AS id'))[0]!.id;

  const repository: TrainingPlanRepository = {
    async get(id) {
      const [plan] = await db.getAll<PlanRow>('SELECT id, school_id, name, is_template FROM training_plans WHERE id = ?', [id]);
      if (!plan) return null;
      const versionId = await latestVersionId(id);
      const blocks = versionId ? (await blocksOf(versionId)).map(toBlock) : [];
      return { id: plan.id, schoolId: plan.school_id, name: plan.name, isTemplate: plan.is_template === 1, blocks };
    },
    async list(schoolId) {
      const rows = await db.getAll<{ id: string; name: string; is_template: number }>(
        'SELECT id, name, is_template FROM training_plans WHERE school_id = ? ORDER BY name, id',
        [schoolId],
      );
      return rows.map((row): PlanSummary => ({ id: row.id, name: row.name, isTemplate: row.is_template === 1 }));
    },
    // shortcut: save is several writeRecord transactions, so a crash midway can leave a partial plan; upgrade to one batched write in core/sync (needs maintainer approval).
    async save(plan) {
      validatePlan(plan);
      await writeRecord('training_plans', { id: plan.id, school_id: plan.schoolId, name: plan.name, is_template: plan.isTemplate ? 1 : 0 });
      const versionId = (await latestVersionId(plan.id)) ?? (await writeRecord('training_plan_versions', { plan_id: plan.id, version: 1 }));

      const keep = new Set(plan.blocks.map((block) => block.id));
      for (const stored of await blocksOf(versionId)) {
        if (!keep.has(stored.id)) await deleteRecord('training_plan_blocks', stored.id);
      }
      for (const [index, raw] of plan.blocks.entries()) {
        const block = normalizeBlock(raw);
        const stroke = isStroke(block.activity);
        await writeRecord('training_plan_blocks', {
          id: block.id,
          version_id: versionId,
          position: index + 1,
          repetitions: block.repetitions,
          distance: distances.find((d) => d.meters === block.distance)!.code,
          stroke: stroke ? block.activity : null,
          drill: stroke ? null : block.activity,
          equipment: JSON.stringify(block.equipment),
          send_off_seconds: block.sendOffSeconds,
          phase: block.phase,
          recording: block.recording,
        });
      }
    },
    async copy(id, asTemplate) {
      const source = await repository.get(id);
      if (!source) throw new Error(`Plan ${id} does not exist`);
      const copyId = await newId();
      const blocks = await Promise.all(source.blocks.map(async (block) => ({ ...block, id: await newId() })));
      await repository.save({ ...source, id: copyId, isTemplate: asTemplate, blocks });
      return copyId;
    },
  };
  return repository;
}
