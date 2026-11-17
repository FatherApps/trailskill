-- The limit on sending a coach invitation (issue #1141): claim_coach_invitation_send counts the sends of the calling admin and
-- of each invitation (the recipient) in a time window, and refuses above the limits. The values asserted here are the provisional
-- ones of the function: 30 sends per admin and 3 per recipient in 24 hours. All users and data are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Users: admin A and admin A2 of school A, admin B of school B, coach of A, and an unrelated user.
insert into auth.users (id, email) values
  ('11410000-0000-4000-8000-0000000000a1', 'admin-a@example.test'),
  ('11410000-0000-4000-8000-0000000000a2', 'admin-b@example.test'),
  ('11410000-0000-4000-8000-0000000000a3', 'coach-a@example.test'),
  ('11410000-0000-4000-8000-0000000000a4', 'unrelated-u@example.test'),
  ('11410000-0000-4000-8000-0000000000a5', 'admin-a2@example.test');

insert into public.schools (id, name) values
  ('11410000-0000-4000-8000-0000000000b1', 'Send Limit School A'),
  ('11410000-0000-4000-8000-0000000000b2', 'Send Limit School B');

insert into public.school_memberships (school_id, user_id, role) values
  ('11410000-0000-4000-8000-0000000000b1', '11410000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('11410000-0000-4000-8000-0000000000b2', '11410000-0000-4000-8000-0000000000a2', 'school_admin'),
  ('11410000-0000-4000-8000-0000000000b1', '11410000-0000-4000-8000-0000000000a3', 'coach'),
  ('11410000-0000-4000-8000-0000000000b1', '11410000-0000-4000-8000-0000000000a5', 'school_admin');

-- Two invitations of school A (two recipients), one of school B, and 30 more of school A that only carry sends.
insert into public.coach_invitations (id, created_by, school_id, email) values
  ('11410000-0000-4000-8000-0000000000c1', '11410000-0000-4000-8000-0000000000a1', '11410000-0000-4000-8000-0000000000b1', 'one@example.test'),
  ('11410000-0000-4000-8000-0000000000c2', '11410000-0000-4000-8000-0000000000a1', '11410000-0000-4000-8000-0000000000b1', 'two@example.test'),
  ('11410000-0000-4000-8000-0000000000c3', '11410000-0000-4000-8000-0000000000a2', '11410000-0000-4000-8000-0000000000b2', 'three@example.test');
insert into public.coach_invitations (id, created_by, school_id, email)
  select ('11410000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, '11410000-0000-4000-8000-0000000000a1',
    '11410000-0000-4000-8000-0000000000b1', 'filler-' || n || '@example.test'
  from generate_series(1, 30) as n;

-- Sends of the user, however they are on record.
create function pg_temp.sends(who uuid) returns bigint language sql as $$
  select count(*) from public.coach_invitation_sends where sent_by = who;
$$;
create function pg_temp.sends_to(invitation uuid) returns bigint language sql as $$
  select count(*) from public.coach_invitation_sends where invitation_id = invitation;
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub": "11410000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

-- 1. Under the limits the claim is granted and recorded, again and again up to the limit per recipient.
select is(public.claim_coach_invitation_send('11410000-0000-4000-8000-0000000000c1'), 'claimed', 'the first send to a recipient is claimed');
select is(public.claim_coach_invitation_send('11410000-0000-4000-8000-0000000000c1'), 'claimed', 'a resend under the limit is claimed');
select is(public.claim_coach_invitation_send('11410000-0000-4000-8000-0000000000c1'), 'claimed', 'the last send allowed to a recipient is claimed');

-- 2. Above the limit of one recipient it is refused with its own code, and another recipient is not blocked.
select is(public.claim_coach_invitation_send('11410000-0000-4000-8000-0000000000c1'), 'recipient_rate_limited', 'above the limit per recipient it answers recipient_rate_limited');
select is(public.claim_coach_invitation_send('11410000-0000-4000-8000-0000000000c2'), 'claimed', 'the limit of one recipient does not block another recipient of the same admin');

reset role;
select is(pg_temp.sends_to('11410000-0000-4000-8000-0000000000c1'), 3::bigint, 'the refused send was not recorded');
select is(pg_temp.sends('11410000-0000-4000-8000-0000000000a1'), 4::bigint, 'and the admin has the four that were claimed');

-- 3. The sends of anyone to a recipient count for that recipient.
insert into public.coach_invitation_sends (sent_by, invitation_id)
  select '11410000-0000-4000-8000-0000000000a5', '11410000-0000-4000-8000-0000000000c2' from generate_series(1, 2);
set local role authenticated;
select is(public.claim_coach_invitation_send('11410000-0000-4000-8000-0000000000c2'), 'recipient_rate_limited', 'sends by another admin count for the recipient');

-- 4. At the limit per admin (30 in the window) every recipient is refused with the caller code, and nothing is recorded.
reset role;
insert into public.coach_invitation_sends (sent_by, invitation_id)
  select '11410000-0000-4000-8000-0000000000a1', ('11410000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 26) as n;
set local role authenticated;
select is(public.claim_coach_invitation_send('11410000-0000-4000-8000-000000000101'), 'caller_rate_limited', 'at the limit per admin it answers caller_rate_limited');
select is(public.claim_coach_invitation_send('11410000-0000-4000-8000-0000000000c1'), 'caller_rate_limited', 'the caller limit wins over the recipient limit');
reset role;
select is(pg_temp.sends('11410000-0000-4000-8000-0000000000a1'), 30::bigint, 'the refused sends were not recorded');

-- 5. Another admin has their own count.
set local role authenticated;
set local request.jwt.claims = '{"sub": "11410000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(public.claim_coach_invitation_send('11410000-0000-4000-8000-000000000127'), 'claimed', 'the limit of one admin does not block another admin');

-- 6. Sends older than the window no longer count, and are deleted.
reset role;
update public.coach_invitation_sends set sent_at = now() - interval '25 hours' where sent_by = '11410000-0000-4000-8000-0000000000a1';
set local role authenticated;
set local request.jwt.claims = '{"sub": "11410000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(public.claim_coach_invitation_send('11410000-0000-4000-8000-0000000000c1'), 'claimed', 'once the window passed the same admin and recipient can send again');
reset role;
select is(pg_temp.sends('11410000-0000-4000-8000-0000000000a1'), 1::bigint, 'and the expired sends of the admin were deleted');

-- 7. Only an admin of the school of the invitation may claim.
set local role authenticated;
set local request.jwt.claims = '{"sub": "11410000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok($$ select public.claim_coach_invitation_send('11410000-0000-4000-8000-0000000000c1') $$, '42501', null, 'an admin of another school is refused');
set local request.jwt.claims = '{"sub": "11410000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select throws_ok($$ select public.claim_coach_invitation_send('11410000-0000-4000-8000-0000000000c1') $$, '42501', null, 'a coach of the school is refused');
set local request.jwt.claims = '{"sub": "11410000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok($$ select public.claim_coach_invitation_send('11410000-0000-4000-8000-0000000000c1') $$, '42501', null, 'a user without a membership is refused');
set local request.jwt.claims = '{"role": "authenticated"}';
select throws_ok($$ select public.claim_coach_invitation_send('11410000-0000-4000-8000-0000000000c1') $$, '42501', null, 'a request without a user is refused');
set local request.jwt.claims = '{"sub": "11410000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok($$ select public.claim_coach_invitation_send('11410000-0000-4000-8000-0000000000ff') $$, '42501', null, 'an invitation that does not exist is refused');

-- 8. The table is only for the function: the app roles cannot read or write it.
select throws_ok($$ select * from public.coach_invitation_sends $$, '42501', null, 'authenticated cannot read the sends');
select throws_ok(
  $$ insert into public.coach_invitation_sends (sent_by, invitation_id) values ('11410000-0000-4000-8000-0000000000a1', '11410000-0000-4000-8000-0000000000c1') $$,
  '42501', null, 'authenticated cannot record a send directly');
reset role;

-- 9. Who may call it, and how it is defined.
select ok(not has_function_privilege('anon', 'public.claim_coach_invitation_send(uuid)', 'execute'), 'anon cannot execute the claim');
select ok(has_function_privilege('authenticated', 'public.claim_coach_invitation_send(uuid)', 'execute'), 'authenticated can');
select is(
  (select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.claim_coach_invitation_send(uuid)'::regprocedure),
  true, 'the claim is security definer with an empty search_path');

select * from finish();
rollback;
