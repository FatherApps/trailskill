import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemoryFulfillmentRepository,
  createPowerSyncFulfillmentRepository,
  InvalidFulfillmentError,
  type FulfillmentRepository,
  type NewFulfillmentMark,
} from '..';

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
  writeRecord: jest.requireActual('../../../core/sync/writes').writeRecord,
}));

const TABLES = `
  CREATE TABLE training_plan_fulfillments (
    id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, device_id TEXT, assignment_id TEXT, version_id TEXT, block_id TEXT,
    athlete_id TEXT, status TEXT, completed_repetitions INTEGER, series_id TEXT, captured_at TEXT, hidden INTEGER
  );
  CREATE TABLE training_plan_blocks (id TEXT PRIMARY KEY, recording TEXT);
  CREATE TABLE training_plan_assignments (id TEXT PRIMARY KEY, school_id TEXT);
  CREATE TABLE timing_series (id TEXT PRIMARY KEY, school_id TEXT);
`;

// b1 completion, b2 per_repetition, b3 series_total; the assignment and series-1 belong to school-1, series-2 to school-2.
const lookups = {
  recordings: { b1: 'completion', b2: 'per_repetition', b3: 'series_total' },
  assignmentSchools: { as1: 'school-1' },
  seriesSchools: { 'series-1': 'school-1', 'series-2': 'school-2' },
} as const;


let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

let storePath = '';
async function powerSync(): Promise<FulfillmentRepository> {
  const store = createStore();
  removeStore = store.remove;
  storePath = store.path;
  const seed = new DatabaseSync(store.path);
  seed.exec(TABLES);
  for (const [id, recording] of Object.entries(lookups.recordings)) seed.prepare('INSERT INTO training_plan_blocks VALUES (?, ?)').run(id, recording);
  for (const [id, school] of Object.entries(lookups.assignmentSchools)) seed.prepare('INSERT INTO training_plan_assignments VALUES (?, ?)').run(id, school);
  for (const [id, school] of Object.entries(lookups.seriesSchools)) seed.prepare('INSERT INTO timing_series VALUES (?, ?)').run(id, school);
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncFulfillmentRepository();
}

const factories: [string, () => Promise<FulfillmentRepository>][] = [
  ['in-memory', async () => createInMemoryFulfillmentRepository(lookups)],
  ['PowerSync', powerSync],
];

const mark = (overrides: Partial<NewFulfillmentMark> = {}): NewFulfillmentMark => ({
  assignmentId: 'as1',
  versionId: 'v1',
  blockId: 'b1',
  athleteId: 'a1',
  status: 'done',
  authorId: 'coach-1',
  deviceId: 'tablet-1',
  capturedAt: '2026-11-02T15:00:00.000Z',
  ...overrides,
});

