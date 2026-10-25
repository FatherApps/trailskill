import { hundredthsFromNanos, type Hundredths } from '../../../core/time';

export type AthleteId = string;

type Arrival = { readonly at: bigint; readonly athleteId: AthleteId | null };

export type Series =
  | { readonly status: 'ready' }
  | { readonly status: 'running'; readonly startedAt: bigint; readonly arrivals: readonly Arrival[] };

export const readySeries: Series = { status: 'ready' };

export type AssignResult =
  | { ok: true; series: Series }
  | { ok: false; reason: 'no_open_position' }
  | { ok: false; reason: 'athlete_already_assigned'; position: number };

export function press(series: Series, at: bigint): Series {
  if (series.status === 'ready') return { status: 'running', startedAt: at, arrivals: [] };
  // A mark earlier than the last one is ignored, so a time is never negative.
  const last = series.arrivals[series.arrivals.length - 1]?.at ?? series.startedAt;
  if (at < last) return series;
  return { ...series, arrivals: [...series.arrivals, { at, athleteId: null }] };
}

export function undoLastArrival(series: Series): Series {
  if (series.status === 'ready' || series.arrivals.length === 0) return series;
  return { ...series, arrivals: series.arrivals.slice(0, -1) };
}

export function nextSeries(): Series {
  return readySeries;
}

export function arrivals(series: Series): { position: number; time: Hundredths; athleteId: AthleteId | null }[] {
  if (series.status === 'ready') return [];
  return series.arrivals.map((a, i) => ({
    position: i + 1,
    time: hundredthsFromNanos(a.at - series.startedAt),
    athleteId: a.athleteId,
  }));
}

export function unassignedPositions(series: Series): number[] {
  return arrivals(series)
    .filter((a) => a.athleteId === null)
    .map((a) => a.position);
}

export function highlightedPosition(series: Series): number | null {
  return unassignedPositions(series)[0] ?? null;
}

// Duplicate athletes are rejected (decided by the orchestrator, issue #47); the user must reopen the other position first.
export function assignHighlighted(series: Series, athleteId: AthleteId): AssignResult {
  const existing = arrivals(series).find((a) => a.athleteId === athleteId);
  if (existing) return { ok: false, reason: 'athlete_already_assigned', position: existing.position };
  const position = highlightedPosition(series);
  if (position === null || series.status === 'ready') return { ok: false, reason: 'no_open_position' };
  return { ok: true, series: withAthlete(series, position, athleteId) };
}

export function reopen(series: Series, position: number): Series {
  if (series.status === 'ready' || series.arrivals[position - 1]?.athleteId == null) return series;
  return withAthlete(series, position, null);
}

function withAthlete(
  series: Extract<Series, { status: 'running' }>,
  position: number,
  athleteId: AthleteId | null,
): Series {
  return {
    ...series,
    arrivals: series.arrivals.map((a, i) => (i === position - 1 ? { ...a, athleteId } : a)),
  };
}
