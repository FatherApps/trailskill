-- What the school console reads to list the coaches of a school (issue #354):
-- school_memberships, as each kind of user sees it. All users and data here are
-- synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Users: school admin A (school A), coaches A1 and A2 (school A), coach B and
-- school admin B (school B), guardian G of an athlete of school A, and U with
-- no memberships and no athletes.
insert into auth.users (id, email) values
  ('35400000-0000-4000-8000-0000000000a1', 'admin-a@example.test'),
  ('35400000-0000-4000-8000-0000000000a2', 'coach-a1@example.test'),
  ('35400000-0000-4000-8000-0000000000a3', 'coach-a2@example.test'),
  ('35400000-0000-4000-8000-0000000000a4', 'coach-b@example.test'),
  ('35400000-0000-4000-8000-0000000000a5', 'admin-b@example.test'),
  ('35400000-0000-4000-8000-0000000000a6', 'guardian-g@example.test'),
  ('35400000-0000-4000-8000-0000000000a7', 'unrelated-u@example.test');

insert into public.schools (id, name) values
  ('35400000-0000-4000-8000-0000000000b1', 'Coaches Read School A'),
  ('35400000-0000-4000-8000-0000000000b2', 'Coaches Read School B');

insert into public.school_memberships (school_id, user_id, role) values
  ('35400000-0000-4000-8000-0000000000b1', '35400000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('35400000-0000-4000-8000-0000000000b1', '35400000-0000-4000-8000-0000000000a2', 'coach'),
  ('35400000-0000-4000-8000-0000000000b1', '35400000-0000-4000-8000-0000000000a3', 'coach'),
  ('35400000-0000-4000-8000-0000000000b2', '35400000-0000-4000-8000-0000000000a4', 'coach'),
  ('35400000-0000-4000-8000-0000000000b2', '35400000-0000-4000-8000-0000000000a5', 'school_admin');

insert into public.athletes (id, first_name, last_name)
values ('35400000-0000-4000-8000-0000000000e1', 'Athlete', 'E1');
insert into public.athlete_schools (athlete_id, school_id)
values ('35400000-0000-4000-8000-0000000000e1', '35400000-0000-4000-8000-0000000000b1');
insert into public.athlete_managers (user_id, athlete_id, relation)
values ('35400000-0000-4000-8000-0000000000a6', '35400000-0000-4000-8000-0000000000e1', 'guardian');

set local role authenticated;

-- School admin A
set local request.jwt.claims = '{"sub": "35400000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select set_eq(
  $$ select user_id from public.school_memberships
     where school_id = '35400000-0000-4000-8000-0000000000b1' and role = 'coach' $$,
  $$ values ('35400000-0000-4000-8000-0000000000a2'::uuid), ('35400000-0000-4000-8000-0000000000a3'::uuid) $$,
  'school admin A sees the coach memberships of school A'
);
select is_empty(
  $$ select 1 from public.school_memberships where school_id = '35400000-0000-4000-8000-0000000000b2' $$,
  'school admin A sees no membership of school B'
);
select is_empty(
  $$ select 1 from public.school_memberships
     where school_id = '35400000-0000-4000-8000-0000000000b1' and role = 'coach'
       and user_id = '35400000-0000-4000-8000-0000000000a1' $$,
  'the coach list query leaves out the school admin'
);
select is(
  (select count(*) from public.school_memberships),
  3::bigint,
  'school admin A sees only the three memberships of school A'
);

-- Coach A1
set local request.jwt.claims = '{"sub": "35400000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select set_eq(
  $$ select user_id from public.school_memberships $$,
  $$ values ('35400000-0000-4000-8000-0000000000a2'::uuid) $$,
  'coach A1 sees only their own membership'
);
select is_empty(
  $$ select 1 from public.school_memberships where user_id = '35400000-0000-4000-8000-0000000000a3' $$,
  'coach A1 does not see the membership of another coach'
);

-- Guardian G
set local request.jwt.claims = '{"sub": "35400000-0000-4000-8000-0000000000a6", "role": "authenticated"}';

select is_empty(
  $$ select 1 from public.school_memberships $$,
  'a guardian sees no school membership'
);

-- Unrelated user U
set local request.jwt.claims = '{"sub": "35400000-0000-4000-8000-0000000000a7", "role": "authenticated"}';

select is_empty(
  $$ select 1 from public.school_memberships $$,
  'a user without memberships sees no school membership'
);

-- School admin B sees none of school A
set local request.jwt.claims = '{"sub": "35400000-0000-4000-8000-0000000000a5", "role": "authenticated"}';

select is_empty(
  $$ select 1 from public.school_memberships where school_id = '35400000-0000-4000-8000-0000000000b1' $$,
  'school admin B sees no membership of school A'
);

select * from finish();
rollback;
