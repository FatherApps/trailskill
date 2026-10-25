-- Who may assign a plan, and withdrawing an assignment (issue #274). A coach
-- assigns only to the athletes in their charge (directly or by group) and to
-- their groups; categories and the whole school are for the school admin; the
-- platform admin has no limit. An assignment is withdrawn once (withdrawn_at and
-- withdrawn_by, set by the server), never deleted: guardians and adult athletes
-- stop reading it, staff keep it as a record, and its marks are all kept. All
-- users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

-- Users: school admin S, coach C1 (group c1, direct e2, direct e9 of school 2),
-- coach C2 (direct e1), coach N (assigned to nobody), coach F (school 2),
-- guardian G (e1), adult athlete D (e2, self), unrelated user U, platform admin P,
-- coach X (both schools, group c3 of school 2 only).
insert into auth.users (id, email) values
  ('74000000-0000-4000-8000-0000000000a1', 'scope-admin-s@example.test'),
  ('74000000-0000-4000-8000-0000000000a2', 'scope-coach-c1@example.test'),
  ('74000000-0000-4000-8000-0000000000a3', 'scope-coach-c2@example.test'),
  ('74000000-0000-4000-8000-0000000000a4', 'scope-coach-n@example.test'),
  ('74000000-0000-4000-8000-0000000000a5', 'scope-coach-f@example.test'),
  ('74000000-0000-4000-8000-0000000000a6', 'scope-guardian-g@example.test'),
  ('74000000-0000-4000-8000-0000000000a7', 'scope-adult-d@example.test'),
  ('74000000-0000-4000-8000-0000000000a8', 'scope-unrelated-u@example.test'),
  ('74000000-0000-4000-8000-0000000000a9', 'scope-platform-p@example.test'),
  ('74000000-0000-4000-8000-0000000000ab', 'scope-coach-x@example.test');

insert into public.schools (id, name) values
  ('74000000-0000-4000-8000-0000000000b1', 'Scope School One'),
  ('74000000-0000-4000-8000-0000000000b2', 'Scope School Two');

insert into public.school_memberships (school_id, user_id, role) values
  ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000a2', 'coach'),
  ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000a3', 'coach'),
  ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000a4', 'coach'),
  ('74000000-0000-4000-8000-0000000000b2', '74000000-0000-4000-8000-0000000000a5', 'coach'),
  ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000ab', 'coach'),
  ('74000000-0000-4000-8000-0000000000b2', '74000000-0000-4000-8000-0000000000ab', 'coach');

insert into public.platform_admins (user_id) values ('74000000-0000-4000-8000-0000000000a9');

insert into public.training_groups (id, school_id, name) values
  ('74000000-0000-4000-8000-0000000000c1', '74000000-0000-4000-8000-0000000000b1', 'Scope Group One'),
  ('74000000-0000-4000-8000-0000000000c2', '74000000-0000-4000-8000-0000000000b1', 'Scope Group Two'),
  ('74000000-0000-4000-8000-0000000000c3', '74000000-0000-4000-8000-0000000000b2', 'Scope Group Three');

insert into public.categories (id, school_id, name) values
  ('74000000-0000-4000-8000-0000000000ca', '74000000-0000-4000-8000-0000000000b1', 'Scope Category A');

-- e1: group c1, category A. e3: group c1. e2: direct C1. e6: in nobody's charge. e9: school 2.
-- e7: both schools, group c3 (school 2).
insert into public.athletes (id, first_name, last_name) values
  ('74000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('74000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('74000000-0000-4000-8000-0000000000e3', 'Athlete', 'E3'),
  ('74000000-0000-4000-8000-0000000000e6', 'Athlete', 'E6'),
  ('74000000-0000-4000-8000-0000000000e7', 'Athlete', 'E7'),
  ('74000000-0000-4000-8000-0000000000e9', 'Athlete', 'E9');

insert into public.athlete_schools (athlete_id, school_id, category_id) values
  ('74000000-0000-4000-8000-0000000000e1', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000ca'),
  ('74000000-0000-4000-8000-0000000000e2', '74000000-0000-4000-8000-0000000000b1', null),
  ('74000000-0000-4000-8000-0000000000e3', '74000000-0000-4000-8000-0000000000b1', null),
  ('74000000-0000-4000-8000-0000000000e6', '74000000-0000-4000-8000-0000000000b1', null),
  ('74000000-0000-4000-8000-0000000000e7', '74000000-0000-4000-8000-0000000000b1', null),
  ('74000000-0000-4000-8000-0000000000e7', '74000000-0000-4000-8000-0000000000b2', null),
  ('74000000-0000-4000-8000-0000000000e9', '74000000-0000-4000-8000-0000000000b2', null);

insert into public.athlete_groups (athlete_id, group_id) values
  ('74000000-0000-4000-8000-0000000000e1', '74000000-0000-4000-8000-0000000000c1'),
  ('74000000-0000-4000-8000-0000000000e3', '74000000-0000-4000-8000-0000000000c1'),
  ('74000000-0000-4000-8000-0000000000e7', '74000000-0000-4000-8000-0000000000c3');

insert into public.coach_group_assignments (coach_user_id, group_id) values
  ('74000000-0000-4000-8000-0000000000a2', '74000000-0000-4000-8000-0000000000c1'),
  ('74000000-0000-4000-8000-0000000000ab', '74000000-0000-4000-8000-0000000000c3');
insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values
  ('74000000-0000-4000-8000-0000000000a2', '74000000-0000-4000-8000-0000000000e2'),
  ('74000000-0000-4000-8000-0000000000a2', '74000000-0000-4000-8000-0000000000e9'),
  ('74000000-0000-4000-8000-0000000000a3', '74000000-0000-4000-8000-0000000000e1');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('74000000-0000-4000-8000-0000000000a6', '74000000-0000-4000-8000-0000000000e1', 'guardian'),
  ('74000000-0000-4000-8000-0000000000a7', '74000000-0000-4000-8000-0000000000e2', 'self');

insert into public.authorization_texts (id, purpose, version, language, body) values
  ('74000000-0000-4000-8000-000000000071', 'record_times', 1, 'en-US', 'Synthetic record times text v1');
insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at, user_id) values
  ('74000000-0000-4000-8000-000000000081', '74000000-0000-4000-8000-0000000000e1', 'record_times', '74000000-0000-4000-8000-000000000071', '2026-08-01 08:00:00+00', '74000000-0000-4000-8000-0000000000a6');

-- Plan f1 (school 1, version 11, block 21) and plan f3 (school 2, version 14).
insert into public.training_plans (id, created_by, school_id, name) values
  ('74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-0000000000a1', '74000000-0000-4000-8000-0000000000b1', 'Scope Plan One'),
  ('74000000-0000-4000-8000-0000000000f3', '74000000-0000-4000-8000-0000000000a5', '74000000-0000-4000-8000-0000000000b2', 'Scope Plan Three');
insert into public.training_plan_versions (id, created_by, plan_id, version) values
  ('74000000-0000-4000-8000-000000000011', '74000000-0000-4000-8000-0000000000a1', '74000000-0000-4000-8000-0000000000f1', 1),
  ('74000000-0000-4000-8000-000000000014', '74000000-0000-4000-8000-0000000000a5', '74000000-0000-4000-8000-0000000000f3', 1);
insert into public.training_plan_blocks
  (id, created_by, version_id, position, repetitions, distance, stroke, phase, recording) values
  ('74000000-0000-4000-8000-000000000021', '74000000-0000-4000-8000-0000000000a1', '74000000-0000-4000-8000-000000000011', 1, 4, '50m', 'FR', 'warm_up', 'completion');

select has_column('public', 'training_plan_assignments', 'withdrawn_at', 'an assignment records when it was withdrawn');
select has_column('public', 'training_plan_assignments', 'withdrawn_by', 'and who withdrew it');

set local role authenticated;

-- Coach C1: own athletes (direct and by group) and own group only.
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-000000000031', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'athlete', '74000000-0000-4000-8000-0000000000e2') $$,
  'a coach assigns to an athlete assigned to them directly'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-000000000032', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'athlete', '74000000-0000-4000-8000-0000000000e1') $$,
  'a coach assigns to an athlete of their group'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id)
     values ('74000000-0000-4000-8000-000000000033', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'group', '74000000-0000-4000-8000-0000000000c1') $$,
  'a coach assigns to their group'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'athlete', '74000000-0000-4000-8000-0000000000e6') $$,
  '42501', null, 'a coach cannot assign to an athlete not in their charge'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, group_id)
     values ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'group', '74000000-0000-4000-8000-0000000000c2') $$,
  '42501', null, 'a coach cannot assign to a group not in their charge'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, category_id)
     values ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'category', '74000000-0000-4000-8000-0000000000ca') $$,
  '42501', null, 'a coach cannot assign to a category, even of their own athletes'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target)
     values ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'school') $$,
  '42501', null, 'a coach cannot assign to the whole school'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-0000000000b2', '74000000-0000-4000-8000-0000000000f3', '74000000-0000-4000-8000-000000000014', '2026-09-01', 'athlete', '74000000-0000-4000-8000-0000000000e9') $$,
  '42501', null, 'a coach cannot assign in a school where they do not coach, even to an athlete assigned to them'
);

