import type { Millis } from '../../../core/time';

export type RankedTime = { id: string; stroke: string; distance: string; pool: string; capturedAt: string; time: Millis | null };

/**
 * The best time of each event (stroke, distance and pool): the lowest time, and on a tie the one swum first. A missing time
 * is never a best time, and an event with only missing times has none.
 */
export function bestTimeIds(times: readonly RankedTime[]): Set<string> {
  const best = new Map<string, RankedTime>();
  for (const entry of times) {
    if (entry.time === null) continue;
    const key = `${entry.stroke}|${entry.distance}|${entry.pool}`;
    const current = best.get(key);
    if (!current || current.time === null || entry.time < current.time || (entry.time === current.time && entry.capturedAt < current.capturedAt)) {
      best.set(key, entry);
    }
  }
  return new Set([...best.values()].map((entry) => entry.id));
}
