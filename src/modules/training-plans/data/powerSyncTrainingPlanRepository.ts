import { distances, isStroke } from '../../../core/sport';
import { db, writeBatch, type WriteBatch } from '../../../core/sync';
import type { BlockPhase, BlockRecording, PlanBlock } from '../types';
import { BlockHasFulfillmentError, normalizeBlock, validatePlan, type Plan, type PlanSummary, type TrainingPlanRepository } from './plans';

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

// `reader` is the database, or a batch so the save reads what it is about to change in its own transaction.
export type Reader = Pick<WriteBatch, 'getAll'>;

// The latest version is the highest number among the complete ones; NULL on a row from an older device means complete (0 while being written).
async function latestVersion(reader: Reader, planId: string): Promise<{ id: string; assigned: number } | null> {
  const [version] = await reader.getAll<{ id: string; assigned: number }>(
    'SELECT id, COALESCE(assigned, 0) AS assigned FROM training_plan_versions WHERE plan_id = ? AND COALESCE(complete, 1) = 1 ORDER BY version DESC LIMIT 1',
    [planId],
  );
  return version ?? null;
}

export async function latestVersionId(reader: Reader, planId: string): Promise<string | null> {
  return (await latestVersion(reader, planId))?.id ?? null;
}

async function blocksOf(reader: Reader, versionId: string): Promise<BlockRow[]> {
  return reader.getAll<BlockRow>('SELECT * FROM training_plan_blocks WHERE version_id = ? ORDER BY position, id', [versionId]);
}

// Without `id` the write inserts the block with a new uuid; with the id of an existing block it updates that block.
function writeBlock(batch: WriteBatch, versionId: string, index: number, raw: PlanBlock, id: string | undefined): Promise<string> {
  const block = normalizeBlock(raw);
  const stroke = isStroke(block.activity);
  return batch.write('training_plan_blocks', {
    id,
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

// A version is inserted incomplete and completed after its blocks, so no device or the server ever sees it half written.
async function writeNewVersion(batch: WriteBatch, plan: Plan, keepBlockIds: boolean): Promise<string> {
  const [{ latest }] = await batch.getAll<{ latest: number | null }>('SELECT MAX(version) AS latest FROM training_plan_versions WHERE plan_id = ?', [plan.id]);
  const versionId = await batch.write('training_plan_versions', { plan_id: plan.id, version: (latest ?? 0) + 1, complete: 0 });
  for (const [index, block] of plan.blocks.entries()) await writeBlock(batch, versionId, index, block, keepBlockIds ? block.id : undefined);
  await batch.write('training_plan_versions', { id: versionId, complete: 1 });
  return versionId;
}

// Sessions that are not withdrawn and have no fulfillment mark on this device run the new version; the others keep theirs.
async function moveSessions(batch: WriteBatch, planId: string, versionId: string): Promise<void> {
  const sessions = await batch.getAll<{ id: string }>(
    `SELECT a.id FROM training_plan_assignments a
     WHERE a.plan_id = ? AND a.withdrawn_at IS NULL AND a.version_id <> ?
       AND NOT EXISTS (SELECT 1 FROM training_plan_fulfillments f WHERE f.assignment_id = a.id)`,
    [planId, versionId],
  );
  for (const session of sessions) await batch.write('training_plan_assignments', { id: session.id, version_id: versionId });
}

async function editInPlace(batch: WriteBatch, plan: Plan, versionId: string): Promise<void> {
  const keep = new Set(plan.blocks.map((block) => block.id));
  const removed = (await blocksOf(batch, versionId)).filter((stored) => !keep.has(stored.id));
  if (removed.length > 0) {
    // shortcut: only marks already on this device are seen (a hidden mark or one not yet synced is refused on upload by the server guard on versions with marks)
    const [marked] = await batch.getAll<{ block_id: string }>(
      `SELECT block_id FROM training_plan_fulfillments WHERE block_id IN (${removed.map(() => '?').join(', ')}) LIMIT 1`,
      removed.map((stored) => stored.id),
    );
    if (marked) throw new BlockHasFulfillmentError(removed.map((stored) => stored.id));
  }
  // A block of another version (an editor still holding older blocks) is saved as a new block, so that version is never touched.
  const ofOthers = new Set(
    (await batch.getAll<{ id: string }>('SELECT b.id FROM training_plan_blocks b JOIN training_plan_versions v ON v.id = b.version_id WHERE v.plan_id = ? AND v.id <> ?', [plan.id, versionId])).map((row) => row.id),
  );
  for (const stored of removed) await batch.delete('training_plan_blocks', stored.id);
  for (const [index, block] of plan.blocks.entries()) await writeBlock(batch, versionId, index, block, ofOthers.has(block.id) ? undefined : block.id);
}

export function createPowerSyncTrainingPlanRepository(): TrainingPlanRepository {
  const newId = async () => (await db.getAll<{ id: string }>('SELECT uuid() AS id'))[0]!.id;

  const repository: TrainingPlanRepository = {
    async get(id, requested) {
      const [plan] = await db.getAll<PlanRow>('SELECT id, school_id, name, is_template FROM training_plans WHERE id = ?', [id]);
      if (!plan) return null;
      if (requested && (await db.getAll('SELECT id FROM training_plan_versions WHERE id = ? AND plan_id = ?', [requested, id])).length === 0) return null;
      const versionId = requested ?? (await latestVersionId(db, id));
      const blocks = versionId ? (await blocksOf(db, versionId)).map(toBlock) : [];
      return { id: plan.id, schoolId: plan.school_id, name: plan.name, isTemplate: plan.is_template === 1, blocks };
    },
    async list(schoolId) {
      const rows = await db.getAll<{ id: string; name: string; is_template: number }>(
        'SELECT id, name, is_template FROM training_plans WHERE school_id = ? ORDER BY name, id',
        [schoolId],
      );
      return rows.map((row): PlanSummary => ({ id: row.id, name: row.name, isTemplate: row.is_template === 1 }));
    },
    async save(plan) {
      validatePlan(plan);
      await writeBatch(async (batch) => {
        const latest = await latestVersion(batch, plan.id);
        // Frozen: the version is assigned, as the server says or as a local assignment (withdrawn included) shows.
        const frozen =
          latest !== null &&
          (latest.assigned === 1 || (await batch.getAll('SELECT 1 FROM training_plan_assignments WHERE version_id = ? LIMIT 1', [latest.id])).length > 0);

        await batch.write('training_plans', { id: plan.id, school_id: plan.schoolId, name: plan.name, is_template: plan.isTemplate ? 1 : 0 });
        if (!latest) await writeNewVersion(batch, plan, true);
        else if (frozen) await moveSessions(batch, plan.id, await writeNewVersion(batch, plan, false));
        else await editInPlace(batch, plan, latest.id);
      });
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
