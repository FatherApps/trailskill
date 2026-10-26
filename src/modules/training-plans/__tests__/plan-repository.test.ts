import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import { BlockHasFulfillmentError, createInMemoryTrainingPlanRepository, createPowerSyncTrainingPlanRepository } from '..';
import type { Plan, PlanBlock, TrainingPlanRepository } from '..';

// Same setup as the measurement repository test: the real database is replaced by the SQLite-backed
// fake, and the core/sync barrel is mocked; `writeBatch` stays the real one.
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
}));

const TABLES = `
  CREATE TABLE training_plans (id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, school_id TEXT, name TEXT, is_template INTEGER);
  CREATE TABLE training_plan_versions (id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, plan_id TEXT, version INTEGER, complete INTEGER, assigned INTEGER);
  CREATE TABLE training_plan_blocks (
    id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, version_id TEXT, position INTEGER, repetitions INTEGER,
    distance TEXT, stroke TEXT, drill TEXT, equipment TEXT, send_off_seconds INTEGER, phase TEXT, recording TEXT
  );
  CREATE TABLE training_plan_assignments (id TEXT PRIMARY KEY, plan_id TEXT, version_id TEXT, withdrawn_at TEXT);
  CREATE TABLE training_plan_fulfillments (id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, assignment_id TEXT, block_id TEXT, status TEXT);
`;

let removeStore: (() => void) | undefined;
let storePath: string;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function createPowerSync(): TrainingPlanRepository {
  const store = createStore();
  removeStore = store.remove;
  storePath = store.path;
  const seed = new DatabaseSync(store.path);
  seed.exec(TABLES);
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncTrainingPlanRepository();
}

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

const plan = (id: string, over: Partial<Plan> = {}): Plan => ({
  id,
  schoolId: 'school-1',
  name: 'Aerobic base',
  isTemplate: false,
  blocks: [block('b1'), block('b2', { phase: 'warm_up' }), block('b3', { phase: 'cool_down' })],
  ...over,
});

