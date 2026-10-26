import { arrivalClockTime, formatClockTime } from '../domain/clockTime';

const at = (hours: number, minutes: number, seconds: number, ms = 0) => new Date(2026, 9, 25, hours, minutes, seconds, ms).getTime();

describe('clock time of a series', () => {
  it('writes the wall-clock time with an unpadded hour and padded minutes and seconds', () => {
    expect(formatClockTime(at(7, 14, 2))).toBe('7:14:02');
    expect(formatClockTime(at(0, 5, 9))).toBe('0:05:09');
  });

  it('uses 24 hours, so the afternoon is never taken for the morning', () => {
    expect(formatClockTime(at(14, 14, 2))).toBe('14:14:02');
  });

  it('rounds to the nearest second', () => {
    expect(formatClockTime(at(7, 14, 2, 400))).toBe('7:14:02');
    expect(formatClockTime(at(7, 14, 2, 600))).toBe('7:14:03');
    expect(formatClockTime(at(7, 59, 59, 600))).toBe('8:00:00');
  });

  it('adds the time on the series clock to the wall-clock start of the series', () => {
    const start = at(7, 14, 2);

    // The arrivals of the reference screen: 31,05 / 33,91 / 35,22 after a 7:14:02 start.
    expect(arrivalClockTime(start, 3105)).toBe('7:14:33');
    expect(arrivalClockTime(start, 3391)).toBe('7:14:36');
    expect(arrivalClockTime(start, 3522)).toBe('7:14:37');
  });

  it('carries over the minute', () => {
    expect(arrivalClockTime(at(7, 14, 50), 3105)).toBe('7:15:21');
  });
});