describe.each(factories)('%s fulfillment repository', (_name, create) => {
  it('stores all four statuses with their author and device, and a cell never marked is not listed', async () => {
    const repository = await create();

    await repository.mark(mark({ blockId: 'b1', status: 'done' }));
    await repository.mark(mark({ blockId: 'b2', status: 'partial', completedRepetitions: 3 }));
    await repository.mark(mark({ blockId: 'b3', status: 'absent' }));
    await repository.mark(mark({ blockId: 'b4', status: 'not_marked' }));

    const stored = (await repository.list('as1')).sort((x, y) => x.blockId.localeCompare(y.blockId));
    expect(stored.map((m) => [m.blockId, m.status, m.completedRepetitions])).toEqual([
      ['b1', 'done', null],
      ['b2', 'partial', 3],
      ['b3', 'absent', null],
      ['b4', 'not_marked', null],
    ]);
    expect(stored.every((m) => m.authorId === 'coach-1' && m.deviceId === 'tablet-1' && m.assignmentId === 'as1' && m.versionId === 'v1')).toBe(true);
    expect(await repository.list('other')).toEqual([]);
  });

  it.each([undefined, 0, -1, 1.5, Number.NaN])('rejects a partial mark with the count %s, writing nothing', async (count) => {
    const repository = await create();

    await expect(repository.mark(mark({ status: 'partial', completedRepetitions: count }))).rejects.toThrow(InvalidFulfillmentError);

    expect(await repository.list('as1')).toEqual([]);
  });

  it.each(['done', 'absent', 'not_marked'] as const)('keeps no count for a %s mark', async (status) => {
    const repository = await create();

    await repository.mark(mark({ status, completedRepetitions: 4 }));

    expect((await repository.list('as1'))[0]).toMatchObject({ status, completedRepetitions: null });
  });

  it('keeps the latest mark of a cell, and a later "not marked" replaces a partial and its count', async () => {
    const repository = await create();

    await repository.mark(mark({ status: 'partial', completedRepetitions: 2, capturedAt: '2026-11-02T15:00:00.000Z' }));
    await repository.mark(mark({ status: 'not_marked', capturedAt: '2026-11-02T15:05:00.000Z' }));

    expect(await repository.list('as1')).toMatchObject([{ status: 'not_marked', completedRepetitions: null }]);
  });

  it('does not let two devices marking different cells overwrite each other', async () => {
    const repository = await create();

    await repository.mark(mark({ athleteId: 'a1', blockId: 'b1', status: 'done', authorId: 'coach-1', deviceId: 'tablet-1' }));
    await repository.mark(mark({ athleteId: 'a2', blockId: 'b1', status: 'absent', authorId: 'coach-2', deviceId: 'tablet-2' }));

    const stored = (await repository.list('as1')).sort((x, y) => x.athleteId.localeCompare(y.athleteId));
    expect(stored.map((m) => [m.athleteId, m.status, m.authorId, m.deviceId])).toEqual([
      ['a1', 'done', 'coach-1', 'tablet-1'],
      ['a2', 'absent', 'coach-2', 'tablet-2'],
    ]);
  });

  it('saves the series of a timed block only when it is given', async () => {
    const repository = await create();

    await repository.mark(mark({ blockId: 'b1' }));
    await repository.mark(mark({ blockId: 'b2', seriesId: 'series-1' }));

    const stored = (await repository.list('as1')).sort((x, y) => x.blockId.localeCompare(y.blockId));
    expect(stored.map((m) => m.seriesId)).toEqual([null, 'series-1']);
  });

  it.each([
    ['a completion block', { blockId: 'b1', seriesId: 'series-1' }],
    ['a series of another school', { blockId: 'b2', seriesId: 'series-2' }],
    ['an unknown series', { blockId: 'b2', seriesId: 'nope' }],
  ])('rejects a series on %s, writing nothing', async (_label, overrides) => {
    const repository = await create();

    await expect(repository.mark(mark(overrides))).rejects.toThrow(InvalidFulfillmentError);

    expect(await repository.list('as1')).toEqual([]);
  });

  it('saves a series of the assignment school on a per-repetition and on a series-total block, and no series on a completion block', async () => {
    const repository = await create();

    await repository.mark(mark({ blockId: 'b1' }));
    await repository.mark(mark({ blockId: 'b2', seriesId: 'series-1' }));
    await repository.mark(mark({ blockId: 'b3', seriesId: 'series-1' }));

    const stored = (await repository.list('as1')).sort((x, y) => x.blockId.localeCompare(y.blockId));
    expect(stored.map((m) => m.seriesId)).toEqual([null, 'series-1', 'series-1']);
  });
});

describe('PowerSync fulfillment repository', () => {
  it('keeps the marks after the app restarts, and queues each one for upload in the same transaction', async () => {
    const repository = await powerSync();
    await repository.mark(mark({ status: 'partial', completedRepetitions: 3 }));
    expect(mockDb.transactions.at(-1)!.some((s) => s.sql.includes('pending_writes'))).toBe(true);

    mockDb = openDatabase(storePath);

    expect(await createPowerSyncFulfillmentRepository().list('as1')).toMatchObject([
      { status: 'partial', completedRepetitions: 3, authorId: 'coach-1', deviceId: 'tablet-1' },
    ]);
  });

  it('does not list a mark the server hid after an authorization was withdrawn', async () => {
    const repository = await powerSync();
    await repository.mark(mark());
    const seed = new DatabaseSync(storePath);
    seed.exec('UPDATE training_plan_fulfillments SET hidden = 1');
    seed.close();

    expect(await repository.list('as1')).toEqual([]);
  });
});
