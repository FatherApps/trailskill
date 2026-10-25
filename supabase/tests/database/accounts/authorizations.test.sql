-- Authorization texts, authorizations (evidence), current status and school
-- invitations (issue #40): who reads and writes them, that evidence is never
-- modified or deleted, that a withdrawal is written once, that the status
-- follows the most recent event, and that the invitation function resolves a
-- token without a session. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(104);

-- Users: guardians G and H, coaches C and D, school admins S and T, platform admin P.
-- G and H both manage athlete e1; H also manages e2. Coach C is assigned to e1.
insert into auth.users (id, email) values
  ('40000000-0000-4000-8000-0000000000a1', 'guardian-g@example.test'),
  ('40000000-0000-4000-8000-0000000000a2', 'guardian-h@example.test'),
  ('40000000-0000-4000-8000-0000000000a3', 'coach-c@example.test'),
  ('40000000-0000-4000-8000-0000000000a4', 'coach-d@example.test'),
  ('40000000-0000-4000-8000-0000000000a5', 'admin-s@example.test'),
  ('40000000-0000-4000-8000-0000000000a6', 'admin-t@example.test'),
  ('40000000-0000-4000-8000-0000000000a7', 'platform-p@example.test');

insert into public.schools (id, name) values
  ('40000000-0000-4000-8000-0000000000b1', 'Authorization School One'),
  ('40000000-0000-4000-8000-0000000000b2', 'Authorization School Two');

insert into public.categories (id, school_id, name, sort_order) values
  ('40000000-0000-4000-8000-0000000000c2', '40000000-0000-4000-8000-0000000000b1', 'Category Two', 2),
  ('40000000-0000-4000-8000-0000000000c1', '40000000-0000-4000-8000-0000000000b1', 'Category One', 1),
  ('40000000-0000-4000-8000-0000000000c3', '40000000-0000-4000-8000-0000000000b2', 'Other School Category', 1);

insert into public.training_groups (id, school_id, name) values
  ('40000000-0000-4000-8000-0000000000d1', '40000000-0000-4000-8000-0000000000b1', 'Group One'),
  ('40000000-0000-4000-8000-0000000000d2', '40000000-0000-4000-8000-0000000000b2', 'Group Two');

insert into public.school_memberships (school_id, user_id, role) values
  ('40000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000a3', 'coach'),
  ('40000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000a4', 'coach'),
  ('40000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000a5', 'school_admin'),
  ('40000000-0000-4000-8000-0000000000b2', '40000000-0000-4000-8000-0000000000a6', 'school_admin');

insert into public.platform_admins (user_id) values ('40000000-0000-4000-8000-0000000000a7');

insert into public.athletes (id, first_name, last_name) values
  ('40000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('40000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2');

insert into public.athlete_schools (athlete_id, school_id) values
  ('40000000-0000-4000-8000-0000000000e1', '40000000-0000-4000-8000-0000000000b1'),
  ('40000000-0000-4000-8000-0000000000e2', '40000000-0000-4000-8000-0000000000b1');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('40000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000e1', 'guardian'),
  ('40000000-0000-4000-8000-0000000000a2', '40000000-0000-4000-8000-0000000000e1', 'guardian'),
  ('40000000-0000-4000-8000-0000000000a2', '40000000-0000-4000-8000-0000000000e2', 'guardian');

insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values
  ('40000000-0000-4000-8000-0000000000a3', '40000000-0000-4000-8000-0000000000e1');

insert into public.authorization_texts (id, purpose, version, language, body) values
  ('40000000-0000-4000-8000-0000000000f1', 'record_times', 1, 'en-US', 'Synthetic record times text v1'),
  ('40000000-0000-4000-8000-0000000000f2', 'import_official_results', 1, 'en-US', 'Synthetic import text v1');

-- Schema
select has_table('public', 'authorization_purposes', 'authorization_purposes exists');
select has_table('public', 'authorization_texts', 'authorization_texts exists');
select has_table('public', 'authorizations', 'authorizations exists');
select has_table('public', 'authorization_status', 'authorization_status exists');
select has_table('public', 'school_invitations', 'school_invitations exists');

select is_empty(
  $$ select relname from pg_class
     where relnamespace = 'public'::regnamespace
       and relname in ('authorization_purposes', 'authorization_texts', 'authorizations',
                       'authorization_status', 'school_invitations')
       and not relrowsecurity $$,
  'the five tables have row level security enabled'
);

select set_eq(
  $$ select tablename::text from pg_publication_tables
     where pubname = 'powersync'
       and tablename in ('authorization_purposes', 'authorization_texts', 'authorizations',
                         'authorization_status', 'school_invitations') $$,
  $$ values ('authorization_texts'), ('authorizations'), ('authorization_status'), ('school_invitations') $$,
  'the powersync publication includes the four synced tables and not the purposes'
);

select set_eq(
  'select code from public.authorization_purposes',
  $$ values ('record_times'), ('import_official_results'), ('share_results_with_school') $$,
  'the purposes are the three codes'
);

select ok(
  (select prosecdef and coalesce(proconfig, '{}') @> array['search_path=""']
   from pg_proc where oid = 'public.resolve_invitation(text)'::regprocedure),
  'resolve_invitation is security definer with an empty search_path'
);

select ok(
  has_function_privilege('anon', 'public.resolve_invitation(text)', 'execute')
    and has_function_privilege('authenticated', 'public.resolve_invitation(text)', 'execute'),
  'anon and authenticated execute resolve_invitation'
);

-- The owner is not exempt: texts are immutable for everyone.
select throws_ok(
  $$ update public.authorization_texts set body = 'changed' where id = '40000000-0000-4000-8000-0000000000f1' $$,
  '42501', null,
  'not even the owner updates an authorization text'
);
select throws_ok(
  $$ delete from public.authorization_texts where id = '40000000-0000-4000-8000-0000000000f1' $$,
  '42501', null,
  'not even the owner deletes an authorization text'
);

set local role authenticated;

-- Guardian G
set local request.jwt.claims = '{"sub": "40000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select isnt_empty('select 1 from public.authorization_texts', 'guardian G reads the authorization texts');
select isnt_empty('select 1 from public.authorization_purposes', 'guardian G reads the purposes');
select throws_ok(
  $$ insert into public.authorization_texts (purpose, version, language, body)
     values ('record_times', 2, 'en-US', 'Synthetic forged text') $$,
  '42501', null,
  'guardian G cannot insert an authorization text'
);

select lives_ok(
  $$ insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at, received_at)
     values ('40000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-0000000000e1',
             'record_times', '40000000-0000-4000-8000-0000000000f1',
             '2026-10-01 10:00:00-05', '2000-01-01 00:00:00+00') $$,
  'guardian G accepts a text for the managed athlete e1'
);
select is(
  (select user_id from public.authorizations where id = '40000000-0000-4000-8000-000000000101'),
  '40000000-0000-4000-8000-0000000000a1'::uuid,
  'the authorization records G as the adult'
);
select ok(
  (select received_at >= now() from public.authorizations where id = '40000000-0000-4000-8000-000000000101'),
  'the server sets received_at; the client value is ignored'
);
select is(
  (select accepted_at from public.authorizations where id = '40000000-0000-4000-8000-000000000101'),
  '2026-10-01 10:00:00-05'::timestamptz,
  'the device acceptance time is kept'
);

select throws_ok(
  $$ insert into public.authorizations (athlete_id, purpose, text_id, accepted_at)
     values ('40000000-0000-4000-8000-0000000000e2', 'record_times',
             '40000000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00-05') $$,
  '42501', null,
  'guardian G cannot accept for an athlete G does not manage'
);
select throws_ok(
  $$ insert into public.authorizations (user_id, athlete_id, purpose, text_id, accepted_at)
     values ('40000000-0000-4000-8000-0000000000a2', '40000000-0000-4000-8000-0000000000e1',
             'record_times', '40000000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00-05') $$,
  '42501', null,
  'guardian G cannot accept in the name of another adult'
);
select throws_ok(
  $$ insert into public.authorizations (athlete_id, purpose, text_id, accepted_at)
     values ('40000000-0000-4000-8000-0000000000e1', 'import_official_results',
             '40000000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00-05') $$,
  '23503', null,
  'the accepted text must belong to the purpose'
);
select throws_ok(
  $$ insert into public.authorizations (athlete_id, purpose, text_id, accepted_at, withdrawn_at)
     values ('40000000-0000-4000-8000-0000000000e1', 'record_times',
             '40000000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00-05', '2026-10-02 10:00:00-05') $$,
  '42501', null,
  'an authorization cannot be inserted already withdrawn'
);

select set_eq(
  $$ select purpose from public.authorizations where athlete_id = '40000000-0000-4000-8000-0000000000e1' $$,
  $$ values ('record_times') $$,
  'guardian G reads the own evidence'
);
select set_eq(
  $$ select athlete_id, purpose, is_granted from public.authorization_status $$,
  $$ values ('40000000-0000-4000-8000-0000000000e1'::uuid, 'record_times'::text, true) $$,
  'the status of e1 for record_times is granted'
);

select throws_ok(
  $$ update public.authorizations set accepted_at = '2026-10-02 10:00:00-05'
     where id = '40000000-0000-4000-8000-000000000101' $$,
  '42501', 'authorization evidence cannot change',
  'the acceptance time cannot change'
);
select throws_ok(
  $$ update public.authorizations
     set purpose = 'import_official_results', text_id = '40000000-0000-4000-8000-0000000000f2'
     where id = '40000000-0000-4000-8000-000000000101' $$,
  '42501', 'authorization evidence cannot change',
  'the accepted text cannot change'
);
select throws_ok(
  $$ delete from public.authorizations where id = '40000000-0000-4000-8000-000000000101' $$,
  '42501', null,
  'an authorization cannot be deleted'
);

-- Guardian H
set local request.jwt.claims = '{"sub": "40000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
     values ('40000000-0000-4000-8000-000000000102', '40000000-0000-4000-8000-0000000000e1',
             'record_times', '40000000-0000-4000-8000-0000000000f1', '2026-10-01 11:00:00-05') $$,
  'guardian H also accepts for e1'
);
select results_eq(
  'select id from public.authorizations',
  $$ values ('40000000-0000-4000-8000-000000000102'::uuid) $$,
  'guardian H reads only the own evidence, not the one of G'
);
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-04 09:00:00-05'
     where id = '40000000-0000-4000-8000-000000000101' $$,
  'the update of an authorization of G by H runs but matches no row'
);
select throws_ok(
  $$ update public.authorizations set withdrawn_by = '40000000-0000-4000-8000-0000000000a2'
     where id = '40000000-0000-4000-8000-000000000102' $$,
  '42501', null,
  'withdrawal columns cannot be set without a withdrawal'
);