-- Coach C2 (direct e1 only).
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-000000000034', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'athlete', '74000000-0000-4000-8000-0000000000e1') $$,
  'a second coach assigns to the athlete assigned to them'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, group_id)
     values ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'group', '74000000-0000-4000-8000-0000000000c1') $$,
  '42501', null, 'a coach with one athlete of a group cannot assign to the group'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'athlete', '74000000-0000-4000-8000-0000000000e3') $$,
  '42501', null, 'nor to another coach''s athlete'
);

-- Coach N (nobody) and coach F (school 2).
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'athlete', '74000000-0000-4000-8000-0000000000e1') $$,
  '42501', null, 'a coach of the school with nobody in their charge cannot assign'
);
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'athlete', '74000000-0000-4000-8000-0000000000e1') $$,
  '42501', null, 'a coach of another school cannot assign in school 1'
);

-- Coach X: an athlete in their charge only through a group of school 2 is not
-- in their charge in school 1, even though the athlete is in both schools.
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000ab", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'athlete', '74000000-0000-4000-8000-0000000000e7') $$,
  '42501', null, 'a coach cannot assign in school 1 an athlete in their charge only through a group of school 2'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-00000000003b', '74000000-0000-4000-8000-0000000000b2', '74000000-0000-4000-8000-0000000000f3', '74000000-0000-4000-8000-000000000014', '2026-09-01', 'athlete', '74000000-0000-4000-8000-0000000000e7') $$,
  'but can in school 2, where the group is'
);

