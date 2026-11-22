import { defaultSplitMeters, formatMeters, parseSplitMeters } from '../domain/splitMeters';

describe('defaultSplitMeters', () => {
  it('gives each mark k times the pool length and null once it reaches the distance', () => {
    expect(defaultSplitMeters(3, 25, 100)).toEqual([25, 50, 75]);
    expect(defaultSplitMeters(5, 25, 100)).toEqual([25, 50, 75, null, null]);
    expect(defaultSplitMeters(2, 50, 50)).toEqual([null, null]);
  });

  it('has no marks without marks', () => {
    expect(defaultSplitMeters(0, 25, 100)).toEqual([]);
  });
});

describe('parseSplitMeters', () => {
  it('reads each field, with a comma or a point, and an empty one as no meters, never 0', () => {
    expect(parseSplitMeters(['25', '37,5', '', '60.5'], 100)).toEqual({ ok: true, value: [25, 37.5, null, 60.5] });
  });

  it('accepts values that only increase among the marks that have meters', () => {
    expect(parseSplitMeters(['25', '', '75'], 100)).toEqual({ ok: true, value: [25, null, 75] });
  });

  it.each(['abc', '-5', '1e2', '25 m', '2,5,5'])('refuses %s as not a number', (text) => {
    expect(parseSplitMeters([text], 100)).toEqual({ ok: false, reason: 'format' });
  });

  it.each(['0', '0,0', '100', '150'])('refuses %s: meters are above 0 and below the distance', (text) => {
    expect(parseSplitMeters([text], 100)).toEqual({ ok: false, reason: 'range' });
  });

  it('refuses meters that do not increase, a repeated value included', () => {
    expect(parseSplitMeters(['50', '25'], 100)).toEqual({ ok: false, reason: 'order' });
    expect(parseSplitMeters(['50', '50'], 100)).toEqual({ ok: false, reason: 'order' });
  });
});

describe('formatMeters', () => {
  it('writes whole meters plainly and decimals with a comma', () => {
    expect(formatMeters(50)).toBe('50');
    expect(formatMeters(37.5)).toBe('37,5');
  });
});
