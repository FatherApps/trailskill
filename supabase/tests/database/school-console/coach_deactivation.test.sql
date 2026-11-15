-- Deactivating a coach (issue #963): only an admin of the coach's school sets
-- school_memberships.deactivated_at, the server stamps the time, and it never
-- goes back. A deactivated coach cannot record new measurements in that school
-- (42501, the code the device treats as a permanent rejection), keeps the
-- author of earlier ones, and still records in a school where they are active.
-- Users: admin A of school A, admin B of school B, coach C (coach of A and B),
-- guardian G of athlete X, N with no relations, adult athlete AA of school A,
-- platform admin P, and coach C2 of B. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email) values
  ('96300000-0000-4000-8000-0000000000a1', 'admin-a@example.test'),
  ('96300000-0000-4000-8000-0000000000a2', 'admin-b@example.test'),
  ('96300000-0000-4000-8000-0000000000a3', 'coach-c@example.test'),
  ('96300000-0000-4000-8000-0000000000a4', 'guardian-g@example.test'),
  ('96300000-0000-4000-8000-0000000000a5', 'nobody-n@example.test'),
  ('96300000-0000-4000-8000-0000000000a6', 'adult-athlete-aa@example.test'),
  ('96300000-0000-4000-8000-0000000000a7', 'platform-admin-p@example.test'),
  ('96300000-0000-4000-8000-0000000000a8', 'coach-c2@example.test');
insert into public.platform_admins (user_id) values ('96300000-0000-4000-8000-0000000000a7');
insert into public.schools (id, name) values
  ('96300000-0000-4000-8000-0000000000b1', 'Deactivation School A'),
  ('96300000-0000-4000-8000-0000000000b2', 'Deactivation School B');
