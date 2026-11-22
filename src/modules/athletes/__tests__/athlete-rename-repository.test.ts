import type { AbstractPowerSyncDatabase, CrudEntry } from '@powersync/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SupabaseConnector } from '../../../core/sync/connector';
import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import { createInMemoryManagedAthleteRepository } from '../../accounts';
import { cleanAthleteName, MAX_ATHLETE_NAME_LENGTH } from '../data/athleteName';
import { createInMemoryAthleteRepository, createPowerSyncAthleteRepository } from '../data/athleteRepository';
import { createInMemorySchoolAthleteRepository } from '../data/schoolAthletes';

let mockDb: FakeDatabase;
jest.mock('../../../core/sync/db', () => ({
  get db() {
    return mockDb;
  },
}));
// The index of core/sync loads an ESM-only package; the writes themselves are the real ones, over the fake database.
jest.mock('../../../core/sync', () => ({
  get db() {
    return mockDb;
  },
  writeBatch: (...args: unknown[]) => (jest.requireActual('../../../core/sync/writes') as typeof import('../../../core/sync/writes')).writeBatch(...(args as [never])),
}));

// Synthetic data only.
describe('cleanAthleteName', () => {
  it('trims the ends and keeps the inside', () => {
    expect(cleanAthleteName('  Ana María ')).toBe('Ana María');
  });

  it('refuses a name that is empty after trimming, or longer than 100 characters', () => {
    expect(cleanAthleteName('   ')).toBeNull();
    expect(cleanAthleteName('a'.repeat(MAX_ATHLETE_NAME_LENGTH))).toHaveLength(100);
    expect(cleanAthleteName('a'.repeat(MAX_ATHLETE_NAME_LENGTH + 1))).toBeNull();
  });
});

describe('in-memory athlete repository: renameProfile', () => {
  const setup = () => {
    const rows = [{ id: 'a1', firstName: 'Ana', lastName: 'Marin', categoryId: null, groupIds: [] }];
    return createInMemoryAthleteRepository(createInMemoryManagedAthleteRepository([]), rows);
  };

  it('stores the trimmed names, readable again from the device list', async () => {
    const repository = setup();
    await repository.renameProfile('a1', { firstName: '  Lucía ', lastName: ' Gómez  ' });

    expect(await repository.listOnDevice()).toEqual([expect.objectContaining({ id: 'a1', firstName: 'Lucía', lastName: 'Gómez' })]);
  });

  it('refuses an invalid name and an athlete that is not on the device, changing nothing', async () => {
    const repository = setup();

    await expect(repository.renameProfile('a1', { firstName: '  ', lastName: 'Gómez' })).rejects.toThrow('name');
    await expect(repository.renameProfile('a1', { firstName: 'Lucía', lastName: 'x'.repeat(101) })).rejects.toThrow('name');
    await expect(repository.renameProfile('nobody', { firstName: 'Lucía', lastName: 'Gómez' })).rejects.toThrow('not on this device');
    expect(await repository.listOnDevice()).toEqual([expect.objectContaining({ firstName: 'Ana', lastName: 'Marin' })]);
  });
});

describe('PowerSync athlete repository: a name edited offline (issue 1365)', () => {
  let removeStore: (() => void) | undefined;
  afterEach(() => {
    removeStore?.();
    removeStore = undefined;
  });

  function openWithAthlete() {
    const store = createStore();
    removeStore = store.remove;
    mockDb = openDatabase(store.path);
    return mockDb.writeTransaction((tx) =>
      tx.execute("INSERT INTO athletes (id, first_name, last_name) VALUES ('a1', 'Ana', 'Marin')"),
    );
  }

  const repository = () =>
    createPowerSyncAthleteRepository(createInMemoryManagedAthleteRepository([]), createInMemorySchoolAthleteRepository({ athletes: [], athleteSchools: [], athleteGroups: [] }));

  it('updates the row on the device, leaves it in the upload queue, and uploads it as the PATCH the server accepts', async () => {
    await openWithAthlete();
    await repository().renameProfile('a1', { firstName: '  Lucía ', lastName: ' Gómez  ' });

    // On the device and waiting to be sent: no connection was needed.
    expect(mockDb.getAll('SELECT first_name, last_name FROM athletes WHERE id = ?', ['a1'])).toEqual([{ first_name: 'Lucía', last_name: 'Gómez' }]);
    expect(mockDb.getAll('SELECT table_name, record_id FROM pending_writes')).toEqual([{ table_name: 'athletes', record_id: 'a1' }]);

    // PowerSync turns the committed UPDATE into one PATCH carrying only the columns it set; read them from the statement that was run.
    const update = mockDb.transactions.flat().find(({ sql }) => sql.startsWith('UPDATE athletes SET'));
    expect(update).toBeDefined();
    const columns = [...update!.sql.split(' WHERE ')[0].matchAll(/(\w+) = \?/g)].map((match) => match[1]);
    const opData = Object.fromEntries(columns.map((column, index) => [column, update!.params[index]]));
    expect(opData).toEqual({ first_name: 'Lucía', last_name: 'Gómez' });

    // Back online: the connector sends it, and the queue marker is cleared.
    const select = jest.fn().mockResolvedValue({ data: [{ id: 'a1' }], error: null });
    const eq = jest.fn().mockReturnValue({ select });
    const patch = jest.fn().mockReturnValue({ eq });
    const client = { from: jest.fn().mockReturnValue({ update: patch }), auth: { getSession: jest.fn(), refreshSession: jest.fn() } };
    const complete = jest.fn().mockResolvedValue(undefined);
    const deletes: string[] = [];
    const database = {
      getNextCrudTransaction: jest.fn().mockResolvedValue({ crud: [{ op: 'PATCH', table: 'athletes', id: 'a1', opData, clientId: 1 } as unknown as CrudEntry], complete }),
      writeTransaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ execute: async (sql: string) => void deletes.push(sql), getOptional: async () => null }),
    } as unknown as AbstractPowerSyncDatabase;
    await new SupabaseConnector(client as unknown as SupabaseClient, 'https://sync.example.test').uploadData(database);

    expect(client.from).toHaveBeenCalledWith('athletes');
    expect(patch).toHaveBeenCalledWith({ first_name: 'Lucía', last_name: 'Gómez' });
    expect(eq).toHaveBeenCalledWith('id', 'a1');
    expect(deletes.some((sql) => sql.startsWith('DELETE FROM pending_writes'))).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('refuses an invalid name or an athlete that is not on the device, writing nothing', async () => {
    await openWithAthlete();
    const before = mockDb.transactions.length;

    await expect(repository().renameProfile('a1', { firstName: '   ', lastName: 'Gómez' })).rejects.toThrow('name');
    await expect(repository().renameProfile('ghost', { firstName: 'Lucía', lastName: 'Gómez' })).rejects.toThrow('not on this device');

    expect(mockDb.getAll('SELECT first_name FROM athletes')).toEqual([{ first_name: 'Ana' }]);
    expect(mockDb.getAll('SELECT * FROM athletes WHERE id = ?', ['ghost'])).toEqual([]);
    expect(mockDb.getAll('SELECT * FROM pending_writes')).toEqual([]);
    expect(mockDb.transactions.length).toBeGreaterThanOrEqual(before);
  });
});
