-- Every series and measurement belongs to one school (issue #291). The author
-- must be a coach or admin of that school, the athlete must be in it, and a
-- measurement of a series has the series' school; the school never changes
-- after the insert. Coaches and admins read only the marks of their own
-- schools, while the guardian and the adult athlete read all of theirs. Athlete
-- X and adult athlete Y are in schools A and B. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- The backfill of the migration (app.timing_backfill_school_ids) checks every
-- row first and then fails once, naming how many rows have no single possible
-- school and the first ids of each table. Run here, as the owner, before the
-- fixtures below exist: rows stored without a school by an author who is staff
-- of no school. Then the rows are removed and the columns are not null again.
alter table public.timing_series alter column school_id drop not null;
alter table public.measurements alter column school_id drop not null;
insert into public.measurements
  (id, created_by, kind, stroke, distance, pool, session_type, source, device_id, captured_at)
values
  ('29100000-0000-4000-8000-0000000009f1', '29100000-0000-4000-8000-0000000009a9', 'repetition',
   'FR', '50m', 'SCM', 'training', 'screen_button', 'dev', '2026-10-20 08:00:00+00');
select throws_ok(
  'select app.timing_backfill_school_ids()',
  'P0001',
  'timing_school_id backfill: 0 timing_series without exactly one school (first 10: none); '
    || '1 measurements without exactly one school (first 10: 29100000-0000-4000-8000-0000000009f1)',
  'a measurement with no possible school fails the backfill, naming the count and its id'
);
insert into public.timing_series (id, created_by, stroke, distance, pool, session_type, device_id) values
  ('29100000-0000-4000-8000-0000000009c1', '29100000-0000-4000-8000-0000000009a9', 'FR', '50m', 'SCM', 'training', 'dev');
insert into public.measurements
  (id, created_by, kind, series_id, arrival_position, stroke, distance, pool, session_type, source, device_id, captured_at)
values
  ('29100000-0000-4000-8000-0000000009f2', '29100000-0000-4000-8000-0000000009a9', 'repetition',
   '29100000-0000-4000-8000-0000000009c1', 1, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev', '2026-10-20 08:00:00+00');
select throws_ok(
  'select app.timing_backfill_school_ids()',
  'P0001',
  'timing_school_id backfill: 1 timing_series without exactly one school (first 10: 29100000-0000-4000-8000-0000000009c1); '
    || '2 measurements without exactly one school (first 10: 29100000-0000-4000-8000-0000000009f1, 29100000-0000-4000-8000-0000000009f2)',
  'with a bad series and two bad measurements the backfill reports both counts and every id'
);
select ok(
  not has_function_privilege('anon', 'app.timing_backfill_school_ids()', 'execute')
    and not has_function_privilege('public', 'app.timing_backfill_school_ids()', 'execute'),
  'anon and public cannot execute the backfill'
);
set local role authenticated;
select throws_ok(
  'select app.timing_backfill_school_ids()',
  '42501', null,
  'a signed-in client cannot execute the backfill'
);
reset role;
delete from public.measurements where id::text like '29100000-0000-4000-8000-0000000009%';
delete from public.timing_series where id = '29100000-0000-4000-8000-0000000009c1';
alter table public.timing_series alter column school_id set not null;
alter table public.measurements alter column school_id set not null;

-- Users: coach and admin of A, coach and admin of B, guardian G of X, adult
-- athlete Y, and coach W of both schools.
insert into auth.users (id, email) values
  ('29100000-0000-4000-8000-0000000000a1', 'coach-a@example.test'),
  ('29100000-0000-4000-8000-0000000000a2', 'admin-a@example.test'),
  ('29100000-0000-4000-8000-0000000000a3', 'coach-b@example.test'),
  ('29100000-0000-4000-8000-0000000000a4', 'admin-b@example.test'),
  ('29100000-0000-4000-8000-0000000000a5', 'guardian-g@example.test'),
  ('29100000-0000-4000-8000-0000000000a6', 'adult-y@example.test'),
  ('29100000-0000-4000-8000-0000000000a7', 'coach-w@example.test');

insert into public.schools (id, name) values
  ('29100000-0000-4000-8000-0000000000b1', 'School Id School A'),
  ('29100000-0000-4000-8000-0000000000b2', 'School Id School B');

insert into public.school_memberships (school_id, user_id, role) values
  ('29100000-0000-4000-8000-0000000000b1', '29100000-0000-4000-8000-0000000000a1', 'coach'),
  ('29100000-0000-4000-8000-0000000000b1', '29100000-0000-4000-8000-0000000000a2', 'school_admin'),
  ('29100000-0000-4000-8000-0000000000b2', '29100000-0000-4000-8000-0000000000a3', 'coach'),
  ('29100000-0000-4000-8000-0000000000b2', '29100000-0000-4000-8000-0000000000a4', 'school_admin'),
  ('29100000-0000-4000-8000-0000000000b1', '29100000-0000-4000-8000-0000000000a7', 'coach'),
  ('29100000-0000-4000-8000-0000000000b2', '29100000-0000-4000-8000-0000000000a7', 'coach');

-- e1 is X and e2 is Y, both in A and B; e3 (Z) is only in B.
insert into public.athletes (id, first_name, last_name) values
  ('29100000-0000-4000-8000-0000000000e1', 'Athlete', 'X'),
  ('29100000-0000-4000-8000-0000000000e2', 'Athlete', 'Y'),
  ('29100000-0000-4000-8000-0000000000e3', 'Athlete', 'Z');

insert into public.athlete_schools (athlete_id, school_id) values
  ('29100000-0000-4000-8000-0000000000e1', '29100000-0000-4000-8000-0000000000b1'),
  ('29100000-0000-4000-8000-0000000000e1', '29100000-0000-4000-8000-0000000000b2'),
  ('29100000-0000-4000-8000-0000000000e2', '29100000-0000-4000-8000-0000000000b1'),
  ('29100000-0000-4000-8000-0000000000e2', '29100000-0000-4000-8000-0000000000b2'),
  ('29100000-0000-4000-8000-0000000000e3', '29100000-0000-4000-8000-0000000000b2');

-- Coach A also coaches Z, so only the school rule stops A from writing Z in A.
insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values
  ('29100000-0000-4000-8000-0000000000a1', '29100000-0000-4000-8000-0000000000e1'),
  ('29100000-0000-4000-8000-0000000000a1', '29100000-0000-4000-8000-0000000000e2'),
  ('29100000-0000-4000-8000-0000000000a1', '29100000-0000-4000-8000-0000000000e3'),
  ('29100000-0000-4000-8000-0000000000a3', '29100000-0000-4000-8000-0000000000e1'),
  ('29100000-0000-4000-8000-0000000000a3', '29100000-0000-4000-8000-0000000000e2'),
  ('29100000-0000-4000-8000-0000000000a7', '29100000-0000-4000-8000-0000000000e1');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('29100000-0000-4000-8000-0000000000a5', '29100000-0000-4000-8000-0000000000e1', 'guardian'),
  ('29100000-0000-4000-8000-0000000000a6', '29100000-0000-4000-8000-0000000000e2', 'self');

-- c1: coach A's series in A. c3: coach B's series in B. c7: coach W's series in A.
insert into public.timing_series (id, created_by, school_id, stroke, distance, pool, session_type, device_id) values
  ('29100000-0000-4000-8000-0000000000c1', '29100000-0000-4000-8000-0000000000a1', '29100000-0000-4000-8000-0000000000b1', 'FR', '50m', 'SCM', 'training', 'dev-a'),
  ('29100000-0000-4000-8000-0000000000c3', '29100000-0000-4000-8000-0000000000a3', '29100000-0000-4000-8000-0000000000b2', 'FR', '50m', 'SCM', 'training', 'dev-b'),
  ('29100000-0000-4000-8000-0000000000c7', '29100000-0000-4000-8000-0000000000a7', '29100000-0000-4000-8000-0000000000b1', 'FR', '50m', 'SCM', 'training', 'dev-w');

-- f1, f2: A's marks of X and Y. f3, f4: B's marks of X and Y. f5: an unassigned
-- arrival of A's series.
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, series_id, arrival_position, hundredths,
   stroke, distance, pool, session_type, source, device_id, captured_at)
select id, author, school, 'repetition', athlete, series, pos, 3100, 'FR', '50m', 'SCM', 'training',
       'screen_button', 'dev', '2026-10-24 08:00:00+00'
from (values
  ('29100000-0000-4000-8000-0000000000f1'::uuid, '29100000-0000-4000-8000-0000000000a1'::uuid, '29100000-0000-4000-8000-0000000000b1'::uuid,
   '29100000-0000-4000-8000-0000000000e1'::uuid, '29100000-0000-4000-8000-0000000000c1'::uuid, 1),
  ('29100000-0000-4000-8000-0000000000f2', '29100000-0000-4000-8000-0000000000a1', '29100000-0000-4000-8000-0000000000b1',
   '29100000-0000-4000-8000-0000000000e2', null, null),
  ('29100000-0000-4000-8000-0000000000f3', '29100000-0000-4000-8000-0000000000a3', '29100000-0000-4000-8000-0000000000b2',
   '29100000-0000-4000-8000-0000000000e1', '29100000-0000-4000-8000-0000000000c3', 1),
  ('29100000-0000-4000-8000-0000000000f4', '29100000-0000-4000-8000-0000000000a3', '29100000-0000-4000-8000-0000000000b2',
   '29100000-0000-4000-8000-0000000000e2', null, null),
  ('29100000-0000-4000-8000-0000000000f5', '29100000-0000-4000-8000-0000000000a1', '29100000-0000-4000-8000-0000000000b1',
   null, '29100000-0000-4000-8000-0000000000c1', 2)
) as v(id, author, school, athlete, series, pos);

-- Schema
select col_not_null('public', 'timing_series', 'school_id', 'every series has a school');
select col_not_null('public', 'measurements', 'school_id', 'every measurement has a school');
select fk_ok('public', 'timing_series', 'school_id', 'public', 'schools', 'id', 'the school of a series is a school');
select fk_ok('public', 'measurements', 'school_id', 'public', 'schools', 'id', 'the school of a measurement is a school');

set local role authenticated;

-- Who reads what. B reads its own mark of X, never A's; A the other way round.
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select set_eq(
  'select id from public.measurements',
  $$ values ('29100000-0000-4000-8000-0000000000f3'::uuid), ('29100000-0000-4000-8000-0000000000f4'::uuid) $$,
  'coach B reads B''s marks of X and Y and none of A''s'
);
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select set_eq(
  'select id from public.measurements',
  $$ values ('29100000-0000-4000-8000-0000000000f3'::uuid), ('29100000-0000-4000-8000-0000000000f4'::uuid) $$,
  'admin B reads B''s marks of X and Y and none of A''s'
);
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select set_eq(
  'select id from public.measurements',
  $$ values ('29100000-0000-4000-8000-0000000000f1'::uuid), ('29100000-0000-4000-8000-0000000000f2'::uuid),
            ('29100000-0000-4000-8000-0000000000f5'::uuid) $$,
  'coach A still reads A''s marks and the unassigned arrival of A''s series, and none of B''s'
);
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select set_eq(
  'select id from public.measurements',
  $$ values ('29100000-0000-4000-8000-0000000000f1'::uuid), ('29100000-0000-4000-8000-0000000000f2'::uuid) $$,
  'admin A still reads A''s marks of X and Y, and none of B''s'
);
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select set_eq(
  'select id from public.measurements',
  $$ values ('29100000-0000-4000-8000-0000000000f1'::uuid), ('29100000-0000-4000-8000-0000000000f3'::uuid) $$,
  'the guardian of X reads X''s marks from both schools'
);
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select set_eq(
  'select id from public.measurements',
  $$ values ('29100000-0000-4000-8000-0000000000f2'::uuid), ('29100000-0000-4000-8000-0000000000f4'::uuid) $$,
  'the adult athlete Y reads Y''s marks from both schools'
);

-- Writing into a school that is not the author's, or with an athlete outside it.
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.timing_series (school_id, stroke, distance, pool, session_type, device_id)
     values ('29100000-0000-4000-8000-0000000000b1', 'FR', '50m', 'SCM', 'training', 'dev-b') $$,
  '42501', null,
  'coach B cannot open a series in A'
);
select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('29100000-0000-4000-8000-0000000000b1', 'repetition', '29100000-0000-4000-8000-0000000000e1', 3200,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-b', '2026-10-24 09:00:00+00') $$,
  '42501', 'the author of a series or measurement must be a coach or admin of its school',
  'coach B cannot record a mark of X in A, although B coaches X'
);
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('29100000-0000-4000-8000-0000000000b1', 'repetition', '29100000-0000-4000-8000-0000000000e3', 3200,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-a', '2026-10-24 09:00:00+00') $$,
  '42501', 'the athlete of a measurement must be in its school',
  'coach A cannot record a mark in A of an athlete who is not in A, although A coaches Z'
);
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, series_id, arrival_position, hundredths,
        stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('29100000-0000-4000-8000-0000000000b2', 'repetition', '29100000-0000-4000-8000-0000000000e1',
        '29100000-0000-4000-8000-0000000000c7', 1, 3200,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-w', '2026-10-24 09:00:00+00') $$,
  '42501', 'a measurement must have the school of its series',
  'a coach of both schools cannot record a mark in B inside a series of A'
);

