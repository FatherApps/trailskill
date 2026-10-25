import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import { createInMemorySchoolAthleteRepository, createPowerSyncSchoolAthleteRepository } from '../data/schoolAthletes';
import type { SchoolAthleteRepository } from '../data/schoolAthletes';

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
const athletes = [
  { id: 'a3', firstName: 'Zoe', lastName: 'Marin' },
  { id: 'a1', firstName: 'Ana', lastName: 'Marin' },
  { id: 'a2', firstName: 'Ben', lastName: 'Arce' },
  { id: 'a6', firstName: 'Eli', lastName: 'Nobody' },
];
// a2 belongs to two schools; a6 to none.
const athleteSchools = [
  { athleteId: 'a3', schoolId: 'school-a', categoryId: 'cat-1' },
  { athleteId: 'a1', schoolId: 'school-a', categoryId: null },
  { athleteId: 'a2', schoolId: 'school-a', categoryId: 'cat-2' },
  { athleteId: 'a2', schoolId: 'school-b', categoryId: 'cat-1' },
];
const athleteGroups = [
  { athleteId: 'a2', groupId: 'g-2' },
  { athleteId: 'a2', groupId: 'g-1' },
  { athleteId: 'a3', groupId: 'g-1' },
];

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function createPowerSync(): SchoolAthleteRepository {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec(`
    CREATE TABLE athlete_schools (id TEXT PRIMARY KEY, athlete_id TEXT, school_id TEXT, category_id TEXT);
    CREATE TABLE athlete_groups (id TEXT PRIMARY KEY, athlete_id TEXT, group_id TEXT);
  `);
  for (const a of athletes) seed.prepare('INSERT INTO athletes (id, first_name, last_name) VALUES (?, ?, ?)').run(a.id, a.firstName, a.lastName);
  athleteSchools.forEach((r, i) =>
    seed.prepare('INSERT INTO athlete_schools (id, athlete_id, school_id, category_id) VALUES (?, ?, ?, ?)').run(`s${i}`, r.athleteId, r.schoolId, r.categoryId),
  );
  athleteGroups.forEach((r, i) => seed.prepare('INSERT INTO athlete_groups (id, athlete_id, group_id) VALUES (?, ?, ?)').run(`g${i}`, r.athleteId, r.groupId));
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncSchoolAthleteRepository();
}

const factories: [string, () => SchoolAthleteRepository][] = [
  ['in-memory', () => createInMemorySchoolAthleteRepository({ athletes, athleteSchools, athleteGroups })],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s repository: athletes on the device', (_name, create) => {
  it('lists every athlete once, with or without a school, by last name, first name and id', async () => {
    const listed = await create().listAll();

    expect(listed.map((a) => a.id)).toEqual(['a2', 'a1', 'a3', 'a6']);
  });

  it('takes the smallest category when the athlete has several schools, and none without a school', async () => {
    const listed = await create().listAll();

    expect(listed.find((a) => a.id === 'a2')).toEqual({ id: 'a2', firstName: 'Ben', lastName: 'Arce', categoryId: 'cat-1', groupIds: ['g-1', 'g-2'] });
    expect(listed.find((a) => a.id === 'a6')).toEqual({ id: 'a6', firstName: 'Eli', lastName: 'Nobody', categoryId: null, groupIds: [] });
  });

  it('lists only the requested athletes, in the usual order, and ignores unknown ids', async () => {
    const listed = await create().listByIds(['a3', 'zz', 'a2']);

    expect(listed.map((a) => a.id)).toEqual(['a2', 'a3']);
    expect(listed[1]?.groupIds).toEqual(['g-1']);
  });

  it('lists nobody for no ids', async () => {
    await expect(create().listByIds([])).resolves.toEqual([]);
  });
});
