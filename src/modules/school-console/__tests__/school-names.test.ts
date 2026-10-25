import { DatabaseSync } from 'node:sqlite';

import {
  createStore,
  openDatabase,
  type FakeDatabase,
} from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemorySchoolNameRepository,
  createPowerSyncSchoolNameRepository,
} from '..';
import type { SchoolNameRepository } from '..';

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
const schools = [
  { id: 'school-b', name: 'Blue Dolphins' },
  { id: 'school-a', name: 'Aqua Club' },
  { id: 'school-c', name: 'Coral Swim' },
];

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function createPowerSync(): SchoolNameRepository {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec('CREATE TABLE schools (id TEXT PRIMARY KEY, name TEXT)');
  schools.forEach((s) =>
    seed
      .prepare('INSERT INTO schools (id, name) VALUES (?, ?)')
      .run(s.id, s.name),
  );
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncSchoolNameRepository();
}

const factories: [string, () => SchoolNameRepository][] = [
  ['in-memory', () => createInMemorySchoolNameRepository(schools)],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s school name repository', (_name, create) => {
  it('lists the named schools by name, ignoring unknown ids', async () => {
    await expect(
      create().listByIds(['school-b', 'missing', 'school-a']),
    ).resolves.toEqual([
      { id: 'school-a', name: 'Aqua Club' },
      { id: 'school-b', name: 'Blue Dolphins' },
    ]);
  });

  it('lists nothing for no ids', async () => {
    await expect(create().listByIds([])).resolves.toEqual([]);
  });
});
