import { column, Schema, Table } from '@powersync/react-native';

// PowerSync adds the `id` column to every table; it is never declared here.
const audit = { created_at: column.text, created_by: column.text };

export const AppSchema = new Schema({
  schools: new Table({ ...audit, name: column.text }),
  categories: new Table({ ...audit, school_id: column.text, name: column.text, sort_order: column.integer, active: column.integer }),
  training_groups: new Table({ ...audit, school_id: column.text, name: column.text }),
  school_memberships: new Table({ ...audit, school_id: column.text, user_id: column.text, role: column.text, deactivated_at: column.text }),
  coach_group_assignments: new Table({ ...audit, coach_user_id: column.text, group_id: column.text }),
  coach_athlete_assignments: new Table({ ...audit, school_id: column.text, coach_user_id: column.text, athlete_id: column.text }),
  athletes: new Table({ ...audit, first_name: column.text, last_name: column.text }),
  // ended_at: the school ended the link (#1243). Guardians keep the ended row; staff never receive it.
  athlete_schools: new Table({ ...audit, athlete_id: column.text, school_id: column.text, category_id: column.text, ended_at: column.text }),
  athlete_groups: new Table({ ...audit, athlete_id: column.text, group_id: column.text }),
  adult_profiles: new Table({ first_name: column.text, last_name: column.text, contact_email: column.text }),
  athlete_managers: new Table({ ...audit, user_id: column.text, athlete_id: column.text, relation: column.text }),
  // The row that points to an athlete's current photo (issue #1221); the object itself is not synced, see athletes/useAthletePhoto.
  // trackPrevious: another device may have replaced the row (and its server id), so a PATCH or DELETE finds it by athlete_id (#1253): the connector reads it from the previous values.
  athlete_photos: new Table(
    { created_by: column.text, athlete_id: column.text, storage_path: column.text, updated_at: column.text },
    { indexes: { athlete: ['athlete_id'] }, trackPrevious: { columns: ['athlete_id'] } },
  ),
  // Birth date (YYYY-MM-DD) and gender (null, 'F', 'M' or 'undisclosed') of a swimmer, synced only to who manages them (#1366). One row per athlete, found by athlete_id like athlete_photos.
  athlete_private_details: new Table(
    { athlete_id: column.text, birth_date: column.text, gender: column.text, updated_at: column.text },
    { indexes: { athlete: ['athlete_id'] }, trackPrevious: { columns: ['athlete_id'] } },
  ),
  // The schools the owner opened the swimmer's results to (#1446). Read-only on the device: it is written only by the grant and revoke functions, and a withdrawn row (revoked_at set) leaves the stream.
  athlete_result_sharing: new Table({ athlete_id: column.text, target_school_id: column.text, granted_by: column.text, granted_at: column.text, revoked_by: column.text, revoked_at: column.text }),
  timing_series: new Table({
    ...audit,
    school_id: column.text,
    device_id: column.text,
    stroke: column.text,
    distance: column.text,
    pool: column.text,
    session_type: column.text,
  }),
  measurements: new Table(
    {
      ...audit,
      school_id: column.text,
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
      // Meters of a free mark (kind 'split'); null is unknown (#1432). Written once with the row.
      meters: column.real,
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
      // Whether the guardian reads the row (issue 1018). The server owns it; nullable: a device that has not synced it yet knows nothing.
      guardian_visible: column.integer,
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
    // SQLite has no boolean. complete is 0 while the version is being written and 1 once its blocks are all there (NULL on an old row means 1);
    // assigned is set by the server once an assignment references the version (NULL means 0) and is never written by the app.
    { ...audit, plan_id: column.text, version: column.integer, complete: column.integer, assigned: column.integer },
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
      withdrawn_at: column.text,
      withdrawn_by: column.text,
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
  // Append-only notes of a guardian or adult athlete about an assignment's plan (block_id null) or one of its blocks.
  training_plan_notices: new Table(
    {
      ...audit,
      athlete_id: column.text,
      assignment_id: column.text,
      version_id: column.text,
      block_id: column.text,
      body: column.text,
    },
    { indexes: { athlete: ['athlete_id'], assignment: ['assignment_id'] } },
  ),
  // Imported official results, their provenance and the pending differences (module results-import). Written by the server only.
  results_imports: new Table(
    { created_at: column.text, athlete_id: column.text, organization_id: column.text, provider: column.text, requested_by: column.text, requested_at: column.text },
    { indexes: { athlete: ['athlete_id'] } },
  ),
  imported_results: new Table(
    {
      created_at: column.text,
      import_id: column.text,
      athlete_id: column.text,
      provider: column.text,
      source_result_key: column.text,
      revision: column.integer,
      supersedes_id: column.text,
      stroke: column.text,
      distance: column.text,
      pool: column.text,
      // Null is a missing time, never 0.
      hundredths: column.integer,
      swum_on: column.text,
      competition: column.text,
    },
    { indexes: { athlete: ['athlete_id'] } },
  ),
  imported_result_changes: new Table(
    {
      created_at: column.text,
      imported_result_id: column.text,
      athlete_id: column.text,
      import_id: column.text,
      stroke: column.text,
      distance: column.text,
      pool: column.text,
      hundredths: column.integer,
      swum_on: column.text,
      competition: column.text,
      status: column.text,
      resolved_by: column.text,
      resolved_at: column.text,
    },
    { indexes: { athlete: ['athlete_id'] } },
  ),
  // The catalog of a results platform's tournaments (#1339), read-only reference data: the picker by city and date works offline.
  results_import_tournaments: new Table(
    {
      organization_id: column.text,
      year: column.integer,
      date_key: column.text,
      name: column.text,
      city: column.text,
      discipline: column.text,
      course: column.text,
      source_url: column.text,
      refreshed_at: column.text,
    },
    { indexes: { organization: ['organization_id'] } },
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
  // "Mis tiempos" (family-timing module): the times a guardian or adult athlete measured themselves, kept on the server for their owner.
  family_timing_measurements: new Table(
    {
      created_at: column.text,
      owner_user_id: column.text,
      captured_by: column.text,
      athlete_id: column.text,
      stroke: column.text,
      distance: column.text,
      pool: column.text,
      session_type: column.text,
      competition: column.text,
      captured_at: column.text,
      // Milliseconds; null is a missing time, never 0.
      millis: column.integer,
      // JSON array of cumulative split milliseconds.
      splits: column.text,
      // JSON array of the meters of each mark, same length as splits; numbers or null. Null column: a time saved before free laps (#1430).
      split_meters: column.text,
      official_millis: column.integer,
      official_set_at: column.text,
      // The imported official result chosen for this time when several could go with it (#974).
      official_result_key: column.text,
      source: column.text,
      // Set when deleted: hidden and restorable for 30 days, then the server removes it.
      deleted_at: column.text,
    },
    { indexes: { athlete: ['athlete_id'] } },
  ),
  // The share codes another family gave this person, kept once that family accepted a time sent with them (accounts, #1302), read-only
  // here: the server functions write them and remove them when the family changes the code. The swimmer is not synced.
  // expired_at is set while the family's code changed and the person did not remove it yet (#1320); null while the code is current.
  saved_athlete_share_codes: new Table({
    user_id: column.text,
    code: column.text,
    athlete_short_name: column.text,
    saved_at: column.text,
    expired_at: column.text,
  }),
  // A family time sent to another swimmer's family (#973), read-only here: the server functions write it. The sender and the swimmer's
  // family read it; it carries the time as it was sent, because the receiving family cannot read the sender's times.
  family_timing_transfers: new Table(
    {
      created_at: column.text,
      measurement_id: column.text,
      from_user_id: column.text,
      athlete_id: column.text,
      athlete_short_name: column.text,
      status: column.text,
      expires_at: column.text,
      decided_at: column.text,
      decided_by: column.text,
      stroke: column.text,
      distance: column.text,
      pool: column.text,
      session_type: column.text,
      competition: column.text,
      captured_at: column.text,
      // Milliseconds; null is a missing time, never 0.
      millis: column.integer,
      splits: column.text,
      split_meters: column.text,
    },
    { indexes: { measurement: ['measurement_id'], athlete: ['athlete_id'] } },
  ),
  // The same times as they were stored before #967, on this phone only. family-timing moves them to family_timing_measurements once.
  family_measurements: new Table(
    {
      created_at: column.text,
      created_by: column.text,
      athlete_id: column.text,
      stroke: column.text,
      distance: column.text,
      pool: column.text,
      session_type: column.text,
      competition: column.text,
      captured_at: column.text,
      // Milliseconds; null is a missing time, never 0.
      millis: column.integer,
      // JSON array of cumulative split milliseconds.
      splits: column.text,
      official_millis: column.integer,
      official_set_at: column.text,
    },
    { localOnly: true, indexes: { athlete: ['athlete_id'] } },
  ),
  // Which time each video recorded with the stopwatch belongs to (#1089), on this phone only: the video stays in the
  // phone's gallery and never reaches the server.
  family_timing_videos: new Table(
    {
      created_at: column.text,
      created_by: column.text,
      measurement_id: column.text,
      // The video's id in the phone's gallery.
      asset_id: column.text,
      // Milliseconds from the start of the video to the start of the clock.
      start_offset_ms: column.integer,
    },
    { localOnly: true, indexes: { measurement: ['measurement_id'] } },
  ),
  // The note on a time without a swimmer (#1300), whose time it is ("Juan, hijo de Pedro"), on this phone only: it names someone else's
  // child, so it never reaches the server. family-timing removes it once the time has a swimmer or has left this person's times.
  family_timing_notes: new Table(
    { created_at: column.text, measurement_id: column.text, note: column.text },
    { localOnly: true, indexes: { measurement: ['measurement_id'] } },
  ),
  // The photos of athletes waiting to go up (#1222), on this phone only: the image stays in documentDirectory until its object is in Storage
  // and its athlete_photos row is written; neither the queue nor the image ever syncs.
  athlete_photo_uploads: new Table({ athlete_id: column.text, local_uri: column.text }, { localOnly: true, indexes: { athlete: ['athlete_id'] } }),
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
