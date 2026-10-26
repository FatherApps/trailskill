-- A school admin edits a measurement only when they administer the
-- measurement's school (issue #333). D is school admin of A and coach of B, and
-- does not have Y in their charge in B. Y is in A and B. D may correct Y's marks
-- of A with a reason, but not Y's marks of B. S is school admin of A only. All
-- users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Users: D, S (admin of A only), coach CA of A, coach CB of B (Y in charge in
-- B) and N, with no relations.
insert into auth.users (id, email) values
  ('33300000-0000-4000-8000-0000000000a1', 'admin-d@example.test'),
  ('33300000-0000-4000-8000-0000000000a2', 'admin-s@example.test'),
  ('33300000-0000-4000-8000-0000000000a3', 'coach-ca@example.test'),
  ('33300000-0000-4000-8000-0000000000a4', 'coach-cb@example.test'),
  ('33300000-0000-4000-8000-0000000000a5', 'nobody-n@example.test');

insert into public.schools (id, name) values
  ('33300000-0000-4000-8000-0000000000b1', 'Admin Scope School A'),
  ('33300000-0000-4000-8000-0000000000b2', 'Admin Scope School B');

insert into public.school_memberships (school_id, user_id, role) values
  ('33300000-0000-4000-8000-0000000000b1', '33300000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('33300000-0000-4000-8000-0000000000b2', '33300000-0000-4000-8000-0000000000a1', 'coach'),
  ('33300000-0000-4000-8000-0000000000b1', '33300000-0000-4000-8000-0000000000a2', 'school_admin'),
  ('33300000-0000-4000-8000-0000000000b1', '33300000-0000-4000-8000-0000000000a3', 'coach'),
  ('33300000-0000-4000-8000-0000000000b2', '33300000-0000-4000-8000-0000000000a4', 'coach');

insert into public.athletes (id, first_name, last_name) values
  ('33300000-0000-4000-8000-0000000000e1', 'Athlete', 'Y');

insert into public.athlete_schools (athlete_id, school_id) values
  ('33300000-0000-4000-8000-0000000000e1', '33300000-0000-4000-8000-0000000000b1'),
  ('33300000-0000-4000-8000-0000000000e1', '33300000-0000-4000-8000-0000000000b2');

insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  ('33300000-0000-4000-8000-0000000000a3', '33300000-0000-4000-8000-0000000000e1', '33300000-0000-4000-8000-0000000000b1'),
  ('33300000-0000-4000-8000-0000000000a4', '33300000-0000-4000-8000-0000000000e1', '33300000-0000-4000-8000-0000000000b2');

-- f1, f3: CA's marks of Y in A. f2: CB's mark of Y in B.
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, hundredths,
   stroke, distance, pool, session_type, source, device_id, captured_at)
select id, author, school, 'repetition', '33300000-0000-4000-8000-0000000000e1', 3100, 'FR', '50m', 'SCM', 'training',
       'screen_button', 'dev', '2026-10-24 08:00:00+00'
from (values
  ('33300000-0000-4000-8000-0000000000f1'::uuid, '33300000-0000-4000-8000-0000000000a3'::uuid, '33300000-0000-4000-8000-0000000000b1'::uuid),
  ('33300000-0000-4000-8000-0000000000f2', '33300000-0000-4000-8000-0000000000a4', '33300000-0000-4000-8000-0000000000b2'),
  ('33300000-0000-4000-8000-0000000000f3', '33300000-0000-4000-8000-0000000000a3', '33300000-0000-4000-8000-0000000000b1')
) as v(id, author, school);

set local role authenticated;

