import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemoryAuthorizationStatusRepository,
  createPowerSyncAuthorizationStatusRepository,
} from '../data/authorizationStatus';
import type { AuthorizationPurpose, AuthorizationStatusRepository } from '../data/authorizationStatus';

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
const rows: { athleteId: string; purpose: AuthorizationPurpose; isGranted: boolean }[] = [
  { athleteId: 'a2', purpose: 'record_times', isGranted: true },
  { athleteId: 'a1', purpose: 'record_times', isGranted: true },
  { athleteId: 'a3', purpose: 'record_times', isGranted: false },
  { athleteId: 'a4', purpose: 'import_official_results', isGranted: true },
  { athleteId: 'a5', purpose: 'share_results_with_school', isGranted: true },
  { athleteId: 'a1', purpose: 'import_official_results', isGranted: false },
];

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function createPowerSync(): AuthorizationStatusRepository {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec('CREATE TABLE authorization_status (id TEXT PRIMARY KEY, athlete_id TEXT, purpose TEXT, is_granted INTEGER, updated_at TEXT)');
  rows.forEach((r, i) =>
    seed
      .prepare('INSERT INTO authorization_status (id, athlete_id, purpose, is_granted) VALUES (?, ?, ?, ?)')
      .run(`r${i}`, r.athleteId, r.purpose, r.isGranted ? 1 : 0),
  );
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncAuthorizationStatusRepository();
}

const factories: [string, () => AuthorizationStatusRepository][] = [
  ['in-memory', () => createInMemoryAuthorizationStatusRepository(rows)],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s authorization status repository', (_name, create) => {
  it('lists the athletes with the purpose granted', async () => {
    const granted = await create().listGrantedAthleteIds('record_times');

    expect([...granted].sort()).toEqual(['a1', 'a2']);
  });

  it('does not count a row with is_granted 0 as granted', async () => {
    await expect(create().listGrantedAthleteIds('record_times')).resolves.not.toContain('a3');
  });

  it('does not count an athlete without a row for the purpose as granted', async () => {
    await expect(create().listGrantedAthleteIds('record_times')).resolves.not.toContain('a6');
  });

  it('keeps each purpose apart', async () => {
    const repository = create();

    await expect(repository.listGrantedAthleteIds('import_official_results')).resolves.toEqual(['a4']);
    await expect(repository.listGrantedAthleteIds('share_results_with_school')).resolves.toEqual(['a5']);
  });

  it('lists every status row of the athletes asked for, and nothing for an athlete without rows', async () => {
    const statuses = await create().listStatuses(['a1', 'a3', 'a6']);

    expect([...statuses].sort((a, b) => `${a.athleteId}${a.purpose}`.localeCompare(`${b.athleteId}${b.purpose}`))).toEqual([
      { athleteId: 'a1', purpose: 'import_official_results', isGranted: false },
      { athleteId: 'a1', purpose: 'record_times', isGranted: true },
      { athleteId: 'a3', purpose: 'record_times', isGranted: false },
    ]);
  });
});
