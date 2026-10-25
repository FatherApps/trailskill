-- Who sees and writes athletes: coaches through their groups and direct
-- assignments, guardians and adult athletes through athlete_managers, school
-- admins through their school. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Users: coach A, guardian G, adult athlete X (relation 'self'), school
-- admin S, and N with no relations.
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-0000000000a1', 'coach-a@example.test'),
  ('10000000-0000-4000-8000-0000000000a2', 'guardian-g@example.test'),
  ('10000000-0000-4000-8000-0000000000a3', 'adult-x@example.test'),
  ('10000000-0000-4000-8000-0000000000a4', 'admin-s@example.test'),
  ('10000000-0000-4000-8000-0000000000a5', 'no-relations@example.test');

-- School 1 (admin S, coach A) and school 2.
insert into public.schools (id, name) values
  ('10000000-0000-4000-8000-0000000000b1', 'Visibility School One'),
  ('10000000-0000-4000-8000-0000000000b2', 'Visibility School Two');

-- Group 1 is A's group; group 2 is another group of school 1; group 3 is in school 2.
insert into public.training_groups (id, school_id, name) values
  ('10000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000b1', 'Group One'),
  ('10000000-0000-4000-8000-0000000000d2', '10000000-0000-4000-8000-0000000000b1', 'Group Two'),
  ('10000000-0000-4000-8000-0000000000d3', '10000000-0000-4000-8000-0000000000b2', 'Group Three');

insert into public.school_memberships (school_id, user_id, role) values
  ('10000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000a1', 'coach'),
  ('10000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000a4', 'school_admin');

insert into public.coach_group_assignments (coach_user_id, group_id)
values ('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000d1');

-- Athletes: e1, e2 in group 1; e3, e4 in group 2 (e3 assigned directly to A);
-- e5 in school 2; e6 is the adult athlete X, in school 1 without a group.
insert into public.athletes (id, first_name, last_name) values
  ('10000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('10000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('10000000-0000-4000-8000-0000000000e3', 'Athlete', 'E3'),
  ('10000000-0000-4000-8000-0000000000e4', 'Athlete', 'E4'),
  ('10000000-0000-4000-8000-0000000000e5', 'Athlete', 'E5'),
  ('10000000-0000-4000-8000-0000000000e6', 'Athlete', 'E6');

insert into public.athlete_schools (athlete_id, school_id) values
  ('10000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-0000000000b1'),
  ('10000000-0000-4000-8000-0000000000e2', '10000000-0000-4000-8000-0000000000b1'),
  ('10000000-0000-4000-8000-0000000000e3', '10000000-0000-4000-8000-0000000000b1'),
  ('10000000-0000-4000-8000-0000000000e4', '10000000-0000-4000-8000-0000000000b1'),
  ('10000000-0000-4000-8000-0000000000e5', '10000000-0000-4000-8000-0000000000b2'),
  ('10000000-0000-4000-8000-0000000000e6', '10000000-0000-4000-8000-0000000000b1');

insert into public.athlete_groups (athlete_id, group_id) values
  ('10000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-0000000000d1'),
  ('10000000-0000-4000-8000-0000000000e2', '10000000-0000-4000-8000-0000000000d1'),
  ('10000000-0000-4000-8000-0000000000e3', '10000000-0000-4000-8000-0000000000d2'),
  ('10000000-0000-4000-8000-0000000000e4', '10000000-0000-4000-8000-0000000000d2'),
  ('10000000-0000-4000-8000-0000000000e5', '10000000-0000-4000-8000-0000000000d3');

insert into public.coach_athlete_assignments (coach_user_id, athlete_id)
values ('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000e3');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('10000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000e1', 'guardian'),
  ('10000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000e5', 'guardian'),
  ('10000000-0000-4000-8000-0000000000a3', '10000000-0000-4000-8000-0000000000e6', 'self');

set local role authenticated;

-- Coach A
set local request.jwt.claims = '{"sub": "10000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select set_eq(
  'select id from public.athletes',
  $$ values ('10000000-0000-4000-8000-0000000000e1'::uuid),
            ('10000000-0000-4000-8000-0000000000e2'::uuid),
            ('10000000-0000-4000-8000-0000000000e3'::uuid) $$,
  'coach A sees exactly the athletes of A''s groups plus A''s direct assignment'
);
select is_empty(
  $$ select 1 from public.athletes where id = '10000000-0000-4000-8000-0000000000e4' $$,
  'coach A does not see an athlete of another group'
);
select throws_ok(
  $$ insert into public.athlete_groups (athlete_id, group_id)
     values ('10000000-0000-4000-8000-0000000000e4', '10000000-0000-4000-8000-0000000000d1') $$,
  '42501', null,
  'coach A cannot insert into athlete_groups'
);