-- School admin S: any target of the own school, nothing in another school.
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, category_id)
     values ('74000000-0000-4000-8000-000000000035', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'category', '74000000-0000-4000-8000-0000000000ca') $$,
  'the school admin assigns to a category'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target)
     values ('74000000-0000-4000-8000-000000000036', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'school') $$,
  'the school admin assigns to the whole school'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id)
     values ('74000000-0000-4000-8000-000000000037', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'group', '74000000-0000-4000-8000-0000000000c2') $$,
  'the school admin assigns to any group of the school'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-000000000038', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'athlete', '74000000-0000-4000-8000-0000000000e6') $$,
  'the school admin assigns to an athlete in nobody''s charge'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target)
     values ('74000000-0000-4000-8000-0000000000b2', '74000000-0000-4000-8000-0000000000f3', '74000000-0000-4000-8000-000000000014', '2026-09-01', 'school') $$,
  '42501', null, 'the school admin cannot assign in another school'
);

-- Platform admin P: no limit.
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a9", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target)
     values ('74000000-0000-4000-8000-000000000039', '74000000-0000-4000-8000-0000000000b2', '74000000-0000-4000-8000-0000000000f3', '74000000-0000-4000-8000-000000000014', '2026-09-01', 'school') $$,
  'the platform admin assigns in any school'
);

