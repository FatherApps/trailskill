import { renderHook } from '@testing-library/react-native';

import { connectionState, countUnsentRecords, recordSyncState, useGlobalSyncSummary, useRecordSyncState, useRecordSyncStates } from '../syncState';
import { createStore, openDatabase, type FakeDatabase } from '../testing/fakeDatabase';
import { writeRecord } from '../writes';

let mockDb: FakeDatabase;
let mockStatus: { connected: boolean; dataFlowStatus: { uploading: boolean; downloadError?: Error }; lastSyncedAt?: Date };
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
  mockStatus = { connected: true, dataFlowStatus: { uploading: false } };
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

  it.each([
    [{ pending: true, failed: false, uploading: false }, 'on_device'],
    [{ pending: true, failed: false, uploading: true }, 'sending'],
    [{ pending: false, failed: false, uploading: false }, 'synced'],
    [{ pending: false, failed: true, uploading: false }, 'not_sent'],
    [{ pending: true, failed: true, uploading: true }, 'not_sent'],
  ] as const)('a record with no conflict keeps its state: %p is %s', (input, state) => {
    expect(recordSyncState({ ...input, conflict: false })).toBe(state);
  });

  it.each([
    [{ pending: false, failed: false, uploading: false }, 'needs_review'],
    [{ pending: true, failed: false, uploading: false }, 'needs_review'],
    [{ pending: true, failed: false, uploading: true }, 'needs_review'],
    [{ pending: false, failed: true, uploading: false }, 'not_sent'],
    [{ pending: true, failed: true, uploading: true }, 'not_sent'],
  ] as const)('a conflict shows review unless the upload was rejected: %p is %s', (input, state) => {
    expect(recordSyncState({ ...input, conflict: true })).toBe(state);
  });
});

describe('connectionState', () => {
  it.each([
    [{ connected: true, dataFlowStatus: {} }, 'connected'],
    // A sync attempt that failed leaves its error until a sync completes.
    [{ connected: true, dataFlowStatus: { downloadError: new Error('x') } }, 'connected'],
    [{ connected: false, dataFlowStatus: { downloadError: new Error('x') } }, 'offline'],
    [{ connected: false, dataFlowStatus: {} }, 'connecting'],
  ] as const)('maps %p to %s', (status, state) => {
    expect(connectionState(status)).toBe(state);
  });
});

describe('useRecordSyncStates', () => {
  const statesOf = async (ids: string[]) => (await renderHook(() => useRecordSyncStates('athletes', ids))).result.current;

  it('gives the state of each record in one read', async () => {
    const pending = await writeRecord('athletes', { first_name: 'Ana' });
    const sent = await writeRecord('athletes', { first_name: 'Ben' });
    await mockDb.writeTransaction((tx) => tx.execute('DELETE FROM pending_writes WHERE record_id = ?', [sent]));

    expect(await statesOf([pending, sent])).toEqual(new Map([[pending, 'on_device'], [sent, 'synced']]));
  });

  it('gives an empty map for no ids', async () => {
    expect(await statesOf([])).toEqual(new Map());
  });

  it('reports a record the server rejected as not_sent', async () => {
    const id = await writeRecord('athletes', { first_name: 'Ana' });
    await mockDb.writeTransaction((tx) =>
      tx.execute("INSERT INTO upload_failures (id, table_name, record_id, op) VALUES ('f1', 'athletes', ?, 'PUT')", [id]),
    );

    expect((await statesOf([id])).get(id)).toBe('not_sent');
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
    mockStatus = { connected: true, dataFlowStatus: { uploading: true } };

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

  const addConflict = (recordId: string, status: string, table = 'athletes') =>
    mockDb.writeTransaction((tx) =>
      tx.execute('INSERT INTO record_conflicts (id, table_name, record_id, status) VALUES (uuid(), ?, ?, ?)', [table, recordId, status]),
    );

  it('reports needs_review for a record with an open conflict, even when it is pending', async () => {
    const id = await writeRecord('athletes', { first_name: 'Ana' });
    await addConflict(id, 'open');

    expect(await stateOf(id)).toBe('needs_review');
  });

  it('reports needs_review for a synced record with an open conflict', async () => {
    await addConflict('a-1', 'open');

    expect(await stateOf('a-1')).toBe('needs_review');
  });

  it('ignores a resolved conflict and the conflicts of other records and tables', async () => {
    await addConflict('a-1', 'resolved');
    await addConflict('a-2', 'open');
    await addConflict('a-1', 'open', 'measurements');

    expect(await stateOf('a-1')).toBe('synced');
  });

  it('reports not_sent before needs_review', async () => {
    await addConflict('a-1', 'open');
    await mockDb.writeTransaction((tx) =>
      tx.execute("INSERT INTO upload_failures (id, table_name, record_id) VALUES (uuid(), 'athletes', 'a-1')"),
    );

    expect(await stateOf('a-1')).toBe('not_sent');
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
    mockStatus = { connected: false, dataFlowStatus: { uploading: true, downloadError: new Error('unreachable') }, lastSyncedAt };

    expect(await summary()).toEqual({ pending: 2, failed: 1, uploading: true, lastSyncedAt, connected: false, connection: 'offline' });
  });

  it('reports nothing pending and no last sync on a fresh database', async () => {
    expect(await summary()).toEqual({ pending: 0, failed: 0, uploading: false, lastSyncedAt: null, connected: true, connection: 'connected' });
  });

  it('reports connecting, not offline, while the first connection has not failed or finished', async () => {
    mockStatus = { connected: false, dataFlowStatus: { uploading: false } };

    expect(await summary()).toMatchObject({ connected: false, connection: 'connecting' });
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

    // Both records count as unsent; both have a server rejection.
    expect(await countUnsentRecords()).toEqual({ unsent: 2, rejected: 2 });
  });

  it('is zero on a fresh database', async () => {
    expect(await countUnsentRecords()).toEqual({ unsent: 0, rejected: 0 });
  });
});

describe('countUnsentRecords rejected', () => {
  it('counts only rejected records as rejected', async () => {
    await writeRecord('athletes', { first_name: 'Ana' });

    expect(await countUnsentRecords()).toEqual({ unsent: 1, rejected: 0 });
  });
});
