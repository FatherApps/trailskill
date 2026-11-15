import { millisFromNanos, type Millis } from '../../../core/time';
import { pressSeries, readySeries, undoLastArrival, type Series } from '../../timing';

// A guardian's series: 2 to 8 swimmers with one start. The arrival logic is the coach's (timing module); here it only
// takes exactly as many arrivals as swimmers, and the times come out in milliseconds (Ajustes shows them in hundredths or thousandths).
export const MIN_SWIMMERS = 2;
export const MAX_SWIMMERS = 8;

export type FamilySeries = { readonly size: number; readonly series: Series };

export type FamilySeriesStatus = 'idle' | 'running' | 'done';

export function newFamilySeries(size: number): FamilySeries {
  return { size: Math.min(MAX_SWIMMERS, Math.max(MIN_SWIMMERS, Math.round(size))), series: readySeries };
}

export function seriesStatus(fs: FamilySeries): FamilySeriesStatus {
  if (fs.series.status === 'ready') return 'idle';
  return fs.series.arrivals.length >= fs.size ? 'done' : 'running';
}

/** The first press starts the clock; each later one closes the next swimmer. A press after the last swimmer is ignored. */
export function pressAt(fs: FamilySeries, at: bigint): FamilySeries {
  if (seriesStatus(fs) === 'done') return fs;
  const series = pressSeries(fs.series, at);
  return series === fs.series ? fs : { ...fs, series };
}

/** Removes only the last arrival; the clock keeps running from the same start. */
export function undoLast(fs: FamilySeries): FamilySeries {
  const series = undoLastArrival(fs.series);
  return series === fs.series ? fs : { ...fs, series };
}

/** Each arrival's time since the start, in arrival order. An arrival at the very instant of the start has no time (null, never 0). */
export function arrivalMillis(fs: FamilySeries): (Millis | null)[] {
  const { series } = fs;
  if (series.status === 'ready') return [];
  return series.arrivals.map((a) => {
    const value = millisFromNanos(a.at - series.startedAt);
    return value > 0 ? value : null;
  });
}

/** The running time, or the last arrival once every swimmer arrived; null before the start. */
export function seriesElapsedAt(fs: FamilySeries, now: bigint): Millis | null {
  const { series } = fs;
  if (series.status === 'ready') return null;
  const end = seriesStatus(fs) === 'done' ? series.arrivals[series.arrivals.length - 1].at : now;
  return millisFromNanos(end - series.startedAt);
}

export function startedAtOf(fs: FamilySeries): bigint | null {
  return fs.series.status === 'running' ? fs.series.startedAt : null;
}
