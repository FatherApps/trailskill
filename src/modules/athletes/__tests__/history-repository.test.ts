import { createInMemoryMeasurementRepository } from '../../timing';
import { createHistoryRepository } from '../data/measurementHistoryRepository';
import { createInMemoryHistoryRepository } from '../data/inMemoryHistoryRepository';
import type { HistoryMeasurement, HistoryRepository } from '../data/history';
import { personalBest } from '../personalBest';

// Importing the timing index loads the PowerSync repository, which needs the sync layer mocked (see the timing tests).
jest.mock('../../../core/sync', () => ({ db: {}, writeRecord: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const event = { stroke: 'FR', distance: '50m', pool: 'SCM' } as const;

function measurement(id: string, over: Partial<HistoryMeasurement> = {}): HistoryMeasurement {
  return {
    id,
    kind: 'race',
    athleteId: 'athlete-1',
    seriesId: null,
    arrivalPosition: null,
    hundredths: 3000,
    stroke: 'FR',
    distance: '50m',
    pool: 'SCM',
    sessionType: 'training',
    source: 'screen_button',
    createdBy: 'coach-a',
    deviceId: 'device-a',
    capturedAt: '2026-01-01T08:00:00Z',
    parentId: null,
    origin: 'own',
    ...over,
  } as HistoryMeasurement;
}

const seed: HistoryMeasurement[] = [
  measurement('old', { capturedAt: '2026-01-01T08:00:00Z' }),
  measurement('split', { kind: 'split', hundredths: 1400, capturedAt: '2026-02-01T08:00:00Z' }),
  measurement('total', { kind: 'series_total', hundredths: 9000, capturedAt: '2026-03-01T08:00:00Z' }),
  measurement('done', { kind: 'completed', hundredths: null, capturedAt: '2026-04-01T08:00:00Z' }),
  measurement('missing', { hundredths: null, capturedAt: '2026-05-01T08:00:00Z' }),
  measurement('other-athlete', { athleteId: 'athlete-2', hundredths: 2000 }),
  measurement('other-stroke', { stroke: 'BK', hundredths: 2000 }),
  measurement('other-distance', { distance: '100m', hundredths: 2000 }),
  measurement('other-pool', { pool: 'LCM', hundredths: 2000 }),
];

const factories: [string, () => Promise<HistoryRepository>][] = [
  ['in-memory', async () => createInMemoryHistoryRepository(seed)],
  [
    'over the measurement repository',
    async () => {
      const measurements = createInMemoryMeasurementRepository();
      for (const { origin: _origin, ...m } of seed) await measurements.add(m);
      return createHistoryRepository(measurements);
    },
  ],
];

describe.each(factories)('%s history repository', (_name, create) => {
  it('lists only that athlete and that event, every kind, newest first', async () => {
    const listed = await (await create()).listByEvent('athlete-1', event);

    expect(listed.map((m) => m.id)).toEqual(['missing', 'done', 'total', 'split', 'old']);
  });

  it('marks measurements captured in the app as own', async () => {
    const listed = await (await create()).listByEvent('athlete-1', event);

    expect(listed.every((m) => m.origin === 'own')).toBe(true);
  });

  it('keeps a missing time null', async () => {
    const listed = await (await create()).listByEvent('athlete-1', event);

    expect(listed.find((m) => m.id === 'missing')?.hundredths).toBeNull();
  });

  it('is not changed in its personal best by other athletes or events', async () => {
    const repository = await create();

    const pb = personalBest(await repository.listByEvent('athlete-1', event));

    expect(pb).toMatchObject({ id: 'old', hundredths: 3000 });
  });
});
