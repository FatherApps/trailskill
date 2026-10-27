import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  assignPlan,
  athletesOfTarget,
  createInMemoryAssignmentRepository,
  createInMemoryTrainingPlanRepository,
  createPowerSyncAssignmentRepository,
  listAssignmentsOfDay,
  loadAssignScope,
  PlanNotAssignableError,
  TargetNotInChargeError,
  TargetOutsideSchoolError,
  type AssignmentRepository,
  type AssignmentTarget,
} from '..';
import { setSessionUser } from '../../../core/sync';
import { athletes, plan, sources } from '../__fixtures__/assignments';

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
  writeBatch: jest.requireActual('../../../core/sync/writes').writeBatch,
  setSessionUser: jest.requireActual('../../../core/sync/writes').setSessionUser,
}));

// The user signed in now, for both repositories: the in-memory one reads it, the PowerSync one gets it through core/sync.
let sessionUser: string | undefined;
const signIn = (userId: string | undefined) => {
  sessionUser = userId;
  setSessionUser(userId);
};
afterEach(() => signIn(undefined));

async function inMemory(): Promise<AssignmentRepository> {
  const plans = createInMemoryTrainingPlanRepository();
  await plans.save(plan('p1'));
  await plans.save(plan('foreign', 's2'));
  return createInMemoryAssignmentRepository(plans, () => sessionUser);
}

const TABLES = `
  CREATE TABLE training_plans (id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, school_id TEXT, name TEXT, is_template INTEGER);
  CREATE TABLE training_plan_versions (id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, plan_id TEXT, version INTEGER, complete INTEGER, assigned INTEGER);
  CREATE TABLE training_plan_assignments (
    id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, school_id TEXT, plan_id TEXT, version_id TEXT,
    session_date TEXT, target TEXT, athlete_id TEXT, group_id TEXT, category_id TEXT, withdrawn_at TEXT, withdrawn_by TEXT
  );
  INSERT INTO training_plans (id, school_id, name, is_template) VALUES ('p1', 's1', 'Plan p1', 0), ('foreign', 's2', 'Plan foreign', 0), ('bare', 's1', 'Plan bare', 0);
  INSERT INTO training_plan_versions (id, plan_id, version) VALUES ('v1', 'p1', 1), ('v2', 'p1', 2), ('vf', 'foreign', 1);
`;

let removeStore: (() => void) | undefined;
let storePath = '';
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

async function powerSync(): Promise<AssignmentRepository> {
  const store = createStore();
  removeStore = store.remove;
  storePath = store.path;
  const seed = new DatabaseSync(store.path);
  seed.exec(TABLES);
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncAssignmentRepository();
}

const factories: [string, () => Promise<AssignmentRepository>][] = [
  ['in-memory', inMemory],
  ['PowerSync', powerSync],
];

describe.each(factories)('%s assignment repository', (_name, create) => {
  const targets: AssignmentTarget[] = [
    { kind: 'athlete', athleteId: 'a1' },
    { kind: 'group', groupId: 'g1' },
    { kind: 'category', categoryId: 'c1' },
    { kind: 'school' },
  ];

  it.each(targets)('saves a $kind assignment and lists it for its day only', async (target) => {
    const repository = await create();

    const id = await repository.create({ schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target });

    const [saved] = await repository.list('s1', '2026-11-02');
    expect(saved).toMatchObject({ id, schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target });
    expect(saved!.versionId).toEqual(expect.any(String));
    expect(await repository.list('s1', '2026-11-03')).toEqual([]);
    expect(await repository.list('s2', '2026-11-02')).toEqual([]);
  });

  it('withdraws an assignment: it is no longer listed, the others stay, and withdrawing again changes nothing', async () => {
    const repository = await create();
    const gone = await repository.create({ schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target: { kind: 'school' } });
    const kept = await repository.create({ schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target: { kind: 'group', groupId: 'g1' } });

    await repository.withdraw(gone);
    await repository.withdraw(gone);

    expect((await repository.list('s1', '2026-11-02')).map((a) => a.id)).toEqual([kept]);
  });

  it('rejects withdrawing an assignment that is not here, without writing', async () => {
    const repository = await create();

    await expect(repository.withdraw('missing')).rejects.toThrow('Cannot withdraw assignment missing');
    expect(await repository.list('s1', '2026-11-02')).toEqual([]);
  });

  it('rejects a plan of another school without writing', async () => {
    const repository = await create();

    await expect(repository.create({ schoolId: 's1', planId: 'foreign', sessionDate: '2026-11-02', target: { kind: 'school' } })).rejects.toBeInstanceOf(
      PlanNotAssignableError,
    );
    await expect(repository.create({ schoolId: 's1', planId: 'missing', sessionDate: '2026-11-02', target: { kind: 'school' } })).rejects.toBeInstanceOf(
      PlanNotAssignableError,
    );
    expect(await repository.list('s1', '2026-11-02')).toEqual([]);
  });

  it('discards a save started by a user who is no longer signed in, without writing', async () => {
    const repository = await create();
    signIn('coach-2');

    await expect(repository.create({ schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target: { kind: 'school' } }, 'coach-1')).rejects.toThrow(
      'Discarded a write of user coach-1',
    );
    expect(await repository.list('s1', '2026-11-02')).toEqual([]);
  });

  it('discards a withdrawal started by a user who is no longer signed in, keeping the assignment', async () => {
    const repository = await create();
    signIn('coach-1');
    const id = await repository.create({ schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target: { kind: 'school' } }, 'coach-1');
    signIn('coach-2');

    await expect(repository.withdraw(id, 'coach-1')).rejects.toThrow('Discarded a write of user coach-1');
    expect((await repository.list('s1', '2026-11-02')).map((a) => a.id)).toEqual([id]);
  });

  it('saves and withdraws for the user who is still signed in', async () => {
    const repository = await create();
    signIn('coach-1');

    const id = await repository.create({ schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target: { kind: 'school' } }, 'coach-1');
    expect((await repository.list('s1', '2026-11-02')).map((a) => a.id)).toEqual([id]);
    await repository.withdraw(id, 'coach-1');

    expect(await repository.list('s1', '2026-11-02')).toEqual([]);
  });

  it.each(['2026-13-01', '2026-02-30', '02/11/2026', ''])('rejects the date "%s" without writing', async (date) => {
    const repository = await create();

    await expect(repository.create({ schoolId: 's1', planId: 'p1', sessionDate: date, target: { kind: 'school' } })).rejects.toThrow('Invalid session date');
  });
});

