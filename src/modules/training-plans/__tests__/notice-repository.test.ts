import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import { createInMemoryNoticeRepository, createPowerSyncNoticeRepository, InvalidNoticeError, type NewNotice, type NoticeRepository } from '..';

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
  CREATE TABLE training_plan_notices (
    id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, athlete_id TEXT, assignment_id TEXT, version_id TEXT, block_id TEXT, body TEXT
  );
`;

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

async function powerSync(): Promise<NoticeRepository> {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec(TABLES);
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncNoticeRepository();
}

const factories: [string, () => Promise<NoticeRepository>][] = [
  ['in-memory', async () => createInMemoryNoticeRepository()],
  ['PowerSync', powerSync],
];

const notice = (overrides: Partial<NewNotice> = {}): NewNotice => ({
  athleteId: 'a1',
  assignmentId: 'as1',
  versionId: 'v1',
  blockId: 'b1',
  body: 'Test note 1',
  authorId: 'guardian-1',
  createdAt: '2026-11-02T15:00:00.000Z',
  ...overrides,
});

describe.each(factories)('notice repository (%s)', (_name, create) => {
  it('stores the note with its author, athlete, assignment, version, block and device time, and lists it', async () => {
    const repo = await create();

    const id = await repo.add(notice({ body: '  Test note 1  ' }));

    expect(await repo.list('a1', 'as1')).toEqual([
      { id, athleteId: 'a1', assignmentId: 'as1', versionId: 'v1', blockId: 'b1', body: 'Test note 1', authorId: 'guardian-1', createdAt: '2026-11-02T15:00:00.000Z' },
    ]);
  });

  it('accepts a note about the whole plan, with no block', async () => {
    const repo = await create();

    await repo.add(notice({ blockId: null }));

    expect(await repo.list('a1', 'as1')).toMatchObject([{ blockId: null }]);
  });

  it.each([['empty', ''], ['blank', '   \n '], ['over 500 characters', 'x'.repeat(501)]])('rejects a %s body and writes nothing', async (_label, body) => {
    const repo = await create();

    await expect(repo.add(notice({ body }))).rejects.toBeInstanceOf(InvalidNoticeError);
    expect(await repo.list('a1', 'as1')).toEqual([]);
  });

  it('accepts exactly 500 characters once trimmed', async () => {
    const repo = await create();

    await repo.add(notice({ body: ` ${'x'.repeat(500)} ` }));

    expect(await repo.list('a1', 'as1')).toHaveLength(1);
  });

  it('lists the notes of the athlete and assignment, newest first', async () => {
    const repo = await create();
    await repo.add(notice({ body: 'Test note 1', createdAt: '2026-11-02T15:00:00.000Z' }));
    await repo.add(notice({ body: 'Test note 2', createdAt: '2026-11-02T16:00:00.000Z' }));
    await repo.add(notice({ body: 'Other athlete', athleteId: 'a2' }));
    await repo.add(notice({ body: 'Other assignment', assignmentId: 'as2' }));

    expect((await repo.list('a1', 'as1')).map((n) => n.body)).toEqual(['Test note 2', 'Test note 1']);
  });
});
