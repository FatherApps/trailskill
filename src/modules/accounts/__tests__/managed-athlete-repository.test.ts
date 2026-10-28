import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemoryManagedAthleteRepository,
  createPowerSyncManagedAthleteRepository,
  type ManagedAthleteRepository,
  type ManagedAthleteRow,
} from '../data/managedAthletes';

let mockDb: FakeDatabase;
jest.mock('../../../core/sync', () => ({
  get db() {
    return mockDb;
  },
}));

// Synthetic data only. 'guardian-1' manages two athletes; a repeated row must not repeat the athlete.
// 'adult-1' is their own athlete ('self'); 'coach-1' manages nobody, yet a coach's device also holds the 'self' row of an adult in their school.
const rows: ManagedAthleteRow[] = [
  { userId: 'guardian-1', athleteId: 'a2', relation: 'guardian' },
  { userId: 'guardian-1', athleteId: 'a1', relation: 'guardian' },
  { userId: 'guardian-1', athleteId: 'a1', relation: 'guardian' },
  { userId: 'guardian-2', athleteId: 'a3', relation: 'guardian' },
  { userId: 'adult-1', athleteId: 'a4', relation: 'self' },
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
  rows.forEach((r, i) =>
    seed.prepare('INSERT INTO athlete_managers (id, user_id, athlete_id, relation) VALUES (?, ?, ?, ?)').run(`m${i}`, r.userId, r.athleteId, r.relation ?? null),
  );
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

  it('finds the own athlete of an adult', async () => {
    await expect(create().getSelfAthleteId('adult-1')).resolves.toBe('a4');
  });

  it('finds no own athlete for a guardian, whose links are all guardian links', async () => {
    await expect(create().getSelfAthleteId('guardian-1')).resolves.toBeNull();
  });

  it('does not count the own athlete of another user', async () => {
    await expect(create().getSelfAthleteId('coach-1')).resolves.toBeNull();
    await expect(create().getSelfAthleteId('guardian-2')).resolves.toBeNull();
  });
});
