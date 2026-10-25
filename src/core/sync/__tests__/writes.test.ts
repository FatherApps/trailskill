import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../testing/fakeDatabase';
import { deleteRecord, editRecord, writeRecord } from '../writes';

let mockDb: FakeDatabase;
jest.mock('../db', () => ({
  get db() {
    return mockDb;
  },
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let store: ReturnType<typeof createStore>;
beforeEach(() => {
  store = createStore();
  mockDb = openDatabase(store.path);
});
afterEach(() => store.remove());

const athlete = (id: string) => mockDb.getAll('SELECT * FROM athletes WHERE id = ?', [id])[0];
const pending = () => mockDb.getAll<{ table_name: string; record_id: string }>('SELECT table_name, record_id FROM pending_writes');
const sqlOf = (transaction: { sql: string }[]) => transaction.map(({ sql }) => sql);

describe('writeRecord', () => {
  it('writes the row and its pending_writes entry in one transaction and returns a new UUID', async () => {
    const id = await writeRecord('athletes', { first_name: 'Ana', last_name: 'Ríos' });

    expect(id).toMatch(UUID);
    expect(mockDb.transactions).toHaveLength(1);
    const statements = sqlOf(mockDb.transactions[0]);
    expect(statements.some((sql) => sql.startsWith('INSERT INTO athletes'))).toBe(true);
    expect(statements.some((sql) => sql.startsWith('INSERT INTO pending_writes'))).toBe(true);
    expect(athlete(id)).toEqual({ id, first_name: 'Ana', last_name: 'Ríos' });
    expect(pending()).toEqual([{ table_name: 'athletes', record_id: id }]);
  });

  it('inserts a new row with the given id', async () => {
    await expect(writeRecord('athletes', { id: 'athlete-1', first_name: 'Ana' })).resolves.toBe('athlete-1');

    expect(athlete('athlete-1')).toEqual({ id: 'athlete-1', first_name: 'Ana', last_name: null });
    expect(pending()).toEqual([{ table_name: 'athletes', record_id: 'athlete-1' }]);
  });

  it('inserts a row with only an id when no column is given', async () => {
    const id = await writeRecord('athletes', {});

    expect(id).toMatch(UUID);
    expect(athlete(id)).toEqual({ id, first_name: null, last_name: null });
    expect(pending()).toEqual([{ table_name: 'athletes', record_id: id }]);
  });

  it('updates only the given columns of an existing row and marks it pending again', async () => {
    await writeRecord('athletes', { id: 'athlete-1', first_name: 'Ana', last_name: 'Ríos' });
    await writeRecord('athletes', { id: 'athlete-1', first_name: 'Bea' });

    expect(mockDb.transactions).toHaveLength(2);
    expect(sqlOf(mockDb.transactions[1]).some((sql) => sql.startsWith('UPDATE athletes'))).toBe(true);
    expect(athlete('athlete-1')).toEqual({ id: 'athlete-1', first_name: 'Bea', last_name: 'Ríos' });
    expect(pending()).toHaveLength(2);
  });

  it('leaves an existing row and the queue untouched when no column is given', async () => {
    await writeRecord('athletes', { id: 'athlete-1', first_name: 'Ana' });
    await writeRecord('athletes', { id: 'athlete-1' });

    expect(pending()).toHaveLength(1);
  });

  it.each([
    ['athletes; DROP TABLE athletes', { first_name: 'Ana' }],
    ['athletes', { 'first_name = 1; --': 'Ana' }],
  ])('rejects the unsafe identifier in %p without opening a transaction', async (table, values) => {
    await expect(writeRecord(table, values)).rejects.toThrow('Unsafe SQL identifier');
    expect(mockDb.transactions).toHaveLength(0);
  });
});

describe('deleteRecord', () => {
  it('deletes the row and adds its pending_writes entry in one transaction', async () => {
    await writeRecord('athletes', { id: 'athlete-1', first_name: 'Ana' });
    await deleteRecord('athletes', 'athlete-1');

    expect(mockDb.transactions).toHaveLength(2);
    const statements = sqlOf(mockDb.transactions[1]);
    expect(statements.some((sql) => sql.startsWith('DELETE FROM athletes'))).toBe(true);
    expect(statements.some((sql) => sql.startsWith('INSERT INTO pending_writes'))).toBe(true);
    expect(athlete('athlete-1')).toBeUndefined();
    expect(pending()).toEqual([
      { table_name: 'athletes', record_id: 'athlete-1' },
      { table_name: 'athletes', record_id: 'athlete-1' },
    ]);
  });

  it('adds no pending entry when the row does not exist', async () => {
    await deleteRecord('athletes', 'missing');

    expect(pending()).toEqual([]);
  });
});

describe('editRecord', () => {
  // A versioned table stands in for measurements: the sync fake only creates the plain ones.
  const seedVersioned = (version: number | null) => {
    const seed = new DatabaseSync(store.path);
    seed.exec('CREATE TABLE versioned (id TEXT PRIMARY KEY, hundredths INTEGER, version INTEGER, base_version INTEGER, edited_device_id TEXT)');
    seed.prepare("INSERT INTO versioned (id, hundredths, version) VALUES ('r1', 3000, ?)").run(version);
    seed.close();
  };
  const row = () => mockDb.getAll('SELECT * FROM versioned WHERE id = ?', ['r1'])[0];

  it('writes the values with the version they were based on and queues the upload in one transaction', async () => {
    seedVersioned(3);

    await editRecord('versioned', 'r1', { hundredths: 2950, edited_device_id: 'device-a' });

    expect(mockDb.transactions).toHaveLength(1);
    expect(row()).toEqual({ id: 'r1', hundredths: 2950, version: 3, base_version: 3, edited_device_id: 'device-a' });
    expect(pending()).toEqual([{ table_name: 'versioned', record_id: 'r1' }]);
  });

  it('treats a row not uploaded yet (no version) as version 1, so its own correction is not a conflict', async () => {
    seedVersioned(null);

    await editRecord('versioned', 'r1', { hundredths: 2950 });

    expect(row()).toMatchObject({ version: null, base_version: 1 });
  });

  it('keeps the version it was based on when edited again before the server answers', async () => {
    seedVersioned(3);

    await editRecord('versioned', 'r1', { hundredths: 2950 });
    await editRecord('versioned', 'r1', { hundredths: 2900 });

    expect(row()).toMatchObject({ hundredths: 2900, version: 3, base_version: 3 });
    expect(pending()).toHaveLength(2);
  });

  it('rejects a record that is not on the device and writes nothing', async () => {
    seedVersioned(3);

    await expect(editRecord('versioned', 'missing', { hundredths: 2950 })).rejects.toThrow('missing');

    expect(pending()).toEqual([]);
    expect(row()).toMatchObject({ hundredths: 3000, base_version: null });
  });

  it('rejects an unsafe column name', async () => {
    seedVersioned(3);

    await expect(editRecord('versioned', 'r1', { 'hundredths = 0; --': 1 })).rejects.toThrow('Unsafe SQL identifier');
    expect(pending()).toEqual([]);
  });
});
