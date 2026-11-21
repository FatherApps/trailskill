-- Who may edit the first and last name of an athlete (issue #1364): a guardian or the adult athlete themself
-- (athlete_managers), and a platform admin as before. Nobody else, and nothing but the two name columns for
-- a manager. All users and data are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- Users: guardian G, adult athlete X (relation 'self'), guardian G2 of another athlete, coach A, school admin S,
-- stranger N, platform admin P, and guardian M whose account is marked for deletion.
insert into auth.users (id, email) values
  ('13640000-0000-4000-8000-0000000000a1', 'name-coach-a@example.test'),
  ('13640000-0000-4000-8000-0000000000a2', 'name-guardian-g@example.test'),
  ('13640000-0000-4000-8000-0000000000a3', 'name-adult-x@example.test'),
  ('13640000-0000-4000-8000-0000000000a4', 'name-admin-s@example.test'),
  ('13640000-0000-4000-8000-0000000000a5', 'name-stranger-n@example.test'),
  ('13640000-0000-4000-8000-0000000000a6', 'name-guardian-g2@example.test'),
  ('13640000-0000-4000-8000-0000000000a7', 'name-platform-p@example.test'),
  ('13640000-0000-4000-8000-0000000000a8', 'name-guardian-m@example.test');

insert into public.platform_admins (user_id) values ('13640000-0000-4000-8000-0000000000a7');

insert into public.schools (id, name) values ('13640000-0000-4000-8000-0000000000b1', 'Name School One');

insert into public.training_groups (id, school_id, name)
values ('13640000-0000-4000-8000-0000000000d1', '13640000-0000-4000-8000-0000000000b1', 'Name Group One');

insert into public.school_memberships (school_id, user_id, role) values
  ('13640000-0000-4000-8000-0000000000b1', '13640000-0000-4000-8000-0000000000a1', 'coach'),
  ('13640000-0000-4000-8000-0000000000b1', '13640000-0000-4000-8000-0000000000a4', 'school_admin');

insert into public.coach_group_assignments (coach_user_id, group_id)
values ('13640000-0000-4000-8000-0000000000a1', '13640000-0000-4000-8000-0000000000d1');

-- e1: G's. e2: the adult athlete X. e3: G2's. e4: G's, with a last name longer than the new limit (stored before the rule).
-- e5: M's (marked account).
insert into public.athletes (id, first_name, last_name) values
  ('13640000-0000-4000-8000-0000000000e1', 'Athlete', 'One'),
  ('13640000-0000-4000-8000-0000000000e2', 'Athlete', 'Two'),
  ('13640000-0000-4000-8000-0000000000e3', 'Athlete', 'Three'),
  ('13640000-0000-4000-8000-0000000000e4', 'Athlete', repeat('b', 150)),
  ('13640000-0000-4000-8000-0000000000e5', 'Athlete', 'Five');

insert into public.athlete_schools (athlete_id, school_id) values
  ('13640000-0000-4000-8000-0000000000e1', '13640000-0000-4000-8000-0000000000b1'),
  ('13640000-0000-4000-8000-0000000000e2', '13640000-0000-4000-8000-0000000000b1'),
  ('13640000-0000-4000-8000-0000000000e3', '13640000-0000-4000-8000-0000000000b1');

insert into public.athlete_groups (athlete_id, group_id) values
  ('13640000-0000-4000-8000-0000000000e1', '13640000-0000-4000-8000-0000000000d1'),
  ('13640000-0000-4000-8000-0000000000e3', '13640000-0000-4000-8000-0000000000d1');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('13640000-0000-4000-8000-0000000000a2', '13640000-0000-4000-8000-0000000000e1', 'guardian'),
  ('13640000-0000-4000-8000-0000000000a3', '13640000-0000-4000-8000-0000000000e2', 'self'),
  ('13640000-0000-4000-8000-0000000000a6', '13640000-0000-4000-8000-0000000000e3', 'guardian'),
  ('13640000-0000-4000-8000-0000000000a2', '13640000-0000-4000-8000-0000000000e4', 'guardian'),
  ('13640000-0000-4000-8000-0000000000a8', '13640000-0000-4000-8000-0000000000e5', 'guardian');

-- G: renames their swimmer (the names are stored trimmed); the same update on someone else's swimmer changes nothing.
set local role authenticated;
set local request.jwt.claims = '{"sub": "13640000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$update public.athletes set first_name = '  Lucía ', last_name = 'Gómez' where id = '13640000-0000-4000-8000-0000000000e1'$$,
  'a guardian renames their swimmer'
);
select lives_ok(
  $$update public.athletes set first_name = 'Hack' where id = '13640000-0000-4000-8000-0000000000e3'$$,
  'a guardian update of another swimmer is filtered, not an error'
);
select throws_ok(
  $$update public.athletes set created_by = '13640000-0000-4000-8000-0000000000a2' where id = '13640000-0000-4000-8000-0000000000e1'$$,
  '42501', null, 'a guardian cannot change another column'
);
select throws_ok(
  $$update public.athletes set first_name = 'Lucía', created_at = now() - interval '1 year' where id = '13640000-0000-4000-8000-0000000000e1'$$,
  '42501', null, 'a guardian cannot change another column together with the name'
);
select throws_ok(
  $$update public.athletes set first_name = '' where id = '13640000-0000-4000-8000-0000000000e1'$$,
  '23514', null, 'an empty first name is rejected'
);
select throws_ok(
  $$update public.athletes set first_name = '   ' where id = '13640000-0000-4000-8000-0000000000e1'$$,
  '23514', null, 'a first name of spaces is rejected'
);
select throws_ok(
  $$update public.athletes set last_name = ' ' where id = '13640000-0000-4000-8000-0000000000e1'$$,
  '23514', null, 'a last name of spaces is rejected'
);
select throws_ok(
  $$update public.athletes set last_name = repeat('a', 101) where id = '13640000-0000-4000-8000-0000000000e1'$$,
  '23514', null, 'a last name over 100 characters is rejected'
);
select throws_ok(
  $$update public.athletes set first_name = 'Lu' || chr(9) || 'cía' where id = '13640000-0000-4000-8000-0000000000e1'$$,
  '23514', null, 'a name with a control character is rejected'
);
select lives_ok(
  $$update public.athletes set first_name = 'Ana' where id = '13640000-0000-4000-8000-0000000000e4'$$,
  'a name edit leaves a long last name stored before the rule alone'
);
select lives_ok(
  $$delete from public.athletes where id = '13640000-0000-4000-8000-0000000000e1'$$,
  'a guardian delete is filtered, not an error'
);
select throws_ok(
  $$insert into public.athletes (first_name, last_name) values ('New', 'Athlete')$$,
  '42501', null, 'a guardian cannot insert an athlete'
);
reset role;
select is(
  (select first_name || '|' || last_name from public.athletes where id = '13640000-0000-4000-8000-0000000000e1'),
  'Lucía|Gómez',
  'the guardian edit is stored, trimmed, and every rejected edit left it alone'
);
select is(
  (select first_name from public.athletes where id = '13640000-0000-4000-8000-0000000000e3'),
  'Athlete',
  'the swimmer of another guardian is unchanged'
);
select is(
  (select first_name || '|' || length(last_name) from public.athletes where id = '13640000-0000-4000-8000-0000000000e4'),
  'Ana|150',
  'the long legacy last name is kept'
);

