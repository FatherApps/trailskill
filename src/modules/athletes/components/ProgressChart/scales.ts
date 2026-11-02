import type { Hundredths } from '../../../../core/time';

export type RangeKey = '3m' | '6m' | '1y' | 'all';

const monthsOf: Record<Exclude<RangeKey, 'all'>, number> = { '3m': 3, '6m': 6, '1y': 12 };

const DAY_MS = 86_400_000;

/** A real calendar day written yyyy-mm-dd; anything else (a time, a made-up day, free text) is not drawable. */
export function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m! - 1 && date.getUTCDate() === d;
}
const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!) / DAY_MS;
};

// The first day the range keeps: `today` minus whole months, the day clamped to the length of the month it lands in.
function rangeStart(range: Exclude<RangeKey, 'all'>, today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const target = new Date(Date.UTC(y!, m! - 1 - monthsOf[range], 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d!, lastDay))).toISOString().slice(0, 10);
}

/** The items inside the range that ends today (ISO dates compare as text). `all` keeps everything. */
export function filterByRange<T extends { date: string }>(items: readonly T[], range: RangeKey, today: string): T[] {
  // A `today` with a time counts as its day; one that is no date at all cannot bound a range, so nothing is cut.
  const day = today.slice(0, 10);
  if (range === 'all' || !isIsoDay(day)) return [...items];
  const start = rangeStart(range, day);
  return items.filter((item) => item.date >= start);
}

export type TimeScale = {
  /** Whole-second ticks, ascending: the 3 or 4 horizontal grid lines. The first is the fastest, drawn at the top. */
  ticks: Hundredths[];
};

// Seconds between ticks, from fine to coarse; the first step that needs no more than 4 ticks wins.
const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

/** A scale that covers the times with 3 or 4 whole-second ticks. No times, no ticks: nothing is invented around zero. */
export function timeScale(times: readonly Hundredths[]): TimeScale {
  if (times.length === 0) return { ticks: [] };
  const min = Math.min(...times) / 100;
  const max = Math.max(...times) / 100;
  const step = steps.find((s) => (Math.ceil(max / s) - Math.floor(min / s)) + 1 <= 4) ?? steps[steps.length - 1]!;
  let low = Math.floor(min / step);
  let high = Math.ceil(max / step);
  // A flat or short series still needs 3 lines: grow the slow end.
  while (high - low + 1 < 3) high += 1;
  const ticks: Hundredths[] = [];
  for (let k = low; k <= high; k += 1) ticks.push(k * step * 100);
  return { ticks };
}

/** Vertical position of a time: the inverted axis, so the fastest tick is at `top` and the slowest at `top + height`. */
export function yFor(time: Hundredths, scale: TimeScale, top: number, height: number): number {
  const first = scale.ticks[0]!;
  const last = scale.ticks[scale.ticks.length - 1]!;
  return top + ((time - first) / (last - first)) * height;
}

export type DateScale = { from: number; to: number };

/** The span of the dates, in days. */
export function dateScale(dates: readonly string[]): DateScale {
  const days = dates.map(dayNumber);
  return { from: Math.min(...days), to: Math.max(...days) };
}

/** Horizontal position of a date; a single date sits in the middle. */
export function xFor(date: string, scale: DateScale, left: number, width: number): number {
  if (scale.to === scale.from) return left + width / 2;
  return left + ((dayNumber(date) - scale.from) / (scale.to - scale.from)) * width;
}
