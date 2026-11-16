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
    id TEXT PRIMARY KEY, created_at TEXT, owner_user_id TEXT, captured_by TEXT, athlete_id TEXT, ${COLUMNS}, official_result_key TEXT, source TEXT,
    deleted_at TEXT
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

// Writes straight to the device store, as the phone-only table before #967 or the sync engine would.
const server = (change: (store: DatabaseSync) => void) => {
  const direct = new DatabaseSync(store.path);
  change(direct);
  direct.close();
};
const seedLocal = (...rows: [id: string, createdBy: string, millis: number | null][]) =>
  server((s) => {
    const insert = s.prepare(
      `INSERT INTO family_measurements (id, created_at, created_by, athlete_id, stroke, distance, pool, session_type, competition, captured_at,
         millis, splits, official_millis, official_set_at) VALUES (?, ?, ?, 'a1', 'FR', '50m', 'SCM', 'training', NULL, ?, ?, '[]', NULL, NULL)`,
    );
    rows.forEach(([id, createdBy, millis], i) => {
      const at = `2026-11-0${i + 1}T10:00:00.000Z`;
      insert.run(id, at, createdBy, at, millis);
    });
  });
const localIds = () => mockDb.getAll<{ id: string }>('SELECT id FROM family_measurements ORDER BY id').map((r) => r.id);

