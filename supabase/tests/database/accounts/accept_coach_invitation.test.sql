-- A signed-in user accepts the coach invitations sent to the verified email of
-- their own account (issue #964). All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (id, email, email_confirmed_at) values
  ('96400000-0000-4000-8000-0000000000a0', 'admin-a@example.test', now()),
  ('96400000-0000-4000-8000-0000000000a1', 'Match@Example.test', now()),
  ('96400000-0000-4000-8000-0000000000a2', 'other@example.test', now()),
  ('96400000-0000-4000-8000-0000000000a3', 'unverified@example.test', null),
  ('96400000-0000-4000-8000-0000000000a4', 'expired@example.test', now()),
  ('96400000-0000-4000-8000-0000000000a5', 'used@example.test', now()),
  ('96400000-0000-4000-8000-0000000000a6', 'school-b@example.test', now()),
  ('96400000-0000-4000-8000-0000000000a7', 'deactivated@example.test', now());

insert into public.schools (id, name) values
  ('96400000-0000-4000-8000-0000000000b1', 'Accept School A'),
  ('96400000-0000-4000-8000-0000000000b2', 'Accept School B');

insert into public.school_memberships (school_id, user_id, role) values
  ('96400000-0000-4000-8000-0000000000b1', '96400000-0000-4000-8000-0000000000a0', 'school_admin');
insert into public.school_memberships (school_id, user_id, role, deactivated_at) values
  ('96400000-0000-4000-8000-0000000000b1', '96400000-0000-4000-8000-0000000000a7', 'coach', now());

insert into public.coach_invitations (id, created_by, school_id, email) values
  ('96400000-0000-4000-8000-0000000000c1', '96400000-0000-4000-8000-0000000000a0', '96400000-0000-4000-8000-0000000000b1', 'match@example.test'),
  ('96400000-0000-4000-8000-0000000000c2', '96400000-0000-4000-8000-0000000000a0', '96400000-0000-4000-8000-0000000000b1', 'someone-else@example.test'),
  ('96400000-0000-4000-8000-0000000000c3', '96400000-0000-4000-8000-0000000000a0', '96400000-0000-4000-8000-0000000000b1', 'unverified@example.test'),
  ('96400000-0000-4000-8000-0000000000c4', '96400000-0000-4000-8000-0000000000a0', '96400000-0000-4000-8000-0000000000b1', 'expired@example.test'),
  ('96400000-0000-4000-8000-0000000000c5', '96400000-0000-4000-8000-0000000000a0', '96400000-0000-4000-8000-0000000000b1', 'used@example.test'),
  ('96400000-0000-4000-8000-0000000000c6', '96400000-0000-4000-8000-0000000000a0', '96400000-0000-4000-8000-0000000000b2', 'school-b@example.test'),
  ('96400000-0000-4000-8000-0000000000c7', '96400000-0000-4000-8000-0000000000a0', '96400000-0000-4000-8000-0000000000b1', 'deactivated@example.test');

select cmp_ok((select expires_at from public.coach_invitations where id = '96400000-0000-4000-8000-0000000000c1'),
  '=', now() + interval '14 days', 'a new invitation expires 14 days after it was created');

update public.coach_invitations set expires_at = now() - interval '1 second' where id = '96400000-0000-4000-8000-0000000000c4';
update public.coach_invitations set status = 'accepted', accepted_at = now(), accepted_by = '96400000-0000-4000-8000-0000000000a0'
where id = '96400000-0000-4000-8000-0000000000c5';

-- Matching verified email (stored in another case): accepted once.
set local role authenticated;
set local request.jwt.claims = '{"sub": "96400000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(public.accept_coach_invitations(), 1, 'a matching verified email accepts its invitation');
reset role;
select is((select count(*)::int from public.school_memberships
   where user_id = '96400000-0000-4000-8000-0000000000a1' and school_id = '96400000-0000-4000-8000-0000000000b1' and role = 'coach'),
  1, 'the invited person is a coach of the school');
select is((select status from public.coach_invitations where id = '96400000-0000-4000-8000-0000000000c1'), 'accepted', 'the invitation is accepted');
select is((select accepted_by from public.coach_invitations where id = '96400000-0000-4000-8000-0000000000c1'),
  '96400000-0000-4000-8000-0000000000a1'::uuid, 'the invitation records who accepted it');
select isnt((select accepted_at from public.coach_invitations where id = '96400000-0000-4000-8000-0000000000c1'), null, 'the invitation records when it was accepted');

-- Repeating the acceptance does not duplicate the membership.
set local role authenticated;
set local request.jwt.claims = '{"sub": "96400000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(public.accept_coach_invitations(), 0, 'accepting again accepts nothing');
reset role;
select is((select count(*)::int from public.school_memberships where user_id = '96400000-0000-4000-8000-0000000000a1'), 1, 'accepting again does not duplicate the membership');

-- A different email.
set local role authenticated;
set local request.jwt.claims = '{"sub": "96400000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(public.accept_coach_invitations(), 0, 'a different email accepts nothing');
reset role;
select is_empty($$ select 1 from public.school_memberships where user_id = '96400000-0000-4000-8000-0000000000a2' $$, 'a different email gets no membership');
select is((select status from public.coach_invitations where id = '96400000-0000-4000-8000-0000000000c2'), 'pending', 'the invitation of another email stays pending');

-- An unverified email.
set local role authenticated;
set local request.jwt.claims = '{"sub": "96400000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(public.accept_coach_invitations(), 0, 'an unverified email accepts nothing');
reset role;
select is_empty($$ select 1 from public.school_memberships where user_id = '96400000-0000-4000-8000-0000000000a3' $$, 'an unverified email gets no membership');
select is((select status from public.coach_invitations where id = '96400000-0000-4000-8000-0000000000c3'), 'pending', 'the invitation of an unverified email stays pending');

-- An expired invitation.
set local role authenticated;
set local request.jwt.claims = '{"sub": "96400000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is(public.accept_coach_invitations(), 0, 'an expired invitation is not accepted');
reset role;
select is_empty($$ select 1 from public.school_memberships where user_id = '96400000-0000-4000-8000-0000000000a4' $$, 'an expired invitation gives no membership');

-- An invitation already used.
set local role authenticated;
set local request.jwt.claims = '{"sub": "96400000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(public.accept_coach_invitations(), 0, 'an invitation already accepted is not accepted again');
reset role;
select is_empty($$ select 1 from public.school_memberships where user_id = '96400000-0000-4000-8000-0000000000a5' $$, 'an invitation already accepted gives no membership');

-- An invitation of another school gives a membership only in that school.
set local role authenticated;
set local request.jwt.claims = '{"sub": "96400000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is(public.accept_coach_invitations(), 1, 'an invitation of school B is accepted');
reset role;
select set_eq($$ select school_id from public.school_memberships where user_id = '96400000-0000-4000-8000-0000000000a6' $$,
  $$ values ('96400000-0000-4000-8000-0000000000b2'::uuid) $$, 'an invitation of school B gives no membership in another school');

-- A deactivated coach is never reactivated.
set local role authenticated;
set local request.jwt.claims = '{"sub": "96400000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select is(public.accept_coach_invitations(), 0, 'a deactivated coach accepts nothing');
reset role;
select isnt((select deactivated_at from public.school_memberships
   where user_id = '96400000-0000-4000-8000-0000000000a7' and school_id = '96400000-0000-4000-8000-0000000000b1'), null, 'the deactivated coach stays deactivated');
select is((select status from public.coach_invitations where id = '96400000-0000-4000-8000-0000000000c7'), 'pending', 'the invitation of a deactivated coach stays pending');

-- Inviting again after the expiry: the old one closes, the device does not choose the expiry.
set local role authenticated;
set local request.jwt.claims = '{"sub": "96400000-0000-4000-8000-0000000000a0", "role": "authenticated"}';
select lives_ok($$ insert into public.coach_invitations (school_id, email, expires_at)
     values ('96400000-0000-4000-8000-0000000000b1', 'expired@example.test', now() + interval '1 year') $$,
  'the admin invites an email whose invitation expired');
reset role;
select is((select status from public.coach_invitations where id = '96400000-0000-4000-8000-0000000000c4'), 'expired', 'the expired invitation is closed');
select cmp_ok((select expires_at from public.coach_invitations where email = 'expired@example.test' and status = 'pending'),
  '=', now() + interval '14 days', 'the server sets the expiry, not the device');
set local role authenticated;
set local request.jwt.claims = '{"sub": "96400000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is(public.accept_coach_invitations(), 1, 'the new invitation is accepted');

-- What an invited coach can and cannot do with invitations.
select is_empty($$ select 1 from public.coach_invitations $$, 'an invited coach reads no invitations');
select throws_ok($$ update public.coach_invitations set status = 'accepted' $$, '42501', null, 'an invited coach cannot mark an invitation accepted');

set local request.jwt.claims = '{"role": "authenticated"}';
select throws_ok($$ select public.accept_coach_invitations() $$, '42501', null, 'accepting needs a signed-in user');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$ select public.accept_coach_invitations() $$, '42501', null, 'anon cannot accept');

reset role;
select is((select count(*)::int from public.school_memberships where user_id = '96400000-0000-4000-8000-0000000000a4'), 1, 'the re-invited person is a coach once');

select * from finish();
rollback;
