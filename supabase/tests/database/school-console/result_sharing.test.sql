-- Sharing results between schools (issue #268): school B asks, from an athlete
-- it shares with school A, to see A's results; only an admin of A approves or
-- withdraws. Rows are never deleted and their evidence never changes. All users
-- and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(99);

-- Users: admin A, admin B, coach A, coach B, guardian G (of e1), adult D (self
-- of e2), N with no relations and admin C (of school C).
insert into auth.users (id, email) values
  ('26800000-0000-4000-8000-0000000000a1', 'admin-a@example.test'),
  ('26800000-0000-4000-8000-0000000000a2', 'admin-b@example.test'),
  ('26800000-0000-4000-8000-0000000000a3', 'coach-a@example.test'),
  ('26800000-0000-4000-8000-0000000000a4', 'coach-b@example.test'),
  ('26800000-0000-4000-8000-0000000000a5', 'guardian-g@example.test'),
  ('26800000-0000-4000-8000-0000000000a6', 'adult-d@example.test'),
  ('26800000-0000-4000-8000-0000000000a7', 'no-relation-n@example.test'),
  ('26800000-0000-4000-8000-0000000000a8', 'admin-c@example.test');

insert into public.schools (id, name) values
  ('26800000-0000-4000-8000-0000000000b1', 'Sharing School A'),
  ('26800000-0000-4000-8000-0000000000b2', 'Sharing School B'),
  ('26800000-0000-4000-8000-0000000000b3', 'Sharing School C');

insert into public.school_memberships (school_id, user_id, role) values
  ('26800000-0000-4000-8000-0000000000b1', '26800000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('26800000-0000-4000-8000-0000000000b2', '26800000-0000-4000-8000-0000000000a2', 'school_admin'),
  ('26800000-0000-4000-8000-0000000000b1', '26800000-0000-4000-8000-0000000000a3', 'coach'),
  ('26800000-0000-4000-8000-0000000000b2', '26800000-0000-4000-8000-0000000000a4', 'coach'),
  ('26800000-0000-4000-8000-0000000000b3', '26800000-0000-4000-8000-0000000000a8', 'school_admin');

-- e1: A and B. e2: A, B and C. e3: only B. e4: only A.
insert into public.athletes (id, first_name, last_name) values
  ('26800000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('26800000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('26800000-0000-4000-8000-0000000000e3', 'Athlete', 'E3'),
  ('26800000-0000-4000-8000-0000000000e4', 'Athlete', 'E4');

insert into public.athlete_schools (athlete_id, school_id) values
  ('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b1'),
  ('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2'),
  ('26800000-0000-4000-8000-0000000000e2', '26800000-0000-4000-8000-0000000000b1'),
  ('26800000-0000-4000-8000-0000000000e2', '26800000-0000-4000-8000-0000000000b2'),
  ('26800000-0000-4000-8000-0000000000e2', '26800000-0000-4000-8000-0000000000b3'),
  ('26800000-0000-4000-8000-0000000000e3', '26800000-0000-4000-8000-0000000000b2'),
  ('26800000-0000-4000-8000-0000000000e4', '26800000-0000-4000-8000-0000000000b1');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('26800000-0000-4000-8000-0000000000a5', '26800000-0000-4000-8000-0000000000e1', 'guardian'),
  ('26800000-0000-4000-8000-0000000000a6', '26800000-0000-4000-8000-0000000000e2', 'self');

insert into public.authorization_texts (id, purpose, version, language, body) values
  ('26800000-0000-4000-8000-0000000000f1', 'share_results_with_school', 1, 'en-US', 'Synthetic sharing text v1');

-- Schema
select has_table('public', 'school_result_sharing', 'school_result_sharing exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.school_result_sharing'::regclass),
  true,
  'row level security is on for school_result_sharing'
);
select is_empty(
  $$ select 1 from pg_publication_tables
     where pubname = 'powersync' and schemaname = 'public' and tablename = 'school_result_sharing' $$,
  'school_result_sharing is not synced: it is read online only'
);
-- to_regprocedure, not a cast, so a missing function fails here instead of aborting.
select is(
  (select array_agg(u.name order by u.i)
   from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as u(name, mode, i)
   where p.oid = to_regprocedure('public.result_sharing_status(uuid, uuid)') and u.mode = 't'),
  array['pending', 'approved'],
  'result_sharing_status returns only the counts pending and approved, no ids'
);

-- anon
set local role anon;

select throws_ok(
  $$ select public.request_result_sharing('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'anon cannot request result sharing'
);
select throws_ok(
  $$ select * from public.school_result_sharing $$,
  '42501', null,
  'anon cannot read result sharing'
);
select throws_ok(
  $$ select * from public.result_sharing_requests('26800000-0000-4000-8000-0000000000b1') $$,
  '42501', null,
  'anon cannot list result sharing requests'
);
select throws_ok(
  $$ select * from public.result_sharing_status('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'anon cannot read the result sharing status'
);

-- Requests
set local role authenticated;

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select throws_ok(
  $$ select public.request_result_sharing('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'a user with no relations cannot request result sharing'
);
select throws_ok(
  $$ select * from public.result_sharing_status('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'a user with no relations cannot read the result sharing status'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok(
  $$ select public.request_result_sharing('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'coach B cannot request result sharing for B'
);
select throws_ok(
  $$ select * from public.result_sharing_status('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'coach B cannot read the result sharing status of B'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$ select public.request_result_sharing('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b1') $$,
  '42501', null,
  'coach A cannot request result sharing for A'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select throws_ok(
  $$ select public.request_result_sharing('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'guardian G cannot request result sharing'
);
select throws_ok(
  $$ select * from public.result_sharing_status('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'guardian G cannot read the result sharing status'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select throws_ok(
  $$ select public.request_result_sharing('26800000-0000-4000-8000-0000000000e2', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'adult D cannot request result sharing'
);
select throws_ok(
  $$ select * from public.result_sharing_status('26800000-0000-4000-8000-0000000000e2', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'adult D cannot read the result sharing status'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.request_result_sharing('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'admin A cannot request result sharing for school B'
);
select throws_ok(
  $$ select * from public.result_sharing_status('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'admin A cannot read the result sharing status of school B'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ select public.request_result_sharing('26800000-0000-4000-8000-0000000000e4', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'admin B cannot request from an athlete that is not in B'
);
select throws_ok(
  $$ select * from public.result_sharing_status('26800000-0000-4000-8000-0000000000e4', '26800000-0000-4000-8000-0000000000b2') $$,
  '42501', null,
  'admin B cannot read the status of an athlete that is not in B'
);
select throws_ok(
  $$ insert into public.school_result_sharing (school_id, target_school_id, athlete_id)
     values ('26800000-0000-4000-8000-0000000000b1', '26800000-0000-4000-8000-0000000000b2',
             '26800000-0000-4000-8000-0000000000e1') $$,
  '42501', null,
  'admin B cannot insert a request directly'
);
select is(
  public.request_result_sharing('26800000-0000-4000-8000-0000000000e3', '26800000-0000-4000-8000-0000000000b2'),
  0,
  'an athlete only in B creates no request'
);
select is(
  public.request_result_sharing('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2'),
  1,
  'admin B requests from e1: one request to A'
);
select is(
  public.request_result_sharing('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2'),
  0,
  'asking again from e1 creates no duplicate'
);
select is(
  public.request_result_sharing('26800000-0000-4000-8000-0000000000e2', '26800000-0000-4000-8000-0000000000b2'),
  1,
  'asking from e2 creates only the request to C'
);
select is_empty(
  $$ select school_id from public.school_result_sharing $$,
  'right after its own requests admin B reads no school of them'
);
select results_eq(
  $$ select * from public.result_sharing_status('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2') $$,
  $$ values (1, 0) $$,
  'admin B sees one pending request for e1'
);
select results_eq(
  $$ select * from public.result_sharing_status('26800000-0000-4000-8000-0000000000e2', '26800000-0000-4000-8000-0000000000b2') $$,
  $$ values (2, 0) $$,
  'admin B sees two pending requests for e2, from A and C'
);
select results_eq(
  $$ select * from public.result_sharing_status('26800000-0000-4000-8000-0000000000e3', '26800000-0000-4000-8000-0000000000b2') $$,
  $$ values (0, 0) $$,
  'admin B gets one row of zeros for an athlete only in B'
);

reset role;
select results_eq(
  $$ select requested_by, athlete_id, approved_by, approved_at, withdrawn_by, withdrawn_at,
            requested_at is not null
     from public.school_result_sharing
     where school_id = '26800000-0000-4000-8000-0000000000b1'
       and target_school_id = '26800000-0000-4000-8000-0000000000b2' $$,
  $$ values ('26800000-0000-4000-8000-0000000000a2'::uuid, '26800000-0000-4000-8000-0000000000e1'::uuid,
             null::uuid, null::timestamptz, null::uuid, null::timestamptz, true) $$,
  'the request records admin B, e1 and the server time, and is born pending'
);

-- Read
set local role authenticated;

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is((select count(*)::int from public.school_result_sharing), 0, 'admin B reads no request, not even its own');

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is((select count(*)::int from public.school_result_sharing), 1, 'admin A reads only the request to A');
select results_eq(
  $$ select requested_by, athlete_id from public.school_result_sharing $$,
  $$ values ('26800000-0000-4000-8000-0000000000a2'::uuid, '26800000-0000-4000-8000-0000000000e1'::uuid) $$,
  'admin A still sees who asked and for which athlete, under RLS'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is((select count(*)::int from public.school_result_sharing), 0, 'coach A reads no request');

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is((select count(*)::int from public.school_result_sharing), 0, 'coach B reads no request');

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is((select count(*)::int from public.school_result_sharing), 0, 'guardian G reads no request');

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is((select count(*)::int from public.school_result_sharing), 0, 'adult D reads no request');

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select is((select count(*)::int from public.school_result_sharing), 0, 'a user with no relations reads no request');

-- List
set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select results_eq(
  $$ select target_school_name, approved_at
     from public.result_sharing_requests('26800000-0000-4000-8000-0000000000b1') $$,
  $$ values ('Sharing School B'::text, null::timestamptz) $$,
  'admin A lists the pending request with the name of school B'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty(
  $$ select * from public.result_sharing_requests('26800000-0000-4000-8000-0000000000b1') $$,
  'admin B lists nothing for school A'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is_empty(
  $$ select * from public.result_sharing_requests('26800000-0000-4000-8000-0000000000b1') $$,
  'coach A lists nothing for school A'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is_empty(
  $$ select * from public.result_sharing_requests('26800000-0000-4000-8000-0000000000b1') $$,
  'coach B lists nothing for school A'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is_empty(
  $$ select * from public.result_sharing_requests('26800000-0000-4000-8000-0000000000b1') $$,
  'guardian G lists nothing for school A'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is_empty(
  $$ select * from public.result_sharing_requests('26800000-0000-4000-8000-0000000000b1') $$,
  'adult D lists nothing for school A'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select is_empty(
  $$ select * from public.result_sharing_requests('26800000-0000-4000-8000-0000000000b1') $$,
  'a user with no relations lists nothing for school A'
);

-- Approve. The id of the A->B request travels in a transaction setting, which
-- every role can read.
reset role;
select set_config(
  'test.sharing_ab',
  (select id::text from public.school_result_sharing
   where school_id = '26800000-0000-4000-8000-0000000000b1'
     and target_school_id = '26800000-0000-4000-8000-0000000000b2'),
  true
);

set local role anon;
select throws_ok(
  $$ select public.approve_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '42501', null,
  'anon cannot approve'
);

set local role authenticated;

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ select public.approve_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '42501', null,
  'admin B cannot approve its own request'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$ select public.approve_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '42501', null,
  'coach A cannot approve'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok(
  $$ select public.approve_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '42501', null,
  'coach B cannot approve'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select throws_ok(
  $$ select public.approve_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '42501', null,
  'guardian G cannot approve'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select throws_ok(
  $$ select public.approve_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '42501', null,
  'adult D cannot approve'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select throws_ok(
  $$ select public.approve_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '42501', null,
  'a user with no relations cannot approve'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ update public.school_result_sharing set approved_at = now()
     where id = current_setting('test.sharing_ab')::uuid $$,
  '42501', null,
  'admin A cannot approve by a direct update'
);
select lives_ok(
  $$ select public.approve_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  'admin A approves the request'
);

reset role;
select results_eq(
  $$ select approved_by, approved_at is not null from public.school_result_sharing
     where id = current_setting('test.sharing_ab')::uuid $$,
  $$ values ('26800000-0000-4000-8000-0000000000a1'::uuid, true) $$,
  'the approval records admin A and its time'
);
select set_config(
  'test.first_approved_at',
  (select approved_at::text from public.school_result_sharing where id = current_setting('test.sharing_ab')::uuid),
  true
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.approve_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  'approving again is a no-op'
);

reset role;
select is(
  (select approved_at from public.school_result_sharing where id = current_setting('test.sharing_ab')::uuid),
  current_setting('test.first_approved_at')::timestamptz,
  'approving again keeps the first approval time'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  public.request_result_sharing('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2'),
  0,
  'an approved request in force is not duplicated'
);
select results_eq(
  $$ select * from public.result_sharing_status('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2') $$,
  $$ values (0, 1) $$,
  'admin B sees the approval for e1'
);
select results_eq(
  $$ select * from public.result_sharing_status('26800000-0000-4000-8000-0000000000e2', '26800000-0000-4000-8000-0000000000b2') $$,
  $$ values (1, 1) $$,
  'admin B sees one pending and one approved request for e2'
);

-- Withdraw
select throws_ok(
  $$ select public.withdraw_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '42501', null,
  'admin B cannot withdraw'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$ select public.withdraw_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '42501', null,
  'coach A cannot withdraw'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select throws_ok(
  $$ select public.withdraw_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '42501', null,
  'guardian G cannot withdraw'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok(
  $$ select public.withdraw_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '42501', null,
  'coach B cannot withdraw'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select throws_ok(
  $$ select public.withdraw_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '42501', null,
  'adult D cannot withdraw'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select throws_ok(
  $$ select public.withdraw_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '42501', null,
  'a user with no relations cannot withdraw'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ delete from public.school_result_sharing where id = current_setting('test.sharing_ab')::uuid $$,
  '42501', null,
  'admin A cannot delete a request'
);
select lives_ok(
  $$ select public.withdraw_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  'admin A withdraws the approval'
);

reset role;
select results_eq(
  $$ select approved_by, approved_at = current_setting('test.first_approved_at')::timestamptz,
            withdrawn_by, withdrawn_at is not null
     from public.school_result_sharing where id = current_setting('test.sharing_ab')::uuid $$,
  $$ values ('26800000-0000-4000-8000-0000000000a1'::uuid, true,
             '26800000-0000-4000-8000-0000000000a1'::uuid, true) $$,
  'withdrawing keeps the approval evidence and records admin A and its time'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.withdraw_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  'withdrawing again is a no-op'
);
select throws_ok(
  $$ select public.approve_result_sharing(current_setting('test.sharing_ab')::uuid) $$,
  '55000', null,
  'a withdrawn request cannot be approved'
);
select is_empty(
  $$ select * from public.result_sharing_requests('26800000-0000-4000-8000-0000000000b1') $$,
  'a withdrawn request leaves the list of admin A'
);

-- Re-request
set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select results_eq(
  $$ select * from public.result_sharing_status('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2') $$,
  $$ values (0, 0) $$,
  'a withdrawn approval no longer counts for e1'
);
select is(
  public.request_result_sharing('26800000-0000-4000-8000-0000000000e1', '26800000-0000-4000-8000-0000000000b2'),
  1,
  'after a withdrawal admin B can ask again'
);

reset role;
select is(
  (select count(*)::int from public.school_result_sharing
   where school_id = '26800000-0000-4000-8000-0000000000b1'),
  2,
  'the withdrawn request stays next to the new one'
);

-- Owner: the evidence binds it too
select throws_ok(
  $$ delete from public.school_result_sharing where id = current_setting('test.sharing_ab')::uuid $$,
  '42501', null,
  'not even the owner deletes a request'
);
select throws_ok(
  $$ update public.school_result_sharing set target_school_id = '26800000-0000-4000-8000-0000000000b3'
     where id = current_setting('test.sharing_ab')::uuid $$,
  '42501', null,
  'not even the owner changes the schools of a request'
);
select throws_ok(
  $$ update public.school_result_sharing set withdrawn_at = now()
     where id = current_setting('test.sharing_ab')::uuid $$,
  '42501', null,
  'not even the owner changes a withdrawal'
);
select throws_ok(
  $$ update public.school_result_sharing set approved_by = null, approved_at = null
     where id = current_setting('test.sharing_ab')::uuid $$,
  '42501', null,
  'not even the owner erases an approval'
);
select throws_ok(
  $$ insert into public.school_result_sharing
       (school_id, target_school_id, athlete_id, approved_by, approved_at)
     values ('26800000-0000-4000-8000-0000000000b3', '26800000-0000-4000-8000-0000000000b1',
             '26800000-0000-4000-8000-0000000000e2', '26800000-0000-4000-8000-0000000000a1', now()) $$,
  '42501', null,
  'not even the owner inserts a request born approved'
);

-- Helper for #68
set local role authenticated;
set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select app.result_sharing_in_force('26800000-0000-4000-8000-0000000000b1',
       '26800000-0000-4000-8000-0000000000b2', '26800000-0000-4000-8000-0000000000e1') $$,
  '42501', null,
  'clients cannot call result_sharing_in_force'
);
select lives_ok(
  $$ select public.approve_result_sharing(id) from public.school_result_sharing
     where school_id = '26800000-0000-4000-8000-0000000000b1'
       and target_school_id = '26800000-0000-4000-8000-0000000000b2'
       and withdrawn_at is null $$,
  'admin A approves the new request'
);

reset role;
select is(
  app.result_sharing_in_force('26800000-0000-4000-8000-0000000000b1',
    '26800000-0000-4000-8000-0000000000b2', '26800000-0000-4000-8000-0000000000e1'),
  false,
  'no sharing without an authorization of the athlete'
);

-- e1 and e4 by guardian G, e2 by adult D: each check below fails for one reason only.
insert into public.authorizations (user_id, athlete_id, purpose, text_id, accepted_at) values
  ('26800000-0000-4000-8000-0000000000a5', '26800000-0000-4000-8000-0000000000e1',
   'share_results_with_school', '26800000-0000-4000-8000-0000000000f1', '2026-10-01 08:00:00+00'),
  ('26800000-0000-4000-8000-0000000000a5', '26800000-0000-4000-8000-0000000000e4',
   'share_results_with_school', '26800000-0000-4000-8000-0000000000f1', '2026-10-01 08:00:00+00'),
  ('26800000-0000-4000-8000-0000000000a6', '26800000-0000-4000-8000-0000000000e2',
   'share_results_with_school', '26800000-0000-4000-8000-0000000000f1', '2026-10-01 08:00:00+00');

select is(
  app.result_sharing_in_force('26800000-0000-4000-8000-0000000000b1',
    '26800000-0000-4000-8000-0000000000b2', '26800000-0000-4000-8000-0000000000e1'),
  true,
  'approved, athlete in both schools and authorized: in force'
);
select is(
  app.result_sharing_in_force('26800000-0000-4000-8000-0000000000b1',
    '26800000-0000-4000-8000-0000000000b2', '26800000-0000-4000-8000-0000000000e4'),
  false,
  'an athlete that is not in the target school is never shared'
);
select is(
  app.result_sharing_in_force('26800000-0000-4000-8000-0000000000b2',
    '26800000-0000-4000-8000-0000000000b1', '26800000-0000-4000-8000-0000000000e1'),
  false,
  'an approval shares one way only'
);
select is(
  app.result_sharing_in_force('26800000-0000-4000-8000-0000000000b3',
    '26800000-0000-4000-8000-0000000000b2', '26800000-0000-4000-8000-0000000000e2'),
  false,
  'a pending request shares nothing'
);

-- e3 has no manager: the owner records its authorization, so only the missing
-- membership in the source school can fail.
insert into public.authorizations (user_id, athlete_id, purpose, text_id, accepted_at) values
  ('26800000-0000-4000-8000-0000000000a5', '26800000-0000-4000-8000-0000000000e3',
   'share_results_with_school', '26800000-0000-4000-8000-0000000000f1', '2026-10-01 08:00:00+00');

select is(
  app.result_sharing_in_force('26800000-0000-4000-8000-0000000000b1',
    '26800000-0000-4000-8000-0000000000b2', '26800000-0000-4000-8000-0000000000e3'),
  false,
  'an athlete that is not in the source school is never shared'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select lives_ok(
  $$ update public.authorizations set withdrawn_at = clock_timestamp()
     where athlete_id = '26800000-0000-4000-8000-0000000000e1' and purpose = 'share_results_with_school' $$,
  'guardian G withdraws the authorization of e1'
);

reset role;
select is(
  app.result_sharing_in_force('26800000-0000-4000-8000-0000000000b1',
    '26800000-0000-4000-8000-0000000000b2', '26800000-0000-4000-8000-0000000000e1'),
  false,
  'a withdrawn authorization stops the sharing'
);

insert into public.authorizations (user_id, athlete_id, purpose, text_id, accepted_at) values
  ('26800000-0000-4000-8000-0000000000a5', '26800000-0000-4000-8000-0000000000e1',
   'share_results_with_school', '26800000-0000-4000-8000-0000000000f1', clock_timestamp());

select is(
  app.result_sharing_in_force('26800000-0000-4000-8000-0000000000b1',
    '26800000-0000-4000-8000-0000000000b2', '26800000-0000-4000-8000-0000000000e1'),
  true,
  'a new authorization after the withdrawal shares again'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.withdraw_result_sharing(id) from public.school_result_sharing
     where school_id = '26800000-0000-4000-8000-0000000000b1'
       and target_school_id = '26800000-0000-4000-8000-0000000000b2'
       and withdrawn_at is null $$,
  'admin A withdraws the new approval'
);

reset role;
select is(
  app.result_sharing_in_force('26800000-0000-4000-8000-0000000000b1',
    '26800000-0000-4000-8000-0000000000b2', '26800000-0000-4000-8000-0000000000e1'),
  false,
  'a withdrawn approval stops the sharing'
);

-- A declined (withdrawn while pending) request cannot be approved, not even by the owner.
select lives_ok(
  $$ update public.school_result_sharing set withdrawn_at = now()
     where school_id = '26800000-0000-4000-8000-0000000000b3'
       and target_school_id = '26800000-0000-4000-8000-0000000000b2' $$,
  'a pending request can be declined'
);
select throws_ok(
  $$ update public.school_result_sharing set approved_at = now()
     where school_id = '26800000-0000-4000-8000-0000000000b3'
       and target_school_id = '26800000-0000-4000-8000-0000000000b2' $$,
  '55000', null,
  'not even the owner approves a declined request'
);

-- Declining a pending request through the function: admin C declines C->B.
set local role authenticated;
set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  public.request_result_sharing('26800000-0000-4000-8000-0000000000e2', '26800000-0000-4000-8000-0000000000b2'),
  2,
  'admin B asks again from e2: new requests to A and C'
);

set local request.jwt.claims = '{"sub": "26800000-0000-4000-8000-0000000000a8", "role": "authenticated"}';
select lives_ok(
  $$ select public.withdraw_result_sharing(id) from public.school_result_sharing
     where school_id = '26800000-0000-4000-8000-0000000000b3'
       and target_school_id = '26800000-0000-4000-8000-0000000000b2'
       and withdrawn_at is null $$,
  'admin C declines the pending request through withdraw_result_sharing'
);

reset role;
select results_eq(
  $$ select approved_by, approved_at, withdrawn_by, withdrawn_at is not null
     from public.school_result_sharing
     where school_id = '26800000-0000-4000-8000-0000000000b3'
       and target_school_id = '26800000-0000-4000-8000-0000000000b2'
       and requested_at = (select max(requested_at) from public.school_result_sharing
                           where school_id = '26800000-0000-4000-8000-0000000000b3') $$,
  $$ values (null::uuid, null::timestamptz, '26800000-0000-4000-8000-0000000000a8'::uuid, true) $$,
  'a declined request is never approved and records admin C and its time'
);

select * from finish();
rollback;
