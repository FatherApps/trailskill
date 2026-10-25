-- Unticking "Completado" (issue #52) discards the completed measurement: the
-- author sets discarded_at and discarded_by on a measurement of kind
-- 'completed' of their own, once. The trail stays; nobody else discards; a
-- discard is never cleared or repeated; a discarded measurement never changes;
-- an assigned time is still never discarded; there is no delete policy. All
-- users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- Users: coach A (the author) and coach B of e1, guardian G of e1, school admin
-- S, platform admin P.
insert into auth.users (id, email) values
  ('52000000-0000-4000-8000-0000000000a1', 'coach-a@example.test'),
  ('52000000-0000-4000-8000-0000000000a2', 'coach-b@example.test'),
  ('52000000-0000-4000-8000-0000000000a3', 'guardian-g@example.test'),
  ('52000000-0000-4000-8000-0000000000a4', 'admin-s@example.test'),
  ('52000000-0000-4000-8000-0000000000a6', 'platform-p@example.test');

insert into public.schools (id, name) values ('52000000-0000-4000-8000-0000000000b1', 'Completed School One');

insert into public.school_memberships (school_id, user_id, role) values
  ('52000000-0000-4000-8000-0000000000b1', '52000000-0000-4000-8000-0000000000a1', 'coach'),
  ('52000000-0000-4000-8000-0000000000b1', '52000000-0000-4000-8000-0000000000a2', 'coach'),
  ('52000000-0000-4000-8000-0000000000b1', '52000000-0000-4000-8000-0000000000a4', 'school_admin');

insert into public.platform_admins (user_id) values ('52000000-0000-4000-8000-0000000000a6');

insert into public.athletes (id, first_name, last_name) values
  ('52000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('52000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2');
insert into public.athlete_schools (athlete_id, school_id) values
  ('52000000-0000-4000-8000-0000000000e1', '52000000-0000-4000-8000-0000000000b1'),
  ('52000000-0000-4000-8000-0000000000e2', '52000000-0000-4000-8000-0000000000b1');
insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values
  ('52000000-0000-4000-8000-0000000000a1', '52000000-0000-4000-8000-0000000000e1'),
  ('52000000-0000-4000-8000-0000000000a1', '52000000-0000-4000-8000-0000000000e2'),
  ('52000000-0000-4000-8000-0000000000a2', '52000000-0000-4000-8000-0000000000e1');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('52000000-0000-4000-8000-0000000000a3', '52000000-0000-4000-8000-0000000000e1', 'guardian');

insert into public.timing_series (id, created_by, stroke, distance, pool, session_type, device_id) values
  ('52000000-0000-4000-8000-0000000000c1', '52000000-0000-4000-8000-0000000000a1', 'FR', '50m', 'SCM', 'training', 'dev-1');

-- All by coach A, for e1. g1, g2: completed, individual. g4: a repetition (an
-- assigned time). g5: a completed measurement of a series.
insert into public.measurements
  (id, kind, athlete_id, series_id, hundredths,
   stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
select id, kind, '52000000-0000-4000-8000-0000000000e1', series, h, 'FR', '50m', 'SCM', 'training',
       'screen_button', 'dev-1', '2026-10-24 08:00:00+00', '52000000-0000-4000-8000-0000000000a1'
from (values
  ('52000000-0000-4000-8000-0000000000f1'::uuid, 'completed', null::uuid, null::int),
  ('52000000-0000-4000-8000-0000000000f2', 'completed', null, null),
  ('52000000-0000-4000-8000-0000000000f4', 'repetition', null, 3400),
  ('52000000-0000-4000-8000-0000000000f5', 'completed', '52000000-0000-4000-8000-0000000000c1', null)
) as v(id, kind, series, h);

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
set local request.jwt.claims = '{"sub": "52000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select isnt_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '52000000-0000-4000-8000-0000000000a1'
     where id = '52000000-0000-4000-8000-0000000000f1' returning id $$,
  'the author discards their completed measurement with a PATCH of the two columns'
);
select is(
  (select (discarded_at = '2026-10-25 10:00:00+00')::text || '|' || discarded_by || '|' || created_by || '|'
          || (captured_at = '2026-10-24 08:00:00+00') || '|' || kind || '|' || (hundredths is null) || '|' || version || '|'
          || hidden || '|' || (edited_by is null)
   from public.measurements where id = '52000000-0000-4000-8000-0000000000f1'),
  'true|52000000-0000-4000-8000-0000000000a1|52000000-0000-4000-8000-0000000000a1|true|completed|true|1|false|true',
  'the row stays with who and when it was made and discarded; no new version, no edit recorded, not hidden'
);
select isnt_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '52000000-0000-4000-8000-0000000000a1'
     where id = '52000000-0000-4000-8000-0000000000f1' returning id $$,
  'the same discard delivered again is a no-op that still returns the row'
);
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 11:00:00+00', discarded_by = '52000000-0000-4000-8000-0000000000a1'
     where id = '52000000-0000-4000-8000-0000000000f1' $$,
  '42501', 'a discarded measurement cannot be restored or discarded again',
  'a discarded completed measurement cannot be discarded again'
);
select throws_ok(
  $$ update public.measurements set discarded_at = null, discarded_by = null
     where id = '52000000-0000-4000-8000-0000000000f1' $$,
  '42501', 'a discarded measurement cannot be restored or discarded again',
  'a discard cannot be set back to null: ticking again writes a new measurement'
);
select throws_ok(
  $$ update public.measurements set discarded_by = '52000000-0000-4000-8000-0000000000a2'
     where id = '52000000-0000-4000-8000-0000000000f1' $$,
  '42501', 'a discarded measurement cannot be restored or discarded again',
  'nor changed to another user'
);
select throws_ok(
  $$ update public.measurements set hundredths = 3100, base_version = 1, edited_device_id = 'dev-1'
     where id = '52000000-0000-4000-8000-0000000000f1' $$,
  '42501', 'a discarded measurement cannot change',
  'a discarded completed measurement cannot be given a time'
);
select throws_ok(
  $$ update public.measurements set athlete_id = '52000000-0000-4000-8000-0000000000e2'
     where id = '52000000-0000-4000-8000-0000000000f1' $$,
  '42501', 'a discarded measurement cannot change',
  'nor moved to another athlete'
);
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '52000000-0000-4000-8000-0000000000a1',
           athlete_id = '52000000-0000-4000-8000-0000000000e2'
     where id = '52000000-0000-4000-8000-0000000000f2' $$,
  '42501', 'a discard cannot change anything else',
  'a discard cannot also move the measurement to another athlete'
);
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '52000000-0000-4000-8000-0000000000a2'
     where id = '52000000-0000-4000-8000-0000000000f2' $$,
  '42501', 'only the author can discard an unassigned arrival of a series',
  'discarded_by must be the caller'
);
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '52000000-0000-4000-8000-0000000000a1'
     where id = '52000000-0000-4000-8000-0000000000f4' $$,
  '42501', 'only the author can discard an unassigned arrival of a series',
  'an assigned time is still never discarded, not even by its author'
);
select isnt_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:05:00+00', discarded_by = '52000000-0000-4000-8000-0000000000a1'
     where id = '52000000-0000-4000-8000-0000000000f5' returning id $$,
  'the author also discards a completed measurement recorded in a series'
);

