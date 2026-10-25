import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemoryAssignmentRepository,
  createInMemoryFulfillmentRepository,
  createInMemoryTrainingPlanRepository,
  createPowerSyncAssignmentRepository,
  createPowerSyncFulfillmentRepository,
  createPowerSyncTrainingPlanRepository,
} from '..';
import type { Assignment, AssignmentRepository, FulfillmentRepository, Plan, PlanBlock, TrainingPlanRepository } from '..';

// Same setup as plan-repository.test.ts: the real database is replaced by the SQLite-backed fake, and the
// core/sync barrel is mocked; the writes stay the real ones.
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
  writeRecord: jest.requireActual('../../../core/sync/writes').writeRecord,
}));

const TABLES = `
  CREATE TABLE training_plans (id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, school_id TEXT, name TEXT, is_template INTEGER);
  CREATE TABLE training_plan_versions (id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, plan_id TEXT, version INTEGER, complete INTEGER, assigned INTEGER);
  CREATE TABLE training_plan_blocks (
    id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, version_id TEXT, position INTEGER, repetitions INTEGER,
    distance TEXT, stroke TEXT, drill TEXT, equipment TEXT, send_off_seconds INTEGER, phase TEXT, recording TEXT
  );
  CREATE TABLE training_plan_assignments (
    id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, school_id TEXT, plan_id TEXT, version_id TEXT,
    session_date TEXT, target TEXT, athlete_id TEXT, group_id TEXT, category_id TEXT, withdrawn_at TEXT, withdrawn_by TEXT
  );
  CREATE TABLE training_plan_fulfillments (
    id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, device_id TEXT, assignment_id TEXT, version_id TEXT, block_id TEXT,
    athlete_id TEXT, status TEXT, completed_repetitions INTEGER, series_id TEXT, captured_at TEXT, hidden INTEGER
  );
  CREATE TABLE timing_series (id TEXT PRIMARY KEY, school_id TEXT);
`;

type Setup = {
  plans: TrainingPlanRepository;
  assignments: AssignmentRepository;
  fulfillment: FulfillmentRepository;
  versionCount: (planId: string) => number;
};

function inMemory(): Setup {
  const plans = createInMemoryTrainingPlanRepository();
  return {
    plans,
    assignments: createInMemoryAssignmentRepository(plans),
    fulfillment: createInMemoryFulfillmentRepository({}, plans),
    versionCount: plans.versionCount,
  };
}

let removeStore: (() => void) | undefined;
let storePath = '';
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function powerSync(): Setup {
  const store = createStore();
  removeStore = store.remove;
  storePath = store.path;
  const seed = new DatabaseSync(store.path);
  seed.exec(TABLES);
  seed.close();
  mockDb = openDatabase(store.path);
  return {
    plans: createPowerSyncTrainingPlanRepository(),
    assignments: createPowerSyncAssignmentRepository(),
    fulfillment: createPowerSyncFulfillmentRepository(),
    versionCount: (planId) => mockDb.getAll('SELECT id FROM training_plan_versions WHERE plan_id = ?', [planId]).length,
  };
}

const DAY = '2026-11-02';

const block = (id: string, over: Partial<PlanBlock> = {}): PlanBlock => ({
  id,
  phase: 'main',
  repetitions: 4,
  distance: 50,
  activity: 'FR',
  equipment: [],
  sendOffSeconds: null,
  recording: 'completion',
  ...over,
});
const plan = (id: string, blocks: PlanBlock[], over: Partial<Plan> = {}): Plan => ({ id, schoolId: 'school-1', name: 'Aerobic base', isTemplate: false, blocks, ...over });

const original = () => plan('p1', [block('b1'), block('b2', { phase: 'warm_up' }), block('b3', { phase: 'cool_down' })]);
// Edits b1, drops b3 and adds b4.
const edited = () => plan('p1', [block('b1', { repetitions: 10 }), block('b2', { phase: 'warm_up' }), block('b4', { distance: 100 })]);

const withoutIds = (blocks: PlanBlock[]) => blocks.map(({ id: _id, ...rest }) => rest);
const assign = (s: Setup, planId = 'p1') => s.assignments.create({ schoolId: 'school-1', planId, sessionDate: DAY, target: { kind: 'group', groupId: 'g1' } });
const sessions = (s: Setup) => s.assignments.list('school-1', DAY);
const sessionOf = async (s: Setup, id: string): Promise<Assignment> => (await sessions(s)).find((a) => a.id === id)!;
const markDone = (s: Setup, session: Assignment, blockId: string) =>
  s.fulfillment.mark({ assignmentId: session.id, versionId: session.versionId, blockId, athleteId: 'a1', status: 'done', authorId: 'k1', deviceId: 'tablet-1' });

