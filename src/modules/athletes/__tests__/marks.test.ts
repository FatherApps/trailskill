import type { Hundredths } from '../../../core/time';
import { importedAchievement } from '../achievements';
import type { HistoryMeasurement } from '../data/history';
import { createInMemoryHistoryRepository } from '../data/inMemoryHistoryRepository';
import { listedEvents, marksByEvent, marksByStroke } from '../marks';
import { personalBest } from '../personalBest';

// Synthetic data only.
function result(
  id: string,
  hundredths: number | null,
  capturedAt: string,
  over: Partial<HistoryMeasurement> = {},
): HistoryMeasurement {
  return {
    id,
    kind: 'race',
    athleteId: 'a1',
    seriesId: null,
    arrivalPosition: null,
    hundredths: hundredths as Hundredths | null,
    stroke: 'FR',
    distance: '50m',
    pool: 'SCM',
    sessionType: 'competition',
    source: 'screen_button',
    createdBy: 'coach-a',
    deviceId: 'device-a',
    capturedAt,
    parentId: null,
    origin: 'own',
    ...over,
  } as HistoryMeasurement;
}

const rowOf = (rows: ReturnType<typeof marksByEvent>, stroke: string, distance: string) =>
  rows.find((row) => row.stroke === stroke && row.distance === distance);
const ids = (rows: ReturnType<typeof marksByEvent>) => rows.map((row) => `${row.stroke}${row.distance}`);

describe('marksByEvent', () => {
  it('lists the seven events of the design in order, empty when the athlete has no time there', () => {
    const rows = marksByEvent([], 'SCM');

    expect(ids(rows)).toEqual(['FR50m', 'FR100m', 'BK50m', 'BK100m', 'BR50m', 'FL50m', 'IM100m']);
    expect(rows.map(({ stroke, distance }) => ({ stroke, distance }))).toEqual(listedEvents('SCM'));
    expect(rows.every((row) => row.best === null)).toBe(true);
  });

  it('does not add the empty IM 100 row in the long pool, because that event is not swum there', () => {
    expect(ids(marksByEvent([], 'LCM'))).toEqual(['FR50m', 'FR100m', 'BK50m', 'BK100m', 'BR50m', 'FL50m']);
  });

  it('shows IM 100 in the long pool when it has a mark, in its place among the seven', () => {
    const rows = marksByEvent([result('a', 8000, '2026-10-18T08:00:00Z', { stroke: 'IM', distance: '100m', pool: 'LCM' })], 'LCM');

    expect(ids(rows)).toEqual(['FR50m', 'FR100m', 'BK50m', 'BK100m', 'BR50m', 'FL50m', 'IM100m']);
    expect(rowOf(rows, 'IM', '100m')?.best?.hundredths).toBe(8000);
  });

  it('never turns a missing time into a best of zero', () => {
    const rows = marksByEvent([result('a', null, '2026-10-01T08:00:00Z')], 'SCM');

    expect(rowOf(rows, 'FR', '50m')?.best).toBeNull();
  });

  it('gives each event the same best the profile computes for it', async () => {
    const measurements = [
      result('a', 3500, '2026-09-01T08:00:00Z'),
      result('b', 3482, '2026-10-18T08:00:00Z'),
      result('c', 4108, '2026-10-02T08:00:00Z', { stroke: 'BK', kind: 'repetition', sessionType: 'training' }),
      // A split is not eligible for a best, as in the profile.
      result('d', 1000, '2026-10-03T08:00:00Z', { stroke: 'BK', kind: 'split' }),
    ];
    const history = createInMemoryHistoryRepository(measurements);
    const rows = marksByEvent(await history.listByAthlete('a1'), 'SCM');

    for (const [stroke, distance] of [['FR', '50m'], ['BK', '50m']] as const) {
      const profile = personalBest(await history.listByEvent('a1', { stroke, distance, pool: 'SCM' }));
      expect(rowOf(rows, stroke, distance)?.best).toEqual(profile);
    }
    expect(rowOf(rows, 'FR', '50m')?.best?.hundredths).toBe(3482);
  });

  it('keeps the pools apart', () => {
    const measurements = [result('a', 3482, '2026-10-18T08:00:00Z'), result('b', 3300, '2026-10-19T08:00:00Z', { pool: 'LCM' })];

    expect(rowOf(marksByEvent(measurements, 'SCM'), 'FR', '50m')?.best?.hundredths).toBe(3482);
    expect(rowOf(marksByEvent(measurements, 'LCM'), 'FR', '50m')?.best?.hundredths).toBe(3300);
  });

  describe('with imported official results', () => {
    const official = (id: string, hundredths: number | null, swumOn: string, over: Partial<Parameters<typeof importedAchievement>[0]> = {}) =>
      importedAchievement({ id, provider: 'xx-demo', stroke: 'FR', distance: '50m', pool: 'LCM', hundredths: hundredths as Hundredths | null, swumOn, ...over }, 'Federación Demo');

    it('shows the marks of an athlete who only has imported results', () => {
      const rows = marksByEvent([official('i1', 3300, '2026-09-12'), official('i2', 7100, '2026-09-13', { distance: '100m' })], 'LCM');

      expect(rowOf(rows, 'FR', '50m')?.best).toMatchObject({ id: 'i1', hundredths: 3300, origin: 'import', sourceName: 'Federación Demo' });
      expect(rowOf(rows, 'FR', '100m')?.best?.hundredths).toBe(7100);
    });

    it('compares the measured and the imported times of the same event and pool together', () => {
      const rows = marksByEvent([result('a', 3482, '2026-10-18T08:00:00Z', { pool: 'LCM' }), official('i1', 3300, '2026-09-12')], 'LCM');

      expect(rowOf(rows, 'FR', '50m')?.best).toMatchObject({ id: 'i1', improvement: null });
    });

    it('gives a tie between a measured and an imported time to the first one achieved, whatever the source', () => {
      const early = result('a', 3300, '2026-08-01T08:00:00Z', { pool: 'LCM' });
      const late = official('i1', 3300, '2026-09-12');
      const lateMeasured = result('b', 3300, '2026-10-01T08:00:00Z', { pool: 'LCM' });
      const earlyImported = official('i2', 3300, '2026-07-01');

      expect(rowOf(marksByEvent([early, late], 'LCM'), 'FR', '50m')?.best?.id).toBe('a');
      expect(rowOf(marksByEvent([lateMeasured, earlyImported], 'LCM'), 'FR', '50m')?.best?.id).toBe('i2');
    });

    it('keeps the pools apart', () => {
      const rows = marksByEvent([official('i1', 3300, '2026-09-12')], 'SCM');

      expect(rowOf(rows, 'FR', '50m')?.best).toBeNull();
    });
  });

  it('adds the other events with a mark after the seven, in catalog order (stroke, then distance)', () => {
    const rows = marksByEvent(
      [
        result('a', 7000, '2026-10-18T08:00:00Z', { stroke: 'BK', distance: '200m' }),
        result('b', 6000, '2026-10-18T08:00:00Z', { stroke: 'FR', distance: '200m' }),
        result('c', 3000, '2026-10-18T08:00:00Z', { stroke: 'FR', distance: '25m' }),
      ],
      'SCM',
    );

    expect(ids(rows).slice(7)).toEqual(['FR25m', 'FR200m', 'BK200m']);
  });
});

