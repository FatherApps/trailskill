import { column, Schema, Table } from '@powersync/react-native';

// PowerSync adds the `id` column to every table; it is never declared here.
const audit = { created_at: column.text, created_by: column.text };

export const AppSchema = new Schema({
  schools: new Table({ ...audit, name: column.text }),
  categories: new Table({ ...audit, school_id: column.text, name: column.text, sort_order: column.integer }),
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
    },
    { indexes: { series: ['series_id'] } },
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
