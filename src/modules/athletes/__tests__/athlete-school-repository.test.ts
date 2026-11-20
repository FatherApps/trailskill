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
import type { AthleteSchoolRepository, AthleteSchoolRow } from '..';

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
const rows: AthleteSchoolRow[] = [
  { athleteId: 'a1', schoolId: 'school-b', categoryId: 'cat-1' },
  { athleteId: 'a1', schoolId: 'school-a', categoryId: null },
  { athleteId: 'a2', schoolId: 'school-c', categoryId: 'cat-9' },
  // a3 is still active in school-d and was ended in school-e; a4 was ended in its only school (#1243).
  { athleteId: 'a3', schoolId: 'school-d', categoryId: null },
  { athleteId: 'a3', schoolId: 'school-e', categoryId: null, endedAt: '2026-11-20T10:00:00.000Z' },
  { athleteId: 'a4', schoolId: 'school-e', categoryId: null, endedAt: '2026-11-20T10:00:00.000Z' },
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
    'CREATE TABLE athlete_schools (id TEXT PRIMARY KEY, athlete_id TEXT, school_id TEXT, category_id TEXT, ended_at TEXT)',
  );
  rows.forEach((r, index) =>
    seed
      .prepare(
        'INSERT INTO athlete_schools (id, athlete_id, school_id, category_id, ended_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(`l${index}`, r.athleteId, r.schoolId, r.categoryId, r.endedAt ?? null),
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

  it('lists as active only the schools whose link is not ended', async () => {
    await expect(create().listActiveSchools('a1')).resolves.toEqual(['school-a', 'school-b']);
    await expect(create().listActiveSchools('a3')).resolves.toEqual(['school-d']);
  });

  it('says an athlete is active in no school once every link is ended, or when there is none', async () => {
    await expect(create().listActiveSchools('a4')).resolves.toEqual([]);
    await expect(create().listActiveSchools('nobody')).resolves.toEqual([]);
  });
});