-- Naming an arrival later stays inside the measurement's school.
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ update public.measurements set athlete_id = '29100000-0000-4000-8000-0000000000e3'
     where id = '29100000-0000-4000-8000-0000000000f5' $$,
  '42501', 'the athlete of a measurement must be in its school',
  'coach A cannot name an arrival of A with an athlete who is not in A'
);

-- The school never changes after the insert.
select throws_ok(
  $$ update public.measurements set school_id = '29100000-0000-4000-8000-0000000000b2'
     where id = '29100000-0000-4000-8000-0000000000f1' $$,
  '42501', 'only athlete_id and hundredths can change on a measurement',
  'the author cannot move a measurement to another school'
);
select is_empty(
  $$ update public.timing_series set school_id = '29100000-0000-4000-8000-0000000000b2'
     where id = '29100000-0000-4000-8000-0000000000c1' returning id $$,
  'the author cannot move a series to another school: clients update no series'
);

-- B cannot rewrite A's time of X either, not even with an UPDATE whose WHERE
-- reads no column (the select policy does not filter it).
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select lives_ok(
  $$ update public.measurements set hundredths = 1111, base_version = 1, edited_device_id = 'dev-b' where true $$,
  'coach B runs an edit of every mark B may edit'
);
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select lives_ok(
  $$ update public.measurements set hundredths = 2222, edit_reason = 'Synthetic probe', base_version = 2, edited_device_id = 'dev-s'
     where true $$,
  'admin B runs an edit of every mark B may edit'
);