-- D, admin of A and coach of B without Y in charge in B.
set local request.jwt.claims = '{"sub": "33300000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is_empty(
  $$ update public.measurements set hundredths = 1111, edit_reason = 'Synthetic correction', base_version = 1, edited_device_id = 'dev-d'
     where id = '33300000-0000-4000-8000-0000000000f2' returning id $$,
  'D cannot edit Y''s mark of B, even with a reason'
);
select is_empty(
  $$ update public.measurements set hundredths = 1112, base_version = 1, edited_device_id = 'dev-d'
     where id = '33300000-0000-4000-8000-0000000000f2' returning id $$,
  'nor without one'
);
select throws_ok(
  $$ update public.measurements set hundredths = 2221, base_version = 1, edited_device_id = 'dev-d'
     where id = '33300000-0000-4000-8000-0000000000f1' $$,
  '42501', 'a school admin needs a reason to edit a time',
  'D needs a reason to edit Y''s mark of A'
);
select isnt_empty(
  $$ update public.measurements set hundredths = 2222, edit_reason = 'Synthetic correction', base_version = 1, edited_device_id = 'dev-d'
     where id = '33300000-0000-4000-8000-0000000000f1' returning id $$,
  'D corrects Y''s mark of A with a reason'
);

-- S, admin of A only: unchanged behavior.
set local request.jwt.claims = '{"sub": "33300000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ update public.measurements set hundredths = 3331, base_version = 1, edited_device_id = 'dev-s'
     where id = '33300000-0000-4000-8000-0000000000f3' $$,
  '42501', 'a school admin needs a reason to edit a time',
  'S needs a reason to edit Y''s mark of A'
);
select isnt_empty(
  $$ update public.measurements set hundredths = 3332, edit_reason = 'Synthetic correction', base_version = 1, edited_device_id = 'dev-s'
     where id = '33300000-0000-4000-8000-0000000000f3' returning id $$,
  'S corrects it with a reason'
);
select is_empty(
  $$ update public.measurements set hundredths = 3333, edit_reason = 'Synthetic correction', base_version = 1, edited_device_id = 'dev-s'
     where id = '33300000-0000-4000-8000-0000000000f2' returning id $$,
  'S cannot edit Y''s mark of B'
);

reset role;
select is(
  (select hundredths || '|' || version from public.measurements where id = '33300000-0000-4000-8000-0000000000f2'),
  '3100|1', 'f2 is untouched'
);
select is(
  (select hundredths || '|' || version from public.measurements where id = '33300000-0000-4000-8000-0000000000f1'),
  '2222|2', 'f1 holds only D''s edit with a reason'
);
select is(
  (select hundredths || '|' || version from public.measurements where id = '33300000-0000-4000-8000-0000000000f3'),
  '3332|2', 'f3 holds only S''s edit with a reason'
);

-- The admin function: signed-in users may call it, and it answers only about
-- the caller's own schools.
select ok(
  has_function_privilege('authenticated', 'app.admin_has_athlete_in_school(uuid, uuid)', 'execute'),
  'signed-in users can execute the admin function'
);
select ok(
  not has_function_privilege('anon', 'app.admin_has_athlete_in_school(uuid, uuid)', 'execute')
    and not has_function_privilege('public', 'app.admin_has_athlete_in_school(uuid, uuid)', 'execute'),
  'anon and public cannot execute it'
);
set local role anon;
select throws_ok(
  $$ select app.admin_has_athlete_in_school('33300000-0000-4000-8000-0000000000e1', '33300000-0000-4000-8000-0000000000b1') $$,
  '42501', null,
  'an anonymous client cannot call it'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "33300000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(
  app.admin_has_athlete_in_school('33300000-0000-4000-8000-0000000000e1', '33300000-0000-4000-8000-0000000000b1'),
  false, 'a user with no relations gets false'
);
set local request.jwt.claims = '{"sub": "33300000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  app.admin_has_athlete_in_school('33300000-0000-4000-8000-0000000000e1', '33300000-0000-4000-8000-0000000000b1'),
  true, 'D gets true for Y in A'
);
select is(
  app.admin_has_athlete_in_school('33300000-0000-4000-8000-0000000000e1', '33300000-0000-4000-8000-0000000000b2'),
  false, 'D gets false for Y in B, where D is staff but not admin'
);
set local request.jwt.claims = '{"sub": "33300000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is(
  app.admin_has_athlete_in_school('33300000-0000-4000-8000-0000000000e1', '33300000-0000-4000-8000-0000000000b2'),
  false, 'a coach of Y in B who is not admin gets false'
);

select * from finish();
rollback;
