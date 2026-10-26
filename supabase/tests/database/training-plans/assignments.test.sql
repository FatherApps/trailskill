-- Plan assignments and fulfillment (issue #70): an assignment links a version of
-- a plan to a target (athlete, group, category or the whole school) and a date.
-- Fulfillment is one append-only row per mark, with its author and device; it
-- never stores a time (times stay in measurements) and "partial" always has a
-- count. The coach writes only for assigned athletes with an authorization on
-- the server; a mark made after a record_times withdrawal is stored but hidden
-- (same rule as measurements, issue #54). Guardians and adult athletes read
-- what concerns their own athletes. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(134);

-- Users: school admin S, coach C1 (group g1 and direct e2), coach C2 (direct
-- e1), coach N (school 1, assigned to nobody), coach F (school 2), guardian G
-- (e1), adult athlete D (e2, self), unrelated user U, platform admin P and
-- guardian G2 (e5).
insert into auth.users (id, email) values
  ('70000000-0000-4000-8000-0000000000a1', 'admin-s@example.test'),
  ('70000000-0000-4000-8000-0000000000a2', 'coach-c1@example.test'),
  ('70000000-0000-4000-8000-0000000000a3', 'coach-c2@example.test'),
  ('70000000-0000-4000-8000-0000000000a4', 'coach-n@example.test'),
  ('70000000-0000-4000-8000-0000000000a5', 'coach-f@example.test'),
  ('70000000-0000-4000-8000-0000000000a6', 'guardian-g@example.test'),
  ('70000000-0000-4000-8000-0000000000a7', 'adult-d@example.test'),
  ('70000000-0000-4000-8000-0000000000a8', 'unrelated-u@example.test'),
  ('70000000-0000-4000-8000-0000000000a9', 'platform-p@example.test'),
  ('70000000-0000-4000-8000-0000000000aa', 'guardian-g2@example.test');

insert into public.schools (id, name) values
  ('70000000-0000-4000-8000-0000000000b1', 'Assignments School One'),
  ('70000000-0000-4000-8000-0000000000b2', 'Assignments School Two');

insert into public.school_memberships (school_id, user_id, role) values
  ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000a2', 'coach'),
  ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000a3', 'coach'),
  ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000a4', 'coach'),
  ('70000000-0000-4000-8000-0000000000b2', '70000000-0000-4000-8000-0000000000a5', 'coach');

insert into public.platform_admins (user_id) values ('70000000-0000-4000-8000-0000000000a9');

insert into public.training_groups (id, school_id, name) values
  ('70000000-0000-4000-8000-0000000000c1', '70000000-0000-4000-8000-0000000000b1', 'Group One'),
  ('70000000-0000-4000-8000-0000000000c2', '70000000-0000-4000-8000-0000000000b1', 'Group Two'),
  ('70000000-0000-4000-8000-0000000000c3', '70000000-0000-4000-8000-0000000000b2', 'Group Three');

insert into public.categories (id, school_id, name) values
  ('70000000-0000-4000-8000-0000000000ca', '70000000-0000-4000-8000-0000000000b1', 'Category A'),
  ('70000000-0000-4000-8000-0000000000cb', '70000000-0000-4000-8000-0000000000b2', 'Category B');

-- e1: group g1, category A, guardian G. e2: no group or category, adult D.
-- e3 and e4: group g1, no manager. e5: group g1, guardian G2. e9: school 2.
insert into public.athletes (id, first_name, last_name) values
  ('70000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('70000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('70000000-0000-4000-8000-0000000000e3', 'Athlete', 'E3'),
  ('70000000-0000-4000-8000-0000000000e4', 'Athlete', 'E4'),
  ('70000000-0000-4000-8000-0000000000e5', 'Athlete', 'E5'),
  ('70000000-0000-4000-8000-0000000000e9', 'Athlete', 'E9');

insert into public.athlete_schools (athlete_id, school_id, category_id) values
  ('70000000-0000-4000-8000-0000000000e1', '70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000ca'),
  ('70000000-0000-4000-8000-0000000000e2', '70000000-0000-4000-8000-0000000000b1', null),
  ('70000000-0000-4000-8000-0000000000e3', '70000000-0000-4000-8000-0000000000b1', null),
  ('70000000-0000-4000-8000-0000000000e4', '70000000-0000-4000-8000-0000000000b1', null),
  ('70000000-0000-4000-8000-0000000000e5', '70000000-0000-4000-8000-0000000000b1', null),
  ('70000000-0000-4000-8000-0000000000e9', '70000000-0000-4000-8000-0000000000b2', null);

insert into public.athlete_groups (athlete_id, group_id) values
  ('70000000-0000-4000-8000-0000000000e1', '70000000-0000-4000-8000-0000000000c1'), ('70000000-0000-4000-8000-0000000000e3', '70000000-0000-4000-8000-0000000000c1'), ('70000000-0000-4000-8000-0000000000e4', '70000000-0000-4000-8000-0000000000c1'), ('70000000-0000-4000-8000-0000000000e5', '70000000-0000-4000-8000-0000000000c1');

insert into public.coach_group_assignments (coach_user_id, group_id) values ('70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-0000000000c1');
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  ('70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-0000000000e2', '70000000-0000-4000-8000-0000000000b1'),
  ('70000000-0000-4000-8000-0000000000a3', '70000000-0000-4000-8000-0000000000e1', '70000000-0000-4000-8000-0000000000b1'),
  ('70000000-0000-4000-8000-0000000000a5', '70000000-0000-4000-8000-0000000000e9', '70000000-0000-4000-8000-0000000000b2');
-- C1 is also assigned to e9 of school 2, where C1 does not coach. The assignment
-- trigger (#257) forbids that state, so this one row is stored with the trigger
-- off to keep the scenario of the school 1 vs school 2 checks below.
alter table public.coach_athlete_assignments disable trigger user;
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id)
values ('70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-0000000000e9', '70000000-0000-4000-8000-0000000000b2');
alter table public.coach_athlete_assignments enable trigger user;

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('70000000-0000-4000-8000-0000000000a6', '70000000-0000-4000-8000-0000000000e1', 'guardian'),
  ('70000000-0000-4000-8000-0000000000a7', '70000000-0000-4000-8000-0000000000e2', 'self'),
  ('70000000-0000-4000-8000-0000000000aa', '70000000-0000-4000-8000-0000000000e5', 'guardian');

-- record_times is authorized for e1, e2, e3 and e5 (e5 below, by its guardian).
-- e4 has no authorization at all.
insert into public.authorization_texts (id, purpose, version, language, body) values
  ('70000000-0000-4000-8000-000000000071', 'record_times', 1, 'en-US', 'Synthetic record times text v1');
insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at, user_id) values
  ('70000000-0000-4000-8000-000000000081', '70000000-0000-4000-8000-0000000000e1', 'record_times', '70000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '70000000-0000-4000-8000-0000000000a6'),
  ('70000000-0000-4000-8000-000000000082', '70000000-0000-4000-8000-0000000000e2', 'record_times', '70000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '70000000-0000-4000-8000-0000000000a7'),
  ('70000000-0000-4000-8000-000000000083', '70000000-0000-4000-8000-0000000000e3', 'record_times', '70000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '70000000-0000-4000-8000-0000000000a6'),
  ('70000000-0000-4000-8000-000000000086', '70000000-0000-4000-8000-0000000000e9', 'record_times', '70000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '70000000-0000-4000-8000-0000000000a6');

-- Plan P1 (school 1) has versions 1 and 2; P2 (school 1) is never assigned; P3
-- belongs to school 2.
insert into public.training_plans (id, created_by, school_id, name) values
  ('70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-0000000000b1', 'Plan One'),
  ('70000000-0000-4000-8000-0000000000f2', '70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-0000000000b1', 'Plan Two'),
  ('70000000-0000-4000-8000-0000000000f3', '70000000-0000-4000-8000-0000000000a5', '70000000-0000-4000-8000-0000000000b2', 'Plan Three');
insert into public.training_plan_versions (id, created_by, plan_id, version) values
  ('70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-0000000000f1', 1),
  ('70000000-0000-4000-8000-000000000012', '70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-0000000000f1', 2),
  ('70000000-0000-4000-8000-000000000013', '70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-0000000000f2', 1),
  ('70000000-0000-4000-8000-000000000014', '70000000-0000-4000-8000-0000000000a5', '70000000-0000-4000-8000-0000000000f3', 1);
insert into public.training_plan_blocks
  (id, created_by, version_id, position, repetitions, distance, stroke, phase, recording) values
  ('70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-000000000011', 1, 4, '50m', 'FR', 'warm_up', 'completion'),
  ('70000000-0000-4000-8000-000000000022', '70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-000000000011', 2, 8, '50m', 'FR', 'main', 'per_repetition'),
  ('70000000-0000-4000-8000-000000000023', '70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-000000000012', 1, 2, '100m', 'FR', 'main', 'completion'),
  ('70000000-0000-4000-8000-000000000024', '70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-000000000013', 1, 2, '100m', 'BK', 'main', 'completion'),
  ('70000000-0000-4000-8000-000000000025', '70000000-0000-4000-8000-0000000000a5', '70000000-0000-4000-8000-000000000014', 1, 2, '100m', 'FR', 'main', 'completion');

-- Schema
select has_table('public', 'training_plan_assignments', 'training_plan_assignments exists');
select has_table('public', 'training_plan_fulfillments', 'training_plan_fulfillments exists');
select is_empty(
  $$ select relname from pg_class
     where relnamespace = 'public'::regnamespace
       and relname in ('training_plan_assignments', 'training_plan_fulfillments')
       and not relrowsecurity $$,
  'the assignment tables have row level security enabled'
);
select set_eq(
  $$ select tablename::text from pg_publication_tables
     where pubname = 'powersync'
       and tablename in ('training_plan_assignments', 'training_plan_fulfillments') $$,
  $$ values ('training_plan_assignments'), ('training_plan_fulfillments') $$,
  'the powersync publication includes the assignment tables'
);
select hasnt_column('public', 'training_plan_fulfillments', 'hundredths',
  'fulfillment stores no time: times stay in measurements');
select has_column('public', 'training_plan_fulfillments', 'series_id',
  'a timed block links its series instead of copying times');
select col_default_is('public', 'training_plan_fulfillments', 'status', 'not_marked',
  'the default status is not marked');

set local role authenticated;

-- Assignments written by staff, one per target: coach C1 the athlete and the
-- group, school admin S the category and the school (issue #274).
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-26', 'athlete', '70000000-0000-4000-8000-0000000000e1') $$,
  'a coach assigns a plan version to an athlete'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id)
     values ('70000000-0000-4000-8000-000000000032', '70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-26', 'group', '70000000-0000-4000-8000-0000000000c1') $$,
  'a coach assigns it to a group'
);
select is(
  (select created_by from public.training_plan_assignments where id = '70000000-0000-4000-8000-000000000031'),
  '70000000-0000-4000-8000-0000000000a2'::uuid,
  'an assignment keeps its author'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, category_id)
     values ('70000000-0000-4000-8000-000000000033', '70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-26', 'category', '70000000-0000-4000-8000-0000000000ca') $$,
  'the school admin assigns it to a category'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target)
     values ('70000000-0000-4000-8000-000000000034', '70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-26', 'school') $$,
  'the school admin assigns it to the whole school'
);

-- Checks on the target and on the school of everything it points to.
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-26', 'athlete') $$,
  '23514', null, 'an athlete target needs an athlete'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, group_id, athlete_id)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-26', 'group', '70000000-0000-4000-8000-0000000000c1', '70000000-0000-4000-8000-0000000000e1') $$,
  '23514', null, 'a target names one thing only: a group target with an athlete fails'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, group_id)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-26', 'school', '70000000-0000-4000-8000-0000000000c1') $$,
  '23514', null, 'a school target carries no group'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, group_id)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-26', 'group', '70000000-0000-4000-8000-0000000000c3') $$,
  '23503', null, 'a group of another school fails'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, category_id)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-26', 'category', '70000000-0000-4000-8000-0000000000cb') $$,
  '23503', null, 'a category of another school fails'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-26', 'athlete', '70000000-0000-4000-8000-0000000000e9') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_assignments"', 'an athlete of another school fails with the error of row level security'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000013', '2026-10-26', 'school') $$,
  '23503', null, 'a version of another plan fails'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f3', '70000000-0000-4000-8000-000000000014', '2026-10-26', 'school') $$,
  '23503', null, 'a school different from the one of the plan fails'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target, created_by)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-26', 'school', '70000000-0000-4000-8000-0000000000a2') $$,
  '42501', null, 'an assignment cannot name someone else as its author'
);

