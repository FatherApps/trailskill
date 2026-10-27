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

// Product of a block with no usable distance: an invalid factor maps to it, and so does an underflow (1e-200 × 1e-200). An overflow stays Infinity and is caught by the total check below.
// It must stay 0: the ascending sort puts these products first and the sum adds them as 0 m, and an underflow already produces exactly 0.
const NOT_MEASURED = 0;

function planVolume(blocks: Volumetric[]): { meters: number; unmeasured: number; count: number } {
  // A block with an invalid factor reads as NOT_MEASURED here, so "no distance" is decided in the loop below and nowhere else.
  const products = blocks.map(({ repetitions, distance }) => (isPositiveFinite(repetitions) && isPositiveFinite(distance) ? repetitions * distance : NOT_MEASURED));
  // Many finite products can still add up to Infinity: a block that would overflow the total is counted apart, so the total stays finite.
  // Adding from the smallest makes the blocks left out the biggest ones, whatever the order of the plan.
  // The loop never skips a block for being too small to change the total, provided the blocks are added in ascending order and there are far fewer than 2^52 of them: then the total is at most count × the block being added, so its rounding step stays below that block.
  // That is about skipping. A bigger block added later can still absorb a smaller one into the rounded total, as the shortcut below says.
  // shortcut: the final total is rounded to a double (600 m next to 1e308 is lost in that rounding) and the block still counts as measured; upgrade only if exact sums are ever needed.
  products.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let meters = 0;
  let measured = 0;
  for (const product of products) {
    const next = meters + product;
    // NOT_MEASURED (invalid factor or underflow) or Infinity (overflow) is not measured; neither is a product that would take the total to Infinity.
    if (product === NOT_MEASURED || !Number.isFinite(next)) continue;
    meters = next;
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
