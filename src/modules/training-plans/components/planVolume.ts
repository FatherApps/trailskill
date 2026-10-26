import { t } from '../../../core/i18n';
import '../i18n';
import type { PlanBlock } from '../types';
import { formatNumber } from './formatNumber';

type Volumetric = Pick<PlanBlock, 'repetitions' | 'distance'>;

// A block with no distance or no repetitions (a drill, completion only) adds nothing: it is counted apart, never as 0 m.
export function planVolume(blocks: Volumetric[]): { meters: number; unmeasured: number; count: number } {
  const metres = blocks.map(({ repetitions, distance }) => repetitions * distance);
  return { meters: metres.reduce((sum, m) => sum + m, 0), unmeasured: metres.filter((m) => !(m > 0)).length, count: blocks.length };
}

export function planSummary(blocks: Volumetric[]): string | undefined {
  const { meters, unmeasured, count } = planVolume(blocks);
  if (count === 0) return undefined;
  if (unmeasured === count) return t('training_plans.today.summary_blocks', { count });
  if (unmeasured > 0) return t('training_plans.today.summary_partial', { meters: formatNumber(meters), count: unmeasured });
  return t('training_plans.today.summary', { meters: formatNumber(meters), count });
}
