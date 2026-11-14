import { DatabaseSync } from 'node:sqlite';

import { createInMemoryAdultDirectoryRepository, type AdultContact } from '../../accounts';
import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemoryCoachRepository,
  createPowerSyncCoachRepository,
  type CoachMembershipRow,
  type CoachRepository,
} from '../data/coaches';

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
}));

// Synthetic data only.
const rows: CoachMembershipRow[] = [
  { schoolId: 'school-a', userId: 'coach-3', role: 'coach' },
  { schoolId: 'school-a', userId: 'coach-1', role: 'coach' },
  { schoolId: 'school-a', userId: 'admin-1', role: 'school_admin' },
  // The same person as admin and coach is listed once, as a coach.
  { schoolId: 'school-a', userId: 'coach-2', role: 'school_admin' },
  { schoolId: 'school-a', userId: 'coach-2', role: 'coach' },
  { schoolId: 'school-b', userId: 'coach-9', role: 'coach' },
  { schoolId: 'school-b', userId: 'coach-1', role: 'coach' },
];

// coach-1 and coach-2 have a profile; coach-3 has none. A profile of another school's coach does not matter here.
const profiles: AdultContact[] = [
  { userId: 'coach-1', firstName: 'Carla', lastName: 'Entrena', contactEmail: 'carla@example.test' },
  { userId: 'coach-2', firstName: 'Dario', lastName: 'Piscina', contactEmail: null },
  { userId: 'coach-9', firstName: 'Otra', lastName: 'Escuela', contactEmail: null },
];

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function createPowerSync(): CoachRepository {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec('CREATE TABLE school_memberships (id TEXT PRIMARY KEY, school_id TEXT, user_id TEXT, role TEXT);');
  rows.forEach((r, i) => seed.prepare('INSERT INTO school_memberships VALUES (?, ?, ?, ?)').run(`sm${i}`, r.schoolId, r.userId, r.role));
  seed.exec('CREATE TABLE adult_profiles (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, contact_email TEXT);');
  profiles.forEach((p) => seed.prepare('INSERT INTO adult_profiles VALUES (?, ?, ?, ?)').run(p.userId, p.firstName, p.lastName, p.contactEmail));
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncCoachRepository();
}

const factories: [string, () => CoachRepository][] = [
  ['in-memory', () => createInMemoryCoachRepository(rows, createInMemoryAdultDirectoryRepository({ profiles }))],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s coach repository', (_name, create) => {
  it('lists the coaches of the school by id, without admins, another school or duplicates, with the profile name, and null without a profile', async () => {
    await expect(create().listCoaches('school-a')).resolves.toEqual([
      { id: 'coach-1', name: 'Carla Entrena' },
      { id: 'coach-2', name: 'Dario Piscina' },
      { id: 'coach-3', name: null },
    ]);
  });

  it('lists nothing for a school without coaches', async () => {
    await expect(create().listCoaches('school-z')).resolves.toEqual([]);
  });
});