-- School admin S adds the rest.
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id)
     values ('70000000-0000-4000-8000-000000000035', '70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-27', 'group', '70000000-0000-4000-8000-0000000000c2') $$,
  'the school admin assigns the plan to another group'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('70000000-0000-4000-8000-000000000036', '70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-27', 'athlete', '70000000-0000-4000-8000-0000000000e2'),
            ('70000000-0000-4000-8000-000000000037', '70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-27', 'athlete', '70000000-0000-4000-8000-0000000000e3') $$,
  'the school admin assigns the plan to two athletes'
);

-- Coach F (school 2) assigns in school 2 only, to the athlete in their charge.
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('70000000-0000-4000-8000-000000000038', '70000000-0000-4000-8000-0000000000b2', '70000000-0000-4000-8000-0000000000f3', '70000000-0000-4000-8000-000000000014', '2026-10-26', 'athlete', '70000000-0000-4000-8000-0000000000e9') $$,
  'the coach of school 2 assigns in school 2'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-28', 'school') $$,
  '42501', null, 'a coach of another school cannot assign in school 1'
);

-- Guardian G, adult D and an unrelated user cannot assign.
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-28', 'school') $$,
  '42501', null, 'a guardian cannot assign a plan'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-28', 'school') $$,
  '42501', null, 'an adult athlete cannot assign a plan'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a8", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_assignments (school_id, plan_id, version_id, session_date, target)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-000000000011', '2026-10-28', 'school') $$,
  '42501', null, 'an unrelated user cannot assign a plan'
);

