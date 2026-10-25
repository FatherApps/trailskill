import { AppSchema } from '../schema';

// @powersync/react-native ships ESM only and Jest cannot load it, so the schema builders are faked.
jest.mock('@powersync/react-native', () => {
  class Table {
    localOnly: boolean;
    columns: Record<string, unknown>;
    constructor(columns: Record<string, unknown>, options: { localOnly?: boolean } = {}) {
      this.columns = columns;
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
        'authorization_status',
        'authorization_texts',
        'authorizations',
        'categories',
        'coach_athlete_assignments',
        'coach_group_assignments',
        'measurements',
        'record_conflicts',
        'school_memberships',
        'school_invitations',
        'schools',
        'timing_series',
        'training_groups',
        'training_plan_blocks',
        'training_plan_versions',
        'training_plans',
      ].sort(),
    );
    expect(byName.has('platform_admins')).toBe(false);
  });

  it('keeps the edit-version columns of measurements and syncs record_conflicts', () => {
    const columnsOf = (name: string) => Object.keys((byName.get(name) as unknown as { columns: Record<string, unknown> }).columns);
    expect(columnsOf('measurements')).toEqual(
      expect.arrayContaining(['version', 'base_version', 'edited_by', 'edited_at', 'edited_device_id', 'edit_reason']),
    );
    expect(columnsOf('measurements')).not.toContain('hidden');
    expect(columnsOf('record_conflicts')).toEqual(['table_name', 'record_id', 'status']);
  });

  it('keeps pending_writes, upload_failures and uploaded_ops local only', () => {
    expect(byName.get('pending_writes')?.localOnly).toBe(true);
    expect(byName.get('upload_failures')?.localOnly).toBe(true);
    expect(byName.get('uploaded_ops')?.localOnly).toBe(true);
    expect(AppSchema.tables).toHaveLength(23);
  });
});
