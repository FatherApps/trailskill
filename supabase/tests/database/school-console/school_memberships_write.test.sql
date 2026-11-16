-- Writing school_memberships (issue #1092): nobody inserts or deletes a membership
-- through RLS (accept_coach_invitations() is the only way in), and an admin of the
-- school or the platform admin only deactivates a coach: every column except
-- deactivated_at stays as it is for a signed-in user. The database owner can still
-- fix rows by hand.
-- Users: admin A of school A, admin B of school B, coach C (coach of A), guardian G
-- of athlete X, N with no relations, invited I (pending coach invitation to A),
-- platform admin P, coach C2 of B and admin A2 of A. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (id, email, email_confirmed_at) values
  ('10920000-0000-4000-8000-0000000000a1', 'admin-a@example.test', now()),
  ('10920000-0000-4000-8000-0000000000a2', 'admin-b@example.test', now()),
  ('10920000-0000-4000-8000-0000000000a3', 'coach-c@example.test', now()),
  ('10920000-0000-4000-8000-0000000000a4', 'guardian-g@example.test', now()),
  ('10920000-0000-4000-8000-0000000000a5', 'nobody-n@example.test', now()),
  ('10920000-0000-4000-8000-0000000000a6', 'invited-i@example.test', now()),
  ('10920000-0000-4000-8000-0000000000a7', 'platform-admin-p@example.test', now()),
  ('10920000-0000-4000-8000-0000000000a8', 'coach-c2@example.test', now()),
  ('10920000-0000-4000-8000-0000000000a9', 'admin-a2@example.test', now());
insert into public.platform_admins (user_id) values ('10920000-0000-4000-8000-0000000000a7');
insert into public.schools (id, name) values
  ('10920000-0000-4000-8000-0000000000b1', 'Memberships School A'),
  ('10920000-0000-4000-8000-0000000000b2', 'Memberships School B');
-- d1 is C's coach membership in A, d2 is C2's in B, d3 admin A's own, d4 admin B's
-- own, d5 admin A2's own in A.
insert into public.school_memberships (id, school_id, user_id, role) values
  ('10920000-0000-4000-8000-0000000000d1', '10920000-0000-4000-8000-0000000000b1', '10920000-0000-4000-8000-0000000000a3', 'coach'),
  ('10920000-0000-4000-8000-0000000000d2', '10920000-0000-4000-8000-0000000000b2', '10920000-0000-4000-8000-0000000000a8', 'coach'),
  ('10920000-0000-4000-8000-0000000000d3', '10920000-0000-4000-8000-0000000000b1', '10920000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('10920000-0000-4000-8000-0000000000d4', '10920000-0000-4000-8000-0000000000b2', '10920000-0000-4000-8000-0000000000a2', 'school_admin'),
  ('10920000-0000-4000-8000-0000000000d5', '10920000-0000-4000-8000-0000000000b1', '10920000-0000-4000-8000-0000000000a9', 'school_admin');
insert into public.athletes (id, first_name, last_name) values
  ('10920000-0000-4000-8000-0000000000e1', 'Athlete', 'X');
insert into public.athlete_schools (athlete_id, school_id) values
  ('10920000-0000-4000-8000-0000000000e1', '10920000-0000-4000-8000-0000000000b1');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('10920000-0000-4000-8000-0000000000a4', '10920000-0000-4000-8000-0000000000e1', 'guardian');
insert into public.coach_invitations (id, created_by, school_id, email) values
  ('10920000-0000-4000-8000-0000000000c1', '10920000-0000-4000-8000-0000000000a1', '10920000-0000-4000-8000-0000000000b1', 'invited-i@example.test');

select policies_are(
  'public', 'school_memberships',
  array['school_memberships_select', 'school_memberships_deactivate'],
  'school_memberships has a select policy and the deactivate policy, no insert or delete');
select policy_cmd_is(
  'public', 'school_memberships', 'school_memberships_deactivate', 'update',
  'the deactivate policy only applies to update');

-- No signed-in user creates a membership through RLS.
set local role authenticated;
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$insert into public.school_memberships (school_id, user_id, role)
    values ('10920000-0000-4000-8000-0000000000b1', '10920000-0000-4000-8000-0000000000a5', 'coach')$$,
  '42501', null, 'admin A cannot insert a coach membership for N in A');
select throws_ok(
  $$insert into public.school_memberships (school_id, user_id, role)
    values ('10920000-0000-4000-8000-0000000000b1', '10920000-0000-4000-8000-0000000000a5', 'school_admin')$$,
  '42501', null, 'admin A cannot insert a school_admin membership for N in A');
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select throws_ok(
  $$insert into public.school_memberships (school_id, user_id, role)
    values ('10920000-0000-4000-8000-0000000000b1', '10920000-0000-4000-8000-0000000000a5', 'coach')$$,
  '42501', null, 'the platform admin cannot insert a coach membership for N in A');
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$insert into public.school_memberships (school_id, user_id, role)
    values ('10920000-0000-4000-8000-0000000000b2', '10920000-0000-4000-8000-0000000000a3', 'coach')$$,
  '42501', null, 'coach C cannot insert a coach membership for self in B');
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok(
  $$insert into public.school_memberships (school_id, user_id, role)
    values ('10920000-0000-4000-8000-0000000000b1', '10920000-0000-4000-8000-0000000000a4', 'coach')$$,
  '42501', null, 'guardian G cannot insert a coach membership for self in A');
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select throws_ok(
  $$insert into public.school_memberships (school_id, user_id, role)
    values ('10920000-0000-4000-8000-0000000000b1', '10920000-0000-4000-8000-0000000000a6', 'coach')$$,
  '42501', null, 'invited I cannot insert their own coach membership in A');

