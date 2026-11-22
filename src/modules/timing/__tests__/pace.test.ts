import {
  consistency,
  defaultMarkMeters,
  halfSplit,
  paceSegments,
  projectFinish,
  type PaceMark,
} from '../domain/pace';

// 100 m in a 25 m pool, in hundredths: a slow start segment, then 16 s, 17 s and 18 s segments.
const marks: PaceMark[] = [
  { t: 1500, meters: 25 },
  { t: 3100, meters: 50 },
  { t: 4800, meters: 75 },
  { t: 6600, meters: 100 },
];

const scaled = (factor: number): PaceMark[] => marks.map((m) => ({ ...m, t: m.t * factor }));

describe('paceSegments', () => {
  it('gives the time, the pace per 100 m and the speed of every segment', () => {
    expect(paceSegments(marks)).toEqual([
      { fromMeters: 0, toMeters: 25, time: 1500, pacePer100: 6000, speed: 25 / 1500 },
      { fromMeters: 25, toMeters: 50, time: 1600, pacePer100: 6400, speed: 25 / 1600 },
      { fromMeters: 50, toMeters: 75, time: 1700, pacePer100: 6800, speed: 25 / 1700 },
      { fromMeters: 75, toMeters: 100, time: 1800, pacePer100: 7200, speed: 25 / 1800 },
    ]);
  });

  it('ignores the marks without meters and measures between the marks that have them', () => {
    const withGap: PaceMark[] = [
      { t: 1500, meters: 25 },
      { t: 3100, meters: null },
      { t: 4800, meters: 75 },
    ];
    expect(paceSegments(withGap).map((s) => [s.fromMeters, s.toMeters, s.time])).toEqual([
      [0, 25, 1500],
      [25, 75, 3300],
    ]);
  });

  it('is empty without any mark with meters, and a missing time is never turned into zero', () => {
    expect(paceSegments([])).toEqual([]);
    expect(paceSegments([{ t: 1500, meters: null }])).toEqual([]);
  });

  it('skips a mark that does not advance in meters or time instead of dividing by zero', () => {
    const bad: PaceMark[] = [
      { t: 1500, meters: 25 },
      { t: 1500, meters: 50 },
      { t: 3100, meters: 25 },
      { t: 3200, meters: 50 },
    ];
    expect(paceSegments(bad).map((s) => [s.fromMeters, s.toMeters, s.time])).toEqual([
      [0, 25, 1500],
      [25, 50, 1700],
    ]);
  });

  it('skips a zero first split', () => {
    expect(paceSegments([{ t: 0, meters: 25 }, { t: 1600, meters: 50 }]).map((s) => s.toMeters)).toEqual([50]);
  });
});

describe('halfSplit', () => {
  it('compares the first and the second half, positive when the second is slower', () => {
    expect(halfSplit(marks, 100)).toEqual({ first: 3100, second: 3500, difference: 400 });
  });

  it('needs a mark at exactly half the distance and one at the full distance', () => {
    expect(halfSplit([{ t: 1500, meters: 25 }, { t: 6600, meters: 100 }], 100)).toBeNull();
    expect(halfSplit(marks.slice(0, 3), 100)).toBeNull();
  });
});

describe('consistency', () => {
  it('is the coefficient of variation of the pace per segment, without the start segment', () => {
    const paces = [6400, 6800, 7200];
    const mean = paces.reduce((a, b) => a + b, 0) / 3;
    const sd = Math.sqrt(paces.reduce((a, p) => a + (p - mean) ** 2, 0) / 3);
    expect(consistency(marks)).toBeCloseTo(sd / mean, 10);
  });

  it('is zero for an even pace after the start', () => {
    const even: PaceMark[] = [
      { t: 1500, meters: 25 },
      { t: 3100, meters: 50 },
      { t: 4700, meters: 75 },
    ];
    expect(consistency(even)).toBe(0);
  });

  it('is null with fewer than two segments after the start', () => {
    expect(consistency(marks.slice(0, 2))).toBeNull();
    expect(consistency([])).toBeNull();
  });
});

describe('projectFinish', () => {
  it('projects t_k + (D - d_k) * pace after the start segment', () => {
    // Marks at 25 m (14 s) and 50 m (30 s): 16 s per 25 m after the start, so 0.64 s per meter.
    const half: PaceMark[] = [
      { t: 1400, meters: 25 },
      { t: 3000, meters: 50 },
    ];
    expect(projectFinish(half, 100)).toBeCloseTo(3000 + 50 * 0.64 * 100, 6);
  });

  it('is null with a single mark with meters, because the only segment is the start one', () => {
    expect(projectFinish([{ t: 1400, meters: 25 }], 100)).toBeNull();
    expect(
      projectFinish(
        [
          { t: 1400, meters: 25 },
          { t: 3000, meters: null },
        ],
        100,
      ),
    ).toBeNull();
  });

  it('ignores the marks without meters', () => {
    const noisy: PaceMark[] = [
      { t: 1400, meters: 25 },
      { t: 2200, meters: null },
      { t: 3000, meters: 50 },
    ];
    expect(projectFinish(noisy, 100)).toBeCloseTo(3000 + 50 * 0.64 * 100, 6);
  });

  it('is the final time when the last mark is the whole distance', () => {
    expect(projectFinish(marks, 100)).toBe(6600);
  });

  it('is null when a split is longer than the event, because the distance is not the one measured', () => {
    expect(projectFinish(marks, 50)).toBeNull();
  });
});

describe('defaultMarkMeters', () => {
  it('is k times the pool length', () => {
    expect([1, 2, 3].map((k) => defaultMarkMeters(k, 25, 100))).toEqual([25, 50, 75]);
  });

  it('is null from the first mark that reaches the distance, which is the final one', () => {
    expect(defaultMarkMeters(4, 25, 100)).toBeNull();
    expect(defaultMarkMeters(5, 25, 100)).toBeNull();
  });

  it('does not invent meters when the pool length does not divide the event', () => {
    expect([1, 2, 3, 4].map((k) => defaultMarkMeters(k, 50, 75))).toEqual([50, null, null, null]);
    expect(defaultMarkMeters(1, 50, 50)).toBeNull();
  });

  it('is null without a valid pool length or mark number', () => {
    expect(defaultMarkMeters(1, 0, 100)).toBeNull();
    expect(defaultMarkMeters(0, 25, 100)).toBeNull();
  });
});

describe('units', () => {
  it('gives the same result in milliseconds as in hundredths, scaling the input', () => {
    const ms = scaled(10);
    expect(paceSegments(ms).map((s) => s.pacePer100)).toEqual(paceSegments(marks).map((s) => s.pacePer100 * 10));
    expect(halfSplit(ms, 100)).toEqual({ first: 31000, second: 35000, difference: 4000 });
    expect(consistency(ms)).toBeCloseTo(consistency(marks) as number, 10);
    expect(projectFinish(ms.slice(0, 2), 100)).toBeCloseTo((projectFinish(marks.slice(0, 2), 100) as number) * 10, 6);
  });
});
