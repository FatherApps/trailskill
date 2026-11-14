import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemoryAdultDirectoryRepository,
  createPowerSyncAdultDirectoryRepository,
  type AdultContact,
  type AdultDirectoryRepository,
} from '../data/adultDirectory';
import type { ManagedAthleteRow } from '../data/managedAthletes';

let mockDb: FakeDatabase;
jest.mock('../../../core/sync', () => ({
  get db() {
    return mockDb;
  },
}));

// Synthetic data only. 'guardian-2' has no profile; 'guardian-3' has a profile without contact; 'blank' has a blank name.
const profiles: AdultContact[] = [
  { userId: 'guardian-1', firstName: 'Ana', lastName: 'Prueba', contactEmail: 'ana@example.test' },
  { userId: 'guardian-3', firstName: ' Beto ', lastName: 'Ejemplo', contactEmail: null },
  { userId: 'coach-1', firstName: 'Carla', lastName: 'Entrena', contactEmail: 'carla@example.test' },
  { userId: 'blank', firstName: ' ', lastName: '', contactEmail: ' ' },
];
const managers: ManagedAthleteRow[] = [
  { userId: 'guardian-3', athleteId: 'a1', relation: 'guardian' },
  { userId: 'guardian-1', athleteId: 'a1', relation: 'guardian' },
  { userId: 'guardian-1', athleteId: 'a1', relation: 'guardian' },
  { userId: 'guardian-2', athleteId: 'a1', relation: 'guardian' },
  // The athlete's own account is not a guardian.
  { userId: 'adult-1', athleteId: 'a1', relation: 'self' },
  { userId: 'guardian-1', athleteId: 'a2', relation: 'guardian' },
  { userId: 'blank', athleteId: 'a3', relation: 'guardian' },
];

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function createPowerSync(): AdultDirectoryRepository {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec('CREATE TABLE athlete_managers (id TEXT PRIMARY KEY, user_id TEXT, athlete_id TEXT, relation TEXT)');
  seed.exec('CREATE TABLE adult_profiles (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, contact_email TEXT)');
  managers.forEach((m, i) => seed.prepare('INSERT INTO athlete_managers VALUES (?, ?, ?, ?)').run(`m${i}`, m.userId, m.athleteId, m.relation ?? null));
  profiles.forEach((p) => seed.prepare('INSERT INTO adult_profiles VALUES (?, ?, ?, ?)').run(p.userId, p.firstName, p.lastName, p.contactEmail));
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncAdultDirectoryRepository();
}

const factories: [string, () => AdultDirectoryRepository][] = [
  ['in-memory', () => createInMemoryAdultDirectoryRepository({ profiles, managers })],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s adult directory repository', (_name, create) => {
  it('gives the full name of the users that have a profile and leaves out the rest', async () => {
    const names = await create().listNames(['coach-1', 'guardian-2', 'guardian-3', 'blank']);

    expect([...names]).toEqual(expect.arrayContaining([['coach-1', 'Carla Entrena'], ['guardian-3', 'Beto Ejemplo']]));
    expect(names.size).toBe(2);
  });

  it('reads no names for no ids', async () => {
    await expect(create().listNames([])).resolves.toEqual(new Map());
  });

  it('lists the guardians of the athlete sorted by user id, once each, without the athlete themselves', async () => {
    await expect(create().listGuardians('a1')).resolves.toEqual([
      { userId: 'guardian-1', name: 'Ana Prueba', contact: 'ana@example.test' },
      { userId: 'guardian-2', name: null, contact: null },
      { userId: 'guardian-3', name: 'Beto Ejemplo', contact: null },
    ]);
  });

  it('gives null for a blank name and a blank contact, and lists nothing for an athlete without guardians', async () => {
    await expect(create().listGuardians('a3')).resolves.toEqual([{ userId: 'blank', name: null, contact: null }]);
    await expect(create().listGuardians('a9')).resolves.toEqual([]);
  });
});
