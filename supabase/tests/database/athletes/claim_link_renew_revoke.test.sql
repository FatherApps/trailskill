-- The school renews or revokes the claim link of a swimmer nobody has claimed yet (issue #1423).
-- public.renew_athlete_claim_link gives a new token (14 days) and the old one stops working; public.revoke_athlete_claim_link makes the
-- token unusable (claim_athlete answers P0002). Only an active admin of the enrolling school, only on an unclaimed link with an active enrollment.
-- Users: platform admin P (a1), admin SA of A (a2), admin SB of B (a3), coach K of A (a4), admin DA of A whose membership is deactivated (a5),
-- guardian G (a6), N with no role (a7), family F (a8), family F2 (a9), a second admin SA2 of A (ab). Schools: A (b1), B (b2).
-- Swimmers e1 (renewed, then claimed), e2 (revoked, then renewed), e4 (enrollment ended), e5 (expired link). All data here is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

create function pg_temp.u(text) returns uuid language sql as $$ select ('14230000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
create function pg_temp.at() returns timestamptz language sql as $$ select '2026-11-01 10:00:00+00'::timestamptz $$;
create function pg_temp.text_of(p text) returns uuid language sql as $$
  select id from public.authorization_texts where purpose = p and language = 'es-CO' order by version limit 1 $$;
create function pg_temp.auths(seed text) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('id', md5(seed || p)::uuid, 'purpose', p, 'text_id', pg_temp.text_of(p)) order by p)
  from unnest(array['record_times', 'import_official_results', 'share_results_with_school']) as p $$;
-- The whole claim row of a swimmer, as one line, read as the table owner: a refused call must leave it exactly as it was.
create function pg_temp.snap(text) returns text language sql security definer as $$
  select c::text from public.athlete_claims c where c.athlete_id = pg_temp.u($1) $$;
create function pg_temp.token_of(text) returns text language sql security definer as $$ select token from public.athlete_claims where athlete_id = pg_temp.u($1) $$;
create function pg_temp.row_of(text) returns public.athlete_claims language sql security definer as $$ select * from public.athlete_claims where athlete_id = pg_temp.u($1) $$;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'platform-p@example.test'), (pg_temp.u('a2'), 'admin-sa@example.test'),
  (pg_temp.u('a3'), 'admin-sb@example.test'), (pg_temp.u('a4'), 'coach-k@example.test'),
  (pg_temp.u('a5'), 'admin-da@example.test'), (pg_temp.u('a6'), 'guardian-g@example.test'),
  (pg_temp.u('a7'), 'nobody-n@example.test'), (pg_temp.u('a8'), 'family-f@example.test'),
  (pg_temp.u('a9'), 'family-f2@example.test'), (pg_temp.u('ab'), 'admin-sa2@example.test');
insert into public.platform_admins (user_id) values (pg_temp.u('a1'));
insert into public.schools (id, name) values (pg_temp.u('b1'), 'Renew School A'), (pg_temp.u('b2'), 'Renew School B');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a2'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a3'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a4'), 'coach'), (pg_temp.u('b1'), pg_temp.u('a5'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('ab'), 'school_admin');
-- A deactivated admin cannot be built through the table check (only coaches are deactivated), so it is lifted here and
-- rolled back with the transaction: the functions must still refuse a membership with deactivated_at set.
alter table public.school_memberships drop constraint school_memberships_deactivated_coach_only;
update public.school_memberships set deactivated_at = now() where school_id = pg_temp.u('b1') and user_id = pg_temp.u('a5');
insert into public.athletes (id, first_name, last_name) values (pg_temp.u('e0'), 'Swimmer', 'Z');
insert into public.athlete_managers (user_id, athlete_id, relation) values (pg_temp.u('a6'), pg_temp.u('e0'), 'guardian');

-- 1. Shape, grants and the row lock that makes a race have one winner.
select has_function('public', 'renew_athlete_claim_link', array['uuid'], 'renew_athlete_claim_link exists');
select has_function('public', 'revoke_athlete_claim_link', array['uuid'], 'revoke_athlete_claim_link exists');
select has_column('public', 'athlete_claims', 'revoked_at', 'the claim row records when it was revoked');
select has_column('public', 'athlete_claims', 'revoked_by', 'the claim row records who revoked it');
select has_column('public', 'athlete_claims', 'renewed_at', 'the claim row records when it was renewed');
select has_column('public', 'athlete_claims', 'renewed_by', 'the claim row records who renewed it');
select ok(
  not has_function_privilege('anon', 'public.renew_athlete_claim_link(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.renew_athlete_claim_link(uuid)', 'execute'),
  'only signed-in users execute renew_athlete_claim_link');