-- Guardian G, adult D (to themselves) and unrelated U cannot assign.
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'athlete', '74000000-0000-4000-8000-0000000000e1') $$,
  '42501', null, 'a guardian cannot assign to their own athlete'
);
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'athlete', '74000000-0000-4000-8000-0000000000e2') $$,
  '42501', null, 'an adult athlete cannot assign to themselves'
);
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a8", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target)
     values ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'school') $$,
  '42501', null, 'an unrelated user cannot assign'
);

-- Anon: no write at all, and no access to the scope function.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target)
     values ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'school') $$,
  '42501', null, 'anon cannot assign'
);
select throws_ok(
  $$ update public.training_plan_assignments set withdrawn_at = '2026-09-01 10:00:00+00' where id = '74000000-0000-4000-8000-000000000033' $$,
  '42501', null, 'anon cannot withdraw'
);
-- Asked as authenticated: anon cannot even resolve a name in the app schema.
set local role authenticated;
select ok(
  not has_function_privilege('anon', 'app.can_assign_training_plan(uuid, text, uuid, uuid)', 'execute'),
  'anon cannot execute the scope function'
);

-- Updates follow the same scope, on the stored row and on the new one.
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
with u as (
  update public.training_plan_assignments set session_date = '2026-09-02'
  where id = '74000000-0000-4000-8000-000000000033' returning id
)
select is(count(*), 1::bigint, 'coach C1 reschedules the assignment of their group') from u;
select throws_ok(
  $$ update public.training_plan_assignments set target = 'group', athlete_id = null, group_id = '74000000-0000-4000-8000-0000000000c2'
     where id = '74000000-0000-4000-8000-000000000031' $$,
  '42501', null, 'coach C1 cannot move an assignment to a group not in their charge'
);
with u as (
  update public.training_plan_assignments set session_date = '2026-09-03'
  where id in ('74000000-0000-4000-8000-000000000035', '74000000-0000-4000-8000-000000000036') returning id
)
select is(count(*), 0::bigint, 'coach C1 cannot reschedule the category and school assignments') from u;
with u as (
  update public.training_plan_assignments set withdrawn_at = '2026-09-01 10:00:00+00'
  where id = '74000000-0000-4000-8000-000000000035' returning id
)
select is(count(*), 0::bigint, 'nor withdraw them') from u;
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
with u as (
  update public.training_plan_assignments set session_date = '2026-09-03'
  where id = '74000000-0000-4000-8000-000000000033' returning id
)
select is(count(*), 0::bigint, 'coach C2 cannot change the assignment of a group not in their charge') from u;
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
with u as (
  update public.training_plan_assignments set target = 'group', athlete_id = null, group_id = '74000000-0000-4000-8000-0000000000c2'
  where id = '74000000-0000-4000-8000-000000000038' returning id
)
select is(count(*), 1::bigint, 'the school admin moves an assignment to another group') from u;

-- A mark before the withdrawal.
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, status, captured_at)
     values ('74000000-0000-4000-8000-000000000041', 'device-1', '74000000-0000-4000-8000-000000000032', '74000000-0000-4000-8000-000000000011', '74000000-0000-4000-8000-000000000021', '74000000-0000-4000-8000-0000000000e1', 'done', '2026-09-01 08:00:00+00') $$,
  'coach C1 marks a block of the assignment'
);

