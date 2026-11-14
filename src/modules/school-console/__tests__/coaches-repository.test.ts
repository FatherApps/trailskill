import { DatabaseSync } from 'node:sqlite';

import { createInMemoryAdultDirectoryRepository, type AdultContact } from '../../accounts';
import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemoryCoachRepository,
  createPowerSyncCoachRepository,
  type CoachMembershipRow,
  type CoachRepository,
} from '../data/coaches';

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
  // The real write over the fake database, so the test sees the row and its upload marker.
  writeRecord: (...args: unknown[]) => jest.requireActual('../../../core/sync/writes').writeRecord(...args),
}));

// Synthetic data only.
const rows: CoachMembershipRow[] = [
  { schoolId: 'school-a', userId: 'coach-3', role: 'coach' },
  { schoolId: 'school-a', userId: 'coach-1', role: 'coach' },
  { schoolId: 'school-a', userId: 'admin-1', role: 'school_admin' },
  // The same person as admin and coach is listed once, as a coach.
  { schoolId: 'school-a', userId: 'coach-2', role: 'school_admin' },
  { schoolId: 'school-a', userId: 'coach-2', role: 'coach' },
  { schoolId: 'school-b', userId: 'coach-9', role: 'coach' },
  { schoolId: 'school-b', userId: 'coach-1', role: 'coach' },
  { schoolId: 'school-a', userId: 'coach-4', role: 'coach', deactivatedAt: '2026-10-20T10:00:00.000Z' },
];

// coach-1 and coach-2 have a profile; coach-3 has none. A profile of another school's coach does not matter here.
const profiles: AdultContact[] = [
  { userId: 'coach-1', firstName: 'Carla', lastName: 'Entrena', contactEmail: 'carla@example.test' },
  { userId: 'coach-2', firstName: 'Dario', lastName: 'Piscina', contactEmail: null },
  { userId: 'coach-9', firstName: 'Otra', lastName: 'Escuela', contactEmail: null },
];

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function createPowerSync(): CoachRepository {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec('CREATE TABLE school_memberships (id TEXT PRIMARY KEY, school_id TEXT, user_id TEXT, role TEXT, deactivated_at TEXT);');
  rows.forEach((r, i) => seed.prepare('INSERT INTO school_memberships VALUES (?, ?, ?, ?, ?)').run(`sm${i}`, r.schoolId, r.userId, r.role, r.deactivatedAt ?? null));
  seed.exec('CREATE TABLE adult_profiles (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, contact_email TEXT);');
  profiles.forEach((p) => seed.prepare('INSERT INTO adult_profiles VALUES (?, ?, ?, ?)').run(p.userId, p.firstName, p.lastName, p.contactEmail));
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncCoachRepository();
}

const factories: [string, () => CoachRepository][] = [
  ['in-memory', () => createInMemoryCoachRepository(rows, createInMemoryAdultDirectoryRepository({ profiles }))],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s coach repository', (_name, create) => {
  it('lists the coaches of the school by id, without admins, another school or duplicates, with the profile name, and null without a profile', async () => {
    await expect(create().listCoaches('school-a')).resolves.toEqual([
      { id: 'coach-1', name: 'Carla Entrena', deactivated: false },
      { id: 'coach-2', name: 'Dario Piscina', deactivated: false },
      { id: 'coach-3', name: null, deactivated: false },
      { id: 'coach-4', name: null, deactivated: true },
    ]);
  });

  it('deactivates only that coach of that school, and keeps listing them', async () => {
    const repository = create();
    await repository.deactivateCoach('school-a', 'coach-1');

    const coachesA = await repository.listCoaches('school-a');
    expect(coachesA.map(({ id, deactivated }) => [id, deactivated])).toEqual([
      ['coach-1', true],
      ['coach-2', false],
      ['coach-3', false],
      ['coach-4', true],
    ]);
    expect((await repository.listCoaches('school-b')).map(({ id, deactivated }) => [id, deactivated])).toEqual([
      ['coach-1', false],
      ['coach-9', false],
    ]);
  });

  it('rejects deactivating someone who is not a coach of the school, and changes nothing', async () => {
    const repository = create();

    await expect(repository.deactivateCoach('school-a', 'admin-1')).rejects.toThrow();
    await expect(repository.deactivateCoach('school-a', 'coach-9')).rejects.toThrow();
    await expect(repository.deactivateCoach('school-z', 'coach-1')).rejects.toThrow();

    expect((await repository.listCoaches('school-a')).filter(({ deactivated }) => deactivated).map(({ id }) => id)).toEqual(['coach-4']);
  });

  it('lists nothing for a school without coaches', async () => {
    await expect(create().listCoaches('school-z')).resolves.toEqual([]);
  });
});

describe('PowerSync coach repository writes', () => {
  it('stamps deactivated_at on the coach membership row only and queues it for upload', async () => {
    const repository = createPowerSync();
    await repository.deactivateCoach('school-a', 'coach-1');

    const stamped = mockDb.getAll<{ id: string; deactivated_at: string | null }>('SELECT id, deactivated_at FROM school_memberships WHERE deactivated_at IS NOT NULL ORDER BY id');
    expect(stamped.map(({ id }) => id)).toEqual(['sm1', 'sm7']);
    expect(Number.isNaN(Date.parse(stamped[0].deactivated_at ?? ''))).toBe(false);
    expect(mockDb.getAll('SELECT table_name, record_id FROM pending_writes')).toEqual([{ table_name: 'school_memberships', record_id: 'sm1' }]);
  });

  it('queues nothing when the coach does not exist', async () => {
    const repository = createPowerSync();
    await expect(repository.deactivateCoach('school-a', 'coach-9')).rejects.toThrow();

    expect(mockDb.getAll('SELECT * FROM pending_writes')).toEqual([]);
  });
});