-- X: the adult athlete edits themself.
set local role authenticated;
set local request.jwt.claims = '{"sub": "13640000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select lives_ok(
  $$update public.athletes set first_name = 'Ximena', last_name = 'Rojas' where id = '13640000-0000-4000-8000-0000000000e2'$$,
  'an adult athlete renames themself'
);
reset role;
select is(
  (select first_name || '|' || last_name from public.athletes where id = '13640000-0000-4000-8000-0000000000e2'),
  'Ximena|Rojas',
  'the adult athlete edit is stored'
);

-- Everyone else changes nothing: G2 (guardian of another swimmer), the coach, the school admin and a stranger.
set local role authenticated;
set local request.jwt.claims = '{"sub": "13640000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select lives_ok(
  $$update public.athletes set first_name = 'Hack', last_name = 'Hack' where id = '13640000-0000-4000-8000-0000000000e1'$$,
  'another guardian update is filtered'
);
set local request.jwt.claims = '{"sub": "13640000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$update public.athletes set first_name = 'Hack', last_name = 'Hack' where id = '13640000-0000-4000-8000-0000000000e1'$$,
  'a coach update is filtered'
);
set local request.jwt.claims = '{"sub": "13640000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select lives_ok(
  $$update public.athletes set first_name = 'Hack', last_name = 'Hack' where id = '13640000-0000-4000-8000-0000000000e1'$$,
  'a school admin update is filtered'
);
set local request.jwt.claims = '{"sub": "13640000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select lives_ok(
  $$update public.athletes set first_name = 'Hack', last_name = 'Hack' where id = '13640000-0000-4000-8000-0000000000e1'$$,
  'a stranger update is filtered'
);
reset role;
select is(
  (select first_name || '|' || last_name from public.athletes where id = '13640000-0000-4000-8000-0000000000e1'),
  'Lucía|Gómez',
  'another guardian, a coach, a school admin and a stranger changed nothing'
);

