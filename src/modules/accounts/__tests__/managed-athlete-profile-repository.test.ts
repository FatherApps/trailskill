import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import { createInMemoryAthleteRepository, createPowerSyncAthleteRepository, type AthleteRepository } from '../../athletes';
import {
  createInMemoryManagedAthleteProfileRepository,
  createPowerSyncManagedAthleteProfileRepository,
  type ManagedAthleteProfileRepository,
} from '../data/managedAthleteProfiles';
import { createInMemoryManagedAthleteRepository, createPowerSyncManagedAthleteRepository, type ManagedAthleteRow } from '../data/managedAthletes';

let mockDb: FakeDatabase;
jest.mock('../../../core/sync/db', () => ({
  get db() {
    return mockDb;
  },
}));
jest.mock('../../../core/sync', () => ({
  get db() {
    return mockDb;
  },
  writeBatch: (writes: unknown) => jest.requireActual('../../../core/sync/writes').writeBatch(writes),
}));

// Synthetic data only.
let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

type Setup = { profiles: ManagedAthleteProfileRepository; athletes: AthleteRepository };

function createPowerSync(): Setup {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec('CREATE TABLE athlete_managers (id TEXT PRIMARY KEY, user_id TEXT, athlete_id TEXT, relation TEXT)');
  seed.close();
  mockDb = openDatabase(store.path);
  const athletes = createPowerSyncAthleteRepository(createPowerSyncManagedAthleteRepository(), {
    listBySchool: async () => [],
    listAll: async () => [],
    listByIds: async (ids) =>
      mockDb.getAll<{ id: string; first_name: string; last_name: string }>('SELECT * FROM athletes ORDER BY last_name, first_name').filter((a) => ids.includes(a.id)).map((a) => ({ id: a.id, firstName: a.first_name, lastName: a.last_name, categoryId: null, groupIds: [] })),
  });
  return { athletes, profiles: createPowerSyncManagedAthleteProfileRepository(athletes) };
}

function createInMemory(): Setup {
  const rows: ManagedAthleteRow[] = [];
  const athletes = createInMemoryAthleteRepository(createInMemoryManagedAthleteRepository(rows));
  return { athletes, profiles: createInMemoryManagedAthleteProfileRepository(athletes, rows) };
}

describe.each([
  ['in-memory', createInMemory],
  ['PowerSync', createPowerSync],
] as [string, () => Setup][])('%s managed athlete profiles', (_name, create) => {
  it('a guardian adds two profiles and manages both', async () => {
    const { profiles, athletes } = create();

    await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: ' Lucía ', lastName: 'Rojas', relation: 'guardian' });
    await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Mateo', lastName: 'Cano', relation: 'guardian' });

    const managed = await athletes.listManaged('guardian-1');
    expect(managed.map((a) => `${a.firstName} ${a.lastName}`)).toEqual(['Mateo Cano', 'Lucía Rojas']);
    await expect(athletes.listManaged('guardian-2')).resolves.toEqual([]);
  });

  it('an adult has a single own profile: asking for a second returns the first', async () => {
    const { profiles, athletes } = create();

    const first = await profiles.createManagedAthlete({ userId: 'adult-1', firstName: 'Camila', lastName: 'Rojas', relation: 'self' });
    const second = await profiles.createManagedAthlete({ userId: 'adult-1', firstName: 'Otra', lastName: 'Persona', relation: 'self' });

    expect(second).toBe(first);
    await expect(athletes.listManaged('adult-1')).resolves.toHaveLength(1);
  });
});

describe('PowerSync managed athlete profiles', () => {
  it('writes the athlete and its link in one transaction, athlete first, both pending upload, relation guardian', async () => {
    const { profiles } = createPowerSync();

    const id = await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Lucía', lastName: 'Rojas', relation: 'guardian' });
    await profiles.createManagedAthlete({ userId: 'guardian-1', firstName: 'Mateo', lastName: 'Cano', relation: 'guardian' });

    expect(mockDb.transactions).toHaveLength(2);
    const links = mockDb.getAll<{ athlete_id: string; relation: string }>('SELECT athlete_id, relation FROM athlete_managers');
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.relation === 'guardian')).toBe(true);
    const pending = mockDb.getAll<{ table_name: string; record_id: string }>('SELECT table_name, record_id FROM pending_writes');
    expect(pending.filter((p) => p.table_name === 'athletes')).toHaveLength(2);
    expect(pending.filter((p) => p.table_name === 'athlete_managers')).toHaveLength(2);
    expect(pending.some((p) => p.table_name === 'athletes' && p.record_id === id)).toBe(true);
    const order = mockDb.transactions[0]!.filter((s) => s.sql.startsWith('INSERT INTO athlete')).map((s) => s.sql.split(' ')[2]);
    expect(order).toEqual(['athletes', 'athlete_managers']);
  });

  it('a second self profile writes nothing', async () => {
    const { profiles } = createPowerSync();
    await profiles.createManagedAthlete({ userId: 'adult-1', firstName: 'Camila', lastName: 'Rojas', relation: 'self' });
    await profiles.createManagedAthlete({ userId: 'adult-1', firstName: 'Otra', lastName: 'Persona', relation: 'self' });

    expect(mockDb.getAll('SELECT id FROM athletes')).toHaveLength(1);
  });
});