-- Who reads assignments. a1-a7 (31-37) are school 1; 38 is school 2.
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  (select array_agg(id::text order by id) from public.training_plan_assignments),
  array['70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000032', '70000000-0000-4000-8000-000000000033', '70000000-0000-4000-8000-000000000034', '70000000-0000-4000-8000-000000000035', '70000000-0000-4000-8000-000000000036', '70000000-0000-4000-8000-000000000037'],
  'the school admin reads every assignment of the school and none of school 2'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is(
  (select count(*) from public.training_plan_assignments),
  7::bigint, 'a coach of the school reads all its assignments, assigned or not'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(
  (select array_agg(id::text) from public.training_plan_assignments),
  array['70000000-0000-4000-8000-000000000038'], 'a coach of another school reads only the assignments of school 2'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is(
  (select array_agg(id::text order by id) from public.training_plan_assignments),
  array['70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000032', '70000000-0000-4000-8000-000000000033', '70000000-0000-4000-8000-000000000034'],
  'guardian G reads the assignments of the athlete, of its group, of its category and school-wide'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select is(
  (select array_agg(id::text order by id) from public.training_plan_assignments),
  array['70000000-0000-4000-8000-000000000034', '70000000-0000-4000-8000-000000000036'],
  'adult athlete D reads the ones of the athlete and the school-wide one only'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a8", "role": "authenticated"}';
select is(
  (select count(*) from public.training_plan_assignments),
  0::bigint, 'an unrelated user reads no assignment'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a9", "role": "authenticated"}';
select is(
  (select count(*) from public.training_plan_assignments where school_id in ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000b2')),
  8::bigint, 'the platform admin reads them all'
);

-- Fulfillment writes. C1 is assigned to e1, e3, e4, e5 (group) and e2 (direct).
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.timing_series (school_id, id, stroke, distance, pool, session_type, device_id)
     values ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-000000000051', 'FR', '50m', 'SCM', 'training', 'device-1') $$,
  'coach C1 has a series'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments
       (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('70000000-0000-4000-8000-000000000041', 'device-1', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00') $$,
  'an assigned coach marks a block of an athlete'
);
select is(
  (select status from public.training_plan_fulfillments where id = '70000000-0000-4000-8000-000000000041'),
  'not_marked', 'a mark without a status is "not marked"'
);
select is(
  (select completed_repetitions from public.training_plan_fulfillments where id = '70000000-0000-4000-8000-000000000041'),
  null, 'and the absence of a count is null, not zero'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments
       (id, device_id, assignment_id, version_id, block_id, athlete_id, status, completed_repetitions, series_id, captured_at)
     values ('70000000-0000-4000-8000-000000000043', 'device-1', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000022', '70000000-0000-4000-8000-0000000000e1', 'partial', 3, '70000000-0000-4000-8000-000000000051', '2026-10-26 08:10:00+00') $$,
  'a partial mark carries its count and, for a timed block, the series with the times'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments
       (id, device_id, assignment_id, version_id, block_id, athlete_id, status, captured_at)
     values ('70000000-0000-4000-8000-000000000044', 'device-1', '70000000-0000-4000-8000-000000000036', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e2', 'absent', '2026-10-27 08:00:00+00'),
            ('70000000-0000-4000-8000-000000000045', 'device-1', '70000000-0000-4000-8000-000000000032', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e3', 'done', '2026-10-26 08:20:00+00') $$,
  'C1 marks an absent athlete assigned directly and a done one of the group'
);

select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, status, captured_at)
     values ('device-1', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e1', 'partial', '2026-10-26 09:00:00+00') $$,
  '23514', null, 'a partial mark without a count fails'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, status, completed_repetitions, captured_at)
     values ('device-1', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e1', 'partial', 0, '2026-10-26 09:00:00+00') $$,
  '23514', null, 'a partial mark with a count of zero fails'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, status, completed_repetitions, captured_at)
     values ('device-1', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e1', 'done', 2, '2026-10-26 09:00:00+00') $$,
  '23514', null, 'a done mark with a count fails'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('device-1', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000023', '70000000-0000-4000-8000-0000000000e1', '2026-10-26 09:00:00+00') $$,
  '23503', null, 'a block of another version than the assignment fails'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('device-1', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000012', '70000000-0000-4000-8000-000000000023', '70000000-0000-4000-8000-0000000000e1', '2026-10-26 09:00:00+00') $$,
  '42501', null, 'a version other than the one of the assignment fails (the session already has marks, issue #74)'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('device-1', '70000000-0000-4000-8000-000000000032', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e4', '2026-10-26 09:00:00+00') $$,
  '42501', null, 'an athlete with no record_times authorization on the server cannot be marked'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('device-1', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e9', '2026-10-26 09:00:00+00') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"', 'an assigned, authorized athlete of school 2 cannot be marked against an assignment of school 1'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, captured_at, created_by)
     values ('device-1', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e1', '2026-10-26 09:00:00+00', '70000000-0000-4000-8000-0000000000a3') $$,
  '42501', null, 'a mark cannot name someone else as its author'
);
select throws_ok(
  $$ update public.training_plan_fulfillments set status = 'done' where id = '70000000-0000-4000-8000-000000000041' $$,
  '42501', null, 'a client cannot update a mark'
);
select throws_ok(
  $$ delete from public.training_plan_fulfillments where id = '70000000-0000-4000-8000-000000000041' $$,
  '42501', null, 'a client cannot delete a mark'
);

-- A fulfillment never stores a time, and a measurement never stores a zero.
reset role;
select throws_ok(
  $$ insert into public.measurements
       (school_id, kind, athlete_id, series_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
     values ('70000000-0000-4000-8000-0000000000b1', 'repetition', '70000000-0000-4000-8000-0000000000e1', '70000000-0000-4000-8000-000000000051', 0, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-1',
             '2026-10-26 08:10:00+00', '70000000-0000-4000-8000-0000000000a2') $$,
  '23514', null, 'a time of zero hundredths is rejected: a time is never stored as zero'
);
set local role authenticated;

-- Coach C2 (direct assignment to e1) marks the same block from another device.
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_fulfillments
       (id, device_id, assignment_id, version_id, block_id, athlete_id, status, captured_at)
     values ('70000000-0000-4000-8000-000000000042', 'device-2', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e1', 'done', '2026-10-26 08:01:00+00') $$,
  'a second assigned coach marks the same block of the same athlete'
);
select is(
  (select array_agg(created_by::text || '|' || device_id || '|' || status order by device_id)
   from public.training_plan_fulfillments where block_id = '70000000-0000-4000-8000-000000000021' and athlete_id = '70000000-0000-4000-8000-0000000000e1'),
  array['70000000-0000-4000-8000-0000000000a2|device-1|not_marked', '70000000-0000-4000-8000-0000000000a3|device-2|done'],
  'both marks exist, each with its own author, device and status; neither overwrote the other'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('device-2', '70000000-0000-4000-8000-000000000032', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e3', '2026-10-26 09:00:00+00') $$,
  '42501', null, 'coach C2 cannot mark an athlete who is not assigned to them'
);

-- Others who cannot write marks.
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('device-4', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e1', '2026-10-26 09:00:00+00') $$,
  '42501', null, 'a coach of the school with no assignment to the athlete cannot mark'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('device-5', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e1', '2026-10-26 09:00:00+00') $$,
  '42501', null, 'a coach of another school cannot mark'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('device-1', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e1', '2026-10-26 09:00:00+00') $$,
  '42501', null, 'the school admin cannot mark'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('device-g', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e1', '2026-10-26 09:00:00+00') $$,
  '42501', null, 'a guardian cannot mark'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('device-d', '70000000-0000-4000-8000-000000000036', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e2', '2026-10-26 09:00:00+00') $$,
  '42501', null, 'an adult athlete cannot mark themselves'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a8", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_fulfillments (device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('device-u', '70000000-0000-4000-8000-000000000031', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e1', '2026-10-26 09:00:00+00') $$,
  '42501', null, 'an unrelated user cannot mark'
);

-- Fulfillment reads. Rows: 41 42 43 (e1), 44 (e2), 45 (e3).
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is(
  (select array_agg(id::text order by id) from public.training_plan_fulfillments),
  array['70000000-0000-4000-8000-000000000041', '70000000-0000-4000-8000-000000000042', '70000000-0000-4000-8000-000000000043'], 'guardian G reads the marks of the own athlete and no other'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select is(
  (select array_agg(id::text) from public.training_plan_fulfillments),
  array['70000000-0000-4000-8000-000000000044'], 'adult athlete D reads the own marks and no other'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  (select count(*) from public.training_plan_fulfillments),
  5::bigint, 'the school admin reads all the marks of the school'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  (select count(*) from public.training_plan_fulfillments),
  5::bigint, 'coach C1 reads the marks of all assigned athletes, including a second coach''s'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(
  (select array_agg(id::text order by id) from public.training_plan_fulfillments),
  array['70000000-0000-4000-8000-000000000041', '70000000-0000-4000-8000-000000000042', '70000000-0000-4000-8000-000000000043'], 'coach C2 reads only the marks of e1'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is(
  (select count(*) from public.training_plan_fulfillments),
  0::bigint, 'a coach with no assigned athlete reads no marks'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(
  (select count(*) from public.training_plan_fulfillments),
  0::bigint, 'a coach of another school reads no marks'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a8", "role": "authenticated"}';
select is(
  (select count(*) from public.training_plan_fulfillments),
  0::bigint, 'an unrelated user reads no marks'
);

-- Marks after a withdrawal: stored, hidden from staff. Guardian G2 authorizes
-- e5; C1 marks it before the withdrawal arrives.
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000aa", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
     values ('70000000-0000-4000-8000-000000000084', '70000000-0000-4000-8000-0000000000e5', 'record_times', '70000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00') $$,
  'guardian G2 authorizes e5'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_fulfillments
       (id, device_id, assignment_id, version_id, block_id, athlete_id, status, captured_at)
     values ('70000000-0000-4000-8000-000000000046', 'device-1', '70000000-0000-4000-8000-000000000032', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e5', 'done', '2026-10-02 08:00:00+00'),
            ('70000000-0000-4000-8000-000000000047', 'device-1', '70000000-0000-4000-8000-000000000032', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000022', '70000000-0000-4000-8000-0000000000e5', 'done', '2026-10-06 08:00:00+00') $$,
  'coach C1 marks e5 twice before the withdrawal arrives'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000aa", "role": "authenticated"}';
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-05 09:00:00+00' where id = '70000000-0000-4000-8000-000000000084' $$,
  'guardian G2 withdraws the authorization of e5 (device time 2026-10-05)'
);
reset role;
select is(
  (select array_agg(hidden order by id) from public.training_plan_fulfillments where athlete_id = '70000000-0000-4000-8000-0000000000e5'),
  array[false, true],
  'the withdrawal hides retroactively the mark captured after it and not the earlier one'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_fulfillments
       (id, device_id, assignment_id, version_id, block_id, athlete_id, status, captured_at, hidden)
     values ('70000000-0000-4000-8000-000000000048', 'device-1', '70000000-0000-4000-8000-000000000032', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e5', 'done', '2026-10-07 08:00:00+00', false)
     on conflict (id) do nothing returning id $$,
  'a mark captured after the withdrawal is stored, and the author''s INSERT ... RETURNING is not refused'
);
select is(
  (select array_agg(id::text) from public.training_plan_fulfillments where athlete_id = '70000000-0000-4000-8000-0000000000e5'),
  array['70000000-0000-4000-8000-000000000046'], 'coach C1 sees only the mark captured before the withdrawal'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  (select array_agg(id::text) from public.training_plan_fulfillments where athlete_id = '70000000-0000-4000-8000-0000000000e5'),
  array['70000000-0000-4000-8000-000000000046'], 'the school admin too'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000aa", "role": "authenticated"}';
select is(
  (select array_agg(id::text order by id) from public.training_plan_fulfillments),
  array['70000000-0000-4000-8000-000000000046', '70000000-0000-4000-8000-000000000047', '70000000-0000-4000-8000-000000000048'], 'guardian G2 sees all the marks of e5, hidden ones included'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a9", "role": "authenticated"}';
select is(
  (select count(*) from public.training_plan_fulfillments where athlete_id = '70000000-0000-4000-8000-0000000000e5'),
  3::bigint, 'and so does the platform admin'
);
reset role;
select is(
  (select hidden from public.training_plan_fulfillments where id = '70000000-0000-4000-8000-000000000048'),
  true, 'the client cannot force visibility: an insert that claims hidden = false ends hidden'
);
select is(
  (select created_by::text || '|' || device_id from public.training_plan_fulfillments where id = '70000000-0000-4000-8000-000000000048'),
  '70000000-0000-4000-8000-0000000000a2|device-1', 'the hidden mark keeps its author and device'
);

-- The hidden retry: confirm_training_plan_fulfillment_insert answers a verdict only.
set local role authenticated;
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  public.confirm_training_plan_fulfillment_insert(jsonb_build_object(
    'id', '70000000-0000-4000-8000-000000000048', 'created_by', '70000000-0000-4000-8000-0000000000a2', 'device_id', 'device-1', 'assignment_id', '70000000-0000-4000-8000-000000000032',
    'version_id', '70000000-0000-4000-8000-000000000011', 'block_id', '70000000-0000-4000-8000-000000000021', 'athlete_id', '70000000-0000-4000-8000-0000000000e5', 'status', 'done',
    'captured_at', '2026-10-07T08:00:00+00:00', 'created_at', '2000-01-01T00:00:00+00:00', 'hidden', false)),
  'stored', 'the exact retry of the author is "stored"'
);
select is(
  public.confirm_training_plan_fulfillment_insert(jsonb_build_object('id', '70000000-0000-4000-8000-000000000048', 'status', 'absent')),
  'changed', 'a retry with other values is "changed"'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(
  public.confirm_training_plan_fulfillment_insert(jsonb_build_object('id', '70000000-0000-4000-8000-000000000048', 'status', 'done')),
  'absent', 'another user gets "absent", as for an id that does not exist'
);
select ok(
  not has_function_privilege('anon', 'public.confirm_training_plan_fulfillment_insert(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.training_plan_fulfillments_recompute_hidden(uuid)', 'execute'),
  'anon cannot confirm, and clients cannot recompute'
);

-- A re-grant after the withdrawal: a mark captured after it, uploaded before it
-- arrives, is hidden until it arrives; the ones in between stay hidden.
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_fulfillments
       (id, device_id, assignment_id, version_id, block_id, athlete_id, status, captured_at)
     values ('70000000-0000-4000-8000-000000000049', 'device-1', '70000000-0000-4000-8000-000000000032', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000022', '70000000-0000-4000-8000-0000000000e5', 'done', '2026-10-09 09:00:00+00') $$,
  'coach C1 marks e5 after the coming new authorization, before it arrives'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000aa", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
     values ('70000000-0000-4000-8000-000000000085', '70000000-0000-4000-8000-0000000000e5', 'record_times', '70000000-0000-4000-8000-000000000071', '2026-10-08 08:00:00+00') $$,
  'guardian G2 authorizes e5 again'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  (select array_agg(id::text order by id) from public.training_plan_fulfillments where athlete_id = '70000000-0000-4000-8000-0000000000e5'),
  array['70000000-0000-4000-8000-000000000046', '70000000-0000-4000-8000-000000000049'], 'the mark after the new authorization is visible; the ones in between stay hidden'
);

-- Issue #272: the write-back must not be forgeable. The old mechanism read the
-- ids from the session setting app.hidden_fulfillments, which any client with
-- SQL access can set by hand. A mark captured in between (like 048) ends hidden.
reset role;
create function pg_temp.upload_hidden_mark(new_id uuid)
returns bigint
language sql
as $$
  with ins as (
    insert into public.training_plan_fulfillments
      (id, device_id, assignment_id, version_id, block_id, athlete_id, status, captured_at)
    values
      (new_id, 'device-1', '70000000-0000-4000-8000-000000000032', '70000000-0000-4000-8000-000000000011',
       '70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-0000000000e5', 'done', '2026-10-07 09:00:00+00')
    on conflict (id) do nothing
    returning id
  )
  select count(*) from ins
$$;
set local role authenticated;
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select set_config('app.hidden_fulfillments', '70000000-0000-4000-8000-000000000048,', true);
select is(
  (select count(*) from public.training_plan_fulfillments where id = '70000000-0000-4000-8000-000000000048'),
  0::bigint, 'an author who sets app.hidden_fulfillments by hand does not read the hidden mark'
);
select set_config('app.hidden_fulfillments', '', true);

savepoint upload_mark;
select is(
  pg_temp.upload_hidden_mark('70000000-0000-4000-8000-00000000004a'),
  1::bigint, 'inside a savepoint, the upload of a mark that ends hidden still comes back from RETURNING'
);
release savepoint upload_mark;
select is(
  (select count(*) from public.training_plan_fulfillments where id = '70000000-0000-4000-8000-00000000004a'),
  0::bigint, 'in the next statement of the same transaction the author no longer reads the mark just uploaded hidden'
);
savepoint discarded_mark;
select pg_temp.upload_hidden_mark('70000000-0000-4000-8000-00000000004b');
rollback to savepoint discarded_mark;
select is(
  public.confirm_training_plan_fulfillment_insert(jsonb_build_object('id', '70000000-0000-4000-8000-00000000004a', 'status', 'done')),
  'stored', 'the hidden retry of that mark is still confirmed as stored'
);
reset role;
select is(
  (select array_agg(id::text || ':' || hidden::text) from public.training_plan_fulfillments
   where id in ('70000000-0000-4000-8000-00000000004a', '70000000-0000-4000-8000-00000000004b')),
  array['70000000-0000-4000-8000-00000000004a:true'], 'the released mark is stored hidden and the rolled back one is gone'
);
select is(
  (select count(*) from app.hidden_fulfillment_write_backs),
  0::bigint, 'no mark write-back survives the statement that made it'
);
select ok(
  not has_table_privilege('authenticated', 'app.hidden_fulfillment_write_backs', 'select, insert, update, delete')
    and not has_table_privilege('anon', 'app.hidden_fulfillment_write_backs', 'select, insert, update, delete')
    and not has_function_privilege('anon', 'app.hidden_fulfillment_written_back(uuid)', 'execute'),
  'clients can neither read nor write the mark write-backs, and anon cannot execute the write-back check'
);

-- Issue #324: an UPDATE that reaches a mark already hidden must not unlock it.
-- Clients cannot update fulfillments today; this rolled-back test grants an
-- author UPDATE only to prove the trigger would not leak if that ever changes.
-- The SET list and RETURNING reference no column, so the select policy does not
-- filter the rows the UPDATE reaches.
grant update on public.training_plan_fulfillments to authenticated;
create policy test_324_author_update on public.training_plan_fulfillments
  for update to authenticated using (created_by = (select auth.uid()));
create function pg_temp.update_mark_writes_back(target uuid)
returns boolean
language sql
as $$
  with touched as (
    update public.training_plan_fulfillments set device_id = 'device-324' returning 1
  ),
  done as (select count(*) as n from touched)
  select app.hidden_fulfillment_written_back(target) from done
$$;
create temp table leaked_marks (id uuid);
grant insert, select on leaked_marks to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  pg_temp.update_mark_writes_back('70000000-0000-4000-8000-000000000048'),
  false, 'an UPDATE of a mark that is already hidden does not register a write-back'
);
with leak as (insert into pg_temp.leaked_marks select id from public.training_plan_fulfillments where hidden),
     touch as (update public.training_plan_fulfillments set device_id = 'device-324' returning 1)
select count(*) from touch;
select is(
  (select count(*) from pg_temp.leaked_marks),
  0::bigint, 'a CTE that updates the author''s hidden marks does not let the same statement read them'
);
reset role;
drop policy test_324_author_update on public.training_plan_fulfillments;
revoke update on public.training_plan_fulfillments from authenticated;
set local role authenticated;

-- Plans for guardians: the assigned plan, the assigned version and its blocks.
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is(
  (select array_agg(id::text) from public.training_plans),
  array['70000000-0000-4000-8000-0000000000f1'], 'guardian G reads the assigned plan and not an unassigned one'
);
select is(
  (select array_agg(id::text) from public.training_plan_versions),
  array['70000000-0000-4000-8000-000000000011'], 'and the assigned version only, not another version of the same plan'
);
select is(
  (select array_agg(id::text order by id) from public.training_plan_blocks),
  array['70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-000000000022'], 'and the blocks of that version only'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select is(
  (select array_agg(id::text) from public.training_plan_versions),
  array['70000000-0000-4000-8000-000000000011'], 'adult athlete D reads the assigned version too'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a8", "role": "authenticated"}';
select is(
  (select count(*) from public.training_plans) + (select count(*) from public.training_plan_versions)
    + (select count(*) from public.training_plan_blocks),
  0::bigint, 'an unrelated user reads no plan, version or block'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(
  (select array_agg(id::text) from public.training_plans),
  array['70000000-0000-4000-8000-0000000000f3'], 'a coach of another school reads only the plans of school 2'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is(
  (select array_agg(id::text order by id) from public.training_plan_versions),
  array['70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000012', '70000000-0000-4000-8000-000000000013'], 'staff of the school still read every version'
);

-- Frozen author and date; a version cannot switch under marks; a marked block stays.
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ update public.training_plan_assignments set created_by = '70000000-0000-4000-8000-0000000000a1' where id = '70000000-0000-4000-8000-000000000031' $$,
  '42501', null, 'the author of an assignment cannot change'
);
select lives_ok(
  $$ update public.training_plan_assignments set created_at = '2000-01-01 00:00:00+00' where id = '70000000-0000-4000-8000-000000000031' $$,
  'a change of the date of an assignment is ignored: the server keeps it (issue #74, replayed upserts)'
);
select lives_ok(
  $$ update public.training_plan_assignments set session_date = session_date where id = '70000000-0000-4000-8000-000000000031' $$,
  'an update that changes nothing passes, as a sync retry does'
);
select lives_ok(
  $$ update public.training_plan_assignments set session_date = '2026-10-30' where id = '70000000-0000-4000-8000-000000000031' $$,
  'staff reschedule an assignment'
);
select lives_ok(
  $$ update public.training_plan_assignments set version_id = '70000000-0000-4000-8000-000000000012' where id = '70000000-0000-4000-8000-000000000031' $$,
  'an assignment with marks keeps its version when a PATCH asks for another one (issue #74)'
);
select lives_ok(
  $$ update public.training_plan_assignments set version_id = '70000000-0000-4000-8000-000000000012' where id = '70000000-0000-4000-8000-000000000037' $$,
  'an assignment without marks can switch version'
);
select throws_ok(
  $$ delete from public.training_plan_assignments where id = '70000000-0000-4000-8000-000000000037' $$,
  '42501', null, 'assignments cannot be deleted'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ delete from public.training_plan_blocks where id = '70000000-0000-4000-8000-000000000021' $$,
  '42501', null, 'a block with marks cannot be deleted (the version guard of issue #74 answers before the foreign key)'
);

-- The Sync Streams. This mirrors training_plans_assignments_staff,
-- training_plans_assignments_managed and training_plans_fulfillments in
-- powersync/sync-config.yaml: each query with auth.user_id() replaced by the
-- user id (the queries of a stream are joined with union all here; they are
-- separate queries there). A stream may give less than RLS, never more.
reset role;

-- Assignments, coach C1: its groups and the groups of its direct athletes, its athletes (direct and by group), their
-- categories and the school-wide ones, all within its schools.
create temp table stream_c1 as
select id from public.training_plan_assignments
where school_id in (select school_id from public.school_memberships where user_id = '70000000-0000-4000-8000-0000000000a2')
  and (
    group_id in (select group_id from public.coach_group_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a2')
    or group_id in (select group_id from public.athlete_groups where athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a2'))
    or athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a2')
    or athlete_id in (select athlete_id from public.athlete_groups where group_id in (select group_id from public.coach_group_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a2'))
    or category_id in (select category_id from public.athlete_schools where category_id is not null and athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a2'))
    or category_id in (select category_id from public.athlete_schools where category_id is not null and athlete_id in (select athlete_id from public.athlete_groups where group_id in (select group_id from public.coach_group_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a2')))
    or target = 'school'
  );
select set_eq(
  $$ select id from stream_c1 $$,
  $$ values ('70000000-0000-4000-8000-000000000031'::uuid), ('70000000-0000-4000-8000-000000000032'), ('70000000-0000-4000-8000-000000000033'), ('70000000-0000-4000-8000-000000000034'), ('70000000-0000-4000-8000-000000000036'), ('70000000-0000-4000-8000-000000000037') $$,
  'the coach stream carries the assignments of the coach''s group, athletes, categories and school, not another group''s'
);
create temp table stream_c2 as
select id from public.training_plan_assignments
where school_id in (select school_id from public.school_memberships where user_id = '70000000-0000-4000-8000-0000000000a3')
  and (
    group_id in (select group_id from public.coach_group_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a3')
    or group_id in (select group_id from public.athlete_groups where athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a3'))
    or athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a3')
    or athlete_id in (select athlete_id from public.athlete_groups where group_id in (select group_id from public.coach_group_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a3'))
    or category_id in (select category_id from public.athlete_schools where category_id is not null and athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a3'))
    or category_id in (select category_id from public.athlete_schools where category_id is not null and athlete_id in (select athlete_id from public.athlete_groups where group_id in (select group_id from public.coach_group_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a3')))
    or target = 'school'
  );
select set_eq(
  $$ select id from stream_c2 $$,
  $$ values ('70000000-0000-4000-8000-000000000031'::uuid), ('70000000-0000-4000-8000-000000000032'), ('70000000-0000-4000-8000-000000000033'), ('70000000-0000-4000-8000-000000000034') $$,
  'the stream of a coach assigned to one athlete carries that athlete''s assignment, the assignment of its group, its category and the school-wide one'
);
create temp table stream_admin as
select id from public.training_plan_assignments
where school_id in (select school_id from public.school_memberships where user_id = '70000000-0000-4000-8000-0000000000a1' and role = 'school_admin');
select set_eq(
  $$ select id from stream_admin $$,
  $$ values ('70000000-0000-4000-8000-000000000031'::uuid), ('70000000-0000-4000-8000-000000000032'), ('70000000-0000-4000-8000-000000000033'), ('70000000-0000-4000-8000-000000000034'), ('70000000-0000-4000-8000-000000000035'), ('70000000-0000-4000-8000-000000000036'), ('70000000-0000-4000-8000-000000000037') $$,
  'the school admin stream carries every assignment of the school'
);
-- Guardian G and adult D: the same four conditions as the select policy.
create temp table stream_g as
select id from public.training_plan_assignments
where athlete_id in (select athlete_id from public.athlete_managers where user_id = '70000000-0000-4000-8000-0000000000a6')
   or group_id in (select group_id from public.athlete_groups where athlete_id in (select athlete_id from public.athlete_managers where user_id = '70000000-0000-4000-8000-0000000000a6'))
   or category_id in (select category_id from public.athlete_schools where category_id is not null and athlete_id in (select athlete_id from public.athlete_managers where user_id = '70000000-0000-4000-8000-0000000000a6'))
   or (target = 'school' and school_id in (select school_id from public.athlete_schools where athlete_id in (select athlete_id from public.athlete_managers where user_id = '70000000-0000-4000-8000-0000000000a6')));
select set_eq(
  $$ select id from stream_g $$,
  $$ values ('70000000-0000-4000-8000-000000000031'::uuid), ('70000000-0000-4000-8000-000000000032'), ('70000000-0000-4000-8000-000000000033'), ('70000000-0000-4000-8000-000000000034') $$,
  'the guardian stream carries the assignments of the athlete, its group, category and school'
);
create temp table stream_d as
select id from public.training_plan_assignments
where athlete_id in (select athlete_id from public.athlete_managers where user_id = '70000000-0000-4000-8000-0000000000a7')
   or group_id in (select group_id from public.athlete_groups where athlete_id in (select athlete_id from public.athlete_managers where user_id = '70000000-0000-4000-8000-0000000000a7'))
   or category_id in (select category_id from public.athlete_schools where category_id is not null and athlete_id in (select athlete_id from public.athlete_managers where user_id = '70000000-0000-4000-8000-0000000000a7'))
   or (target = 'school' and school_id in (select school_id from public.athlete_schools where athlete_id in (select athlete_id from public.athlete_managers where user_id = '70000000-0000-4000-8000-0000000000a7')));
select set_eq(
  $$ select id from stream_d $$,
  $$ values ('70000000-0000-4000-8000-000000000034'::uuid), ('70000000-0000-4000-8000-000000000036') $$,
  'the adult athlete stream carries the own and school-wide assignments only'
);
-- The plan, version and block streams of the guardian follow those assignments.
create temp table stream_g_plans as
select p.id as plan_id, v.id as version_id, b.id as block_id
from public.training_plan_assignments a
join public.training_plans p on p.id = a.plan_id
join public.training_plan_versions v on v.id = a.version_id
join public.training_plan_blocks b on b.version_id = v.id
where a.id in (select id from stream_g);
select set_eq(
  $$ select distinct plan_id from stream_g_plans $$,
  $$ values ('70000000-0000-4000-8000-0000000000f1'::uuid) $$, 'the guardian plan stream carries the assigned plan'
);
select set_eq(
  $$ select distinct version_id from stream_g_plans $$,
  $$ values ('70000000-0000-4000-8000-000000000011'::uuid) $$, 'and the assigned version only'
);
select set_eq(
  $$ select block_id from stream_g_plans $$,
  $$ values ('70000000-0000-4000-8000-000000000021'::uuid), ('70000000-0000-4000-8000-000000000022') $$, 'and its blocks'
);

-- Fulfillments: managers get every row of their athletes, hidden included;
-- coaches and admins only hidden = false, one query per source.
create temp table stream_f_c1 as
select id from public.training_plan_fulfillments
where hidden = false
  and (athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a2')
    or athlete_id in (select athlete_id from public.athlete_groups where group_id in (select group_id from public.coach_group_assignments where coach_user_id = '70000000-0000-4000-8000-0000000000a2')));
select set_eq(
  $$ select id from stream_f_c1 $$,
  $$ values ('70000000-0000-4000-8000-000000000041'::uuid), ('70000000-0000-4000-8000-000000000042'), ('70000000-0000-4000-8000-000000000043'), ('70000000-0000-4000-8000-000000000044'), ('70000000-0000-4000-8000-000000000045'), ('70000000-0000-4000-8000-000000000046'), ('70000000-0000-4000-8000-000000000049') $$,
  'the coach fulfillment stream carries the visible marks and none of the hidden ones'
);
create temp table stream_f_admin as
select id from public.training_plan_fulfillments
where hidden = false
  and athlete_id in (select athlete_id from public.athlete_schools where school_id in (select school_id from public.school_memberships where user_id = '70000000-0000-4000-8000-0000000000a1' and role = 'school_admin'));
select set_eq(
  $$ select id from stream_f_admin $$,
  $$ values ('70000000-0000-4000-8000-000000000041'::uuid), ('70000000-0000-4000-8000-000000000042'), ('70000000-0000-4000-8000-000000000043'), ('70000000-0000-4000-8000-000000000044'), ('70000000-0000-4000-8000-000000000045'), ('70000000-0000-4000-8000-000000000046'), ('70000000-0000-4000-8000-000000000049') $$,
  'the school admin fulfillment stream carries the visible marks only'
);
create temp table stream_f_g2 as
select id from public.training_plan_fulfillments
where athlete_id in (select athlete_id from public.athlete_managers where user_id = '70000000-0000-4000-8000-0000000000aa');
select set_eq(
  $$ select id from stream_f_g2 $$,
  $$ values ('70000000-0000-4000-8000-000000000046'::uuid), ('70000000-0000-4000-8000-000000000047'), ('70000000-0000-4000-8000-000000000048'), ('70000000-0000-4000-8000-000000000049'), ('70000000-0000-4000-8000-00000000004a') $$,
  'the guardian fulfillment stream has no hidden filter, so it carries the hidden marks'
);
create temp table stream_f_g as
select id from public.training_plan_fulfillments
where athlete_id in (select athlete_id from public.athlete_managers where user_id = '70000000-0000-4000-8000-0000000000a6');

-- Never more than RLS: as each user, nothing of the stream is outside what the
-- user reads.
grant select on stream_c1, stream_c2, stream_admin, stream_g, stream_d, stream_g_plans,
  stream_f_c1, stream_f_admin, stream_f_g2, stream_f_g to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty(
  $$ select id from stream_c1 except select id from public.training_plan_assignments $$,
  'every assignment in the coach stream is readable by the coach'
);
select is_empty(
  $$ select id from stream_f_c1 except select id from public.training_plan_fulfillments $$,
  'every mark in the coach fulfillment stream is readable by the coach'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is_empty(
  $$ select id from stream_c2 except select id from public.training_plan_assignments $$,
  'every assignment in the second coach stream is readable by that coach'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is_empty(
  $$ select id from stream_admin except select id from public.training_plan_assignments $$,
  'every assignment in the school admin stream is readable by the admin'
);
select is_empty(
  $$ select id from stream_f_admin except select id from public.training_plan_fulfillments $$,
  'every mark in the school admin stream is readable by the admin'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select set_eq(
  $$ select id from stream_g $$,
  $$ select id from public.training_plan_assignments $$,
  'the guardian assignment stream is exactly what the guardian reads'
);
select set_eq(
  $$ select id from stream_f_g $$,
  $$ select id from public.training_plan_fulfillments $$,
  'the guardian fulfillment stream is exactly what the guardian reads'
);
select is_empty(
  $$ select plan_id from stream_g_plans except select id from public.training_plans $$,
  'every plan in the guardian stream is readable by the guardian'
);
select is_empty(
  $$ select version_id from stream_g_plans except select id from public.training_plan_versions $$,
  'every version in the guardian stream is readable by the guardian'
);
select is_empty(
  $$ select block_id from stream_g_plans except select id from public.training_plan_blocks $$,
  'every block in the guardian stream is readable by the guardian'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select set_eq(
  $$ select id from stream_d $$,
  $$ select id from public.training_plan_assignments $$,
  'the adult athlete assignment stream is exactly what the adult reads'
);
set local request.jwt.claims = '{"sub": "70000000-0000-4000-8000-0000000000aa", "role": "authenticated"}';
select set_eq(
  $$ select id from stream_f_g2 $$,
  $$ select id from public.training_plan_fulfillments $$,
  'the second guardian fulfillment stream is exactly what that guardian reads, hidden marks included'
);
reset role;

select * from finish();
rollback;
