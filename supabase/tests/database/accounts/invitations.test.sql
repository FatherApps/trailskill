-- School invitations (issue #157): the server always generates the token and
-- the expiry, an expired or revoked invitation does not resolve, and only an
-- admin of the school or a platform admin revokes, once. All users and data
-- here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Users: school admins A (school one) and B (school two), coach C and guardian G
-- of school one, platform admin P.
insert into auth.users (id, email) values
  ('57000000-0000-4000-8000-0000000000a1', 'admin-a@example.test'),
  ('57000000-0000-4000-8000-0000000000a2', 'admin-b@example.test'),
  ('57000000-0000-4000-8000-0000000000a3', 'coach-c@example.test'),
  ('57000000-0000-4000-8000-0000000000a4', 'guardian-g@example.test'),
  ('57000000-0000-4000-8000-0000000000a5', 'platform-p@example.test');

insert into public.schools (id, name) values
  ('57000000-0000-4000-8000-0000000000b1', 'Invitation School One'),
  ('57000000-0000-4000-8000-0000000000b2', 'Invitation School Two');

insert into public.training_groups (id, school_id, name) values
  ('57000000-0000-4000-8000-0000000000d1', '57000000-0000-4000-8000-0000000000b1', 'Group One');

insert into public.school_memberships (school_id, user_id, role) values
  ('57000000-0000-4000-8000-0000000000b1', '57000000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('57000000-0000-4000-8000-0000000000b2', '57000000-0000-4000-8000-0000000000a2', 'school_admin'),
  ('57000000-0000-4000-8000-0000000000b1', '57000000-0000-4000-8000-0000000000a3', 'coach');

insert into public.platform_admins (user_id) values ('57000000-0000-4000-8000-0000000000a5');

insert into public.athletes (id, first_name, last_name) values
  ('57000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1');

insert into public.athlete_schools (athlete_id, school_id) values
  ('57000000-0000-4000-8000-0000000000e1', '57000000-0000-4000-8000-0000000000b1');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('57000000-0000-4000-8000-0000000000a4', '57000000-0000-4000-8000-0000000000e1', 'guardian');

set local role authenticated;
set local request.jwt.claims = '{"sub": "57000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

-- The client tries to choose the token, the expiry and the revocation.
insert into public.school_invitations (id, school_id, group_id, token, expires_at, revoked_at)
values ('57000000-0000-4000-8000-000000000101', '57000000-0000-4000-8000-0000000000b1',
        '57000000-0000-4000-8000-0000000000d1', 'client-chosen-token-0123456789abcdef0123',
        '2099-01-01 00:00:00+00', '2000-01-01 00:00:00+00');
insert into public.school_invitations (id, school_id, group_id) values
  ('57000000-0000-4000-8000-000000000102', '57000000-0000-4000-8000-0000000000b1', '57000000-0000-4000-8000-0000000000d1'),
  ('57000000-0000-4000-8000-000000000103', '57000000-0000-4000-8000-0000000000b1', '57000000-0000-4000-8000-0000000000d1'),
  ('57000000-0000-4000-8000-000000000104', '57000000-0000-4000-8000-0000000000b1', '57000000-0000-4000-8000-0000000000d1'),
  ('57000000-0000-4000-8000-000000000105', '57000000-0000-4000-8000-0000000000b1', '57000000-0000-4000-8000-0000000000d1');

select isnt(
  (select token from public.school_invitations where id = '57000000-0000-4000-8000-000000000101'),
  'client-chosen-token-0123456789abcdef0123',
  'the token chosen by the client is replaced'
);
select matches(
  (select token from public.school_invitations where id = '57000000-0000-4000-8000-000000000101'),
  '^[0-9a-f]{32}$',
  'the stored token is 32 hex characters'
);
select is(
  (select expires_at from public.school_invitations where id = '57000000-0000-4000-8000-000000000101'),
  now() + interval '14 days',
  'the expiry chosen by the client is ignored'
);
select is(
  (select revoked_at from public.school_invitations where id = '57000000-0000-4000-8000-000000000101'),
  null::timestamptz,
  'a revocation sent on insert is ignored'
);

-- Resolving
select isnt(
  public.resolve_invitation((select token from public.school_invitations where id = '57000000-0000-4000-8000-000000000101')),
  null::jsonb,
  'a valid invitation resolves'
);

-- Revoking: school admin A of the school
select lives_ok(
  $$ update public.school_invitations set revoked_at = '2099-01-01 00:00:00+00'
     where id = '57000000-0000-4000-8000-000000000102' $$,
  'school admin A revokes an invitation of the own school'
);
select ok(
  (select revoked_at <= clock_timestamp() from public.school_invitations
   where id = '57000000-0000-4000-8000-000000000102'),
  'the revocation time is the server time, not the device time'
);
select is(
  public.resolve_invitation((select token from public.school_invitations where id = '57000000-0000-4000-8000-000000000102')),
  null::jsonb,
  'a revoked invitation resolves to null'
);

-- Revocation is final and a retried upload changes nothing.
do $$ begin
  perform set_config('test.first_revocation', (
    select revoked_at::text from public.school_invitations where id = '57000000-0000-4000-8000-000000000102'
  ), true);
end $$;

select throws_ok(
  $$ update public.school_invitations set revoked_at = null
     where id = '57000000-0000-4000-8000-000000000102' $$,
  '42501', null,
  'a revocation cannot be undone'
);
select lives_ok(
  $$ update public.school_invitations set revoked_at = '2099-02-02 00:00:00+00'
     where id = '57000000-0000-4000-8000-000000000102' $$,
  'revoking again is accepted'
);
select is(
  (select revoked_at::text from public.school_invitations where id = '57000000-0000-4000-8000-000000000102'),
  current_setting('test.first_revocation'),
  'a second revocation keeps the first one'
);

select throws_ok(
  $$ update public.school_invitations set expires_at = '2099-01-01 00:00:00+00'
     where id = '57000000-0000-4000-8000-000000000103' $$,
  '42501', null,
  'school admin A cannot change another column of an invitation'
);

-- A retried upload of an invitation that already exists (the connector sends
-- insert ... on conflict (id) do nothing) changes nothing.
do $$ begin
  perform set_config('test.first_token', (
    select token from public.school_invitations where id = '57000000-0000-4000-8000-000000000101'
  ), true);
  perform set_config('test.first_expiry', (
    select expires_at::text from public.school_invitations where id = '57000000-0000-4000-8000-000000000101'
  ), true);
end $$;

select lives_ok(
  $$ insert into public.school_invitations (id, school_id, group_id, token, expires_at)
     values ('57000000-0000-4000-8000-000000000101', '57000000-0000-4000-8000-0000000000b1',
             '57000000-0000-4000-8000-0000000000d1', 'retried-client-token-0123456789abcdef',
             '2099-01-01 00:00:00+00')
     on conflict (id) do nothing $$,
  'school admin A retries the upload of an existing invitation'
);
select is(
  (select token from public.school_invitations where id = '57000000-0000-4000-8000-000000000101'),
  current_setting('test.first_token'),
  'a retried upload keeps the stored token'
);
select is(
  (select expires_at::text from public.school_invitations where id = '57000000-0000-4000-8000-000000000101'),
  current_setting('test.first_expiry'),
  'a retried upload keeps the stored expiry'
);

-- Who cannot revoke: the update policy hides the row, so nothing changes.
set local request.jwt.claims = '{"sub": "57000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ update public.school_invitations set revoked_at = now()
     where id = '57000000-0000-4000-8000-000000000104' $$,
  'school admin B of another school revokes nothing'
);
set local request.jwt.claims = '{"sub": "57000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select lives_ok(
  $$ update public.school_invitations set revoked_at = now()
     where id = '57000000-0000-4000-8000-000000000104' $$,
  'coach C of the school revokes nothing'
);
set local request.jwt.claims = '{"sub": "57000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select lives_ok(
  $$ update public.school_invitations set revoked_at = now()
     where id = '57000000-0000-4000-8000-000000000104' $$,
  'guardian G of the school revokes nothing'
);
set local request.jwt.claims = '{"sub": "57000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  (select revoked_at from public.school_invitations where id = '57000000-0000-4000-8000-000000000104'),
  null::timestamptz,
  'the invitation is still not revoked after the attempts of B, C and G'
);

