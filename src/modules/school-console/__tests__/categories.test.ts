import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import { createInMemoryCategoriesRepository, createPowerSyncCategoriesRepository } from '..';
import type { Category, CategoriesRepository } from '..';

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
  writeBatch: jest.requireActual('../../../core/sync/writes').writeBatch,
}));

type AthleteSchool = { id: string; athleteId: string; schoolId: string; categoryId: string | null };

const category = (id: string, schoolId: string, name: string, sortOrder: number, active = true): Category => ({
  id,
  schoolId,
  name,
  sortOrder,
  active,
});

const categories: Category[] = [
  category('c2', 'school-1', 'Categoría B', 1),
  category('c1', 'school-1', 'Categoría A', 0),
  category('c3', 'school-1', 'Categoría C', 2, false),
  category('x1', 'school-2', 'Categoría A', 0),
  // Same sort order: the name decides, then the id.
  category('t2', 'school-3', 'Categoría Y', 0),
  category('t3', 'school-3', 'Categoría X', 0),
  category('t1', 'school-3', 'Categoría X', 0),
];

const athleteSchools: AthleteSchool[] = [
  { id: 'as1', athleteId: 'athlete-1', schoolId: 'school-1', categoryId: null },
  { id: 'as2', athleteId: 'athlete-1', schoolId: 'school-2', categoryId: null },
  { id: 'as3', athleteId: 'athlete-2', schoolId: 'school-1', categoryId: 'c3' },
];

type Harness = { repository: CategoriesRepository; athleteCategory: (athleteId: string, schoolId: string) => string | null };

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function createInMemory(): Harness {
  const repository = createInMemoryCategoriesRepository({ categories, athleteSchools });
  return { repository, athleteCategory: repository.athleteCategory };
}

function createPowerSync(): Harness {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec(`
    CREATE TABLE categories (id TEXT PRIMARY KEY, school_id TEXT, name TEXT, sort_order INTEGER, active INTEGER);
    CREATE TABLE athlete_schools (id TEXT PRIMARY KEY, athlete_id TEXT, school_id TEXT, category_id TEXT);
  `);
  for (const c of categories) {
    seed.prepare('INSERT INTO categories (id, school_id, name, sort_order, active) VALUES (?, ?, ?, ?, ?)').run(c.id, c.schoolId, c.name, c.sortOrder, c.active ? 1 : 0);
  }
  for (const a of athleteSchools) {
    seed.prepare('INSERT INTO athlete_schools (id, athlete_id, school_id, category_id) VALUES (?, ?, ?, ?)').run(a.id, a.athleteId, a.schoolId, a.categoryId);
  }
  seed.close();
  mockDb = openDatabase(store.path);
  return {
    repository: createPowerSyncCategoriesRepository(),
    athleteCategory: (athleteId, schoolId) =>
      mockDb.getAll<{ category_id: string | null }>('SELECT category_id FROM athlete_schools WHERE athlete_id = ? AND school_id = ?', [athleteId, schoolId])[0]?.category_id ?? null,
  };
}

const names = async (repository: CategoriesRepository, schoolId = 'school-1') => (await repository.list(schoolId)).map((c) => c.name);