-- Guardian G withdraws the authorization of G.
set local request.jwt.claims = '{"sub": "40000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select is(
  (select withdrawn_at from public.authorizations where id = '40000000-0000-4000-8000-000000000101'),
  null::timestamptz,
  'guardian H did not withdraw the authorization of G'
);
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-05 09:00:00-05'
     where id = '40000000-0000-4000-8000-000000000101' $$,
  'guardian G withdraws the own authorization'
);
select is(
  (select withdrawn_by from public.authorizations where id = '40000000-0000-4000-8000-000000000101'),
  '40000000-0000-4000-8000-0000000000a1'::uuid,
  'the withdrawal records who withdrew'
);
select is(
  (select withdrawn_at from public.authorizations where id = '40000000-0000-4000-8000-000000000101'),
  '2026-10-05 09:00:00-05'::timestamptz,
  'the device withdrawal time is kept'
);
select ok(
  (select withdrawal_received_at > received_at from public.authorizations
   where id = '40000000-0000-4000-8000-000000000101'),
  'the server sets the withdrawal reception time'
);
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-05 09:00:00-05'
     where id = '40000000-0000-4000-8000-000000000101' $$,
  'the same withdrawal again is a no-op, so a sync retry passes'
);
select throws_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-06 09:00:00-05'
     where id = '40000000-0000-4000-8000-000000000101' $$,
  '42501', null,
  'a withdrawal cannot be rewritten'
);
select throws_ok(
  $$ update public.authorizations set withdrawn_at = null
     where id = '40000000-0000-4000-8000-000000000101' $$,
  '42501', null,
  'a withdrawal cannot be undone'
);
select set_eq(
  $$ select athlete_id, purpose, is_granted from public.authorization_status $$,
  $$ values ('40000000-0000-4000-8000-0000000000e1'::uuid, 'record_times'::text, false) $$,
  'the most recent event wins: not granted although the authorization of H stands'
);
select throws_ok(
  $$ insert into public.authorization_status (athlete_id, purpose, is_granted)
     values ('40000000-0000-4000-8000-0000000000e2', 'record_times', true) $$,
  '42501', null,
  'a client cannot write the status'
);
select throws_ok(
  $$ update public.authorization_status set is_granted = true $$,
  '42501', null,
  'a client cannot update the status'
);