-- Withdrawal: once, by the server's account of who and when; never a delete.
select throws_ok(
  $$ update public.training_plan_assignments set withdrawn_by = '74000000-0000-4000-8000-0000000000a2' where id = '74000000-0000-4000-8000-000000000032' $$,
  '23514', null, 'withdrawn_by without withdrawn_at fails'
);
select lives_ok(
  $$ update public.training_plan_assignments set withdrawn_at = '2026-09-01 10:00:00+00', withdrawn_by = '74000000-0000-4000-8000-0000000000a1'
     where id = '74000000-0000-4000-8000-000000000032' $$,
  'coach C1 withdraws an assignment in their charge'
);
select is(
  (select withdrawn_at::text || '|' || withdrawn_by from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000032'),
  '2026-09-01 10:00:00+00|74000000-0000-4000-8000-0000000000a2',
  'the withdrawal keeps the device time and the server records who withdrew, whatever the client sent'
);
select lives_ok(
  $$ update public.training_plan_assignments set withdrawn_at = '2026-09-01 10:00:00+00' where id = '74000000-0000-4000-8000-000000000032' $$,
  'a retry of the withdrawal passes'
);
select lives_ok(
  $$ update public.training_plan_assignments set withdrawn_at = '2026-09-01 12:00:00+00', withdrawn_by = '74000000-0000-4000-8000-0000000000a2'
     where id = '74000000-0000-4000-8000-000000000032' $$,
  'a second withdrawal passes'
);
select is(
  (select withdrawn_at::text || '|' || withdrawn_by from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000032'),
  '2026-09-01 10:00:00+00|74000000-0000-4000-8000-0000000000a2',
  'but the first withdrawal stands: it happens once'
);
select throws_ok(
  $$ update public.training_plan_assignments set withdrawn_at = null where id = '74000000-0000-4000-8000-000000000032' $$,
  '42501', null, 'a withdrawal cannot be undone'
);
select throws_ok(
  $$ update public.training_plan_assignments set session_date = '2026-09-05' where id = '74000000-0000-4000-8000-000000000032' $$,
  '42501', null, 'a withdrawn assignment cannot change'
);
select throws_ok(
  $$ delete from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000032' $$,
  '42501', null, 'an assignment is never deleted'
);
select lives_ok(
  $$ update public.training_plan_assignments set withdrawn_at = '2100-01-01 00:00:00+00' where id = '74000000-0000-4000-8000-000000000031' $$,
  'a withdrawal with a device time in the future passes'
);
select ok(
  (select withdrawn_at <= clock_timestamp() from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000031'),
  'and is clamped to the reception time'
);

-- Marks are never rejected because of a withdrawal.
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, status, captured_at)
     values ('74000000-0000-4000-8000-000000000043', 'device-1', '74000000-0000-4000-8000-000000000032', '74000000-0000-4000-8000-000000000011', '74000000-0000-4000-8000-000000000021', '74000000-0000-4000-8000-0000000000e1', 'done', '2026-09-01 11:00:00+00') $$,
  'a mark captured after the withdrawal is still stored, never a permanent upload failure'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, status, captured_at)
     values ('74000000-0000-4000-8000-000000000042', 'device-1', '74000000-0000-4000-8000-000000000032', '74000000-0000-4000-8000-000000000011', '74000000-0000-4000-8000-000000000021', '74000000-0000-4000-8000-0000000000e1', 'done', '2026-09-01 09:00:00+00') $$,
  'a mark captured before the withdrawal and uploaded after it is kept'
);

set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
with u as (
  update public.training_plan_assignments set withdrawn_at = '2026-09-01 10:00:00+00'
  where id = '74000000-0000-4000-8000-000000000034' returning id
)
select is(count(*), 0::bigint, 'a coach with nobody in their charge cannot withdraw') from u;

-- An offline create and withdraw arrive as one insert.
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, withdrawn_at)
     values ('74000000-0000-4000-8000-00000000003a', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-09-01', 'school', '2026-09-01 10:00:00+00') $$,
  'the school admin inserts an assignment already withdrawn'
);
select is(
  (select withdrawn_by from public.training_plan_assignments where id = '74000000-0000-4000-8000-00000000003a'),
  '74000000-0000-4000-8000-0000000000a1'::uuid, 'and the server records who withdrew it'
);

