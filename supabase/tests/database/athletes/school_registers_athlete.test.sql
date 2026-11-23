-- A school registers a swimmer who has no account and the family claims it later (issue #1422).
-- public.register_athlete_in_school creates the swimmer, its link with the school and a claim link in one transaction, and
-- stores who attested (and when) that the school holds the guardian's signed authorization from enrollment.
-- public.claim_athlete turns an open link into a manager row for the caller and the three authorizations of joining a school.
-- Until a family claims it, the profile stays under the school and no family sees it.
-- Users: platform admin P (a1), admin SA of A (a2), admin SB of B (a3), coach K of A (a4), admin DA of A whose membership is
-- deactivated (a5), guardian G of another swimmer (a6), N with no role (a7), family F (a8), family F2 (a9), adult athlete AA (aa),
-- a second admin SA2 of A (ab), a coach of A whose membership is deactivated (ac). Schools: A (b1), B (b2). Swimmer Z (e0) is G's own. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(84);

create function pg_temp.u(text) returns uuid language sql as $$ select ('14220000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- What the current user reads of the fixture: swimmers, enrollment rows and claim links, as one line.
create function pg_temp.seen() returns text language sql as $$
  select 'athletes=' || coalesce((select string_agg(right(id::text, 2), ',' order by id) from public.athletes where id::text like '14220000%'), '')
    || '|schools=' || coalesce((select string_agg(right(athlete_id::text, 2), ',' order by athlete_id) from public.athlete_schools where athlete_id::text like '14220000%'), '')
    || '|claims=' || coalesce((select string_agg(right(athlete_id::text, 2), ',' order by athlete_id) from public.athlete_claims where athlete_id::text like '14220000%'), '') $$;
-- The device time of every acceptance, and the text of a purpose; the three objects the app sends carry ids derived from a seed.
create function pg_temp.at() returns timestamptz language sql as $$ select '2026-11-01 10:00:00+00'::timestamptz $$;
create function pg_temp.text_of(p text) returns uuid language sql as $$
  select id from public.authorization_texts where purpose = p and language = 'es-CO' order by version limit 1 $$;
create function pg_temp.auths(seed text) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('id', md5(seed || p)::uuid, 'purpose', p, 'text_id', pg_temp.text_of(p)) order by p)
  from unnest(array['record_times', 'import_official_results', 'share_results_with_school']) as p $$;
-- The token of the claim link of a swimmer, read as the table owner (a family cannot read the table, it is given the token).
create function pg_temp.token_of(text) returns text language sql security definer as $$ select token from public.athlete_claims where athlete_id = pg_temp.u($1) $$;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'platform-p@example.test'), (pg_temp.u('a2'), 'admin-sa@example.test'),
  (pg_temp.u('a3'), 'admin-sb@example.test'), (pg_temp.u('a4'), 'coach-k@example.test'),
  (pg_temp.u('a5'), 'admin-da@example.test'), (pg_temp.u('a6'), 'guardian-g@example.test'),
  (pg_temp.u('a7'), 'nobody-n@example.test'), (pg_temp.u('a8'), 'family-f@example.test'),
  (pg_temp.u('a9'), 'family-f2@example.test'), (pg_temp.u('aa'), 'adult-aa@example.test'),
  (pg_temp.u('ab'), 'admin-sa2@example.test'), (pg_temp.u('ac'), 'coach-former@example.test');
insert into public.platform_admins (user_id) values (pg_temp.u('a1'));
insert into public.schools (id, name) values (pg_temp.u('b1'), 'Register School A'), (pg_temp.u('b2'), 'Register School B');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a2'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a3'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a4'), 'coach'), (pg_temp.u('b1'), pg_temp.u('a5'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('ab'), 'school_admin'), (pg_temp.u('b1'), pg_temp.u('ac'), 'coach');
-- A deactivated admin cannot be built through the table check (only coaches are deactivated), so it is lifted here and
-- rolled back with the transaction: the function must still refuse a membership with deactivated_at set.
alter table public.school_memberships drop constraint school_memberships_deactivated_coach_only;
update public.school_memberships set deactivated_at = now() where school_id = pg_temp.u('b1') and user_id in (pg_temp.u('a5'), pg_temp.u('ac'));
insert into public.athletes (id, first_name, last_name) values (pg_temp.u('e0'), 'Swimmer', 'Z');
insert into public.athlete_managers (user_id, athlete_id, relation) values (pg_temp.u('a6'), pg_temp.u('e0'), 'guardian');

