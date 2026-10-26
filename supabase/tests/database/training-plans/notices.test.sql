-- Notes of guardians and adult athletes on a session (issue #75). A note is an
-- append-only row written by whoever manages the athlete (guardian or adult
-- athlete): only for an athlete inside the target of a live assignment, with a
-- version of the plan of the assignment and a block of that version, if any. The
-- author and the date are the server's. Clients cannot update or delete, anon sees
-- nothing, and the platform admin reads. A note does not freeze its session: the
-- move of sessions to a new version (#74) and the deletion of a block work with
-- notes present, and the note keeps the version it was written against. Every
-- rejection by the insert trigger is the same 42501 as a failed WITH CHECK.
-- All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- Users: guardian G (e1), adult athlete D (e2, self), guardian H (e3), platform
-- admin P and coach C, who only authors the plans.
insert into auth.users (id, email) values
  ('75a00000-0000-4000-8000-0000000000a1', 'notices-guardian-g@example.test'),
  ('75a00000-0000-4000-8000-0000000000a2', 'notices-adult-d@example.test'),
  ('75a00000-0000-4000-8000-0000000000a3', 'notices-guardian-h@example.test'),
  ('75a00000-0000-4000-8000-0000000000a4', 'notices-admin-p@example.test'),
  ('75a00000-0000-4000-8000-0000000000a5', 'notices-coach-c@example.test');
insert into public.platform_admins (user_id) values ('75a00000-0000-4000-8000-0000000000a4');

insert into public.schools (id, name) values ('75a00000-0000-4000-8000-0000000000b1', 'Notices School One');
insert into public.school_memberships (school_id, user_id, role) values ('75a00000-0000-4000-8000-0000000000b1', '75a00000-0000-4000-8000-0000000000a5', 'coach');
insert into public.training_groups (id, school_id, name) values
  ('75a00000-0000-4000-8000-0000000000c1', '75a00000-0000-4000-8000-0000000000b1', 'Group One'),
  ('75a00000-0000-4000-8000-0000000000c2', '75a00000-0000-4000-8000-0000000000b1', 'Group Two');
insert into public.categories (id, school_id, name) values ('75a00000-0000-4000-8000-0000000000ca', '75a00000-0000-4000-8000-0000000000b1', 'Category A');

-- e1: group g1, category A, guardian G. e2: adult D. e3: guardian H.
insert into public.athletes (id, first_name, last_name) values
  ('75a00000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('75a00000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('75a00000-0000-4000-8000-0000000000e3', 'Athlete', 'E3');
insert into public.athlete_schools (athlete_id, school_id, category_id) values
  ('75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-0000000000b1', '75a00000-0000-4000-8000-0000000000ca'),
  ('75a00000-0000-4000-8000-0000000000e2', '75a00000-0000-4000-8000-0000000000b1', null),
  ('75a00000-0000-4000-8000-0000000000e3', '75a00000-0000-4000-8000-0000000000b1', null);
insert into public.athlete_groups (athlete_id, group_id) values ('75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-0000000000c1');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('75a00000-0000-4000-8000-0000000000a1', '75a00000-0000-4000-8000-0000000000e1', 'guardian'),
  ('75a00000-0000-4000-8000-0000000000a2', '75a00000-0000-4000-8000-0000000000e2', 'self'),
  ('75a00000-0000-4000-8000-0000000000a3', '75a00000-0000-4000-8000-0000000000e3', 'guardian');

-- Plan 1 has version 1 with two blocks; plan 2 has its own version and block.
insert into public.training_plans (id, created_by, school_id, name) values
  ('75a00000-0000-4000-8000-0000000000f1', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-0000000000b1', 'Notices Plan One'),
  ('75a00000-0000-4000-8000-0000000000f2', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-0000000000b1', 'Notices Plan Two');
insert into public.training_plan_versions (id, created_by, plan_id, version) values
  ('75a00000-0000-4000-8000-000000000011', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-0000000000f1', 1),
  ('75a00000-0000-4000-8000-000000000012', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-0000000000f2', 1);
insert into public.training_plan_blocks
  (id, created_by, version_id, position, repetitions, distance, stroke, phase, recording) values
  ('75a00000-0000-4000-8000-000000000021', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-000000000011', 1, 4, '50m', 'FR', 'warm_up', 'completion'),
  ('75a00000-0000-4000-8000-000000000022', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-000000000011', 2, 8, '50m', 'FR', 'main', 'completion'),
  ('75a00000-0000-4000-8000-000000000023', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-000000000012', 1, 4, '50m', 'FR', 'main', 'completion');

-- Assignments of plan 1: 31 athlete e1, 32 athlete e2, 33 group g1, 34 group g2,
-- 35 category A, 36 the school, 37 athlete e1 (withdrawn).
insert into public.training_plan_assignments (id, created_by, school_id, plan_id, version_id, session_date, target, athlete_id, group_id, category_id) values
  ('75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-0000000000b1', '75a00000-0000-4000-8000-0000000000f1', '75a00000-0000-4000-8000-000000000011', '2026-10-26', 'athlete', '75a00000-0000-4000-8000-0000000000e1', null, null),
  ('75a00000-0000-4000-8000-000000000032', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-0000000000b1', '75a00000-0000-4000-8000-0000000000f1', '75a00000-0000-4000-8000-000000000011', '2026-10-26', 'athlete', '75a00000-0000-4000-8000-0000000000e2', null, null),
  ('75a00000-0000-4000-8000-000000000033', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-0000000000b1', '75a00000-0000-4000-8000-0000000000f1', '75a00000-0000-4000-8000-000000000011', '2026-10-26', 'group', null, '75a00000-0000-4000-8000-0000000000c1', null),
  ('75a00000-0000-4000-8000-000000000034', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-0000000000b1', '75a00000-0000-4000-8000-0000000000f1', '75a00000-0000-4000-8000-000000000011', '2026-10-26', 'group', null, '75a00000-0000-4000-8000-0000000000c2', null),
  ('75a00000-0000-4000-8000-000000000035', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-0000000000b1', '75a00000-0000-4000-8000-0000000000f1', '75a00000-0000-4000-8000-000000000011', '2026-10-26', 'category', null, null, '75a00000-0000-4000-8000-0000000000ca'),
  ('75a00000-0000-4000-8000-000000000036', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-0000000000b1', '75a00000-0000-4000-8000-0000000000f1', '75a00000-0000-4000-8000-000000000011', '2026-10-26', 'school', null, null, null);
insert into public.training_plan_assignments (id, created_by, school_id, plan_id, version_id, session_date, target, athlete_id, withdrawn_at, withdrawn_by) values
  ('75a00000-0000-4000-8000-000000000037', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-0000000000b1', '75a00000-0000-4000-8000-0000000000f1', '75a00000-0000-4000-8000-000000000011', '2026-10-26', 'athlete', '75a00000-0000-4000-8000-0000000000e1', '2026-10-25 08:00:00+00', '75a00000-0000-4000-8000-0000000000a5');

-- What a failed statement reports, all of it.
create function pg_temp.diagnostics(statement text)
returns text
language plpgsql
as $$
declare
  st text; msg text; det text; hnt text; sch text; tbl text; col text; con text; typ text;
begin
  execute statement;
  return 'no error';
exception when others then
  get stacked diagnostics st = returned_sqlstate, msg = message_text, det = pg_exception_detail,
    hnt = pg_exception_hint, sch = schema_name, tbl = table_name, col = column_name,
    con = constraint_name, typ = pg_datatype_name;
  return format('%s|%s|%s|%s|%s|%s|%s|%s|%s', st, msg, coalesce(det, '-'), coalesce(hnt, '-'),
    coalesce(sch, '-'), coalesce(tbl, '-'), coalesce(col, '-'), coalesce(con, '-'), coalesce(typ, '-'));
end;
$$;
grant execute on function pg_temp.diagnostics(text) to authenticated;

select has_table('public', 'training_plan_notices', 'the notices table exists');
select ok(
  has_table_privilege('authenticated', 'public.training_plan_notices', 'select')
    and has_table_privilege('authenticated', 'public.training_plan_notices', 'insert')
    and not has_table_privilege('authenticated', 'public.training_plan_notices', 'update')
    and not has_table_privilege('authenticated', 'public.training_plan_notices', 'delete')
    and not has_table_privilege('anon', 'public.training_plan_notices', 'select, insert, update, delete'),
  'authenticated can only select and insert, anon can do nothing'
);
select ok(
  not has_function_privilege('authenticated', 'public.training_plan_notices_check()', 'execute')
    and not has_function_privilege('anon', 'public.training_plan_notices_check()', 'execute'),
  'clients cannot call the insert trigger function'
);
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'powersync' and tablename = 'training_plan_notices'),
  'the table is in the powersync publication'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "75a00000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

-- Accepted for G: an athlete assignment, a group, a category and the school;
-- with a block and about the whole plan (no block).
select lives_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, block_id, body) values ('75a00000-0000-4000-8000-000000000041', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-000000000011', '75a00000-0000-4000-8000-000000000021', 'Test note 1') $$,
  'a guardian writes a note on the assignment of their athlete, about a block'
);
select lives_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000042', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-000000000011', 'Test note 2') $$,
  'and about the whole plan, with no block'
);
select lives_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, block_id, body) values ('75a00000-0000-4000-8000-000000000043', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000033', '75a00000-0000-4000-8000-000000000011', '75a00000-0000-4000-8000-000000000022', 'Test note 3') $$,
  'a group assignment accepts an athlete of the group'
);
select lives_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000044', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000035', '75a00000-0000-4000-8000-000000000011', 'Test note 4') $$,
  'a category assignment accepts an athlete of the category'
);
select lives_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000045', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000036', '75a00000-0000-4000-8000-000000000011', 'Test note 5') $$,
  'a school assignment accepts any athlete of the school'
);

-- The author and the date are the server's.
select lives_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body, created_by, created_at) values ('75a00000-0000-4000-8000-000000000046', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-000000000011', 'Test note 6', '75a00000-0000-4000-8000-0000000000a3', '2000-01-01 00:00:00+00') $$,
  'a note that claims another author and an old date is accepted'
);
select is(
  (select created_by from public.training_plan_notices where id = '75a00000-0000-4000-8000-000000000046'),
  '75a00000-0000-4000-8000-0000000000a1'::uuid,
  'and the author is the signed-in user, not the one it claimed'
);
select is(
  (select created_at from public.training_plan_notices where id = '75a00000-0000-4000-8000-000000000046'),
  now(),
  'and the date is the server date, not the one it claimed'
);

-- Rejections: all with the code and text of a failed row level security check.
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000051', '75a00000-0000-4000-8000-0000000000e3', '75a00000-0000-4000-8000-000000000036', '75a00000-0000-4000-8000-000000000011', 'Test note') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_notices"', 'a guardian cannot write a note for an athlete of someone else'
);
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000052', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000032', '75a00000-0000-4000-8000-000000000011', 'Test note') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_notices"', 'nor on an athlete assignment whose target is another athlete'
);
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000053', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000034', '75a00000-0000-4000-8000-000000000011', 'Test note') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_notices"', 'nor on a group assignment of a group the athlete is not in'
);
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000054', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000037', '75a00000-0000-4000-8000-000000000011', 'Test note') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_notices"', 'nor on a withdrawn assignment'
);
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000055', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-0000000000f1', '75a00000-0000-4000-8000-000000000011', 'Test note') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_notices"', 'nor on an assignment that does not exist, not a foreign key error'
);
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000056', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-000000000012', 'Test note') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_notices"', 'a version of another plan is refused'
);
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000057', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-0000000000f1', 'Test note') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_notices"', 'and so is a version that does not exist'
);
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, block_id, body) values ('75a00000-0000-4000-8000-000000000058', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-000000000011', '75a00000-0000-4000-8000-000000000023', 'Test note') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_notices"', 'a block of another version is refused'
);
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, block_id, body) values ('75a00000-0000-4000-8000-000000000059', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-000000000011', '75a00000-0000-4000-8000-0000000000f1', 'Test note') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_notices"', 'and so is a block that does not exist'
);
select is(
  pg_temp.diagnostics($$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-00000000005a', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000037', '75a00000-0000-4000-8000-000000000011', 'Test note') $$),
  pg_temp.diagnostics($$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-00000000005b', '75a00000-0000-4000-8000-0000000000e3', '75a00000-0000-4000-8000-000000000036', '75a00000-0000-4000-8000-000000000011', 'Test note') $$),
  'a trigger rejection reports exactly what a row level security rejection reports: no detail, hint or fields'
);
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-00000000005c', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-000000000011', '   ') $$,
  '23514', null, 'a blank body is refused'
);
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-00000000005d', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-000000000011', repeat('x', 501)) $$,
  '23514', null, 'and so is a body of more than 500 characters'
);
select lives_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-00000000005e', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-000000000011', repeat('x', 500)) $$,
  'a body of exactly 500 characters is accepted'
);

