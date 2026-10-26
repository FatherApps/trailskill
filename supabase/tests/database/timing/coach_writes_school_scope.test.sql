-- A coach writes a measurement only of an athlete in their charge in the
-- measurement's school (issue #321). Coach C coaches in schools A and B. X is
-- only in A and assigned to C in A. Y is in A and B and assigned to C only in
-- B. Z is in A and B and in a training group of B coached by C. C may write Y
-- and Z only in B, and X in A. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Users: C, coach CA of A, coach CB of B, D (school admin of A and coach of B,
-- Y assigned to D in B) and N, with no relations.
insert into auth.users (id, email) values
  ('32100000-0000-4000-8000-0000000000a1', 'coach-c@example.test'),
  ('32100000-0000-4000-8000-0000000000a2', 'coach-ca@example.test'),
  ('32100000-0000-4000-8000-0000000000a3', 'coach-cb@example.test'),
  ('32100000-0000-4000-8000-0000000000a4', 'admin-d@example.test'),
  ('32100000-0000-4000-8000-0000000000a5', 'nobody-n@example.test');

insert into public.schools (id, name) values
  ('32100000-0000-4000-8000-0000000000b1', 'Coach Scope School A'),
  ('32100000-0000-4000-8000-0000000000b2', 'Coach Scope School B');

insert into public.school_memberships (school_id, user_id, role) values
  ('32100000-0000-4000-8000-0000000000b1', '32100000-0000-4000-8000-0000000000a1', 'coach'),
  ('32100000-0000-4000-8000-0000000000b2', '32100000-0000-4000-8000-0000000000a1', 'coach'),
  ('32100000-0000-4000-8000-0000000000b1', '32100000-0000-4000-8000-0000000000a2', 'coach'),
  ('32100000-0000-4000-8000-0000000000b2', '32100000-0000-4000-8000-0000000000a3', 'coach'),
  ('32100000-0000-4000-8000-0000000000b1', '32100000-0000-4000-8000-0000000000a4', 'school_admin'),
  ('32100000-0000-4000-8000-0000000000b2', '32100000-0000-4000-8000-0000000000a4', 'coach');

-- e1 is X (only A), e2 is Y and e3 is Z (both A and B).
insert into public.athletes (id, first_name, last_name) values
  ('32100000-0000-4000-8000-0000000000e1', 'Athlete', 'X'),
  ('32100000-0000-4000-8000-0000000000e2', 'Athlete', 'Y'),
  ('32100000-0000-4000-8000-0000000000e3', 'Athlete', 'Z');

insert into public.athlete_schools (athlete_id, school_id) values
  ('32100000-0000-4000-8000-0000000000e1', '32100000-0000-4000-8000-0000000000b1'),
  ('32100000-0000-4000-8000-0000000000e2', '32100000-0000-4000-8000-0000000000b1'),
  ('32100000-0000-4000-8000-0000000000e2', '32100000-0000-4000-8000-0000000000b2'),
  ('32100000-0000-4000-8000-0000000000e3', '32100000-0000-4000-8000-0000000000b1'),
  ('32100000-0000-4000-8000-0000000000e3', '32100000-0000-4000-8000-0000000000b2');

insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  ('32100000-0000-4000-8000-0000000000a1', '32100000-0000-4000-8000-0000000000e1', '32100000-0000-4000-8000-0000000000b1'),
  ('32100000-0000-4000-8000-0000000000a1', '32100000-0000-4000-8000-0000000000e2', '32100000-0000-4000-8000-0000000000b2'),
  ('32100000-0000-4000-8000-0000000000a3', '32100000-0000-4000-8000-0000000000e2', '32100000-0000-4000-8000-0000000000b2'),
  ('32100000-0000-4000-8000-0000000000a4', '32100000-0000-4000-8000-0000000000e2', '32100000-0000-4000-8000-0000000000b2');

-- Group d1 of B, coached by C, holds Z.
insert into public.training_groups (id, school_id, name) values
  ('32100000-0000-4000-8000-0000000000d1', '32100000-0000-4000-8000-0000000000b2', 'Coach Scope Group B');
insert into public.athlete_groups (athlete_id, group_id) values
  ('32100000-0000-4000-8000-0000000000e3', '32100000-0000-4000-8000-0000000000d1');
insert into public.coach_group_assignments (coach_user_id, group_id) values
  ('32100000-0000-4000-8000-0000000000a1', '32100000-0000-4000-8000-0000000000d1');

-- c1: C's series in A.
insert into public.timing_series (id, created_by, school_id, stroke, distance, pool, session_type, device_id) values
  ('32100000-0000-4000-8000-0000000000c1', '32100000-0000-4000-8000-0000000000a1', '32100000-0000-4000-8000-0000000000b1', 'FR', '50m', 'SCM', 'training', 'dev-c');

