-- Active coaches read the edit conflicts of their school's measurements that they can already read
-- (issue #1109), as school admins have since #316, so the review screen (#1110) can list them. Reading
-- only: resolving stays with the platform admin. A deactivated coach reads nothing, not even a conflict
-- they authored, and a guardian, an adult athlete or a user with no role read nothing.
-- Users: platform admin P, school admins SA (A) and SB (B), coach C of A (coaches e1, authors nothing),
-- coach C2 of A (coaches e2 and e3), coach D of A deactivated (coaches e1), coach X of B (coaches e9),
-- guardian G of e1, adult athlete AA of e3, N with no role. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email) values
  ('11090000-0000-4000-8000-0000000000a1', 'platform-p@example.test'),
  ('11090000-0000-4000-8000-0000000000a2', 'admin-sa@example.test'),
  ('11090000-0000-4000-8000-0000000000a3', 'admin-sb@example.test'),
  ('11090000-0000-4000-8000-0000000000a4', 'coach-c@example.test'),
  ('11090000-0000-4000-8000-0000000000a5', 'coach-c2@example.test'),
  ('11090000-0000-4000-8000-0000000000a6', 'coach-d@example.test'),
  ('11090000-0000-4000-8000-0000000000a7', 'coach-x@example.test'),
  ('11090000-0000-4000-8000-0000000000a8', 'guardian-g@example.test'),
  ('11090000-0000-4000-8000-0000000000a9', 'adult-athlete-aa@example.test'),
  ('11090000-0000-4000-8000-0000000000aa', 'nobody-n@example.test');

insert into public.platform_admins (user_id) values ('11090000-0000-4000-8000-0000000000a1');
insert into public.schools (id, name) values
  ('11090000-0000-4000-8000-0000000000b1', 'Staff Conflict School A'),
  ('11090000-0000-4000-8000-0000000000b2', 'Staff Conflict School B');
insert into public.school_memberships (school_id, user_id, role) values
  ('11090000-0000-4000-8000-0000000000b1', '11090000-0000-4000-8000-0000000000a2', 'school_admin'),
  ('11090000-0000-4000-8000-0000000000b2', '11090000-0000-4000-8000-0000000000a3', 'school_admin'),
  ('11090000-0000-4000-8000-0000000000b1', '11090000-0000-4000-8000-0000000000a4', 'coach'),
  ('11090000-0000-4000-8000-0000000000b1', '11090000-0000-4000-8000-0000000000a5', 'coach'),
  ('11090000-0000-4000-8000-0000000000b1', '11090000-0000-4000-8000-0000000000a6', 'coach'),
  ('11090000-0000-4000-8000-0000000000b2', '11090000-0000-4000-8000-0000000000a7', 'coach');
-- The trigger stamps the time, so D is deactivated after being created active.
update public.school_memberships set deactivated_at = now()
  where school_id = '11090000-0000-4000-8000-0000000000b1' and user_id = '11090000-0000-4000-8000-0000000000a6';

