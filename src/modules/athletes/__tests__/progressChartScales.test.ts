import { dateScale, filterByRange, timeScale, xFor, yFor } from '../components/ProgressChart/scales';

describe('timeScale', () => {
  it('puts a smaller time higher: the vertical axis is inverted', () => {
    const scale = timeScale([3482, 3710]);

    expect(yFor(3482, scale, 0, 100)).toBeLessThan(yFor(3710, scale, 0, 100));
  });

  it('maps the ends of the scale to the top and the bottom of the plot', () => {
    const scale = timeScale([3482, 3710]);

    expect(yFor(scale.ticks[0]!, scale, 10, 100)).toBe(10);
    expect(yFor(scale.ticks[scale.ticks.length - 1]!, scale, 10, 100)).toBe(110);
  });

  it.each([
    [[3482, 3710]],
    [[3482]],
    [[3500, 3500, 3500]],
    [[3482, 3573, 3710, 3790, 3820]],
    [[3482, 9120]],
    [[6150, 7490]],
  ])('gives 3 or 4 ascending whole-second ticks that cover %j', (times) => {
    const { ticks } = timeScale(times);

    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(4);
    expect(ticks.every((tick) => tick % 100 === 0)).toBe(true);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    expect(ticks[0]).toBeLessThanOrEqual(Math.min(...times));
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(Math.max(...times));
  });

  it('never invents a scale around zero for no times', () => {
    expect(timeScale([]).ticks).toEqual([]);
  });
});

describe('dateScale and xFor', () => {
  it('puts a later date further right', () => {
    const scale = dateScale(['2026-05-10', '2026-10-18']);

    expect(xFor('2026-05-10', scale, 40, 200)).toBe(40);
    expect(xFor('2026-10-18', scale, 40, 200)).toBe(240);
    expect(xFor('2026-07-01', scale, 40, 200)).toBeGreaterThan(40);
    expect(xFor('2026-07-01', scale, 40, 200)).toBeLessThan(240);
  });

  it('centres a single date', () => {
    const scale = dateScale(['2026-10-18', '2026-10-18']);

    expect(xFor('2026-10-18', scale, 40, 200)).toBe(140);
  });
});

describe('filterByRange', () => {
  const items = [
    { id: 'a', date: '2025-09-01' },
    { id: 'b', date: '2026-04-24' },
    { id: 'c', date: '2026-07-24' },
    { id: 'd', date: '2026-10-18' },
  ];
  const today = '2026-10-24';

  it.each([
    ['3m', ['c', 'd']],
    ['6m', ['b', 'c', 'd']],
    ['1y', ['b', 'c', 'd']],
    ['all', ['a', 'b', 'c', 'd']],
  ] as const)('range %s keeps %j', (range, ids) => {
    expect(filterByRange(items, range, today).map((item) => item.id)).toEqual(ids);
  });

  it('clamps the day when the month it goes back to is shorter', () => {
    const result = filterByRange([{ id: 'x', date: '2026-02-28' }, { id: 'y', date: '2026-02-27' }], '3m', '2026-05-31');

    expect(result.map((item) => item.id)).toEqual(['x']);
  });

  it('reads a today that carries a time as its day', () => {
    const result = filterByRange(items, '3m', '2026-10-24T15:30:00.000Z');

    expect(result.map((item) => item.id)).toEqual(['c', 'd']);
  });

  it.each(['', 'hoy', '2026-13-45', '2026-02-30', '24/10/2026'])('keeps everything, without throwing, when today is %j', (today) => {
    expect(() => filterByRange(items, '3m', today)).not.toThrow();
    expect(filterByRange(items, '3m', today).map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