-- 1. Shape and grants.
select has_table('public', 'athlete_claims', 'athlete_claims exists');
select has_function('public', 'register_athlete_in_school', array['uuid', 'uuid', 'text', 'text', 'boolean'], 'register_athlete_in_school exists');
select has_function('public', 'claim_athlete', array['text', 'text', 'timestamp with time zone', 'jsonb'], 'claim_athlete exists');
select ok(
  not has_function_privilege('anon', 'public.register_athlete_in_school(uuid, uuid, text, text, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.register_athlete_in_school(uuid, uuid, text, text, boolean)', 'execute'),
  'only signed-in users execute register_athlete_in_school');
select ok(
  not has_function_privilege('anon', 'public.claim_athlete(text, text, timestamptz, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.claim_athlete(text, text, timestamptz, jsonb)', 'execute'),
  'only signed-in users execute claim_athlete');
select ok(
  not has_table_privilege('authenticated', 'public.athlete_claims', 'insert')
  and not has_table_privilege('authenticated', 'public.athlete_claims', 'update')
  and not has_table_privilege('authenticated', 'public.athlete_claims', 'delete')
  and has_table_privilege('authenticated', 'public.athlete_claims', 'select')
  and not has_table_privilege('anon', 'public.athlete_claims', 'select'),
  'clients only read claim links; the functions are the only way to write them');

-- 2. Who may register: only an active admin of the school.
set local role authenticated;
select pg_temp.as_user('a4');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Ana', 'Uno', true)$$, '42501', null, 'a coach cannot register a swimmer');
select pg_temp.as_user('a3');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Ana', 'Uno', true)$$, '42501', null, 'the admin of another school cannot register a swimmer');
select pg_temp.as_user('a5');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Ana', 'Uno', true)$$, '42501', null, 'an admin with a deactivated membership cannot register a swimmer');
select pg_temp.as_user('a6');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Ana', 'Uno', true)$$, '42501', null, 'a guardian cannot register a swimmer');
select pg_temp.as_user('a7');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Ana', 'Uno', true)$$, '42501', null, 'a user with no role cannot register a swimmer');
select pg_temp.as_user('a1');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Ana', 'Uno', true)$$, '42501', null, 'the platform admin is not a school admin and cannot register through the school');
reset role;
set local role anon;
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Ana', 'Uno', true)$$, '42501', null, 'an anonymous user cannot register a swimmer');
reset role;
select is((select count(*)::int from public.athletes where id = pg_temp.u('e1')) + (select count(*)::int from public.athlete_claims), 0, 'no swimmer and no claim link after the rejected calls');

-- 3. The attestation and the values are required, and a bad call writes nothing.
set local role authenticated;
select pg_temp.as_user('a2');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Ana', 'Uno', false)$$, '22023', null, 'without the attestation nothing is created');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Ana', 'Uno', null)$$, '22023', null, 'a missing attestation is refused too');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), '  ', 'Uno', true)$$, '22023', null, 'a blank first name is refused');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Ana', repeat('x', 101), true)$$, '22023', null, 'a last name over 100 characters is refused');
select throws_ok($$select public.register_athlete_in_school(null, pg_temp.u('b1'), 'Ana', 'Uno', true)$$, '22023', null, 'a missing swimmer id is refused');
reset role;
select is((select count(*)::int from public.athletes where id = pg_temp.u('e1')) + (select count(*)::int from public.athlete_claims), 0, 'nothing written by the invalid calls');