-- Coach C (assigned to e1): current status only, no evidence.
set local request.jwt.claims = '{"sub": "40000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';

select results_eq(
  'select athlete_id, purpose, is_granted from public.authorization_status',
  $$ values ('40000000-0000-4000-8000-0000000000e1'::uuid, 'record_times'::text, false) $$,
  'coach C reads the status of the assigned athlete'
);
select is_empty('select 1 from public.authorizations', 'coach C reads no evidence');
select hasnt_column('public', 'authorization_status', 'user_id', 'the status does not expose the adult');
select hasnt_column('public', 'authorization_status', 'text_id', 'the status does not expose the accepted text');

-- Coach D (no athletes assigned)
set local request.jwt.claims = '{"sub": "40000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';

select is_empty('select 1 from public.authorization_status', 'coach D reads no status');
select is_empty('select 1 from public.authorizations', 'coach D reads no evidence');

-- Guardian H accepts again after the withdrawal of G.
set local request.jwt.claims = '{"sub": "40000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
     values ('40000000-0000-4000-8000-000000000103', '40000000-0000-4000-8000-0000000000e1',
             'record_times', '40000000-0000-4000-8000-0000000000f1', '2026-10-06 08:00:00-05') $$,
  'guardian H accepts again after the withdrawal'
);
select set_eq(
  $$ select athlete_id, purpose, is_granted from public.authorization_status $$,
  $$ values ('40000000-0000-4000-8000-0000000000e1'::uuid, 'record_times'::text, true) $$,
  'a later acceptance grants the purpose again'
);

