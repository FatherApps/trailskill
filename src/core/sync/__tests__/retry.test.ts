import type { AbstractPowerSyncDatabase, CrudEntry } from '@powersync/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DatabaseSync } from 'node:sqlite';

import { SupabaseConnector } from '../connector';
import { createStore, openDatabase, type FakeDatabase } from '../testing/fakeDatabase';
import { retryFailedRecord } from '../writes';

let mockDb: FakeDatabase;
jest.mock('../db', () => ({
  get db() {
    return mockDb;
  },
}));

type QueuedOp = { op: string; id: string; type: string; data: string | null };

let store: ReturnType<typeof createStore>;
beforeEach(() => {
  store = createStore();
  // The fake store has no PowerSync core: a plain table stands in for its powersync_crud queue.
  const raw = new DatabaseSync(store.path);
  raw.exec('CREATE TABLE powersync_crud (op TEXT, id TEXT, type TEXT, data TEXT)');
  raw.close();
  mockDb = openDatabase(store.path);
});
afterEach(() => store.remove());

const queue = () => mockDb.getAll<QueuedOp>('SELECT op, id, type, data FROM powersync_crud');
const failures = () => mockDb.getAll<{ record_id: string }>('SELECT record_id FROM upload_failures');
const pending = () => mockDb.getAll<{ table_name: string; record_id: string }>('SELECT table_name, record_id FROM pending_writes');

function seed(row: { id: string; first_name: string | null; last_name: string | null } | null, failure?: { op: string; payload: object }) {
  const raw = new DatabaseSync(store.path);
  if (row) raw.prepare('INSERT INTO athletes (id, first_name, last_name) VALUES (?, ?, ?)').run(row.id, row.first_name, row.last_name);
  if (failure) {
    raw
      .prepare('INSERT INTO upload_failures (id, table_name, record_id, op, payload, error_code, failed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('f-1', 'athletes', 'a-1', failure.op, JSON.stringify(failure.payload), '42501', '2026-10-24T10:00:00.000Z');
  }
  raw.close();
}

describe('retryFailedRecord', () => {
  it('queues the current row as a PUT, marks it pending and clears the failure; the connector uploads it', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, { op: 'PUT', payload: { first_name: 'Old' } });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([{ op: 'PUT', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana', last_name: 'Ríos' }) }]);
    expect(pending()).toEqual([{ table_name: 'athletes', record_id: 'a-1' }]);
    expect(failures()).toEqual([]);
    expect(mockDb.transactions).toHaveLength(1);

    // Feed the queued row to the connector as PowerSync would.
    const [queued] = queue();
    const entry = { clientId: 1, op: queued.op, id: queued.id, table: queued.type, opData: JSON.parse(queued.data!) } as unknown as CrudEntry;
    const upsert = jest.fn().mockResolvedValue({ data: null, error: null });
    const client = { from: jest.fn().mockReturnValue({ upsert }) } as unknown as SupabaseClient;
    const complete = jest.fn().mockResolvedValue(undefined);
    const database = {
      getNextCrudTransaction: jest.fn().mockResolvedValue({ crud: [entry], complete }),
      writeTransaction: mockDb.writeTransaction.bind(mockDb),
    } as unknown as AbstractPowerSyncDatabase;
    const raw = new DatabaseSync(store.path);
    raw.exec('CREATE TABLE uploaded_ops (id TEXT PRIMARY KEY, client_id INTEGER)');
    raw.close();

    await new SupabaseConnector(client, 'https://sync.example.test').uploadData(database);

    expect(upsert).toHaveBeenCalledWith({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(pending()).toEqual([]);
    expect(failures()).toEqual([]);
  });

  it('never uploads old values over a newer edit: a failed PATCH is requeued with the current values of its columns', async () => {
    seed({ id: 'a-1', first_name: 'New', last_name: 'Ríos' }, { op: 'PATCH', payload: { first_name: 'Old' } });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([{ op: 'PATCH', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'New' }) }]);
  });

  it('omits columns that are null locally from a requeued PUT so the server applies its defaults', async () => {
    // last_name stands in for a never-synced column such as created_at (not null default now() on the server).
    seed({ id: 'a-1', first_name: 'Ana', last_name: null }, { op: 'PUT', payload: { first_name: 'Old' } });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([{ op: 'PUT', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana' }) }]);
  });

  it('still sends an explicit null in a requeued PATCH', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: null }, { op: 'PATCH', payload: { last_name: 'Old' } });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([{ op: 'PATCH', id: 'a-1', type: 'athletes', data: JSON.stringify({ last_name: null }) }]);
  });

  it('queues a DELETE without data when the row no longer exists', async () => {
    seed(null, { op: 'PUT', payload: { first_name: 'Old' } });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([{ op: 'DELETE', id: 'a-1', type: 'athletes', data: null }]);
    expect(pending()).toEqual([{ table_name: 'athletes', record_id: 'a-1' }]);
    expect(failures()).toEqual([]);
  });

  it('writes nothing when the record has no failure', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: null });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([]);
    expect(pending()).toEqual([]);
  });

  it('uses the latest failure when the record failed more than once', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, { op: 'PUT', payload: {} });
    const raw = new DatabaseSync(store.path);
    raw
      .prepare('INSERT INTO upload_failures (id, table_name, record_id, op, payload, error_code, failed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('f-2', 'athletes', 'a-1', 'PATCH', JSON.stringify({ last_name: 'Old' }), '42501', '2026-10-24T11:00:00.000Z');
    raw.close();

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([{ op: 'PATCH', id: 'a-1', type: 'athletes', data: JSON.stringify({ last_name: 'Ríos' }) }]);
    expect(failures()).toEqual([]);
  });

  it('rejects an unsafe table name and writes nothing', async () => {
    await expect(retryFailedRecord('athletes; DROP TABLE athletes', 'a-1')).rejects.toThrow('Unsafe SQL identifier');

    expect(queue()).toEqual([]);
    expect(pending()).toEqual([]);
  });
});
