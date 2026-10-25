import { column, Schema, Table } from '@powersync/react-native';

// PowerSync adds the `id` column to every table; it is never declared here.
const audit = { created_at: column.text, created_by: column.text };

export const AppSchema = new Schema({
  schools: new Table({ ...audit, name: column.text }),
  categories: new Table({ ...audit, school_id: column.text, name: column.text, sort_order: column.integer, active: column.integer }),
  training_groups: new Table({ ...audit, school_id: column.text, name: column.text }),
  school_memberships: new Table({ ...audit, school_id: column.text, user_id: column.text, role: column.text }),
  coach_group_assignments: new Table({ ...audit, coach_user_id: column.text, group_id: column.text }),
  coach_athlete_assignments: new Table({ ...audit, coach_user_id: column.text, athlete_id: column.text }),
  athletes: new Table({ ...audit, first_name: column.text, last_name: column.text }),
  athlete_schools: new Table({ ...audit, athlete_id: column.text, school_id: column.text, category_id: column.text }),
  athlete_groups: new Table({ ...audit, athlete_id: column.text, group_id: column.text }),
  athlete_managers: new Table({ ...audit, user_id: column.text, athlete_id: column.text, relation: column.text }),
  timing_series: new Table({
    ...audit,
    device_id: column.text,
    stroke: column.text,
    distance: column.text,
    pool: column.text,
    session_type: column.text,
  }),
  measurements: new Table(
    {
      ...audit,
      device_id: column.text,
      kind: column.text,
      athlete_id: column.text,
      series_id: column.text,
      arrival_position: column.integer,
      hundredths: column.integer,
      stroke: column.text,
      distance: column.text,
      pool: column.text,
      session_type: column.text,
      source: column.text,
      captured_at: column.text,
      parent_id: column.text,
      // Edit versioning (issue #55): the server bumps `version`; the device sends `base_version`, `edited_device_id` and `edit_reason` with an edit.
      version: column.integer,
      base_version: column.integer,
      edited_by: column.text,
      edited_at: column.text,
      edited_device_id: column.text,
      edit_reason: column.text,
      // "Deshacer última" (issue #50): the author discards an unassigned series arrival once; the row stays and every read leaves it out.
      discarded_at: column.text,
      discarded_by: column.text,
    },
    { indexes: { series: ['series_id'] } },
  ),
  // One row per edit conflict of any table (task 3.9a); a record with an open one shows "Revisar".
  record_conflicts: new Table(
    { table_name: column.text, record_id: column.text, status: column.text },
    { indexes: { record: ['table_name', 'record_id'] } },
  ),
  training_plans: new Table(
    // SQLite has no boolean: is_template is 1 for a school template, 0 otherwise.
    { ...audit, school_id: column.text, name: column.text, is_template: column.integer },
    { indexes: { school: ['school_id'] } },
  ),
  training_plan_versions: new Table(
    { ...audit, plan_id: column.text, version: column.integer },
    { indexes: { plan: ['plan_id'] } },
  ),
  training_plan_blocks: new Table(
    {
      ...audit,
      version_id: column.text,
      position: column.integer,
      repetitions: column.integer,
      distance: column.text,
      stroke: column.text,
      drill: column.text,
      // PowerSync syncs a Postgres array as JSON array text.
      equipment: column.text,
      send_off_seconds: column.integer,
      phase: column.text,
      recording: column.text,
    },
    { indexes: { version: ['version_id'] } },
  ),
  training_plan_assignments: new Table(
    {
      ...audit,
      school_id: column.text,
      plan_id: column.text,
      version_id: column.text,
      session_date: column.text,
      target: column.text,
      athlete_id: column.text,
      group_id: column.text,
      category_id: column.text,
    },
    { indexes: { version: ['version_id'], school: ['school_id'] } },
  ),
  // Append-only marks, one new row per mark.
  training_plan_fulfillments: new Table(
    {
      ...audit,
      device_id: column.text,
      assignment_id: column.text,
      version_id: column.text,
      block_id: column.text,
      athlete_id: column.text,
      status: column.text,
      completed_repetitions: column.integer,
      series_id: column.text,
      captured_at: column.text,
      // SQLite has no boolean: hidden is 1 for a mark stored after an authorization withdrawal, 0 otherwise.
      hidden: column.integer,
    },
    { indexes: { assignment: ['assignment_id'], block: ['block_id'] } },
  ),
  authorization_texts: new Table({
    ...audit,
    purpose: column.text,
    version: column.integer,
    language: column.text,
    body: column.text,
  }),
  authorizations: new Table({
    created_at: column.text,
    user_id: column.text,
    athlete_id: column.text,
    purpose: column.text,
    text_id: column.text,
    accepted_at: column.text,
    received_at: column.text,
    withdrawn_at: column.text,
    withdrawn_by: column.text,
    withdrawal_received_at: column.text,
  }),
  authorization_status: new Table({
    athlete_id: column.text,
    purpose: column.text,
    // SQLite has no boolean: 1 granted, 0 not granted.
    is_granted: column.integer,
    updated_at: column.text,
  }),
  school_invitations: new Table({
    created_at: column.text,
    created_by: column.text,
    school_id: column.text,
    group_id: column.text,
    token: column.text,
    expires_at: column.text,
    revoked_at: column.text,
  }),
  pending_writes: new Table(
    { table_name: column.text, record_id: column.text },
    { localOnly: true, indexes: { record: ['table_name', 'record_id'] } },
  ),
  upload_failures: new Table(
    {
      table_name: column.text,
      record_id: column.text,
      op: column.text,
      payload: column.text,
      error_code: column.text,
      failed_at: column.text,
      // The op's queue number; the order key when two failures share a failed_at.
      client_id: column.integer,
    },
    { localOnly: true },
  ),
  // Ops whose bookkeeping is already done, so a re-sent transaction (crash before complete()) does not repeat it.
  uploaded_ops: new Table({ client_id: column.integer }, { localOnly: true }),
});

export type Database = (typeof AppSchema)['types'];
