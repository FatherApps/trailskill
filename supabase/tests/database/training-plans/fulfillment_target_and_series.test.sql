-- Fulfillment target and series checks, the unified rejection error and the
-- coach assignment stream (issue #271). A mark is accepted only when the athlete
-- is in the school of its assignment and inside the assignment's target (athlete,
-- group, category or school), and a series_id only when the block records times
-- and the series belongs to the school of the assignment. Every trigger rejection
-- raises what a failed row level security check raises (42501, same text, no
-- detail, hint or fields), so it does not tell whether an athlete or a series
-- exists in a school. The coach stream also carries the group assignments of
-- the groups of the coach's directly assigned athletes. All data here is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- Users: coach C1 (school 1, group g1 and direct e2), coach K (school 1, direct
-- e5 who is in group g2, responsible for no group), coach F (school 2) and U,
-- who accepts the authorizations.
insert into auth.users (id, email) values
  ('75000000-0000-4000-8000-0000000000a1', 'coach-c1@example.test'),
  ('75000000-0000-4000-8000-0000000000a2', 'coach-k@example.test'),
  ('75000000-0000-4000-8000-0000000000a3', 'coach-f@example.test'),
  ('75000000-0000-4000-8000-0000000000a4', 'authorizer-u@example.test');

insert into public.schools (id, name) values
  ('75000000-0000-4000-8000-0000000000b1', 'Target School One'),
  ('75000000-0000-4000-8000-0000000000b2', 'Target School Two');

insert into public.school_memberships (school_id, user_id, role) values
  ('75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000a1', 'coach'),
  ('75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000a2', 'coach'),
  ('75000000-0000-4000-8000-0000000000b2', '75000000-0000-4000-8000-0000000000a3', 'coach');

-- g1 is C1's group. g2 and g3 belong to nobody.
insert into public.training_groups (id, school_id, name) values
  ('75000000-0000-4000-8000-0000000000c1', '75000000-0000-4000-8000-0000000000b1', 'Group One'),
  ('75000000-0000-4000-8000-0000000000c2', '75000000-0000-4000-8000-0000000000b1', 'Group Two'),
  ('75000000-0000-4000-8000-0000000000c3', '75000000-0000-4000-8000-0000000000b1', 'Group Three');

insert into public.categories (id, school_id, name) values
  ('75000000-0000-4000-8000-0000000000ca', '75000000-0000-4000-8000-0000000000b1', 'Category A'),
  ('75000000-0000-4000-8000-0000000000cb', '75000000-0000-4000-8000-0000000000b1', 'Category B');