describe('marksByStroke', () => {
  const sections = (measurements: HistoryMeasurement[], pool: 'SCM' | 'LCM') =>
    marksByStroke(marksByEvent(measurements, pool)).map(({ stroke, rows }) => [stroke, rows.map((row) => row.distance)]);

  it('groups the listed events by stroke in catalog order, each stroke by distance', () => {
    expect(sections([], 'SCM')).toEqual([
      ['FR', ['50m', '100m']],
      ['BK', ['50m', '100m']],
      ['BR', ['50m']],
      ['FL', ['50m']],
      ['IM', ['100m']],
    ]);
  });

  it('puts an event with a mark among the listed ones of its stroke by distance, whatever order it came in', () => {
    const rows = marksByStroke(
      marksByEvent(
        [
          result('a', 20000, '2026-10-01T08:00:00Z', { distance: '200m' }),
          result('b', 2000, '2026-10-02T08:00:00Z', { distance: '25m' }),
        ],
        'SCM',
      ),
    );

    expect(rows[0].stroke).toBe('FR');
    expect(rows[0].rows.map((row) => row.distance)).toEqual(['25m', '50m', '100m', '200m']);
  });

  it('keeps the long pool without an empty IM 100, so IM has no section there', () => {
    expect(sections([], 'LCM').map(([stroke]) => stroke)).toEqual(['FR', 'BK', 'BR', 'FL']);
  });

  it('shows the IM section in the long pool once IM 100 has a mark', () => {
    const marked = result('a', 8000, '2026-10-18T08:00:00Z', { stroke: 'IM', distance: '100m', pool: 'LCM' });

    expect(sections([marked], 'LCM').map(([stroke]) => stroke)).toEqual(['FR', 'BK', 'BR', 'FL', 'IM']);
  });

  it('has no section for a stroke without rows', () => {
    expect(marksByStroke([])).toEqual([]);
  });

  it('keeps every row of marksByEvent, only regrouped', () => {
    const rows = marksByEvent([result('a', 3482, '2026-10-18T08:00:00Z')], 'SCM');

    expect(marksByStroke(rows).flatMap((section) => section.rows).map((row) => row.id).sort()).toEqual(rows.map((row) => row.id).sort());
  });
});
