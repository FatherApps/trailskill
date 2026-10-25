-- Edit conflicts on measurements (issue #55, server side). A conflict is a
-- different edit of the same existing record made without seeing the other:
-- an edit says which version it was based on (base_version); if that is not the
-- stored version and the values differ, the stored row stays as it was, both
-- versions go to measurement_conflicts, and the UPDATE still succeeds so the
-- upload queue is not blocked. New measurements are append-only and never
-- conflict. Only hundredths and athlete_id are editable. All users and data
-- here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(82);

-- Users: coaches C1 and C2 of e1, coach X of another school, school admin S,
-- guardian G, platform admin P.
insert into auth.users (id, email) values
  ('59000000-0000-4000-8000-0000000000a1', 'coach-1@example.test'),
  ('59000000-0000-4000-8000-0000000000a2', 'coach-2@example.test'),
  ('59000000-0000-4000-8000-0000000000a3', 'coach-x@example.test'),
  ('59000000-0000-4000-8000-0000000000a4', 'admin-s@example.test'),
  ('59000000-0000-4000-8000-0000000000a5', 'guardian-g@example.test'),
  ('59000000-0000-4000-8000-0000000000a6', 'platform-p@example.test');

insert into public.schools (id, name) values
  ('59000000-0000-4000-8000-0000000000b1', 'Conflict School One'),
  ('59000000-0000-4000-8000-0000000000b2', 'Conflict School Two');

insert into public.school_memberships (school_id, user_id, role) values
  ('59000000-0000-4000-8000-0000000000b1', '59000000-0000-4000-8000-0000000000a1', 'coach'),
  ('59000000-0000-4000-8000-0000000000b1', '59000000-0000-4000-8000-0000000000a2', 'coach'),
  ('59000000-0000-4000-8000-0000000000b2', '59000000-0000-4000-8000-0000000000a3', 'coach'),
  ('59000000-0000-4000-8000-0000000000b1', '59000000-0000-4000-8000-0000000000a4', 'school_admin');

insert into public.platform_admins (user_id) values ('59000000-0000-4000-8000-0000000000a6');

insert into public.athletes (id, first_name, last_name) values
  ('59000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('59000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('59000000-0000-4000-8000-0000000000e9', 'Athlete', 'E9');

insert into public.athlete_schools (athlete_id, school_id) values
  ('59000000-0000-4000-8000-0000000000e1', '59000000-0000-4000-8000-0000000000b1'),
  ('59000000-0000-4000-8000-0000000000e2', '59000000-0000-4000-8000-0000000000b1'),
  ('59000000-0000-4000-8000-0000000000e9', '59000000-0000-4000-8000-0000000000b2');

insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values
  ('59000000-0000-4000-8000-0000000000a1', '59000000-0000-4000-8000-0000000000e1'),
  ('59000000-0000-4000-8000-0000000000a2', '59000000-0000-4000-8000-0000000000e1'),
  ('59000000-0000-4000-8000-0000000000a1', '59000000-0000-4000-8000-0000000000e2'),
  ('59000000-0000-4000-8000-0000000000a3', '59000000-0000-4000-8000-0000000000e9');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('59000000-0000-4000-8000-0000000000a5', '59000000-0000-4000-8000-0000000000e1', 'guardian'),
  ('59000000-0000-4000-8000-0000000000a5', '59000000-0000-4000-8000-0000000000e2', 'guardian');

insert into public.timing_series (id, created_by, stroke, distance, pool, session_type, device_id) values
  ('59000000-0000-4000-8000-0000000000c1', '59000000-0000-4000-8000-0000000000a1', 'FR', '50m', 'SCM', 'training', 'dev-1');

-- d1: the record both coaches edit. d3 and d4: edited by the school admin.
-- d5: a hidden row. u1 to u3: unassigned arrivals of the series of C1.
insert into public.measurements
  (id, kind, athlete_id, series_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
select id, 'repetition', athlete, '59000000-0000-4000-8000-0000000000c1', h, 'FR', '50m', 'SCM', 'training',
       'screen_button', 'dev-1', '2026-10-02 08:00:00+00', '59000000-0000-4000-8000-0000000000a1'
from (values
  ('59000000-0000-4000-8000-0000000000d1'::uuid, '59000000-0000-4000-8000-0000000000e1'::uuid, 3500),
  ('59000000-0000-4000-8000-0000000000d2', '59000000-0000-4000-8000-0000000000e1', 3510),
  ('59000000-0000-4000-8000-0000000000d3', '59000000-0000-4000-8000-0000000000e1', 3520),
  ('59000000-0000-4000-8000-0000000000d4', '59000000-0000-4000-8000-0000000000e1', 3530),
  ('59000000-0000-4000-8000-0000000000f1', null, 3550),
  ('59000000-0000-4000-8000-0000000000f2', null, 3560),
  ('59000000-0000-4000-8000-0000000000f3', null, 3570),
  ('59000000-0000-4000-8000-0000000000d6', '59000000-0000-4000-8000-0000000000e1', 3580),
  ('59000000-0000-4000-8000-0000000000d7', '59000000-0000-4000-8000-0000000000e1', 3590),
  ('59000000-0000-4000-8000-0000000000d8', '59000000-0000-4000-8000-0000000000e1', 3595)
) as v(id, athlete, h);

-- d5 becomes hidden: its athlete e2 withdraws record_times, and d5 was
-- captured after that (the #54 recompute runs and must not count as an edit).
insert into public.authorization_texts (id, purpose, version, language, body) values
  ('59000000-0000-4000-8000-0000000000aa', 'record_times', 1, 'en-US', 'Synthetic record times text v1');
insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at, user_id) values
  ('59000000-0000-4000-8000-000000000101', '59000000-0000-4000-8000-0000000000e2', 'record_times',
   '59000000-0000-4000-8000-0000000000aa', '2026-10-01 08:00:00+00', '59000000-0000-4000-8000-0000000000a5');
insert into public.measurements
  (id, kind, athlete_id, series_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
values
  ('59000000-0000-4000-8000-0000000000d5', 'repetition', '59000000-0000-4000-8000-0000000000e2',
   '59000000-0000-4000-8000-0000000000c1', 3540, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1',
   '2026-10-06 08:00:00+00', '59000000-0000-4000-8000-0000000000a1');
update public.authorizations set withdrawn_at = '2026-10-05 09:00:00+00', withdrawn_by = '59000000-0000-4000-8000-0000000000a5'
  where id = '59000000-0000-4000-8000-000000000101';

-- Schema
select has_table('public', 'measurement_conflicts', 'measurement_conflicts exists');
select has_column('public', 'measurements', 'version', 'measurements has version');
select col_default_is('public', 'measurements', 'version', '1', 'version starts at 1');
select has_column('public', 'measurements', 'base_version', 'measurements has base_version');
select has_column('public', 'measurements', 'edited_by', 'measurements has edited_by');
select is_empty(
  $$ select relname from pg_class
     where relnamespace = 'public'::regnamespace and relname = 'measurement_conflicts' and not relrowsecurity $$,
  'measurement_conflicts has row level security enabled'
);
select set_eq(
  $$ select tablename::text from pg_publication_tables
     where pubname = 'powersync' and tablename = 'measurement_conflicts' $$,
  $$ values ('measurement_conflicts') $$,
  'the powersync publication includes measurement_conflicts'
);
select ok(
  has_table_privilege('authenticated', 'public.measurement_conflicts', 'select')
    and not has_table_privilege('authenticated', 'public.measurement_conflicts', 'insert')
    and not has_table_privilege('authenticated', 'public.measurement_conflicts', 'update')
    and not has_table_privilege('authenticated', 'public.measurement_conflicts', 'delete'),
  'clients can only select measurement_conflicts'
);

-- The #54 recompute is not an edit.
select is(
  (select version || '|' || hidden || '|' || (edited_by is null) || '|' || (edited_at is null)
   from public.measurements where id = '59000000-0000-4000-8000-0000000000d5'),
  '1|true|true|true',
  'the recompute that hid d5 did not bump the version nor mark an edit'
);
select is((select count(*) from public.measurement_conflicts), 0::bigint, 'and created no conflict');

set local role authenticated;

-- Coach C1 edits d1 based on the current version.
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select set_config('test.before_edit', clock_timestamp()::text, true);
select isnt_empty(
  $$ update public.measurements
       set hundredths = 3000, base_version = 1, edited_device_id = 'dev-1',
           edited_by = '59000000-0000-4000-8000-0000000000a2', version = 50
     where id = '59000000-0000-4000-8000-0000000000d1' returning id $$,
  'coach C1 edits a record based on its current version'
);
select is(
  (select hundredths || '|' || version || '|' || (base_version is null) || '|' || edited_device_id
   from public.measurements where id = '59000000-0000-4000-8000-0000000000d1'),
  '3000|2|true|dev-1',
  'the edit applies, the version goes up by one, base_version is cleared and the device is kept'
);
select is(
  (select edited_by from public.measurements where id = '59000000-0000-4000-8000-0000000000d1'),
  '59000000-0000-4000-8000-0000000000a1'::uuid,
  'the server sets edited_by to the editor, whatever the client sent'
);
select ok(
  (select edited_at >= current_setting('test.before_edit')::timestamptz
   from public.measurements where id = '59000000-0000-4000-8000-0000000000d1'),
  'the server sets edited_at'
);
select is((select count(*) from public.measurement_conflicts), 0::bigint, 'an edit on the current version creates no conflict');

-- The retry of that same edit is a no-op.
select lives_ok(
  $$ update public.measurements set hundredths = 3000, base_version = 1, edited_device_id = 'dev-1'
     where id = '59000000-0000-4000-8000-0000000000d1' $$,
  'the same edit sent again is accepted'
);
select is(
  (select version from public.measurements where id = '59000000-0000-4000-8000-0000000000d1'),
  2, 'and it does not bump the version again'
);

-- Coach C2 edits from the same base version on another device: a conflict.
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select isnt_empty(
  $$ update public.measurements
       set hundredths = 3100, base_version = 1, edited_device_id = 'dev-2', edit_reason = 'Synthetic reason'
     where id = '59000000-0000-4000-8000-0000000000d1' returning id $$,
  'a conflicting edit is not an error: the update returns the row, so the upload queue is not blocked'
);
select is(
  (select hundredths || '|' || version from public.measurements where id = '59000000-0000-4000-8000-0000000000d1'),
  '3000|2', 'the stored row is unchanged'
);
reset role;
select is((select count(*) from public.measurement_conflicts), 1::bigint, 'one conflict was recorded');
select is(
  (select current_values from public.measurement_conflicts),
  '{"hundredths": 3000, "athlete_id": "59000000-0000-4000-8000-0000000000e1", "version": 2}'::jsonb,
  'it keeps the stored version'
);
select is(
  (select incoming_values from public.measurement_conflicts),
  '{"hundredths": 3100, "athlete_id": "59000000-0000-4000-8000-0000000000e1", "edit_reason": "Synthetic reason"}'::jsonb,
  'and the incoming version'
);
select is(
  (select current_by::text || '|' || current_device || '|' || incoming_by::text || '|' || incoming_device || '|' || base_version || '|' || status
   from public.measurement_conflicts),
  '59000000-0000-4000-8000-0000000000a1|dev-1|59000000-0000-4000-8000-0000000000a2|dev-2|1|open',
  'with both authors, both devices, the base version and the open status'
);
select ok(
  (select current_at = m.edited_at and incoming_at >= current_setting('test.before_edit')::timestamptz
   from public.measurement_conflicts c join public.measurements m on m.id = c.measurement_id),
  'and both times: the stored edit time and the time of the attempt'
);

-- A retry of the conflicting upload does not pile up conflicts.
set local role authenticated;
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ update public.measurements
       set hundredths = 3100, base_version = 1, edited_device_id = 'dev-2', edit_reason = 'Synthetic reason'
     where id = '59000000-0000-4000-8000-0000000000d1' $$,
  'the conflicting upload is retried'
);
-- Same values as the stored row, from a stale base: nothing differs.
select lives_ok(
  $$ update public.measurements set hundredths = 3000, base_version = 1, edited_device_id = 'dev-2'
     where id = '59000000-0000-4000-8000-0000000000d1' $$,
  'an edit from a stale base that sets the stored values is accepted'
);
-- An edit that does not say which version it saw is treated as stale.
select lives_ok(
  $$ update public.measurements set hundredths = 3200, edited_device_id = 'dev-2'
     where id = '59000000-0000-4000-8000-0000000000d1' $$,
  'an edit without a base version is accepted'
);
reset role;
select is(
  (select count(*) from public.measurement_conflicts),
  2::bigint,
  'the retry and the same-value edit created nothing; the edit without a base version is a second conflict'
);
select is(
  (select hundredths || '|' || version from public.measurements where id = '59000000-0000-4000-8000-0000000000d1'),
  '3000|2', 'and the stored row is still unchanged'
);

-- New measurements never conflict: the same series from two devices, and
-- another coach's own measurement.
set local role authenticated;
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.measurements
       (kind, athlete_id, series_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('repetition', '59000000-0000-4000-8000-0000000000e1', '59000000-0000-4000-8000-0000000000c1', 3300,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-10-03 08:00:00+00'),
       ('repetition', '59000000-0000-4000-8000-0000000000e1', '59000000-0000-4000-8000-0000000000c1', 3310,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-3', '2026-10-03 08:00:00+00') $$,
  'the same series records new measurements from two devices'
);
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.measurements
       (kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, version, edited_by)
     values
       ('repetition', '59000000-0000-4000-8000-0000000000e1', 3320,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-2', '2026-10-03 08:00:00+00', 9, '59000000-0000-4000-8000-0000000000a1') $$,
  'another coach records a new measurement of the same athlete, sending version and edited_by'
);
reset role;
select is((select count(*) from public.measurement_conflicts), 2::bigint, 'new measurements create no conflict');
select is(
  (select count(*) from public.measurements where version <> 1 or edited_by is not null)
    - (select count(*) from public.measurements where id = '59000000-0000-4000-8000-0000000000d1'),
  0::bigint,
  'a new measurement always starts at version 1 and unedited, whatever the client sends'
);

-- Roles. Coach C1 changes a kind: not editable.
set local role authenticated;
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ update public.measurements set kind = 'race', base_version = 1
     where id = '59000000-0000-4000-8000-0000000000d2' $$,
  '42501', 'only athlete_id and hundredths can change on a measurement',
  'kind cannot be edited'
);
select throws_ok(
  $$ update public.measurements set kind = 'race', hundredths = 1, base_version = 7
     where id = '59000000-0000-4000-8000-0000000000d2' $$,
  '42501', 'only athlete_id and hundredths can change on a measurement',
  'a stale edit that also changes a kind is an error, not a conflict'
);

-- The author of an unassigned arrival edits its time, and assigns a name.
select lives_ok(
  $$ update public.measurements set hundredths = 3555, base_version = 1, edited_device_id = 'dev-1'
     where id = '59000000-0000-4000-8000-0000000000f1' $$,
  'the series author edits the time of an unassigned arrival'
);
select lives_ok(
  $$ update public.measurements set athlete_id = '59000000-0000-4000-8000-0000000000e1', base_version = 1, edited_device_id = 'dev-1'
     where id = '59000000-0000-4000-8000-0000000000f2' $$,
  'the series author assigns an athlete to an unassigned arrival'
);
select is(
  (select f1.hundredths || '|' || f1.version || '|' || f2.athlete_id::text || '|' || f2.version
   from public.measurements f1, public.measurements f2
   where f1.id = '59000000-0000-4000-8000-0000000000f1' and f2.id = '59000000-0000-4000-8000-0000000000f2'),
  '3555|2|59000000-0000-4000-8000-0000000000e1|2',
  'both edits applied'
);
-- A stale assignment of an unassigned arrival is a conflict, and still not an error.
select lives_ok(
  $$ update public.measurements set athlete_id = '59000000-0000-4000-8000-0000000000e1', base_version = 5
     where id = '59000000-0000-4000-8000-0000000000f3' $$,
  'a stale assignment of an unassigned arrival is not an error'
);
select is(
  (select athlete_id is null from public.measurements where id = '59000000-0000-4000-8000-0000000000f3'),
  true, 'the arrival stays unassigned'
);
select throws_ok(
  $$ update public.measurements set athlete_id = '59000000-0000-4000-8000-0000000000e9', base_version = 1
     where id = '59000000-0000-4000-8000-0000000000f3' $$,
  '42501', null,
  'an arrival cannot be assigned to an athlete the coach does not coach'
);

-- Coach C1 reassigning an assigned measurement to another athlete C1 coaches.
select lives_ok(
  $$ update public.measurements set athlete_id = '59000000-0000-4000-8000-0000000000e2', base_version = 1
     where id = '59000000-0000-4000-8000-0000000000d2' $$,
  'a coach moves a measurement to another athlete of the coach'
);
select is(
  (select athlete_id::text || '|' || version from public.measurements where id = '59000000-0000-4000-8000-0000000000d2'),
  '59000000-0000-4000-8000-0000000000e2|2', 'and it applies'
);

-- School admin S: only with a reason, and never the athlete.
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok(
  $$ update public.measurements set hundredths = 3600, base_version = 1
     where id = '59000000-0000-4000-8000-0000000000d3' $$,
  '42501', null,
  'a school admin cannot edit a time without a reason'
);
select throws_ok(
  $$ update public.measurements set hundredths = 3600, base_version = 1, edit_reason = '  '
     where id = '59000000-0000-4000-8000-0000000000d3' $$,
  '42501', null,
  'nor with a blank reason'
);
select lives_ok(
  $$ update public.measurements set hundredths = 3600, base_version = 1, edit_reason = 'Synthetic correction', edited_device_id = 'dev-s'
     where id = '59000000-0000-4000-8000-0000000000d3' $$,
  'a school admin edits a time with a reason'
);
select is(
  (select hundredths || '|' || version || '|' || edit_reason || '|' || edited_by::text from public.measurements
   where id = '59000000-0000-4000-8000-0000000000d3'),
  '3600|2|Synthetic correction|59000000-0000-4000-8000-0000000000a4',
  'the correction keeps its reason and its editor'
);
select throws_ok(
  $$ update public.measurements set athlete_id = '59000000-0000-4000-8000-0000000000e2', base_version = 1, edit_reason = 'Synthetic move'
     where id = '59000000-0000-4000-8000-0000000000d4' $$,
  '42501', null,
  'a school admin cannot change the athlete of a measurement'
);

-- Users who cannot edit.
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is_empty(
  $$ update public.measurements set hundredths = 1234, base_version = 1
     where id = '59000000-0000-4000-8000-0000000000d4' returning id $$,
  'a coach of another school edits nothing'
);
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is_empty(
  $$ update public.measurements set hundredths = 1234, base_version = 1
     where id = '59000000-0000-4000-8000-0000000000d4' returning id $$,
  'a guardian cannot edit a measurement, so an error report is never an edit'
);
reset role;
select is(
  (select hundredths || '|' || version from public.measurements where id = '59000000-0000-4000-8000-0000000000d4'),
  '3530|1', 'and the record is unchanged'
);
select is((select count(*) from public.measurement_conflicts), 3::bigint, 'and no conflict was created');

-- A hidden row is not visible to the coach, so it cannot be edited.
set local role authenticated;
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is_empty(
  $$ update public.measurements set hundredths = 1234, base_version = 1
     where id = '59000000-0000-4000-8000-0000000000d5' returning id $$,
  'a coach cannot edit a measurement hidden after a withdrawal'
);

-- measurement_conflicts: who reads it, and nobody writes it.
select is((select count(*) from public.measurement_conflicts), 3::bigint, 'coach C1 reads the conflicts of the stored version and the one C1 sent');
select throws_ok(
  $$ insert into public.measurement_conflicts (measurement_id, current_values, incoming_values)
     values ('59000000-0000-4000-8000-0000000000d1', '{}', '{}') $$,
  '42501', null, 'a client cannot insert a conflict'
);
select throws_ok(
  $$ update public.measurement_conflicts set status = 'resolved' $$,
  '42501', null, 'a client cannot update a conflict'
);
select throws_ok(
  $$ delete from public.measurement_conflicts $$,
  '42501', null, 'a client cannot delete a conflict'
);
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is((select count(*) from public.measurement_conflicts), 2::bigint, 'coach C2 reads the conflicts C2 sent');
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is_empty('select 1 from public.measurement_conflicts', 'an unrelated coach reads no conflict');
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is_empty('select 1 from public.measurement_conflicts', 'the school admin reads no conflict');
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is_empty('select 1 from public.measurement_conflicts', 'the guardian reads no conflict');
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is((select count(*) from public.measurement_conflicts), 3::bigint, 'the platform admin reads every conflict');
reset role;

-- Edits that did see each other. Offline, a device only knows the version it
-- last synced, so its second edit still says base_version 1.
set local role authenticated;
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ update public.measurements set hundredths = 3001, base_version = 1, edited_device_id = 'dev-1'
     where id = '59000000-0000-4000-8000-0000000000d6' $$,
  'the first offline edit of a device applies'
);
select lives_ok(
  $$ update public.measurements set hundredths = 3002, base_version = 1, edited_device_id = 'dev-1'
     where id = '59000000-0000-4000-8000-0000000000d6' $$,
  'the second edit of the same user on the same device, still based on version 1, applies too'
);
select is(
  (select hundredths || '|' || version from public.measurements where id = '59000000-0000-4000-8000-0000000000d6'),
  '3002|3', 'both applied: version 3'
);
select is((select count(*) from public.measurement_conflicts), 3::bigint, 'and neither made a conflict');
-- The same user on another device did not see that edit.
select lives_ok(
  $$ update public.measurements set hundredths = 3003, base_version = 1, edited_device_id = 'dev-9'
     where id = '59000000-0000-4000-8000-0000000000d6' $$,
  'the same user on a different device, with a stale base, is not an error'
);
select is((select count(*) from public.measurement_conflicts), 4::bigint, 'but it is a conflict');
-- Another user on a device with the same id string did not see it either.
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ update public.measurements set hundredths = 3004, base_version = 1, edited_device_id = 'dev-1'
     where id = '59000000-0000-4000-8000-0000000000d6' $$,
  'another user on a device with the same id, with a stale base, is not an error'
);
reset role;
select is((select count(*) from public.measurement_conflicts), 5::bigint, 'it is a conflict too');

-- A reason belongs to the edit that sent it: after an admin correction with a
-- reason, a coach edit without one does not inherit it.
set local role authenticated;
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select lives_ok(
  $$ update public.measurements set hundredths = 3591, base_version = 1, edit_reason = 'Admin reason', edited_device_id = 'dev-s'
     where id = '59000000-0000-4000-8000-0000000000d7' $$,
  'a school admin corrects a time with a reason'
);
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ update public.measurements set hundredths = 3592, base_version = 2, edited_device_id = 'dev-1'
     where id = '59000000-0000-4000-8000-0000000000d7' $$,
  'a coach edits it without a reason'
);
select is(
  (select version || '|' || (edit_reason is null) || '|' || edited_by::text from public.measurements
   where id = '59000000-0000-4000-8000-0000000000d7'),
  '3|true|59000000-0000-4000-8000-0000000000a1',
  'the new version has no reason and its editor is the coach'
);

-- Invalid values never reach a conflict.
select throws_ok(
  $$ update public.measurements set hundredths = 0, base_version = 1, edited_device_id = 'dev-1'
     where id = '59000000-0000-4000-8000-0000000000d7' $$,
  '23514', null, 'a stale edit with a time of 0 is refused'
);
select throws_ok(
  $$ update public.measurements set hundredths = -5, base_version = 3, edited_device_id = 'dev-1'
     where id = '59000000-0000-4000-8000-0000000000d7' $$,
  '23514', null, 'and so is a negative one'
);

-- A conflict stops being readable by its authors once the measurement is hidden.
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ update public.measurements set hundredths = 3596, base_version = 1, edited_device_id = 'dev-1'
     where id = '59000000-0000-4000-8000-0000000000d8' $$,
  'coach C1 edits d8'
);
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ update public.measurements set hundredths = 3597, base_version = 1, edited_device_id = 'dev-2'
     where id = '59000000-0000-4000-8000-0000000000d8' $$,
  'coach C2 edits d8 from the same base'
);
select is(
  (select count(*) from public.measurement_conflicts where measurement_id = '59000000-0000-4000-8000-0000000000d8'),
  1::bigint, 'both coaches read the conflict while d8 is visible'
);
reset role;
insert into public.authorizations
  (id, athlete_id, purpose, text_id, accepted_at, user_id, withdrawn_at, withdrawn_by, withdrawal_received_at)
values
  ('59000000-0000-4000-8000-000000000102', '59000000-0000-4000-8000-0000000000e1', 'record_times',
   '59000000-0000-4000-8000-0000000000aa', '2026-10-01 08:00:00+00', '59000000-0000-4000-8000-0000000000a5',
   '2026-10-01 12:00:00+00', '59000000-0000-4000-8000-0000000000a5', clock_timestamp());
select is((select hidden from public.measurements where id = '59000000-0000-4000-8000-0000000000d8'), true, 'd8 is now hidden');
set local role authenticated;
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is_empty(
  $$ select 1 from public.measurement_conflicts where measurement_id = '59000000-0000-4000-8000-0000000000d8' $$,
  'coach C1 no longer reads the conflict of a hidden measurement'
);
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty(
  $$ select 1 from public.measurement_conflicts where measurement_id = '59000000-0000-4000-8000-0000000000d8' $$,
  'nor does coach C2'
);
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is(
  (select count(*) from public.measurement_conflicts where measurement_id = '59000000-0000-4000-8000-0000000000d8'),
  1::bigint, 'the platform admin still reads it'
);
reset role;

select * from finish();
rollback;