select ok(
  not has_function_privilege('anon', 'public.revoke_athlete_claim_link(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.revoke_athlete_claim_link(uuid)', 'execute'),
  'only signed-in users execute revoke_athlete_claim_link');
select ok((select prosrc from pg_proc where oid = 'public.claim_athlete(text, text, timestamptz, jsonb)'::regprocedure) ~ 'for update', 'claim_athlete locks the claim row');
select ok((select prosrc from pg_proc where oid = 'public.renew_athlete_claim_link(uuid)'::regprocedure) ~ 'for update', 'renew locks the claim row, so a racing claim and renew have one winner');
select ok((select prosrc from pg_proc where oid = 'public.revoke_athlete_claim_link(uuid)'::regprocedure) ~ 'for update', 'revoke locks the claim row, so a racing claim and revoke have one winner');

-- The school registers five swimmers (the registration function is the one under test in school_registers_athlete.test.sql).
set local role authenticated;
select pg_temp.as_user('a2');
select public.register_athlete_in_school(pg_temp.u(s), pg_temp.u('b1'), 'Swimmer', s, true) from unnest(array['e1', 'e2', 'e4', 'e5']) as s;
reset role;
select set_config('t.old1', pg_temp.token_of('e1'), false);
select set_config('t.snap1', pg_temp.snap('e1'), false);

-- 2. Who may renew: only an active admin of the enrolling school. A refused call changes nothing.
set local role authenticated;
select pg_temp.as_user('a4');
select throws_ok($$select public.renew_athlete_claim_link(pg_temp.u('e1'))$$, '42501', null, 'a coach cannot renew a link');
select pg_temp.as_user('a3');
select throws_ok($$select public.renew_athlete_claim_link(pg_temp.u('e1'))$$, '42501', null, 'the admin of another school cannot renew a link');
select pg_temp.as_user('a5');
select throws_ok($$select public.renew_athlete_claim_link(pg_temp.u('e1'))$$, '42501', null, 'an admin with a deactivated membership cannot renew a link');
select pg_temp.as_user('a6');
select throws_ok($$select public.renew_athlete_claim_link(pg_temp.u('e1'))$$, '42501', null, 'a guardian cannot renew a link');
select pg_temp.as_user('a7');
select throws_ok($$select public.renew_athlete_claim_link(pg_temp.u('e1'))$$, '42501', null, 'a user with no role cannot renew a link');
select pg_temp.as_user('a1');
select throws_ok($$select public.renew_athlete_claim_link(pg_temp.u('e1'))$$, '42501', null, 'a platform admin is not an admin of the school: it cannot renew a link');
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.renew_athlete_claim_link(pg_temp.u('e1'))$$, '42501', null, 'nobody signed in cannot renew a link');
select pg_temp.as_user('a2');
select throws_ok($$select public.renew_athlete_claim_link(pg_temp.u('ff'))$$, '42501', null, 'an unknown swimmer answers like a refusal: nobody learns whether a link exists');
select throws_ok($$select public.renew_athlete_claim_link(null)$$, '42501', null, 'a missing id is refused the same way');
reset role;
select is(pg_temp.snap('e1'), current_setting('t.snap1'), 'no claim row changed after the refused renewals');

-- 3. The admin renews: a new token for 14 days, and the old token stops working at once.
set local role authenticated;
select pg_temp.as_user('a2');
select set_config('t.renewed', public.renew_athlete_claim_link(pg_temp.u('e1'))::text, false);
reset role;
select is((current_setting('t.renewed')::jsonb ->> 'athlete_id')::uuid, pg_temp.u('e1'), 'renew answers with the swimmer id');
select isnt(current_setting('t.renewed')::jsonb ->> 'token', current_setting('t.old1'), 'renew answers with a new token');
select is(char_length(current_setting('t.renewed')::jsonb ->> 'token'), 32, 'the new token has 32 hex characters');
select ok(
  (current_setting('t.renewed')::jsonb ->> 'expires_at')::timestamptz between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour',
  'the new link lasts 14 days');