-- Withdrawn assignments are hidden from guardians and adult athletes, not from staff; marks stay.
select is(
  (select withdrawn_at from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000032'),
  '2026-09-01 10:00:00+00'::timestamptz, 'staff still read a withdrawn assignment'
);
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is(
  (select array_agg(id::text order by id) from public.training_plan_assignments),
  array['74000000-0000-4000-8000-000000000033', '74000000-0000-4000-8000-000000000034', '74000000-0000-4000-8000-000000000035', '74000000-0000-4000-8000-000000000036'],
  'guardian G no longer reads the withdrawn assignments of the athlete or of the school'
);
select is(
  (select array_agg(id::text order by id) from public.training_plan_fulfillments),
  array['74000000-0000-4000-8000-000000000041', '74000000-0000-4000-8000-000000000042', '74000000-0000-4000-8000-000000000043'],
  'guardian G still reads every mark of the withdrawn assignment'
);
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select is(
  (select array_agg(id::text order by id) from public.training_plan_assignments),
  array['74000000-0000-4000-8000-000000000036'],
  'adult athlete D no longer reads the own withdrawn assignment'
);

-- The Sync Streams (powersync/sync-config.yaml) skip withdrawn assignments: coach
-- C1's staff queries joined with union, and the guardian's managed queries.
reset role;
create temp table stream_c1 as
select id from public.training_plan_assignments
where withdrawn_at is null
  and school_id in (select school_id from public.school_memberships where user_id = '74000000-0000-4000-8000-0000000000a2')
  and (
    group_id in (select group_id from public.coach_group_assignments where coach_user_id = '74000000-0000-4000-8000-0000000000a2')
    or athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '74000000-0000-4000-8000-0000000000a2')
    or athlete_id in (select athlete_id from public.athlete_groups where group_id in (select group_id from public.coach_group_assignments where coach_user_id = '74000000-0000-4000-8000-0000000000a2'))
    or category_id in (select category_id from public.athlete_schools where category_id is not null and athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '74000000-0000-4000-8000-0000000000a2'))
    or category_id in (select category_id from public.athlete_schools where category_id is not null and athlete_id in (select athlete_id from public.athlete_groups where group_id in (select group_id from public.coach_group_assignments where coach_user_id = '74000000-0000-4000-8000-0000000000a2')))
    or target = 'school'
  );
select set_eq(
  $$ select id from stream_c1 $$,
  $$ values ('74000000-0000-4000-8000-000000000033'::uuid), ('74000000-0000-4000-8000-000000000034'), ('74000000-0000-4000-8000-000000000035'), ('74000000-0000-4000-8000-000000000036') $$,
  'the coach stream carries no withdrawn assignment'
);
create temp table stream_g as
select id from public.training_plan_assignments
where withdrawn_at is null
  and (
    athlete_id in (select athlete_id from public.athlete_managers where user_id = '74000000-0000-4000-8000-0000000000a6')
    or group_id in (select group_id from public.athlete_groups where athlete_id in (select athlete_id from public.athlete_managers where user_id = '74000000-0000-4000-8000-0000000000a6'))
    or category_id in (select category_id from public.athlete_schools where category_id is not null and athlete_id in (select athlete_id from public.athlete_managers where user_id = '74000000-0000-4000-8000-0000000000a6'))
    or (target = 'school' and school_id in (select school_id from public.athlete_schools where athlete_id in (select athlete_id from public.athlete_managers where user_id = '74000000-0000-4000-8000-0000000000a6')))
  );
grant select on stream_g to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select set_eq(
  $$ select id from stream_g $$,
  $$ select id from public.training_plan_assignments $$,
  'the guardian stream is exactly what the guardian reads'
);
reset role;

select * from finish();
rollback;
