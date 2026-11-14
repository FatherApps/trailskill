import { elapsedMillisAt, finalMillis, idleFamilyStopwatch, splitAt, splitMillis, startAt, stopAt } from '../domain/familyStopwatch';

const ms = (n: number) => BigInt(n) * 1_000_000n;

describe('family stopwatch', () => {
  it('measures start, splits and stop in milliseconds', () => {
    let sw = startAt(idleFamilyStopwatch, ms(1000));
    sw = splitAt(sw, ms(1000 + 30_512));
    sw = stopAt(sw, ms(1000 + 65_372));
    expect(splitMillis(sw)).toEqual([30_512]);
    expect(finalMillis(sw)).toBe(65_372);
  });

  it('truncates nanoseconds, never rounding up', () => {
    const sw = stopAt(startAt(idleFamilyStopwatch, 0n), 42_710_999_999n);
    expect(finalMillis(sw)).toBe(42_710);
  });

  it('ignores marks earlier than the last one', () => {
    let sw = startAt(idleFamilyStopwatch, ms(500));
    sw = splitAt(sw, ms(400));
    expect(splitMillis(sw)).toEqual([]);
  });

  it('keeps a stop at the very instant of the start as a missing time, never 0', () => {
    const sw = stopAt(startAt(idleFamilyStopwatch, ms(10)), ms(10));
    expect(finalMillis(sw)).toBeNull();
  });

  it('reads the running time without changing the state', () => {
    const sw = startAt(idleFamilyStopwatch, ms(0));
    expect(elapsedMillisAt(sw, ms(1234))).toBe(1234);
    expect(sw.status).toBe('running');
  });
});
