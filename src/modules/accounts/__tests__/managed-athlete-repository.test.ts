import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemoryManagedAthleteRepository,
  createPowerSyncManagedAthleteRepository,
  type ManagedAthleteRepository,
} from '../data/managedAthletes';

let mockDb: FakeDatabase;
jest.mock('../../../core/sync', () => ({
  get db() {
    return mockDb;
  },
}));

// Synthetic data only. 'guardian-1' manages two athletes; a repeated row must not repeat the athlete.
const rows = [
  { userId: 'guardian-1', athleteId: 'a2' },
  { userId: 'guardian-1', athleteId: 'a1' },
  { userId: 'guardian-1', athleteId: 'a1' },
  { userId: 'guardian-2', athleteId: 'a3' },
];

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function createPowerSync(): ManagedAthleteRepository {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec('CREATE TABLE athlete_managers (id TEXT PRIMARY KEY, user_id TEXT, athlete_id TEXT, relation TEXT)');
  rows.forEach((r, i) => seed.prepare('INSERT INTO athlete_managers (id, user_id, athlete_id) VALUES (?, ?, ?)').run(`m${i}`, r.userId, r.athleteId));
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncManagedAthleteRepository();
}

const factories: [string, () => ManagedAthleteRepository][] = [
  ['in-memory', () => createInMemoryManagedAthleteRepository(rows)],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s managed athlete repository', (_name, create) => {
  it('lists the athletes the user manages, sorted and without repeats', async () => {
    await expect(create().listManagedAthleteIds('guardian-1')).resolves.toEqual(['a1', 'a2']);
  });

  it('does not list the athletes of another user', async () => {
    await expect(create().listManagedAthleteIds('guardian-2')).resolves.toEqual(['a3']);
  });

  it('lists nothing for a user who manages nobody', async () => {
    await expect(create().listManagedAthleteIds('coach-1')).resolves.toEqual([]);
  });
});