select ok(
  (select token = current_setting('t.renewed')::jsonb ->> 'token' and renewed_by = pg_temp.u('a2') and renewed_at is not null and revoked_at is null and claimed_at is null from pg_temp.row_of('e1')),
  'the row holds the new token and who renewed it');
set local role authenticated;
select pg_temp.as_user('a8');
select throws_ok(format($$select public.claim_athlete(%L, 'guardian', pg_temp.at(), pg_temp.auths('r1'))$$, current_setting('t.old1')), 'P0002', null, 'the old token fails after the renewal');
select is(public.claim_athlete(current_setting('t.renewed')::jsonb ->> 'token', 'guardian', pg_temp.at(), pg_temp.auths('r2')), pg_temp.u('e1'), 'the new token works');
reset role;
select ok(exists (select 1 from public.athlete_managers where user_id = pg_temp.u('a8') and athlete_id = pg_temp.u('e1') and relation = 'guardian'), 'the family became the manager');
select ok((select claimed_at is not null and claimed_by = pg_temp.u('a8') from pg_temp.row_of('e1')), 'the link is marked used');

-- 4. Who may revoke: the same rule. A refused call changes nothing.
select set_config('t.snap2', pg_temp.snap('e2'), false);
set local role authenticated;
select pg_temp.as_user('a4');
select throws_ok($$select public.revoke_athlete_claim_link(pg_temp.u('e2'))$$, '42501', null, 'a coach cannot revoke a link');
select pg_temp.as_user('a3');
select throws_ok($$select public.revoke_athlete_claim_link(pg_temp.u('e2'))$$, '42501', null, 'the admin of another school cannot revoke a link');
select pg_temp.as_user('a5');
select throws_ok($$select public.revoke_athlete_claim_link(pg_temp.u('e2'))$$, '42501', null, 'an admin with a deactivated membership cannot revoke a link');
select pg_temp.as_user('a6');
select throws_ok($$select public.revoke_athlete_claim_link(pg_temp.u('e2'))$$, '42501', null, 'a guardian cannot revoke a link');
select pg_temp.as_user('a7');
select throws_ok($$select public.revoke_athlete_claim_link(pg_temp.u('e2'))$$, '42501', null, 'a user with no role cannot revoke a link');
select pg_temp.as_user('a1');
select throws_ok($$select public.revoke_athlete_claim_link(pg_temp.u('e2'))$$, '42501', null, 'a platform admin cannot revoke a link');
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.revoke_athlete_claim_link(pg_temp.u('e2'))$$, '42501', null, 'nobody signed in cannot revoke a link');
reset role;
select is(pg_temp.snap('e2'), current_setting('t.snap2'), 'no claim row changed after the refused revocations');

-- 5. The admin revokes: the token is unusable, a second revocation keeps the first.
set local role authenticated;
select pg_temp.as_user('a2');
select lives_ok($$select public.revoke_athlete_claim_link(pg_temp.u('e2'))$$, 'an admin revokes the link');
reset role;
select ok((select revoked_at is not null and revoked_by = pg_temp.u('a2') and claimed_at is null from pg_temp.row_of('e2')), 'the row records who revoked it');
select set_config('t.old2', pg_temp.token_of('e2'), false);
select set_config('t.snap2', pg_temp.snap('e2'), false);
set local role authenticated;
select pg_temp.as_user('a9');
select throws_ok(format($$select public.claim_athlete(%L, 'guardian', pg_temp.at(), pg_temp.auths('r3'))$$, current_setting('t.old2')), 'P0002', null, 'a revoked link fails like an unknown one');
select pg_temp.as_user('ab');
select lives_ok($$select public.revoke_athlete_claim_link(pg_temp.u('e2'))$$, 'another admin of the school revokes it again without an error');
reset role;
select is(pg_temp.snap('e2'), current_setting('t.snap2'), 'the failed claim and the second revocation changed nothing: the first revocation stays');