-- School admin S (school one)
set local request.jwt.claims = '{"sub": "40000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';

select is(
  (select count(*) from public.authorizations), 3::bigint,
  'school admin S reads the evidence of the athletes of the school'
);
select set_eq(
  'select purpose from public.authorization_status',
  $$ values ('record_times') $$,
  'school admin S reads the status of the athletes of the school'
);
select lives_ok(
  $$ insert into public.school_invitations (id, school_id, group_id, token)
     values ('40000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-0000000000b1',
             '40000000-0000-4000-8000-0000000000d1', 'synthetic-invitation-token-000000000001') $$,
  'school admin S creates an invitation for the own school'
);
select is(
  (select created_by from public.school_invitations where id = '40000000-0000-4000-8000-000000000201'),
  '40000000-0000-4000-8000-0000000000a5'::uuid,
  'the invitation records its creator'
);
select lives_ok(
  $$ insert into public.school_invitations (id, school_id, group_id)
     values ('40000000-0000-4000-8000-000000000202', '40000000-0000-4000-8000-0000000000b1',
             '40000000-0000-4000-8000-0000000000d1') $$,
  'an invitation without a token gets one from the server'
);
select ok(
  (select char_length(token) >= 32 from public.school_invitations
   where id = '40000000-0000-4000-8000-000000000202'),
  'the generated token has at least 32 characters'
);
select throws_ok(
  $$ insert into public.school_invitations (school_id, group_id)
     values ('40000000-0000-4000-8000-0000000000b2', '40000000-0000-4000-8000-0000000000d2') $$,
  '42501', null,
  'school admin S cannot invite to another school'
);
select throws_ok(
  $$ insert into public.school_invitations (school_id, group_id)
     values ('40000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000d2') $$,
  '42501', null,
  'the group must belong to the school of the invitation'
);
select col_is_unique('public', 'school_invitations', 'token', 'a token is unique');
select throws_ok(
  $$ update public.school_invitations set group_id = '40000000-0000-4000-8000-0000000000d1' $$,
  '42501', null,
  'an invitation cannot change except its revocation'
);
select throws_ok(
  $$ delete from public.school_invitations $$,
  '42501', null,
  'an invitation cannot be deleted'
);

