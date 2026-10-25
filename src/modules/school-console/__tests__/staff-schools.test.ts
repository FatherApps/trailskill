import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import { createInMemoryStaffSchoolRepository, createPowerSyncStaffSchoolRepository } from '..';
import type { StaffSchoolRepository } from '..';

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

const memberships = [
  { schoolId: 'school-b', schoolName: 'Blue Dolphins', userId: 'user-1', role: 'coach' },
  { schoolId: 'school-a', schoolName: 'Aqua Club', userId: 'user-1', role: 'coach' },
  { schoolId: 'school-a', schoolName: 'Aqua Club', userId: 'user-1', role: 'admin' },
  { schoolId: 'school-c', schoolName: 'Coral Swim', userId: 'user-2', role: 'admin' },
  { schoolId: 'school-b', schoolName: 'Blue Dolphins', userId: 'user-3', role: 'school_admin' },
  { schoolId: 'school-a', schoolName: 'Aqua Club', userId: 'user-3', role: 'school_admin' },
  { schoolId: 'school-a', schoolName: 'Aqua Club', userId: 'user-3', role: 'school_admin' },
  { schoolId: 'school-c', schoolName: 'Coral Swim', userId: 'user-3', role: 'coach' },
];

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function createPowerSync(): StaffSchoolRepository {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec(`
    CREATE TABLE schools (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE school_memberships (id TEXT PRIMARY KEY, school_id TEXT, user_id TEXT, role TEXT);
  `);
  memberships.forEach((m, index) => {
    if (!seed.prepare('SELECT 1 FROM schools WHERE id = ?').get(m.schoolId)) {
      seed.prepare('INSERT INTO schools (id, name) VALUES (?, ?)').run(m.schoolId, m.schoolName);
    }
    seed.prepare('INSERT INTO school_memberships (id, school_id, user_id, role) VALUES (?, ?, ?, ?)').run(`m${index}`, m.schoolId, m.userId, m.role);
  });
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncStaffSchoolRepository();
}

const factories: [string, () => StaffSchoolRepository][] = [
  ['in-memory', () => createInMemoryStaffSchoolRepository(memberships)],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s staff school repository', (_name, create) => {
  it('lists only the schools of the user, by name, once even with two roles', async () => {
    await expect(create().listStaffSchools('user-1')).resolves.toEqual([
      { id: 'school-a', name: 'Aqua Club' },
      { id: 'school-b', name: 'Blue Dolphins' },
    ]);
  });

  it('returns an empty list for a user without memberships', async () => {
    await expect(create().listStaffSchools('nobody')).resolves.toEqual([]);
  });

  it('lists only the schools where the user is school_admin, by name, once', async () => {
    await expect(create().listAdminSchools('user-3')).resolves.toEqual([
      { id: 'school-a', name: 'Aqua Club' },
      { id: 'school-b', name: 'Blue Dolphins' },
    ]);
  });

  it('lists no admin school for a coach or for a user without memberships', async () => {
    const repository = create();
    await expect(repository.listAdminSchools('user-1')).resolves.toEqual([]);
    await expect(repository.listAdminSchools('nobody')).resolves.toEqual([]);
  });
});