-- 6. Renewing a revoked link is the way to issue a new one: the old token still fails, the new one works.
set local role authenticated;
select pg_temp.as_user('ab');
select set_config('t.renewed2', public.renew_athlete_claim_link(pg_temp.u('e2'))::text, false);
reset role;
select ok(
  (select token = current_setting('t.renewed2')::jsonb ->> 'token' and token <> current_setting('t.old2') and revoked_at is null and revoked_by is null and renewed_by = pg_temp.u('ab') from pg_temp.row_of('e2')),
  'renewing a revoked link clears the revocation and holds the new token');
set local role authenticated;
select pg_temp.as_user('a9');
select throws_ok(format($$select public.claim_athlete(%L, 'guardian', pg_temp.at(), pg_temp.auths('r4'))$$, current_setting('t.old2')), 'P0002', null, 'the revoked token still fails after the renewal');
select is(public.claim_athlete(current_setting('t.renewed2')::jsonb ->> 'token', 'guardian', pg_temp.at(), pg_temp.auths('r5')), pg_temp.u('e2'), 'the renewed link works');
reset role;

-- 7. A claimed link cannot be renewed or revoked.
select set_config('t.snap1', pg_temp.snap('e1'), false);
set local role authenticated;
select pg_temp.as_user('a2');
select throws_ok($$select public.renew_athlete_claim_link(pg_temp.u('e1'))$$, '55000', null, 'a claimed link is not renewed');
select throws_ok($$select public.revoke_athlete_claim_link(pg_temp.u('e1'))$$, '55000', null, 'a claimed link is not revoked');
reset role;
select is(pg_temp.snap('e1'), current_setting('t.snap1'), 'the claimed link did not change');
select throws_ok($$update public.athlete_claims set revoked_at = now() where athlete_id = pg_temp.u('e1')$$, '23514', null, 'the table itself refuses a revoked claimed link');

-- 8. A swimmer the school ended (the baja) cannot be reached by a link any more: the functions refuse it.
set local role authenticated;
select pg_temp.as_user('a2');
select lives_ok($$select public.end_athlete_school(pg_temp.u('e4'), pg_temp.u('b1'))$$, 'the school ends the enrollment of a swimmer with an open link');
reset role;
select set_config('t.snap4', pg_temp.snap('e4'), false);
set local role authenticated;
select pg_temp.as_user('a2');
select throws_ok($$select public.renew_athlete_claim_link(pg_temp.u('e4'))$$, '55000', null, 'a link of an ended enrollment is not renewed');
select throws_ok($$select public.revoke_athlete_claim_link(pg_temp.u('e4'))$$, '55000', null, 'a link of an ended enrollment is not revoked');
reset role;
select is(pg_temp.snap('e4'), current_setting('t.snap4'), 'the link of the ended enrollment did not change');

-- 9. An expired link is renewed like any other.
update public.athlete_claims set expires_at = now() - interval '1 day' where athlete_id = pg_temp.u('e5');
select set_config('t.old5', pg_temp.token_of('e5'), false);
set local role authenticated;
select pg_temp.as_user('a9');
select throws_ok(format($$select public.claim_athlete(%L, 'guardian', pg_temp.at(), pg_temp.auths('r6'))$$, current_setting('t.old5')), 'P0002', null, 'an expired link fails');
select pg_temp.as_user('a2');
select set_config('t.renewed5', public.renew_athlete_claim_link(pg_temp.u('e5'))::text, false);
select pg_temp.as_user('a9');
select is(public.claim_athlete(current_setting('t.renewed5')::jsonb ->> 'token', 'guardian', pg_temp.at(), pg_temp.auths('r7')), pg_temp.u('e5'), 'the renewed link of an expired one works');
reset role;

-- 10. The people recorded here go with their account (account deletion, #1244).
select is(
  (select confdeltype::text from pg_constraint where conrelid = 'public.athlete_claims'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute where attrelid = 'public.athlete_claims'::regclass and attname = 'revoked_by')]),
  'n', 'revoked_by is set to null when its account is deleted');
select is(
  (select confdeltype::text from pg_constraint where conrelid = 'public.athlete_claims'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute where attrelid = 'public.athlete_claims'::regclass and attname = 'renewed_by')]),
  'n', 'renewed_by is set to null when its account is deleted');

select * from finish();
rollback;
