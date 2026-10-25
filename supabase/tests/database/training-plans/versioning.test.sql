-- Plan versioning (issue #74): editing an assigned plan creates a new version;
-- everything recorded stays tied to the version it was recorded against. The new
-- version applies to the sessions (assignments) without marks; a session with
-- marks keeps its version, so one day never mixes blocks of two versions.
--
-- What this file covers (as a coach through row level security, unless it says
-- the owner): complete (default true, only false to true), assigned (computed by
-- the server, clients can never change it), the block guard (a version with a mark
-- is frozen, hidden marks included), the move of unmarked sessions when a version
-- completes, an assignment PATCH that cannot move a marked session or move to an
-- incomplete version, a mark that re-pins or is refused, the server date of an
-- assignment, and the whole scenario of the issue end to end.
--
-- What pgTAP cannot cover: it is one session in one transaction, so it cannot show
-- (1) the lock order version then assignment and the absence of deadlocks,
-- (2) that a mark committed while a statement waited for a lock is seen by the
-- check that follows the lock (READ COMMITTED snapshots), nor (3) that a block edit
-- and a first mark of the same version serialize. Those arguments rest on the
-- migration comments and need two concurrent connections to be exercised.
-- All data here is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(88);

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

-- Structure.
select col_not_null('public', 'training_plan_versions', 'complete', 'complete is never null');
select col_not_null('public', 'training_plan_versions', 'assigned', 'assigned is never null');
select is(
  (select hidden from public.training_plan_fulfillments where id = '74000000-0000-4000-8000-000000000093'),
  true, 'the mark of plan three is hidden (fixture)'
);
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'training_plan_versions_compute_flags', 'training_plan_versions_move_sessions',
         'training_plan_assignments_keep_version', 'training_plan_assignments_mark_version_assigned',
         'training_plan_assignments_set_date', 'training_plan_blocks_guard_marked_version',
         'training_plan_fulfillments_pin_version')
       and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) $$,
  'clients cannot call the versioning functions'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

