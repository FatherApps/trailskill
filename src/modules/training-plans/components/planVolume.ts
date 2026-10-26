import { t } from '../../../core/i18n';
import '../i18n';
import type { PlanBlock } from '../types';
import { formatNumber } from './formatNumber';

type Volumetric = Pick<PlanBlock, 'repetitions' | 'distance'>;

// A block with no distance or no repetitions (a drill, completion only) adds nothing: it is counted apart, never as 0 m.
// A factor that is NaN, negative or Infinity is invalid data: its block is counted apart too and never enters or lowers the total.
// Each factor is checked on its own (−2 × −25 is not 50 m), and so is the product, which can overflow from two finite factors.
const isPositiveFinite = (n: number) => Number.isFinite(n) && n > 0;

function planVolume(blocks: Volumetric[]): { meters: number; unmeasured: number; count: number } {
  const measured = blocks
    .filter(({ repetitions, distance }) => isPositiveFinite(repetitions) && isPositiveFinite(distance))
    .map(({ repetitions, distance }) => repetitions * distance)
    .filter(isPositiveFinite);
  return { meters: measured.reduce((sum, m) => sum + m, 0), unmeasured: blocks.length - measured.length, count: blocks.length };
}

export function planSummary(blocks: Volumetric[]): string | undefined {
  const { meters, unmeasured, count } = planVolume(blocks);
  if (count === 0) return undefined;
  if (unmeasured === count) return t('training_plans.today.summary_blocks', { count });
  if (unmeasured > 0) return t('training_plans.today.summary_partial', { meters: formatNumber(meters), count: unmeasured });
  return t('training_plans.today.summary', { meters: formatNumber(meters), count });
}