-- Guardian G
set local request.jwt.claims = '{"sub": "10000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select set_eq(
  'select id from public.athletes',
  $$ values ('10000000-0000-4000-8000-0000000000e1'::uuid),
            ('10000000-0000-4000-8000-0000000000e5'::uuid) $$,
  'guardian G sees only the athletes G manages'
);

-- Adult athlete X
set local request.jwt.claims = '{"sub": "10000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select set_eq(
  'select id from public.athletes',
  $$ values ('10000000-0000-4000-8000-0000000000e6'::uuid) $$,
  'an adult athlete with relation self sees only themselves'
);

-- School admin S
set local request.jwt.claims = '{"sub": "10000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select set_eq(
  'select id from public.athletes',
  $$ values ('10000000-0000-4000-8000-0000000000e1'::uuid),
            ('10000000-0000-4000-8000-0000000000e2'::uuid),
            ('10000000-0000-4000-8000-0000000000e3'::uuid),
            ('10000000-0000-4000-8000-0000000000e4'::uuid),
            ('10000000-0000-4000-8000-0000000000e6'::uuid) $$,
  'school admin S sees every athlete of S''s school and none of another school'
);
select lives_ok(
  $$ insert into public.athlete_groups (athlete_id, group_id)
     values ('10000000-0000-4000-8000-0000000000e4', '10000000-0000-4000-8000-0000000000d1') $$,
  'school admin S can insert into athlete_groups of S''s school'
);
select throws_ok(
  $$ insert into public.athlete_groups (athlete_id, group_id)
     values ('10000000-0000-4000-8000-0000000000e5', '10000000-0000-4000-8000-0000000000d3') $$,
  '42501', null,
  'school admin S cannot insert into athlete_groups of another school'
);

select throws_ok(
  $$ insert into public.athlete_schools (athlete_id, school_id)
     values ('10000000-0000-4000-8000-0000000000e5', '10000000-0000-4000-8000-0000000000b1') $$,
  '42501', null,
  'school admin S cannot link an athlete of another school to S''s school'
);

-- User with no relations
set local request.jwt.claims = '{"sub": "10000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is_empty('select 1 from public.athletes', 'a user with no relations sees no athletes');

-- Remove A's assignment to group 1 (as the test owner) and look again as A.
reset role;
delete from public.athlete_groups
where athlete_id = '10000000-0000-4000-8000-0000000000e4'
  and group_id = '10000000-0000-4000-8000-0000000000d1';
delete from public.coach_group_assignments
where coach_user_id = '10000000-0000-4000-8000-0000000000a1';
set local role authenticated;
set local request.jwt.claims = '{"sub": "10000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select set_eq(
  'select id from public.athletes',
  $$ values ('10000000-0000-4000-8000-0000000000e3'::uuid) $$,
  'after losing the group assignment, coach A no longer sees that group''s athletes'
);

-- Review 5: once A also loses the direct assignment, the server rejects A's
-- writes on that athlete, including putting the assignment back.
reset role;
delete from public.coach_athlete_assignments
where coach_user_id = '10000000-0000-4000-8000-0000000000a1';
set local role authenticated;
set local request.jwt.claims = '{"sub": "10000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is_empty('select 1 from public.athletes', 'coach A sees no athletes after losing every assignment');
select is_empty(
  $$ update public.athletes set first_name = 'Changed'
     where id = '10000000-0000-4000-8000-0000000000e3' returning id $$,
  'coach A updates no rows of a formerly assigned athlete'
);
select throws_ok(
  $$ insert into public.athlete_groups (athlete_id, group_id)
     values ('10000000-0000-4000-8000-0000000000e3', '10000000-0000-4000-8000-0000000000d2') $$,
  '42501', null,
  'coach A cannot add a formerly assigned athlete to a group'
);
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id)
     values ('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000e3') $$,
  '42501', null,
  'coach A cannot restore the lost assignment'
);

reset role;
select is(
  (select first_name from public.athletes where id = '10000000-0000-4000-8000-0000000000e3'),
  'Athlete',
  'the formerly assigned athlete is unchanged'
);

select * from finish();
rollback;