const factories: [string, () => TrainingPlanRepository][] = [
  ['in-memory', createInMemoryTrainingPlanRepository],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s training plan repository', (_name, create) => {
  it('reads back every field of every block, in order', async () => {
    const repository = create();
    const saved = plan('p1', {
      blocks: [
        block('b1', { phase: 'warm_up', repetitions: 1, distance: 400, recording: 'completion' }),
        block('b2', {
          phase: 'technique',
          repetitions: 8,
          distance: 25,
          activity: 'Catch-up drill',
          equipment: ['fins', 'snorkel'],
          sendOffSeconds: 45,
          recording: 'per_repetition',
        }),
        block('b3', { phase: 'main', activity: 'BK', sendOffSeconds: 90, recording: 'series_total' }),
        block('b4', { phase: 'cool_down', distance: 200, activity: 'IM' }),
      ],
    });

    await repository.save(saved);

    await expect(repository.get('p1')).resolves.toEqual(saved);
  });

  it('returns null for a plan that does not exist', async () => {
    await expect(create().get('missing')).resolves.toBeNull();
  });

  it('keeps the new order after blocks are reordered and saved again', async () => {
    const repository = create();
    await repository.save(plan('p1'));

    const reordered = plan('p1', { blocks: [block('b3'), block('b1'), block('b2')] });
    await repository.save(reordered);

    expect((await repository.get('p1'))?.blocks.map((b) => b.id)).toEqual(['b3', 'b1', 'b2']);
  });

  it('drops a removed block and keeps the others', async () => {
    const repository = create();
    await repository.save(plan('p1'));

    await repository.save(plan('p1', { blocks: [block('b1'), block('b3')] }));

    expect((await repository.get('p1'))?.blocks.map((b) => b.id)).toEqual(['b1', 'b3']);
  });

  it('updates the name and the changed fields of a block on a second save', async () => {
    const repository = create();
    await repository.save(plan('p1'));

    await repository.save(plan('p1', { name: 'Renamed', blocks: [block('b1', { repetitions: 10 })] }));

    const reopened = await repository.get('p1');
    expect(reopened?.name).toBe('Renamed');
    expect(reopened?.blocks).toEqual([block('b1', { repetitions: 10 })]);
  });

  describe('validation writes nothing', () => {
    const invalid: [string, Partial<PlanBlock>][] = [
      ['a block without what is recorded', { recording: undefined } as unknown as Partial<PlanBlock>],
      ['an unknown recording', { recording: 'everything' } as unknown as Partial<PlanBlock>],
      ['an empty activity', { activity: '' }],
      ['a blank activity', { activity: '   ' }],
      ['a drill of 121 characters', { activity: 'x'.repeat(121) }],
      ['zero repetitions', { repetitions: 0 }],
      ['a distance outside the catalog', { distance: 51 }],
      ['an equipment outside the catalog', { equipment: ['jetpack'] }],
      ['a zero send-off', { sendOffSeconds: 0 }],
    ];

    it.each(invalid)('rejects %s', async (_label, over) => {
      const repository = create();

      await expect(repository.save(plan('p1', { blocks: [block('b1'), block('b2', over)] }))).rejects.toThrow();

      await expect(repository.get('p1')).resolves.toBeNull();
      await expect(repository.list('school-1')).resolves.toEqual([]);
    });

    it('accepts a drill of exactly 120 characters, trimmed', async () => {
      const repository = create();
      const drill = 'x'.repeat(120);

      await repository.save(plan('p1', { blocks: [block('b1', { activity: `  ${drill}  ` })] }));

      expect((await repository.get('p1'))?.blocks[0]?.activity).toBe(drill);
    });
  });

  describe('copy', () => {
    it('copies a plan as a template with new ids and the same content', async () => {
      const repository = create();
      const source = plan('p1', { blocks: [block('b1', { equipment: ['fins'] }), block('b2', { activity: 'Kick' })] });
      await repository.save(source);

      const copyId = await repository.copy('p1', true);

      const copy = await repository.get(copyId);
      expect(copyId).not.toBe('p1');
      expect(copy).toMatchObject({ schoolId: 'school-1', name: 'Aerobic base', isTemplate: true });
      expect(copy?.blocks.map(({ id: _id, ...rest }) => rest)).toEqual(source.blocks.map(({ id: _id, ...rest }) => rest));
      expect(copy?.blocks.map((b) => b.id)).not.toContain('b1');
      expect(copy?.blocks.map((b) => b.id)).not.toContain('b2');
      expect(new Set(copy?.blocks.map((b) => b.id)).size).toBe(2);
    });

    it('copies a template as a plan', async () => {
      const repository = create();
      await repository.save(plan('t1', { isTemplate: true }));

      const copyId = await repository.copy('t1', false);

      expect((await repository.get(copyId))?.isTemplate).toBe(false);
      expect((await repository.get('t1'))?.isTemplate).toBe(true);
    });

    it('stays independent of the source in both directions', async () => {
      const repository = create();
      await repository.save(plan('t1', { isTemplate: true }));
      const copyId = await repository.copy('t1', false);
      const original = (await repository.get('t1'))!;
      const copy = (await repository.get(copyId))!;

      await repository.save({ ...copy, name: 'Edited copy', blocks: [{ ...copy.blocks[0]!, repetitions: 99 }] });
      expect(await repository.get('t1')).toEqual(original);

      const copyBefore = (await repository.get(copyId))!;
      await repository.save({ ...original, name: 'Edited template', blocks: [{ ...original.blocks[1]!, repetitions: 7 }] });
      expect(await repository.get(copyId)).toEqual(copyBefore);
    });

    it('rejects when the plan does not exist', async () => {
      await expect(create().copy('missing', true)).rejects.toThrow();
    });
  });

  describe('list', () => {
    it('lists plans and templates of one school by name, then id', async () => {
      const repository = create();
      await repository.save(plan('p2', { name: 'Sprint' }));
      await repository.save(plan('p1', { name: 'Aerobic' }));
      await repository.save(plan('t1', { name: 'Aerobic', isTemplate: true }));
      await repository.save(plan('other', { name: 'Other school', schoolId: 'school-2' }));

      await expect(repository.list('school-1')).resolves.toEqual([
        { id: 'p1', name: 'Aerobic', isTemplate: false },
        { id: 't1', name: 'Aerobic', isTemplate: true },
        { id: 'p2', name: 'Sprint', isTemplate: false },
      ]);
    });
  });

  it('does not let a caller mutate stored data through what it saved or read', async () => {
    const repository = create();
    const saved = plan('p1', { blocks: [block('b1', { equipment: ['fins'] })] });
    await repository.save(saved);
    saved.blocks[0]!.equipment.push('paddles');
    saved.name = 'Mutated';

    const read = (await repository.get('p1'))!;
    read.blocks[0]!.equipment.push('snorkel');

    expect(await repository.get('p1')).toEqual(plan('p1', { blocks: [block('b1', { equipment: ['fins'] })] }));
  });
});

