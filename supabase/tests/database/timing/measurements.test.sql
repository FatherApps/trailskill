-- Timing measurements and series: the five kinds, no 0 for a missing time,
-- author and device on every row, and who reads and writes them. Coaches
-- write their assigned athletes, unassigned arrivals belong to the series
-- author, guardians read only, school admins read their school. A coach who
-- loses an assignment can no longer write that athlete's measurements. All
-- users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- Users: coaches A and B, guardian G, school admin S.
insert into auth.users (id, email) values
  ('20000000-0000-4000-8000-0000000000a1', 'coach-a@example.test'),
  ('20000000-0000-4000-8000-0000000000a2', 'coach-b@example.test'),
  ('20000000-0000-4000-8000-0000000000a3', 'guardian-g@example.test'),
  ('20000000-0000-4000-8000-0000000000a4', 'admin-s@example.test');

insert into public.schools (id, name) values
  ('20000000-0000-4000-8000-0000000000b1', 'Timing School One'),
  ('20000000-0000-4000-8000-0000000000b2', 'Timing School Two');

insert into public.school_memberships (school_id, user_id, role) values
  ('20000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000a1', 'coach'),
  ('20000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000a2', 'coach'),
  ('20000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000a4', 'school_admin');

-- e1 is A's athlete (guardian G), e2 is B's athlete, both in school 1;
-- e3 is B's athlete in school 2.
insert into public.athletes (id, first_name, last_name) values
  ('20000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('20000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('20000000-0000-4000-8000-0000000000e3', 'Athlete', 'E3');

insert into public.athlete_schools (athlete_id, school_id) values
  ('20000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000b1'),
  ('20000000-0000-4000-8000-0000000000e2', '20000000-0000-4000-8000-0000000000b1'),
  ('20000000-0000-4000-8000-0000000000e3', '20000000-0000-4000-8000-0000000000b2');

insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values
  ('20000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000e1'),
  ('20000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-0000000000e2'),
  ('20000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-0000000000e3');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('20000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-0000000000e1', 'guardian');

-- Schema
select has_table('public', 'measurements', 'measurements exists');
select has_table('public', 'timing_series', 'timing_series exists');
select is_empty(
  $$ select relname from pg_class
     where relnamespace = 'public'::regnamespace
       and relname in ('measurements', 'timing_series') and not relrowsecurity $$,
  'measurements and timing_series have row level security enabled'
);
select set_eq(
  $$ select tablename::text from pg_publication_tables
     where pubname = 'powersync' and tablename in ('measurements', 'timing_series') $$,
  $$ values ('measurements'), ('timing_series') $$,
  'the powersync publication includes measurements and timing_series'
);

set local role authenticated;

-- Coach A
set local request.jwt.claims = '{"sub": "20000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.timing_series (id, stroke, distance, pool, session_type, device_id)
     values ('20000000-0000-4000-8000-0000000000c1', 'FR', '50m', 'SCM', 'training', 'device-a') $$,
  'coach A creates a series'
);

select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, series_id, arrival_position, hundredths,
        stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('20000000-0000-4000-8000-0000000000f1', 'repetition', '20000000-0000-4000-8000-0000000000e1',
        '20000000-0000-4000-8000-0000000000c1', 1, 3150,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:00:00+00') $$,
  'coach A inserts a measurement of an assigned athlete'
);

select throws_ok(
  $$ insert into public.measurements
       (kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('repetition', '20000000-0000-4000-8000-0000000000e2', 3150,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:00:00+00') $$,
  '42501', null,
  'coach A cannot insert a measurement of an athlete that is not assigned to A'
);

select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, parent_id)
     values
       ('20000000-0000-4000-8000-0000000000f2', 'series_total', '20000000-0000-4000-8000-0000000000e1', 60000,
        'FR', '50m', 'SCM', 'training', 'screen_stopwatch', 'device-a', '2026-10-24 08:10:00+00', null),
       ('20000000-0000-4000-8000-0000000000f3', 'race', '20000000-0000-4000-8000-0000000000e1', 6400,
        'FR', '100m', 'LCM', 'competition', 'external_button', 'device-a', '2026-10-24 09:00:00+00', null),
       ('20000000-0000-4000-8000-0000000000f4', 'split', '20000000-0000-4000-8000-0000000000e1', 3100,
        'FR', '100m', 'LCM', 'competition', 'external_button', 'device-a', '2026-10-24 09:00:00+00',
        '20000000-0000-4000-8000-0000000000f3'),
       ('20000000-0000-4000-8000-0000000000f5', 'completed', '20000000-0000-4000-8000-0000000000e1', null,
        'BK', '200m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:20:00+00', null) $$,
  'series_total, race, split linked to its race, and completed without a time are accepted'
);