-- School admin T (school two)
set local request.jwt.claims = '{"sub": "40000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';

select is_empty('select 1 from public.authorizations', 'school admin T reads no evidence of another school');
select is_empty('select 1 from public.authorization_status', 'school admin T reads no status of another school');
select is_empty('select 1 from public.school_invitations', 'school admin T reads no invitation of another school');

-- Guardian G and coach C read no invitations.
set local request.jwt.claims = '{"sub": "40000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is_empty('select 1 from public.school_invitations', 'guardian G reads no invitations');
set local request.jwt.claims = '{"sub": "40000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is_empty('select 1 from public.school_invitations', 'coach C reads no invitations');

-- Platform admin P
set local request.jwt.claims = '{"sub": "40000000-0000-4000-8000-0000000000a7", "role": "authenticated"}';

select is((select count(*) from public.authorizations), 3::bigint, 'platform admin P reads all the evidence');
select is((select count(*) from public.school_invitations), 2::bigint, 'platform admin P reads all the invitations');
select is((select count(*) from public.authorization_status), 1::bigint, 'platform admin P reads all the status');

-- Two clocks. Athlete e2, guardian H. An acceptance counts only if it is later
-- than the latest withdrawal by the device clock and by the server clock.
set local request.jwt.claims = '{"sub": "40000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
     values ('40000000-0000-4000-8000-000000000104', '40000000-0000-4000-8000-0000000000e2',
             'record_times', '40000000-0000-4000-8000-0000000000f1', '2026-10-01 12:00:00+00') $$,
  'guardian H accepts for e2'
);
select is(
  (select is_granted from public.authorization_status where athlete_id = '40000000-0000-4000-8000-0000000000e2'),
  true, 'e2 is granted'
);
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-10 12:00:00+00'
     where id = '40000000-0000-4000-8000-000000000104' $$,
  'guardian H withdraws for e2'
);
select is(
  (select is_granted from public.authorization_status where athlete_id = '40000000-0000-4000-8000-0000000000e2'),
  false, 'e2 is not granted after the withdrawal'
);

-- Made before the withdrawal on the device, uploaded after it.
select lives_ok(
  $$ insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
     values ('40000000-0000-4000-8000-000000000105', '40000000-0000-4000-8000-0000000000e2',
             'record_times', '40000000-0000-4000-8000-0000000000f1', '2026-10-09 12:00:00+00') $$,
  'an offline acceptance made before the withdrawal is uploaded after it'
);
select is(
  (select is_granted from public.authorization_status where athlete_id = '40000000-0000-4000-8000-0000000000e2'),
  false, 'it does not grant the purpose again'
);

