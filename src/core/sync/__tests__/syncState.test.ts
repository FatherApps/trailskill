import { renderHook } from '@testing-library/react-native';

import { countUnsentRecords, recordSyncState, useGlobalSyncSummary, useRecordSyncState } from '../syncState';
import { createStore, openDatabase, type FakeDatabase } from '../testing/fakeDatabase';
import { writeRecord } from '../writes';

let mockDb: FakeDatabase;
let mockStatus: { dataFlowStatus: { uploading: boolean }; lastSyncedAt?: Date };
jest.mock('../db', () => ({
  get db() {
    return mockDb;
  },
}));
// @powersync/react ships ESM only: the hooks read the fake database directly.
jest.mock('@powersync/react', () => ({
  useQuery: (sql: string, params: unknown[] = []) => ({ data: mockDb.getAll(sql, params), isLoading: false }),
  useStatus: () => mockStatus,
}));

let store: ReturnType<typeof createStore>;
beforeEach(() => {
  store = createStore();
  mockDb = openDatabase(store.path);
  mockStatus = { dataFlowStatus: { uploading: false } };
});
afterEach(() => store.remove());

describe('recordSyncState', () => {
  it.each([
    [{ pending: true, failed: false, uploading: false }, 'on_device'],
    [{ pending: true, failed: false, uploading: true }, 'sending'],
    [{ pending: false, failed: false, uploading: true }, 'synced'],
    [{ pending: false, failed: false, uploading: false }, 'synced'],
    [{ pending: false, failed: true, uploading: false }, 'not_sent'],
    [{ pending: true, failed: true, uploading: true }, 'not_sent'],
  ] as const)('maps %p to %s', (input, state) => {
    expect(recordSyncState(input)).toBe(state);
  });
});

describe('useRecordSyncState', () => {
  const stateOf = async (id: string) => (await renderHook(() => useRecordSyncState('athletes', id))).result.current;

  it('still reports a committed but never uploaded write as on_device after the app restarts', async () => {
    const id = await writeRecord('athletes', { first_name: 'Ana' });

    // Force-quit: the first instance is dropped without closing, and a new one opens the same file.
    mockDb = openDatabase(store.path);

    expect(await stateOf(id)).toBe('on_device');
  });

  it('reports sending while the pending write uploads', async () => {
    const id = await writeRecord('athletes', { first_name: 'Ana' });
    mockStatus = { dataFlowStatus: { uploading: true } };

    expect(await stateOf(id)).toBe('sending');
  });

  it('reports synced once the upload cleared the pending write', async () => {
    const id = await writeRecord('athletes', { first_name: 'Ana' });
    await mockDb.writeTransaction((tx) => tx.execute('DELETE FROM pending_writes WHERE record_id = ?', [id]));

    expect(await stateOf(id)).toBe('synced');
  });

  it('reports not_sent for a write the server rejected', async () => {
    const id = await writeRecord('athletes', { first_name: 'Ana' });
    await mockDb.writeTransaction((tx) =>
      tx.execute("INSERT INTO upload_failures (id, table_name, record_id) VALUES (uuid(), 'athletes', ?)", [id]),
    );

    expect(await stateOf(id)).toBe('not_sent');
  });
});

describe('useGlobalSyncSummary', () => {
  const summary = async () => (await renderHook(() => useGlobalSyncSummary())).result.current;

  it('counts pending and failed records once each and passes the upload status through', async () => {
    const lastSyncedAt = new Date('2026-10-24T12:00:00Z');
    const a = await writeRecord('athletes', { first_name: 'Ana' });
    await writeRecord('athletes', { id: a, first_name: 'Bea' });
    await writeRecord('athletes', { first_name: 'Eva' });
    await mockDb.writeTransaction(async (tx) => {
      await tx.execute("INSERT INTO upload_failures (id, table_name, record_id) VALUES (uuid(), 'athletes', 'x')");
      await tx.execute("INSERT INTO upload_failures (id, table_name, record_id) VALUES (uuid(), 'athletes', 'x')");
    });
    mockStatus = { dataFlowStatus: { uploading: true }, lastSyncedAt };

    expect(await summary()).toEqual({ pending: 2, failed: 1, uploading: true, lastSyncedAt });
  });

  it('reports nothing pending and no last sync on a fresh database', async () => {
    expect(await summary()).toEqual({ pending: 0, failed: 0, uploading: false, lastSyncedAt: null });
  });
});

describe('countUnsentRecords', () => {
  it('counts every record still pending or rejected by the server, each once', async () => {
    const a = await writeRecord('athletes', { first_name: 'Ana' });
    await writeRecord('athletes', { id: a, first_name: 'Bea' });
    await mockDb.writeTransaction(async (tx) => {
      // A record both pending and rejected counts once.
      await tx.execute("INSERT INTO upload_failures (id, table_name, record_id) VALUES (uuid(), 'athletes', ?)", [a]);
      await tx.execute("INSERT INTO upload_failures (id, table_name, record_id) VALUES (uuid(), 'athletes', 'x')");
    });

    expect(await countUnsentRecords()).toBe(2);
  });

  it('is zero on a fresh database', async () => {
    expect(await countUnsentRecords()).toBe(0);
  });
});
