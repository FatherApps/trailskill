-- Regression tests for the conditions of the plan versioning of issue #74 (see
-- 20261026060000_training-plans_versioning.sql and versioning.test.sql): a PATCH
-- of an assignment to an incomplete version, a block moved into or out of a
-- version with a mark, a no-op block update, completing a version (marked sessions
-- stay, unmarked move, withdrawn and higher ones are left alone), a mark of
-- another version (re-pin or refusal), a replayed version PUT, and the server's
-- ownership of assigned. All data here is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);
-- Users: coach C1 (school 1, responsible for group g1) and U, who accepts the
-- authorizations.
insert into auth.users (id, email) values
  ('74000000-0000-4000-8000-0000000000a1', 'coach-c1@example.test'),
  ('74000000-0000-4000-8000-0000000000a2', 'authorizer-u@example.test');

insert into public.schools (id, name) values
  ('74000000-0000-4000-8000-0000000000b1', 'Versioning School One');

insert into public.school_memberships (school_id, user_id, role) values
  ('74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000a1', 'coach');

insert into public.training_groups (id, school_id, name) values
  ('74000000-0000-4000-8000-0000000000c1', '74000000-0000-4000-8000-0000000000b1', 'Group One');

insert into public.athletes (id, first_name, last_name) values
  ('74000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('74000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('74000000-0000-4000-8000-0000000000e3', 'Athlete', 'E3');
insert into public.athlete_schools (athlete_id, school_id, category_id) values
  ('74000000-0000-4000-8000-0000000000e1', '74000000-0000-4000-8000-0000000000b1', null),
  ('74000000-0000-4000-8000-0000000000e2', '74000000-0000-4000-8000-0000000000b1', null),
  ('74000000-0000-4000-8000-0000000000e3', '74000000-0000-4000-8000-0000000000b1', null);
insert into public.athlete_groups (athlete_id, group_id) values
  ('74000000-0000-4000-8000-0000000000e1', '74000000-0000-4000-8000-0000000000c1'),
  ('74000000-0000-4000-8000-0000000000e2', '74000000-0000-4000-8000-0000000000c1'),
  ('74000000-0000-4000-8000-0000000000e3', '74000000-0000-4000-8000-0000000000c1');
insert into public.coach_group_assignments (coach_user_id, group_id)
  values ('74000000-0000-4000-8000-0000000000a1', '74000000-0000-4000-8000-0000000000c1');

insert into public.authorization_texts (id, purpose, version, language, body) values
  ('74000000-0000-4000-8000-000000000071', 'record_times', 1, 'en-US', 'Synthetic record times text v1');
insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at, user_id) values
  ('74000000-0000-4000-8000-000000000081', '74000000-0000-4000-8000-0000000000e1', 'record_times', '74000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '74000000-0000-4000-8000-0000000000a2'),
  ('74000000-0000-4000-8000-000000000082', '74000000-0000-4000-8000-0000000000e2', 'record_times', '74000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '74000000-0000-4000-8000-0000000000a2'),
  ('74000000-0000-4000-8000-000000000083', '74000000-0000-4000-8000-0000000000e3', 'record_times', '74000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '74000000-0000-4000-8000-0000000000a2');

-- f1 is the plan of most tests, f2 the scenario of the issue, f3 the plan whose
-- only mark ends hidden.
insert into public.training_plans (id, created_by, school_id, name) values
  ('74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-0000000000a1', '74000000-0000-4000-8000-0000000000b1', 'Plan One'),
  ('74000000-0000-4000-8000-0000000000f2', '74000000-0000-4000-8000-0000000000a1', '74000000-0000-4000-8000-0000000000b1', 'Plan Two'),
  ('74000000-0000-4000-8000-0000000000f3', '74000000-0000-4000-8000-0000000000a1', '74000000-0000-4000-8000-0000000000b1', 'Plan Three');

-- Plan f3: version 16 with one block, one assignment and one mark of e3. The
-- authorization of e3 is then withdrawn with a device date before the mark, so
-- the mark ends hidden (the withdrawal hides retroactively).
insert into public.training_plan_versions (id, created_by, plan_id, version) values
  ('74000000-0000-4000-8000-000000000016', '74000000-0000-4000-8000-0000000000a1', '74000000-0000-4000-8000-0000000000f3', 1);
insert into public.training_plan_blocks
  (id, created_by, version_id, position, repetitions, distance, stroke, phase, recording) values
  ('74000000-0000-4000-8000-000000000028', '74000000-0000-4000-8000-0000000000a1', '74000000-0000-4000-8000-000000000016', 1, 4, '50m', 'FR', 'main', 'completion');
insert into public.training_plan_assignments (id, created_by, school_id, plan_id, version_id, session_date, target, group_id) values
  ('74000000-0000-4000-8000-00000000003a', '74000000-0000-4000-8000-0000000000a1', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f3', '74000000-0000-4000-8000-000000000016', '2026-10-26', 'group', '74000000-0000-4000-8000-0000000000c1');
insert into public.training_plan_fulfillments (id, created_by, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values
  ('74000000-0000-4000-8000-000000000093', '74000000-0000-4000-8000-0000000000a1', 'device-1', '74000000-0000-4000-8000-00000000003a', '74000000-0000-4000-8000-000000000016', '74000000-0000-4000-8000-000000000028', '74000000-0000-4000-8000-0000000000e3', '2026-10-26 08:00:00+00');
set local role authenticated;
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
update public.authorizations set withdrawn_at = '2026-10-05 09:00:00+00' where id = '74000000-0000-4000-8000-000000000083';
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

-- Plan f1: v1 (new client flow: false, blocks, true), v2 incomplete with a block.
insert into public.training_plan_versions (id, plan_id, version, complete) values ('74000000-0000-4000-8000-000000000901', '74000000-0000-4000-8000-0000000000f1', 1, false);
insert into public.training_plan_blocks (id, version_id, position, repetitions, distance, stroke, phase, recording) values
  ('74000000-0000-4000-8000-000000000911', '74000000-0000-4000-8000-000000000901', 1, 4, '50m', 'FR', 'warm_up', 'completion'),
  ('74000000-0000-4000-8000-000000000912', '74000000-0000-4000-8000-000000000901', 2, 8, '50m', 'FR', 'main', 'per_repetition');
update public.training_plan_versions set complete = true where id = '74000000-0000-4000-8000-000000000901';
insert into public.training_plan_versions (id, plan_id, version, complete) values ('74000000-0000-4000-8000-000000000902', '74000000-0000-4000-8000-0000000000f1', 2, false);
insert into public.training_plan_blocks (id, version_id, position, repetitions, distance, stroke, phase, recording) values
  ('74000000-0000-4000-8000-000000000921', '74000000-0000-4000-8000-000000000902', 1, 6, '100m', 'BK', 'main', 'completion');
insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id) values
  ('74000000-0000-4000-8000-000000000931', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000901', '2026-11-01', 'group', '74000000-0000-4000-8000-0000000000c1'),
  ('74000000-0000-4000-8000-000000000932', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000901', '2026-11-02', 'group', '74000000-0000-4000-8000-0000000000c1');

select is((select assigned from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000901'), true, 'P1 v1 assigned by the assignments');
select is((select assigned from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000902'), false, 'P1b v2 not assigned');

-- P2 PATCH to an incomplete version: version kept, other column applies.
select lives_ok($$ update public.training_plan_assignments set version_id = '74000000-0000-4000-8000-000000000902', session_date = '2026-11-05' where id = '74000000-0000-4000-8000-000000000931' $$, 'P2 patch to incomplete accepted');
select results_eq($$ select version_id, session_date from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000931' $$,
  $$ values ('74000000-0000-4000-8000-000000000901'::uuid, '2026-11-05'::date) $$, 'P2 version kept, date applied');

-- first mark on s31 (v1)
insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
  values ('74000000-0000-4000-8000-000000000991', 'd1', '74000000-0000-4000-8000-000000000931', '74000000-0000-4000-8000-000000000901', '74000000-0000-4000-8000-000000000911', '74000000-0000-4000-8000-0000000000e1', '2026-11-05 08:00:00+00');

-- P3 block moves between versions
select throws_ok($$ update public.training_plan_blocks set version_id = '74000000-0000-4000-8000-000000000901' where id = '74000000-0000-4000-8000-000000000921' $$, '42501',
  'new row violates row-level security policy for table "training_plan_blocks"', 'P3 block moved INTO a marked version refused');
select throws_ok($$ update public.training_plan_blocks set version_id = '74000000-0000-4000-8000-000000000902' where id = '74000000-0000-4000-8000-000000000911' $$, '42501',
  'new row violates row-level security policy for table "training_plan_blocks"', 'P3 block moved OUT of a marked version refused');
select results_eq($$ select id, version_id from public.training_plan_blocks where id in ('74000000-0000-4000-8000-000000000911','74000000-0000-4000-8000-000000000921') order by id $$,
  $$ values ('74000000-0000-4000-8000-000000000911'::uuid,'74000000-0000-4000-8000-000000000901'::uuid), ('74000000-0000-4000-8000-000000000921'::uuid,'74000000-0000-4000-8000-000000000902'::uuid) $$, 'P3 data unchanged after refusals');

-- P4 (an identical upsert replay of a block of a marked version) is pinned in
-- versioning.test.sql. A no-op update that sends a null equipment still passes.
select lives_ok($$ update public.training_plan_blocks set equipment = null where id = '74000000-0000-4000-8000-000000000911' $$, 'P4b noop update with null equipment passes');

-- P5 complete v2: s31 (marks) stays, s32 (none) moves
update public.training_plan_versions set complete = true where id = '74000000-0000-4000-8000-000000000902';
select results_eq($$ select id, version_id from public.training_plan_assignments where id in ('74000000-0000-4000-8000-000000000931','74000000-0000-4000-8000-000000000932') order by id $$,
  $$ values ('74000000-0000-4000-8000-000000000931'::uuid,'74000000-0000-4000-8000-000000000901'::uuid), ('74000000-0000-4000-8000-000000000932'::uuid,'74000000-0000-4000-8000-000000000902'::uuid) $$, 'P5 marked stays, unmarked moves');

-- P6 stale mark of v2 for the marked session s31 -> refused, nothing changes
select throws_ok($$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
  values ('74000000-0000-4000-8000-000000000992', 'd1', '74000000-0000-4000-8000-000000000931', '74000000-0000-4000-8000-000000000902', '74000000-0000-4000-8000-000000000921', '74000000-0000-4000-8000-0000000000e1', '2026-11-05 09:00:00+00') $$, '42501',
  'new row violates row-level security policy for table "training_plan_fulfillments"', 'P6 mark of another version on a marked session refused');
select results_eq($$ select (select count(*) from public.training_plan_fulfillments where assignment_id = '74000000-0000-4000-8000-000000000931'), (select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000931') $$,
  $$ values (1::bigint, '74000000-0000-4000-8000-000000000901'::uuid) $$, 'P6 data unchanged');

-- P7 stale mark of v1 for moved s32 (no marks): re-pinned, then a second stale mark of v2 refused
select lives_ok($$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
  values ('74000000-0000-4000-8000-000000000993', 'd1', '74000000-0000-4000-8000-000000000932', '74000000-0000-4000-8000-000000000901', '74000000-0000-4000-8000-000000000912', '74000000-0000-4000-8000-0000000000e1', '2026-11-02 09:00:00+00') $$, 'P7 stale mark accepted');
select is((select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000932'), '74000000-0000-4000-8000-000000000901'::uuid, 'P7 session re-pinned');
select throws_ok($$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
  values ('74000000-0000-4000-8000-000000000994', 'd1', '74000000-0000-4000-8000-000000000932', '74000000-0000-4000-8000-000000000902', '74000000-0000-4000-8000-000000000921', '74000000-0000-4000-8000-0000000000e1', '2026-11-02 09:30:00+00') $$, '42501', null, 'P7b now marked session refuses other version');
select is((select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000932'), '74000000-0000-4000-8000-000000000901'::uuid, 'P7c session stays on v1 after refusal');

-- P8 replay of v2 PUT as upsert after completion; session assigned to v1 later stays
insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id)
  values ('74000000-0000-4000-8000-000000000933', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000901', '2026-11-03', 'group', '74000000-0000-4000-8000-0000000000c1');
select lives_ok($$ insert into public.training_plan_versions (id, plan_id, version, complete, assigned)
  values ('74000000-0000-4000-8000-000000000902', '74000000-0000-4000-8000-0000000000f1', 2, false, false) on conflict (id) do update set plan_id = excluded.plan_id, version = excluded.version,
  complete = excluded.complete, assigned = excluded.assigned, created_at = excluded.created_at $$, 'P8 replay of v2 accepted');
select results_eq($$ select (select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000933'), complete from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000902' $$,
  $$ values ('74000000-0000-4000-8000-000000000901'::uuid, true) $$, 'P8 replay does not move sessions, stays complete');

-- P9 assigned cannot be set/cleared
select lives_ok($$ update public.training_plan_versions set assigned = false where id = '74000000-0000-4000-8000-000000000901' $$, 'P9 clear accepted');
select is((select assigned from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000901'), true, 'P9 stays true');
select lives_ok($$ insert into public.training_plan_versions (id, plan_id, version, complete) values ('74000000-0000-4000-8000-000000000903', '74000000-0000-4000-8000-0000000000f1', 3, false) $$, 'P9 v3');
select lives_ok($$ update public.training_plan_versions set assigned = true where id = '74000000-0000-4000-8000-000000000903' $$, 'P9 set accepted');
select is((select assigned from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000903'), false, 'P9 stays false');

-- P10 plan f2: withdrawn and higher-numbered sessions during completion
insert into public.training_plan_versions (id, plan_id, version) values ('74000000-0000-4000-8000-000000000941', '74000000-0000-4000-8000-0000000000f2', 1);
insert into public.training_plan_blocks (id, version_id, position, repetitions, distance, stroke, phase, recording) values ('74000000-0000-4000-8000-000000000951', '74000000-0000-4000-8000-000000000941', 1, 4, '50m', 'FR', 'main', 'completion');
insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id) values
  ('74000000-0000-4000-8000-000000000961', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f2', '74000000-0000-4000-8000-000000000941', '2026-11-10', 'group', '74000000-0000-4000-8000-0000000000c1'),
  ('74000000-0000-4000-8000-000000000962', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f2', '74000000-0000-4000-8000-000000000941', '2026-11-11', 'group', '74000000-0000-4000-8000-0000000000c1');
update public.training_plan_assignments set withdrawn_at = now() where id = '74000000-0000-4000-8000-000000000962';
insert into public.training_plan_versions (id, plan_id, version, complete) values ('74000000-0000-4000-8000-000000000943', '74000000-0000-4000-8000-0000000000f2', 3, false);
insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id)
  values ('74000000-0000-4000-8000-000000000963', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f2', '74000000-0000-4000-8000-000000000943', '2026-11-12', 'group', '74000000-0000-4000-8000-0000000000c1');
update public.training_plan_versions set complete = true where id = '74000000-0000-4000-8000-000000000943';
select results_eq($$ select id, version_id from public.training_plan_assignments where plan_id = '74000000-0000-4000-8000-0000000000f2' order by id $$,
  $$ values ('74000000-0000-4000-8000-000000000961'::uuid,'74000000-0000-4000-8000-000000000943'::uuid), ('74000000-0000-4000-8000-000000000962'::uuid,'74000000-0000-4000-8000-000000000941'::uuid), ('74000000-0000-4000-8000-000000000963'::uuid,'74000000-0000-4000-8000-000000000943'::uuid) $$, 'P10 move/withdrawn/higher');
select is((select assigned from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000941'), true, 'P10 v1 still assigned (never touched)');

-- P11 mark on a withdrawn session whose version differs
select lives_ok($$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
  values ('74000000-0000-4000-8000-000000000995', 'd1', '74000000-0000-4000-8000-000000000962', '74000000-0000-4000-8000-000000000941', '74000000-0000-4000-8000-000000000951', '74000000-0000-4000-8000-0000000000e1', '2026-11-11 09:00:00+00') $$, 'P11 mark on withdrawn session of its own version');

-- P12 mark naming an incomplete version for a session on another version
insert into public.training_plan_versions (id, plan_id, version, complete) values ('74000000-0000-4000-8000-000000000944', '74000000-0000-4000-8000-0000000000f2', 4, false);
insert into public.training_plan_blocks (id, version_id, position, repetitions, distance, stroke, phase, recording) values ('74000000-0000-4000-8000-000000000952', '74000000-0000-4000-8000-000000000944', 1, 4, '50m', 'FR', 'main', 'completion');
select throws_ok($$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
  values ('74000000-0000-4000-8000-000000000996', 'd1', '74000000-0000-4000-8000-000000000961', '74000000-0000-4000-8000-000000000944', '74000000-0000-4000-8000-000000000952', '74000000-0000-4000-8000-0000000000e1', '2026-11-10 09:00:00+00') $$, '23503', null, 'P12 mark on incomplete version -> observed error');

select * from finish();
rollback;