-- Append-only.
select throws_ok(
  $$ update public.training_plan_notices set body = 'Changed' where id = '75a00000-0000-4000-8000-000000000041' $$,
  '42501', null, 'a note cannot be updated'
);
select throws_ok(
  $$ delete from public.training_plan_notices where id = '75a00000-0000-4000-8000-000000000041' $$,
  '42501', null, 'nor deleted'
);

-- A retry (ON CONFLICT DO NOTHING) leaves the stored row as it was.
select lives_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body, created_at) values ('75a00000-0000-4000-8000-000000000041', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-000000000011', 'Other body', '2000-01-01 00:00:00+00') on conflict (id) do nothing $$,
  'a retry of a stored note does not fail'
);
select is(
  (select body || '|' || block_id::text || '|' || (created_at = now())::text from public.training_plan_notices where id = '75a00000-0000-4000-8000-000000000041'),
  'Test note 1|75a00000-0000-4000-8000-000000000021|true',
  'and the stored row is unchanged'
);

-- Reading.
select is((select count(*)::int from public.training_plan_notices), 7, 'G reads the notes of their athlete');

set local request.jwt.claims = '{"sub": "75a00000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000061', '75a00000-0000-4000-8000-0000000000e2', '75a00000-0000-4000-8000-000000000032', '75a00000-0000-4000-8000-000000000011', 'Test note D') $$,
  'an adult athlete writes a note about themselves'
);
select is((select array_agg(id) from public.training_plan_notices), array['75a00000-0000-4000-8000-000000000061']::uuid[], 'and reads only their own');
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000062', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-000000000011', 'Test note') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_notices"', 'an adult athlete cannot write for another athlete'
);

