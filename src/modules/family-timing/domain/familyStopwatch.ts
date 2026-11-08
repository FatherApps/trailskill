import { millisFromNanos, type Millis } from '../../../core/time';

// The guardian's stopwatch: one swimmer, start, splits and stop, in monotonic nanoseconds. Times come out in milliseconds,
// so the person can show them in hundredths or thousandths (Ajustes).
export type FamilyStopwatch =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly startedAt: bigint; readonly splitMarks: readonly bigint[] }
  | { readonly status: 'stopped'; readonly startedAt: bigint; readonly splitMarks: readonly bigint[]; readonly stoppedAt: bigint };

export const idleFamilyStopwatch: FamilyStopwatch = { status: 'idle' };

// A mark earlier than the last one is ignored, so a time is never negative.
const inOrder = (sw: { startedAt: bigint; splitMarks: readonly bigint[] }, at: bigint) => at >= (sw.splitMarks[sw.splitMarks.length - 1] ?? sw.startedAt);

export function startAt(sw: FamilyStopwatch, at: bigint): FamilyStopwatch {
  return sw.status === 'idle' ? { status: 'running', startedAt: at, splitMarks: [] } : sw;
}

export function splitAt(sw: FamilyStopwatch, at: bigint): FamilyStopwatch {
  if (sw.status !== 'running' || !inOrder(sw, at)) return sw;
  return { ...sw, splitMarks: [...sw.splitMarks, at] };
}

export function stopAt(sw: FamilyStopwatch, at: bigint): FamilyStopwatch {
  if (sw.status !== 'running' || !inOrder(sw, at)) return sw;
  return { status: 'stopped', startedAt: sw.startedAt, splitMarks: sw.splitMarks, stoppedAt: at };
}

/** The final time; null until stopped, and null (never 0) for a stop at the very instant of the start. */
export function finalMillis(sw: FamilyStopwatch): Millis | null {
  if (sw.status !== 'stopped') return null;
  const value = millisFromNanos(sw.stoppedAt - sw.startedAt);
  return value > 0 ? value : null;
}

export function elapsedMillisAt(sw: FamilyStopwatch, now: bigint): Millis | null {
  if (sw.status === 'running') return millisFromNanos(now - sw.startedAt);
  return finalMillis(sw);
}

/** Cumulative split times since the start. */
export function splitMillis(sw: FamilyStopwatch): Millis[] {
  if (sw.status === 'idle') return [];
  return sw.splitMarks.map((mark) => millisFromNanos(mark - sw.startedAt));
}