-- 4. The admin of A registers a swimmer without an account.
set local role authenticated;
select pg_temp.as_user('a2');
do $$ begin
  perform set_config('test.r1', public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Ana', 'Uno', true)::text, true);
end $$;
reset role;
select is(current_setting('test.r1')::jsonb ->> 'athlete_id', pg_temp.u('e1')::text, 'the call answers with the swimmer id');
select is(current_setting('test.r1')::jsonb ->> 'token', pg_temp.token_of('e1'), 'and with the token of the claim link');
select is(
  (select first_name || ' ' || last_name || '@' || created_by::text from public.athletes where id = pg_temp.u('e1')),
  'Ana Uno@' || pg_temp.u('a2')::text, 'the swimmer exists, created by the admin');
select is(
  (select school_id::text || '|' || coalesce(category_id::text, '-') || '|' || coalesce(ended_at::text, '-') || '|' || created_by::text
   from public.athlete_schools where athlete_id = pg_temp.u('e1')),
  pg_temp.u('b1')::text || '|-|-|' || pg_temp.u('a2')::text, 'linked to the school of the admin, active, no category');
select is(
  (select school_id::text || '|' || declared_by::text || '|' || (declared_at = now())::text || '|' || (claimed_by is null and claimed_at is null)::text
   from public.athlete_claims where athlete_id = pg_temp.u('e1')),
  pg_temp.u('b1')::text || '|' || pg_temp.u('a2')::text || '|true|true', 'the claim link stores who attested and when, and is open');
select matches(pg_temp.token_of('e1'), '^[0-9a-f]{32}$', 'the token is generated by the server (32 hex characters)');
select is((select expires_at = now() + interval '14 days' from public.athlete_claims where athlete_id = pg_temp.u('e1')), true, 'the link lasts 14 days (provisional)');
select is((select count(*)::int from public.athlete_managers where athlete_id = pg_temp.u('e1')) + (select count(*)::int from public.authorizations where athlete_id = pg_temp.u('e1')), 0,
  'the attestation is not an authorization: no manager and no authorization yet');

-- 5. Sending the same call again is harmless; nobody else can adopt the swimmer.
set local role authenticated;
select pg_temp.as_user('a2');
select is(public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Ana', 'Uno', true) ->> 'token', pg_temp.token_of('e1'), 'a re-send answers with the same link');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Otro', 'Uno', true)$$, '22023', null, 'a re-send with other names is refused, not answered with the old link');
select pg_temp.as_user('ab');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1'), 'Ana', 'Uno', true)$$, '42501', null, 'another admin cannot adopt the swimmer by re-sending the id');
select pg_temp.as_user('a3');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b2'), 'Ana', 'Uno', true)$$, '42501', null, 'the admin of B cannot adopt the swimmer for B');
select pg_temp.as_user('a2');
select throws_ok($$select public.register_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b2'), 'Ana', 'Uno', true)$$, '42501', null, 'the admin of A cannot register for school B');
reset role;
select is((select count(*)::int from public.athletes where id = pg_temp.u('e1')) || '/' || (select count(*)::int from public.athlete_claims where athlete_id = pg_temp.u('e1'))
  || '/' || (select count(*)::int from public.athlete_schools where athlete_id = pg_temp.u('e1')), '1/1/1', 'still one swimmer, one claim link and one enrollment');

-- 6. Before the claim no family sees the swimmer; the school does.
set local role authenticated;
select pg_temp.as_user('a6');
select is(pg_temp.seen(), 'athletes=e0|schools=|claims=', 'a guardian of another swimmer sees only their own swimmer');
select pg_temp.as_user('a7');
select is(pg_temp.seen(), 'athletes=|schools=|claims=', 'a user with no role sees nothing of it');
select pg_temp.as_user('a8');
select is(pg_temp.seen(), 'athletes=|schools=|claims=', 'the family that will claim it sees nothing before the claim');
select pg_temp.as_user('a4');
select is(pg_temp.seen(), 'athletes=|schools=|claims=', 'a coach with no assignment sees nothing of it');
select pg_temp.as_user('a3');
select is(pg_temp.seen(), 'athletes=|schools=|claims=', 'the admin of another school sees nothing of it');
select pg_temp.as_user('a2');
select is(pg_temp.seen(), 'athletes=e1|schools=e1|claims=e1', 'the admin of the school sees the swimmer, the enrollment and the claim link');
select pg_temp.as_user('a1');
select is(pg_temp.seen(), 'athletes=e0,e1|schools=e1|claims=e1', 'the platform admin sees them too');

-- 7. Clients cannot write the claim link or create swimmers themselves.
select pg_temp.as_user('a2');
select throws_ok($$insert into public.athlete_claims (athlete_id, school_id, token, expires_at, declared_by) values (pg_temp.u('e0'), pg_temp.u('b1'), repeat('a', 32), now() + interval '1 day', pg_temp.u('a2'))$$, '42501', null, 'a school admin cannot insert a claim link');
select throws_ok($$update public.athlete_claims set expires_at = now() + interval '100 days' where athlete_id = pg_temp.u('e1')$$, '42501', null, 'a school admin cannot extend a claim link');
select throws_ok($$insert into public.athletes (id, first_name, last_name) values (pg_temp.u('e9'), 'Direct', 'Insert')$$, '42501', null, 'a school admin still cannot insert a swimmer directly');
reset role;

-- 8. Claims that must fail, all before the link is used.
-- e2: link expired; e3: the school ended the link before the family claimed it.
set local role authenticated;
select pg_temp.as_user('a2');
select public.register_athlete_in_school(pg_temp.u('e2'), pg_temp.u('b1'), 'Beto', 'Dos', true);
select public.register_athlete_in_school(pg_temp.u('e3'), pg_temp.u('b1'), 'Carla', 'Tres', true);
select public.end_athlete_school(pg_temp.u('e3'), pg_temp.u('b1'));
reset role;
update public.athlete_claims set expires_at = now() - interval '1 second' where athlete_id = pg_temp.u('e2');
set local role authenticated;
select pg_temp.as_user('a8');
select throws_ok($$select public.claim_athlete(repeat('0', 32), 'guardian', pg_temp.at(), pg_temp.auths('f1'))$$, 'P0002', null, 'an unknown token fails');
select throws_ok($$select public.claim_athlete(pg_temp.token_of('e2'), 'guardian', pg_temp.at(), pg_temp.auths('f1'))$$, 'P0002', null, 'an expired link fails');
select throws_ok($$select public.claim_athlete(pg_temp.token_of('e3'), 'guardian', pg_temp.at(), pg_temp.auths('f1'))$$, 'P0002', null, 'a link of a swimmer the school already ended fails');
select throws_ok($$select public.claim_athlete(pg_temp.token_of('e1'), 'cousin', pg_temp.at(), pg_temp.auths('f1'))$$, '22023', null, 'a relation other than guardian or self is refused');
select throws_ok($$select public.claim_athlete(pg_temp.token_of('e1'), 'guardian', null, pg_temp.auths('f1'))$$, '22023', null, 'the device time of the acceptance is required');
select throws_ok($$select public.claim_athlete(pg_temp.token_of('e1'), 'guardian', pg_temp.at(), (pg_temp.auths('f1') - 0))$$, '22023', null, 'two purposes are not enough');
select throws_ok($$select public.claim_athlete(pg_temp.token_of('e1'), 'guardian', pg_temp.at(), '[]'::jsonb)$$, '22023', null, 'an empty list of authorizations is refused');
reset role;
set local role anon;
select throws_ok($$select public.claim_athlete(pg_temp.token_of('e1'), 'guardian', pg_temp.at(), pg_temp.auths('f1'))$$, '42501', null, 'an anonymous user cannot claim');
reset role;
select is(
  (select count(*)::int from public.athlete_managers where athlete_id = pg_temp.u('e1')) + (select count(*)::int from public.authorizations where athlete_id = pg_temp.u('e1'))
  + (select count(*)::int from public.athlete_claims where athlete_id in (pg_temp.u('e1'), pg_temp.u('e2'), pg_temp.u('e3')) and claimed_at is not null), 0,
  'the failed claims left no manager, no authorization and no used link');

-- 9. The family opens the valid link.
set local role authenticated;
select pg_temp.as_user('a8');
select is(public.claim_athlete(pg_temp.token_of('e1'), 'guardian', pg_temp.at(), pg_temp.auths('f1')), pg_temp.u('e1'), 'the claim answers with the swimmer id');
select is(pg_temp.seen(), 'athletes=e1|schools=e1|claims=', 'after the claim the family sees the swimmer and its enrollment, not the school''s claim link');
reset role;
select is(
  (select user_id::text || '|' || relation || '|' || created_by::text from public.athlete_managers where athlete_id = pg_temp.u('e1')),
  pg_temp.u('a8')::text || '|guardian|' || pg_temp.u('a8')::text, 'the family is now a manager of the swimmer, as a guardian');
select is((select count(*)::int from public.authorizations where athlete_id = pg_temp.u('e1') and user_id = pg_temp.u('a8')
  and accepted_at = pg_temp.at() and purpose in ('record_times', 'import_official_results', 'share_results_with_school')), 3, 'the three authorizations of joining a school are recorded with the device time');
select is((select count(*)::int from public.authorization_status where athlete_id = pg_temp.u('e1') and is_granted), 3, 'and all three are in force');
select is(
  (select claimed_by::text || '|' || (claimed_at = now())::text from public.athlete_claims where athlete_id = pg_temp.u('e1')),
  pg_temp.u('a8')::text || '|true', 'the claim link stores who used it and when');
select is((select created_by::text from public.athlete_schools where athlete_id = pg_temp.u('e1')), pg_temp.u('a2')::text, 'the enrollment stays as the school made it');
set local role authenticated;
select pg_temp.as_user('a6');
select is(pg_temp.seen(), 'athletes=e0|schools=|claims=', 'another guardian still sees only their own swimmer');
-- The school keeps reading e3 for 30 days after the baja (#1418): this test is about the claim, so the window is closed first.
reset role;
update public.athlete_schools set ended_at = now() - interval '31 days' where athlete_id = pg_temp.u('e3') and ended_at is not null;
select app.close_athlete_school_read_windows();
set local role authenticated;
select pg_temp.as_user('a2');
select is(pg_temp.seen(), 'athletes=e1,e2|schools=e1,e2|claims=e1,e2,e3', 'the school keeps the swimmer after the claim (and not e3, whose link it ended)');

-- 10. A used link fails, for anyone.
select pg_temp.as_user('a9');
select throws_ok($$select public.claim_athlete(pg_temp.token_of('e1'), 'guardian', pg_temp.at(), pg_temp.auths('f2'))$$, 'P0002', null, 'another family cannot use a link already used');
select pg_temp.as_user('a8');
select throws_ok($$select public.claim_athlete(pg_temp.token_of('e1'), 'guardian', pg_temp.at(), pg_temp.auths('f3'))$$, 'P0002', null, 'the same family cannot use it twice');
select pg_temp.as_user('a9');
select is(pg_temp.seen(), 'athletes=|schools=|claims=', 'the second family sees nothing');
reset role;
select is((select count(*)::int from public.athlete_managers where athlete_id = pg_temp.u('e1')), 1, 'one manager only');

-- 11. An adult swimmer claims their own profile; a clash of authorization ids rolls the whole claim back.
set local role authenticated;
select pg_temp.as_user('a2');
select public.register_athlete_in_school(pg_temp.u('e4'), pg_temp.u('b1'), 'Dani', 'Cuatro', true);
select public.register_athlete_in_school(pg_temp.u('e5'), pg_temp.u('b1'), 'Eva', 'Cinco', true);
select pg_temp.as_user('aa');
select is(public.claim_athlete(pg_temp.token_of('e4'), 'self', pg_temp.at(), pg_temp.auths('aa')), pg_temp.u('e4'), 'an adult swimmer claims their own profile');
select pg_temp.as_user('a9');
select throws_ok($$select public.claim_athlete(pg_temp.token_of('e5'), 'guardian', pg_temp.at(), pg_temp.auths('f1'))$$, '23505', null, 'an authorization id that already exists is never adopted');
reset role;
select is(
  (select count(*)::int from public.athlete_managers where athlete_id = pg_temp.u('e5')) + (select count(*)::int from public.athlete_claims where athlete_id = pg_temp.u('e5') and claimed_at is not null),
  0, 'the failed claim left the link open and no manager');
select is((select relation from public.athlete_managers where athlete_id = pg_temp.u('e4')), 'self', 'the adult swimmer is a manager with relation self');
set local role authenticated;
select pg_temp.as_user('a9');
select is(public.claim_athlete(pg_temp.token_of('e5'), 'guardian', pg_temp.at(), pg_temp.auths('f2')), pg_temp.u('e5'), 'the same link still works with fresh ids');
reset role;

-- 11b. The school's own staff cannot claim. e7: refused for an active admin and an active coach of A, then the family claims it;
-- e8: a coach of A whose membership was deactivated may claim (PROVISIONAL); e9: an admin of another school (B) may claim.
set local role authenticated;
select pg_temp.as_user('a2');
select public.register_athlete_in_school(pg_temp.u('e7'), pg_temp.u('b1'), 'Gina', 'Siete', true);
select public.register_athlete_in_school(pg_temp.u('e8'), pg_temp.u('b1'), 'Hugo', 'Ocho', true);
select public.register_athlete_in_school(pg_temp.u('e9'), pg_temp.u('b1'), 'Iris', 'Nueve', true);
select throws_ok($$select public.claim_athlete(pg_temp.token_of('e7'), 'guardian', pg_temp.at(), pg_temp.auths('s1'))$$, '42501', null, 'an active admin of the enrolling school cannot claim');
select pg_temp.as_user('a4');
select throws_ok($$select public.claim_athlete(pg_temp.token_of('e7'), 'guardian', pg_temp.at(), pg_temp.auths('s2'))$$, '42501', null, 'an active coach of the enrolling school cannot claim');
reset role;
select is(
  (select count(*)::int from public.athlete_managers where athlete_id = pg_temp.u('e7')) + (select count(*)::int from public.authorizations where athlete_id = pg_temp.u('e7'))
  + (select count(*)::int from public.athlete_claims where athlete_id = pg_temp.u('e7') and claimed_at is not null), 0,
  'the refused staff left no manager, no authorization and the link unused');
set local role authenticated;
select pg_temp.as_user('a8');
select is(public.claim_athlete(pg_temp.token_of('e7'), 'guardian', pg_temp.at(), pg_temp.auths('s3')), pg_temp.u('e7'), 'the link still works for the family after the staff attempts');
select pg_temp.as_user('ac');
select is(public.claim_athlete(pg_temp.token_of('e8'), 'guardian', pg_temp.at(), pg_temp.auths('s4')), pg_temp.u('e8'), 'a deactivated former coach of the school may claim (provisional)');
select pg_temp.as_user('a3');
select is(public.claim_athlete(pg_temp.token_of('e9'), 'guardian', pg_temp.at(), pg_temp.auths('s5')), pg_temp.u('e9'), 'an admin of another school may claim');
reset role;

-- 12. Deleting a swimmer removes its claim link (account deletion removes swimmers).
set local role authenticated;
select pg_temp.as_user('a2');
select public.register_athlete_in_school(pg_temp.u('e6'), pg_temp.u('b1'), 'Fede', 'Seis', true);
reset role;
delete from public.athlete_schools where athlete_id = pg_temp.u('e6');
select lives_ok($$delete from public.athletes where id = pg_temp.u('e6')$$, 'an unclaimed swimmer can be deleted');
select is((select count(*)::int from public.athlete_claims where athlete_id = pg_temp.u('e6')), 0, 'and its claim link goes with it');
select has_trigger('public', 'athlete_claims', 'account_marked_refuses_write', 'a marked account writes nothing to the claim links');

-- 13. Erasing the family's account (account deletion, #1244) keeps the used link used but leaves no id of the erased user. The
-- swimmer was enrolled, the school recorded a time and ended the link, so the swimmer stays as a marker and the claim row stays.
insert into auth.users (id, email) values (pg_temp.u('ad'), 'family-erased@example.test');
set local role authenticated;
select pg_temp.as_user('a2');
select public.register_athlete_in_school(pg_temp.u('ea'), pg_temp.u('b1'), 'Luz', 'Diez', true);
select pg_temp.as_user('ad');
select public.claim_athlete(pg_temp.token_of('ea'), 'guardian', pg_temp.at(), pg_temp.auths('er'));
select pg_temp.as_user('a2');
select public.end_athlete_school(pg_temp.u('ea'), pg_temp.u('b1'));
reset role;
-- No signed-in user for the erasure, as the worker runs it (the name-edit guard rejects the anonymizing update otherwise).
select set_config('request.jwt.claims', '', true);
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
values
  (pg_temp.u('fa'), pg_temp.u('a4'), pg_temp.u('b1'), 'repetition', pg_temp.u('ea'), 3100, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 08:00:00+00');
create function pg_temp.mark(uuid) returns uuid language plpgsql as $$
declare c text; rid uuid;
begin
  c := public.request_account_deletion($1) ->> 'code';
  perform public.confirm_account_deletion($1, c);
  update public.account_deletion_requests set delete_after = now() - interval '1 day' where user_id = $1 returning id into rid;
  return rid;
end;
$$;
create temp table erase_req on commit drop as select pg_temp.mark(pg_temp.u('ad')) as id;
select is((public.erase_account((select id from erase_req)) ->> 'status'), 'deleted', 'the family account is erased');
select is(
  (select coalesce(claimed_by::text, 'null') || '|' || (claimed_at is not null)::text from public.athlete_claims where athlete_id = pg_temp.u('ea')),
  'null|true', 'the claim row keeps when it was used and no longer names the erased user');
select is((select declared_by from public.athlete_claims where athlete_id = pg_temp.u('ea')), pg_temp.u('a2'), 'the admin who attested is still recorded');
set local role authenticated;
select pg_temp.as_user('a9');
select throws_ok($$select public.claim_athlete(pg_temp.token_of('ea'), 'guardian', pg_temp.at(), pg_temp.auths('er2'))$$, 'P0002', null, 'the used link still fails after the erasure');
reset role;

select * from finish();
rollback;