select lives_ok(
  $$ insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
     values ('40000000-0000-4000-8000-000000000106', '40000000-0000-4000-8000-0000000000e2',
             'record_times', '40000000-0000-4000-8000-0000000000f1', '2026-10-11 12:00:00+00') $$,
  'an acceptance later than the withdrawal by both clocks'
);
select is(
  (select is_granted from public.authorization_status where athlete_id = '40000000-0000-4000-8000-0000000000e2'),
  true, 'it grants the purpose again'
);

-- The status row is written only when the status changes (updated_at is
-- clock_timestamp(), which advances inside a transaction, so equality proves
-- that nothing was written).
select set_config('test.status_at', (select updated_at::text from public.authorization_status
   where athlete_id = '40000000-0000-4000-8000-0000000000e2' and purpose = 'record_times'), true);
select lives_ok(
  $$ insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
     values ('40000000-0000-4000-8000-000000000108', '40000000-0000-4000-8000-0000000000e2',
             'record_times', '40000000-0000-4000-8000-0000000000f1', '2026-10-12 12:00:00+00') $$,
  'a second acceptance while the purpose is already granted'
);
select is((select updated_at::text from public.authorization_status
   where athlete_id = '40000000-0000-4000-8000-0000000000e2' and purpose = 'record_times'), current_setting('test.status_at'), 'it leaves the updated_at of the status unchanged');
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-12 06:00:00+00'
     where id = '40000000-0000-4000-8000-000000000106' $$,
  'guardian H withdraws the latest acceptance'
);
select isnt((select updated_at::text from public.authorization_status
   where athlete_id = '40000000-0000-4000-8000-0000000000e2' and purpose = 'record_times'), current_setting('test.status_at'), 'the status flip moves the updated_at of the status');
select set_config('test.status_at', (select updated_at::text from public.authorization_status
   where athlete_id = '40000000-0000-4000-8000-0000000000e2' and purpose = 'record_times'), true);
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-12 06:00:00+00'
     where id = '40000000-0000-4000-8000-000000000106' $$,
  'the same withdrawal sent again is a no-op'
);
select is((select updated_at::text from public.authorization_status
   where athlete_id = '40000000-0000-4000-8000-0000000000e2' and purpose = 'record_times'), current_setting('test.status_at'), 'it leaves the updated_at of the status unchanged');
select is(
  (select is_granted from public.authorization_status where athlete_id = '40000000-0000-4000-8000-0000000000e2'),
  false, 'the status stays not granted'
);

-- The device cannot push its times forward.
select lives_ok(
  $$ insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
     values ('40000000-0000-4000-8000-000000000107', '40000000-0000-4000-8000-0000000000e2',
             'record_times', '40000000-0000-4000-8000-0000000000f1', '2999-01-01 00:00:00+00') $$,
  'an acceptance with a future device time is inserted'
);
select ok(
  (select accepted_at = received_at from public.authorizations where id = '40000000-0000-4000-8000-000000000107'),
  'a future acceptance time is clamped to the reception time'
);
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2999-01-01 00:00:00+00'
     where id = '40000000-0000-4000-8000-000000000107' $$,
  'a withdrawal with a future device time is accepted'
);
select ok(
  (select withdrawn_at = withdrawal_received_at from public.authorizations
   where id = '40000000-0000-4000-8000-000000000107'),
  'a future withdrawal time is clamped to the withdrawal reception time'
);
select set_config('test.withdrawal',
  (select withdrawn_at::text || '|' || withdrawal_received_at::text || '|' || withdrawn_by::text
   from public.authorizations where id = '40000000-0000-4000-8000-000000000107'), true);
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2999-01-01 00:00:00+00'
     where id = '40000000-0000-4000-8000-000000000107' $$,
  'retrying the same future withdrawal is a no-op'
);
select is(
  (select withdrawn_at::text || '|' || withdrawal_received_at::text || '|' || withdrawn_by::text
   from public.authorizations where id = '40000000-0000-4000-8000-000000000107'),
  current_setting('test.withdrawal'),
  'the retry left the withdrawal unchanged'
);

