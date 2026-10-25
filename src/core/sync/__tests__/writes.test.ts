import { createStore, openDatabase, type FakeDatabase } from '../testing/fakeDatabase';
import { deleteRecord, writeRecord } from '../writes';

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
