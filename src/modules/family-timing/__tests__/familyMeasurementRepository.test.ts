import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import { createPowerSyncFamilyMeasurementRepository, NotCompetitionError, UnknownMeasurementError, type FamilyMeasurement } from '..';

let mockDb: FakeDatabase;
jest.mock('../../../core/sync/db', () => ({
  get db() {
    return mockDb;
  },
}));
jest.mock('../../../core/sync', () => {
  const writes = jest.requireActual('../../../core/sync/writes');
  return {
    get db() {
      return mockDb;
    },
    writeRecord: writes.writeRecord,
    writeBatch: writes.writeBatch,
  };
});
const { setSessionUser } = jest.requireActual('../../../core/sync/writes');

const COLUMNS = `stroke TEXT, distance TEXT, pool TEXT, session_type TEXT, competition TEXT, captured_at TEXT, millis INTEGER, splits TEXT,
  official_millis INTEGER, official_set_at TEXT`;
const TABLES = `
  CREATE TABLE family_timing_measurements (
    id TEXT PRIMARY KEY, created_at TEXT, owner_user_id TEXT, captured_by TEXT, athlete_id TEXT, ${COLUMNS}, source TEXT, deleted_at TEXT
  );
  CREATE TABLE family_measurements (id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, athlete_id TEXT, ${COLUMNS});
`;

const base: FamilyMeasurement = {
  id: 'm1',
  athleteId: 'a1',
  createdBy: 'u1',
  stroke: 'FL',
  distance: '50m',
  pool: 'SCM',
  sessionType: 'competition',
  competition: 'Festival de prueba',
  capturedAt: '2026-11-08T14:00:00.000Z',
  millis: 47_210,
  splits: [23_100],
  officialMillis: null,
  officialSetAt: null,
};

let store: { path: string; remove: () => void };
beforeEach(() => {
  store = createStore();
  const seed = new DatabaseSync(store.path);
  seed.exec(TABLES);
  seed.close();
  mockDb = openDatabase(store.path);
  setSessionUser('u1');
});
afterEach(() => {
  setSessionUser(undefined);
  store.remove();
});

const pending = () => mockDb.getAll<{ table_name: string; record_id: string }>('SELECT table_name, record_id FROM pending_writes');

describe('PowerSync family measurements', () => {
  it('saves a time in the synced table, queued for upload, owned by who captured it', async () => {
    const repo = createPowerSyncFamilyMeasurementRepository();
    await repo.add(base);
    expect(await repo.listByAthlete('a1')).toEqual([{ ...base, deletedAt: null }]);
    expect(mockDb.getAll('SELECT owner_user_id, captured_by, splits FROM family_timing_measurements')).toEqual([
      { owner_user_id: 'u1', captured_by: 'u1', splits: '[23100]' },
    ]);
    expect(pending()).toEqual([{ table_name: 'family_timing_measurements', record_id: 'm1' }]);
  });

  it('sets the official time of a competition only', async () => {
    const repo = createPowerSyncFamilyMeasurementRepository();
    await repo.add(base);
    await repo.add({ ...base, id: 'm2', sessionType: 'training', competition: null });
    await repo.setOfficial('m1', 46_990, '2026-11-08T15:00:00.000Z');
    expect((await repo.listByAthlete('a1')).find((m) => m.id === 'm1')).toMatchObject({ millis: 47_210, officialMillis: 46_990 });
    await expect(repo.setOfficial('m2', 46_990, '2026-11-08T15:00:00.000Z')).rejects.toBeInstanceOf(NotCompetitionError);
    await expect(repo.setOfficial('nope', 1, '2026-11-08T15:00:00.000Z')).rejects.toBeInstanceOf(UnknownMeasurementError);
  });

  it('deletes a time out of the list and restores it', async () => {
    const repo = createPowerSyncFamilyMeasurementRepository();
    await repo.add(base);
    await repo.remove('m1', '2026-11-09T10:00:00.000Z');
    expect(await repo.listByAthlete('a1')).toEqual([]);
    expect((await repo.listDeleted('a1')).map((m) => [m.id, m.deletedAt])).toEqual([['m1', '2026-11-09T10:00:00.000Z']]);
    await repo.restore('m1');
    expect((await repo.listByAthlete('a1')).map((m) => m.id)).toEqual(['m1']);
    expect(await repo.listDeleted('a1')).toEqual([]);
  });

  it("moves the user's phone-only times to the synced table once, and leaves another user's", async () => {
    const seed = new DatabaseSync(store.path);
    const insert = seed.prepare(
      `INSERT INTO family_measurements (id, created_at, created_by, athlete_id, stroke, distance, pool, session_type, competition, captured_at,
         millis, splits, official_millis, official_set_at) VALUES (?, ?, ?, 'a1', 'FR', '50m', 'SCM', 'training', NULL, ?, ?, '[]', NULL, NULL)`,
    );
    insert.run('old-1', '2026-11-01T10:00:00.000Z', 'u1', '2026-11-01T10:00:00.000Z', 35_120);
    insert.run('old-2', '2026-11-02T10:00:00.000Z', 'u1', '2026-11-02T10:00:00.000Z', null);
    insert.run('other', '2026-11-03T10:00:00.000Z', 'u2', '2026-11-03T10:00:00.000Z', 40_000);
    seed.close();

    const repo = createPowerSyncFamilyMeasurementRepository();
    expect(await repo.moveLocal('u1')).toBe(2);
    expect((await repo.listByAthlete('a1')).map((m) => [m.id, m.millis])).toEqual([
      ['old-2', null],
      ['old-1', 35_120],
    ]);
    expect(mockDb.getAll('SELECT id FROM family_measurements')).toEqual([{ id: 'other' }]);
    expect(pending().map((p) => p.record_id).sort()).toEqual(['old-1', 'old-2']);
    expect(await repo.moveLocal('u1')).toBe(0);
  });

  it('keeps the phone-only times when the session changed to another user before the move committed', async () => {
    const seed = new DatabaseSync(store.path);
    seed
      .prepare(
        `INSERT INTO family_measurements (id, created_by, athlete_id, stroke, distance, pool, session_type, captured_at, millis, splits)
         VALUES ('old-1', 'u1', 'a1', 'FR', '50m', 'SCM', 'training', '2026-11-01T10:00:00.000Z', 35120, '[]')`,
      )
      .run();
    seed.close();
    setSessionUser('u2');
    await expect(createPowerSyncFamilyMeasurementRepository().moveLocal('u1')).rejects.toThrow();
    expect(mockDb.getAll('SELECT id FROM family_measurements')).toEqual([{ id: 'old-1' }]);
    expect(mockDb.getAll('SELECT id FROM family_timing_measurements')).toEqual([]);
  });
});
