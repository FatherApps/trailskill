-- #1031, #1016: a coach deactivated in school S reads no row of S and still reads the schools where active; others read the same.
-- Users: admins A and B, coach C (of A and B), coach K (of A), guardian G, platform admin P. Athletes: X, Y (g1), W in A;
-- Z (g2) in B; W and W2 in both (C coaches W in A and W2 in B). Synthetic data.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email) values
  ('10310000-0000-4000-8000-0000000000a1', 'admin-a@example.test'),
  ('10310000-0000-4000-8000-0000000000a2', 'admin-b@example.test'),
  ('10310000-0000-4000-8000-0000000000a3', 'coach-c@example.test'),
  ('10310000-0000-4000-8000-0000000000a4', 'coach-k@example.test'),
  ('10310000-0000-4000-8000-0000000000a5', 'guardian-g@example.test'),
  ('10310000-0000-4000-8000-0000000000a6', 'platform-admin-p@example.test');
insert into public.platform_admins (user_id) values ('10310000-0000-4000-8000-0000000000a6');
insert into public.schools (id, name) values
  ('10310000-0000-4000-8000-0000000000b1', 'Read Access School A'),
  ('10310000-0000-4000-8000-0000000000b2', 'Read Access School B');
-- d1 is C's membership in A, the one deactivated below.
insert into public.school_memberships (id, school_id, user_id, role) values
  ('10310000-0000-4000-8000-0000000000d1', '10310000-0000-4000-8000-0000000000b1', '10310000-0000-4000-8000-0000000000a3', 'coach'),
  ('10310000-0000-4000-8000-0000000000d2', '10310000-0000-4000-8000-0000000000b2', '10310000-0000-4000-8000-0000000000a3', 'coach'),
  ('10310000-0000-4000-8000-0000000000d3', '10310000-0000-4000-8000-0000000000b1', '10310000-0000-4000-8000-0000000000a4', 'coach'),
  ('10310000-0000-4000-8000-0000000000d4', '10310000-0000-4000-8000-0000000000b1', '10310000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('10310000-0000-4000-8000-0000000000d5', '10310000-0000-4000-8000-0000000000b2', '10310000-0000-4000-8000-0000000000a2', 'school_admin');
insert into public.categories (id, school_id, name) values
  ('10310000-0000-4000-8000-0000000000c1', '10310000-0000-4000-8000-0000000000b1', 'Read Access Category A');
insert into public.training_groups (id, school_id, name) values
  ('10310000-0000-4000-8000-000000000091', '10310000-0000-4000-8000-0000000000b1', 'Group g1 of A'),
  ('10310000-0000-4000-8000-000000000092', '10310000-0000-4000-8000-0000000000b2', 'Group g2 of B');
insert into public.athletes (id, first_name, last_name) values
  ('10310000-0000-4000-8000-0000000000e1', 'Athlete', 'X'),
  ('10310000-0000-4000-8000-0000000000e2', 'Athlete', 'Y'),
  ('10310000-0000-4000-8000-0000000000e3', 'Athlete', 'Z'),
  ('10310000-0000-4000-8000-0000000000e4', 'Athlete', 'W'),
  ('10310000-0000-4000-8000-0000000000e5', 'Athlete', 'W2');
insert into public.athlete_schools (athlete_id, school_id, category_id) values
  ('10310000-0000-4000-8000-0000000000e1', '10310000-0000-4000-8000-0000000000b1', '10310000-0000-4000-8000-0000000000c1'),
  ('10310000-0000-4000-8000-0000000000e2', '10310000-0000-4000-8000-0000000000b1', null),
  ('10310000-0000-4000-8000-0000000000e3', '10310000-0000-4000-8000-0000000000b2', null),
  ('10310000-0000-4000-8000-0000000000e4', '10310000-0000-4000-8000-0000000000b1', null),
  ('10310000-0000-4000-8000-0000000000e4', '10310000-0000-4000-8000-0000000000b2', null),
  ('10310000-0000-4000-8000-0000000000e5', '10310000-0000-4000-8000-0000000000b1', '10310000-0000-4000-8000-0000000000c1'),
  ('10310000-0000-4000-8000-0000000000e5', '10310000-0000-4000-8000-0000000000b2', null);
insert into public.athlete_groups (athlete_id, group_id) values
  ('10310000-0000-4000-8000-0000000000e2', '10310000-0000-4000-8000-000000000091'),
  ('10310000-0000-4000-8000-0000000000e3', '10310000-0000-4000-8000-000000000092'),
  ('10310000-0000-4000-8000-0000000000e5', '10310000-0000-4000-8000-000000000091'),
  ('10310000-0000-4000-8000-0000000000e5', '10310000-0000-4000-8000-000000000092');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('10310000-0000-4000-8000-0000000000a5', '10310000-0000-4000-8000-0000000000e1', 'guardian'),
  ('10310000-0000-4000-8000-0000000000a5', '10310000-0000-4000-8000-0000000000e4', 'guardian');
-- C: X and W in A, Z and W2 in B, and the group g1 of A. K: X and g1, in A.
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  ('10310000-0000-4000-8000-0000000000a3', '10310000-0000-4000-8000-0000000000e1', '10310000-0000-4000-8000-0000000000b1'),
  ('10310000-0000-4000-8000-0000000000a3', '10310000-0000-4000-8000-0000000000e3', '10310000-0000-4000-8000-0000000000b2'),
  ('10310000-0000-4000-8000-0000000000a3', '10310000-0000-4000-8000-0000000000e4', '10310000-0000-4000-8000-0000000000b1'),
  ('10310000-0000-4000-8000-0000000000a3', '10310000-0000-4000-8000-0000000000e5', '10310000-0000-4000-8000-0000000000b2'),
  ('10310000-0000-4000-8000-0000000000a4', '10310000-0000-4000-8000-0000000000e1', '10310000-0000-4000-8000-0000000000b1');
insert into public.coach_group_assignments (coach_user_id, group_id) values
  ('10310000-0000-4000-8000-0000000000a3', '10310000-0000-4000-8000-000000000091'),
  ('10310000-0000-4000-8000-0000000000a4', '10310000-0000-4000-8000-000000000091');
-- s1: C's series in A. f1-f3: C's marks of X, Y, W in A; f4: of Z in B; f5: unassigned arrival of s1; f6: B's mark of W.
insert into public.timing_series (id, created_by, school_id, stroke, distance, pool, session_type, device_id) values
  ('10310000-0000-4000-8000-0000000000a9', '10310000-0000-4000-8000-0000000000a3', '10310000-0000-4000-8000-0000000000b1', 'FR', '50m', 'SCM', 'training', 'dev-c');
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, series_id, arrival_position, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
values
  ('10310000-0000-4000-8000-0000000000f1', '10310000-0000-4000-8000-0000000000a3', '10310000-0000-4000-8000-0000000000b1', 'repetition', '10310000-0000-4000-8000-0000000000e1', null, null, 3100, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-24 08:00:00+00'),
  ('10310000-0000-4000-8000-0000000000f2', '10310000-0000-4000-8000-0000000000a3', '10310000-0000-4000-8000-0000000000b1', 'repetition', '10310000-0000-4000-8000-0000000000e2', null, null, 3200, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-24 08:01:00+00'),
  ('10310000-0000-4000-8000-0000000000f3', '10310000-0000-4000-8000-0000000000a3', '10310000-0000-4000-8000-0000000000b1', 'repetition', '10310000-0000-4000-8000-0000000000e4', null, null, 3300, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-24 08:02:00+00'),
  ('10310000-0000-4000-8000-0000000000f4', '10310000-0000-4000-8000-0000000000a3', '10310000-0000-4000-8000-0000000000b2', 'repetition', '10310000-0000-4000-8000-0000000000e3', null, null, 3400, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-24 08:03:00+00'),
  ('10310000-0000-4000-8000-0000000000f5', '10310000-0000-4000-8000-0000000000a3', '10310000-0000-4000-8000-0000000000b1', 'repetition', null, '10310000-0000-4000-8000-0000000000a9', 1, 3500, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-24 08:04:00+00'),
  ('10310000-0000-4000-8000-0000000000f6', '10310000-0000-4000-8000-0000000000a2', '10310000-0000-4000-8000-0000000000b2', 'repetition', '10310000-0000-4000-8000-0000000000e4', null, null, 3600, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-b', '2026-10-24 08:05:00+00');
-- p1 (school A) is assigned to the group g1; p2 (school B) to the athlete Z.
insert into public.training_plans (id, school_id, name, created_by) values
  ('10310000-0000-4000-8000-000000000011', '10310000-0000-4000-8000-0000000000b1', 'Plan p1', '10310000-0000-4000-8000-0000000000a1'),
  ('10310000-0000-4000-8000-000000000012', '10310000-0000-4000-8000-0000000000b2', 'Plan p2', '10310000-0000-4000-8000-0000000000a2');
insert into public.training_plan_versions (id, plan_id, version, created_by) values
  ('10310000-0000-4000-8000-000000000021', '10310000-0000-4000-8000-000000000011', 1, '10310000-0000-4000-8000-0000000000a1'),
  ('10310000-0000-4000-8000-000000000022', '10310000-0000-4000-8000-000000000012', 1, '10310000-0000-4000-8000-0000000000a2');
insert into public.training_plan_blocks (id, version_id, position, repetitions, distance, stroke, phase, recording, created_by) values
  ('10310000-0000-4000-8000-000000000031', '10310000-0000-4000-8000-000000000021', 1, 4, '50m', 'FR', 'main', 'completion', '10310000-0000-4000-8000-0000000000a1'),
  ('10310000-0000-4000-8000-000000000032', '10310000-0000-4000-8000-000000000022', 1, 4, '50m', 'FR', 'main', 'completion', '10310000-0000-4000-8000-0000000000a2');
insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id, athlete_id, created_by) values
  ('10310000-0000-4000-8000-000000000041', '10310000-0000-4000-8000-0000000000b1', '10310000-0000-4000-8000-000000000011', '10310000-0000-4000-8000-000000000021', '2026-11-20', 'group', '10310000-0000-4000-8000-000000000091', null, '10310000-0000-4000-8000-0000000000a1'),
  ('10310000-0000-4000-8000-000000000042', '10310000-0000-4000-8000-0000000000b2', '10310000-0000-4000-8000-000000000012', '10310000-0000-4000-8000-000000000022', '2026-11-20', 'athlete', null, '10310000-0000-4000-8000-0000000000e3', '10310000-0000-4000-8000-0000000000a2');
-- n3 gives p2 to W2 in B. fa and fb are W2's marks of the A assignment (through g1) and of the B one.
insert into public.training_plan_assignments (id, school_id, plan_id, version_id, session_date, target, group_id, athlete_id, created_by) values
  ('10310000-0000-4000-8000-000000000043', '10310000-0000-4000-8000-0000000000b2', '10310000-0000-4000-8000-000000000012', '10310000-0000-4000-8000-000000000022', '2026-11-21', 'athlete', null, '10310000-0000-4000-8000-0000000000e5', '10310000-0000-4000-8000-0000000000a2');
insert into public.training_plan_fulfillments (id, device_id, assignment_id, version_id, block_id, athlete_id, status, captured_at, created_by) values
  ('10310000-0000-4000-8000-000000000051', 'dev-c', '10310000-0000-4000-8000-000000000041', '10310000-0000-4000-8000-000000000021', '10310000-0000-4000-8000-000000000031', '10310000-0000-4000-8000-0000000000e5', 'done', '2026-11-20 08:00:00+00', '10310000-0000-4000-8000-0000000000a3'),
  ('10310000-0000-4000-8000-000000000052', 'dev-c', '10310000-0000-4000-8000-000000000043', '10310000-0000-4000-8000-000000000022', '10310000-0000-4000-8000-000000000032', '10310000-0000-4000-8000-0000000000e5', 'done', '2026-11-21 08:00:00+00', '10310000-0000-4000-8000-0000000000a3');
-- Results sharing: B shares its results of W with A (the guardian authorized it).
insert into public.authorization_texts (id, purpose, version, language, body) values
  ('10310000-0000-4000-8000-0000000000aa', 'share_results_with_school', 1031, 'es-CO', 'Synthetic sharing text for issue 1031');
insert into public.authorizations (id, user_id, athlete_id, purpose, text_id, accepted_at) values
  ('10310000-0000-4000-8000-0000000000ab', '10310000-0000-4000-8000-0000000000a5', '10310000-0000-4000-8000-0000000000e4', 'share_results_with_school', '10310000-0000-4000-8000-0000000000aa', '2026-10-01 08:00:00+00');
set local role authenticated;
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select public.request_result_sharing('10310000-0000-4000-8000-0000000000e4', '10310000-0000-4000-8000-0000000000b1');
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select public.approve_result_sharing((select id from public.school_result_sharing where school_id = '10310000-0000-4000-8000-0000000000b2' and target_school_id = '10310000-0000-4000-8000-0000000000b1'));
reset role;

-- School of the rows without school_id, filled as the owner (never derived through protected tables).
-- W2's athlete row counts in B: it is athlete-level and C still coaches W2 in B.
create temp table fx (tbl text, id uuid, school uuid);
insert into fx values
  ('athletes', '10310000-0000-4000-8000-0000000000e1', '10310000-0000-4000-8000-0000000000b1'),
  ('athletes', '10310000-0000-4000-8000-0000000000e2', '10310000-0000-4000-8000-0000000000b1'),
  ('athletes', '10310000-0000-4000-8000-0000000000e3', '10310000-0000-4000-8000-0000000000b2'),
  ('athletes', '10310000-0000-4000-8000-0000000000e4', '10310000-0000-4000-8000-0000000000b1'),
  ('athletes', '10310000-0000-4000-8000-0000000000e4', '10310000-0000-4000-8000-0000000000b2'),
  ('athletes', '10310000-0000-4000-8000-0000000000e5', '10310000-0000-4000-8000-0000000000b2'),
  ('assignments', '10310000-0000-4000-8000-000000000041', '10310000-0000-4000-8000-0000000000b1'),
  ('assignments', '10310000-0000-4000-8000-000000000042', '10310000-0000-4000-8000-0000000000b2'),
  ('assignments', '10310000-0000-4000-8000-000000000043', '10310000-0000-4000-8000-0000000000b2'),
  ('groups', '10310000-0000-4000-8000-000000000091', '10310000-0000-4000-8000-0000000000b1'),
  ('groups', '10310000-0000-4000-8000-000000000092', '10310000-0000-4000-8000-0000000000b2'),
  ('versions', '10310000-0000-4000-8000-000000000021', '10310000-0000-4000-8000-0000000000b1'),
  ('versions', '10310000-0000-4000-8000-000000000022', '10310000-0000-4000-8000-0000000000b2');
create temp table snap (label text primary key, rows text);
grant select on fx to authenticated;
grant all on snap to authenticated;
-- The rows of school sch the current role reads, per table, as one string.
create function pg_temp.rows_of(sch uuid) returns text language sql stable as $$
  select concat_ws(' ',
    'schools=' || (select count(*) from public.schools where id = sch),
    'categories=' || (select count(*) from public.categories where school_id = sch),
    'training_groups=' || (select count(*) from public.training_groups where school_id = sch),
    'athletes=' || (select count(*) from public.athletes a where a.id in (select id from pg_temp.fx where tbl = 'athletes' and school = sch)),
    'athlete_schools=' || (select count(*) from public.athlete_schools where school_id = sch),
    'athlete_groups=' || (select count(*) from public.athlete_groups where group_id in (select id from pg_temp.fx where tbl = 'groups' and school = sch)),
    'athlete_managers=' || (select count(*) from public.athlete_managers where athlete_id in (select id from pg_temp.fx where tbl = 'athletes' and school = sch)),
    'authorization_status=' || (select count(*) from public.authorization_status where athlete_id in (select id from pg_temp.fx where tbl = 'athletes' and school = sch)),
    'measurements=' || (select count(*) from public.measurements where school_id = sch),
    'timing_series=' || (select count(*) from public.timing_series where school_id = sch),
    'training_plans=' || (select count(*) from public.training_plans where school_id = sch),
    'training_plan_versions=' || (select count(*) from public.training_plan_versions where id in (select id from pg_temp.fx where tbl = 'versions' and school = sch)),
    'training_plan_blocks=' || (select count(*) from public.training_plan_blocks where version_id in (select id from pg_temp.fx where tbl = 'versions' and school = sch)),
    'training_plan_assignments=' || (select count(*) from public.training_plan_assignments where school_id = sch),
    'training_plan_fulfillments=' || (select count(*) from public.training_plan_fulfillments where assignment_id in (select id from pg_temp.fx where tbl = 'assignments' and school = sch)),
    'coach_athlete_assignments=' || (select count(*) from public.coach_athlete_assignments where school_id = sch),
    'coach_group_assignments=' || (select count(*) from public.coach_group_assignments where group_id in (select id from pg_temp.fx where tbl = 'groups' and school = sch))
  )
$$;

-- 1. Before the deactivation: what each role reads is stored to compare after.
set local role authenticated;
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
insert into snap values
  ('C_A', pg_temp.rows_of('10310000-0000-4000-8000-0000000000b1')),
  ('C_B', pg_temp.rows_of('10310000-0000-4000-8000-0000000000b2'));
select is((select count(*)::int from public.other_school_results('10310000-0000-4000-8000-0000000000e4')) > 0, true,
  'before: C reads the results B shares for W');
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
insert into snap values ('K_A', pg_temp.rows_of('10310000-0000-4000-8000-0000000000b1'));
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
insert into snap values ('ADMIN_A_A', pg_temp.rows_of('10310000-0000-4000-8000-0000000000b1'));
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
insert into snap values ('ADMIN_B_B', pg_temp.rows_of('10310000-0000-4000-8000-0000000000b2'));
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
insert into snap values ('G_A', pg_temp.rows_of('10310000-0000-4000-8000-0000000000b1'));
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
insert into snap values
  ('P_A', pg_temp.rows_of('10310000-0000-4000-8000-0000000000b1')),
  ('P_B', pg_temp.rows_of('10310000-0000-4000-8000-0000000000b2'));
reset role;
select is((select position('=0' in rows) from snap where label = 'C_A'), 0,
  'before: C reads at least one row of every table in A, so the zeros below prove something');

-- 2. Admin A deactivates C in A.
set local role authenticated;
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
with u as (update public.school_memberships set deactivated_at = now() where id = '10310000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from u), 1, 'the admin of A deactivates C in A');

-- 3. The deactivated coach C.
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(pg_temp.rows_of('10310000-0000-4000-8000-0000000000b1'),
  'schools=0 categories=0 training_groups=0 athletes=0 athlete_schools=0 athlete_groups=0 athlete_managers=0 authorization_status=0 measurements=0 timing_series=0 training_plans=0 training_plan_versions=0 training_plan_blocks=0 training_plan_assignments=0 training_plan_fulfillments=0 coach_athlete_assignments=0 coach_group_assignments=0',
  'C reads no row of A after the deactivation');
select is(
  (select count(*)::int from public.school_memberships where school_id = '10310000-0000-4000-8000-0000000000b1' and deactivated_at is not null),
  1, 'C still reads their own deactivated membership in A, and only that one');
select is_empty($$ select * from public.other_school_results('10310000-0000-4000-8000-0000000000e4') $$,
  'C reads no result B shares with A');
select throws_ok(
  $$insert into public.measurements (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
    values ('10310000-0000-4000-8000-0000000000f7', '10310000-0000-4000-8000-0000000000a3', '10310000-0000-4000-8000-0000000000b1', 'repetition',
      '10310000-0000-4000-8000-0000000000e1', 3700, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-11-15 08:00:00+00')$$,
  '42501', null,
  'C still cannot record a measurement in A (#963); the permissive policy now fails first, so the message names no policy');
select throws_ok(
  $$insert into public.training_plans (id, school_id, name, created_by)
    values ('10310000-0000-4000-8000-000000000013', '10310000-0000-4000-8000-0000000000b1', 'Plan by C', '10310000-0000-4000-8000-0000000000a3')$$,
  '42501', null,
  'C cannot create a training plan in A');
select is(pg_temp.rows_of('10310000-0000-4000-8000-0000000000b2'),
  'schools=1 categories=0 training_groups=1 athletes=2 athlete_schools=2 athlete_groups=2 athlete_managers=0 authorization_status=0 measurements=1 timing_series=0 training_plans=1 training_plan_versions=1 training_plan_blocks=1 training_plan_assignments=2 training_plan_fulfillments=1 coach_athlete_assignments=2 coach_group_assignments=0',
  'C reads B as an active coach: Z, g2 and the plan p2, but no longer W');

-- C still reads W2, whom C coaches in B, but only the rows of B.
select is((select count(*)::int from public.athletes where id = '10310000-0000-4000-8000-0000000000e5'), 1, 'C reads the athlete row of W2');
select is((select array_agg(school_id) from public.athlete_schools where athlete_id = '10310000-0000-4000-8000-0000000000e5'),
  array['10310000-0000-4000-8000-0000000000b2'::uuid], 'C reads only the B school row of W2');
select is((select array_agg(group_id) from public.athlete_groups where athlete_id = '10310000-0000-4000-8000-0000000000e5'),
  array['10310000-0000-4000-8000-000000000092'::uuid], 'C reads only the B group row of W2');
select is((select array_agg(id) from public.training_plan_fulfillments where athlete_id = '10310000-0000-4000-8000-0000000000e5'),
  array['10310000-0000-4000-8000-000000000052'::uuid], 'C reads only the B mark of W2');

-- 4. Everyone else reads what they read before.
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is(pg_temp.rows_of('10310000-0000-4000-8000-0000000000b1'), (select rows from snap where label = 'K_A'), 'the active coach K reads the same rows of A');
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(pg_temp.rows_of('10310000-0000-4000-8000-0000000000b1'), (select rows from snap where label = 'ADMIN_A_A'), 'admin A reads the same rows of A');
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(pg_temp.rows_of('10310000-0000-4000-8000-0000000000b2'), (select rows from snap where label = 'ADMIN_B_B'), 'admin B reads the same rows of B');
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(pg_temp.rows_of('10310000-0000-4000-8000-0000000000b1'), (select rows from snap where label = 'G_A'), 'the guardian G reads the same rows of A');
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is(pg_temp.rows_of('10310000-0000-4000-8000-0000000000b1'), (select rows from snap where label = 'P_A'), 'the platform admin reads the same rows of A');
select is(pg_temp.rows_of('10310000-0000-4000-8000-0000000000b2'), (select rows from snap where label = 'P_B'), 'the platform admin reads the same rows of B');

-- 5. The earlier measurements of C in A keep their author; admin A reads them, C no longer.
reset role;
select is(
  (select count(*)::int from public.measurements where school_id = '10310000-0000-4000-8000-0000000000b1' and created_by = '10310000-0000-4000-8000-0000000000a3'),
  4, 'the four measurements of C in A keep their author');
set local role authenticated;
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  (select count(*)::int from public.measurements where school_id = '10310000-0000-4000-8000-0000000000b1' and created_by = '10310000-0000-4000-8000-0000000000a3'),
  3, 'admin A reads the three of them given to a swimmer');
set local request.jwt.claims = '{"sub": "10310000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(
  (select count(*)::int from public.measurements where school_id = '10310000-0000-4000-8000-0000000000b1' and created_by = '10310000-0000-4000-8000-0000000000a3'),
  0, 'C reads none of them');

-- 6. The sync streams: the with: subqueries and coach queries of powersync/sync-config.yaml, with C's id and the CTEs inlined.
reset role;
select set_eq(
  $$ select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null $$,
  $$ values ('10310000-0000-4000-8000-0000000000b2'::uuid) $$,
  'member_school_ids gives C only the school where they are active');
select set_eq(
  $$ select athlete_id from public.coach_athlete_assignments where coach_user_id = '10310000-0000-4000-8000-0000000000a3' and school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null)
     union
     select athlete_id from public.athlete_groups where group_id in (select group_id from public.coach_group_assignments where coach_user_id = '10310000-0000-4000-8000-0000000000a3' and group_id in (select id from public.training_groups where school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null))) $$,
  $$ values ('10310000-0000-4000-8000-0000000000e3'::uuid), ('10310000-0000-4000-8000-0000000000e5') $$,
  'the coach athlete ids of C are only Z and W2, of B');
select set_eq(
  $$ select id from public.training_groups where school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null) $$,
  $$ values ('10310000-0000-4000-8000-000000000092'::uuid) $$,
  'member_group_ids gives C only the groups of B');
select set_eq(
  $$ select group_id from public.athlete_groups where group_id in (select id from public.training_groups where school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null))
       and athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '10310000-0000-4000-8000-0000000000a3' and school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null)) $$,
  $$ values ('10310000-0000-4000-8000-000000000092'::uuid) $$,
  'coach_direct_group_ids gives C only the group of B');
select is_empty(
  $$ select category_id from public.athlete_schools where category_id is not null
       and school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null)
       and athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '10310000-0000-4000-8000-0000000000a3' and school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null)) $$,
  'coach_direct_category_ids gives C no category: the one of W2 is in A');