select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('20000000-0000-4000-8000-0000000000fa', 'repetition', '20000000-0000-4000-8000-0000000000e1', null,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:30:00+00') $$,
  'a repetition without a recorded time is stored with null hundredths'
);

select throws_ok(
  $$ insert into public.measurements
       (kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('completed', '20000000-0000-4000-8000-0000000000e1', 3150,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:00:00+00') $$,
  '23514', null,
  'a completed measurement with hundredths is rejected'
);

select throws_ok(
  $$ insert into public.measurements
       (kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('repetition', '20000000-0000-4000-8000-0000000000e1', 0,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:00:00+00') $$,
  '23514', null,
  'a time of 0 is rejected, so 0 never stands in for a missing time'
);

select throws_ok(
  $$ insert into public.measurements
       (kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('lap', '20000000-0000-4000-8000-0000000000e1', 3150,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:00:00+00') $$,
  '23514', null,
  'an unknown kind is rejected'
);

select throws_ok(
  $$ insert into public.measurements
       (kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, parent_id)
     values
       ('repetition', '20000000-0000-4000-8000-0000000000e1', 3150,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:00:00+00',
        '20000000-0000-4000-8000-0000000000f3') $$,
  '23514', null,
  'only a split links to a parent measurement'
);

select throws_ok(
  $$ insert into public.measurements
       (kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, captured_at)
     values
       ('repetition', '20000000-0000-4000-8000-0000000000e1', 3150,
        'FR', '50m', 'SCM', 'training', 'screen_button', '2026-10-24 08:00:00+00') $$,
  '23502', null,
  'a measurement without a device is rejected'
);

select throws_ok(
  $$ insert into public.measurements
       (kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
     values
       ('repetition', '20000000-0000-4000-8000-0000000000e1', 3150,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:00:00+00',
        '20000000-0000-4000-8000-0000000000a2') $$,
  '42501', null,
  'coach A cannot record a measurement in another user''s name'
);

-- Unassigned arrivals ("por asignar") of A's series.
select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, series_id, arrival_position, hundredths,
        stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('20000000-0000-4000-8000-0000000000f6', 'repetition', null,
        '20000000-0000-4000-8000-0000000000c1', 2, 3290,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:00:00+00'),
       ('20000000-0000-4000-8000-0000000000f7', 'repetition', null,
        '20000000-0000-4000-8000-0000000000c1', 3, 3410,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:00:00+00') $$,
  'coach A inserts unassigned arrivals in A''s series'
);
select set_eq(
  $$ select id from public.measurements where athlete_id is null $$,
  $$ values ('20000000-0000-4000-8000-0000000000f6'::uuid), ('20000000-0000-4000-8000-0000000000f7'::uuid) $$,
  'coach A reads the unassigned arrivals of A''s series'
);
select throws_ok(
  $$ insert into public.measurements
       (kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('repetition', null, 3150, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:00:00+00') $$,
  '42501', null,
  'an unassigned arrival outside a series is rejected'
);
select isnt_empty(
  $$ update public.measurements set athlete_id = '20000000-0000-4000-8000-0000000000e1'
     where id = '20000000-0000-4000-8000-0000000000f6' returning id $$,
  'coach A completes an unassigned arrival with an assigned athlete'
);

-- Coach B
set local request.jwt.claims = '{"sub": "20000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty(
  $$ select 1 from public.measurements where athlete_id is null $$,
  'coach B does not see the unassigned arrivals of A''s series'
);
select is_empty(
  'select 1 from public.timing_series',
  'coach B does not see A''s series'
);
select throws_ok(
  $$ insert into public.measurements
       (kind, athlete_id, series_id, arrival_position, hundredths,
        stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('repetition', null, '20000000-0000-4000-8000-0000000000c1', 4, 3500,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-b', '2026-10-24 08:00:00+00') $$,
  '42501', null,
  'coach B cannot add an unassigned arrival to A''s series'
);
select is_empty(
  $$ update public.measurements set athlete_id = '20000000-0000-4000-8000-0000000000e2'
     where id = '20000000-0000-4000-8000-0000000000f7' returning id $$,
  'coach B cannot complete an unassigned arrival of A''s series'
);
select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('20000000-0000-4000-8000-0000000000f8', 'repetition', '20000000-0000-4000-8000-0000000000e2', 3300,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-b', '2026-10-24 08:00:00+00'),
       ('20000000-0000-4000-8000-0000000000f9', 'repetition', '20000000-0000-4000-8000-0000000000e3', 3300,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-b', '2026-10-24 08:00:00+00') $$,
  'coach B inserts measurements of B''s athletes in both schools'
);

-- Guardian G
set local request.jwt.claims = '{"sub": "20000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select set_eq(
  $$ select id from public.measurements $$,
  $$ values ('20000000-0000-4000-8000-0000000000f1'::uuid), ('20000000-0000-4000-8000-0000000000f2'::uuid),
            ('20000000-0000-4000-8000-0000000000f3'::uuid), ('20000000-0000-4000-8000-0000000000f4'::uuid),
            ('20000000-0000-4000-8000-0000000000f5'::uuid), ('20000000-0000-4000-8000-0000000000f6'::uuid),
            ('20000000-0000-4000-8000-0000000000fa'::uuid) $$,
  'guardian G reads only the measurements of G''s athlete'
);
select throws_ok(
  $$ insert into public.measurements
       (kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('repetition', '20000000-0000-4000-8000-0000000000e1', 3150,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-g', '2026-10-24 08:00:00+00') $$,
  '42501', null,
  'guardian G cannot insert a measurement'
);
select is_empty(
  $$ update public.measurements set hundredths = 1000
     where id = '20000000-0000-4000-8000-0000000000f1' returning id $$,
  'guardian G cannot edit a measurement'
);
select throws_ok(
  $$ insert into public.timing_series (stroke, distance, pool, session_type, device_id)
     values ('FR', '50m', 'SCM', 'training', 'device-g') $$,
  '42501', null,
  'guardian G cannot create a series'
);

-- School admin S
set local request.jwt.claims = '{"sub": "20000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select set_eq(
  $$ select distinct athlete_id from public.measurements $$,
  $$ values ('20000000-0000-4000-8000-0000000000e1'::uuid), ('20000000-0000-4000-8000-0000000000e2'::uuid) $$,
  'school admin S reads the measurements of S''s school and none of another school'
);

-- Review 5: a coach who loses an assignment, by group or direct, can no longer
-- write that athlete's measurements. e4 reaches coach A through group 1.
reset role;
insert into public.training_groups (id, school_id, name)
values ('20000000-0000-4000-8000-0000000000d1', '20000000-0000-4000-8000-0000000000b1', 'Timing Group One');
insert into public.coach_group_assignments (coach_user_id, group_id)
values ('20000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000d1');
insert into public.athletes (id, first_name, last_name)
values ('20000000-0000-4000-8000-0000000000e4', 'Athlete', 'E4');
insert into public.athlete_schools (athlete_id, school_id)
values ('20000000-0000-4000-8000-0000000000e4', '20000000-0000-4000-8000-0000000000b1');
insert into public.athlete_groups (athlete_id, group_id)
values ('20000000-0000-4000-8000-0000000000e4', '20000000-0000-4000-8000-0000000000d1');

set local role authenticated;
set local request.jwt.claims = '{"sub": "20000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('20000000-0000-4000-8000-0000000000fb', 'repetition', '20000000-0000-4000-8000-0000000000e4', 3200,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:00:00+00') $$,
  'coach A inserts a measurement of an athlete of A''s group'
);

reset role;
delete from public.coach_group_assignments where coach_user_id = '20000000-0000-4000-8000-0000000000a1';
delete from public.coach_athlete_assignments where coach_user_id = '20000000-0000-4000-8000-0000000000a1';
set local role authenticated;
set local request.jwt.claims = '{"sub": "20000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.measurements
       (kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('repetition', '20000000-0000-4000-8000-0000000000e4', 3200,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:00:00+00') $$,
  '42501', null,
  'after losing the group assignment, coach A cannot insert a measurement of that athlete'
);
select throws_ok(
  $$ insert into public.measurements
       (kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('repetition', '20000000-0000-4000-8000-0000000000e1', 3200,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-a', '2026-10-24 08:00:00+00') $$,
  '42501', null,
  'after losing the direct assignment, coach A cannot insert a measurement of that athlete'
);
select is_empty(
  $$ update public.measurements set hundredths = 1000
     where id = '20000000-0000-4000-8000-0000000000fb' returning id $$,
  'after losing the group assignment, coach A updates no measurement of that athlete'
);
select is_empty(
  $$ update public.measurements set hundredths = 1000
     where id = '20000000-0000-4000-8000-0000000000f1' returning id $$,
  'after losing the direct assignment, coach A updates no measurement of that athlete'
);
select throws_ok(
  $$ update public.measurements set athlete_id = '20000000-0000-4000-8000-0000000000e1'
     where id = '20000000-0000-4000-8000-0000000000f7' $$,
  '42501', null,
  'after losing the assignment, coach A cannot complete an unassigned arrival with that athlete'
);

-- Author and device are kept on every row.
reset role;
select is_empty(
  $$ select 1 from public.measurements where created_by is null or device_id is null
     union all
     select 1 from public.timing_series where created_by is null or device_id is null $$,
  'every measurement and series row has an author and a device'
);
select is(
  (select created_by from public.measurements where id = '20000000-0000-4000-8000-0000000000f6'),
  '20000000-0000-4000-8000-0000000000a1'::uuid,
  'the author of a completed arrival is still coach A'
);

select * from finish();
rollback;