describe.each([
  ['in-memory', inMemory],
  ['PowerSync', powerSync],
] as [string, () => Setup][])('%s plan versioning', (_name, create) => {
  it('edits a plan without assignments in place: one version, the content edited', async () => {
    const s = create();
    await s.plans.save(original());

    await s.plans.save(edited());

    expect(s.versionCount('p1')).toBe(1);
    await expect(s.plans.get('p1')).resolves.toEqual(edited());
  });

  it('creates version 2 when an assigned plan is edited, and the first version still reads exactly as it was', async () => {
    const s = create();
    await s.plans.save(original());
    const id = await assign(s);
    const first = (await sessionOf(s, id)).versionId;
    const before = await s.plans.get('p1');

    await s.plans.save(edited());

    expect(s.versionCount('p1')).toBe(2);
    await expect(s.plans.get('p1', first)).resolves.toEqual(before);
    const latest = (await s.plans.get('p1'))!;
    expect(withoutIds(latest.blocks)).toEqual(withoutIds(edited().blocks));
    expect(latest.blocks.map((b) => b.id).filter((blockId) => before!.blocks.some((old) => old.id === blockId))).toEqual([]);
  });

  it('moves a session without records to the new version and keeps a session with a record on its own', async () => {
    const s = create();
    await s.plans.save(original());
    const marked = await assign(s);
    const open = await assign(s);
    const first = await sessionOf(s, marked);
    await markDone(s, first, 'b1');
    const before = await s.plans.get('p1');

    await s.plans.save(edited());

    const keeps = await sessionOf(s, marked);
    const moves = await sessionOf(s, open);
    expect(keeps.versionId).toBe(first.versionId);
    expect(moves.versionId).not.toBe(first.versionId);
    await expect(s.plans.get('p1', keeps.versionId)).resolves.toEqual(before);
    expect(withoutIds((await s.plans.get('p1', moves.versionId))!.blocks)).toEqual(withoutIds(edited().blocks));
  });

  it('creates another version on each edit while assigned, and every earlier version keeps its content', async () => {
    const s = create();
    await s.plans.save(original());
    const id = await assign(s);
    const first = (await sessionOf(s, id)).versionId;
    const before = await s.plans.get('p1');

    await s.plans.save(edited());
    const second = (await sessionOf(s, id)).versionId;
    const secondContent = await s.plans.get('p1', second);
    await s.plans.save(plan('p1', [block('b1', { repetitions: 20 })]));

    expect(s.versionCount('p1')).toBe(3);
    await expect(s.plans.get('p1', first)).resolves.toEqual(before);
    await expect(s.plans.get('p1', second)).resolves.toEqual(secondContent);
    expect(withoutIds((await s.plans.get('p1'))!.blocks)).toEqual(withoutIds([block('b1', { repetitions: 20 })]));
  });

  it('gives fresh ids to blocks of an older version saved again, so that version stays intact', async () => {
    const s = create();
    await s.plans.save(original());
    const id = await assign(s);
    await markDone(s, await sessionOf(s, id), 'b1');
    const before = await s.plans.get('p1');
    const first = (await sessionOf(s, id)).versionId;
    await s.plans.save(edited());
    // The session keeps version 1 (it has a record), so version 2 is unassigned and is edited in place.
    expect(s.versionCount('p1')).toBe(2);

    const stale = plan('p1', before!.blocks.map((b) => ({ ...b, repetitions: 7 })));
    await s.plans.save(stale);

    expect(s.versionCount('p1')).toBe(2);
    await expect(s.plans.get('p1', first)).resolves.toEqual(before);
    const latest = (await s.plans.get('p1'))!;
    expect(withoutIds(latest.blocks)).toEqual(withoutIds(stale.blocks));
    expect(latest.blocks.map((b) => b.id).filter((blockId) => before!.blocks.some((old) => old.id === blockId))).toEqual([]);
  });

  it('returns null for a version of another plan and for a missing version', async () => {
    const s = create();
    await s.plans.save(original());
    await s.plans.save(plan('p2', [block('c1')]));
    const other = await assign(s, 'p2');
    const foreign = (await sessionOf(s, other)).versionId;

    await expect(s.plans.get('p1', foreign)).resolves.toBeNull();
    await expect(s.plans.get('p1', 'missing')).resolves.toBeNull();
  });

  it('keeps the records of a group session tied to their version and blocks when the plan is edited', async () => {
    const s = create();
    await s.plans.save(original());
    const id = await assign(s);
    const first = await sessionOf(s, id);
    await markDone(s, first, 'b1');
    await markDone(s, first, 'b2');
    const before = await s.plans.get('p1');

    await s.plans.save(edited());

    expect(s.versionCount('p1')).toBe(2);
    const marks = await s.fulfillment.list(id);
    expect(marks.map((m) => [m.versionId, m.blockId, m.status]).sort()).toEqual([
      [first.versionId, 'b1', 'done'],
      [first.versionId, 'b2', 'done'],
    ]);
    expect((await sessionOf(s, id)).versionId).toBe(first.versionId);
    await expect(s.plans.get('p1', first.versionId)).resolves.toEqual(before);
  });
});