-- A failed insert is requeued as the whole current row: it may carry a discard.
select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, hundredths, discarded_at, discarded_by,
        stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
     values
       ('52000000-0000-4000-8000-0000000000f6', 'completed', '52000000-0000-4000-8000-0000000000e1', null,
        '2026-10-25 10:10:00+00', '52000000-0000-4000-8000-0000000000a1',
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-10-24 08:00:00+00',
        '52000000-0000-4000-8000-0000000000a1') $$,
  'the author inserts a completed measurement already discarded on the device'
);
select throws_ok(
  $$ insert into public.measurements
       (kind, athlete_id, hundredths, discarded_at, discarded_by,
        stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
     values
       ('completed', '52000000-0000-4000-8000-0000000000e1', null,
        '2026-10-25 10:10:00+00', '52000000-0000-4000-8000-0000000000a2',
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-10-24 08:00:00+00',
        '52000000-0000-4000-8000-0000000000a1') $$,
  '42501', 'only the author can discard an unassigned arrival of a series',
  'a completed measurement cannot be inserted discarded by someone else'
);
select is(
  (select (discarded_at is null)::text from public.measurements where id = '52000000-0000-4000-8000-0000000000f2'),
  'true',
  'the refused attempts left the other completed measurement alone'
);

-- Coach B also coaches e1, but did not write the measurement.
set local request.jwt.claims = '{"sub": "52000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '52000000-0000-4000-8000-0000000000a2'
     where id = '52000000-0000-4000-8000-0000000000f2' $$,
  '42501', 'only the author can discard an unassigned arrival of a series',
  'another coach of the athlete cannot discard the author''s completed measurement'
);

-- School admin S.
set local request.jwt.claims = '{"sub": "52000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '52000000-0000-4000-8000-0000000000a4'
     where id = '52000000-0000-4000-8000-0000000000f2' $$,
  '42501', 'only the author can discard an unassigned arrival of a series',
  'a school admin cannot discard a completed measurement'
);

-- Guardian G.
set local request.jwt.claims = '{"sub": "52000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '52000000-0000-4000-8000-0000000000a3'
     where id = '52000000-0000-4000-8000-0000000000f2' returning id $$,
  'a guardian cannot discard a completed measurement of their athlete'
);

-- Platform admin P.
set local request.jwt.claims = '{"sub": "52000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '52000000-0000-4000-8000-0000000000a6'
     where id = '52000000-0000-4000-8000-0000000000f2' returning id $$,
  'the platform admin cannot discard a completed measurement'
);

-- Anon.
reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is_empty(
  $$ update public.measurements
       set discarded_at = '2026-10-25 10:00:00+00', discarded_by = '52000000-0000-4000-8000-0000000000a1'
     where id = '52000000-0000-4000-8000-0000000000f2' returning id $$,
  'anon cannot discard a completed measurement'
);

reset role;
select set_eq(
  $$ select id from public.measurements where discarded_at is not null and id::text like '52000000-%' $$,
  $$ values ('52000000-0000-4000-8000-0000000000f1'::uuid), ('52000000-0000-4000-8000-0000000000f5'::uuid),
            ('52000000-0000-4000-8000-0000000000f6'::uuid) $$,
  'only the author''s own discards of completed measurements are stored'
);
select is((select count(*) from public.measurement_conflicts), 0::bigint, 'no discard made a conflict');

select * from finish();
rollback;