-- d1 is C's coach membership in A, d2 in B, d3 admin A's own, d4 admin B's own,
-- d5 is C2's coach membership in B.
insert into public.school_memberships (id, school_id, user_id, role) values
  ('96300000-0000-4000-8000-0000000000d1', '96300000-0000-4000-8000-0000000000b1', '96300000-0000-4000-8000-0000000000a3', 'coach'),
  ('96300000-0000-4000-8000-0000000000d2', '96300000-0000-4000-8000-0000000000b2', '96300000-0000-4000-8000-0000000000a3', 'coach'),
  ('96300000-0000-4000-8000-0000000000d3', '96300000-0000-4000-8000-0000000000b1', '96300000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('96300000-0000-4000-8000-0000000000d4', '96300000-0000-4000-8000-0000000000b2', '96300000-0000-4000-8000-0000000000a2', 'school_admin'),
  ('96300000-0000-4000-8000-0000000000d5', '96300000-0000-4000-8000-0000000000b2', '96300000-0000-4000-8000-0000000000a8', 'coach');
insert into public.athletes (id, first_name, last_name) values
  ('96300000-0000-4000-8000-0000000000e1', 'Athlete', 'X'),
  ('96300000-0000-4000-8000-0000000000e2', 'Adult', 'Athlete');
insert into public.athlete_schools (athlete_id, school_id) values
  ('96300000-0000-4000-8000-0000000000e1', '96300000-0000-4000-8000-0000000000b1'),
  ('96300000-0000-4000-8000-0000000000e1', '96300000-0000-4000-8000-0000000000b2'),
  ('96300000-0000-4000-8000-0000000000e2', '96300000-0000-4000-8000-0000000000b1');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('96300000-0000-4000-8000-0000000000a4', '96300000-0000-4000-8000-0000000000e1', 'guardian'),
  ('96300000-0000-4000-8000-0000000000a6', '96300000-0000-4000-8000-0000000000e2', 'self');
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  ('96300000-0000-4000-8000-0000000000a3', '96300000-0000-4000-8000-0000000000e1', '96300000-0000-4000-8000-0000000000b1'),
  ('96300000-0000-4000-8000-0000000000a3', '96300000-0000-4000-8000-0000000000e1', '96300000-0000-4000-8000-0000000000b2');
-- c1: C's series in A. f1: C's mark of X in A, recorded before the deactivation.
insert into public.timing_series (id, created_by, school_id, stroke, distance, pool, session_type, device_id) values
  ('96300000-0000-4000-8000-0000000000c1', '96300000-0000-4000-8000-0000000000a3', '96300000-0000-4000-8000-0000000000b1', 'FR', '50m', 'SCM', 'training', 'dev-c');
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
values ('96300000-0000-4000-8000-0000000000f1', '96300000-0000-4000-8000-0000000000a3', '96300000-0000-4000-8000-0000000000b1', 'repetition',
   '96300000-0000-4000-8000-0000000000e1', 3100, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-24 08:00:00+00');

select has_column('public', 'school_memberships', 'deactivated_at', 'school_memberships has deactivated_at');

-- Who may deactivate: only an admin of that school.
set local role authenticated;
set local request.jwt.claims = '{"sub": "96300000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
with u as (update public.school_memberships set deactivated_at = now() where id = '96300000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from u), 0, 'the admin of another school cannot deactivate C in A');
set local request.jwt.claims = '{"sub": "96300000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
with u as (update public.school_memberships set deactivated_at = now() where id = '96300000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from u), 0, 'a coach cannot deactivate C in A');
set local request.jwt.claims = '{"sub": "96300000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
with u as (update public.school_memberships set deactivated_at = now() where id = '96300000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from u), 0, 'a guardian cannot deactivate C in A');
set local request.jwt.claims = '{"sub": "96300000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
with u as (update public.school_memberships set deactivated_at = now() where id = '96300000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from u), 0, 'a user with no relation cannot deactivate C in A');
set local request.jwt.claims = '{"sub": "96300000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
with u as (update public.school_memberships set deactivated_at = now() where id = '96300000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from u), 0, 'an adult athlete of the school cannot deactivate C in A');

reset role;
select is(
  (select deactivated_at from public.school_memberships where id = '96300000-0000-4000-8000-0000000000d1'),
  null::timestamptz, 'C is still active after the rejected attempts');

set local role authenticated;
set local request.jwt.claims = '{"sub": "96300000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
with u as (update public.school_memberships set deactivated_at = '2000-01-01 00:00:00+00' where id = '96300000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from u), 1, 'the admin of the school deactivates C in A');
select is(
  (select deactivated_at from public.school_memberships where id = '96300000-0000-4000-8000-0000000000d1'),
  now(), 'the server stamps the time, not the device');
with u as (update public.school_memberships set deactivated_at = '2001-01-01 00:00:00+00' where id = '96300000-0000-4000-8000-0000000000d1' returning deactivated_at)
select is((select deactivated_at from u), now(), 'repeating the deactivation does not fail and keeps the first stamp');
select throws_ok(
  $$update public.school_memberships set deactivated_at = null where id = '96300000-0000-4000-8000-0000000000d1'$$,
  '42501', 'a deactivated coach cannot be reactivated', 'a deactivated coach cannot be reactivated');
select throws_ok(
  $$update public.school_memberships set deactivated_at = now() where id = '96300000-0000-4000-8000-0000000000d3'$$,
  '23514', null, 'only a coach membership can be deactivated');

-- The platform admin is allowed by school_memberships_write, in any school.
set local request.jwt.claims = '{"sub": "96300000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
with u as (update public.school_memberships set deactivated_at = now() where id = '96300000-0000-4000-8000-0000000000d5' returning 1)
select is((select count(*)::int from u), 1, 'the platform admin deactivates C2 in B');
select is(
  (select deactivated_at from public.school_memberships where id = '96300000-0000-4000-8000-0000000000d5'),
  now(), 'the platform admin deactivation is stamped by the server');

-- The rejection of new measurements. Since #1031 the permissive insert policy fails
-- first (a deactivated coach no longer counts as staff), so the message names no
-- policy; the code is the same 42501 the device treats as a permanent rejection.
set local request.jwt.claims = '{"sub": "96300000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$insert into public.measurements (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
    values ('96300000-0000-4000-8000-0000000000f2', '96300000-0000-4000-8000-0000000000a3', '96300000-0000-4000-8000-0000000000b1', 'repetition',
      '96300000-0000-4000-8000-0000000000e1', 3200, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-11-14 08:00:00+00')$$,
  '42501', null,
  'a deactivated coach cannot record a named measurement in A');
select throws_ok(
  $$insert into public.measurements (id, created_by, school_id, kind, series_id, arrival_position, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
    values ('96300000-0000-4000-8000-0000000000f3', '96300000-0000-4000-8000-0000000000a3', '96300000-0000-4000-8000-0000000000b1', 'arrival',
      '96300000-0000-4000-8000-0000000000c1', 1, 3300, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-11-14 08:01:00+00')$$,
  '42501', null,
  'a deactivated coach cannot record an unassigned arrival in A');
select lives_ok(
  $$insert into public.measurements (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
    values ('96300000-0000-4000-8000-0000000000f4', '96300000-0000-4000-8000-0000000000a3', '96300000-0000-4000-8000-0000000000b2', 'repetition',
      '96300000-0000-4000-8000-0000000000e1', 3400, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-11-14 08:02:00+00')$$,
  'the same coach still records in B, where they are active');
select is(
  (select count(*)::int from public.school_memberships where user_id = '96300000-0000-4000-8000-0000000000a3' and deactivated_at is not null),
  1, 'C reads their own deactivated membership');

reset role;
select is(
  (select created_by from public.measurements where id = '96300000-0000-4000-8000-0000000000f1'),
  '96300000-0000-4000-8000-0000000000a3'::uuid, 'the earlier measurement keeps its author');
select is(
  (select count(*)::int from public.coach_athlete_assignments where coach_user_id = '96300000-0000-4000-8000-0000000000a3'),
  2, 'the assignments of C are untouched');
select is(
  (select deactivated_at from public.school_memberships where id = '96300000-0000-4000-8000-0000000000d2'),
  null::timestamptz, 'C stays active in B');

select * from finish();
rollback;