-- complete: inserted without the column (a device of the previous app version) a
-- version is complete, so it is a latest version; assigned starts false.
select lives_ok(
  $$ insert into public.training_plan_versions (id, plan_id, version) values ('74000000-0000-4000-8000-000000000011', '74000000-0000-4000-8000-0000000000f1', 1) $$,
  'a version inserted without complete (the previous app) is accepted'
);
select is(
  (select complete from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000011'),
  true, 'and it is complete'
);
select is(
  (select assigned from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000011'),
  false, 'and not assigned'
);
select lives_ok(
  $$ insert into public.training_plan_blocks (id, version_id, position, repetitions, distance, stroke, phase, recording) values
       ('74000000-0000-4000-8000-000000000021', '74000000-0000-4000-8000-000000000011', 1, 4, '50m', 'FR', 'warm_up', 'completion'),
       ('74000000-0000-4000-8000-000000000022', '74000000-0000-4000-8000-000000000011', 2, 8, '50m', 'FR', 'main', 'per_repetition') $$,
  'the blocks of a version without marks are editable (insert)'
);

-- The new client inserts the next version incomplete, and claims assigned.
select lives_ok(
  $$ insert into public.training_plan_versions (id, plan_id, version, complete, assigned) values ('74000000-0000-4000-8000-000000000012', '74000000-0000-4000-8000-0000000000f1', 2, false, true) $$,
  'a version inserted incomplete that claims assigned is accepted'
);
select is(
  (select complete from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000012'),
  false, 'it is incomplete'
);
select is(
  (select assigned from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000012'),
  false, 'and the insert forced assigned to false'
);
select lives_ok(
  $$ insert into public.training_plan_blocks (id, version_id, position, repetitions, distance, stroke, phase, recording) values
       ('74000000-0000-4000-8000-000000000023', '74000000-0000-4000-8000-000000000012', 1, 4, '100m', 'FR', 'main', 'completion') $$,
  'blocks of the incomplete version are inserted'
);
-- Version 3 is inserted out of order and without complete (so it is complete), before
-- any session exists: the move that an insert with complete = true fires has
-- nothing to move yet.
select lives_ok(
  $$ insert into public.training_plan_versions (id, plan_id, version) values ('74000000-0000-4000-8000-000000000013', '74000000-0000-4000-8000-0000000000f1', 3) $$,
  'version 3 is inserted without complete'
);
select is(
  (select complete from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000013'),
  true, 'and it is complete'
);

-- complete only goes from false to true; a retry never fails.
select lives_ok(
  $$ update public.training_plan_versions set complete = false where id = '74000000-0000-4000-8000-000000000011' $$,
  'updating complete from true to false is not an error'
);
select is(
  (select complete from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000011'),
  true, 'and leaves it true'
);
select lives_ok(
  $$ update public.training_plan_versions set complete = false where id = '74000000-0000-4000-8000-000000000012' $$,
  'updating an incomplete version to incomplete again is accepted'
);
select is(
  (select complete from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000012'),
  false, 'and it stays incomplete'
);

-- assigned is the server's.
select lives_ok(
  $$ update public.training_plan_versions set assigned = true where id = '74000000-0000-4000-8000-000000000011' $$,
  'a client update of assigned is accepted'
);
select is(
  (select assigned from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000011'),
  false, 'but cannot set it while no assignment points at the version'
);

-- An assignment sets assigned on its version, and its date is the server's.
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id, created_at)
     values ('74000000-0000-4000-8000-000000000031', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-10-26', 'group', '74000000-0000-4000-8000-0000000000c1', '2000-01-01 00:00:00+00') $$,
  'coach C1 assigns version 1 to the group, claiming an old date'
);
select is(
  (select created_at from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000031'),
  now(), 'the date of an assignment is the time of the server, not the one the device sent'
);
select is(
  (select assigned from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000011'),
  true, 'assigning version 1 sets assigned'
);
select lives_ok(
  $$ update public.training_plan_versions set assigned = false where id = '74000000-0000-4000-8000-000000000011' $$,
  'a client update that clears assigned is accepted'
);
select is(
  (select assigned from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000011'),
  true, 'but assigned stays true'
);

-- More sessions of plan f1: 32 (athlete e2) and 35 start on version 1, 33 is
-- withdrawn, 34 is on version 3.
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id) values
       ('74000000-0000-4000-8000-000000000032', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-10-27', 'athlete', '74000000-0000-4000-8000-0000000000e2'),
       ('74000000-0000-4000-8000-000000000035', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-10-28', 'athlete', '74000000-0000-4000-8000-0000000000e2') $$,
  'coach C1 assigns version 1 to two athlete sessions'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id, withdrawn_at, withdrawn_by)
     values ('74000000-0000-4000-8000-000000000033', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-10-29', 'group', '74000000-0000-4000-8000-0000000000c1', '2026-10-25 08:00:00+00', '74000000-0000-4000-8000-0000000000a1') $$,
  'coach C1 assigns version 1 and withdraws that session'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id)
     values ('74000000-0000-4000-8000-000000000034', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000013', '2026-10-30', 'group', '74000000-0000-4000-8000-0000000000c1') $$,
  'coach C1 assigns version 3 to a session'
);

-- An assignment PATCH to a version inserted without complete is not kept back.
select lives_ok(
  $$ update public.training_plan_assignments set version_id = '74000000-0000-4000-8000-000000000013' where id = '74000000-0000-4000-8000-000000000035' $$,
  'an unmarked session is moved to version 3 (inserted without complete)'
);
select is(
  (select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000035'),
  '74000000-0000-4000-8000-000000000013'::uuid, 'and it applies: a version without the column counts as complete'
);

-- A mark on session 31 freezes version 1.
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('74000000-0000-4000-8000-000000000091', 'device-1', '74000000-0000-4000-8000-000000000031', '74000000-0000-4000-8000-000000000011', '74000000-0000-4000-8000-000000000021', '74000000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00') $$,
  'coach C1 marks a block of version 1 on session 31'
);
select is(
  (select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000031'),
  '74000000-0000-4000-8000-000000000011'::uuid, 'a mark of the session version leaves the session where it is'
);

-- The block guard: a version with a mark cannot change under it.
select throws_ok(
  $$ insert into public.training_plan_blocks (version_id, position, repetitions, distance, stroke, phase, recording) values ('74000000-0000-4000-8000-000000000011', 3, 4, '50m', 'FR', 'main', 'completion') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_blocks"', 'a block cannot be added to a version with a mark'
);
select throws_ok(
  $$ update public.training_plan_blocks set repetitions = 9 where id = '74000000-0000-4000-8000-000000000021' $$,
  '42501', 'new row violates row-level security policy for table "training_plan_blocks"', 'a block of a version with a mark cannot be changed'
);
select throws_ok(
  $$ delete from public.training_plan_blocks where id = '74000000-0000-4000-8000-000000000022' $$,
  '42501', 'new row violates row-level security policy for table "training_plan_blocks"', 'a block of a version with a mark cannot be deleted, marked or not'
);
select throws_ok(
  $$ update public.training_plan_blocks set version_id = '74000000-0000-4000-8000-000000000012' where id = '74000000-0000-4000-8000-000000000022' $$,
  '42501', 'new row violates row-level security policy for table "training_plan_blocks"', 'a block cannot leave a version with a mark'
);
select throws_ok(
  $$ update public.training_plan_blocks set version_id = '74000000-0000-4000-8000-000000000011' where id = '74000000-0000-4000-8000-000000000023' $$,
  '42501', 'new row violates row-level security policy for table "training_plan_blocks"', 'nor enter it'
);
select lives_ok(
  $$ update public.training_plan_blocks set repetitions = repetitions where id = '74000000-0000-4000-8000-000000000021' $$,
  'an update that changes nothing, as a sync upsert retry sends, passes'
);
select lives_ok(
  $$ update public.training_plan_blocks set repetitions = 6 where id = '74000000-0000-4000-8000-000000000023' $$,
  'a block of a version without marks is still editable (update)'
);
select lives_ok(
  $$ insert into public.training_plan_blocks (id, version_id, position, repetitions, distance, stroke, phase, recording) values ('74000000-0000-4000-8000-000000000024', '74000000-0000-4000-8000-000000000012', 2, 4, '50m', 'FR', 'cool_down', 'completion') $$,
  'and insertable'
);
select lives_ok(
  $$ delete from public.training_plan_blocks where id = '74000000-0000-4000-8000-000000000024' $$,
  'and deletable'
);

-- A hidden mark counts too (version 16, whose only mark is hidden).
select throws_ok(
  $$ insert into public.training_plan_blocks (version_id, position, repetitions, distance, stroke, phase, recording) values ('74000000-0000-4000-8000-000000000016', 2, 4, '50m', 'FR', 'main', 'completion') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_blocks"', 'a block cannot be added to a version whose only mark is hidden'
);
select throws_ok(
  $$ update public.training_plan_blocks set repetitions = 9 where id = '74000000-0000-4000-8000-000000000028' $$,
  '42501', 'new row violates row-level security policy for table "training_plan_blocks"', 'nor changed'
);
select throws_ok(
  $$ delete from public.training_plan_blocks where id = '74000000-0000-4000-8000-000000000028' $$,
  '42501', 'new row violates row-level security policy for table "training_plan_blocks"', 'nor deleted'
);

-- An assignment PATCH: version_id stays on a marked session, the other columns apply.
select lives_ok(
  $$ update public.training_plan_assignments set version_id = '74000000-0000-4000-8000-000000000013', session_date = '2026-10-31' where id = '74000000-0000-4000-8000-000000000031' $$,
  'a PATCH moving a session with marks to another version is accepted'
);
select is(
  (select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000031'),
  '74000000-0000-4000-8000-000000000011'::uuid, 'the session with marks keeps its version'
);
select is(
  (select session_date from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000031'),
  '2026-10-31'::date, 'and the rest of the PATCH applies'
);
-- Target version incomplete: the unmarked session keeps its version too.
select lives_ok(
  $$ update public.training_plan_assignments set version_id = '74000000-0000-4000-8000-000000000012', session_date = '2026-11-01' where id = '74000000-0000-4000-8000-000000000032' $$,
  'a PATCH moving an unmarked session to an incomplete version is accepted'
);
select is(
  (select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000032'),
  '74000000-0000-4000-8000-000000000011'::uuid, 'the session keeps its version'
);
select is(
  (select session_date from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000032'),
  '2026-11-01'::date, 'and the rest of the PATCH applies'
);

-- A session assigned after version 2 is complete is the one that must not move.
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-000000000036', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-11-02', 'athlete', '74000000-0000-4000-8000-0000000000e1') $$,
  'coach C1 assigns version 1 to one more session'
);

-- Completing version 2 moves the unmarked sessions of lower versions.
select lives_ok(
  $$ update public.training_plan_versions set complete = true where id = '74000000-0000-4000-8000-000000000012' $$,
  'version 2 completes'
);
select is(
  (select array_agg(id::text order by id) from public.training_plan_assignments
   where version_id = '74000000-0000-4000-8000-000000000012'),
  array['74000000-0000-4000-8000-000000000032', '74000000-0000-4000-8000-000000000036'],
  'the unmarked sessions of version 1 moved to version 2'
);
select is(
  (select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000031'),
  '74000000-0000-4000-8000-000000000011'::uuid, 'the session with a mark keeps version 1'
);
select is(
  (select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000033'),
  '74000000-0000-4000-8000-000000000011'::uuid, 'the withdrawn session keeps version 1'
);
select is(
  (select array_agg(id::text order by id) from public.training_plan_assignments
   where version_id = '74000000-0000-4000-8000-000000000013'),
  array['74000000-0000-4000-8000-000000000034', '74000000-0000-4000-8000-000000000035'],
  'the sessions of version 3, a higher number, did not move'
);
select is(
  (select assigned from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000012'),
  true, 'moving sessions sets assigned on the new version'
);
select lives_ok(
  $$ update public.training_plan_versions set complete = false where id = '74000000-0000-4000-8000-000000000012' $$,
  'a complete version cannot go back to incomplete, and a retry does not fail'
);
select is(
  (select complete from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000012'),
  true, 'it stays complete'
);
-- The move happens on false to true only: this session of version 1 is left alone
-- by a repeated complete.
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id)
     values ('74000000-0000-4000-8000-000000000037', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-11-03', 'athlete', '74000000-0000-4000-8000-0000000000e1') $$,
  'coach C1 assigns version 1 once more'
);
select lives_ok(
  $$ update public.training_plan_versions set complete = true where id = '74000000-0000-4000-8000-000000000012' $$,
  'a repeated complete is accepted'
);
select is(
  (select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000037'),
  '74000000-0000-4000-8000-000000000011'::uuid, 'and moves nothing'
);

-- A mark for a session that moved: it re-pins the session if it has no marks.
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('74000000-0000-4000-8000-000000000092', 'device-2', '74000000-0000-4000-8000-000000000032', '74000000-0000-4000-8000-000000000011', '74000000-0000-4000-8000-000000000021', '74000000-0000-4000-8000-0000000000e2', '2026-10-26 07:00:00+00') $$,
  'a mark on version 1 for a session that moved to version 2 and has no marks is accepted'
);
select is(
  (select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000032'),
  '74000000-0000-4000-8000-000000000011'::uuid, 'the session is pinned back to version 1: the stale mark is not lost'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('74000000-0000-4000-8000-000000000095', 'device-2', '74000000-0000-4000-8000-000000000032', '74000000-0000-4000-8000-000000000012', '74000000-0000-4000-8000-000000000023', '74000000-0000-4000-8000-0000000000e2', '2026-10-26 07:05:00+00') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"', 'a mark of another version for a session that already has marks is refused'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('74000000-0000-4000-8000-000000000096', 'device-2', '74000000-0000-4000-8000-000000000031', '74000000-0000-4000-8000-000000000012', '74000000-0000-4000-8000-000000000023', '74000000-0000-4000-8000-0000000000e1', '2026-10-26 07:06:00+00') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"', 'the same for the first session, which has a mark of version 1'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at)
     values ('74000000-0000-4000-8000-000000000097', 'device-2', '74000000-0000-4000-8000-000000000032', '74000000-0000-4000-8000-000000000011', '74000000-0000-4000-8000-000000000022', '74000000-0000-4000-8000-0000000000e2', '2026-10-26 07:10:00+00') $$,
  'a second mark of the version the session already has is accepted'
);

-- A retried upload: the connector sends a PUT as INSERT ... ON CONFLICT (id) DO
-- UPDATE, so the original PUT can arrive again after the complete PATCH. Its
-- BEFORE INSERT triggers see the proposed row, and the update that follows must
-- have no effect. The stored dates are first moved back (owner, triggers off) so
-- a date taken from the retry would show.
reset role;
alter table public.training_plan_versions disable trigger user;
alter table public.training_plan_assignments disable trigger user;
update public.training_plan_versions set created_at = '2026-10-01 00:00:00+00' where id = '74000000-0000-4000-8000-000000000011';
update public.training_plan_assignments set created_at = '2026-10-01 00:00:00+00' where id = '74000000-0000-4000-8000-000000000031';
alter table public.training_plan_versions enable trigger user;
alter table public.training_plan_assignments enable trigger user;
set local role authenticated;
set local request.jwt.claims = '{"sub": "74000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_versions (id, created_by, plan_id, version, complete, created_at)
     values ('74000000-0000-4000-8000-000000000011', '74000000-0000-4000-8000-0000000000a1', '74000000-0000-4000-8000-0000000000f1', 1, false, '2000-01-01 00:00:00+00')
     on conflict (id) do update set created_by = excluded.created_by, plan_id = excluded.plan_id, version = excluded.version,
       complete = excluded.complete, created_at = excluded.created_at, assigned = excluded.assigned $$,
  'the original PUT of a complete version, sent again as an upsert, is accepted'
);
select is(
  (select complete from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000011'),
  true, 'the version stays complete'
);
select is(
  (select created_at from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000011'),
  '2026-10-01 00:00:00+00'::timestamptz, 'and keeps its date'
);
select is(
  (select assigned from public.training_plan_versions where id = '74000000-0000-4000-8000-000000000011'),
  true, 'and assigned'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, created_by, school_id, plan_id, version_id, session_date, target, group_id, created_at)
     values ('74000000-0000-4000-8000-000000000031', '74000000-0000-4000-8000-0000000000a1', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f1', '74000000-0000-4000-8000-000000000011', '2026-10-31', 'group', '74000000-0000-4000-8000-0000000000c1', '2000-01-01 00:00:00+00')
     on conflict (id) do update set created_by = excluded.created_by, school_id = excluded.school_id, plan_id = excluded.plan_id,
       version_id = excluded.version_id, session_date = excluded.session_date, target = excluded.target,
       group_id = excluded.group_id, created_at = excluded.created_at $$,
  'the original PUT of an assignment, sent again as an upsert, is accepted'
);
select is(
  (select created_at from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000031'),
  '2026-10-01 00:00:00+00'::timestamptz, 'and the assignment keeps its date'
);

-- A version that arrives complete (an insert without the column, or with true)
-- also moves the unmarked sessions of lower versions, as completing one does.
select lives_ok(
  $$ insert into public.training_plan_versions (id, plan_id, version) values ('74000000-0000-4000-8000-000000000017', '74000000-0000-4000-8000-0000000000f1', 4) $$,
  'version 4 is inserted without complete'
);
select is(
  (select array_agg(id::text order by id) from public.training_plan_assignments
   where version_id = '74000000-0000-4000-8000-000000000017'),
  array['74000000-0000-4000-8000-000000000034', '74000000-0000-4000-8000-000000000035', '74000000-0000-4000-8000-000000000036', '74000000-0000-4000-8000-000000000037'],
  'the unmarked sessions of lower versions moved to version 4'
);
select is(
  (select array_agg(id::text order by id) from public.training_plan_assignments
   where version_id = '74000000-0000-4000-8000-000000000011'),
  array['74000000-0000-4000-8000-000000000031', '74000000-0000-4000-8000-000000000032', '74000000-0000-4000-8000-000000000033'],
  'the two sessions with marks and the withdrawn one stayed on version 1'
);

-- The scenario of the issue (criterion 8): build plan version 1, assign it to a
-- group and to an athlete, mark one session, edit the plan (version 2 with fresh
-- blocks, completed last), and see which session keeps version 1.
select lives_ok(
  $$ insert into public.training_plan_versions (id, plan_id, version, complete) values ('74000000-0000-4000-8000-000000000014', '74000000-0000-4000-8000-0000000000f2', 1, false) $$,
  'scenario: coach C1 creates version 1 of plan two, incomplete'
);
select lives_ok(
  $$ insert into public.training_plan_blocks (id, version_id, position, repetitions, distance, stroke, phase, recording) values
       ('74000000-0000-4000-8000-000000000025', '74000000-0000-4000-8000-000000000014', 1, 4, '50m', 'FR', 'warm_up', 'completion'),
       ('74000000-0000-4000-8000-000000000026', '74000000-0000-4000-8000-000000000014', 2, 8, '50m', 'BK', 'main', 'per_repetition') $$,
  'scenario: its blocks'
);
select lives_ok(
  $$ update public.training_plan_versions set complete = true where id = '74000000-0000-4000-8000-000000000014' $$,
  'scenario: version 1 completes'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id, athlete_id) values
       ('74000000-0000-4000-8000-000000000051', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f2', '74000000-0000-4000-8000-000000000014', '2026-11-05', 'group', '74000000-0000-4000-8000-0000000000c1', null),
       ('74000000-0000-4000-8000-000000000052', '74000000-0000-4000-8000-0000000000b1', '74000000-0000-4000-8000-0000000000f2', '74000000-0000-4000-8000-000000000014', '2026-11-06', 'athlete', null, '74000000-0000-4000-8000-0000000000e2') $$,
  'scenario: two sessions with version 1'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, status, captured_at)
     values ('74000000-0000-4000-8000-000000000094', 'device-1', '74000000-0000-4000-8000-000000000051', '74000000-0000-4000-8000-000000000014', '74000000-0000-4000-8000-000000000025', '74000000-0000-4000-8000-0000000000e1', 'done', '2026-11-05 08:00:00+00') $$,
  'scenario: the first session is marked'
);
select lives_ok(
  $$ insert into public.training_plan_versions (id, plan_id, version, complete) values ('74000000-0000-4000-8000-000000000015', '74000000-0000-4000-8000-0000000000f2', 2, false) $$,
  'scenario: the edit creates version 2, incomplete'
);
select lives_ok(
  $$ insert into public.training_plan_blocks (id, version_id, position, repetitions, distance, stroke, phase, recording) values
       ('74000000-0000-4000-8000-000000000027', '74000000-0000-4000-8000-000000000015', 1, 6, '50m', 'FR', 'warm_up', 'completion') $$,
  'scenario: its blocks have fresh ids'
);
select lives_ok(
  $$ update public.training_plan_versions set complete = true where id = '74000000-0000-4000-8000-000000000015' $$,
  'scenario: version 2 completes'
);
select is(
  (select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000051'),
  '74000000-0000-4000-8000-000000000014'::uuid, 'scenario: the marked session keeps version 1'
);
select is(
  (select count(*) from public.training_plan_fulfillments where assignment_id = '74000000-0000-4000-8000-000000000051' and version_id = '74000000-0000-4000-8000-000000000014' and block_id = '74000000-0000-4000-8000-000000000025'),
  1::bigint, 'scenario: its mark and the block of version 1 are intact'
);
select is(
  (select version_id from public.training_plan_assignments where id = '74000000-0000-4000-8000-000000000052'),
  '74000000-0000-4000-8000-000000000015'::uuid, 'scenario: the unmarked session runs version 2'
);
select is(
  (select array_agg(v.version::text || ':' || v.created_by::text || ':' || v.assigned::text order by v.version) from public.training_plan_versions v where v.plan_id = '74000000-0000-4000-8000-0000000000f2'),
  array['1:74000000-0000-4000-8000-0000000000a1:true', '2:74000000-0000-4000-8000-0000000000a1:true'],
  'scenario: each version keeps its author and both are assigned'
);

reset role;
select * from finish();
rollback;
