-- Results of another school (issue #68): school B sees the results school A
-- recorded (measurements.school_id = A) for an athlete of both schools only
-- while A's approval of B is in force and the athlete's
-- 'share_results_with_school' authorization is in force. Read online only:
-- nothing here is synced. All users and data are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Users: admin A, admin B, coach B (assigned to e1), guardian G (of e1 and e2,
-- no school role), N with no relations, admin C, coach B2 (of B, not assigned).
insert into auth.users (id, email) values
  ('06800000-0000-4000-8000-0000000000a1', 'admin-a@example.test'),
  ('06800000-0000-4000-8000-0000000000a2', 'admin-b@example.test'),
  ('06800000-0000-4000-8000-0000000000a3', 'coach-b@example.test'),
  ('06800000-0000-4000-8000-0000000000a4', 'guardian-g@example.test'),
  ('06800000-0000-4000-8000-0000000000a5', 'no-relation-n@example.test'),
  ('06800000-0000-4000-8000-0000000000a6', 'admin-c@example.test'),
  ('06800000-0000-4000-8000-0000000000a7', 'coach-b2@example.test');

insert into public.schools (id, name) values
  ('06800000-0000-4000-8000-0000000000b1', 'Results School A'),
  ('06800000-0000-4000-8000-0000000000b2', 'Results School B'),
  ('06800000-0000-4000-8000-0000000000b3', 'Results School C');

insert into public.school_memberships (school_id, user_id, role) values
  ('06800000-0000-4000-8000-0000000000b1', '06800000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('06800000-0000-4000-8000-0000000000b2', '06800000-0000-4000-8000-0000000000a2', 'school_admin'),
  ('06800000-0000-4000-8000-0000000000b2', '06800000-0000-4000-8000-0000000000a3', 'coach'),
  ('06800000-0000-4000-8000-0000000000b3', '06800000-0000-4000-8000-0000000000a6', 'school_admin'),
  ('06800000-0000-4000-8000-0000000000b2', '06800000-0000-4000-8000-0000000000a7', 'coach');

-- e1: A, B and C, authorized to share. e2: A and B, not authorized to share.
insert into public.athletes (id, first_name, last_name) values
  ('06800000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('06800000-0000-4000-8000-0000000000e2', 'Athlete', 'E2');

insert into public.athlete_schools (athlete_id, school_id) values
  ('06800000-0000-4000-8000-0000000000e1', '06800000-0000-4000-8000-0000000000b1'),
  ('06800000-0000-4000-8000-0000000000e1', '06800000-0000-4000-8000-0000000000b2'),
  ('06800000-0000-4000-8000-0000000000e1', '06800000-0000-4000-8000-0000000000b3'),
  ('06800000-0000-4000-8000-0000000000e2', '06800000-0000-4000-8000-0000000000b1'),
  ('06800000-0000-4000-8000-0000000000e2', '06800000-0000-4000-8000-0000000000b2');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('06800000-0000-4000-8000-0000000000a4', '06800000-0000-4000-8000-0000000000e1', 'guardian'),
  ('06800000-0000-4000-8000-0000000000a4', '06800000-0000-4000-8000-0000000000e2', 'guardian');

insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values
  ('06800000-0000-4000-8000-0000000000a3', '06800000-0000-4000-8000-0000000000e1');

insert into public.authorization_texts (id, purpose, version, language, body) values
  ('06800000-0000-4000-8000-0000000000f1', 'share_results_with_school', 1, 'en-US', 'Synthetic sharing text v1'),
  ('06800000-0000-4000-8000-0000000000f2', 'record_times', 1, 'en-US', 'Synthetic record text v1');

insert into public.authorizations (id, user_id, athlete_id, purpose, text_id, accepted_at) values
  ('06800000-0000-4000-8000-0000000000c1', '06800000-0000-4000-8000-0000000000a4', '06800000-0000-4000-8000-0000000000e1', 'share_results_with_school', '06800000-0000-4000-8000-0000000000f1', '2026-10-01 08:00:00+00'),
  ('06800000-0000-4000-8000-0000000000c2', '06800000-0000-4000-8000-0000000000a4', '06800000-0000-4000-8000-0000000000e1', 'record_times', '06800000-0000-4000-8000-0000000000f2', '2026-10-01 08:00:00+00');

-- The record_times withdrawal of 2026-10-10 hides what e1 swam after it.
update public.authorizations set withdrawn_at = '2026-10-10 08:00:00+00' where id = '06800000-0000-4000-8000-0000000000c2';

-- d1: A's race of e1, the only row B may see. d2: A's split of e1. d3: A's
-- repetition of e1 after the withdrawal (hidden). d4: B's own race of e1.
-- d5: C's race of e1. d6: A's race of e2.
insert into public.measurements
  (id, kind, athlete_id, school_id, hundredths, stroke, distance, pool, session_type, source,
   device_id, created_by, captured_at, parent_id, arrival_position)
values
  ('06800000-0000-4000-8000-0000000000d1', 'race', '06800000-0000-4000-8000-0000000000e1', '06800000-0000-4000-8000-0000000000b1', 3482, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch',
   'device-a', '06800000-0000-4000-8000-0000000000a1', '2026-10-05 08:00:00+00', null, null),
  ('06800000-0000-4000-8000-0000000000d2', 'split', '06800000-0000-4000-8000-0000000000e1', '06800000-0000-4000-8000-0000000000b1', 1650, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch',
   'device-a', '06800000-0000-4000-8000-0000000000a1', '2026-10-05 08:00:00+00', '06800000-0000-4000-8000-0000000000d1', null),
  ('06800000-0000-4000-8000-0000000000d3', 'repetition', '06800000-0000-4000-8000-0000000000e1', '06800000-0000-4000-8000-0000000000b1', 3600, 'FR', '50m', 'SCM', 'training', 'screen_button',
   'device-a', '06800000-0000-4000-8000-0000000000a1', '2026-10-12 08:00:00+00', null, 1),
  ('06800000-0000-4000-8000-0000000000d4', 'race', '06800000-0000-4000-8000-0000000000e1', '06800000-0000-4000-8000-0000000000b2', 3500, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch',
   'device-b', '06800000-0000-4000-8000-0000000000a3', '2026-10-06 08:00:00+00', null, null),
  ('06800000-0000-4000-8000-0000000000d5', 'race', '06800000-0000-4000-8000-0000000000e1', '06800000-0000-4000-8000-0000000000b3', 3510, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch',
   'device-c', '06800000-0000-4000-8000-0000000000a6', '2026-10-07 08:00:00+00', null, null),
  ('06800000-0000-4000-8000-0000000000d6', 'race', '06800000-0000-4000-8000-0000000000e2', '06800000-0000-4000-8000-0000000000b1', 3700, 'FR', '50m', 'SCM', 'competition', 'screen_stopwatch',
   'device-a', '06800000-0000-4000-8000-0000000000a1', '2026-10-05 09:00:00+00', null, null);

select is((select hidden from public.measurements where id = '06800000-0000-4000-8000-0000000000d3'), true,
  'fixture: d3 is hidden by the record_times withdrawal');
-- Schema
select is(
  (select array_agg(u.name order by u.i)
   from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as u(name, mode, i)
   where p.oid = to_regprocedure('public.other_school_results(uuid)') and u.mode = 't'),
  array['id', 'kind', 'hundredths', 'stroke', 'distance', 'pool', 'session_type', 'captured_at', 'arrival_position'],
  'other_school_results returns result columns only: no school, author, device, birth date or document');
select is((select prosecdef from pg_proc where oid = to_regprocedure('public.other_school_results(uuid)')), true,
  'other_school_results runs as its owner');

set local role anon;
select throws_ok($$ select * from public.other_school_results('06800000-0000-4000-8000-0000000000e1') $$,
  '42501', null, 'anon cannot read other-school results');

-- Pending: B asks from e1 (so A and C get a request), nobody approved.
set local role authenticated;
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(public.request_result_sharing('06800000-0000-4000-8000-0000000000e1', '06800000-0000-4000-8000-0000000000b2'), 2, 'admin B asks A and C');
select is_empty($$ select * from public.other_school_results('06800000-0000-4000-8000-0000000000e1') $$, 'without A''s approval admin B gets nothing');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.approve_result_sharing((select id from public.school_result_sharing where school_id = '06800000-0000-4000-8000-0000000000b1' and target_school_id = '06800000-0000-4000-8000-0000000000b2' and withdrawn_at is null)) $$, 'admin A approves B');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select results_eq(
  $$ select id, kind, hundredths, stroke, distance, pool, session_type, captured_at, arrival_position
     from public.other_school_results('06800000-0000-4000-8000-0000000000e1') $$,
  $$ values ('06800000-0000-4000-8000-0000000000d1'::uuid, 'race'::text, 3482, 'FR'::text, '50m'::text, 'SCM'::text, 'competition'::text,
             '2026-10-05 08:00:00+00'::timestamptz, null::int) $$,
  'approved and authorized: admin B gets exactly the race of A, not its split, its hidden row, B''s own or C''s');
select is_empty($$ select * from public.other_school_results('06800000-0000-4000-8000-0000000000e2') $$, 'without the athlete''s sharing authorization admin B gets nothing (e2)');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select results_eq($$ select id from public.other_school_results('06800000-0000-4000-8000-0000000000e1') $$, $$ values ('06800000-0000-4000-8000-0000000000d1'::uuid) $$, 'coach B assigned to e1 gets the race of A');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select is_empty($$ select * from public.other_school_results('06800000-0000-4000-8000-0000000000e1') $$, 'coach B2 not assigned to e1 gets nothing');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is_empty($$ select * from public.other_school_results('06800000-0000-4000-8000-0000000000e1') $$, 'guardian G, with no role in B, gets nothing');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is_empty($$ select * from public.other_school_results('06800000-0000-4000-8000-0000000000e1') $$, 'a user with no relations gets nothing');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is_empty($$ select * from public.other_school_results('06800000-0000-4000-8000-0000000000e1') $$, 'admin C, third school never approved, gets nothing');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is_empty($$ select * from public.other_school_results('06800000-0000-4000-8000-0000000000e1') $$, 'admin A gets nothing: the results are its own');
select lives_ok($$ select public.withdraw_result_sharing((select id from public.school_result_sharing where school_id = '06800000-0000-4000-8000-0000000000b1' and target_school_id = '06800000-0000-4000-8000-0000000000b2' and withdrawn_at is null)) $$, 'admin A withdraws the approval of B');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty($$ select * from public.other_school_results('06800000-0000-4000-8000-0000000000e1') $$, 'after A withdrew, admin B gets nothing');
select is(public.request_result_sharing('06800000-0000-4000-8000-0000000000e1', '06800000-0000-4000-8000-0000000000b2'), 1, 'admin B asks A again');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok($$ select public.approve_result_sharing((select id from public.school_result_sharing where school_id = '06800000-0000-4000-8000-0000000000b1' and target_school_id = '06800000-0000-4000-8000-0000000000b2' and withdrawn_at is null)) $$, 'admin A approves B again');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select results_eq($$ select id from public.other_school_results('06800000-0000-4000-8000-0000000000e1') $$, $$ values ('06800000-0000-4000-8000-0000000000d1'::uuid) $$, 'approved again: admin B gets the race of A again');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select lives_ok($$ update public.authorizations set withdrawn_at = now() where id = '06800000-0000-4000-8000-0000000000c1' $$, 'guardian G withdraws the sharing authorization');
select isnt((select withdrawal_received_at from public.authorizations where id = '06800000-0000-4000-8000-0000000000c1'), null, 'the server recorded the withdrawal');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty($$ select * from public.other_school_results('06800000-0000-4000-8000-0000000000e1') $$, 'after the guardian withdrew, admin B gets nothing');
set local request.jwt.claims = '{"sub": "06800000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is_empty($$ select * from public.other_school_results('06800000-0000-4000-8000-0000000000e1') $$, 'after the guardian withdrew, coach B gets nothing');
select * from finish();
rollback;
