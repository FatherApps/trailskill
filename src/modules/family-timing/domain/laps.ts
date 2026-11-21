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

/**
 * The meters swum at the end of each of `count` laps of a time, for its detail. Each lap the person marked is one length
 * of the pool and the last one swims what is left: a 100 m first set up as 50 m, marked at 25 m and stopped at the end, is
 * 25 m and 100 m. Laps that cover more than the distance in lengths share it equally when it divides into whole
 * meters, and otherwise have no meters (null).
 */
export function lapMeters(distance: DistanceCode, pool: PoolCode, count: number): number[] | null {
  const meters = distances.find((d) => d.code === distance)?.meters;
  const length = pools.find((p) => p.code === pool)?.lengthMeters;
  if (!meters || count < 1) return null;
  if (length && (count - 1) * length < meters) return Array.from({ length: count }, (_, i) => (i === count - 1 ? meters : (i + 1) * length));
  if (meters % count === 0) return Array.from({ length: count }, (_, i) => ((i + 1) * meters) / count);
  return null;
}