describe('versionChanged', () => {
  it.each(factories)('is false right after assigning (%s)', async (_name, create) => {
    const repository = await create();

    await repository.create({ schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target: { kind: 'school' } });

    expect((await repository.list('s1', '2026-11-02'))[0]!.versionChanged).toBe(false);
  });

  it('is true in memory once the assigned plan is edited and the session moved to the new version', async () => {
    const plans = createInMemoryTrainingPlanRepository();
    await plans.save(plan('p1'));
    const repository = createInMemoryAssignmentRepository(plans);
    await repository.create({ schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target: { kind: 'school' } });

    await plans.save({ ...plan('p1'), name: 'Edited' });

    expect((await repository.list('s1', '2026-11-02'))[0]!.versionChanged).toBe(true);
  });

  // Server timestamps: one with a space instead of 'T'; a timestamp the server has not set yet is NULL.
  it.each([
    ['the version was created after the session', '2026-11-01T10:00:00.000Z', '2026-11-01 12:00:00', true],
    ['the version was created before the session', '2026-11-01T12:00:00.000Z', '2026-11-01 10:00:00', false],
    ['the session has no timestamp yet', null, '2026-11-01 12:00:00', false],
    ['the version has no timestamp yet', '2026-11-01T10:00:00.000Z', null, false],
  ])('in PowerSync is decided by the timestamps: %s', async (_label, assignedAt, versionAt, expected) => {
    const repository = await powerSync();
    await repository.create({ schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target: { kind: 'school' } });
    const seed = new DatabaseSync(storePath);
    seed.prepare('UPDATE training_plan_assignments SET created_at = ?').run(assignedAt);
    seed.prepare("UPDATE training_plan_versions SET created_at = ? WHERE id = 'v2'").run(versionAt);
    seed.close();

    expect((await repository.list('s1', '2026-11-02'))[0]!.versionChanged).toBe(expected);
  });
});

describe('PowerSync assignment repository', () => {
  it('assigns the latest version of the plan and rejects a plan without versions', async () => {
    const repository = await powerSync();

    await repository.create({ schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target: { kind: 'school' } });

    expect((await repository.list('s1', '2026-11-02'))[0]!.versionId).toBe('v2');
    await expect(repository.create({ schoolId: 's1', planId: 'bare', sessionDate: '2026-11-02', target: { kind: 'school' } })).rejects.toBeInstanceOf(
      PlanNotAssignableError,
    );
  });
});

