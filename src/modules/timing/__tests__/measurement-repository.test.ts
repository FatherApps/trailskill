import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import { createInMemoryMeasurementRepository, createPowerSyncMeasurementRepository } from '..';
import type { Measurement, MeasurementRepository } from '..';

// @powersync/react-native ships ESM only and Jest cannot load it, so the real database is replaced by
// the SQLite-backed fake. The core/sync barrel is mocked for the same reason (it pulls in the connector
// and Supabase client); `writeRecord` stays the real one, running over the fake database.
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
}));

function arrival(id: string, seriesId: string, position: number, athleteId: string | null): Measurement {
  return {
    id,
    kind: 'repetition',
    athleteId,
    seriesId,
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
  };
}

const MEASUREMENTS_TABLE = `CREATE TABLE measurements (
  id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, device_id TEXT, kind TEXT, athlete_id TEXT,
  series_id TEXT, arrival_position INTEGER, hundredths INTEGER, stroke TEXT, distance TEXT, pool TEXT,
  session_type TEXT, source TEXT, captured_at TEXT, parent_id TEXT
)`;

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

const factories: [string, () => MeasurementRepository][] = [
  ['in-memory', createInMemoryMeasurementRepository],
  [
    'PowerSync',
    () => {
      const store = createStore();
      removeStore = store.remove;
      const seed = new DatabaseSync(store.path);
      seed.exec(MEASUREMENTS_TABLE);
      seed.close();
      mockDb = openDatabase(store.path);
      return createPowerSyncMeasurementRepository();
    },
  ],
];

describe.each(factories)('%s measurement repository', (_name, create) => {
  it('lists every arrival of a series by position, unassigned ones included', async () => {
    const repository = create();
    await repository.add(arrival('m3', 'S', 3, 'athlete-2'));
    await repository.add(arrival('m2', 'S', 2, null));
    await repository.add(arrival('m1', 'S', 1, 'athlete-1'));
    await repository.add(arrival('other', 'T', 1, 'athlete-1'));

    const listed = await repository.listBySeries('S');

    expect(listed.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(listed[1]?.athleteId).toBeNull();
  });

  it('reads a missing time back as null, never 0', async () => {
    const repository = create();
    await repository.add({ ...arrival('m1', 'S', 1, 'athlete-1'), hundredths: null });

    const [listed] = await repository.listBySeries('S');

    expect(listed?.hundredths).toBeNull();
  });

  it('reads back exactly what was added', async () => {
    const repository = create();
    const measurement = arrival('m1', 'S', 1, 'athlete-1');
    await repository.add(measurement);

    await expect(repository.listBySeries('S')).resolves.toEqual([measurement]);
  });
});

describe('PowerSync measurement repository', () => {
  it('queues the added measurement for upload', async () => {
    const repository = factories[1]![1]();
    await repository.add(arrival('m1', 'S', 1, null));

    expect(mockDb.getAll('SELECT table_name, record_id FROM pending_writes')).toEqual([
      { table_name: 'measurements', record_id: 'm1' },
    ]);
  });
});
