import { AppSchema } from '../schema';

// @powersync/react-native ships ESM only and Jest cannot load it, so the schema builders are faked.
jest.mock('@powersync/react-native', () => {
  class Table {
    localOnly: boolean;
    columns: Record<string, unknown>;
    trackPrevious?: unknown;
    constructor(columns: Record<string, unknown>, options: { localOnly?: boolean; trackPrevious?: unknown } = {}) {
      this.columns = columns;
      this.trackPrevious = options.trackPrevious;
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
        'adult_profiles',
        'athlete_groups',
        'athlete_managers',
        'athlete_photos',
        'athlete_schools',
        'athletes',
        'authorization_status',
        'authorization_texts',
        'authorizations',
        'categories',
        'coach_athlete_assignments',
        'coach_group_assignments',
        'family_timing_measurements',
        'family_timing_transfers',
        'imported_result_changes',
        'imported_results',
        'measurements',
        'record_conflicts',
        'results_import_tournaments',
        'results_imports',
        'saved_athlete_share_codes',
        'school_memberships',
        'school_invitations',
        'schools',
        'timing_series',
        'training_groups',
        'training_plan_assignments',
        'training_plan_blocks',
        'training_plan_fulfillments',
        'training_plan_notices',
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

  it('tracks the athlete of athlete_photos before a change, so a PATCH or DELETE finds the row by athlete_id (#1253), and no other table', () => {
    const tracked = (AppSchema.tables as unknown as { name: string; trackPrevious?: unknown }[]).filter((table) => table.trackPrevious);
    expect(tracked.map((table) => table.name)).toEqual(['athlete_photos']);
    expect(tracked[0].trackPrevious).toEqual({ columns: ['athlete_id'] });
  });

  it('syncs the deactivation stamp of school memberships', () => {
    const columns = (byName.get('school_memberships') as unknown as { columns: Record<string, unknown> }).columns;
    expect(Object.keys(columns)).toContain('deactivated_at');
  });

  it('syncs the active flag of categories', () => {
    const columns = (byName.get('categories') as unknown as { columns: Record<string, unknown> }).columns;
    expect(Object.keys(columns)).toContain('active');
  });

  it('keeps pending_writes, upload_failures, uploaded_ops, family_measurements, family_timing_videos, family_timing_notes and athlete_photo_uploads local only', () => {
    expect(byName.get('pending_writes')?.localOnly).toBe(true);
    expect(byName.get('upload_failures')?.localOnly).toBe(true);
    expect(byName.get('uploaded_ops')?.localOnly).toBe(true);
    expect(byName.get('family_measurements')?.localOnly).toBe(true);
    expect(byName.get('family_timing_videos')?.localOnly).toBe(true);
    expect(byName.get('family_timing_notes')?.localOnly).toBe(true);
    expect(byName.get('athlete_photo_uploads')?.localOnly).toBe(true);
    expect(AppSchema.tables).toHaveLength(39);
  });
});
