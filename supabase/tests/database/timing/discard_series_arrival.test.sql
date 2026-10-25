-- Undoing a series arrival (issue #50) discards it: the author sets discarded_at
-- and discarded_by on an arrival of their own series while it is unassigned,
-- once. An assigned arrival or an individual time is never discarded, a discard
-- is never cleared or changed, and nobody else discards. A discard is not an
-- edit: no new version, no conflict (#55), not hidden (#54), and its retry is a
-- no-op that still returns the row. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- Users: coach A (the author) and coach B of e1, guardian G of e1, school admin
-- S, platform admin P.
insert into auth.users (id, email) values
  ('50000000-0000-4000-8000-0000000000a1', 'coach-a@example.test'),
  ('50000000-0000-4000-8000-0000000000a2', 'coach-b@example.test'),
  ('50000000-0000-4000-8000-0000000000a3', 'guardian-g@example.test'),
  ('50000000-0000-4000-8000-0000000000a4', 'admin-s@example.test'),
  ('50000000-0000-4000-8000-0000000000a6', 'platform-p@example.test');

insert into public.schools (id, name) values ('50000000-0000-4000-8000-0000000000b1', 'Undo School One');

insert into public.school_memberships (school_id, user_id, role) values
  ('50000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000a1', 'coach'),
  ('50000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000a2', 'coach'),
  ('50000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000a4', 'school_admin');

insert into public.platform_admins (user_id) values ('50000000-0000-4000-8000-0000000000a6');

insert into public.athletes (id, first_name, last_name) values ('50000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1');
insert into public.athlete_schools (athlete_id, school_id) values
  ('50000000-0000-4000-8000-0000000000e1', '50000000-0000-4000-8000-0000000000b1');
insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values
  ('50000000-0000-4000-8000-0000000000a1', '50000000-0000-4000-8000-0000000000e1'),
  ('50000000-0000-4000-8000-0000000000a2', '50000000-0000-4000-8000-0000000000e1');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('50000000-0000-4000-8000-0000000000a3', '50000000-0000-4000-8000-0000000000e1', 'guardian');

insert into public.timing_series (school_id, id, created_by, stroke, distance, pool, session_type, device_id) values
  ('50000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000c1', '50000000-0000-4000-8000-0000000000a1', 'FR', '50m', 'SCM', 'training', 'dev-1');

-- All by coach A. f1, f2, f5: unassigned arrivals of A's series. f3: an
-- assigned arrival. f4: an individual time (no series; an unassigned row
-- outside a series is refused by the insert policy).
insert into public.measurements
  (school_id, id, kind, athlete_id, series_id, arrival_position, hundredths,
   stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
select '50000000-0000-4000-8000-0000000000b1'::uuid, id, 'repetition', athlete, series, pos, h, 'FR', '50m', 'SCM', 'training',
       'screen_button', 'dev-1', '2026-10-24 08:00:00+00', '50000000-0000-4000-8000-0000000000a1'
from (values
  ('50000000-0000-4000-8000-0000000000f1'::uuid, null::uuid, '50000000-0000-4000-8000-0000000000c1'::uuid, 1, 3100),
  ('50000000-0000-4000-8000-0000000000f2', null, '50000000-0000-4000-8000-0000000000c1', 2, 3200),
  ('50000000-0000-4000-8000-0000000000f3', '50000000-0000-4000-8000-0000000000e1', '50000000-0000-4000-8000-0000000000c1', 3, 3300),
  ('50000000-0000-4000-8000-0000000000f4', '50000000-0000-4000-8000-0000000000e1', null, null, 3400),
  ('50000000-0000-4000-8000-0000000000f5', null, '50000000-0000-4000-8000-0000000000c1', 5, 3500)
) as v(id, athlete, series, pos, h);

-- Schema
select col_type_is('public', 'measurements', 'discarded_at', 'timestamp with time zone', 'measurements has discarded_at');
select col_type_is('public', 'measurements', 'discarded_by', 'uuid', 'measurements has discarded_by');
select set_eq(
  $$ select policyname::text, cmd, roles::text from pg_policies
     where schemaname = 'public' and tablename = 'measurements' $$,
  $$ values ('measurements_select', 'SELECT', '{authenticated}'),
            ('measurements_insert', 'INSERT', '{authenticated}'),
            ('measurements_update', 'UPDATE', '{authenticated}') $$,
  'measurements policies are unchanged: still no delete policy'
);

set local role authenticated;

-- Coach A, the author.
set local request.jwt.claims = '{"sub": "50000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select isnt_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a1'
     where id = '50000000-0000-4000-8000-0000000000f1' returning id $$,
  'the author discards an unassigned arrival of their series with a PATCH of the two columns'
);
select is(
  (select (discarded_at = '2026-10-25 10:00:00+00')::text || '|' || discarded_by || '|' || version || '|'
          || hidden || '|' || (edited_by is null)
   from public.measurements where id = '50000000-0000-4000-8000-0000000000f1'),
  'true|50000000-0000-4000-8000-0000000000a1|1|false|true',
  'it keeps who and when; no new version, no edit recorded, not hidden'
);
select isnt_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a1'
     where id = '50000000-0000-4000-8000-0000000000f1' returning id $$,
  'the same discard delivered again is a no-op that still returns the row'
);
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 11:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a1'
     where id = '50000000-0000-4000-8000-0000000000f1' $$,
  '42501', 'a discarded measurement cannot be restored or discarded again',
  'a discarded arrival cannot be discarded again'
);
select throws_ok(
  $$ update public.measurements set discarded_at = null, discarded_by = null
     where id = '50000000-0000-4000-8000-0000000000f1' $$,
  '42501', 'a discarded measurement cannot be restored or discarded again',
  'a discard cannot be set back to null'
);
select throws_ok(
  $$ update public.measurements set discarded_by = '50000000-0000-4000-8000-0000000000a2'
     where id = '50000000-0000-4000-8000-0000000000f1' $$,
  '42501', 'a discarded measurement cannot be restored or discarded again',
  'nor changed'
);
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a1'
     where id = '50000000-0000-4000-8000-0000000000f3' $$,
  '42501', 'only the author can discard an unassigned arrival of a series',
  'the author cannot discard an assigned arrival'
);
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a1'
     where id = '50000000-0000-4000-8000-0000000000f4' $$,
  '42501', 'only the author can discard an unassigned arrival of a series',
  'nor an individual time'
);
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a2'
     where id = '50000000-0000-4000-8000-0000000000f2' $$,
  '42501', 'only the author can discard an unassigned arrival of a series',
  'discarded_by must be the caller'
);
select throws_ok(
  $$ update public.measurements set discarded_at = '2026-10-25 10:00:00+00'
     where id = '50000000-0000-4000-8000-0000000000f2' $$,
  '42501', null,
  'a discard with discarded_at alone fails'
);
select throws_ok(
  $$ update public.measurements set discarded_by = '50000000-0000-4000-8000-0000000000a1'
     where id = '50000000-0000-4000-8000-0000000000f2' $$,
  '23514', null,
  'a discard with discarded_by alone fails'
);
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a1', hundredths = 3201
     where id = '50000000-0000-4000-8000-0000000000f2' $$,
  '42501', 'a discard cannot change anything else',
  'a discard cannot also edit the time, so it never meets the conflict check'
);
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a1', stroke = 'BK'
     where id = '50000000-0000-4000-8000-0000000000f2' $$,
  '42501', 'only athlete_id and hundredths can change on a measurement',
  'nor change any other column'
);
select throws_ok(
  $$ update public.measurements set stroke = 'BK' where id = '50000000-0000-4000-8000-0000000000f1' $$,
  '42501', 'only athlete_id and hundredths can change on a measurement',
  'the column rule still holds on a discarded arrival'
);
select throws_ok(
  $$ update public.measurements set series_id = null where id = '50000000-0000-4000-8000-0000000000f1' $$,
  '42501', 'only athlete_id and hundredths can change on a measurement',
  'a discarded arrival cannot leave its series'
);
select throws_ok(
  $$ update public.measurements set athlete_id = '50000000-0000-4000-8000-0000000000e1'
     where id = '50000000-0000-4000-8000-0000000000f1' $$,
  '42501', 'a discarded measurement cannot change',
  'a discarded arrival cannot be assigned afterwards'
);
select throws_ok(
  $$ update public.measurements set hundredths = 3101, base_version = 1, edited_device_id = 'dev-1'
     where id = '50000000-0000-4000-8000-0000000000f1' $$,
  '42501', 'a discarded measurement cannot change',
  'nor have its time edited'
);
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a1',
           athlete_id = '50000000-0000-4000-8000-0000000000e1'
     where id = '50000000-0000-4000-8000-0000000000f1' $$,
  '42501', 'a discarded measurement cannot change',
  'nor assigned by a PATCH that repeats the same discard'
);
select is(
  (select (athlete_id is null)::text || '|' || hundredths || '|' || version
   from public.measurements where id = '50000000-0000-4000-8000-0000000000f1'),
  'true|3100|1',
  'the discarded arrival is unchanged'
);
select isnt_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a1'
     where id = '50000000-0000-4000-8000-0000000000f1' returning id $$,
  'the identical discard retry still returns the row'
);
select throws_ok(
  $$ update public.measurements set created_by = '50000000-0000-4000-8000-0000000000a2'
     where id = '50000000-0000-4000-8000-0000000000f2' $$,
  '42501', 'only athlete_id and hundredths can change on a measurement',
  'the column rule still holds on an arrival that is not discarded'
);
select throws_ok(
  $$ update public.measurements set captured_at = '2026-10-24 09:00:00+00'
     where id = '50000000-0000-4000-8000-0000000000f3' $$,
  '42501', 'only athlete_id and hundredths can change on a measurement',
  'and on an assigned measurement'
);