-- No signed-in user.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select lives_ok(
  $$update public.athletes set first_name = 'Hack' where id = '13640000-0000-4000-8000-0000000000e1'$$,
  'an anon update is filtered'
);
reset role;
select is(
  (select first_name from public.athletes where id = '13640000-0000-4000-8000-0000000000e1'),
  'Lucía',
  'anon changed nothing'
);

-- The platform admin keeps what it had: any column, and the names are still validated.
set local role authenticated;
set local request.jwt.claims = '{"sub": "13640000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select lives_ok(
  $$update public.athletes set first_name = 'Pablo', created_at = '2026-01-01T00:00:00Z' where id = '13640000-0000-4000-8000-0000000000e3'$$,
  'a platform admin still updates any column'
);
select throws_ok(
  $$update public.athletes set last_name = '  ' where id = '13640000-0000-4000-8000-0000000000e3'$$,
  '23514', null, 'a platform admin cannot store an empty name either'
);
reset role;
select is(
  (select first_name || '|' || created_at::date::text from public.athletes where id = '13640000-0000-4000-8000-0000000000e3'),
  'Pablo|2026-01-01',
  'the platform admin edit is stored'
);

-- M: a guardian whose account is marked for deletion is refused by the existing guard.
insert into public.account_deletion_requests (user_id, email, delete_after)
values ('13640000-0000-4000-8000-0000000000a8', 'name-guardian-m@example.test', now() + interval '30 days');
set local role authenticated;
set local request.jwt.claims = '{"sub": "13640000-0000-4000-8000-0000000000a8", "role": "authenticated"}';
select throws_ok(
  $$update public.athletes set first_name = 'Marked' where id = '13640000-0000-4000-8000-0000000000e5'$$,
  '42501', 'the account is marked for deletion', 'a marked account cannot rename its swimmer'
);
reset role;
select is(
  (select first_name from public.athletes where id = '13640000-0000-4000-8000-0000000000e5'),
  'Athlete',
  'the marked account left the name alone'
);

-- The trigger only limits the API: the security definer functions of the app (the owner) may still set any column.
reset request.jwt.claims;
select lives_ok(
  $$update public.athletes set first_name = 'Nadador', last_name = 'anterior', created_by = null where id = '13640000-0000-4000-8000-0000000000e5'$$,
  'the owner role still writes any column'
);
select is(
  (select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'athletes' and cmd = 'UPDATE'),
  2::bigint,
  'athletes has exactly the platform admin and the manager update policies'
);
select is(
  (select count(*) from pg_catalog.pg_trigger where tgrelid = 'public.athletes'::regclass and tgname = 'athletes_limit_name_edit'),
  1::bigint,
  'the name edit trigger is on athletes'
);
select is(
  (select count(*) from pg_catalog.pg_trigger where tgrelid = 'public.athletes'::regclass and tgname = 'account_marked_refuses_write'),
  1::bigint,
  'the marked-account guard is still on athletes'
);
select is(
  has_function_privilege('authenticated', 'app.athletes_limit_name_edit()', 'execute'),
  false,
  'clients cannot call the trigger function'
);
select is(
  (select count(*) from public.athletes where id = '13640000-0000-4000-8000-0000000000e1'),
  1::bigint,
  'the guardian delete removed nothing'
);
select is(
  (select count(*) from public.athletes where first_name = 'New'),
  0::bigint,
  'the guardian insert stored nothing'
);

select * from finish();
rollback;
