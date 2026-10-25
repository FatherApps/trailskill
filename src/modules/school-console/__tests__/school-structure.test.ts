import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemorySchoolStructureRepository,
  createPowerSyncSchoolStructureRepository,
  type SchoolStructureRepository,
  type SchoolStructureRows,
} from '../data/schoolStructure';

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
const rows: SchoolStructureRows = {
  categories: [
    { id: 'c3', schoolId: 'school-a', name: 'Junior', sortOrder: 2 },
    { id: 'c2', schoolId: 'school-a', name: 'Infantil B', sortOrder: 1 },
    { id: 'c1', schoolId: 'school-a', name: 'Infantil A', sortOrder: 1 },
    { id: 'c9', schoolId: 'school-b', name: 'Other', sortOrder: 0 },
  ],
  groups: [
    { id: 'g2', schoolId: 'school-a', name: 'Group B' },
    { id: 'g1', schoolId: 'school-a', name: 'Group A' },
    { id: 'g3', schoolId: 'school-a', name: 'Group A' },
    { id: 'g9', schoolId: 'school-b', name: 'Other group' },
  ],
  groupAssignments: [
    { coachId: 'coach-1', groupId: 'g1' },
    { coachId: 'coach-2', groupId: 'g2' },
    { coachId: 'coach-9', groupId: 'g9' },
  ],
  athleteAssignments: [
    { coachId: 'coach-3', athleteId: 'a1' },
    { coachId: 'coach-9', athleteId: 'a9' },
  ],
  athleteSchools: [
    { athleteId: 'a1', schoolId: 'school-a' },
    { athleteId: 'a9', schoolId: 'school-b' },
  ],
};

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function createPowerSync(): SchoolStructureRepository {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec(`
    CREATE TABLE categories (id TEXT PRIMARY KEY, school_id TEXT, name TEXT, sort_order INTEGER);
    CREATE TABLE training_groups (id TEXT PRIMARY KEY, school_id TEXT, name TEXT);
    CREATE TABLE coach_group_assignments (id TEXT PRIMARY KEY, coach_user_id TEXT, group_id TEXT);
    CREATE TABLE coach_athlete_assignments (id TEXT PRIMARY KEY, coach_user_id TEXT, athlete_id TEXT);
    CREATE TABLE athlete_schools (id TEXT PRIMARY KEY, athlete_id TEXT, school_id TEXT, category_id TEXT);
  `);
  for (const c of rows.categories) seed.prepare('INSERT INTO categories VALUES (?, ?, ?, ?)').run(c.id, c.schoolId, c.name, c.sortOrder);
  for (const g of rows.groups) seed.prepare('INSERT INTO training_groups VALUES (?, ?, ?)').run(g.id, g.schoolId, g.name);
  rows.groupAssignments.forEach((r, i) => seed.prepare('INSERT INTO coach_group_assignments VALUES (?, ?, ?)').run(`ga${i}`, r.coachId, r.groupId));
  rows.athleteAssignments.forEach((r, i) => seed.prepare('INSERT INTO coach_athlete_assignments VALUES (?, ?, ?)').run(`aa${i}`, r.coachId, r.athleteId));
  rows.athleteSchools.forEach((r, i) => seed.prepare('INSERT INTO athlete_schools VALUES (?, ?, ?, NULL)').run(`as${i}`, r.athleteId, r.schoolId));
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncSchoolStructureRepository();
}

const factories: [string, () => SchoolStructureRepository][] = [
  ['in-memory', () => createInMemorySchoolStructureRepository(rows)],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s school structure repository', (_name, create) => {
  it('lists the categories of the school by sort order, name and id, and none of another school', async () => {
    await expect(create().listCategories('school-a')).resolves.toEqual([
      { id: 'c1', name: 'Infantil A', sortOrder: 1 },
      { id: 'c2', name: 'Infantil B', sortOrder: 1 },
      { id: 'c3', name: 'Junior', sortOrder: 2 },
    ]);
  });

  it('lists the groups of the school by name then id, and none of another school', async () => {
    await expect(create().listGroups('school-a')).resolves.toEqual([
      { id: 'g1', name: 'Group A' },
      { id: 'g3', name: 'Group A' },
      { id: 'g2', name: 'Group B' },
    ]);
  });

  it('lists the coach assignments of the groups and of the athletes of the school only', async () => {
    const assignments = await create().listCoachAssignments('school-a');

    expect(assignments).toHaveLength(3);
    expect(assignments).toEqual(
      expect.arrayContaining([
        { coachId: 'coach-1', groupId: 'g1', athleteId: null },
        { coachId: 'coach-2', groupId: 'g2', athleteId: null },
        { coachId: 'coach-3', groupId: null, athleteId: 'a1' },
      ]),
    );
  });

  it('returns empty lists for a school without data', async () => {
    const repository = create();
    await expect(repository.listCategories('nowhere')).resolves.toEqual([]);
    await expect(repository.listGroups('nowhere')).resolves.toEqual([]);
    await expect(repository.listCoachAssignments('nowhere')).resolves.toEqual([]);
  });
});
