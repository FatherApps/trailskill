-- What a school admin may no longer do (issue #117), and what a platform
-- admin still does. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Users: school admin S (schools 1 and 3), coach C1 (school 1), coach C2
-- (school 2 only), N with no memberships, platform admin P, former coach F
-- (no membership left), guardian G.
insert into auth.users (id, email) values
  ('20000000-0000-4000-8000-0000000000a1', 'admin-s@example.test'),
  ('20000000-0000-4000-8000-0000000000a2', 'coach-c1@example.test'),
  ('20000000-0000-4000-8000-0000000000a3', 'coach-c2@example.test'),
  ('20000000-0000-4000-8000-0000000000a4', 'no-memberships@example.test'),
  ('20000000-0000-4000-8000-0000000000a5', 'platform-p@example.test'),
  ('20000000-0000-4000-8000-0000000000a6', 'former-coach-f@example.test'),
  ('20000000-0000-4000-8000-0000000000a7', 'guardian-g@example.test');

-- School 3 has only S's membership, so P deletes both in one statement.
insert into public.schools (id, name) values
  ('20000000-0000-4000-8000-0000000000b1', 'Permissions School One'),
  ('20000000-0000-4000-8000-0000000000b2', 'Permissions School Two'),
  ('20000000-0000-4000-8000-0000000000b3', 'Permissions School Three');

insert into public.training_groups (id, school_id, name) values
  ('20000000-0000-4000-8000-0000000000d1', '20000000-0000-4000-8000-0000000000b1', 'Group One'),
  ('20000000-0000-4000-8000-0000000000d2', '20000000-0000-4000-8000-0000000000b2', 'Group Two');

insert into public.school_memberships (school_id, user_id, role) values
  ('20000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('20000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('20000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000a2', 'coach'),
  ('20000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-0000000000a3', 'coach');

insert into public.platform_admins (user_id) values ('20000000-0000-4000-8000-0000000000a5');

-- F lost the coach membership but the old group assignment is still there.
insert into public.coach_group_assignments (coach_user_id, group_id)
values ('20000000-0000-4000-8000-0000000000a6', '20000000-0000-4000-8000-0000000000d1');

-- e1 belongs to schools 1 and 2; e2 only to school 2.
insert into public.athletes (id, first_name, last_name) values
  ('20000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('20000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2');

insert into public.athlete_schools (athlete_id, school_id) values
  ('20000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000b1'),
  ('20000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000b2'),
  ('20000000-0000-4000-8000-0000000000e2', '20000000-0000-4000-8000-0000000000b2');

insert into public.athlete_managers (user_id, athlete_id, relation)
values ('20000000-0000-4000-8000-0000000000a7', '20000000-0000-4000-8000-0000000000e1', 'guardian');

set local role authenticated;

-- School admin S
set local request.jwt.claims = '{"sub": "20000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.coach_group_assignments (coach_user_id, group_id)
     values ('20000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-0000000000d1') $$,
  'school admin S can assign a coach of S''s school to a group'
);
select throws_ok(
  $$ insert into public.coach_group_assignments (coach_user_id, group_id)
     values ('20000000-0000-4000-8000-0000000000a4', '20000000-0000-4000-8000-0000000000d1') $$,
  '42501', null,
  'school admin S cannot assign a user without a coach membership to a group'
);
select throws_ok(
  $$ insert into public.coach_group_assignments (coach_user_id, group_id)
     values ('20000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-0000000000d1') $$,
  '42501', null,
  'school admin S cannot assign a coach of another school to a group'
);
select throws_ok(
  $$ update public.coach_group_assignments set coach_user_id = '20000000-0000-4000-8000-0000000000a4'
     where coach_user_id = '20000000-0000-4000-8000-0000000000a2' $$,
  '42501', null,
  'school admin S cannot move a group assignment to a user without a coach membership'
);
select isnt_empty(
  $$ delete from public.coach_group_assignments
     where coach_user_id = '20000000-0000-4000-8000-0000000000a6' returning id $$,
  'school admin S can still remove the assignment of a coach who lost the membership'
);

select lives_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id)
     values ('20000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-0000000000e1') $$,
  'school admin S can assign a coach of S''s school to an athlete of S''s school'
);
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id)
     values ('20000000-0000-4000-8000-0000000000a4', '20000000-0000-4000-8000-0000000000e1') $$,
  '42501', null,
  'school admin S cannot assign a user without a coach membership to an athlete'
);
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id)
     values ('20000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-0000000000e1') $$,
  '42501', null,
  'school admin S cannot assign a coach of the athlete''s other school, which S does not administer'
);

select throws_ok(
  $$ insert into public.athlete_managers (user_id, athlete_id, relation)
     values ('20000000-0000-4000-8000-0000000000a4', '20000000-0000-4000-8000-0000000000e1', 'guardian') $$,
  '42501', null,
  'school admin S cannot make a user the guardian of an athlete'
);
select is_empty(
  $$ delete from public.athlete_managers
     where athlete_id = '20000000-0000-4000-8000-0000000000e1' returning id $$,
  'school admin S cannot remove a guardian link'
);

select is_empty(
  $$ update public.athletes set first_name = 'Changed'
     where id = '20000000-0000-4000-8000-0000000000e1' returning id $$,
  'school admin S cannot edit the profile of an athlete S''s school shares with another school'
);
select is_empty(
  $$ delete from public.athletes
     where id = '20000000-0000-4000-8000-0000000000e1' returning id $$,
  'school admin S cannot delete an athlete'
);

select is_empty(
  $$ delete from public.schools
     where id = '20000000-0000-4000-8000-0000000000b3' returning id $$,
  'school admin S cannot delete a school S administers'
);

-- Platform admin P
set local request.jwt.claims = '{"sub": "20000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';

select set_eq(
  $$ select id from public.athletes where id::text like '20000000-%' $$,
  $$ values ('20000000-0000-4000-8000-0000000000e1'::uuid),
            ('20000000-0000-4000-8000-0000000000e2'::uuid) $$,
  'platform admin P sees every athlete'
);
select lives_ok(
  $$ insert into public.athletes (id, first_name, last_name)
     values ('20000000-0000-4000-8000-0000000000e3', 'Athlete', 'E3') $$,
  'platform admin P can create an athlete'
);
select isnt_empty(
  $$ update public.athletes set first_name = 'Changed'
     where id = '20000000-0000-4000-8000-0000000000e1' returning id $$,
  'platform admin P can edit an athlete profile'
);
select lives_ok(
  $$ insert into public.athlete_managers (user_id, athlete_id, relation)
     values ('20000000-0000-4000-8000-0000000000a4', '20000000-0000-4000-8000-0000000000e2', 'guardian') $$,
  'platform admin P can create a guardian link'
);
select isnt_empty(
  $$ with m as (delete from public.school_memberships
                where school_id = '20000000-0000-4000-8000-0000000000b3')
     delete from public.schools
     where id = '20000000-0000-4000-8000-0000000000b3' returning id $$,
  'platform admin P can delete a school'
);

select * from finish();
rollback;
