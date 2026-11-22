// Pace maths for the free laps of one measurement (rule 8 of docs/product/my-times-rules.md).
// Pure and unit-free: `t` is the running time from the start in any unit (milliseconds or hundredths),
// and results in time units come back in the same unit. A measurement is one stroke in one pool:
// never mix measurements. A mark without meters is ignored, and a missing time is never zero.

export type PaceMark = { readonly t: number; readonly meters: number | null };

export type PaceSegment = {
  readonly fromMeters: number;
  readonly toMeters: number;
  readonly time: number;
  /** Time to cover 100 m at the pace of this segment. */
  readonly pacePer100: number;
  /** Meters per time unit. */
  readonly speed: number;
};

type Point = { readonly t: number; readonly meters: number };

// Marks with meters, in order, from the start (0 m, time 0). A mark that does not advance in both
// meters and time is skipped, so no segment divides by zero.
function points(marks: readonly PaceMark[]): Point[] {
  const kept: Point[] = [{ t: 0, meters: 0 }];
  for (const mark of marks) {
    const last = kept[kept.length - 1];
    if (mark.meters === null || mark.meters <= last.meters || mark.t <= last.t) continue;
    kept.push({ t: mark.t, meters: mark.meters });
  }
  return kept;
}

/** Default meters of the k-th free mark (k starts at 1): k times the pool length, null once it reaches the distance. */
export function defaultMarkMeters(k: number, poolLength: number, distance: number): number | null {
  if (!(k >= 1) || !(poolLength > 0)) return null;
  const meters = k * poolLength;
  return meters < distance ? meters : null;
}

/** One segment between each pair of consecutive marks with meters; the first one is the start segment. */
export function paceSegments(marks: readonly PaceMark[]): PaceSegment[] {
  const p = points(marks);
  return p.slice(1).map((to, i) => {
    const from = p[i];
    const time = to.t - from.t;
    const meters = to.meters - from.meters;
    return { fromMeters: from.meters, toMeters: to.meters, time, pacePer100: (time / meters) * 100, speed: meters / time };
  });
}

/** Second half minus first half (positive when the second is slower). Needs marks at half the distance and at the distance. */
export function halfSplit(
  marks: readonly PaceMark[],
  distance: number,
): { first: number; second: number; difference: number } | null {
  const p = points(marks);
  const half = p.find((x) => x.meters === distance / 2);
  const end = p.find((x) => x.meters === distance);
  if (!half || !end) return null;
  const second = end.t - half.t;
  return { first: half.t, second, difference: second - half.t };
}

/** Coefficient of variation of the pace of the segments after the start segment; null with fewer than two of them. */
export function consistency(marks: readonly PaceMark[]): number | null {
  const paces = paceSegments(marks)
    .slice(1)
    .map((s) => s.time / (s.toMeters - s.fromMeters));
  if (paces.length < 2) return null;
  const mean = paces.reduce((a, b) => a + b, 0) / paces.length;
  const variance = paces.reduce((a, x) => a + (x - mean) ** 2, 0) / paces.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Finish time if the swimmer keeps the pace after the start segment: t_k + (D - d_k) * pace.
 * Null without at least one segment besides the start one, or when the last mark is beyond the distance.
 */
export function projectFinish(marks: readonly PaceMark[], distance: number): number | null {
  const p = points(marks);
  if (p.length < 3) return null;
  const first = p[1];
  const last = p[p.length - 1];
  if (last.meters > distance) return null;
  const pace = (last.t - first.t) / (last.meters - first.meters);
  return last.t + (distance - last.meters) * pace;
}