-- Without a signed-in user (the owner, the service role) the same rules hold.
reset role;
set local request.jwt.claims = '';
select is(
  (select hundredths || '|' || version from public.measurements where id = '29100000-0000-4000-8000-0000000000f1'),
  '3100|1',
  'neither coach B nor admin B changed A''s mark of X'
);
select throws_ok(
  $$ update public.measurements set school_id = '29100000-0000-4000-8000-0000000000b2'
     where id = '29100000-0000-4000-8000-0000000000f1' $$,
  '42501', 'only athlete_id and hundredths can change on a measurement',
  'the owner cannot move a measurement to another school'
);
select throws_ok(
  $$ update public.timing_series set school_id = '29100000-0000-4000-8000-0000000000b2'
     where id = '29100000-0000-4000-8000-0000000000c1' $$,
  '42501', 'the school of a series cannot change',
  'the owner cannot move a series to another school'
);
select throws_ok(
  $$ update public.measurements set athlete_id = '29100000-0000-4000-8000-0000000000e3'
     where id = '29100000-0000-4000-8000-0000000000f5' $$,
  '42501', 'the athlete of a measurement must be in its school',
  'the owner cannot name an arrival of A with an athlete who is not in A'
);
select throws_ok(
  $$ insert into public.timing_series (created_by, school_id, stroke, distance, pool, session_type, device_id)
     values ('29100000-0000-4000-8000-0000000000a5', '29100000-0000-4000-8000-0000000000b1', 'FR', '50m', 'SCM', 'training', 'dev-g') $$,
  '42501', 'the author of a series or measurement must be a coach or admin of its school',
  'the owner cannot store a series authored by someone who is not staff of its school'
);

