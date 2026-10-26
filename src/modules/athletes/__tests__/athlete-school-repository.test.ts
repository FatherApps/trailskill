import { DatabaseSync } from 'node:sqlite';

import {
  createStore,
  openDatabase,
  type FakeDatabase,
} from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemoryAthleteSchoolRepository,
  createPowerSyncAthleteSchoolRepository,
} from '..';
import type { AthleteSchoolRepository } from '..';

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
const rows = [
  { athleteId: 'a1', schoolId: 'school-b', categoryId: 'cat-1' },
  { athleteId: 'a1', schoolId: 'school-a', categoryId: null },
  { athleteId: 'a2', schoolId: 'school-c', categoryId: 'cat-9' },
];

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function createPowerSync(): AthleteSchoolRepository {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec(
    'CREATE TABLE athlete_schools (id TEXT PRIMARY KEY, athlete_id TEXT, school_id TEXT, category_id TEXT)',
  );
  rows.forEach((r, index) =>
    seed
      .prepare(
        'INSERT INTO athlete_schools (id, athlete_id, school_id, category_id) VALUES (?, ?, ?, ?)',
      )
      .run(`l${index}`, r.athleteId, r.schoolId, r.categoryId),
  );
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncAthleteSchoolRepository();
}

const factories: [string, () => AthleteSchoolRepository][] = [
  ['in-memory', () => createInMemoryAthleteSchoolRepository(rows)],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s athlete school repository', (_name, create) => {
  it('lists the schools of the athlete with the category of each, by school id', async () => {
    await expect(create().listByAthlete('a1')).resolves.toEqual([
      { schoolId: 'school-a', categoryId: null },
      { schoolId: 'school-b', categoryId: 'cat-1' },
    ]);
  });

  it('returns nothing for an athlete without schools', async () => {
    await expect(create().listByAthlete('nobody')).resolves.toEqual([]);
  });
});
