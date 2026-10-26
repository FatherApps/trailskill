-- A coach records a plan fulfillment only of an athlete in their charge in the
-- assignment's school (issue #321). Coach C coaches in schools A and B. X is
-- only in A and assigned to C in A. Y is in A and B and assigned to C only in
-- B. Z is in A and B and in a training group of B coached by C. All users and
-- data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values
  ('32110000-0000-4000-8000-0000000000a1', 'coach-c@example.test'),
  ('32110000-0000-4000-8000-0000000000a4', 'authorizer-u@example.test');

insert into public.schools (id, name) values
  ('32110000-0000-4000-8000-0000000000b1', 'Plan Scope School A'),
  ('32110000-0000-4000-8000-0000000000b2', 'Plan Scope School B');

insert into public.school_memberships (school_id, user_id, role) values
  ('32110000-0000-4000-8000-0000000000b1', '32110000-0000-4000-8000-0000000000a1', 'coach'),
  ('32110000-0000-4000-8000-0000000000b2', '32110000-0000-4000-8000-0000000000a1', 'coach');

-- e1 is X (only A), e2 is Y and e3 is Z (both A and B).
insert into public.athletes (id, first_name, last_name) values
  ('32110000-0000-4000-8000-0000000000e1', 'Athlete', 'X'),
  ('32110000-0000-4000-8000-0000000000e2', 'Athlete', 'Y'),
  ('32110000-0000-4000-8000-0000000000e3', 'Athlete', 'Z');

insert into public.athlete_schools (athlete_id, school_id) values
  ('32110000-0000-4000-8000-0000000000e1', '32110000-0000-4000-8000-0000000000b1'),
  ('32110000-0000-4000-8000-0000000000e2', '32110000-0000-4000-8000-0000000000b1'),
  ('32110000-0000-4000-8000-0000000000e2', '32110000-0000-4000-8000-0000000000b2'),
  ('32110000-0000-4000-8000-0000000000e3', '32110000-0000-4000-8000-0000000000b1'),
  ('32110000-0000-4000-8000-0000000000e3', '32110000-0000-4000-8000-0000000000b2');

insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  ('32110000-0000-4000-8000-0000000000a1', '32110000-0000-4000-8000-0000000000e1', '32110000-0000-4000-8000-0000000000b1'),
  ('32110000-0000-4000-8000-0000000000a1', '32110000-0000-4000-8000-0000000000e2', '32110000-0000-4000-8000-0000000000b2');

insert into public.training_groups (id, school_id, name) values
  ('32110000-0000-4000-8000-0000000000d1', '32110000-0000-4000-8000-0000000000b2', 'Plan Scope Group B');
insert into public.athlete_groups (athlete_id, group_id) values
  ('32110000-0000-4000-8000-0000000000e3', '32110000-0000-4000-8000-0000000000d1');
insert into public.coach_group_assignments (coach_user_id, group_id) values
  ('32110000-0000-4000-8000-0000000000a1', '32110000-0000-4000-8000-0000000000d1');

insert into public.authorization_texts (id, purpose, version, language, body) values
  ('32110000-0000-4000-8000-000000000071', 'record_times', 1, 'en-US', 'Synthetic record times text v1');
insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at, user_id) values
  ('32110000-0000-4000-8000-000000000081', '32110000-0000-4000-8000-0000000000e1', 'record_times', '32110000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '32110000-0000-4000-8000-0000000000a4'),
  ('32110000-0000-4000-8000-000000000082', '32110000-0000-4000-8000-0000000000e2', 'record_times', '32110000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '32110000-0000-4000-8000-0000000000a4'),
  ('32110000-0000-4000-8000-000000000083', '32110000-0000-4000-8000-0000000000e3', 'record_times', '32110000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '32110000-0000-4000-8000-0000000000a4');

-- A plan with one version and one block in each school.
insert into public.training_plans (id, created_by, school_id, name) values
  ('32110000-0000-4000-8000-0000000000f1', '32110000-0000-4000-8000-0000000000a1', '32110000-0000-4000-8000-0000000000b1', 'Plan A'),
  ('32110000-0000-4000-8000-0000000000f2', '32110000-0000-4000-8000-0000000000a1', '32110000-0000-4000-8000-0000000000b2', 'Plan B');
insert into public.training_plan_versions (id, created_by, plan_id, version) values
  ('32110000-0000-4000-8000-000000000011', '32110000-0000-4000-8000-0000000000a1', '32110000-0000-4000-8000-0000000000f1', 1),
  ('32110000-0000-4000-8000-000000000012', '32110000-0000-4000-8000-0000000000a1', '32110000-0000-4000-8000-0000000000f2', 1);
insert into public.training_plan_blocks
  (id, created_by, version_id, position, repetitions, distance, stroke, phase, recording) values
  ('32110000-0000-4000-8000-000000000021', '32110000-0000-4000-8000-0000000000a1', '32110000-0000-4000-8000-000000000011', 1, 4, '50m', 'FR', 'warm_up', 'completion'),
  ('32110000-0000-4000-8000-000000000022', '32110000-0000-4000-8000-0000000000a1', '32110000-0000-4000-8000-000000000012', 1, 4, '50m', 'FR', 'warm_up', 'completion');

-- a1 (31): the whole school A. a2 (32): the whole school B.
insert into public.training_plan_assignments (id, created_by, school_id, plan_id, version_id, session_date, target) values
  ('32110000-0000-4000-8000-000000000031', '32110000-0000-4000-8000-0000000000a1', '32110000-0000-4000-8000-0000000000b1', '32110000-0000-4000-8000-0000000000f1', '32110000-0000-4000-8000-000000000011', '2026-10-26', 'school'),
  ('32110000-0000-4000-8000-000000000032', '32110000-0000-4000-8000-0000000000a1', '32110000-0000-4000-8000-0000000000b2', '32110000-0000-4000-8000-0000000000f2', '32110000-0000-4000-8000-000000000012', '2026-10-26', 'school');

set local role authenticated;
set local request.jwt.claims = '{"sub": "32110000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('32110000-0000-4000-8000-000000000041', 'device-c', '32110000-0000-4000-8000-000000000031', '32110000-0000-4000-8000-000000000011', '32110000-0000-4000-8000-000000000021', '32110000-0000-4000-8000-0000000000e2', '2026-10-26 08:00:00+00') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"',
  'C cannot mark Y on an assignment of A, where Y is not in C''s charge'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('32110000-0000-4000-8000-000000000042', 'device-c', '32110000-0000-4000-8000-000000000031', '32110000-0000-4000-8000-000000000011', '32110000-0000-4000-8000-000000000021', '32110000-0000-4000-8000-0000000000e3', '2026-10-26 08:00:00+00') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"',
  'C cannot mark Z on an assignment of A, although C coaches Z''s group in B'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('32110000-0000-4000-8000-000000000043', 'device-c', '32110000-0000-4000-8000-000000000032', '32110000-0000-4000-8000-000000000012', '32110000-0000-4000-8000-000000000022', '32110000-0000-4000-8000-0000000000e2', '2026-10-26 08:00:00+00') $$,
  'C marks Y on an assignment of B'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('32110000-0000-4000-8000-000000000044', 'device-c', '32110000-0000-4000-8000-000000000032', '32110000-0000-4000-8000-000000000012', '32110000-0000-4000-8000-000000000022', '32110000-0000-4000-8000-0000000000e3', '2026-10-26 08:00:00+00') $$,
  'C marks Z on an assignment of B, through the group'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('32110000-0000-4000-8000-000000000045', 'device-c', '32110000-0000-4000-8000-000000000031', '32110000-0000-4000-8000-000000000011', '32110000-0000-4000-8000-000000000021', '32110000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00') $$,
  'C still marks X on an assignment of A'
);

select * from finish();
rollback;