describe('PowerSync withdrawal', () => {
  it('keeps the row, marks it withdrawn once and queues one upload', async () => {
    const repository = await powerSync();
    const id = await repository.create({ schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target: { kind: 'school' } });

    await repository.withdraw(id);
    const [first] = await mockDb.getAll<{ withdrawn_at: string }>('SELECT withdrawn_at FROM training_plan_assignments WHERE id = ?', [id]);
    await repository.withdraw(id);
    const rows = await mockDb.getAll<{ withdrawn_at: string; withdrawn_by: string | null }>('SELECT withdrawn_at, withdrawn_by FROM training_plan_assignments');

    expect(rows).toEqual([{ withdrawn_at: first!.withdrawn_at, withdrawn_by: null }]);
    expect(first!.withdrawn_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('PowerSync writes of a user who is no longer signed in', () => {
  const queued = () => mockDb.getAll<{ record_id: string }>('SELECT record_id FROM pending_writes');

  it('leaves no row and nothing queued for a discarded save', async () => {
    const repository = await powerSync();
    signIn('coach-2');

    await expect(repository.create({ schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target: { kind: 'school' } }, 'coach-1')).rejects.toThrow();

    expect(mockDb.getAll('SELECT id FROM training_plan_assignments')).toEqual([]);
    expect(queued()).toEqual([]);
  });

  it('leaves the row unwithdrawn and queues nothing more for a discarded withdrawal', async () => {
    const repository = await powerSync();
    signIn('coach-1');
    const id = await repository.create({ schoolId: 's1', planId: 'p1', sessionDate: '2026-11-02', target: { kind: 'school' } }, 'coach-1');
    signIn('coach-2');

    await expect(repository.withdraw(id, 'coach-1')).rejects.toThrow();

    expect(mockDb.getAll('SELECT withdrawn_at FROM training_plan_assignments')).toEqual([{ withdrawn_at: null }]);
    expect(queued()).toEqual([{ record_id: id }]);
  });
});

describe('athletesOfTarget', () => {
  it('reaches the athletes of a group and no others', async () => {
    const all = await athletes.listBySchool('s1');

    expect(athletesOfTarget({ kind: 'group', groupId: 'g1' }, all)).toEqual(['a1', 'a2']);
    expect(athletesOfTarget({ kind: 'category', categoryId: 'c2' }, all).sort()).toEqual(['a3', 'a5']);
    expect(athletesOfTarget({ kind: 'athlete', athleteId: 'a4' }, all)).toEqual(['a4']);
    expect(athletesOfTarget({ kind: 'school' }, all)).toHaveLength(5);
    expect(athletesOfTarget({ kind: 'group', groupId: 'g9' }, all)).toEqual([]);
  });
});

describe('assignPlan', () => {
  const input = (target: AssignmentTarget) => ({ planId: 'p1', sessionDate: '2026-11-02', target });

  it('lets the administrator assign every kind of target of the school', async () => {
    const repository = await inMemory();
    const scope = await loadAssignScope(sources, 'admin', 's1');

    for (const target of [{ kind: 'athlete', athleteId: 'a5' }, { kind: 'group', groupId: 'g2' }, { kind: 'category', categoryId: 'c1' }, { kind: 'school' }] as const) {
      await assignPlan(repository, scope, input(target));
    }

    expect(await repository.list('s1', '2026-11-02')).toHaveLength(4);
  });

  it('limits a coach to the athletes and groups in charge, directly or by group', async () => {
    const scope = await loadAssignScope(sources, 'k1', 's1');

    expect(scope.athletes.map((a) => a.id).sort()).toEqual(['a1', 'a2', 'a4']);
    expect(scope.groups.map((g) => g.id)).toEqual(['g1']);
    expect(scope.categories).toEqual([]);
    expect(scope.school).toBe(false);
  });

  it.each<AssignmentTarget>([
    { kind: 'athlete', athleteId: 'a3' },
    { kind: 'group', groupId: 'g2' },
    { kind: 'category', categoryId: 'c1' },
    { kind: 'school' },
  ])('does not let a coach assign the $kind target out of their charge, and writes nothing', async (target) => {
    const repository = await inMemory();
    const scope = await loadAssignScope(sources, 'k1', 's1');

    await expect(assignPlan(repository, scope, input(target))).rejects.toBeInstanceOf(TargetNotInChargeError);
    expect(await repository.list('s1', '2026-11-02')).toEqual([]);
  });

  it.each<AssignmentTarget>([
    { kind: 'athlete', athleteId: 'x1' },
    { kind: 'group', groupId: 'g9' },
    { kind: 'category', categoryId: 'c9' },
  ])('rejects a $kind target of another school, for the administrator too', async (target) => {
    const repository = await inMemory();
    const scope = await loadAssignScope(sources, 'admin', 's1');

    await expect(assignPlan(repository, scope, input(target))).rejects.toBeInstanceOf(TargetOutsideSchoolError);
    expect(await repository.list('s1', '2026-11-02')).toEqual([]);
  });

  it('lets a coach assign a group and an athlete in charge', async () => {
    const repository = await inMemory();
    const scope = await loadAssignScope(sources, 'k1', 's1');

    await assignPlan(repository, scope, input({ kind: 'group', groupId: 'g1' }));
    await assignPlan(repository, scope, input({ kind: 'athlete', athleteId: 'a4' }));

    expect(await repository.list('s1', '2026-11-02')).toHaveLength(2);
  });
});

describe('listAssignmentsOfDay', () => {
  it('returns each assignment of the day with the athletes it reaches', async () => {
    const repository = await inMemory();
    const scope = await loadAssignScope(sources, 'admin', 's1');
    await assignPlan(repository, scope, { planId: 'p1', sessionDate: '2026-11-02', target: { kind: 'group', groupId: 'g1' } });
    await assignPlan(repository, scope, { planId: 'p1', sessionDate: '2026-11-03', target: { kind: 'school' } });

    const day = await listAssignmentsOfDay({ assignments: repository, athletes }, 's1', '2026-11-02');

    expect(day).toHaveLength(1);
    expect(day[0]!.athleteIds).toEqual(['a1', 'a2']);
  });
});