-- An edited arrival is discarded from the device's PATCH, which carries no
-- base_version: no conflict, and the edit stays.
select lives_ok(
  $$ update public.measurements set hundredths = 3501, base_version = 1, edited_device_id = 'dev-1'
     where id = '50000000-0000-4000-8000-0000000000f5' $$,
  'the author edits an unassigned arrival'
);
select isnt_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:05:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a1'
     where id = '50000000-0000-4000-8000-0000000000f5' returning id $$,
  'and then discards it'
);
select is(
  (select hundredths || '|' || version || '|' || edited_device_id || '|' || (discarded_at is not null)
   from public.measurements where id = '50000000-0000-4000-8000-0000000000f5'),
  '3501|2|dev-1|true',
  'the discard keeps the edit and its version'
);

-- confirm_measurement_insert (#206) for a re-sent insert of a discarded arrival.
select is(
  public.confirm_measurement_insert(
    '{"id": "50000000-0000-4000-8000-0000000000f1", "kind": "repetition", "hundredths": 3100,
      "series_id": "50000000-0000-4000-8000-0000000000c1", "arrival_position": 1}'),
  'stored',
  'a re-sent insert without the discard columns is confirmed as stored'
);
select is(
  public.confirm_measurement_insert(
    '{"id": "50000000-0000-4000-8000-0000000000f1", "kind": "repetition", "hundredths": 3100,
      "discarded_at": "2026-10-25T10:00:00+00:00", "discarded_by": "50000000-0000-4000-8000-0000000000a1"}'),
  'stored',
  'a requeued insert carrying the same discard is confirmed as stored'
);

-- A failed insert is requeued as the whole current row: it may carry a discard.
select lives_ok(
  $$ insert into public.measurements
       (school_id, id, kind, athlete_id, series_id, arrival_position, hundredths, discarded_at, discarded_by,
        stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('50000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000f6', 'repetition', null, '50000000-0000-4000-8000-0000000000c1', 6, 3600,
        '2026-10-25 10:10:00+00', '50000000-0000-4000-8000-0000000000a1',
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-10-24 08:00:00+00') $$,
  'the author inserts an unassigned arrival already discarded on the device'
);
select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, hundredths, discarded_at, discarded_by,
        stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('50000000-0000-4000-8000-0000000000b1', 'repetition', '50000000-0000-4000-8000-0000000000e1', 3700,
        '2026-10-25 10:10:00+00', '50000000-0000-4000-8000-0000000000a1',
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-10-24 08:00:00+00') $$,
  '42501', 'only the author can discard an unassigned arrival of a series',
  'an assigned measurement cannot be inserted discarded'
);
select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, series_id, arrival_position, hundredths, discarded_at, discarded_by,
        stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('50000000-0000-4000-8000-0000000000b1', 'repetition', null, '50000000-0000-4000-8000-0000000000c1', 7, 3700,
        '2026-10-25 10:10:00+00', '50000000-0000-4000-8000-0000000000a2',
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-10-24 08:00:00+00') $$,
  '42501', 'only the author can discard an unassigned arrival of a series',
  'nor with someone else as the one who discarded it'
);

-- Coach B also coaches e1.
set local request.jwt.claims = '{"sub": "50000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a2'
     where id = '50000000-0000-4000-8000-0000000000f2' returning id $$,
  'another coach cannot discard the author''s unassigned arrival'
);
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a2'
     where id = '50000000-0000-4000-8000-0000000000f3' $$,
  '42501', 'only the author can discard an unassigned arrival of a series',
  'nor a measurement of an athlete that coach can edit'
);

-- School admin S.
set local request.jwt.claims = '{"sub": "50000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a4'
     where id = '50000000-0000-4000-8000-0000000000f2' returning id $$,
  'a school admin cannot discard an unassigned arrival'
);
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a4'
     where id = '50000000-0000-4000-8000-0000000000f3' $$,
  '42501', 'only the author can discard an unassigned arrival of a series',
  'nor a measurement of the school'
);