-- Platform admin P
set local request.jwt.claims = '{"sub": "57000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select lives_ok(
  $$ update public.school_invitations set revoked_at = now()
     where id = '57000000-0000-4000-8000-000000000103' $$,
  'platform admin P revokes an invitation'
);
select isnt(
  (select revoked_at from public.school_invitations where id = '57000000-0000-4000-8000-000000000103'),
  null::timestamptz,
  'the invitation of platform admin P is revoked'
);

-- anon
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok(
  $$ update public.school_invitations set revoked_at = now()
     where id = '57000000-0000-4000-8000-000000000104' $$,
  '42501', null,
  'anon cannot revoke an invitation'
);

-- Expiry: as the owner, with triggers off, make invitation 105 expire.
reset role;
select is(
  public.resolve_invitation((select token from public.school_invitations where id = '57000000-0000-4000-8000-000000000105')),
  public.resolve_invitation((select token from public.school_invitations where id = '57000000-0000-4000-8000-000000000101')),
  'before it expires, an invitation resolves to its school and group'
);
set local session_replication_role = replica;
update public.school_invitations set expires_at = now() - interval '1 second'
  where id = '57000000-0000-4000-8000-000000000105';
set local session_replication_role = origin;
select is(
  public.resolve_invitation((select token from public.school_invitations where id = '57000000-0000-4000-8000-000000000105')),
  null::jsonb,
  'an expired invitation resolves to null'
);

-- The rule also binds the owner.
select throws_ok(
  $$ update public.school_invitations set token = 'owner-chosen-token-0123456789abcdef0123'
     where id = '57000000-0000-4000-8000-000000000104' $$,
  '42501', null,
  'not even the owner changes the token'
);
select throws_ok(
  $$ update public.school_invitations set expires_at = '2099-01-01 00:00:00+00'
     where id = '57000000-0000-4000-8000-000000000104' $$,
  '42501', null,
  'not even the owner changes the expiry'
);
select throws_ok(
  $$ update public.school_invitations set revoked_at = null
     where id = '57000000-0000-4000-8000-000000000102' $$,
  '42501', null,
  'not even the owner undoes a revocation'
);

select * from finish();
rollback;
