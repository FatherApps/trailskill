import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemoryMeasurementRepository,
  createInMemorySeriesRepository,
  createPowerSyncMeasurementRepository,
  createPowerSyncSeriesRepository,
  DiscardedMeasurementError,
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

const series = { id: 'S', createdBy: 'coach-a', schoolId: 'school-a', deviceId: 'device-a', stroke: 'FR', distance: '50m', pool: 'SCM', sessionType: 'training' } as const;

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
    schoolId: 'school-a',
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
  CREATE TABLE timing_series (id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, school_id TEXT, device_id TEXT, stroke TEXT, distance TEXT, pool TEXT, session_type TEXT);
  CREATE TABLE measurements (
    id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, device_id TEXT, kind TEXT, athlete_id TEXT,
    series_id TEXT, arrival_position INTEGER, hundredths INTEGER, stroke TEXT, distance TEXT, pool TEXT,
    session_type TEXT, source TEXT, school_id TEXT, captured_at TEXT, parent_id TEXT, version INTEGER, base_version INTEGER,
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

it('writes the school on the series row of the local database', async () => {
  const { series: repository } = factories[1]![1]();

  await repository.open({ ...series, schoolId: 'school-b' }, { ...arrival('m1', 1, null), schoolId: 'school-b' });

  expect(await mockDb.getAll('SELECT school_id FROM timing_series')).toEqual([{ school_id: 'school-b' }]);
  expect(await mockDb.getAll('SELECT school_id FROM measurements')).toEqual([{ school_id: 'school-b' }]);
});

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

  it('writes the school on every arrival', async () => {
    const { series: repository, measurements } = create();

    await repository.open({ ...series, schoolId: 'school-b' }, { ...arrival('m1', 1, null), schoolId: 'school-b' });
    await repository.addArrival({ ...arrival('m2', 2, null), schoolId: 'school-b' });

    expect((await measurements.listBySeries('S')).map((m) => m.schoolId)).toEqual(['school-b', 'school-b']);
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

  it('refuses to assign a discarded arrival and leaves every other target unassigned', async () => {
    const { series: repository, measurements } = create();
    await repository.open(series, arrival('m1', 1, null));
    await repository.addArrival(arrival('m2', 2, null));
    await repository.discardArrival('m2', 'coach-a');

    await expect(
      repository.assign([{ id: 'm1', athleteId: 'athlete-1' }, { id: 'm2', athleteId: 'athlete-2' }], { deviceId: 'device-a' }),
    ).rejects.toBeInstanceOf(DiscardedMeasurementError);

    expect((await measurements.listBySeries('S')).map((m) => [m.id, m.athleteId])).toEqual([['m1', null]]);
  });

  it('rejects an id that is not on the phone and assigns nothing', async () => {
    const { series: repository, measurements } = create();
    await repository.open(series, arrival('m1', 1, null));

    await expect(
      repository.assign([{ id: 'm1', athleteId: 'athlete-1' }, { id: 'missing', athleteId: 'athlete-2' }], { deviceId: 'device-a' }),
    ).rejects.toThrow();

    expect((await measurements.listBySeries('S')).map((m) => [m.id, m.athleteId])).toEqual([['m1', null]]);
  });

  it('lists the arrivals of a series by position, without the discarded ones', async () => {
    const { series: repository } = create();
    await repository.open(series, arrival('m1', 1, null));
    await repository.addArrival(arrival('m3', 3, null));
    await repository.addArrival(arrival('m2', 2, null));
    await repository.discardArrival('m3', 'coach-a');

    expect((await repository.listArrivals('S')).map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  describe('listPending', () => {
    const other = { ...series, id: 'T', stroke: 'BK', distance: '100m', pool: 'LCM', sessionType: 'competition' } as const;
    const at = (m: Measurement, capturedAt: string, seriesId = m.seriesId): Measurement => ({ ...m, capturedAt, seriesId });

    it('returns nothing when no arrival is waiting for an athlete', async () => {
      const { series: repository } = create();
      expect(await repository.listPending()).toEqual([]);

      await repository.open(series, arrival('m1', 1, 'athlete-1'));
      expect(await repository.listPending()).toEqual([]);
    });

    it('groups the unassigned arrivals by series, newest first, counting only the ones still waiting', async () => {
      const { series: repository, measurements } = create();
      await repository.open(series, at(arrival('a1', 1, null), '2026-10-24T08:00:00Z'));
      await repository.addArrival(at(arrival('a2', 2, null), '2026-10-24T08:00:05Z'));
      await repository.addArrival(at(arrival('a3', 3, 'athlete-1'), '2026-10-24T08:00:09Z'));
      await repository.addArrival(at(arrival('a4', 4, null), '2026-10-24T08:00:10Z'));
      await repository.discardArrival('a4', 'coach-a');
      await repository.open(other, { ...at(arrival('b1', 1, null), '2026-10-24T09:00:00Z', 'T'), stroke: 'BK', distance: '100m', pool: 'LCM', sessionType: 'competition' });
      // An individual time has no series: it never waits for a series assignment.
      await measurements.add({ ...arrival('solo', 1, null), seriesId: null, arrivalPosition: null, capturedAt: '2026-10-24T10:00:00Z' });

      expect(await repository.listPending()).toEqual([
        { seriesId: 'T', stroke: 'BK', distance: '100m', pool: 'LCM', sessionType: 'competition', capturedAt: '2026-10-24T09:00:00Z', pending: 1 },
        { seriesId: 'S', stroke: 'FR', distance: '50m', pool: 'SCM', sessionType: 'training', capturedAt: '2026-10-24T08:00:05Z', pending: 2 },
      ]);
    });

    it('drops a series once all its arrivals have their athlete', async () => {
      const { series: repository } = create();
      await repository.open(series, arrival('m1', 1, null));
      await repository.addArrival(arrival('m2', 2, null));

      await repository.assign([{ id: 'm1', athleteId: 'athlete-1' }, { id: 'm2', athleteId: 'athlete-2' }], { deviceId: 'device-a' });

      expect(await repository.listPending()).toEqual([]);
    });
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

  it('keeps the first discard when the arrival is discarded again, so the upload never carries two times', async () => {
    const { series: repository } = factories[1]![1]();
    await repository.open(series, arrival('m1', 1, null));
    await repository.discardArrival('m1', 'coach-a');
    const first = mockDb.getAll("SELECT discarded_at FROM measurements WHERE id = 'm1'");
    const pending = mockDb.getAll('SELECT id FROM pending_writes').length;

    await repository.discardArrival('m1', 'coach-a');

    expect(mockDb.getAll("SELECT discarded_at FROM measurements WHERE id = 'm1'")).toEqual(first);
    expect(mockDb.getAll('SELECT id FROM pending_writes')).toHaveLength(pending);
  });

  it('discards nothing, and writes no row, for an arrival that is not on the phone', async () => {
    const { series: repository } = factories[1]![1]();
    await repository.open(series, arrival('m1', 1, null));

    await repository.discardArrival('missing', 'coach-a');

    expect(mockDb.getAll('SELECT id FROM measurements')).toEqual([{ id: 'm1' }]);
  });
});

describe('PowerSync series repository assignment', () => {
  it('assigns several arrivals in one transaction, each with the markers of a separate edit', async () => {
    const { series: repository } = factories[1]![1]();
    await repository.open(series, arrival('m1', 1, null));
    await repository.addArrival(arrival('m2', 2, null));
    const transactions = mockDb.transactions.length;
    const pendingBefore = mockDb.getAll('SELECT 1 FROM pending_writes').length;

    await repository.assign([{ id: 'm1', athleteId: 'athlete-1' }, { id: 'm2', athleteId: 'athlete-2' }], { deviceId: 'device-b' });

    expect(mockDb.transactions).toHaveLength(transactions + 1);
    expect(mockDb.getAll('SELECT id, athlete_id, base_version, edited_device_id, edit_reason FROM measurements ORDER BY id')).toEqual([
      { id: 'm1', athlete_id: 'athlete-1', base_version: 1, edited_device_id: 'device-b', edit_reason: null },
      { id: 'm2', athlete_id: 'athlete-2', base_version: 1, edited_device_id: 'device-b', edit_reason: null },
    ]);
    // Fresh rows hold no metadata to reset: one op each.
    expect(mockDb.getAll('SELECT 1 FROM pending_writes')).toHaveLength(pendingBefore + 2);
  });

  it('opens no transaction for an empty list', async () => {
    const { series: repository } = factories[1]![1]();
    await repository.open(series, arrival('m1', 1, null));
    const transactions = mockDb.transactions.length;

    await repository.assign([], { deviceId: 'device-b' });

    expect(mockDb.transactions).toHaveLength(transactions);
  });

  it('queues nothing when a target is discarded or missing', async () => {
    const { series: repository } = factories[1]![1]();
    await repository.open(series, arrival('m1', 1, null));
    await repository.addArrival(arrival('m2', 2, null));
    await repository.discardArrival('m2', 'coach-a');
    const pendingBefore = mockDb.getAll('SELECT 1 FROM pending_writes').length;

    await expect(repository.assign([{ id: 'm1', athleteId: 'athlete-1' }, { id: 'm2', athleteId: 'athlete-2' }], { deviceId: 'device-b' })).rejects.toBeInstanceOf(
      DiscardedMeasurementError,
    );
    await expect(repository.assign([{ id: 'm1', athleteId: 'athlete-1' }, { id: 'nope', athleteId: 'athlete-2' }], { deviceId: 'device-b' })).rejects.toThrow();

    expect(mockDb.getAll('SELECT 1 FROM pending_writes')).toHaveLength(pendingBefore);
    expect(mockDb.getAll('SELECT athlete_id FROM measurements WHERE athlete_id IS NOT NULL')).toEqual([]);
  });

  it('keeps the pending series after the app is restarted over the same database', async () => {
    const store = createStore();
    removeStore = store.remove;
    const seed = new DatabaseSync(store.path);
    seed.exec(TABLES);
    seed.close();
    mockDb = openDatabase(store.path);
    const first = createPowerSyncSeriesRepository();
    await first.open(series, arrival('m1', 1, null));
    await first.addArrival(arrival('m2', 2, null));

    mockDb = openDatabase(store.path);

    expect(await createPowerSyncSeriesRepository().listPending()).toEqual([
      { seriesId: 'S', stroke: 'FR', distance: '50m', pool: 'SCM', sessionType: 'training', capturedAt: '2026-10-24T08:00:00Z', pending: 2 },
    ]);
  });
});
