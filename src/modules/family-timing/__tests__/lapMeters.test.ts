import { lapMeters } from '../domain/laps';

// The meters at the end of each lap of a time, in its detail.
describe('lapMeters', () => {
  it('gives each lap one length of the pool when the laps fill the event', () => {
    expect(lapMeters('100m', 'SCM', 4)).toEqual([25, 50, 75, 100]);
    expect(lapMeters('200m', 'LCM', 4)).toEqual([50, 100, 150, 200]);
    expect(lapMeters('50m', 'SCM', 1)).toEqual([50]);
  });

  it('counts each marked lap as one length and the last one as what is left', () => {
    // Set up as 50 m, marked at 25 m, stopped at 100 m, then corrected to 100 m: 25 m and 75 m.
    expect(lapMeters('100m', 'SCM', 2)).toEqual([25, 100]);
    expect(lapMeters('800m', 'LCM', 3)).toEqual([50, 100, 800]);
  });

  it('shares the distance equally when there are more laps than lengths, and gives no meters when it does not divide', () => {
    expect(lapMeters('50m', 'SCM', 4)).toBeNull();
    expect(lapMeters('100m', 'LCM', 4)).toEqual([25, 50, 75, 100]);
    expect(lapMeters('50m', 'SCM', 5)).toEqual([10, 20, 30, 40, 50]);
    expect(lapMeters('25m', 'SCM', 3)).toBeNull();
    expect(lapMeters('50m', 'SCM', 0)).toBeNull();
  });
});