select set_eq(
  $$ select athlete_id, school_id from public.athlete_schools
     where athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '10310000-0000-4000-8000-0000000000a3' and school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null))
       and school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null) $$,
  $$ values ('10310000-0000-4000-8000-0000000000e3'::uuid, '10310000-0000-4000-8000-0000000000b2'::uuid),
            ('10310000-0000-4000-8000-0000000000e5', '10310000-0000-4000-8000-0000000000b2') $$,
  'the athlete_schools query for C returns the B rows of Z and W2, none of A');
select set_eq(
  $$ select athlete_id, group_id from public.athlete_groups
     where athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '10310000-0000-4000-8000-0000000000a3' and school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null))
       and group_id in (select id from public.training_groups where school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null)) $$,
  $$ values ('10310000-0000-4000-8000-0000000000e3'::uuid, '10310000-0000-4000-8000-000000000092'::uuid),
            ('10310000-0000-4000-8000-0000000000e5', '10310000-0000-4000-8000-000000000092') $$,
  'the athlete_groups query for C returns the B rows of Z and W2, none of A');
select set_eq(
  $$ select id from public.training_plan_fulfillments
     where athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '10310000-0000-4000-8000-0000000000a3' and school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null))
       and hidden = false
       and assignment_id in (select id from public.training_plan_assignments where school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null)) $$,
  $$ values ('10310000-0000-4000-8000-000000000052'::uuid) $$,
  'the fulfillments query for C returns the B mark of W2 only');
select is_empty(
  $$ select id from public.timing_series where created_by = '10310000-0000-4000-8000-0000000000a3' and school_id in (select school_id from public.school_memberships where user_id = '10310000-0000-4000-8000-0000000000a3' and deactivated_at is null) $$,
  'own_series_ids gives C no series: the only one is in A');

select * from finish();
rollback;
