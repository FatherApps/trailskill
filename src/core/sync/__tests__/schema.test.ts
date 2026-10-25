import { AppSchema } from '../schema';

// @powersync/react-native ships ESM only and Jest cannot load it, so the schema builders are faked.
jest.mock('@powersync/react-native', () => {
  class Table {
    localOnly: boolean;
    constructor(_columns: unknown, options: { localOnly?: boolean } = {}) {
      this.localOnly = options.localOnly === true;
    }
  }
  class Schema {
    tables: (Table & { name: string })[];
    constructor(tables: Record<string, Table>) {
      this.tables = Object.entries(tables).map(([name, table]) => Object.assign(table, { name }));
    }
  }
  return { column: { text: 'TEXT', integer: 'INTEGER' }, Schema, Table };
});

describe('AppSchema', () => {
  const byName = new Map(AppSchema.tables.map((table) => [table.name, table]));

  it('has one table per synced server table, without platform_admins', () => {
    const synced = AppSchema.tables.filter((table) => !table.localOnly).map((table) => table.name);
    expect(synced.sort()).toEqual(
      [
        'athlete_groups',
        'athlete_managers',
        'athlete_schools',
        'athletes',
        'categories',
        'coach_athlete_assignments',
        'coach_group_assignments',
        'measurements',
        'school_memberships',
        'schools',
        'timing_series',
        'training_groups',
      ].sort(),
    );
    expect(byName.has('platform_admins')).toBe(false);
  });

  it('keeps pending_writes, upload_failures and uploaded_ops local only', () => {
    expect(byName.get('pending_writes')?.localOnly).toBe(true);
    expect(byName.get('upload_failures')?.localOnly).toBe(true);
    expect(byName.get('uploaded_ops')?.localOnly).toBe(true);
    expect(AppSchema.tables).toHaveLength(15);
  });
});
