import { distances, pools, type DistanceCode, type PoolCode } from '../../../core/sport';

/**
 * How many lengths of the pool the event swims: 100 m in a 25 m pool is 4. A distance shorter than the pool, or one
 * that does not divide by it, counts as one lap, so the stopwatch then only starts and stops.
 */
export function lapsFor(distance: DistanceCode, pool: PoolCode): number {
  const meters = distances.find((d) => d.code === distance)?.meters;
  const length = pools.find((p) => p.code === pool)?.lengthMeters;
  if (!meters || !length || meters < length || meters % length !== 0) return 1;
  return meters / length;
}
