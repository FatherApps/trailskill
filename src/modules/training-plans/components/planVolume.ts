import { t } from '../../../core/i18n';
import '../i18n';
import type { PlanBlock } from '../types';
import { formatNumber } from './formatNumber';

type Volumetric = Pick<PlanBlock, 'repetitions' | 'distance'>;

// A block with no distance or no repetitions (a drill, completion only) adds nothing: a factor of 0 counts as "no distance" and the block is counted apart, never as 0 m.
// A factor that is NaN, negative or Infinity is invalid data: its block is counted apart too and never enters or lowers the total.
// Each factor is checked on its own (−2 × −25 is not 50 m), and so is the product, which can overflow (1e200 × 1e200) or underflow (1e-200 × 1e-200 is 0) from two finite factors.
// null and numeric strings ('50') are not numbers either: they read as "no distance". The running total is not covered by this predicate; planVolume checks it separately.
const isPositiveFinite = (n: number) => Number.isFinite(n) && n > 0;

function planVolume(blocks: Volumetric[]): { meters: number; unmeasured: number; count: number } {
  const products = blocks.flatMap(({ repetitions, distance }) => {
    const product = repetitions * distance;
    return isPositiveFinite(repetitions) && isPositiveFinite(distance) && isPositiveFinite(product) ? [product] : [];
  });
  // Many finite products can still add up to Infinity: a block that would overflow the total is counted apart, so the total stays finite.
  let meters = 0;
  let measured = 0;
  for (const product of products) {
    if (!Number.isFinite(meters + product)) continue;
    meters += product;
    measured += 1;
  }
  return { meters, unmeasured: blocks.length - measured, count: blocks.length };
}

export function planSummary(blocks: Volumetric[]): string | undefined {
  const { meters, unmeasured, count } = planVolume(blocks);
  if (count === 0) return undefined;
  if (unmeasured === count) return t('training_plans.today.summary_blocks', { count });
  if (unmeasured > 0) return t('training_plans.today.summary_partial', { meters: formatNumber(meters), count: unmeasured });
  return t('training_plans.today.summary', { meters: formatNumber(meters), count });
}
