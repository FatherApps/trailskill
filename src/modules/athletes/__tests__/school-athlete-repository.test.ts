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
  { id: 'a4', firstName: 'Cleo', lastName: 'Other' },
  { id: 'a5', firstName: 'Dan', lastName: 'Marin' },
  { id: 'a6', firstName: 'Eli', lastName: 'Nobody' },
];
const athleteSchools = [
  { athleteId: 'a3', schoolId: 'school-a', categoryId: 'cat-1' },
  { athleteId: 'a1', schoolId: 'school-a', categoryId: null },
  { athleteId: 'a2', schoolId: 'school-a', categoryId: 'cat-2' },
  { athleteId: 'a5', schoolId: 'school-a', categoryId: 'cat-1' },
  { athleteId: 'a4', schoolId: 'school-b', categoryId: 'cat-9' },
];
const athleteGroups = [
  { athleteId: 'a2', groupId: 'g-2' },
  { athleteId: 'a2', groupId: 'g-1' },
  { athleteId: 'a2', groupId: 'g-1' },
  { athleteId: 'a3', groupId: 'g-1' },
  { athleteId: 'a4', groupId: 'g-9' },
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

describe.each(factories)('%s school athlete repository', (_name, create) => {
  it('lists the athletes of the school by last name, first name and id, and none of another school', async () => {
    const listed = await create().listBySchool('school-a');

    expect(listed.map((a) => a.id)).toEqual(['a2', 'a1', 'a5', 'a3']);
  });

  it('returns the name, the category and the groups of each athlete', async () => {
    const listed = await create().listBySchool('school-a');

    expect(listed[0]).toEqual({ id: 'a2', firstName: 'Ben', lastName: 'Arce', categoryId: 'cat-2', groupIds: ['g-1', 'g-2'] });
    expect(listed[1]).toEqual({ id: 'a1', firstName: 'Ana', lastName: 'Marin', categoryId: null, groupIds: [] });
  });

  it('sorts the groups and lists each once, even when the athlete has a repeated row', async () => {
    const listed = await create().listBySchool('school-a');

    expect(listed.find((a) => a.id === 'a2')?.groupIds).toEqual(['g-1', 'g-2']);
  });

  it('does not take the groups of an athlete of another school', async () => {
    const listed = await create().listBySchool('school-a');

    expect(listed.flatMap((a) => a.groupIds)).not.toContain('g-9');
  });

  it('returns an empty list for a school without athletes', async () => {
    await expect(create().listBySchool('nowhere')).resolves.toEqual([]);
  });

  it('exposes only id, names, category and groups: no other athlete data', async () => {
    const [first] = await create().listBySchool('school-a');

    expect(Object.keys(first!).sort()).toEqual(['categoryId', 'firstName', 'groupIds', 'id', 'lastName']);
  });
});