select throws_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-01 00:00:00+00'
     where id = '40000000-0000-4000-8000-000000000107' $$,
  '42501', null,
  'a clamped withdrawal cannot move to an earlier time'
);
select throws_ok(
  $$ insert into public.authorizations (athlete_id, purpose, text_id, accepted_at)
     values ('40000000-0000-4000-8000-0000000000e2', 'record_times',
             '40000000-0000-4000-8000-0000000000f1', null) $$,
  '23502', null,
  'an acceptance without a device time is rejected, not filled in'
);

-- A retry of an insert already saved, after the guardian stopped managing the athlete.
reset role;
delete from public.athlete_managers
  where user_id = '40000000-0000-4000-8000-0000000000a2' and athlete_id = '40000000-0000-4000-8000-0000000000e2';
set local role authenticated;
set local request.jwt.claims = '{"sub": "40000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
     values ('40000000-0000-4000-8000-000000000104', '40000000-0000-4000-8000-0000000000e2',
             'record_times', '40000000-0000-4000-8000-0000000000f1', '2026-10-01 12:00:00+00')
     on conflict (id) do nothing $$,
  '42501', null,
  'the insert policy rejects a retry of a saved acceptance once the guardian lost the athlete, before the conflict is checked'
);
select is(
  (select count(*) from public.authorizations where id = '40000000-0000-4000-8000-000000000104'),
  1::bigint,
  'the guardian still reads the own saved authorization by id'
);

-- anon reads no table and resolves a token without a session. The token is
-- generated by the server: keep the stored one where anon can read it.
reset role;
do $$ begin
  perform set_config('test.invitation_token', (
    select token from public.school_invitations where id = '40000000-0000-4000-8000-000000000201'
  ), true);
end $$;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok('select 1 from public.authorization_purposes', '42501', null, 'anon reads no authorization_purposes');
select throws_ok('select 1 from public.authorization_texts', '42501', null, 'anon reads no authorization_texts');
select throws_ok('select 1 from public.authorizations', '42501', null, 'anon reads no authorizations');
select throws_ok('select 1 from public.authorization_status', '42501', null, 'anon reads no authorization_status');
select throws_ok('select 1 from public.school_invitations', '42501', null, 'anon reads no school_invitations');
select throws_ok(
  $$ insert into public.school_invitations (id, school_id, group_id)
     values (gen_random_uuid(), '40000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000d1') $$,
  '42501', null,
  'anon cannot create an invitation'
);

select is(
  public.resolve_invitation(current_setting('test.invitation_token')),
  jsonb_build_object(
    'school_name', 'Authorization School One',
    'group_name', 'Group One',
    'categories', jsonb_build_array(
      jsonb_build_object('id', '40000000-0000-4000-8000-0000000000c1'::uuid, 'name', 'Category One', 'sort_order', 1),
      jsonb_build_object('id', '40000000-0000-4000-8000-0000000000c2'::uuid, 'name', 'Category Two', 'sort_order', 2)
    )
  ),
  'anon resolves a token to the school, the group and the categories of that school only'
);
select is(public.resolve_invitation('unknown-token'), null::jsonb, 'an unknown token resolves to null');

-- Evidence is never deleted, not even by the owner.
reset role;
select throws_ok(
  $$ delete from public.authorizations where id = '40000000-0000-4000-8000-000000000101' $$,
  '42501', null,
  'not even the owner deletes evidence'
);

select * from finish();
rollback;
