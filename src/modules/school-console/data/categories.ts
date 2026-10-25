import { db, writeBatch } from '../../../core/sync';

export type Category = { id: string; schoolId: string; name: string; sortOrder: number; active: boolean };

export interface CategoriesRepository {
  /** The categories of the school by sort order, then name, then id; inactive ones included. */
  list(schoolId: string): Promise<Category[]>;
  /** Adds an active category after the last one and returns its id. Rejects an empty name (`category_name_required`). */
  create(schoolId: string, name: string): Promise<string>;
  /** Rejects an empty name (`category_name_required`) or an unknown category (`category_missing`). */
  rename(id: string, name: string): Promise<void>;
  /** Swaps the category with its neighbour and renumbers the school from 0, in one transaction. Nothing happens at the ends. */
  move(schoolId: string, id: string, direction: 'up' | 'down'): Promise<void>;
  /** A category in use is never deleted: it is deactivated, and the athletes who have it keep it. */
  setActive(id: string, active: boolean): Promise<void>;
  /**
   * Sets the category (`null` clears it) in the athlete's row of that school. Rejects an athlete without a row there
   * (`athlete_school_missing`), an unknown category (`category_missing`), one of another school (`category_wrong_school`)
   * or an inactive one (`category_inactive`). The category is always chosen by the admin, never derived from athlete data.
   */
  assignAthlete(athleteId: string, schoolId: string, categoryId: string | null): Promise<void>;
}

export type AthleteSchoolRow = { id: string; athleteId: string; schoolId: string; categoryId: string | null };

const cleanName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('category_name_required');
  return trimmed;
};

// The same order as the SQL below (binary text comparison).
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byOrder = (a: Category, b: Category) => a.sortOrder - b.sortOrder || compareText(a.name, b.name) || compareText(a.id, b.id);

type CategoryRow = { id: string; school_id: string; name: string; sort_order: number | null; active: number | null };
const COLUMNS = 'id, school_id, name, sort_order, active';
const ORDER = 'ORDER BY sort_order, name, id';
const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  schoolId: row.school_id,
  name: row.name,
  sortOrder: row.sort_order ?? 0,
  active: row.active === 1,
});

export function createPowerSyncCategoriesRepository(): CategoriesRepository {
  // Reads and writes in one transaction, so a rename or a switch never inserts a row for an id that does not exist.
  const update = (id: string, fields: Record<string, unknown>) =>
    writeBatch(async (batch) => {
      if ((await batch.getAll('SELECT 1 FROM categories WHERE id = ?', [id])).length === 0) throw new Error('category_missing');
      await batch.write('categories', { id, ...fields });
    });

  return {
    async list(schoolId) {
      const rows = await db.getAll<CategoryRow>(`SELECT ${COLUMNS} FROM categories WHERE school_id = ? ${ORDER}`, [schoolId]);
      return rows.map(toCategory);
    },
    async create(schoolId, name) {
      const clean = cleanName(name);
      return writeBatch(async (batch) => {
        const [last] = await batch.getAll<{ last: number | null }>('SELECT MAX(sort_order) AS last FROM categories WHERE school_id = ?', [schoolId]);
        return batch.write('categories', { school_id: schoolId, name: clean, sort_order: (last?.last ?? -1) + 1, active: 1 });
      });
    },
    rename: async (id, name) => update(id, { name: cleanName(name) }),
    async move(schoolId, id, direction) {
      await writeBatch(async (batch) => {
        const rows = await batch.getAll<CategoryRow>(`SELECT ${COLUMNS} FROM categories WHERE school_id = ? ${ORDER}`, [schoolId]);
        const from = rows.findIndex((row) => row.id === id);
        if (from < 0) throw new Error('category_missing');
        const to = direction === 'up' ? from - 1 : from + 1;
        if (to < 0 || to >= rows.length) return;
        [rows[from], rows[to]] = [rows[to], rows[from]];
        for (const [index, row] of rows.entries()) {
          if (row.sort_order !== index) await batch.write('categories', { id: row.id, sort_order: index });
        }
      });
    },
    setActive: async (id, active) => update(id, { active: active ? 1 : 0 }),
    async assignAthlete(athleteId, schoolId, categoryId) {
      await writeBatch(async (batch) => {
        const [row] = await batch.getAll<{ id: string }>('SELECT id FROM athlete_schools WHERE athlete_id = ? AND school_id = ?', [athleteId, schoolId]);
        if (!row) throw new Error('athlete_school_missing');
        if (categoryId !== null) {
          const [found] = await batch.getAll<CategoryRow>(`SELECT ${COLUMNS} FROM categories WHERE id = ?`, [categoryId]);
          if (!found) throw new Error('category_missing');
          if (found.school_id !== schoolId) throw new Error('category_wrong_school');
          if (found.active !== 1) throw new Error('category_inactive');
        }
        await batch.write('athlete_schools', { id: row.id, category_id: categoryId });
      });
    },
  };
}

export type InMemoryCategoriesData = { categories: Category[]; athleteSchools: AthleteSchoolRow[] };

export function createInMemoryCategoriesRepository(
  initial: InMemoryCategoriesData,
): CategoriesRepository & { athleteCategory(athleteId: string, schoolId: string): string | null } {
  const categories = initial.categories.map((category) => ({ ...category }));
  const athleteSchools = initial.athleteSchools.map((row) => ({ ...row }));
  let created = 0;
  const inSchool = (schoolId: string) => categories.filter((category) => category.schoolId === schoolId).sort(byOrder);
  const find = (id: string) => {
    const found = categories.find((category) => category.id === id);
    if (!found) throw new Error('category_missing');
    return found;
  };

  return {
    async list(schoolId) {
      return inSchool(schoolId).map((category) => ({ ...category }));
    },
    async create(schoolId, name) {
      const clean = cleanName(name);
      const id = `category-${++created}`;
      const last = Math.max(-1, ...inSchool(schoolId).map((category) => category.sortOrder));
      categories.push({ id, schoolId, name: clean, sortOrder: last + 1, active: true });
      return id;
    },
    async rename(id, name) {
      const clean = cleanName(name);
      find(id).name = clean;
    },
    async move(schoolId, id, direction) {
      const rows = inSchool(schoolId);
      const from = rows.findIndex((row) => row.id === id);
      if (from < 0) throw new Error('category_missing');
      const to = direction === 'up' ? from - 1 : from + 1;
      if (to < 0 || to >= rows.length) return;
      [rows[from], rows[to]] = [rows[to], rows[from]];
      rows.forEach((row, index) => {
        row.sortOrder = index;
      });
    },
    async setActive(id, active) {
      find(id).active = active;
    },
    async assignAthlete(athleteId, schoolId, categoryId) {
      const row = athleteSchools.find((candidate) => candidate.athleteId === athleteId && candidate.schoolId === schoolId);
      if (!row) throw new Error('athlete_school_missing');
      if (categoryId !== null) {
        const found = find(categoryId);
        if (found.schoolId !== schoolId) throw new Error('category_wrong_school');
        if (!found.active) throw new Error('category_inactive');
      }
      row.categoryId = categoryId;
    },
    athleteCategory(athleteId, schoolId) {
      return athleteSchools.find((row) => row.athleteId === athleteId && row.schoolId === schoolId)?.categoryId ?? null;
    },
  };
}
