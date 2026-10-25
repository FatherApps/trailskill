import { formatTime } from '../../../core/time';
import { elapsedAt, idleStopwatch, reset, split, splitTimes, start, stop, totalTime } from '../domain/stopwatch';

// Simulated monotonic marks in nanoseconds.
const s = (seconds: number) => BigInt(Math.round(seconds * 1e9));

describe('stopwatch', () => {
  it('takes the total time from the difference of marks', () => {
    const running = start(idleStopwatch, s(100));
    const stopped = stop(running, s(132.456));
    expect(totalTime(stopped)).toBe(3245);
    expect(formatTime(totalTime(stopped))).toBe('32,45');
  });

  it('does not depend on how many times a tick reads the elapsed time', () => {
    const running = start(idleStopwatch, s(10));
    for (let i = 1; i <= 1000; i++) elapsedAt(running, s(10 + i * 0.016));
    expect(elapsedAt(running, s(25.5))).toBe(1550);
    expect(totalTime(stop(running, s(70.01)))).toBe(6001);
  });

  it('computes splits as the difference between each split mark and the start', () => {
    let sw = start(idleStopwatch, s(5));
    sw = split(sw, s(35.12));
    sw = split(sw, s(66.4));
    sw = stop(sw, s(98));
    expect(splitTimes(sw)).toEqual([3012, 6140]);
    expect(totalTime(sw)).toBe(9300);
  });

  it('represents an unrecorded time as null, never 0', () => {
    const running = start(idleStopwatch, s(1));
    expect(totalTime(idleStopwatch)).toBeNull();
    expect(totalTime(running)).toBeNull();
    expect(elapsedAt(idleStopwatch, s(9))).toBeNull();
    expect(splitTimes(idleStopwatch)).toEqual([]);
    expect(formatTime(totalTime(running))).toBe('—');
  });

  it('returns the same state for split before start, stop without start and a double stop', () => {
    expect(split(idleStopwatch, s(1))).toBe(idleStopwatch);
    expect(stop(idleStopwatch, s(1))).toBe(idleStopwatch);
    const stopped = stop(start(idleStopwatch, s(1)), s(2));
    expect(stop(stopped, s(3))).toBe(stopped);
    expect(split(stopped, s(3))).toBe(stopped);
  });

  it('returns the same state when started twice or after stopping', () => {
    const running = start(idleStopwatch, s(1));
    expect(start(running, s(2))).toBe(running);
    const stopped = stop(running, s(3));
    expect(start(stopped, s(4))).toBe(stopped);
  });

  it('ignores a mark earlier than the last one, so a time is never negative', () => {
    const running = split(start(idleStopwatch, s(10)), s(20));
    expect(split(running, s(15))).toBe(running);
    expect(stop(running, s(15))).toBe(running);
  });

  it('resets to idle', () => {
    expect(reset()).toEqual(idleStopwatch);
    expect(totalTime(reset())).toBeNull();
  });
});
