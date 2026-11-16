import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import { createPowerSyncMeasurementRepository } from '..';

// Same replacement of the database as measurement-repository.test.ts: Jest cannot load @powersync/react-native.
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
  editRecord: jest.requireActual('../../../core/sync/writes').editRecord,
  writeBatch: jest.requireActual('../../../core/sync/writes').writeBatch,
}));

// The columns of measurement-repository.test.ts: the queries read them all.
const COLUMNS = `id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, device_id TEXT, kind TEXT, athlete_id TEXT,
  series_id TEXT, arrival_position INTEGER, hundredths INTEGER, stroke TEXT, distance TEXT, pool TEXT,
  session_type TEXT, source TEXT, school_id TEXT, captured_at TEXT, parent_id TEXT, version INTEGER, base_version INTEGER,
  edited_by TEXT, edited_at TEXT, edited_device_id TEXT, edit_reason TEXT, discarded_at TEXT, discarded_by TEXT`;

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function open(table: string, rows: string[]) {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec(table);
  rows.forEach((row) => seed.exec(row));
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncMeasurementRepository();
}

const row = (id: string, visible: string | null) =>
  `INSERT INTO measurements (id, created_by, device_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, school_id, captured_at, version, guardian_visible)
   VALUES ('${id}', 'coach', 'dev', 'repetition', 'a1', 3000, 'FR', '50m', 'SCM', 'training', 'screen_button', 's1', '2026-11-01T08:00:00Z', 1, ${visible})`;

describe('the guardian visibility of a measurement on the device', () => {
  it('maps 1 to true, 0 to false and a null value to null', async () => {
    const repository = open(`CREATE TABLE measurements (${COLUMNS}, guardian_visible INTEGER)`, [row('m1', '1'), row('m0', '0'), row('mn', 'NULL')]);
    const byId = Object.fromEntries((await repository.listBySchool('s1')).map((m) => [m.id, m.guardianVisible]));
    expect(byId).toEqual({ m1: true, m0: false, mn: null });
  });

  it('is unknown, never false, when the device has no such column yet', async () => {
    const repository = open(`CREATE TABLE measurements (${COLUMNS})`, [
      `INSERT INTO measurements (id, created_by, device_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, school_id, captured_at, version)
       VALUES ('old', 'coach', 'dev', 'repetition', 'a1', 3000, 'FR', '50m', 'SCM', 'training', 'screen_button', 's1', '2026-11-01T08:00:00Z', 1)`,
    ]);
    const [measurement] = await repository.listBySchool('s1');
    expect(measurement.guardianVisible ?? null).toBeNull();
  });
});