describe('PowerSync plan versioning', () => {
  type Written = { sql: string; params: unknown[] };
  const lastTransaction = (): Written[] => mockDb.transactions[mockDb.transactions.length - 1]!;
  const writes = (statements: Written[]) =>
    statements.filter((s) => /^(INSERT INTO|UPDATE) (training_plan_versions|training_plan_blocks|training_plan_assignments)\b/.test(s.sql));
  const kinds = (statements: Written[]) => writes(statements).map((s) => /^(INSERT INTO|UPDATE) (\w+)/.exec(s.sql)!.slice(1).join(' '));
  const seed = (text: string) => {
    const connection = new DatabaseSync(storePath);
    connection.exec(text);
    connection.close();
  };
  const sql = (text: string) => mockDb.getAll<Record<string, unknown>>(text);

  it('saves in one transaction: version insert, block inserts, the version completed, then the sessions moved', async () => {
    const s = powerSync();
    await s.plans.save(original());
    await assign(s);
    const transactions = mockDb.transactions.length;

    await s.plans.save(edited());

    expect(mockDb.transactions).toHaveLength(transactions + 1);
    expect(kinds(lastTransaction())).toEqual([
      'INSERT INTO training_plan_versions',
      ...Array(3).fill('INSERT INTO training_plan_blocks'),
      'UPDATE training_plan_versions',
      'UPDATE training_plan_assignments',
    ]);
  });

  it('inserts every new version with complete = 0 and only then sets complete = 1, for a new plan and for a new version of an assigned plan', async () => {
    const s = powerSync();

    await s.plans.save(original());
    const [insertNew, ...restNew] = writes(lastTransaction());
    expect(insertNew!.sql).toMatch(/^INSERT INTO training_plan_versions \(id, plan_id, version, complete\) VALUES/);
    expect(insertNew!.params.slice(1)).toEqual(['p1', 1, 0]);
    const patchNew = restNew[restNew.length - 1]!;
    expect(patchNew.sql).toMatch(/^UPDATE training_plan_versions SET complete = \? WHERE id = \?/);
    expect(patchNew.params).toEqual([1, insertNew!.params[0]]);

    await assign(s);
    await s.plans.save(edited());
    const [insertNext, ...restNext] = writes(lastTransaction());
    expect(insertNext!.sql).toMatch(/^INSERT INTO training_plan_versions \(id, plan_id, version, complete\) VALUES/);
    expect(insertNext!.params.slice(1)).toEqual(['p1', 2, 0]);
    expect(restNext.filter((w) => w.sql.startsWith('UPDATE training_plan_versions')).map((w) => w.params)).toEqual([[1, insertNext!.params[0]]]);
    expect(sql('SELECT complete FROM training_plan_versions').map((r) => r.complete)).toEqual([1, 1]);
  });

  it('does not move a withdrawn session', async () => {
    const s = powerSync();
    await s.plans.save(original());
    const withdrawn = await assign(s);
    const moved = await assign(s);
    const first = (await sessionOf(s, withdrawn)).versionId;
    await s.assignments.withdraw(withdrawn);

    await s.plans.save(edited());

    const rows = sql('SELECT id, version_id FROM training_plan_assignments');
    expect(rows.find((r) => r.id === withdrawn)!.version_id).toBe(first);
    expect(rows.find((r) => r.id === moved)!.version_id).not.toBe(first);
  });

  it('creates a new version when the server says the version is assigned, even with no local assignment', async () => {
    const s = powerSync();
    await s.plans.save(original());
    seed('UPDATE training_plan_versions SET assigned = 1');

    await s.plans.save(edited());

    expect(s.versionCount('p1')).toBe(2);
  });

  it('never writes created_at or created_by when it creates a version', async () => {
    const s = powerSync();
    await s.plans.save(original());
    await assign(s);

    await s.plans.save(edited());

    expect(lastTransaction().map((w) => w.sql).join('\n')).not.toMatch(/created_at|created_by/);
  });

  it('ignores an incomplete version when it looks for the latest, and numbers the next one after it', async () => {
    const s = powerSync();
    await s.plans.save(original());
    const [{ id: first }] = sql('SELECT id FROM training_plan_versions') as { id: string }[];
    const before = await s.plans.get('p1');
    seed(`INSERT INTO training_plan_versions (id, plan_id, version, complete) VALUES ('half', 'p1', 2, 0);
      INSERT INTO training_plan_blocks (id, version_id, position) VALUES ('hb', 'half', 1)`);

    await expect(s.plans.get('p1')).resolves.toEqual(before);
    const id = await assign(s);
    expect((await sessionOf(s, id)).versionId).toBe(first);
    await s.plans.save(edited());

    expect(sql('SELECT version FROM training_plan_versions ORDER BY version').map((r) => r.version)).toEqual([1, 2, 3]);
  });
});