describe('PowerSync training plan repository', () => {
  type BlockRow = { stroke: string | null; drill: string | null; distance: string; equipment: string; send_off_seconds: number | null };

  it('stores the stroke and the drill separately, the distance as a catalog code and equipment as a JSON array', async () => {
    const repository = createPowerSync();
    await repository.save(
      plan('p1', {
        blocks: [block('b1', { activity: 'BR', equipment: ['fins', 'paddles'] }), block('b2', { activity: ' Kick on side ', equipment: [] })],
      }),
    );

    const rows = mockDb.getAll<BlockRow>('SELECT * FROM training_plan_blocks ORDER BY position');

    expect(rows.map((r) => [r.stroke, r.drill, r.distance, r.equipment])).toEqual([
      ['BR', null, '50m', '["fins","paddles"]'],
      [null, 'Kick on side', '50m', '[]'],
    ]);
  });

  it('keeps a single version row with version 1 when the plan is saved twice', async () => {
    const repository = createPowerSync();
    await repository.save(plan('p1'));
    await repository.save(plan('p1', { name: 'Again' }));

    expect(mockDb.getAll('SELECT plan_id, version FROM training_plan_versions')).toEqual([{ plan_id: 'p1', version: 1 }]);
  });

  it('never writes the server-assigned created_at or created_by columns', async () => {
    const repository = createPowerSync();
    await repository.save(plan('p1'));
    await repository.save(plan('p1', { blocks: [block('b1')] }));
    await repository.copy('p1', true);

    const sql = mockDb.transactions.flat().map((s) => s.sql).join('\n');
    expect(sql).not.toMatch(/created_at|created_by/);
  });

  it('queues every written row and the deleted blocks for upload', async () => {
    const repository = createPowerSync();
    await repository.save(plan('p1'));
    await repository.save(plan('p1', { blocks: [block('b1')] }));

    const pending = mockDb.getAll<{ table_name: string; record_id: string }>('SELECT table_name, record_id FROM pending_writes');
    expect(pending.filter((p) => p.record_id === 'b2' || p.record_id === 'b3')).toHaveLength(4);
  });

  it('saves the plan, its version, the deletions and every block in one transaction', async () => {
    const repository = createPowerSync();
    await repository.save(plan('p1'));
    await repository.save(plan('p1', { blocks: [block('b3'), block('b4')] }));

    expect(mockDb.transactions).toHaveLength(2);
    const sql = mockDb.transactions[1].map((s) => s.sql);
    expect(sql.some((s) => s.startsWith('UPDATE training_plans'))).toBe(true);
    expect(sql.filter((s) => s.startsWith('DELETE FROM training_plan_blocks'))).toHaveLength(2);
    expect(sql.some((s) => s.startsWith('INSERT INTO training_plan_blocks'))).toBe(true);
  });

  const failInsertOf = (blockId: string) => {
    const seed = new DatabaseSync(storePath);
    seed.exec(`CREATE TRIGGER fail_block BEFORE INSERT ON training_plan_blocks WHEN NEW.id = '${blockId}' BEGIN SELECT RAISE(ABORT, 'disk full'); END`);
    seed.close();
  };
  const pendingWrites = () => mockDb.getAll('SELECT table_name, record_id FROM pending_writes');

  it('writes nothing and queues nothing when a block of a new plan fails', async () => {
    const repository = createPowerSync();
    failInsertOf('b3');

    await expect(repository.save(plan('p1'))).rejects.toThrow('disk full');

    expect(mockDb.getAll('SELECT id FROM training_plans')).toEqual([]);
    expect(mockDb.getAll('SELECT id FROM training_plan_versions')).toEqual([]);
    expect(mockDb.getAll('SELECT id FROM training_plan_blocks')).toEqual([]);
    expect(pendingWrites()).toEqual([]);
  });

  it('keeps the previous plan whole and queues nothing new when a later save fails midway', async () => {
    const repository = createPowerSync();
    await repository.save(plan('p1'));
    const before = await repository.get('p1');
    const queued = pendingWrites();
    failInsertOf('b5');

    await expect(
      repository.save(plan('p1', { name: 'Half saved', blocks: [block('b1', { repetitions: 9 }), block('b4'), block('b5')] })),
    ).rejects.toThrow('disk full');

    await expect(repository.get('p1')).resolves.toEqual(before);
    expect(pendingWrites()).toEqual(queued);
  });

  describe('a removed block that already has a local mark', () => {
    const mark = (blockId: string) => {
      const seed = new DatabaseSync(storePath);
      seed.prepare("INSERT INTO training_plan_fulfillments (id, block_id, status) VALUES ('f1', ?, 'done')").run(blockId);
      seed.close();
    };

    it('rejects with BlockHasFulfillmentError and writes nothing', async () => {
      const repository = createPowerSync();
      await repository.save(plan('p1'));
      const before = await repository.get('p1');
      const queued = pendingWrites();
      mark('b2');

      await expect(repository.save(plan('p1', { name: 'Renamed', blocks: [block('b1'), block('b3')] }))).rejects.toBeInstanceOf(
        BlockHasFulfillmentError,
      );

      await expect(repository.get('p1')).resolves.toEqual(before);
      expect(pendingWrites()).toEqual(queued);
    });

    it('still saves when the marked block is kept', async () => {
      const repository = createPowerSync();
      await repository.save(plan('p1'));
      mark('b1');

      await repository.save(plan('p1', { blocks: [block('b1'), block('b3')] }));

      expect((await repository.get('p1'))?.blocks.map((b) => b.id)).toEqual(['b1', 'b3']);
    });
  });
});
