import { db } from '../../../core/sync';

export type SchoolName = { id: string; name: string };

export interface SchoolNameRepository {
  /** The schools with those ids that are on the device, by name then id; unknown ids are ignored. Local database only. */
  listByIds(ids: readonly string[]): Promise<SchoolName[]>;
}

export function createPowerSyncSchoolNameRepository(): SchoolNameRepository {
  return {
    // The ids travel as one JSON text, so their number never reaches SQLite's parameter limit.
    async listByIds(ids) {
      return db.getAll<SchoolName>('SELECT id AS id, name AS name FROM schools WHERE id IN (SELECT value FROM json_each(?)) ORDER BY name, id', [
        JSON.stringify(ids),
      ]);
    },
  };
}

export function createInMemorySchoolNameRepository(rows: SchoolName[]): SchoolNameRepository {
  return {
    async listByIds(ids) {
      return rows.filter((row) => ids.includes(row.id)).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1));
    },
  };
}
