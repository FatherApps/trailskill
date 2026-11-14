-- Coach invitations of a school (issue #961): only the admin of a school creates
-- and reads its invitations. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Users: school admin A (school A), school admin B (school B), coach of A,
-- guardian of an athlete of school A, and an unrelated user.
insert into auth.users (id, email) values
  ('96100000-0000-4000-8000-0000000000a1', 'admin-a@example.test'),
  ('96100000-0000-4000-8000-0000000000a2', 'admin-b@example.test'),
  ('96100000-0000-4000-8000-0000000000a3', 'coach-a@example.test'),
  ('96100000-0000-4000-8000-0000000000a4', 'guardian-g@example.test'),
  ('96100000-0000-4000-8000-0000000000a5', 'unrelated-u@example.test');

insert into public.schools (id, name) values
  ('96100000-0000-4000-8000-0000000000b1', 'Invitations School A'),
  ('96100000-0000-4000-8000-0000000000b2', 'Invitations School B');

insert into public.school_memberships (school_id, user_id, role) values
  ('96100000-0000-4000-8000-0000000000b1', '96100000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('96100000-0000-4000-8000-0000000000b2', '96100000-0000-4000-8000-0000000000a2', 'school_admin'),
  ('96100000-0000-4000-8000-0000000000b1', '96100000-0000-4000-8000-0000000000a3', 'coach');

insert into public.athletes (id, first_name, last_name)
values ('96100000-0000-4000-8000-0000000000e1', 'Athlete', 'E1');
insert into public.athlete_schools (athlete_id, school_id)
values ('96100000-0000-4000-8000-0000000000e1', '96100000-0000-4000-8000-0000000000b1');
insert into public.athlete_managers (user_id, athlete_id, relation)
values ('96100000-0000-4000-8000-0000000000a4', '96100000-0000-4000-8000-0000000000e1', 'guardian');

-- One invitation per school, written as the owner.
insert into public.coach_invitations (id, created_by, school_id, email) values
  ('96100000-0000-4000-8000-0000000000c1', '96100000-0000-4000-8000-0000000000a1', '96100000-0000-4000-8000-0000000000b1', 'seed-a@example.test'),
  ('96100000-0000-4000-8000-0000000000c2', '96100000-0000-4000-8000-0000000000a2', '96100000-0000-4000-8000-0000000000b2', 'seed-b@example.test');

set local role authenticated;

-- School admin A
set local request.jwt.claims = '{"sub": "96100000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.coach_invitations (school_id, email)
     values ('96100000-0000-4000-8000-0000000000b1', 'new-coach@example.test') $$,
  'school admin A invites a coach to school A'
);
select is(
  (select status from public.coach_invitations where email = 'new-coach@example.test'),
  'pending',
  'the new invitation is pending'
);
select is(
  (select created_by from public.coach_invitations where email = 'new-coach@example.test'),
  '96100000-0000-4000-8000-0000000000a1'::uuid,
  'the new invitation records the admin who created it'
);
select set_eq(
  $$ select email from public.coach_invitations $$,
  $$ values ('seed-a@example.test'), ('new-coach@example.test') $$,
  'school admin A reads only the invitations of school A'
);
select throws_ok(
  $$ insert into public.coach_invitations (school_id, email)
     values ('96100000-0000-4000-8000-0000000000b2', 'other@example.test') $$,
  '42501', null,
  'school admin A cannot invite to school B'
);
select throws_ok(
  $$ insert into public.coach_invitations (created_by, school_id, email)
     values ('96100000-0000-4000-8000-0000000000a2', '96100000-0000-4000-8000-0000000000b1', 'forged@example.test') $$,
  '42501', null,
  'school admin A cannot forge created_by'
);
select throws_ok(
  $$ insert into public.coach_invitations (school_id, email)
     values ('96100000-0000-4000-8000-0000000000b1', 'not-an-email') $$,
  '23514', null,
  'an email without a domain is refused'
);
select throws_ok(
  $$ insert into public.coach_invitations (school_id, email)
     values ('96100000-0000-4000-8000-0000000000b1', 'Mixed@Example.test') $$,
  '23514', null,
  'an email that is not lowercase is refused'
);
select throws_ok(
  $$ insert into public.coach_invitations (school_id, email)
     values ('96100000-0000-4000-8000-0000000000b1', 'seed-a@example.test') $$,
  '23505', null,
  'a second pending invitation for the same email in the school is refused'
);
select throws_ok(
  $$ update public.coach_invitations set email = 'changed@example.test' $$,
  '42501', null,
  'school admin A cannot update an invitation'
);
select throws_ok(
  $$ delete from public.coach_invitations $$,
  '42501', null,
  'school admin A cannot delete an invitation'
);

-- School admin B
set local request.jwt.claims = '{"sub": "96100000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select set_eq(
  $$ select email from public.coach_invitations $$,
  $$ values ('seed-b@example.test') $$,
  'school admin B reads only the invitations of school B'
);
select throws_ok(
  $$ insert into public.coach_invitations (school_id, email)
     values ('96100000-0000-4000-8000-0000000000b1', 'other@example.test') $$,
  '42501', null,
  'school admin B cannot invite to school A'
);

-- Coach of school A
set local request.jwt.claims = '{"sub": "96100000-0000-4000-8000-0000000000a3", "role": "authenticated"}';

select is_empty($$ select 1 from public.coach_invitations $$, 'a coach reads no invitation');
select throws_ok(
  $$ insert into public.coach_invitations (school_id, email)
     values ('96100000-0000-4000-8000-0000000000b1', 'other@example.test') $$,
  '42501', null,
  'a coach cannot invite'
);

-- Guardian
set local request.jwt.claims = '{"sub": "96100000-0000-4000-8000-0000000000a4", "role": "authenticated"}';

select is_empty($$ select 1 from public.coach_invitations $$, 'a guardian reads no invitation');
select throws_ok(
  $$ insert into public.coach_invitations (school_id, email)
     values ('96100000-0000-4000-8000-0000000000b1', 'other@example.test') $$,
  '42501', null,
  'a guardian cannot invite'
);

-- Unrelated user
set local request.jwt.claims = '{"sub": "96100000-0000-4000-8000-0000000000a5", "role": "authenticated"}';

select is_empty($$ select 1 from public.coach_invitations $$, 'an unrelated user reads no invitation');
select throws_ok(
  $$ insert into public.coach_invitations (school_id, email)
     values ('96100000-0000-4000-8000-0000000000b1', 'other@example.test') $$,
  '42501', null,
  'an unrelated user cannot invite'
);

-- Anonymous
set local role anon;
select throws_ok(
  $$ select 1 from public.coach_invitations $$,
  '42501', null,
  'anon has no access to the table'
);

reset role;

select has_table('public', 'coach_invitations', 'the coach_invitations table exists');
select col_is_fk('public', 'coach_invitations', 'school_id', 'school_id references a school');
select col_not_null('public', 'coach_invitations', 'email', 'email is required');
select is(
  (select relrowsecurity from pg_class where oid = 'public.coach_invitations'::regclass),
  true,
  'row level security is on'
);
select is_empty(
  $$ select 1 from pg_publication_tables where tablename = 'coach_invitations' $$,
  'the table is not published to powersync'
);

select * from finish();
rollback;
