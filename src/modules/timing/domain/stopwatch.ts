import { hundredthsFromNanos, type Hundredths } from '../../../core/time';

export type Stopwatch =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly startedAt: bigint; readonly splitMarks: readonly bigint[] }
  | {
      readonly status: 'stopped';
      readonly startedAt: bigint;
      readonly splitMarks: readonly bigint[];
      readonly stoppedAt: bigint;
    };

export const idleStopwatch: Stopwatch = { status: 'idle' };

export function start(sw: Stopwatch, at: bigint): Stopwatch {
  return sw.status === 'idle' ? { status: 'running', startedAt: at, splitMarks: [] } : sw;
}

// A mark earlier than the last one is ignored, so a time is never negative.
const isInOrder = (sw: { startedAt: bigint; splitMarks: readonly bigint[] }, at: bigint) =>
  at >= (sw.splitMarks[sw.splitMarks.length - 1] ?? sw.startedAt);

export function split(sw: Stopwatch, at: bigint): Stopwatch {
  if (sw.status !== 'running' || !isInOrder(sw, at)) return sw;
  return { ...sw, splitMarks: [...sw.splitMarks, at] };
}

export function stop(sw: Stopwatch, at: bigint): Stopwatch {
  if (sw.status !== 'running' || !isInOrder(sw, at)) return sw;
  return { status: 'stopped', startedAt: sw.startedAt, splitMarks: sw.splitMarks, stoppedAt: at };
}

export function reset(): Stopwatch {
  return idleStopwatch;
}

export function totalTime(sw: Stopwatch): Hundredths | null {
  return sw.status === 'stopped' ? hundredthsFromNanos(sw.stoppedAt - sw.startedAt) : null;
}

// Pure read for a UI tick: it does not change the state.
export function elapsedAt(sw: Stopwatch, now: bigint): Hundredths | null {
  if (sw.status === 'running') return hundredthsFromNanos(now - sw.startedAt);
  return totalTime(sw);
}

export function splitTimes(sw: Stopwatch): Hundredths[] {
  if (sw.status === 'idle') return [];
  return sw.splitMarks.map((mark) => hundredthsFromNanos(mark - sw.startedAt));
}
