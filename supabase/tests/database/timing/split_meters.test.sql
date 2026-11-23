-- Meters of a free mark (#1432): `meters` is a nullable number above 0 that only a split can carry, rows written
-- before it keep null, and it never changes once written. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values ('21000000-0000-4000-8000-0000000000a1', 'coach-m@example.test');
insert into public.schools (id, name) values ('21000000-0000-4000-8000-0000000000b1', 'Meters School');
insert into public.school_memberships (school_id, user_id, role) values ('21000000-0000-4000-8000-0000000000b1', '21000000-0000-4000-8000-0000000000a1', 'coach');
insert into public.athletes (id, first_name, last_name) values ('21000000-0000-4000-8000-0000000000e1', 'Athlete', 'M1');
insert into public.athlete_schools (athlete_id, school_id) values ('21000000-0000-4000-8000-0000000000e1', '21000000-0000-4000-8000-0000000000b1');
insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values ('21000000-0000-4000-8000-0000000000a1', '21000000-0000-4000-8000-0000000000e1');

select col_type_is('public', 'measurements', 'meters', 'numeric', 'meters is a number');
select col_is_null('public', 'measurements', 'meters', 'meters is nullable: no meters known is null, never 0');

set local role authenticated;
set local request.jwt.claims = '{"sub": "21000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

-- A race written the way an old build writes it: no meters column at all.
select lives_ok(
  $$ insert into public.measurements
       (school_id, id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('21000000-0000-4000-8000-0000000000b1', '21000000-0000-4000-8000-0000000000f1', 'race', '21000000-0000-4000-8000-0000000000e1', 6400,
        'FR', '100m', 'SCM', 'training', 'screen_stopwatch', 'device-m', '2026-11-22 08:00:00+00') $$,
  'a row written without meters is accepted'
);
select is((select meters from public.measurements where id = '21000000-0000-4000-8000-0000000000f1'), null, 'a row written without meters keeps null');

select lives_ok(
  $$ insert into public.measurements
       (school_id, id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, parent_id, meters)
     values
       ('21000000-0000-4000-8000-0000000000b1', '21000000-0000-4000-8000-0000000000f2', 'split', '21000000-0000-4000-8000-0000000000e1', 3100,
        'FR', '100m', 'SCM', 'training', 'screen_stopwatch', 'device-m', '2026-11-22 08:00:00+00', '21000000-0000-4000-8000-0000000000f1', 25),
       ('21000000-0000-4000-8000-0000000000b1', '21000000-0000-4000-8000-0000000000f3', 'split', '21000000-0000-4000-8000-0000000000e1', 6000,
        'FR', '100m', 'SCM', 'training', 'screen_stopwatch', 'device-m', '2026-11-22 08:00:00+00', '21000000-0000-4000-8000-0000000000f1', 37.5),
       ('21000000-0000-4000-8000-0000000000b1', '21000000-0000-4000-8000-0000000000f4', 'split', '21000000-0000-4000-8000-0000000000e1', 9000,
        'FR', '100m', 'SCM', 'training', 'screen_stopwatch', 'device-m', '2026-11-22 08:00:00+00', '21000000-0000-4000-8000-0000000000f1', null) $$,
  'a split takes meters above 0, with decimals, or null'
);

select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, meters)
     values
       ('21000000-0000-4000-8000-0000000000b1', 'race', '21000000-0000-4000-8000-0000000000e1', 6400,
        'FR', '100m', 'SCM', 'training', 'screen_stopwatch', 'device-m', '2026-11-22 08:00:00+00', 100) $$,
  '23514', null, 'meters on a race is rejected'
);
select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, meters)
     values
       ('21000000-0000-4000-8000-0000000000b1', 'repetition', '21000000-0000-4000-8000-0000000000e1', 6400,
        'FR', '100m', 'SCM', 'training', 'screen_stopwatch', 'device-m', '2026-11-22 08:00:00+00', 50) $$,
  '23514', null, 'meters on a repetition is rejected'
);
select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, parent_id, meters)
     values
       ('21000000-0000-4000-8000-0000000000b1', 'split', '21000000-0000-4000-8000-0000000000e1', 3100,
        'FR', '100m', 'SCM', 'training', 'screen_stopwatch', 'device-m', '2026-11-22 08:00:00+00', '21000000-0000-4000-8000-0000000000f1', 0) $$,
  '23514', null, 'a split with 0 meters is rejected'
);
select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, parent_id, meters)
     values
       ('21000000-0000-4000-8000-0000000000b1', 'split', '21000000-0000-4000-8000-0000000000e1', 3100,
        'FR', '100m', 'SCM', 'training', 'screen_stopwatch', 'device-m', '2026-11-22 08:00:00+00', '21000000-0000-4000-8000-0000000000f1', -25) $$,
  '23514', null, 'a split with negative meters is rejected'
);

select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, parent_id, meters)
     values
       ('21000000-0000-4000-8000-0000000000b1', 'split', '21000000-0000-4000-8000-0000000000e1', 3100,
        'FR', '100m', 'SCM', 'training', 'screen_stopwatch', 'device-m', '2026-11-22 08:00:00+00', '21000000-0000-4000-8000-0000000000f1', 'NaN') $$,
  '23514', null, 'a split with NaN as meters is rejected'
);
select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, parent_id, meters)
     values
       ('21000000-0000-4000-8000-0000000000b1', 'split', '21000000-0000-4000-8000-0000000000e1', 3100,
        'FR', '100m', 'SCM', 'training', 'screen_stopwatch', 'device-m', '2026-11-22 08:00:00+00', '21000000-0000-4000-8000-0000000000f1', 'Infinity') $$,
  '23514', null, 'a split with Infinity as meters is rejected'
);
select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, parent_id, meters)
     values
       ('21000000-0000-4000-8000-0000000000b1', 'split', '21000000-0000-4000-8000-0000000000e1', 3100,
        'FR', '100m', 'SCM', 'training', 'screen_stopwatch', 'device-m', '2026-11-22 08:00:00+00', '21000000-0000-4000-8000-0000000000f1', 100000) $$,
  '23514', null, 'a split with 100000 meters, the upper bound as meters is rejected'
);

-- Meters do not change after saving (out of scope for this delivery): the update guard refuses it.
select throws_ok(
  $$ update public.measurements set meters = 30 where id = '21000000-0000-4000-8000-0000000000f2' $$,
  '42501', null, 'meters of a saved split cannot be changed'
);

select * from finish();
rollback;