insert into public.athletes (id, first_name, last_name) values
  ('11090000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('11090000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('11090000-0000-4000-8000-0000000000e3', 'Athlete', 'E3'),
  ('11090000-0000-4000-8000-0000000000e9', 'Athlete', 'E9');
insert into public.athlete_schools (athlete_id, school_id) values
  ('11090000-0000-4000-8000-0000000000e1', '11090000-0000-4000-8000-0000000000b1'),
  ('11090000-0000-4000-8000-0000000000e2', '11090000-0000-4000-8000-0000000000b1'),
  ('11090000-0000-4000-8000-0000000000e3', '11090000-0000-4000-8000-0000000000b1'),
  ('11090000-0000-4000-8000-0000000000e9', '11090000-0000-4000-8000-0000000000b2');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('11090000-0000-4000-8000-0000000000a8', '11090000-0000-4000-8000-0000000000e1', 'guardian'),
  ('11090000-0000-4000-8000-0000000000a9', '11090000-0000-4000-8000-0000000000e3', 'self');
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  ('11090000-0000-4000-8000-0000000000a4', '11090000-0000-4000-8000-0000000000e1', '11090000-0000-4000-8000-0000000000b1'),
  ('11090000-0000-4000-8000-0000000000a5', '11090000-0000-4000-8000-0000000000e2', '11090000-0000-4000-8000-0000000000b1'),
  ('11090000-0000-4000-8000-0000000000a5', '11090000-0000-4000-8000-0000000000e3', '11090000-0000-4000-8000-0000000000b1'),
  ('11090000-0000-4000-8000-0000000000a6', '11090000-0000-4000-8000-0000000000e1', '11090000-0000-4000-8000-0000000000b1'),
  ('11090000-0000-4000-8000-0000000000a7', '11090000-0000-4000-8000-0000000000e9', '11090000-0000-4000-8000-0000000000b2');

-- d1: e1 by D, d2: e2 by C2, d3: e3 by C2, d9: e9 of school B by X.
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
values
  ('11090000-0000-4000-8000-0000000000d1', '11090000-0000-4000-8000-0000000000a6', '11090000-0000-4000-8000-0000000000b1', 'repetition', '11090000-0000-4000-8000-0000000000e1', 3500, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-11-10 08:00:00+00'),
  ('11090000-0000-4000-8000-0000000000d2', '11090000-0000-4000-8000-0000000000a5', '11090000-0000-4000-8000-0000000000b1', 'repetition', '11090000-0000-4000-8000-0000000000e2', 3600, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-11-10 08:01:00+00'),
  ('11090000-0000-4000-8000-0000000000d3', '11090000-0000-4000-8000-0000000000a5', '11090000-0000-4000-8000-0000000000b1', 'repetition', '11090000-0000-4000-8000-0000000000e3', 3700, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-11-10 08:02:00+00'),
  ('11090000-0000-4000-8000-0000000000d9', '11090000-0000-4000-8000-0000000000a7', '11090000-0000-4000-8000-0000000000b2', 'repetition', '11090000-0000-4000-8000-0000000000e9', 3800, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-9', '2026-11-10 08:03:00+00');

-- Conflicts, inserted as the owner (clients cannot write): f1 on d1 (authored by D), f2 on d2 and f3 on d3
-- (by C2), f9 on d9 (by X).
insert into public.measurement_conflicts
  (id, measurement_id, base_version, current_values, current_by, incoming_values, incoming_by)
values
  ('11090000-0000-4000-8000-0000000000f1', '11090000-0000-4000-8000-0000000000d1', 1, '{"hundredths": 3000, "version": 2}', '11090000-0000-4000-8000-0000000000a6', '{"hundredths": 3450}', '11090000-0000-4000-8000-0000000000a6'),
  ('11090000-0000-4000-8000-0000000000f2', '11090000-0000-4000-8000-0000000000d2', 1, '{"hundredths": 3100, "version": 2}', '11090000-0000-4000-8000-0000000000a5', '{"hundredths": 3150}', '11090000-0000-4000-8000-0000000000a5'),
  ('11090000-0000-4000-8000-0000000000f3', '11090000-0000-4000-8000-0000000000d3', 1, '{"hundredths": 3200, "version": 2}', '11090000-0000-4000-8000-0000000000a5', '{"hundredths": 3250}', '11090000-0000-4000-8000-0000000000a5'),
  ('11090000-0000-4000-8000-0000000000f9', '11090000-0000-4000-8000-0000000000d9', 1, '{"hundredths": 3300, "version": 2}', '11090000-0000-4000-8000-0000000000a7', '{"hundredths": 3350}', '11090000-0000-4000-8000-0000000000a7');

-- 1. Signed out: no grant, so the read fails.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$ select id from public.measurement_conflicts $$, '42501', null, 'a signed-out user cannot read conflicts');
set local role authenticated;
-- 2-4. Platform admin and school admins.
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select set_eq(
  $$ select id from public.measurement_conflicts $$,
  $$ values ('11090000-0000-4000-8000-0000000000f1'::uuid), ('11090000-0000-4000-8000-0000000000f2'), ('11090000-0000-4000-8000-0000000000f3'), ('11090000-0000-4000-8000-0000000000f9') $$,
  'the platform admin reads every conflict'
);
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select set_eq(
  $$ select id from public.measurement_conflicts $$,
  $$ values ('11090000-0000-4000-8000-0000000000f1'::uuid), ('11090000-0000-4000-8000-0000000000f2'), ('11090000-0000-4000-8000-0000000000f3') $$,
  'school admin SA reads the conflicts of school A'
);
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select set_eq(
  $$ select id from public.measurement_conflicts $$,
  $$ values ('11090000-0000-4000-8000-0000000000f9'::uuid) $$,
  'school admin SB reads only the conflict of school B'
);

-- 5-9. Coaches: active coaches read the conflicts of measurements they can read, in their school only.
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select set_eq(
  $$ select id from public.measurement_conflicts $$,
  $$ values ('11090000-0000-4000-8000-0000000000f1'::uuid) $$,
  'active coach C reads f1, the conflict of their athlete e1 authored by someone else'
);
select is(
  (select incoming_values ->> 'hundredths' from public.measurement_conflicts where id = '11090000-0000-4000-8000-0000000000f1'),
  '3450', 'C reads the incoming values of f1'
);
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select set_eq(
  $$ select id from public.measurement_conflicts $$,
  $$ values ('11090000-0000-4000-8000-0000000000f2'::uuid), ('11090000-0000-4000-8000-0000000000f3') $$,
  'active coach C2 reads f2 and f3'
);
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is_empty($$ select id from public.measurement_conflicts $$, 'a deactivated coach reads no conflict, not even the one they authored');
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select set_eq(
  $$ select id from public.measurement_conflicts $$,
  $$ values ('11090000-0000-4000-8000-0000000000f9'::uuid) $$,
  'coach X of school B reads only f9'
);

-- 10-12. Family and users with no role read nothing.
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a8", "role": "authenticated"}';
select is_empty($$ select id from public.measurement_conflicts $$, 'a guardian reads no conflict');
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a9", "role": "authenticated"}';
select is_empty($$ select id from public.measurement_conflicts $$, 'an adult athlete reads no conflict');
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000aa", "role": "authenticated"}';
select is_empty($$ select id from public.measurement_conflicts $$, 'a user with no role reads no conflict');

-- 13-19. Reading does not mean resolving: only the platform admin resolves a conflict.
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ select public.resolve_measurement_conflict('11090000-0000-4000-8000-0000000000f1', 1, 'incoming', null, 'Video review') $$,
  '42501', 'only a platform admin resolves a conflict',
  'school admin SA cannot resolve a conflict'
);
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok(
  $$ select public.resolve_measurement_conflict('11090000-0000-4000-8000-0000000000f1', 1, 'incoming', null, 'Video review') $$,
  '42501', 'only a platform admin resolves a conflict',
  'coach C cannot resolve a conflict'
);
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select throws_ok(
  $$ select public.resolve_measurement_conflict('11090000-0000-4000-8000-0000000000f1', 1, 'incoming', null, 'Video review') $$,
  '42501', 'only a platform admin resolves a conflict',
  'deactivated coach D cannot resolve a conflict'
);
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select throws_ok(
  $$ select public.resolve_measurement_conflict('11090000-0000-4000-8000-0000000000f1', 1, 'incoming', null, 'Video review') $$,
  '42501', 'only a platform admin resolves a conflict',
  'coach X cannot resolve a conflict'
);
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a8", "role": "authenticated"}';
select throws_ok(
  $$ select public.resolve_measurement_conflict('11090000-0000-4000-8000-0000000000f1', 1, 'incoming', null, 'Video review') $$,
  '42501', 'only a platform admin resolves a conflict',
  'guardian G cannot resolve a conflict'
);
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000a9", "role": "authenticated"}';
select throws_ok(
  $$ select public.resolve_measurement_conflict('11090000-0000-4000-8000-0000000000f1', 1, 'incoming', null, 'Video review') $$,
  '42501', 'only a platform admin resolves a conflict',
  'adult athlete AA cannot resolve a conflict'
);
set local request.jwt.claims = '{"sub": "11090000-0000-4000-8000-0000000000aa", "role": "authenticated"}';
select throws_ok(
  $$ select public.resolve_measurement_conflict('11090000-0000-4000-8000-0000000000f1', 1, 'incoming', null, 'Video review') $$,
  '42501', 'only a platform admin resolves a conflict',
  'user N cannot resolve a conflict'
);

-- 20. Nothing above resolved anything.
reset role;
select is(
  (select count(*)::int from public.measurement_conflicts where status = 'open'),
  4, 'all four conflicts are still open'
);

select * from finish();
rollback;
