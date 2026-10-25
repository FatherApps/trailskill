import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemoryMeasurementRepository,
  createInMemorySeriesRepository,
  createPowerSyncMeasurementRepository,
  createPowerSyncSeriesRepository,
  type Measurement,
  type MeasurementRepository,
  type SeriesRepository,
} from '..';

let mockDb: FakeDatabase;
jest.mock('../../../core/sync/db', () => ({
  get db() {
    return mockDb;
  },
}));
jest.mock('../../../core/sync', () => ({
  get db() {
    return mockDb;
  },
  writeRecord: jest.requireActual('../../../core/sync/writes').writeRecord,
  writeBatch: jest.requireActual('../../../core/sync/writes').writeBatch,
  editRecord: jest.requireActual('../../../core/sync/writes').editRecord,
}));

const series = { id: 'S', createdBy: 'coach-a', deviceId: 'device-a', stroke: 'FR', distance: '50m', pool: 'SCM', sessionType: 'training' } as const;

function arrival(id: string, position: number, athleteId: string | null): Measurement {
  return {
    id,
    kind: 'repetition',
    athleteId,
    seriesId: 'S',
    arrivalPosition: position,
    hundredths: 3000 + position,
    stroke: 'FR',
    distance: '50m',
    pool: 'SCM',
    sessionType: 'training',
    source: 'screen_button',
    createdBy: 'coach-a',
    deviceId: 'device-a',
    capturedAt: '2026-10-24T08:00:00Z',
    parentId: null,
    version: 1,
    editedBy: null,
    editedAt: null,
    editReason: null,
  };
}

const TABLES = `
  CREATE TABLE timing_series (id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, device_id TEXT, stroke TEXT, distance TEXT, pool TEXT, session_type TEXT);
  CREATE TABLE measurements (
    id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, device_id TEXT, kind TEXT, athlete_id TEXT,
    series_id TEXT, arrival_position INTEGER, hundredths INTEGER, stroke TEXT, distance TEXT, pool TEXT,
    session_type TEXT, source TEXT, captured_at TEXT, parent_id TEXT, version INTEGER, base_version INTEGER,
    edited_by TEXT, edited_at TEXT, edited_device_id TEXT, edit_reason TEXT, discarded_at TEXT, discarded_by TEXT
  )`;

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

type Pair = { series: SeriesRepository; measurements: MeasurementRepository };
const factories: [string, () => Pair][] = [
  [
    'in-memory',
    () => {
      const measurements = createInMemoryMeasurementRepository();
      return { series: createInMemorySeriesRepository(measurements), measurements };
    },
  ],
  [
    'PowerSync',
    () => {
      const store = createStore();
      removeStore = store.remove;
      const seed = new DatabaseSync(store.path);
      seed.exec(TABLES);
      seed.close();
      mockDb = openDatabase(store.path);
      return { series: createPowerSyncSeriesRepository(), measurements: createPowerSyncMeasurementRepository() };
    },
  ],
];

describe.each(factories)('%s series repository', (_name, create) => {
  it('opens the series with its first arrival and adds each later one, the ones without an athlete included', async () => {
    const { series: repository, measurements } = create();

    await repository.open(series, arrival('m1', 1, null));
    await repository.addArrival(arrival('m2', 2, null));

    const saved = await measurements.listBySeries('S');
    expect(saved.map((m) => [m.id, m.athleteId, m.hundredths])).toEqual([
      ['m1', null, 3001],
      ['m2', null, 3002],
    ]);
  });

  it('discards only the arrival it is asked to, and no read returns it again', async () => {
    const { series: repository, measurements } = create();
    await repository.open(series, arrival('m1', 1, null));
    await repository.addArrival(arrival('m2', 2, null));

    await repository.discardArrival('m2', 'coach-a');

    expect((await measurements.listBySeries('S')).map((m) => m.id)).toEqual(['m1']);
  });

  it('gives the saved arrivals their athletes and leaves the others unassigned', async () => {
    const { series: repository, measurements } = create();
    await repository.open(series, arrival('m1', 1, null));
    await repository.addArrival(arrival('m2', 2, null));
    await repository.addArrival(arrival('m3', 3, null));

    await repository.assign([{ id: 'm1', athleteId: 'athlete-1' }, { id: 'm3', athleteId: 'athlete-2' }], { deviceId: 'device-a' });

    expect((await measurements.listBySeries('S')).map((m) => [m.id, m.athleteId])).toEqual([
      ['m1', 'athlete-1'],
      ['m2', null],
      ['m3', 'athlete-2'],
    ]);
  });
});

describe('PowerSync series repository', () => {
  it('writes the series row and the first arrival in one transaction', async () => {
    const { series: repository } = factories[1]![1]();

    await repository.open(series, arrival('m1', 1, null));

    expect(mockDb.transactions).toHaveLength(1);
    expect(mockDb.getAll('SELECT id, created_by, device_id, stroke, distance, pool, session_type FROM timing_series')).toEqual([
      { id: 'S', created_by: 'coach-a', device_id: 'device-a', stroke: 'FR', distance: '50m', pool: 'SCM', session_type: 'training' },
    ]);
    expect(mockDb.getAll('SELECT id FROM measurements')).toEqual([{ id: 'm1' }]);
  });

  it('writes each later arrival in its own transaction, so a force-quit cannot lose it', async () => {
    const { series: repository } = factories[1]![1]();
    await repository.open(series, arrival('m1', 1, null));

    await repository.addArrival(arrival('m2', 2, null));
    await repository.addArrival(arrival('m3', 3, null));

    expect(mockDb.transactions).toHaveLength(3);
  });

  it('keeps the discarded row, marked with its author, and queues the mark for upload', async () => {
    const { series: repository } = factories[1]![1]();
    await repository.open(series, arrival('m1', 1, null));
    await repository.addArrival(arrival('m2', 2, null));

    await repository.discardArrival('m2', 'coach-a');

    expect(mockDb.getAll("SELECT discarded_by, discarded_at IS NOT NULL AS marked FROM measurements WHERE id = 'm2'")).toEqual([
      { discarded_by: 'coach-a', marked: 1 },
    ]);
    expect(mockDb.getAll("SELECT discarded_at FROM measurements WHERE id = 'm1'")).toEqual([{ discarded_at: null }]);
    expect(mockDb.getAll("SELECT record_id FROM pending_writes WHERE record_id = 'm2'")).toHaveLength(2);
  });

  it('discards nothing, and writes no row, for an arrival that is not on the phone', async () => {
    const { series: repository } = factories[1]![1]();
    await repository.open(series, arrival('m1', 1, null));

    await repository.discardArrival('missing', 'coach-a');

    expect(mockDb.getAll('SELECT id FROM measurements')).toEqual([{ id: 'm1' }]);
  });
});