-- Guardian G.
set local request.jwt.claims = '{"sub": "50000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a3'
     where id = '50000000-0000-4000-8000-0000000000f2' returning id $$,
  'a guardian cannot discard an unassigned arrival'
);
select is_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a3'
     where id = '50000000-0000-4000-8000-0000000000f3' returning id $$,
  'nor a measurement of their athlete'
);

-- Platform admin P.
set local request.jwt.claims = '{"sub": "50000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a6'
     where id = '50000000-0000-4000-8000-0000000000f2' returning id $$,
  'the platform admin cannot discard an arrival'
);

-- Anon.
reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '50000000-0000-4000-8000-0000000000a1'
     where id = '50000000-0000-4000-8000-0000000000f2' returning id $$,
  'anon cannot discard an arrival'
);

reset role;
select set_eq(
  $$ select id from public.measurements where discarded_at is not null and id::text like '50000000-%' $$,
  $$ values ('50000000-0000-4000-8000-0000000000f1'::uuid), ('50000000-0000-4000-8000-0000000000f5'::uuid),
            ('50000000-0000-4000-8000-0000000000f6'::uuid) $$,
  'only the author''s own discards are stored'
);
select is((select count(*) from public.measurement_conflicts), 0::bigint, 'no discard made a conflict');

-- Without a signed-in user (the owner, the service role) the discard rules do not apply.
set local request.jwt.claims = '{}';
select lives_ok(
  $$ update public.measurements set hundredths = 3105 where id = '50000000-0000-4000-8000-0000000000f1' $$,
  'the owner can still correct a discarded arrival'
);
select is(
  (select hundredths from public.measurements where id = '50000000-0000-4000-8000-0000000000f1'),
  3105,
  'and the correction is stored'
);

select * from finish();
rollback;
