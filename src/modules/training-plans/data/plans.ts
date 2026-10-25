import { distances, isEquipment, isStroke } from '../../../core/sport';
import type { PlanBlock } from '../types';

export type Plan = { id: string; schoolId: string; name: string; isTemplate: boolean; blocks: PlanBlock[] };
export type PlanSummary = Pick<Plan, 'id' | 'name' | 'isTemplate'>;

export interface TrainingPlanRepository {
  /** The plan with its blocks in order, or null when it does not exist. */
  get(id: string): Promise<Plan | null>;
  /** Plans and templates of the school, by name (then id). */
  list(schoolId: string): Promise<PlanSummary[]>;
  /** Creates or updates the plan and replaces its blocks in the given order. Validates every block before writing anything. */
  save(plan: Plan): Promise<void>;
  /** Copies the plan (same name and blocks, all new ids) as a template or a plan; returns the new plan id. Independent of the source. */
  copy(id: string, asTemplate: boolean): Promise<string>;
}

// Same limit as the database check on `drill`.
export const MAX_DRILL_LENGTH = 120;
const RECORDINGS: readonly string[] = ['completion', 'per_repetition', 'series_total'];

/** Throws on the first invalid block; both repositories call it before writing anything. */
export function validatePlan(plan: Plan): void {
  plan.blocks.forEach((block, index) => {
    const fail = (reason: string) => {
      throw new Error(`Block ${index + 1}: ${reason}`);
    };
    const activity = typeof block.activity === 'string' ? block.activity.trim() : '';
    if (!RECORDINGS.includes(block.recording)) fail('what is recorded is required');
    if (activity === '') fail('a stroke or a drill is required');
    if (!isStroke(activity) && activity.length > MAX_DRILL_LENGTH) fail(`the drill is longer than ${MAX_DRILL_LENGTH} characters`);
    if (!Number.isInteger(block.repetitions) || block.repetitions < 1) fail('repetitions must be at least 1');
    if (!distances.some((d) => d.meters === block.distance)) fail('the distance is not in the catalog');
    if (!Array.isArray(block.equipment) || !block.equipment.every(isEquipment)) fail('the equipment is not in the catalog');
    if (block.sendOffSeconds !== null && !(block.sendOffSeconds > 0)) fail('the send-off must be greater than 0');
  });
}

/** The block as it is stored: activity trimmed, so a drill never keeps stray spaces. */
export function normalizeBlock(block: PlanBlock): PlanBlock {
  return { ...block, activity: block.activity.trim(), equipment: [...block.equipment] };
}