describe('PowerSync family measurements', () => {
  it('saves a time in the synced table, queued for upload, owned by who captured it', async () => {
    const repo = createPowerSyncFamilyMeasurementRepository();
    await repo.add(base);
    expect(await repo.listByAthlete('a1')).toEqual([{ ...base, officialResultKey: null, deletedAt: null }]);
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

  it('remembers which imported official result goes with a competition time, and forgets it (issue 974)', async () => {
    const repo = createPowerSyncFamilyMeasurementRepository();
    await repo.add(base);
    await repo.add({ ...base, id: 'm2', sessionType: 'training', competition: null });
    await repo.chooseOfficial('m1', 'provider-a:final-1');
    expect((await repo.listByAthlete('a1')).find((m) => m.id === 'm1')).toMatchObject({ officialResultKey: 'provider-a:final-1' });
    await repo.chooseOfficial('m1', null);
    expect((await repo.listByAthlete('a1')).find((m) => m.id === 'm1')).toMatchObject({ officialResultKey: null });
    await expect(repo.chooseOfficial('m2', 'provider-a:final-1')).rejects.toBeInstanceOf(NotCompetitionError);
  });

  it('corrects the stroke and the swimmer, queued for upload, and never the captured time', async () => {
    const repo = createPowerSyncFamilyMeasurementRepository();
    await repo.add(base);
    await repo.edit('m1', { stroke: 'BK', athleteId: 'a2' });
    expect(await repo.listByAthlete('a1')).toEqual([]);
    expect((await repo.listByAthlete('a2'))[0]).toMatchObject({ stroke: 'BK', millis: 47_210 });
    expect(pending()).toHaveLength(2);
    await expect(repo.edit('nope', { stroke: 'BK' })).rejects.toBeInstanceOf(UnknownMeasurementError);
  });

  it('saves the times of a series together, with the ones without a swimmer listed apart', async () => {
    const repo = createPowerSyncFamilyMeasurementRepository();
    await repo.addMany([
      { ...base, id: 's1', splits: [] },
      { ...base, id: 's2', athleteId: null, millis: 48_000, splits: [] },
    ]);
    expect((await repo.listByAthlete('a1')).map((m) => m.id)).toEqual(['s1']);
    expect((await repo.listByAthlete(null)).map((m) => [m.id, m.athleteId])).toEqual([['s2', null]]);
    expect(pending()).toHaveLength(2);
    await repo.edit('s2', { athleteId: 'a1' });
    expect(await repo.listByAthlete(null)).toEqual([]);
    await repo.remove('s1', '2026-11-09T10:00:00.000Z');
    expect(await repo.listDeleted(null)).toEqual([]);
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

  it("copies the user's phone-only times to the synced table once, keeps them until the server confirms, and leaves another user's", async () => {
    seedLocal(['old-1', 'u1', 35_120], ['old-2', 'u1', null], ['other', 'u2', 40_000]);

    const repo = createPowerSyncFamilyMeasurementRepository();
    expect(await repo.moveLocal('u1')).toBe(2);
    expect((await repo.listByAthlete('a1')).map((m) => [m.id, m.millis])).toEqual([
      ['old-2', null],
      ['old-1', 35_120],
    ]);
    // The upload is not confirmed yet: every phone copy stays.
    expect(localIds()).toEqual(['old-1', 'old-2', 'other']);
    expect(pending().map((p) => p.record_id).sort()).toEqual(['old-1', 'old-2']);
    // Already copied: a second launch queues nothing again.
    expect(await repo.moveLocal('u1')).toBe(0);
    expect(pending()).toHaveLength(2);
    expect(localIds()).toEqual(['old-1', 'old-2', 'other']);
  });

  it('removes from the phone only the times whose upload the server confirmed, without duplicating them', async () => {
    seedLocal(['old-1', 'u1', 35_120], ['old-2', 'u1', 36_000], ['other', 'u2', 40_000]);
    const repo = createPowerSyncFamilyMeasurementRepository();
    await repo.moveLocal('u1');

    server((s) => s.prepare("DELETE FROM pending_writes WHERE record_id = 'old-1'").run());
    expect(await repo.moveLocal('u1')).toBe(0);
    expect(localIds()).toEqual(['old-2', 'other']);
    expect(mockDb.getAll('SELECT id FROM family_timing_measurements ORDER BY id')).toEqual([{ id: 'old-1' }, { id: 'old-2' }]);
    expect(pending().map((p) => p.record_id)).toEqual(['old-2']);
  });

  it('keeps a time the server rejected on the phone and does not queue it again', async () => {
    seedLocal(['old-1', 'u1', 35_120], ['old-2', 'u1', 36_000]);
    const repo = createPowerSyncFamilyMeasurementRepository();
    await repo.moveLocal('u1');

    // Both uploads were rejected; the next sync already dropped the synced copy of old-1, old-2's is still on the device.
    server((s) => {
      s.exec('DELETE FROM pending_writes');
      const reject = s.prepare(
        "INSERT INTO upload_failures (id, table_name, record_id, op, payload, error_code, failed_at) VALUES (?, 'family_timing_measurements', ?, 'PUT', '{}', '42501', '2026-11-10T10:00:00.000Z')",
      );
      reject.run('f1', 'old-1');
      reject.run('f2', 'old-2');
      s.prepare("DELETE FROM family_timing_measurements WHERE id = 'old-1'").run();
    });
    expect(await repo.moveLocal('u1')).toBe(0);
    expect(localIds()).toEqual(['old-1', 'old-2']);
    expect(pending()).toEqual([]);
    expect(mockDb.getAll<{ id: string; millis: number }>('SELECT id, millis FROM family_measurements ORDER BY id')).toEqual([
      { id: 'old-1', millis: 35_120 },
      { id: 'old-2', millis: 36_000 },
    ]);
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

describe('a phone-only time the server rejected (issue 1025)', () => {
  const failures = () => mockDb.getAll<{ record_id: string }>('SELECT record_id FROM upload_failures ORDER BY record_id').map((r) => r.record_id);

  // rej-1 and rej-2 were rejected (the sync dropped rej-1's synced copy); ok-1 was accepted and is still in the synced table.
  async function rejectedAndAccepted() {
    seedLocal(['rej-1', 'u1', 35_120], ['ok-1', 'u1', 36_000], ['rej-2', 'u2', 40_000]);
    const repo = createPowerSyncFamilyMeasurementRepository();
    await repo.moveLocal('u1');
    server((s) => {
      s.exec('DELETE FROM pending_writes');
      const reject = s.prepare(
        "INSERT INTO upload_failures (id, table_name, record_id, op, payload, error_code, failed_at) VALUES (?, 'family_timing_measurements', ?, 'PUT', '{}', '42501', '2026-11-10T10:00:00.000Z')",
      );
      reject.run('f1', 'rej-1');
      reject.run('f2', 'rej-2');
      s.prepare("DELETE FROM family_timing_measurements WHERE id = 'rej-1'").run();
    });
    return repo;
  }

  it('lists only this user\'s rejected phone-only time, not an accepted one nor another user\'s', async () => {
    const repo = await rejectedAndAccepted();
    expect((await repo.listRejected('u1', 'a1')).map((m) => [m.id, m.createdBy, m.millis, m.deletedAt])).toEqual([['rej-1', 'u1', 35_120, null]]);
    expect(await repo.listRejected('u1', 'other-athlete')).toEqual([]);
    expect(await repo.listRejected('u1', null)).toEqual([]);
  });

  it('deletes the time and its upload failure, and no other user\'s, without queueing anything', async () => {
    const repo = await rejectedAndAccepted();
    await repo.discardRejected('u1', 'rej-1');
    expect(localIds()).toEqual(['ok-1', 'rej-2']);
    expect(failures()).toEqual(['rej-2']);
    expect(pending()).toEqual([]);
    expect(await repo.listRejected('u1', 'a1')).toEqual([]);
    expect(mockDb.getAll('SELECT id FROM family_timing_measurements ORDER BY id')).toEqual([{ id: 'ok-1' }]);
  });

  it('refuses another user\'s rejected time, an accepted one and a pending one, changing nothing', async () => {
    const repo = await rejectedAndAccepted();
    await repo.add({ ...base, id: 'new-1' });
    for (const id of ['rej-2', 'ok-1', 'new-1', 'nope']) {
      await expect(repo.discardRejected('u1', id)).rejects.toBeInstanceOf(UnknownMeasurementError);
    }
    expect(localIds()).toEqual(['ok-1', 'rej-1', 'rej-2']);
    expect(failures()).toEqual(['rej-1', 'rej-2']);
    expect(pending().map((p) => p.record_id)).toEqual(['new-1']);
    expect((await repo.listByAthlete('a1')).map((m) => m.id).sort()).toEqual(['new-1', 'ok-1']);
  });
});
