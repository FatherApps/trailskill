-- Training plans, versions and blocks (issue #69): the block shape, staff-only
-- writes per school, and versions that keep their author and date (the server's). Coaches and
-- admins of a school read and write its plans and templates; staff of another
-- school, guardians and adult athletes neither read nor write them. All users
-- and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

-- Users: coaches A1 and A2 and admin S (school 1), coach B (school 2),
-- guardian G, adult athlete D.
insert into auth.users (id, email) values
  ('69000000-0000-4000-8000-0000000000a1', 'coach-a1@example.test'),
  ('69000000-0000-4000-8000-0000000000a2', 'coach-a2@example.test'),
  ('69000000-0000-4000-8000-0000000000a3', 'admin-s@example.test'),
  ('69000000-0000-4000-8000-0000000000a4', 'coach-b@example.test'),
  ('69000000-0000-4000-8000-0000000000a5', 'guardian-g@example.test'),
  ('69000000-0000-4000-8000-0000000000a6', 'adult-athlete-d@example.test');

insert into public.schools (id, name) values
  ('69000000-0000-4000-8000-0000000000b1', 'Plans School One'),
  ('69000000-0000-4000-8000-0000000000b2', 'Plans School Two');

insert into public.school_memberships (school_id, user_id, role) values
  ('69000000-0000-4000-8000-0000000000b1', '69000000-0000-4000-8000-0000000000a1', 'coach'),
  ('69000000-0000-4000-8000-0000000000b1', '69000000-0000-4000-8000-0000000000a2', 'coach'),
  ('69000000-0000-4000-8000-0000000000b1', '69000000-0000-4000-8000-0000000000a3', 'school_admin'),
  ('69000000-0000-4000-8000-0000000000b2', '69000000-0000-4000-8000-0000000000a4', 'coach');

-- e1 is G's minor athlete and e2 is adult athlete D, both in school 1.
insert into public.athletes (id, first_name, last_name) values
  ('69000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('69000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2');

insert into public.athlete_schools (athlete_id, school_id) values
  ('69000000-0000-4000-8000-0000000000e1', '69000000-0000-4000-8000-0000000000b1'),
  ('69000000-0000-4000-8000-0000000000e2', '69000000-0000-4000-8000-0000000000b1');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('69000000-0000-4000-8000-0000000000a5', '69000000-0000-4000-8000-0000000000e1', 'guardian'),
  ('69000000-0000-4000-8000-0000000000a6', '69000000-0000-4000-8000-0000000000e2', 'self');

-- Schema
select has_table('public', 'training_plans', 'training_plans exists');
select has_table('public', 'training_plan_versions', 'training_plan_versions exists');
select has_table('public', 'training_plan_blocks', 'training_plan_blocks exists');
select is_empty(
  $$ select relname from pg_class
     where relnamespace = 'public'::regnamespace
       and relname in ('training_plans', 'training_plan_versions', 'training_plan_blocks')
       and not relrowsecurity $$,
  'the training plan tables have row level security enabled'
);
select set_eq(
  $$ select tablename::text from pg_publication_tables
     where pubname = 'powersync'
       and tablename in ('training_plans', 'training_plan_versions', 'training_plan_blocks') $$,
  $$ values ('training_plans'), ('training_plan_versions'), ('training_plan_blocks') $$,
  'the powersync publication includes the training plan tables'
);

set local role authenticated;

-- Coach A1 (school 1)
set local request.jwt.claims = '{"sub": "69000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.training_plans (id, school_id, name)
     values ('69000000-0000-4000-8000-0000000000c1', '69000000-0000-4000-8000-0000000000b1', 'Plan One') $$,
  'coach A1 creates a plan for school 1'
);

select lives_ok(
  $$ insert into public.training_plans (id, school_id, name, is_template)
     values ('69000000-0000-4000-8000-0000000000c2', '69000000-0000-4000-8000-0000000000b1', 'Template One', true) $$,
  'coach A1 saves a template for school 1'
);

select throws_ok(
  $$ insert into public.training_plans (school_id, name)
     values ('69000000-0000-4000-8000-0000000000b2', 'Plan In School Two') $$,
  '42501', null,
  'coach A1 cannot create a plan for school 2'
);

select lives_ok(
  $$ insert into public.training_plan_versions (id, plan_id, version)
     values ('69000000-0000-4000-8000-0000000000d1', '69000000-0000-4000-8000-0000000000c1', 1) $$,
  'coach A1 creates version 1 of the plan'
);

select is(
  (select created_by from public.training_plan_versions where id = '69000000-0000-4000-8000-0000000000d1'),
  '69000000-0000-4000-8000-0000000000a1'::uuid,
  'version 1 keeps coach A1 as its author'
);

select isnt(
  (select created_at from public.training_plan_versions where id = '69000000-0000-4000-8000-0000000000d1'),
  null,
  'version 1 keeps its date'
);

select lives_ok(
  $$ insert into public.training_plan_versions (id, plan_id, version, created_at)
     values ('69000000-0000-4000-8000-0000000000d3', '69000000-0000-4000-8000-0000000000c2', 7, '2000-01-01 00:00:00+00') $$,
  'coach A1 creates a version that claims an old date'
);

select is(
  (select created_at from public.training_plan_versions where id = '69000000-0000-4000-8000-0000000000d3'),
  now(),
  'the date of a version is the time of the server, not the one the device sent'
);

select throws_ok(
  $$ insert into public.training_plans (school_id, name, created_by)
     values ('69000000-0000-4000-8000-0000000000b1', 'Plan Of Someone Else', '69000000-0000-4000-8000-0000000000a2') $$,
  '42501', null,
  'a plan cannot name someone else as its author'
);

select throws_ok(
  $$ insert into public.training_plan_versions (plan_id, version, created_by)
     values ('69000000-0000-4000-8000-0000000000c1', 9, '69000000-0000-4000-8000-0000000000a3') $$,
  '42501', null,
  'a version cannot name someone else as its author'
);

select throws_ok(
  $$ insert into public.training_plan_versions (plan_id, version)
     values ('69000000-0000-4000-8000-0000000000c1', 1) $$,
  '23505', null,
  'a plan has one version per number'
);

select lives_ok(
  $$ insert into public.training_plan_blocks
       (id, version_id, position, repetitions, distance, stroke, drill, equipment, send_off_seconds, phase, recording)
     values
       ('69000000-0000-4000-8000-0000000000f1', '69000000-0000-4000-8000-0000000000d1', 1, 4, '50m', 'FR', null, '{}', null, 'warm_up', 'completion'),
       ('69000000-0000-4000-8000-0000000000f2', '69000000-0000-4000-8000-0000000000d1', 2, 8, '100m', 'FR', null, '{fins}', 90, 'main', 'per_repetition'),
       ('69000000-0000-4000-8000-0000000000f3', '69000000-0000-4000-8000-0000000000d1', 3, 2, '200m', null, 'Catch-up drill', '{paddles,pull_buoy}', 240, 'technique', 'series_total') $$,
  'a block records completion only, a time per repetition, or the series total'
);

select throws_ok(
  $$ insert into public.training_plan_blocks (version_id, position, repetitions, distance, stroke, phase, recording)
     values ('69000000-0000-4000-8000-0000000000d1', 4, 1, '50m', 'FR', 'main', 'split_times') $$,
  '23514', null,
  'a block accepts no other kind of recording'
);

select throws_ok(
  $$ insert into public.training_plan_blocks (version_id, position, repetitions, distance, phase, recording)
     values ('69000000-0000-4000-8000-0000000000d1', 4, 1, '50m', 'main', 'completion') $$,
  '23514', null,
  'a block needs a stroke or a drill'
);

select lives_ok(
  $$ insert into public.training_plan_blocks (id, version_id, position, repetitions, distance, drill, phase, recording)
     values ('69000000-0000-4000-8000-0000000000f4', '69000000-0000-4000-8000-0000000000d1', 4, 1, '25m', repeat('d', 120), 'cool_down', 'completion') $$,
  'a drill of 120 characters is accepted'
);

select throws_ok(
  $$ insert into public.training_plan_blocks (version_id, position, repetitions, distance, drill, phase, recording)
     values ('69000000-0000-4000-8000-0000000000d1', 5, 1, '25m', repeat('d', 121), 'cool_down', 'completion') $$,
  '23514', null,
  'a drill longer than 120 characters is rejected'
);

select throws_ok(
  $$ insert into public.training_plan_blocks (version_id, position, repetitions, distance, drill, phase, recording)
     values ('69000000-0000-4000-8000-0000000000d1', 5, 1, '25m', '   ', 'cool_down', 'completion') $$,
  '23514', null,
  'a blank drill is rejected'
);

select throws_ok(
  $$ insert into public.training_plan_blocks (version_id, position, repetitions, distance, stroke, equipment, phase, recording)
     values ('69000000-0000-4000-8000-0000000000d1', 5, 1, '50m', 'FR', '{fins,monofin}', 'main', 'completion') $$,
  '23514', null,
  'a block accepts only known equipment codes'
);

select lives_ok(
  $$ insert into public.training_plan_blocks (id, version_id, position, repetitions, distance, stroke, equipment, phase, recording)
     values ('69000000-0000-4000-8000-0000000000f5', '69000000-0000-4000-8000-0000000000d1', 6, 1, '50m', 'FR', null, 'main', 'completion') $$,
  'a block sent with equipment null is accepted'
);

select is(
  (select equipment from public.training_plan_blocks where id = '69000000-0000-4000-8000-0000000000f5'),
  '{}'::text[],
  'no equipment from a device is stored as an empty list'
);

select lives_ok(
  $$ update public.training_plan_blocks set equipment = null where id = '69000000-0000-4000-8000-0000000000f2' $$,
  'an update that clears equipment with null is accepted'
);

select is(
  (select equipment from public.training_plan_blocks where id = '69000000-0000-4000-8000-0000000000f2'),
  '{}'::text[],
  'an update to null equipment is stored as an empty list'
);

select throws_ok(
  $$ insert into public.training_plan_blocks (version_id, position, repetitions, distance, stroke, phase, recording, created_by)
     values ('69000000-0000-4000-8000-0000000000d1', 7, 1, '50m', 'FR', 'main', 'completion', '69000000-0000-4000-8000-0000000000a2') $$,
  '42501', null,
  'a block cannot name someone else as its author'
);

select throws_ok(
  $$ insert into public.training_plan_blocks (version_id, position, repetitions, distance, stroke, phase, recording)
     values ('69000000-0000-4000-8000-0000000000d1', 5, 1, '50m', 'FR', 'stretching', 'completion') $$,
  '23514', null,
  'a block accepts only the four phases'
);

select throws_ok(
  $$ insert into public.training_plan_blocks (version_id, position, repetitions, distance, stroke, phase, recording)
     values ('69000000-0000-4000-8000-0000000000d1', 5, 0, '50m', 'FR', 'main', 'completion') $$,
  '23514', null,
  'a block has at least one repetition'
);

select throws_ok(
  $$ insert into public.training_plan_blocks (version_id, position, repetitions, distance, stroke, send_off_seconds, phase, recording)
     values ('69000000-0000-4000-8000-0000000000d1', 5, 1, '50m', 'FR', 0, 'main', 'completion') $$,
  '23514', null,
  'a send-off interval, when present, is positive'
);

select lives_ok(
  $$ update public.training_plan_blocks set position = 5 where id = '69000000-0000-4000-8000-0000000000f1' $$,
  'coach A1 reorders a block of the version'
);

select lives_ok(
  $$ delete from public.training_plan_blocks where id = '69000000-0000-4000-8000-0000000000f4' $$,
  'coach A1 removes a block of the version'
);

select throws_ok(
  $$ update public.training_plan_versions set created_by = '69000000-0000-4000-8000-0000000000a2'
     where id = '69000000-0000-4000-8000-0000000000d1' $$,
  '42501', null,
  'the author of a version cannot change'
);

select throws_ok(
  $$ update public.training_plan_versions set created_at = '2026-01-01 00:00:00+00'
     where id = '69000000-0000-4000-8000-0000000000d1' $$,
  '42501', null,
  'the date of a version cannot change'
);

select throws_ok(
  $$ update public.training_plan_versions set plan_id = '69000000-0000-4000-8000-0000000000c2'
     where id = '69000000-0000-4000-8000-0000000000d1' $$,
  '42501', null,
  'a version cannot move to another plan'
);

select throws_ok(
  $$ update public.training_plan_versions set version = 8
     where id = '69000000-0000-4000-8000-0000000000d1' $$,
  '42501', null,
  'a version cannot change its number'
);

select lives_ok(
  $$ insert into public.training_plan_versions (id, plan_id, version)
     values ('69000000-0000-4000-8000-0000000000d1', '69000000-0000-4000-8000-0000000000c1', 1)
     on conflict (id) do update set plan_id = excluded.plan_id, version = excluded.version $$,
  'an upsert without the audit columns of an existing version passes'
);

select lives_ok(
  $$ update public.training_plan_versions set version = version
     where id = '69000000-0000-4000-8000-0000000000d1' $$,
  'an update that keeps author and date passes (a sync retry)'
);

-- Coach A2 (school 1) adds version 2.
set local request.jwt.claims = '{"sub": "69000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.training_plan_versions (id, plan_id, version)
     values ('69000000-0000-4000-8000-0000000000d2', '69000000-0000-4000-8000-0000000000c1', 2) $$,
  'coach A2 creates version 2 of the same plan'
);

select results_eq(
  $$ select version, created_by from public.training_plan_versions
     where plan_id = '69000000-0000-4000-8000-0000000000c1' order by version $$,
  $$ values (1, '69000000-0000-4000-8000-0000000000a1'::uuid), (2, '69000000-0000-4000-8000-0000000000a2'::uuid) $$,
  'each version keeps its own author'
);

-- School admin S (school 1)
set local request.jwt.claims = '{"sub": "69000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';

select set_eq(
  $$ select id from public.training_plans $$,
  $$ values ('69000000-0000-4000-8000-0000000000c1'::uuid), ('69000000-0000-4000-8000-0000000000c2'::uuid) $$,
  'school admin S reads the plans and templates of school 1'
);

select lives_ok(
  $$ update public.training_plans set name = 'Plan One Renamed'
     where id = '69000000-0000-4000-8000-0000000000c1' $$,
  'school admin S edits a plan of school 1'
);

-- Coach B (school 2)
set local request.jwt.claims = '{"sub": "69000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';

select is_empty(
  $$ select id from public.training_plans
     union all select id from public.training_plan_versions
     union all select id from public.training_plan_blocks $$,
  'coach B reads no plans, versions or blocks of school 1'
);

select is_empty(
  $$ update public.training_plans set name = 'Taken'
     where id = '69000000-0000-4000-8000-0000000000c1' returning id $$,
  'coach B cannot edit a plan of school 1'
);

select throws_ok(
  $$ insert into public.training_plan_versions (plan_id, version)
     values ('69000000-0000-4000-8000-0000000000c1', 3) $$,
  '42501', null,
  'coach B cannot add a version to a plan of school 1'
);

select throws_ok(
  $$ insert into public.training_plan_blocks (version_id, position, repetitions, distance, stroke, phase, recording)
     values ('69000000-0000-4000-8000-0000000000d1', 6, 1, '50m', 'FR', 'main', 'completion') $$,
  '42501', null,
  'coach B cannot add a block to a version of school 1'
);

select is_empty(
  $$ delete from public.training_plan_blocks
     where id = '69000000-0000-4000-8000-0000000000f2' returning id $$,
  'coach B cannot remove a block of school 1'
);

-- Guardian G
set local request.jwt.claims = '{"sub": "69000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';

select is_empty(
  $$ select id from public.training_plans $$,
  'guardian G reads no plans yet (reading comes with assignments)'
);

select throws_ok(
  $$ insert into public.training_plans (school_id, name)
     values ('69000000-0000-4000-8000-0000000000b1', 'Guardian Plan') $$,
  '42501', null,
  'guardian G cannot create a plan'
);

select is_empty(
  $$ update public.training_plans set name = 'Guardian Edit'
     where id = '69000000-0000-4000-8000-0000000000c1' returning id $$,
  'guardian G cannot edit a plan'
);

select throws_ok(
  $$ insert into public.training_plan_blocks (version_id, position, repetitions, distance, stroke, phase, recording)
     values ('69000000-0000-4000-8000-0000000000d1', 6, 1, '50m', 'FR', 'main', 'completion') $$,
  '42501', null,
  'guardian G cannot add a block'
);

-- Adult athlete D
set local request.jwt.claims = '{"sub": "69000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.training_plans (school_id, name)
     values ('69000000-0000-4000-8000-0000000000b1', 'Athlete Plan') $$,
  '42501', null,
  'adult athlete D cannot create a plan'
);

select is_empty(
  $$ update public.training_plans set name = 'Athlete Edit'
     where id = '69000000-0000-4000-8000-0000000000c1' returning id $$,
  'adult athlete D cannot edit a plan'
);

select throws_ok(
  $$ insert into public.training_plan_versions (plan_id, version)
     values ('69000000-0000-4000-8000-0000000000c1', 3) $$,
  '42501', null,
  'adult athlete D cannot add a version'
);

reset role;

select results_eq(
  $$ select name from public.training_plans where id = '69000000-0000-4000-8000-0000000000c1' $$,
  $$ values ('Plan One Renamed') $$,
  'only staff of school 1 changed the plan'
);

select results_eq(
  $$ select id, position from public.training_plan_blocks where id::text like '69000000-%' order by position $$,
  $$ values ('69000000-0000-4000-8000-0000000000f2'::uuid, 2),
            ('69000000-0000-4000-8000-0000000000f3'::uuid, 3),
            ('69000000-0000-4000-8000-0000000000f1'::uuid, 5),
            ('69000000-0000-4000-8000-0000000000f5'::uuid, 6) $$,
  'the blocks keep the order staff gave them and nobody else removed one'
);

select * from finish();
rollback;