-- f1: CA's mark of Y in A. f2: CA's mark of X in A. f4: CB's mark of Y in B.
-- f5, f6: unassigned arrivals of C's series in A. f7: C's own mark of Y in A.
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, series_id, arrival_position, hundredths,
   stroke, distance, pool, session_type, source, device_id, captured_at)
select id, author, school, 'repetition', athlete, series, pos, 3100, 'FR', '50m', 'SCM', 'training',
       'screen_button', 'dev', '2026-10-24 08:00:00+00'
from (values
  ('32100000-0000-4000-8000-0000000000f1'::uuid, '32100000-0000-4000-8000-0000000000a2'::uuid, '32100000-0000-4000-8000-0000000000b1'::uuid,
   '32100000-0000-4000-8000-0000000000e2'::uuid, null::uuid, null::int),
  ('32100000-0000-4000-8000-0000000000f2', '32100000-0000-4000-8000-0000000000a2', '32100000-0000-4000-8000-0000000000b1',
   '32100000-0000-4000-8000-0000000000e1', null, null),
  ('32100000-0000-4000-8000-0000000000f4', '32100000-0000-4000-8000-0000000000a3', '32100000-0000-4000-8000-0000000000b2',
   '32100000-0000-4000-8000-0000000000e2', null, null),
  ('32100000-0000-4000-8000-0000000000f5', '32100000-0000-4000-8000-0000000000a1', '32100000-0000-4000-8000-0000000000b1',
   null, '32100000-0000-4000-8000-0000000000c1', 1),
  ('32100000-0000-4000-8000-0000000000f6', '32100000-0000-4000-8000-0000000000a1', '32100000-0000-4000-8000-0000000000b1',
   null, '32100000-0000-4000-8000-0000000000c1', 2),
  ('32100000-0000-4000-8000-0000000000f7', '32100000-0000-4000-8000-0000000000a1', '32100000-0000-4000-8000-0000000000b1',
   '32100000-0000-4000-8000-0000000000e2', null, null)
) as v(id, author, school, athlete, series, pos);

set local role authenticated;
set local request.jwt.claims = '{"sub": "32100000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