-- No signed-in user deletes a membership through RLS.
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
with d as (delete from public.school_memberships where id = '10920000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from d), 0, 'admin A cannot delete the coach membership d1');
with d as (delete from public.school_memberships where id = '10920000-0000-4000-8000-0000000000d5' returning 1)
select is((select count(*)::int from d), 0, 'admin A cannot delete the membership of admin A2');
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
with d as (delete from public.school_memberships where id = '10920000-0000-4000-8000-0000000000d2' returning 1)
select is((select count(*)::int from d), 0, 'the platform admin cannot delete the membership d2');
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
with d as (delete from public.school_memberships where id = '10920000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from d), 0, 'coach C cannot delete their own membership d1');

-- An admin cannot change anything but deactivated_at.
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$update public.school_memberships set role = 'school_admin' where id = '10920000-0000-4000-8000-0000000000d1'$$,
  '42501', null, 'admin A cannot promote the coach d1 to school_admin');
select throws_ok(
  $$update public.school_memberships set user_id = '10920000-0000-4000-8000-0000000000a5' where id = '10920000-0000-4000-8000-0000000000d1'$$,
  '42501', 'only deactivated_at can change in a school membership', 'admin A cannot give d1 to another user');
select throws_ok(
  $$update public.school_memberships set school_id = '10920000-0000-4000-8000-0000000000b2' where id = '10920000-0000-4000-8000-0000000000d1'$$,
  '42501', null, 'admin A cannot move d1 to school B');
with u as (update public.school_memberships set role = 'coach' where id = '10920000-0000-4000-8000-0000000000d5' returning 1)
select is((select count(*)::int from u), 0, 'admin A cannot demote admin A2: only coach memberships are reachable');
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select throws_ok(
  $$update public.school_memberships set user_id = '10920000-0000-4000-8000-0000000000a5' where id = '10920000-0000-4000-8000-0000000000d2'$$,
  '42501', 'only deactivated_at can change in a school membership', 'the platform admin cannot give d2 to another user');

reset role;
select results_eq(
  $$select school_id, user_id, role from public.school_memberships where id = '10920000-0000-4000-8000-0000000000d1'$$,
  $$values ('10920000-0000-4000-8000-0000000000b1'::uuid, '10920000-0000-4000-8000-0000000000a3'::uuid, 'coach'::text)$$,
  'd1 is unchanged after the rejected attempts');
select is(
  (select count(*)::int from public.school_memberships
    where school_id in ('10920000-0000-4000-8000-0000000000b1', '10920000-0000-4000-8000-0000000000b2')),
  5, 'no membership was created or deleted');

-- Deactivating a coach still works, only for an admin of the school or P.
set local role authenticated;
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
with u as (update public.school_memberships set deactivated_at = now() where id = '10920000-0000-4000-8000-0000000000d2' returning 1)
select is((select count(*)::int from u), 0, 'admin A cannot deactivate a coach of school B');
with u as (update public.school_memberships set deactivated_at = now() where id = '10920000-0000-4000-8000-0000000000d5' returning 1)
select is((select count(*)::int from u), 0, 'admin A cannot deactivate another admin');
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
with u as (update public.school_memberships set deactivated_at = now() where id = '10920000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from u), 0, 'coach C cannot deactivate themselves');
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
with u as (update public.school_memberships set deactivated_at = now() where id = '10920000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from u), 0, 'guardian G cannot deactivate C');
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
with u as (update public.school_memberships set deactivated_at = '2000-01-01 00:00:00+00' where id = '10920000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from u), 1, 'admin A deactivates C in A');
select is(
  (select deactivated_at from public.school_memberships where id = '10920000-0000-4000-8000-0000000000d1'),
  now(), 'the server stamps the time, not the device');
with u as (update public.school_memberships set deactivated_at = '2001-01-01 00:00:00+00' where id = '10920000-0000-4000-8000-0000000000d1' returning deactivated_at)
select is((select deactivated_at from u), now(), 'repeating the deactivation keeps the first stamp');
select throws_ok(
  $$update public.school_memberships set deactivated_at = null where id = '10920000-0000-4000-8000-0000000000d1'$$,
  '42501', 'a deactivated coach cannot be reactivated', 'a deactivated coach cannot be reactivated');
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
with u as (update public.school_memberships set deactivated_at = now() where id = '10920000-0000-4000-8000-0000000000d2' returning 1)
select is((select count(*)::int from u), 1, 'the platform admin deactivates C2 in B');

-- The only way in: the invited user accepts their invitation.
set local request.jwt.claims = '{"sub": "10920000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is(public.accept_coach_invitations(), 1, 'invited I accepts the pending invitation');
select is(
  (select count(*)::int from public.school_memberships
    where school_id = '10920000-0000-4000-8000-0000000000b1'
      and user_id = '10920000-0000-4000-8000-0000000000a6' and role = 'coach'),
  1, 'accepting the invitation created the coach membership of I in A');

-- Anonymous.
reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok(
  $$insert into public.school_memberships (school_id, user_id, role)
    values ('10920000-0000-4000-8000-0000000000b1', '10920000-0000-4000-8000-0000000000a5', 'coach')$$,
  '42501', null, 'an anonymous user cannot insert a coach membership for N in A');

-- The database owner (no auth.uid()) can still fix a row by hand.
reset role;
select set_config('request.jwt.claims', '', true);
select lives_ok(
  $$update public.school_memberships set role = 'coach' where id = '10920000-0000-4000-8000-0000000000d4'$$,
  'the database owner can still change the role of a membership');

select * from finish();
rollback;
