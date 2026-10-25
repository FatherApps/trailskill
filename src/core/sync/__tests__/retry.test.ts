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

type Failure = { op: string; payload: object };

let store: ReturnType<typeof createStore>;
beforeEach(() => {
  store = createStore();
  // The fake store has no PowerSync core: a plain table stands in for its powersync_crud queue.
  const raw = new DatabaseSync(store.path);
  raw.exec('CREATE TABLE powersync_crud (op TEXT, id TEXT, type TEXT, data TEXT)');
  // The shared fake athletes table has no server-assigned audit columns; add the ones the retry rules name.
  raw.exec('ALTER TABLE athletes ADD COLUMN created_at TEXT');
  raw.exec('ALTER TABLE athletes ADD COLUMN created_by TEXT');
  raw.close();
  mockDb = openDatabase(store.path);
});
afterEach(() => store.remove());

const queue = () => mockDb.getAll<QueuedOp>('SELECT op, id, type, data FROM powersync_crud');
const remainingFailures = () => mockDb.getAll<{ record_id: string }>('SELECT record_id FROM upload_failures');
const pending = () => mockDb.getAll<{ table_name: string; record_id: string }>('SELECT table_name, record_id FROM pending_writes');

type Row = { id: string; first_name: string | null; last_name: string | null; created_at?: string | null };

function seed(row: Row | null, ...failures: Failure[]) {
  const raw = new DatabaseSync(store.path);
  if (row) {
    raw
      .prepare('INSERT INTO athletes (id, first_name, last_name, created_at) VALUES (?, ?, ?, ?)')
      .run(row.id, row.first_name, row.last_name, row.created_at ?? null);
  }
  failures.forEach((failure, index) => {
    raw
      .prepare('INSERT INTO upload_failures (id, table_name, record_id, op, payload, error_code, failed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(`f-${index}`, 'athletes', 'a-1', failure.op, JSON.stringify(failure.payload), '42501', `2026-10-24T1${index}:00:00.000Z`);
  });
  raw.close();
}

describe('retryFailedRecord', () => {
  it('queues the current row as a PUT, marks it pending and clears the failure; the connector uploads it', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, { op: 'PUT', payload: { first_name: 'Old' } });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([{ op: 'PUT', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana', last_name: 'Ríos' }) }]);
    expect(pending()).toEqual([{ table_name: 'athletes', record_id: 'a-1' }]);
    expect(remainingFailures()).toEqual([]);
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
    expect(remainingFailures()).toEqual([]);
  });

  it('never uploads old values over a newer edit: a failed PATCH is requeued with the current values of its columns', async () => {
    seed({ id: 'a-1', first_name: 'New', last_name: 'Ríos' }, { op: 'PATCH', payload: { first_name: 'Old' } });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([{ op: 'PATCH', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'New' }) }]);
  });

  it('omits only the server-assigned audit columns when they are null in a requeued PUT; every other null is sent', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: null, created_at: null }, { op: 'PUT', payload: { first_name: 'Old' } });

    await retryFailedRecord('athletes', 'a-1');

    // created_at and created_by are null locally and left out; last_name was cleared by the user and is sent as null.
    expect(queue()).toEqual([{ op: 'PUT', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana', last_name: null }) }]);
  });

  it('sends the audit columns in a requeued PUT when they have a value', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos', created_at: '2026-10-24T09:00:00.000Z' }, { op: 'PUT', payload: {} });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([
      { op: 'PUT', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana', last_name: 'Ríos', created_at: '2026-10-24T09:00:00.000Z' }) },
    ]);
  });

  it('still sends an explicit null in a requeued PATCH', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: null }, { op: 'PATCH', payload: { last_name: 'Old' } });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([{ op: 'PATCH', id: 'a-1', type: 'athletes', data: JSON.stringify({ last_name: null }) }]);
  });

  it('queues a DELETE without data when the latest failure is a DELETE and the row is gone', async () => {
    seed(null, { op: 'DELETE', payload: {} });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([{ op: 'DELETE', id: 'a-1', type: 'athletes', data: null }]);
    expect(pending()).toEqual([{ table_name: 'athletes', record_id: 'a-1' }]);
    expect(remainingFailures()).toEqual([]);
  });

  it('queues a DELETE, not a PUT, when the latest failure is a DELETE and the row was downloaded back', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, { op: 'PUT', payload: {} }, { op: 'DELETE', payload: {} });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([{ op: 'DELETE', id: 'a-1', type: 'athletes', data: null }]);
    expect(remainingFailures()).toEqual([]);
  });

  it('does nothing when the row is missing and the latest failure is not a DELETE: the user never deleted it', async () => {
    seed(null, { op: 'PUT', payload: { first_name: 'Old' } });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([]);
    expect(pending()).toEqual([]);
    expect(remainingFailures()).toHaveLength(1);
  });

  it('writes nothing when the record has no failure', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: null });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([]);
    expect(pending()).toEqual([]);
  });

  it('requeues one PUT with the full current row when a PUT failure is followed by a PATCH failure', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, { op: 'PUT', payload: {} }, { op: 'PATCH', payload: { last_name: 'Old' } });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([{ op: 'PUT', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana', last_name: 'Ríos' }) }]);
    expect(remainingFailures()).toEqual([]);
  });

  it('requeues one PATCH with the current values of the union of all failed PATCH columns', async () => {
    seed(
      { id: 'a-1', first_name: 'Ana', last_name: 'Ríos' },
      { op: 'PATCH', payload: { first_name: 'Old' } },
      { op: 'PATCH', payload: { last_name: 'Old' } },
    );

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([{ op: 'PATCH', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana', last_name: 'Ríos' }) }]);
    expect(remainingFailures()).toEqual([]);
  });

  it('does nothing when no failed PATCH column is a column of the row any more', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, { op: 'PATCH', payload: { removed_column: 'x' } });

    await retryFailedRecord('athletes', 'a-1');

    expect(queue()).toEqual([]);
    expect(pending()).toEqual([]);
    expect(remainingFailures()).toHaveLength(1);
  });

  it('rejects an unsafe table name and writes nothing', async () => {
    await expect(retryFailedRecord('athletes; DROP TABLE athletes', 'a-1')).rejects.toThrow('Unsafe SQL identifier');

    expect(queue()).toEqual([]);
    expect(pending()).toEqual([]);
  });
});
