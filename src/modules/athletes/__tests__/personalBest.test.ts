import type { Hundredths } from '../../../core/time';
import type { HistoryMeasurement } from '../data/history';
import { personalBest } from '../personalBest';

function result(id: string, hundredths: number | null, capturedAt: string, kind: HistoryMeasurement['kind'] = 'race'): HistoryMeasurement {
  return {
    id,
    kind,
    athleteId: 'athlete-1',
    seriesId: null,
    arrivalPosition: null,
    hundredths: kind === 'completed' ? null : (hundredths as Hundredths | null),
    stroke: 'FR',
    distance: '50m',
    pool: 'SCM',
    sessionType: 'training',
    source: 'screen_button',
    createdBy: 'coach-a',
    deviceId: 'device-a',
    capturedAt,
    parentId: null,
    origin: 'own',
  } as HistoryMeasurement;
}

describe('personalBest', () => {
  it('returns null for an empty list', () => {
    expect(personalBest([])).toBeNull();
  });

  it('returns the only valid result with no improvement', () => {
    expect(personalBest([result('a', 3000, '2026-01-01T08:00:00Z')])).toEqual({
      id: 'a',
      hundredths: 3000,
      date: '2026-01-01T08:00:00Z',
      kind: 'race',
      origin: 'own',
      improvement: null,
    });
  });

  it('returns the fastest result and its improvement over the previous best', () => {
    const pb = personalBest([
      result('a', 3200, '2026-01-01T08:00:00Z'),
      result('b', 3000, '2026-02-01T08:00:00Z'),
      result('c', 2900, '2026-03-01T08:00:00Z'),
    ]);

    expect(pb).toMatchObject({ id: 'c', hundredths: 2900, improvement: { hundredths: 100, previousDate: '2026-02-01T08:00:00Z' } });
  });

  it('counts a race time', () => {
    expect(personalBest([result('a', 3000, '2026-01-01T08:00:00Z', 'race')])?.kind).toBe('race');
  });

  it('counts a repetition time', () => {
    expect(personalBest([result('a', 3000, '2026-01-01T08:00:00Z', 'repetition')])?.kind).toBe('repetition');
  });

  it('ignores a split even when it is faster', () => {
    const pb = personalBest([result('a', 3000, '2026-01-01T08:00:00Z'), result('s', 1400, '2026-01-01T08:00:00Z', 'split')]);

    expect(pb?.id).toBe('a');
  });

  it('ignores a series total even when it is faster', () => {
    const pb = personalBest([result('a', 3000, '2026-01-01T08:00:00Z'), result('t', 1000, '2026-02-01T08:00:00Z', 'series_total')]);

    expect(pb?.id).toBe('a');
  });

  it('returns null when every time is missing, never 0', () => {
    expect(personalBest([result('a', null, '2026-01-01T08:00:00Z')])).toBeNull();
  });

  it('ignores a missing time next to a valid one', () => {
    const pb = personalBest([result('a', null, '2026-01-01T08:00:00Z'), result('b', 3000, '2026-02-01T08:00:00Z')]);

    expect(pb).toMatchObject({ id: 'b', hundredths: 3000, improvement: null });
  });

  it('ignores a completed entry', () => {
    expect(personalBest([result('a', null, '2026-01-01T08:00:00Z', 'completed')])).toBeNull();
  });

  it('keeps the first achievement on a tie and measures the improvement against the best before it', () => {
    const pb = personalBest([
      result('a', 3000, '2026-01-01T08:00:00Z'),
      result('b', 2900, '2026-02-01T08:00:00Z'),
      result('c', 2900, '2026-03-01T08:00:00Z'),
    ]);

    expect(pb).toMatchObject({ id: 'b', improvement: { hundredths: 100, previousDate: '2026-01-01T08:00:00Z' } });
  });

  it('has no improvement when the best came first and later times are slower', () => {
    const pb = personalBest([result('a', 2900, '2026-01-01T08:00:00Z'), result('b', 3000, '2026-02-01T08:00:00Z')]);

    expect(pb).toMatchObject({ id: 'a', improvement: null });
  });

  it('does not depend on the input order', () => {
    const list = [
      result('a', 3000, '2026-01-01T08:00:00Z'),
      result('b', 2900, '2026-02-01T08:00:00Z'),
      result('c', 2900, '2026-03-01T08:00:00Z'),
    ];

    expect(personalBest([...list].reverse())).toEqual(personalBest(list));
  });
});