-- e1: group g1, category A. e2: category B, no group, direct to C1. e4: school 1,
-- in nobody's charge. e5: group g2, direct to K. e6: group g3. e9: school 2.
insert into public.athletes (id, first_name, last_name) values
  ('75000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('75000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('75000000-0000-4000-8000-0000000000e4', 'Athlete', 'E4'),
  ('75000000-0000-4000-8000-0000000000e5', 'Athlete', 'E5'),
  ('75000000-0000-4000-8000-0000000000e6', 'Athlete', 'E6'),
  ('75000000-0000-4000-8000-0000000000e7', 'Athlete', 'E7'),
  ('75000000-0000-4000-8000-0000000000e9', 'Athlete', 'E9');

insert into public.athlete_schools (athlete_id, school_id, category_id) values
  ('75000000-0000-4000-8000-0000000000e1', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000ca'),
  ('75000000-0000-4000-8000-0000000000e2', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000cb'),
  ('75000000-0000-4000-8000-0000000000e4', '75000000-0000-4000-8000-0000000000b1', null),
  ('75000000-0000-4000-8000-0000000000e5', '75000000-0000-4000-8000-0000000000b1', null),
  ('75000000-0000-4000-8000-0000000000e6', '75000000-0000-4000-8000-0000000000b1', null),
  ('75000000-0000-4000-8000-0000000000e7', '75000000-0000-4000-8000-0000000000b1', null),
  ('75000000-0000-4000-8000-0000000000e9', '75000000-0000-4000-8000-0000000000b2', null);

insert into public.athlete_groups (athlete_id, group_id) values
  ('75000000-0000-4000-8000-0000000000e1', '75000000-0000-4000-8000-0000000000c1'),
  ('75000000-0000-4000-8000-0000000000e5', '75000000-0000-4000-8000-0000000000c2'),
  ('75000000-0000-4000-8000-0000000000e7', '75000000-0000-4000-8000-0000000000c2'),
  ('75000000-0000-4000-8000-0000000000e6', '75000000-0000-4000-8000-0000000000c3');

insert into public.coach_group_assignments (coach_user_id, group_id) values ('75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000c1');
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  ('75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000e2', '75000000-0000-4000-8000-0000000000b1'),
  ('75000000-0000-4000-8000-0000000000a2', '75000000-0000-4000-8000-0000000000e5', '75000000-0000-4000-8000-0000000000b1');
-- C1 is also assigned to e9 of school 2, where C1 does not coach. The assignment
-- trigger forbids that state, so this one row is stored with the trigger off.
alter table public.coach_athlete_assignments disable trigger user;
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id)
values ('75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000e9', '75000000-0000-4000-8000-0000000000b2');
alter table public.coach_athlete_assignments enable trigger user;

-- e7 is in g2 too but in nobody's charge. record_times is authorized for e1, e2, e4, e5, e7 and e9, so only the target and series
-- checks and the charge decide below.
insert into public.authorization_texts (id, purpose, version, language, body) values
  ('75000000-0000-4000-8000-000000000071', 'record_times', 1, 'en-US', 'Synthetic record times text v1');
insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at, user_id) values
  ('75000000-0000-4000-8000-000000000081', '75000000-0000-4000-8000-0000000000e1', 'record_times', '75000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '75000000-0000-4000-8000-0000000000a4'),
  ('75000000-0000-4000-8000-000000000082', '75000000-0000-4000-8000-0000000000e2', 'record_times', '75000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '75000000-0000-4000-8000-0000000000a4'),
  ('75000000-0000-4000-8000-000000000084', '75000000-0000-4000-8000-0000000000e4', 'record_times', '75000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '75000000-0000-4000-8000-0000000000a4'),
  ('75000000-0000-4000-8000-000000000085', '75000000-0000-4000-8000-0000000000e5', 'record_times', '75000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '75000000-0000-4000-8000-0000000000a4'),
  ('75000000-0000-4000-8000-000000000087', '75000000-0000-4000-8000-0000000000e7', 'record_times', '75000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '75000000-0000-4000-8000-0000000000a4'),
  ('75000000-0000-4000-8000-000000000089', '75000000-0000-4000-8000-0000000000e9', 'record_times', '75000000-0000-4000-8000-000000000071', '2026-10-01 08:00:00+00', '75000000-0000-4000-8000-0000000000a4');

insert into public.training_plans (id, created_by, school_id, name) values
  ('75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000b1', 'Plan One');
insert into public.training_plan_versions (id, created_by, plan_id, version) values
  ('75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000f1', 1);
-- b1 records completion only; b2 and b3 record times.
insert into public.training_plan_blocks
  (id, created_by, version_id, position, repetitions, distance, stroke, phase, recording) values
  ('75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-000000000011', 1, 4, '50m', 'FR', 'warm_up', 'completion'),
  ('75000000-0000-4000-8000-000000000022', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-000000000011', 2, 8, '50m', 'FR', 'main', 'per_repetition'),
  ('75000000-0000-4000-8000-000000000023', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-000000000011', 3, 4, '100m', 'FR', 'main', 'series_total');

-- Series s1 of school 1 (no measurements at all) and s2 of school 2.
insert into public.timing_series (id, created_by, school_id, stroke, distance, pool, session_type, device_id) values
  ('75000000-0000-4000-8000-000000000051', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000b1', 'FR', '50m', 'SCM', 'training', 'device-1'),
  ('75000000-0000-4000-8000-000000000052', '75000000-0000-4000-8000-0000000000a3', '75000000-0000-4000-8000-0000000000b2', 'FR', '50m', 'SCM', 'training', 'device-2');

-- Assignments of school 1: 31 athlete e1, 32 group g1, 33 category A, 34 the
-- school, 35 the school (withdrawn), 36 group g2 (K's direct athlete is in it),
-- 37 group g3 (none of K's athletes).
insert into public.training_plan_assignments (id, created_by, school_id, plan_id, version_id, session_date, target, athlete_id, group_id, category_id) values
  ('75000000-0000-4000-8000-000000000031', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-000000000011', '2026-10-26', 'athlete', '75000000-0000-4000-8000-0000000000e1', null, null),
  ('75000000-0000-4000-8000-000000000032', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-000000000011', '2026-10-26', 'group', null, '75000000-0000-4000-8000-0000000000c1', null),
  ('75000000-0000-4000-8000-000000000033', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-000000000011', '2026-10-26', 'category', null, null, '75000000-0000-4000-8000-0000000000ca'),
  ('75000000-0000-4000-8000-000000000034', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-000000000011', '2026-10-26', 'school', null, null, null),
  ('75000000-0000-4000-8000-000000000036', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-000000000011', '2026-10-26', 'group', null, '75000000-0000-4000-8000-0000000000c2', null),
  ('75000000-0000-4000-8000-000000000037', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-000000000011', '2026-10-26', 'group', null, '75000000-0000-4000-8000-0000000000c3', null);
insert into public.training_plan_assignments (id, created_by, school_id, plan_id, version_id, session_date, target, withdrawn_at, withdrawn_by) values
  ('75000000-0000-4000-8000-000000000035', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-000000000011', '2026-10-26', 'school', '2026-10-25 08:00:00+00', '75000000-0000-4000-8000-0000000000a1');

-- What a failed statement reports, all of it: SQLSTATE, message, detail, hint and
-- the schema, table, column, constraint and type fields.
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

select has_function('app', 'athlete_in_group', array['uuid', 'uuid'], 'the athletes module answers whether an athlete is in a group');
select has_function('app', 'athlete_in_category', array['uuid', 'uuid', 'uuid'], 'and whether it is in a category of a school');
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname in ('athlete_in_group', 'athlete_in_category')
       and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) $$,
  'clients cannot call those functions'
);
select is(
  (select tgenabled::text from pg_trigger where tgname = 'training_plan_fulfillments_check_series' and tgrelid = 'public.training_plan_fulfillments'::regclass),
  'O', 'the series check is a trigger on fulfillments'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "75000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

-- Rejections, all with the code and text of a failed row level security check.
select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000041', 'device-1', '75000000-0000-4000-8000-000000000034', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e4', '2026-10-26 08:00:00+00') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"', 'an athlete of the school in nobodys charge is refused by row level security'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000043', 'device-1', '75000000-0000-4000-8000-000000000034', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e9', '2026-10-26 08:00:00+00') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"', 'an athlete of another school, in the coachs charge and authorized, gets the same error'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000044', 'device-1', '75000000-0000-4000-8000-000000000032', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e2', '2026-10-26 08:00:00+00') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"', 'a group assignment refuses an athlete who is not in the group'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000045', 'device-1', '75000000-0000-4000-8000-000000000033', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e2', '2026-10-26 08:00:00+00') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"', 'a category assignment refuses an athlete of another category'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000046', 'device-1', '75000000-0000-4000-8000-000000000031', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e2', '2026-10-26 08:00:00+00') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"', 'an athlete assignment refuses another athlete'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at, series_id) values ('75000000-0000-4000-8000-000000000047', 'device-1', '75000000-0000-4000-8000-000000000031', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00', '75000000-0000-4000-8000-000000000051') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"', 'a series on a block that records completion is refused'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at, series_id) values ('75000000-0000-4000-8000-000000000048', 'device-1', '75000000-0000-4000-8000-000000000031', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000022', '75000000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00', '75000000-0000-4000-8000-000000000052') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"', 'a series of another school on a timed block is refused'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at, series_id) values ('75000000-0000-4000-8000-000000000049', 'device-1', '75000000-0000-4000-8000-000000000031', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000022', '75000000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00', '75000000-0000-4000-8000-0000000000f9') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"', 'a series that does not exist is refused with the same error, not a foreign key error'
);
select is(
  pg_temp.diagnostics($$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at, series_id) values ('75000000-0000-4000-8000-00000000004a', 'device-1', '75000000-0000-4000-8000-000000000031', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000022', '75000000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00', '75000000-0000-4000-8000-0000000000f9') $$),
  pg_temp.diagnostics($$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000fa1', 'device-1', '75000000-0000-4000-8000-000000000034', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e4', '2026-10-26 08:00:00+00') $$),
  'a rejection by a trigger reports exactly what a row level security rejection reports: no detail, hint or fields'
);
select is(
  pg_temp.diagnostics($$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000fa2', 'device-1', '75000000-0000-4000-8000-000000000032', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e2', '2026-10-26 08:00:00+00') $$),
  pg_temp.diagnostics($$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000fa1', 'device-1', '75000000-0000-4000-8000-000000000034', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e4', '2026-10-26 08:00:00+00') $$),
  'and so does the target check'
);
-- Accepted.
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-00000000004b', 'device-1', '75000000-0000-4000-8000-000000000031', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00') $$,
  'no series is accepted on a completion block'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-00000000004c', 'device-1', '75000000-0000-4000-8000-000000000031', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000022', '75000000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00') $$,
  'and on a timed block'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at, series_id) values ('75000000-0000-4000-8000-000000000f01', 'device-1', '75000000-0000-4000-8000-000000000031', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000022', '75000000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00', '75000000-0000-4000-8000-000000000051') $$,
  'a series of the school of the assignment is accepted on a timed block without measurements of the athlete'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at, series_id) values ('75000000-0000-4000-8000-00000000004d', 'device-1', '75000000-0000-4000-8000-000000000031', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000023', '75000000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00', '75000000-0000-4000-8000-000000000051') $$,
  'and on a series total block'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-00000000004e', 'device-1', '75000000-0000-4000-8000-000000000031', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00') $$,
  'an athlete assignment accepts its athlete'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-00000000004f', 'device-1', '75000000-0000-4000-8000-000000000032', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00') $$,
  'a group assignment accepts an athlete of the group'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000f10', 'device-1', '75000000-0000-4000-8000-000000000033', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e1', '2026-10-26 08:00:00+00') $$,
  'a category assignment accepts an athlete of the category'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000f11', 'device-1', '75000000-0000-4000-8000-000000000034', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e2', '2026-10-26 08:00:00+00') $$,
  'a school assignment accepts any athlete of the school'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000f12', 'device-1', '75000000-0000-4000-8000-000000000035', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e2', '2026-10-26 08:00:00+00') $$,
  'a mark against a withdrawn assignment is still accepted'
);

-- Changing series_id is checked too. Clients cannot update marks, so the owner does.
reset role;
select throws_ok(
  $$ update public.training_plan_fulfillments set series_id = '75000000-0000-4000-8000-000000000052' where id = '75000000-0000-4000-8000-000000000f01' $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"', 'an update of series_id to a series of another school is refused'
);
select lives_ok(
  $$ update public.training_plan_fulfillments set series_id = null where id = '75000000-0000-4000-8000-000000000f01' $$,
  'an update of series_id to null is accepted'
);
select lives_ok(
  $$ update public.training_plan_fulfillments set athlete_id = athlete_id where id = '75000000-0000-4000-8000-000000000f01' $$,
  'rewriting the athlete of a mark, as the withdrawal recompute does, is never refused'
);
-- Discriminating recompute: e6 is a member of g3 when the mark on the g3 assignment is
-- saved, then leaves the group. Rewriting the athlete must still not be refused.
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000f30', 'device-1', '75000000-0000-4000-8000-000000000037', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e6', '2026-10-26 08:00:00+00') $$,
  'a mark on a group assignment is accepted while the athlete is in the group'
);
delete from public.athlete_groups where athlete_id = '75000000-0000-4000-8000-0000000000e6';
select lives_ok(
  $$ update public.training_plan_fulfillments set athlete_id = athlete_id where id = '75000000-0000-4000-8000-000000000f30' $$,
  'rewriting the athlete of a mark whose athlete left the group, as the withdrawal recompute does, is never refused'
);
select lives_ok(
  $$ update public.training_plan_fulfillments set series_id = '75000000-0000-4000-8000-000000000051' where id = '75000000-0000-4000-8000-000000000f01' $$,
  'an update of series_id to a series of the school is accepted'
);