const factories: [string, () => Harness][] = [
  ['in-memory', createInMemory],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s categories repository', (_name, create) => {
  describe('list', () => {
    it('lists the categories of the school by sort order, inactive ones included', async () => {
      await expect(create().repository.list('school-1')).resolves.toEqual([
        category('c1', 'school-1', 'Categoría A', 0),
        category('c2', 'school-1', 'Categoría B', 1),
        category('c3', 'school-1', 'Categoría C', 2, false),
      ]);
    });

    it('breaks a tie in sort order by name, then by id', async () => {
      const ids = (await create().repository.list('school-3')).map((c) => c.id);
      expect(ids).toEqual(['t1', 't3', 't2']);
    });

    it('lists nothing for a school without categories', async () => {
      await expect(create().repository.list('nobody')).resolves.toEqual([]);
    });
  });

  describe('create', () => {
    it('adds an active category last, trimmed, and returns its id', async () => {
      const { repository } = create();
      const id = await repository.create('school-1', '  Categoría D  ');
      const list = await repository.list('school-1');
      expect(list.at(-1)).toEqual(category(id, 'school-1', 'Categoría D', 3));
      expect(list).toHaveLength(4);
    });

    it('appends after the highest sort order even when there are gaps, and starts at 0 in an empty school', async () => {
      const { repository } = create();
      await repository.create('school-2', 'Categoría B');
      await repository.create('school-4', 'Categoría A');
      expect((await repository.list('school-2')).map((c) => c.sortOrder)).toEqual([0, 1]);
      expect((await repository.list('school-4')).map((c) => c.sortOrder)).toEqual([0]);
    });

    it.each(['', '   '])('rejects the empty name %j and creates nothing', async (name) => {
      const { repository } = create();
      await expect(repository.create('school-1', name)).rejects.toThrow('category_name_required');
      expect(await repository.list('school-1')).toHaveLength(3);
    });
  });

  describe('rename', () => {
    it('renames and trims, keeping the order and the active flag', async () => {
      const { repository } = create();
      await repository.rename('c3', '  Categoría Z ');
      expect((await repository.list('school-1'))[2]).toEqual(category('c3', 'school-1', 'Categoría Z', 2, false));
    });

    it('rejects an empty name and keeps the old one', async () => {
      const { repository } = create();
      await expect(repository.rename('c1', '  ')).rejects.toThrow('category_name_required');
      expect(await names(repository)).toEqual(['Categoría A', 'Categoría B', 'Categoría C']);
    });

    it('rejects an unknown category and creates no row', async () => {
      const { repository } = create();
      await expect(repository.rename('missing', 'Categoría Q')).rejects.toThrow('category_missing');
      expect(await names(repository)).toEqual(['Categoría A', 'Categoría B', 'Categoría C']);
    });
  });

  describe('move', () => {
    it('moves a category down by swapping it with its neighbour', async () => {
      const { repository } = create();
      await repository.move('school-1', 'c1', 'down');
      expect(await names(repository)).toEqual(['Categoría B', 'Categoría A', 'Categoría C']);
    });

    it('moves a category up, over an inactive neighbour too', async () => {
      const { repository } = create();
      await repository.move('school-1', 'c3', 'up');
      expect(await names(repository)).toEqual(['Categoría A', 'Categoría C', 'Categoría B']);
    });

    it('does nothing at the ends', async () => {
      const { repository } = create();
      await repository.move('school-1', 'c1', 'up');
      await repository.move('school-1', 'c3', 'down');
      expect((await repository.list('school-1')).map((c) => [c.id, c.sortOrder])).toEqual([['c1', 0], ['c2', 1], ['c3', 2]]);
    });

    it('renumbers the school from 0 so tied sort orders never stick', async () => {
      const { repository } = create();
      await repository.move('school-3', 't1', 'down');
      const list = await repository.list('school-3');
      expect(list.map((c) => [c.id, c.sortOrder])).toEqual([['t3', 0], ['t1', 1], ['t2', 2]]);
    });

    it('leaves the other schools alone and rejects an unknown category', async () => {
      const { repository } = create();
      await expect(repository.move('school-1', 'x1', 'down')).rejects.toThrow('category_missing');
      await repository.move('school-1', 'c1', 'down');
      expect(await repository.list('school-2')).toEqual([category('x1', 'school-2', 'Categoría A', 0)]);
    });
  });

  describe('setActive', () => {
    it('deactivates and reactivates without touching name or order', async () => {
      const { repository } = create();
      await repository.setActive('c1', false);
      expect((await repository.list('school-1'))[0]).toEqual(category('c1', 'school-1', 'Categoría A', 0, false));
      await repository.setActive('c1', true);
      expect((await repository.list('school-1'))[0]).toEqual(category('c1', 'school-1', 'Categoría A', 0, true));
    });

    it('keeps the category of the athletes who already have it', async () => {
      const { repository, athleteCategory } = create();
      await repository.setActive('c3', true);
      await repository.setActive('c3', false);
      expect(athleteCategory('athlete-2', 'school-1')).toBe('c3');
    });

    it('rejects an unknown category', async () => {
      await expect(create().repository.setActive('missing', false)).rejects.toThrow('category_missing');
    });
  });

  describe('assignAthlete', () => {
    it('assigns an active category of the school to the athlete in that school only', async () => {
      const { repository, athleteCategory } = create();
      await repository.assignAthlete('athlete-1', 'school-1', 'c2');
      expect(athleteCategory('athlete-1', 'school-1')).toBe('c2');
      expect(athleteCategory('athlete-1', 'school-2')).toBeNull();
      expect(athleteCategory('athlete-2', 'school-1')).toBe('c3');
    });

    it('clears the category with null, even an inactive one', async () => {
      const { repository, athleteCategory } = create();
      await repository.assignAthlete('athlete-2', 'school-1', null);
      expect(athleteCategory('athlete-2', 'school-1')).toBeNull();
    });

    it('rejects an athlete without a row in that school', async () => {
      const { repository } = create();
      await expect(repository.assignAthlete('athlete-2', 'school-2', 'x1')).rejects.toThrow('athlete_school_missing');
      await expect(repository.assignAthlete('nobody', 'school-1', 'c1')).rejects.toThrow('athlete_school_missing');
    });

    it('rejects a category of another school and changes nothing', async () => {
      const { repository, athleteCategory } = create();
      await expect(repository.assignAthlete('athlete-1', 'school-1', 'x1')).rejects.toThrow('category_wrong_school');
      expect(athleteCategory('athlete-1', 'school-1')).toBeNull();
    });

    it('rejects an inactive category and changes nothing', async () => {
      const { repository, athleteCategory } = create();
      await expect(repository.assignAthlete('athlete-1', 'school-1', 'c3')).rejects.toThrow('category_inactive');
      expect(athleteCategory('athlete-1', 'school-1')).toBeNull();
    });

    it('rejects an unknown category', async () => {
      await expect(create().repository.assignAthlete('athlete-1', 'school-1', 'missing')).rejects.toThrow('category_missing');
    });
  });
});

describe('PowerSync categories repository writes', () => {
  it('saves a reorder in one local transaction and queues only the rows that changed', async () => {
    const { repository } = createPowerSync();
    const before = mockDb.transactions.length;
    await repository.move('school-1', 'c1', 'down');
    expect(mockDb.transactions).toHaveLength(before + 1);
    const queued = mockDb.getAll<{ record_id: string }>('SELECT record_id FROM pending_writes ORDER BY record_id');
    expect(queued.map((row) => row.record_id)).toEqual(['c1', 'c2']);
  });

  it('queues a new category and a rename for upload', async () => {
    const { repository } = createPowerSync();
    const id = await repository.create('school-1', 'Categoría D');
    await repository.rename('c1', 'Categoría A2');
    const queued = mockDb.getAll<{ table_name: string; record_id: string }>('SELECT table_name, record_id FROM pending_writes ORDER BY record_id');
    expect(queued.every((row) => row.table_name === 'categories')).toBe(true);
    expect(queued.map((row) => row.record_id).sort()).toEqual(['c1', id].sort());
  });
});