set local request.jwt.claims = '{"sub": "75a00000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is((select count(*)::int from public.training_plan_notices), 0, 'a guardian of another athlete reads none of those notes');

set local request.jwt.claims = '{"sub": "75a00000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is((select count(*)::int from public.training_plan_notices), 0, 'a coach of the school has no policy: reads none');

set local request.jwt.claims = '{"sub": "75a00000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is((select count(*)::int from public.training_plan_notices), 8, 'the platform admin reads them all');
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000063', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-000000000011', 'Test note') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_notices"', 'but the platform admin does not write notes'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$ select * from public.training_plan_notices $$, '42501', null, 'anon cannot read notes');
select throws_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000064', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000031', '75a00000-0000-4000-8000-000000000011', 'Test note') $$,
  '42501', null, 'nor write them'
);
reset role;

-- A note does not get in the way of the plan (#74). Sessions 31 and 33 have a note
-- and no marks: they move to version 2 when it completes, and the notes keep the
-- version they were written against.
insert into public.training_plan_versions (id, created_by, plan_id, version, complete) values ('75a00000-0000-4000-8000-000000000013', '75a00000-0000-4000-8000-0000000000a5', '75a00000-0000-4000-8000-0000000000f1', 2, true);
select is(
  (select version_id from public.training_plan_assignments where id = '75a00000-0000-4000-8000-000000000031'),
  '75a00000-0000-4000-8000-000000000013'::uuid,
  'a session with a note and no marks moves to the new version when it completes'
);
select is(
  (select array_agg(distinct version_id) from public.training_plan_notices where id in ('75a00000-0000-4000-8000-000000000041', '75a00000-0000-4000-8000-000000000043')),
  array['75a00000-0000-4000-8000-000000000011']::uuid[],
  'and its notes keep their version'
);
select lives_ok(
  $$ update public.training_plan_assignments set version_id = '75a00000-0000-4000-8000-000000000011' where id = '75a00000-0000-4000-8000-000000000031' $$,
  'a PATCH of the version of a session with a note does not fail'
);

-- A note written offline against the old version is still accepted.
set local role authenticated;
set local request.jwt.claims = '{"sub": "75a00000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.training_plan_notices (id, athlete_id, assignment_id, version_id, body) values ('75a00000-0000-4000-8000-000000000065', '75a00000-0000-4000-8000-0000000000e1', '75a00000-0000-4000-8000-000000000033', '75a00000-0000-4000-8000-000000000011', 'Test note late') $$,
  'a note against a version that is no longer the current one is accepted'
);
reset role;

-- Deleting a block without marks that has a note makes the note about the whole plan.
select lives_ok($$ delete from public.training_plan_blocks where id = '75a00000-0000-4000-8000-000000000022' $$, 'a block without marks that has a note can be deleted');
select is(
  (select block_id from public.training_plan_notices where id = '75a00000-0000-4000-8000-000000000043'),
  null,
  'and its note stays, about the whole plan'
);

select * from finish();
rollback;