-- Assignments: the athlete check answers like row level security.
set local role authenticated;
set local request.jwt.claims = '{"sub": "75000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id) values ('75000000-0000-4000-8000-000000000038', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-000000000011', '2026-10-27', 'athlete', '75000000-0000-4000-8000-0000000000e4') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_assignments"', 'a coach assigning to a same-school athlete not in their charge is refused by row level security'
);
select throws_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id) values ('75000000-0000-4000-8000-000000000039', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-000000000011', '2026-10-27', 'athlete', '75000000-0000-4000-8000-0000000000e9') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_assignments"', 'a coach assigning to an athlete of another school gets the same error'
);
select is(
  pg_temp.diagnostics($$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id) values ('75000000-0000-4000-8000-000000000039', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-000000000011', '2026-10-27', 'athlete', '75000000-0000-4000-8000-0000000000e9') $$),
  pg_temp.diagnostics($$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id) values ('75000000-0000-4000-8000-000000000038', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-000000000011', '2026-10-27', 'athlete', '75000000-0000-4000-8000-0000000000e4') $$),
  'down to the detail, hint and fields'
);
select lives_ok(
  $$ insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, athlete_id) values ('75000000-0000-4000-8000-00000000003a', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-000000000011', '2026-10-27', 'athlete', '75000000-0000-4000-8000-0000000000e2') $$,
  'a coach assigns to an athlete in their charge'
);

-- The coach stream (training_plans_assignments_staff in powersync/sync-config.yaml,
-- each query with auth.user_id() replaced by K's id), including the group
-- assignments of the groups of K's directly assigned athletes.
reset role;
create temp table stream_k as
select id from public.training_plan_assignments
where school_id in (select school_id from public.school_memberships where user_id = '75000000-0000-4000-8000-0000000000a2')
  and withdrawn_at is null
  and (
    group_id in (select group_id from public.coach_group_assignments where coach_user_id = '75000000-0000-4000-8000-0000000000a2')
    or group_id in (select group_id from public.athlete_groups where athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '75000000-0000-4000-8000-0000000000a2'))
    or athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '75000000-0000-4000-8000-0000000000a2')
    or athlete_id in (select athlete_id from public.athlete_groups where group_id in (select group_id from public.coach_group_assignments where coach_user_id = '75000000-0000-4000-8000-0000000000a2'))
    or category_id in (select category_id from public.athlete_schools where category_id is not null and athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '75000000-0000-4000-8000-0000000000a2'))
    or category_id in (select category_id from public.athlete_schools where category_id is not null and athlete_id in (select athlete_id from public.athlete_groups where group_id in (select group_id from public.coach_group_assignments where coach_user_id = '75000000-0000-4000-8000-0000000000a2')))
    or target = 'school'
  );
select set_eq(
  $$ select id from stream_k $$,
  $$ values ('75000000-0000-4000-8000-000000000034'::uuid), ('75000000-0000-4000-8000-000000000036') $$,
  'K downloads the group assignment of the group of the directly assigned athlete and the school-wide one, not another group''s'
);
select ok(
  '75000000-0000-4000-8000-000000000037' not in (select id from stream_k),
  'a group assignment of a group with none of K''s athletes is not in K''s stream'
);
grant select on stream_k to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub": "75000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty(
  $$ select id from stream_k except select id from public.training_plan_assignments $$,
  'every assignment in K''s stream is readable by K'
);
select lives_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000f20', 'device-1', '75000000-0000-4000-8000-000000000036', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e5', '2026-10-26 08:00:00+00') $$,
  'K marks its direct athlete against the group assignment of the group the athlete is in'
);
select throws_ok(
  $$ insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values ('75000000-0000-4000-8000-000000000f21', 'device-1', '75000000-0000-4000-8000-000000000036', '75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-0000000000e7', '2026-10-26 08:00:00+00') $$,
  '42501', 'new row violates row-level security policy for table "training_plan_fulfillments"', 'but not another member of that group who is not in K''s charge'
);
reset role;

select * from finish();
rollback;