-- Each school keeps working the same inside its own school.
set local role authenticated;
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.timing_series (id, school_id, stroke, distance, pool, session_type, device_id)
     values ('29100000-0000-4000-8000-0000000000c2', '29100000-0000-4000-8000-0000000000b1', 'FR', '50m', 'SCM', 'training', 'dev-a') $$,
  'coach A opens a series in A'
);
select lives_ok(
  $$ insert into public.measurements
       (id, school_id, kind, athlete_id, series_id, arrival_position, hundredths,
        stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('29100000-0000-4000-8000-0000000000d1', '29100000-0000-4000-8000-0000000000b1', 'repetition',
        '29100000-0000-4000-8000-0000000000e1', '29100000-0000-4000-8000-0000000000c2', 1, 3300,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-a', '2026-10-24 10:00:00+00'),
       ('29100000-0000-4000-8000-0000000000d2', '29100000-0000-4000-8000-0000000000b1', 'repetition',
        null, '29100000-0000-4000-8000-0000000000c2', 2, 3400,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-a', '2026-10-24 10:00:00+00') $$,
  'coach A records a mark of X and an unassigned arrival in A''s series'
);
select isnt_empty(
  $$ update public.measurements set athlete_id = '29100000-0000-4000-8000-0000000000e2'
     where id = '29100000-0000-4000-8000-0000000000d2' returning id $$,
  'coach A names the arrival with an athlete of A'
);
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.timing_series (school_id, stroke, distance, pool, session_type, device_id)
     values ('29100000-0000-4000-8000-0000000000b1', 'FR', '50m', 'SCM', 'training', 'dev-s') $$,
  'admin A opens a series in A'
);
set local request.jwt.claims = '{"sub": "29100000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('29100000-0000-4000-8000-0000000000b2', 'repetition', '29100000-0000-4000-8000-0000000000e1', 3200,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-b', '2026-10-24 09:00:00+00') $$,
  'coach B records a mark of X in B'
);

select * from finish();
rollback;