-- Inserts: Y and Z only in B, X in A.
select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values ('32100000-0000-4000-8000-0000000000b1', 'repetition', '32100000-0000-4000-8000-0000000000e2', 3200,
             'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-24 09:00:00+00') $$,
  '42501', 'new row violates row-level security policy for table "measurements"',
  'C cannot record a mark of Y in A, where Y is not in C''s charge'
);
select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values ('32100000-0000-4000-8000-0000000000b1', 'repetition', '32100000-0000-4000-8000-0000000000e3', 3200,
             'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-24 09:00:00+00') $$,
  '42501', 'new row violates row-level security policy for table "measurements"',
  'C cannot record a mark of Z in A, although C coaches Z''s group in B'
);
select lives_ok(
  $$ insert into public.measurements
       (id, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values ('32100000-0000-4000-8000-0000000000d2', '32100000-0000-4000-8000-0000000000b2', 'repetition', '32100000-0000-4000-8000-0000000000e2', 3200,
             'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-24 09:00:00+00') $$,
  'C records a mark of Y in B'
);
select lives_ok(
  $$ insert into public.measurements
       (id, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values ('32100000-0000-4000-8000-0000000000d3', '32100000-0000-4000-8000-0000000000b2', 'repetition', '32100000-0000-4000-8000-0000000000e3', 3200,
             'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-24 09:00:00+00') $$,
  'C records a mark of Z in B, through the group'
);
select lives_ok(
  $$ insert into public.measurements
       (id, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values ('32100000-0000-4000-8000-0000000000d4', '32100000-0000-4000-8000-0000000000b1', 'repetition', '32100000-0000-4000-8000-0000000000e1', 3200,
             'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-24 09:00:00+00') $$,
  'C still records a mark of X in A'
);

-- Edits of other authors' marks.
select is_empty(
  $$ update public.measurements set hundredths = 1111, base_version = 1, edited_device_id = 'dev-c'
     where id = '32100000-0000-4000-8000-0000000000f1' returning id $$,
  'C cannot edit CA''s mark of Y in A'
);
select is_empty(
  $$ update public.measurements set hundredths = 1112, base_version = null, edited_device_id = 'dev-c'
     where id = '32100000-0000-4000-8000-0000000000f1' returning id $$,
  'a stale edit by C of the same mark is not taken either'
);
select isnt_empty(
  $$ update public.measurements set hundredths = 1113, base_version = 1, edited_device_id = 'dev-c'
     where id = '32100000-0000-4000-8000-0000000000f4' returning id $$,
  'C edits CB''s mark of Y in B'
);
select isnt_empty(
  $$ update public.measurements set hundredths = 1114, base_version = 1, edited_device_id = 'dev-c'
     where id = '32100000-0000-4000-8000-0000000000f2' returning id $$,
  'C still edits CA''s mark of X in A'
);

-- Naming arrivals and moving marks between athletes, inside the school.
select throws_ok(
  $$ update public.measurements set athlete_id = '32100000-0000-4000-8000-0000000000e2', base_version = 1
     where id = '32100000-0000-4000-8000-0000000000f5' $$,
  '42501', 'the athlete of a measurement can only move between athletes of the coach',
  'C cannot name an arrival of A with Y'
);
select throws_ok(
  $$ update public.measurements set athlete_id = '32100000-0000-4000-8000-0000000000e3', base_version = 1
     where id = '32100000-0000-4000-8000-0000000000f5' $$,
  '42501', 'the athlete of a measurement can only move between athletes of the coach',
  'C cannot name an arrival of A with Z'
);
select lives_ok(
  $$ update public.measurements set athlete_id = '32100000-0000-4000-8000-0000000000e1', base_version = 1
     where id = '32100000-0000-4000-8000-0000000000f6' $$,
  'C names an arrival of A with X'
);
select throws_ok(
  $$ update public.measurements set athlete_id = '32100000-0000-4000-8000-0000000000e1', base_version = 1
     where id = '32100000-0000-4000-8000-0000000000f7' $$,
  '42501', 'the athlete of a measurement can only move between athletes of the coach',
  'C cannot move their own mark of Y in A to X: Y is not in C''s charge in A'
);

-- D coaches Y only in B, so in A D edits as a school admin, with a reason.
set local request.jwt.claims = '{"sub": "32100000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok(
  $$ update public.measurements set hundredths = 2222, base_version = 1, edited_device_id = 'dev-d'
     where id = '32100000-0000-4000-8000-0000000000f1' $$,
  '42501', 'a school admin needs a reason to edit a time',
  'D needs a reason to edit Y''s mark in A'
);
select lives_ok(
  $$ update public.measurements set hundredths = 2222, edit_reason = 'Synthetic correction', base_version = 1, edited_device_id = 'dev-d'
     where id = '32100000-0000-4000-8000-0000000000f1' $$,
  'D edits it with a reason'
);

reset role;
select is(
  (select hundredths || '|' || version from public.measurements where id = '32100000-0000-4000-8000-0000000000f1'),
  '2222|2',
  'f1 holds only D''s edit'
);
select is(
  (select count(*)::int from public.measurement_conflicts where measurement_id = '32100000-0000-4000-8000-0000000000f1'),
  0,
  'C''s stale edit of f1 left no conflict'
);
select is(
  (select hundredths from public.measurements where id = '32100000-0000-4000-8000-0000000000f4'),
  1113, 'C''s edit of f4 applied'
);
select is(
  (select hundredths from public.measurements where id = '32100000-0000-4000-8000-0000000000f2'),
  1114, 'C''s edit of f2 applied'
);
select is(
  (select athlete_id from public.measurements where id = '32100000-0000-4000-8000-0000000000f5'),
  null::uuid, 'f5 is still unassigned'
);
select is(
  (select athlete_id from public.measurements where id = '32100000-0000-4000-8000-0000000000f6'),
  '32100000-0000-4000-8000-0000000000e1'::uuid, 'f6 is X'
);
select is(
  (select athlete_id from public.measurements where id = '32100000-0000-4000-8000-0000000000f7'),
  '32100000-0000-4000-8000-0000000000e2'::uuid, 'f7 is still Y'
);

-- The charge function: signed-in users may call it, and it answers only about
-- the caller's own charge.
select ok(
  has_function_privilege('authenticated', 'app.coach_has_athlete_in_school(uuid, uuid)', 'execute'),
  'signed-in users can execute the charge function'
);
select ok(
  not has_function_privilege('anon', 'app.coach_has_athlete_in_school(uuid, uuid)', 'execute')
    and not has_function_privilege('public', 'app.coach_has_athlete_in_school(uuid, uuid)', 'execute'),
  'anon and public cannot execute it'
);
set local role anon;
select throws_ok(
  $$ select app.coach_has_athlete_in_school('32100000-0000-4000-8000-0000000000e2', '32100000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'an anonymous client cannot call it'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "32100000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(
  app.coach_has_athlete_in_school('32100000-0000-4000-8000-0000000000e2', '32100000-0000-4000-8000-0000000000b2'),
  false, 'a user with no relations gets false'
);
set local request.jwt.claims = '{"sub": "32100000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  app.coach_has_athlete_in_school('32100000-0000-4000-8000-0000000000e2', '32100000-0000-4000-8000-0000000000b2'),
  false, 'a coach of A asking about Y in B (CB''s charge) gets false'
);
set local request.jwt.claims = '{"sub": "32100000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  app.coach_has_athlete_in_school('32100000-0000-4000-8000-0000000000e2', '32100000-0000-4000-8000-0000000000b2'),
  true, 'C gets true for Y in B'
);
select is(
  app.coach_has_athlete_in_school('32100000-0000-4000-8000-0000000000e2', '32100000-0000-4000-8000-0000000000b1'),
  false, 'C gets false for Y in A, where Y is not in C''s charge'
);

select * from finish();
rollback;
