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

type Failure = { op: string; payload: object; failedAt?: string; clientId?: number };

let store: ReturnType<typeof createStore>;
beforeEach(() => {
  store = createStore();
  // The fake store has no PowerSync core: a plain table stands in for its powersync_crud queue.
  const raw = new DatabaseSync(store.path);
  raw.exec('CREATE TABLE powersync_crud (op TEXT, id TEXT, type TEXT, data TEXT)');
  // The shared fake athletes table has no server-assigned audit columns; add the ones the retry rules name.
  raw.exec('ALTER TABLE athletes ADD COLUMN created_at TEXT');
  raw.exec('ALTER TABLE athletes ADD COLUMN created_by TEXT');
  raw.exec('ALTER TABLE upload_failures ADD COLUMN client_id INTEGER');
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
      .prepare('INSERT INTO upload_failures (id, table_name, record_id, op, payload, error_code, failed_at, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        `f-${index}`, 'athletes', 'a-1', failure.op, JSON.stringify(failure.payload), '42501',
        failure.failedAt ?? `2026-10-24T1${index}:00:00.000Z`, failure.clientId ?? null,
      );
  });
  raw.close();
}

describe('retryFailedRecord', () => {
  it('queues the current row as a PUT, marks it pending and clears the failure; the connector uploads it', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, { op: 'PUT', payload: { first_name: 'Old' } });

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

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

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

    expect(queue()).toEqual([{ op: 'PATCH', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'New' }) }]);
  });

  it('omits only the server-assigned audit columns when they are null in a requeued PUT; every other null is sent', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: null, created_at: null }, { op: 'PUT', payload: { first_name: 'Old' } });

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

    // created_at and created_by are null locally and left out; last_name was cleared by the user and is sent as null.
    expect(queue()).toEqual([{ op: 'PUT', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana', last_name: null }) }]);
  });

  it('sends the audit columns in a requeued PUT when they have a value', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos', created_at: '2026-10-24T09:00:00.000Z' }, { op: 'PUT', payload: {} });

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

    expect(queue()).toEqual([
      { op: 'PUT', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana', last_name: 'Ríos', created_at: '2026-10-24T09:00:00.000Z' }) },
    ]);
  });

  it('still sends an explicit null in a requeued PATCH', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: null }, { op: 'PATCH', payload: { last_name: 'Old' } });

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

    expect(queue()).toEqual([{ op: 'PATCH', id: 'a-1', type: 'athletes', data: JSON.stringify({ last_name: null }) }]);
  });

  it('queues a DELETE without data when the latest failure is a DELETE and the row is gone', async () => {
    seed(null, { op: 'DELETE', payload: {} });

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

    expect(queue()).toEqual([{ op: 'DELETE', id: 'a-1', type: 'athletes', data: null }]);
    expect(pending()).toEqual([{ table_name: 'athletes', record_id: 'a-1' }]);
    expect(remainingFailures()).toEqual([]);
  });

  it('queues a DELETE, not a PUT, when the latest failure is a DELETE and the row was downloaded back', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, { op: 'PUT', payload: {} }, { op: 'DELETE', payload: {} });

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

    expect(queue()).toEqual([{ op: 'DELETE', id: 'a-1', type: 'athletes', data: null }]);
    expect(remainingFailures()).toEqual([]);
  });

  it('does nothing when the row is missing and the latest failure is not a DELETE: the user never deleted it', async () => {
    seed(null, { op: 'PUT', payload: { first_name: 'Old' } });

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('row_missing');

    expect(queue()).toEqual([]);
    expect(pending()).toEqual([]);
    expect(remainingFailures()).toHaveLength(1);
  });

  it('writes nothing when the record has no failure', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: null });

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('nothing_to_send');

    expect(queue()).toEqual([]);
    expect(pending()).toEqual([]);
  });

  it('requeues one PUT with the full current row when a PUT failure is followed by a PATCH failure', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, { op: 'PUT', payload: {} }, { op: 'PATCH', payload: { last_name: 'Old' } });

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

    expect(queue()).toEqual([{ op: 'PUT', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana', last_name: 'Ríos' }) }]);
    expect(remainingFailures()).toEqual([]);
  });

  it('requeues one PATCH with the current values of the union of all failed PATCH columns', async () => {
    seed(
      { id: 'a-1', first_name: 'Ana', last_name: 'Ríos' },
      { op: 'PATCH', payload: { first_name: 'Old' } },
      { op: 'PATCH', payload: { last_name: 'Old' } },
    );

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

    expect(queue()).toEqual([{ op: 'PATCH', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana', last_name: 'Ríos' }) }]);
    expect(remainingFailures()).toEqual([]);
  });

  it('does nothing when no failed PATCH column is a column of the row any more', async () => {
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, { op: 'PATCH', payload: { removed_column: 'x' } });

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('nothing_to_send');

    expect(queue()).toEqual([]);
    expect(pending()).toEqual([]);
    expect(remainingFailures()).toHaveLength(1);
  });

  it('breaks a failed_at tie by queue order: a DELETE with the higher client_id wins over a PUT', async () => {
    const failedAt = '2026-10-24T10:00:00.000Z';
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, { op: 'PUT', payload: {}, failedAt, clientId: 1 }, { op: 'DELETE', payload: {}, failedAt, clientId: 2 });

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

    expect(queue()).toEqual([{ op: 'DELETE', id: 'a-1', type: 'athletes', data: null }]);
  });

  it('breaks a failed_at tie by queue order: a PUT with the higher client_id wins over a DELETE', async () => {
    const failedAt = '2026-10-24T10:00:00.000Z';
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, { op: 'DELETE', payload: {}, failedAt, clientId: 1 }, { op: 'PUT', payload: {}, failedAt, clientId: 2 });

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

    expect(queue()).toEqual([{ op: 'PUT', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana', last_name: 'Ríos' }) }]);
  });

  it('sorts a failure recorded before client_id existed (null) first, so the DELETE with a client_id decides a failed_at tie', async () => {
    const failedAt = '2026-10-24T10:00:00.000Z';
    seed({ id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, { op: 'PUT', payload: {}, failedAt }, { op: 'DELETE', payload: {}, failedAt, clientId: 1 });

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

    expect(queue()).toEqual([{ op: 'DELETE', id: 'a-1', type: 'athletes', data: null }]);
  });

  it('rejects an unsafe table name and writes nothing', async () => {
    await expect(retryFailedRecord('athletes; DROP TABLE athletes', 'a-1')).rejects.toThrow('Unsafe SQL identifier');

    expect(queue()).toEqual([]);
    expect(pending()).toEqual([]);
  });
});

describe('retryFailedRecord for an athlete created with its manager link (create_managed_athlete)', () => {
  const user = '00000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    const raw = new DatabaseSync(store.path);
    raw.exec('CREATE TABLE athlete_managers (id TEXT PRIMARY KEY, user_id TEXT, athlete_id TEXT, relation TEXT, created_at TEXT, created_by TEXT)');
    raw.exec('CREATE TABLE athlete_schools (id TEXT PRIMARY KEY, athlete_id TEXT, school_id TEXT, created_at TEXT, created_by TEXT)');
    raw.exec('CREATE TABLE uploaded_ops (id TEXT PRIMARY KEY, client_id INTEGER)');
    raw.close();
  });

  function seedRows(sql: string[], failures: [table: string, id: string, op: string, payload: object][]) {
    const raw = new DatabaseSync(store.path);
    sql.forEach((statement) => raw.exec(statement));
    failures.forEach(([table, id, op, payload], index) => {
      raw
        .prepare('INSERT INTO upload_failures (id, table_name, record_id, op, payload, error_code, failed_at, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(`f-${index}`, table, id, op, JSON.stringify(payload), '42501', '2026-10-24T10:00:00.000Z', index + 1);
    });
    raw.close();
  }

  const athleteRow = "INSERT INTO athletes (id, first_name, last_name) VALUES ('a-1', 'Ana', 'Ríos')";
  const managerRow = `INSERT INTO athlete_managers (id, user_id, athlete_id, relation) VALUES ('m-1', '${user}', 'a-1', 'guardian')`;
  const managerData = { user_id: user, athlete_id: 'a-1', relation: 'guardian' };
  // The connector sends both ops of the pair as one RPC and records its outcome on both: they fail together.
  const pairFailures: [string, string, string, object][] = [
    ['athletes', 'a-1', 'PUT', { first_name: 'Ana', last_name: 'Ríos' }],
    ['athlete_managers', 'm-1', 'PUT', managerData],
  ];

  it.each([
    ['athletes', 'a-1'],
    ['athlete_managers', 'm-1'],
  ])('retrying the %s record requeues the whole pair, and the connector sends it as one create_managed_athlete call', async (table, id) => {
    seedRows([athleteRow, managerRow], pairFailures);

    await expect(retryFailedRecord(table, id)).resolves.toBe('queued');

    expect(queue()).toEqual([
      { op: 'PUT', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana', last_name: 'Ríos' }) },
      { op: 'PUT', id: 'm-1', type: 'athlete_managers', data: JSON.stringify(managerData) },
    ]);
    expect(pending()).toEqual([
      { table_name: 'athletes', record_id: 'a-1' },
      { table_name: 'athlete_managers', record_id: 'm-1' },
    ]);
    expect(remainingFailures()).toEqual([]);
    // One local transaction: PowerSync hands both ops to the connector as one CRUD transaction.
    expect(mockDb.transactions).toHaveLength(1);

    const crud = queue().map((queued, index) => ({
      clientId: index + 1, op: queued.op, id: queued.id, table: queued.type, opData: JSON.parse(queued.data!),
    })) as unknown as CrudEntry[];
    const rpc = jest.fn().mockResolvedValue({ data: 'stored', error: null });
    const from = jest.fn();
    const complete = jest.fn().mockResolvedValue(undefined);
    const database = {
      getNextCrudTransaction: jest.fn().mockResolvedValue({ crud, complete }),
      writeTransaction: mockDb.writeTransaction.bind(mockDb),
    } as unknown as AbstractPowerSyncDatabase;

    await new SupabaseConnector({ rpc, from } as unknown as SupabaseClient, 'https://sync.example.test').uploadData(database);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_managed_athlete', {
      payload: { athlete: { id: 'a-1', first_name: 'Ana', last_name: 'Ríos' }, manager: { id: 'm-1', ...managerData } },
    });
    expect(from).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(pending()).toEqual([]);
    expect(remainingFailures()).toEqual([]);
  });

  it('requeues only the athlete when its manager link did not fail', async () => {
    seedRows([athleteRow, managerRow], [pairFailures[0]]);

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

    expect(queue()).toEqual([{ op: 'PUT', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana', last_name: 'Ríos' }) }]);
  });

  it('requeues only a failed athlete edit (PATCH), never a failed manager link with it', async () => {
    seedRows([athleteRow, managerRow], [['athletes', 'a-1', 'PATCH', { first_name: 'Old' }], pairFailures[1]]);

    await expect(retryFailedRecord('athletes', 'a-1')).resolves.toBe('queued');

    expect(queue()).toEqual([{ op: 'PATCH', id: 'a-1', type: 'athletes', data: JSON.stringify({ first_name: 'Ana' }) }]);
    expect(remainingFailures()).toEqual([{ record_id: 'm-1' }]);
  });

  it('requeues only the record of another table, even when it links a failed athlete', async () => {
    seedRows(
      [athleteRow, "INSERT INTO athlete_schools (id, athlete_id, school_id) VALUES ('s-1', 'a-1', 'school-1')"],
      [pairFailures[0], ['athlete_schools', 's-1', 'PUT', { athlete_id: 'a-1', school_id: 'school-1' }]],
    );

    await expect(retryFailedRecord('athlete_schools', 's-1')).resolves.toBe('queued');

    expect(queue()).toEqual([{ op: 'PUT', id: 's-1', type: 'athlete_schools', data: JSON.stringify({ athlete_id: 'a-1', school_id: 'school-1' }) }]);
    expect(remainingFailures()).toEqual([{ record_id: 'a-1' }]);
  });
});
