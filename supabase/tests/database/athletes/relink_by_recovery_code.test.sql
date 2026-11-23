-- The owner recovers the school's anonymous copy with a recovery code (issue #1421). request_athlete_relink accepts the permanent code (TR-)
-- or a single-use recovery code (RC-) of #1416, redeems it with app.redeem_athlete_recovery_code, finds the anonymous copies (#1420) that
-- carry the identity and opens one request per school; only an active school_admin of the school of the copy approves, which moves the marks.
-- Users: admin SA of A (a1), admin SB of B (a2), coach K of A (a3), guardian G of X (a4), guardian H of Y and V (a5), guardian W of U (a6).
-- Schools: A (b1), B (b2). Swimmers: X (e1, new swimmer of G), Y (e3), V (e8, second swimmer of H), U (e9, has its own identity L).
-- Anonymous copies: c1 (e2, school A, identity I, marks f1 and its split f2), c2 (e5, school B, identity I, mark f3), c3 (e6, school A, identity J
-- of another family, mark f4), c4 (e7, school A, no identity, mark f5), c5 (ea, school A, identity L, copied from U, mark f6).
-- PROVISIONAL rule (verifier): a code relinks only when its identity belongs to an erased swimmer, to a swimmer nobody manages or to a swimmer
-- the caller manages. Identity L4 belongs to the live swimmer Y of another family (copy eb, mark f7); L5 to the unmanaged marker ec (copy ee,
-- mark f8); L6 to swimmer ed, managed by W (copy ef, mark f9).
-- Codes: main of I TR-AAAA-BBBB-CCCC-DDDD, recovery RC-EEEE-FFFF-GGGG-HHHH (r1) and RC-JJJJ-KKKK-MMMM-NNNN (r2); main of J TR-QQQQ-RRRR-SSSS-TTTT;
-- main of L TR-UUUU-VVVV-WWWW-XXXX; identity K has no copy: main TR-YYYY-ZZZZ-2222-3333 and recovery RC-4444-5555-6666-7777 (r3). Made-up values.
begin;
create extension if not exists pgtap with schema extensions;
select plan(62);

create function pg_temp.u(text) returns uuid language sql as $$ select ('14210000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- The id of the request of a school for X about a copy (a client cannot read the table; this reads it as the owner).
create function pg_temp.rid(school text, copy text) returns uuid language sql security definer as $$
  select id from public.athlete_relink_requests where school_id = pg_temp.u($1) and athlete_id = pg_temp.u('e1') and former_athlete_id = pg_temp.u($2) $$;
create function pg_temp.owner_of(mark text) returns text language sql security definer as $$
  select right(athlete_id::text, 2) from public.measurements where id = pg_temp.u($1) $$;
create function pg_temp.requests(athlete text) returns integer language sql security definer as $$
  select count(*)::integer from public.athlete_relink_requests where athlete_id = pg_temp.u($1) $$;
create function pg_temp.failures() returns integer language sql security definer as $$
  select count(*)::integer from public.athlete_recovery_code_failures $$;
create function pg_temp.attempts() returns integer language sql security definer as $$
  select count(*)::integer from public.athlete_relink_attempts $$;
create function pg_temp.used(code text) returns boolean language sql security definer as $$
  select used_at is not null from public.athlete_recovery_codes where code_hash = app.athlete_recovery_code_hash($1) $$;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'admin-sa@example.test'), (pg_temp.u('a2'), 'admin-sb@example.test'), (pg_temp.u('a3'), 'coach-k@example.test'),
  (pg_temp.u('a4'), 'guardian-g@example.test'), (pg_temp.u('a5'), 'guardian-h@example.test'), (pg_temp.u('a6'), 'guardian-w@example.test');
insert into public.schools (id, name) values (pg_temp.u('b1'), 'Code School A'), (pg_temp.u('b2'), 'Code School B');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a1'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a2'), 'school_admin'), (pg_temp.u('b1'), pg_temp.u('a3'), 'coach');

insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'X'), (pg_temp.u('e3'), 'Athlete', 'Y'), (pg_temp.u('e8'), 'Athlete', 'V'), (pg_temp.u('e9'), 'Athlete', 'U'),
  (pg_temp.u('e2'), 'Nadador', 'anónimo'), (pg_temp.u('e5'), 'Nadador', 'anónimo'), (pg_temp.u('e6'), 'Nadador', 'anónimo'),
  (pg_temp.u('e7'), 'Nadador', 'anónimo'), (pg_temp.u('ea'), 'Nadador', 'anónimo'),
  (pg_temp.u('eb'), 'Nadador', 'anónimo'), (pg_temp.u('ee'), 'Nadador', 'anónimo'), (pg_temp.u('ef'), 'Nadador', 'anónimo'),
  (pg_temp.u('ec'), 'Nadador', 'anterior'), (pg_temp.u('ed'), 'Athlete', 'D');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a4'), pg_temp.u('e1'), 'guardian'), (pg_temp.u('a5'), pg_temp.u('e3'), 'guardian'), (pg_temp.u('a5'), pg_temp.u('e8'), 'guardian'),
  (pg_temp.u('a6'), pg_temp.u('e9'), 'guardian'), (pg_temp.u('a6'), pg_temp.u('ed'), 'guardian');
insert into public.athlete_schools (athlete_id, school_id) values
  (pg_temp.u('e2'), pg_temp.u('b1')), (pg_temp.u('e5'), pg_temp.u('b2')), (pg_temp.u('e6'), pg_temp.u('b1')), (pg_temp.u('e7'), pg_temp.u('b1')),
  (pg_temp.u('ea'), pg_temp.u('b1')), (pg_temp.u('eb'), pg_temp.u('b1')), (pg_temp.u('ee'), pg_temp.u('b1')), (pg_temp.u('ef'), pg_temp.u('b1'));

-- The identities of #1416 (only hashes). I and J belong to swimmers that no longer exist (athlete_id null); L belongs to U, who is alive.
insert into public.athlete_recovery_identities (id, athlete_id, code_hash) values
  (pg_temp.u('c0'), null, app.athlete_recovery_code_hash('TR-AAAA-BBBB-CCCC-DDDD')),
  (pg_temp.u('c1'), null, app.athlete_recovery_code_hash('TR-QQQQ-RRRR-SSSS-TTTT')),
  (pg_temp.u('c2'), pg_temp.u('e9'), app.athlete_recovery_code_hash('TR-UUUU-VVVV-WWWW-XXXX')),
  (pg_temp.u('c3'), null, app.athlete_recovery_code_hash('TR-YYYY-ZZZZ-2222-3333')),
  (pg_temp.u('c4'), pg_temp.u('e3'), app.athlete_recovery_code_hash('TR-LIVE-LIVE-LIVE-LIVE')),
  (pg_temp.u('c5'), pg_temp.u('ec'), app.athlete_recovery_code_hash('TR-MARK-MARK-MARK-MARK')),
  (pg_temp.u('c6'), pg_temp.u('ed'), app.athlete_recovery_code_hash('TR-OWNN-OWNN-OWNN-OWNN'));
insert into public.athlete_recovery_codes (identity_id, code_set, code_hash) values
  (pg_temp.u('c0'), 1, app.athlete_recovery_code_hash('RC-EEEE-FFFF-GGGG-HHHH')),
  (pg_temp.u('c0'), 1, app.athlete_recovery_code_hash('RC-JJJJ-KKKK-MMMM-NNNN')),
  (pg_temp.u('c3'), 1, app.athlete_recovery_code_hash('RC-4444-5555-6666-7777')),
  (pg_temp.u('c4'), 1, app.athlete_recovery_code_hash('RC-LIVE-LIVE-LIVE-RRRR'));
-- The copies of #1420 (the table is server-only).
insert into public.athlete_anonymous_copies (athlete_id, school_id, source_athlete_id, identity_id) values
  (pg_temp.u('e2'), pg_temp.u('b1'), null, pg_temp.u('c0')), (pg_temp.u('e5'), pg_temp.u('b2'), null, pg_temp.u('c0')),
  (pg_temp.u('e6'), pg_temp.u('b1'), null, pg_temp.u('c1')), (pg_temp.u('e7'), pg_temp.u('b1'), null, null),
  (pg_temp.u('ea'), pg_temp.u('b1'), pg_temp.u('e9'), pg_temp.u('c2')),
  (pg_temp.u('eb'), pg_temp.u('b1'), null, pg_temp.u('c4')), (pg_temp.u('ee'), pg_temp.u('b1'), null, pg_temp.u('c5')),
  (pg_temp.u('ef'), pg_temp.u('b1'), null, pg_temp.u('c6'));
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, parent_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
values
  (pg_temp.u('f1'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('e2'), null, 3100, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 08:00:00+00'),
  (pg_temp.u('f2'), pg_temp.u('a3'), pg_temp.u('b1'), 'split', pg_temp.u('e2'), pg_temp.u('f1'), 1500, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 08:00:01+00'),
  (pg_temp.u('f3'), pg_temp.u('a2'), pg_temp.u('b2'), 'repetition', pg_temp.u('e5'), null, 3200, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-e', '2026-11-01 09:00:00+00'),
  (pg_temp.u('f4'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('e6'), null, 3300, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 10:00:00+00'),
  (pg_temp.u('f5'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('e7'), null, 3400, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 11:00:00+00'),
  (pg_temp.u('f6'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('ea'), null, 3500, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 12:00:00+00'),
  (pg_temp.u('f7'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('eb'), null, 3600, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 13:00:00+00'),
  (pg_temp.u('f8'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('ee'), null, 3700, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 14:00:00+00'),
  (pg_temp.u('f9'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('ef'), null, 3800, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 15:00:00+00');

set local role authenticated;

-- 1. Only the owner redeems, and only through the function: nobody calls redeem or reads the tables.
select pg_temp.as_user('a4');
select throws_ok($$select app.redeem_athlete_recovery_code('RC-EEEE-FFFF-GGGG-HHHH')$$, '42501', null, 'a client cannot call redeem directly');
select throws_ok($$select * from public.athlete_recovery_code_failures$$, '42501', null, 'a client cannot read the failures table');
select throws_ok($$select public.request_athlete_relink(pg_temp.u('e3'), 'RC-EEEE-FFFF-GGGG-HHHH')$$, '42501', null, 'a guardian cannot ask for the swimmer of another family');
select pg_temp.as_user('a6');
select throws_ok($$select public.request_athlete_relink(pg_temp.u('e1'), 'RC-EEEE-FFFF-GGGG-HHHH')$$, '42501', null, 'a user who does not manage the swimmer cannot redeem for it');
select is(pg_temp.used('RC-EEEE-FFFF-GGGG-HHHH'), false, 'and the refusal did not spend the code');

-- 2. A wrong code creates nothing, answers like any unknown text, and counts for both limits. It does not say whether a copy exists.
select pg_temp.as_user('a4');
select is(public.request_athlete_relink(pg_temp.u('e1'), 'RC-ZZZZ-ZZZZ-ZZZZ-ZZZZ'), 'invalid_key', 'a code that matches nothing is invalid');
select is(public.request_athlete_relink(pg_temp.u('e1'), 'TR-ZZZZ-ZZZZ-ZZZZ-2222'), 'invalid_key', 'a wrong permanent code answers the same');
-- Texts that are not shaped like a code never reach redeem (another swimmer, so the limit of X is not used up).
select pg_temp.as_user('a6');
select is(public.request_athlete_relink(pg_temp.u('e9'), 'not a code'), 'invalid_key', 'a text that is not shaped like a code answers the same');
select is(public.request_athlete_relink(pg_temp.u('e9'), null), 'invalid_key', 'no text answers the same');
select pg_temp.as_user('a4');
select is(pg_temp.failures(), 2, 'redeem recorded the two well-shaped wrong codes: the failure survives because the function returns, never raises');
select is(pg_temp.attempts(), 4, 'and the attempts of #1251 recorded all four');
select is(pg_temp.requests('e1'), 0, 'a wrong code creates no request');

-- 3. A recovery code opens one request per school that holds a copy with marks, and is spent.
select is(public.request_athlete_relink(pg_temp.u('e1'), 'rc-eeee-ffff-gggg-hhhh'), 'requested', 'a recovery code, in any case, creates the requests');
select is(pg_temp.requests('e1'), 2, 'one request per school that holds a copy of the identity');
select is(pg_temp.used('RC-EEEE-FFFF-GGGG-HHHH'), true, 'the recovery code is spent');
reset role;
select is((select count(*)::int from public.athlete_relink_requests r where r::text ~* 'EEEE' or r::text ~* 'AAAA-BBBB'), 0, 'no request holds the text of a code');
select is((select count(*)::int from public.athlete_relink_requests where status = 'pending' and former_athlete_id in (pg_temp.u('e2'), pg_temp.u('e5'))), 2,
  'both are pending and name the anonymous copies of the identity, no others');
set local role authenticated;
select pg_temp.as_user('a4');
select is(public.request_athlete_relink(pg_temp.u('e1'), 'RC-EEEE-FFFF-GGGG-HHHH'), 'invalid_key', 'the same recovery code does not work twice');
select is(pg_temp.failures(), 3, 'and counts as a failure');
select is(public.request_athlete_relink(pg_temp.u('e1'), ' tr aaaa-bbbb ccccdddd '), 'already_requested',
  'the permanent code asks again for the same copies, spaces and hyphens do not matter, and nothing is spent');
select is(pg_temp.requests('e1'), 2, 'asking again is the same request');

-- 4. A right code with nothing to relink is answered before it is redeemed: a recovery code is not spent for nothing.
select is(public.request_athlete_relink(pg_temp.u('e1'), 'RC-4444-5555-6666-7777'), 'nothing_to_relink', 'a right code of an identity with no copy relinks nothing');
select is(pg_temp.used('RC-4444-5555-6666-7777'), false, 'and the recovery code stays unspent');
select pg_temp.as_user('a6');
select is(public.request_athlete_relink(pg_temp.u('e9'), 'TR-UUUU-VVVV-WWWW-XXXX'), 'nothing_to_relink', 'the copy of the own swimmer is not relinked to it');
select pg_temp.as_user('a4');
select is(public.request_athlete_relink(pg_temp.u('e1'), 'TR-QQQQ-RRRR-SSSS-TTTT'), 'requested', 'the code of another identity reaches only its own copy');
select is(pg_temp.requests('e1'), 3, 'one more request, for the copy of that identity');

-- 4b. PROVISIONAL: who may use a code. A code of a live swimmer that another family manages is refused like a wrong code and spends nothing;
-- an erased swimmer's code (I, J above) works; so does the code of a swimmer nobody manages or one the caller already manages.
select pg_temp.as_user('a6');
select is(public.request_athlete_relink(pg_temp.u('e9'), 'TR-LIVE-LIVE-LIVE-LIVE'), 'invalid_key', 'the right code of a live swimmer of another family answers like a wrong code');
select is(pg_temp.requests('e9'), 0, 'and creates no request');
select is(pg_temp.failures(), 4, 'it is recorded as a failure, like a wrong code');
select is(public.request_athlete_relink(pg_temp.u('e9'), 'RC-LIVE-LIVE-LIVE-RRRR'), 'invalid_key', 'so does its recovery code');
select is(pg_temp.used('RC-LIVE-LIVE-LIVE-RRRR'), false, 'which is not spent');
select is(public.request_athlete_relink(pg_temp.u('e9'), 'TR-OWNN-OWNN-OWNN-OWNN'), 'requested', 'the code of another swimmer the caller manages works');
select pg_temp.as_user('a4');
select is(public.request_athlete_relink(pg_temp.u('e1'), 'TR-MARK-MARK-MARK-MARK'), 'requested', 'the code of a swimmer nobody manages works');

-- 5. The limits. H manages Y and V; five wrong codes for Y lock the code of H out of redeem, so even a right code asked for V is refused.
select pg_temp.as_user('a5');
select is(public.request_athlete_relink(pg_temp.u('e3'), 'RC-ZZZZ-ZZZZ-ZZZZ-AAA1'), 'invalid_key', 'first wrong code');
select is(public.request_athlete_relink(pg_temp.u('e3'), 'RC-ZZZZ-ZZZZ-ZZZZ-AAA2'), 'invalid_key', 'second wrong code');
select is(public.request_athlete_relink(pg_temp.u('e3'), 'RC-ZZZZ-ZZZZ-ZZZZ-AAA3'), 'invalid_key', 'third wrong code');
select is(public.request_athlete_relink(pg_temp.u('e3'), 'RC-ZZZZ-ZZZZ-ZZZZ-AAA4'), 'invalid_key', 'fourth wrong code');
select is(public.request_athlete_relink(pg_temp.u('e3'), 'RC-ZZZZ-ZZZZ-ZZZZ-AAA5'), 'invalid_key', 'fifth wrong code');
select is(public.request_athlete_relink(pg_temp.u('e3'), 'TR-AAAA-BBBB-CCCC-DDDD'), 'rate_limited', 'past the limit of the swimmer even the right code is refused');
select is(public.request_athlete_relink(pg_temp.u('e8'), 'RC-JJJJ-KKKK-MMMM-NNNN'), 'rate_limited', 'past the limit of redeem too, for another swimmer of the same user');
select is(pg_temp.used('RC-JJJJ-KKKK-MMMM-NNNN'), false, 'and the recovery code is not spent');
select is(pg_temp.requests('e8') + pg_temp.requests('e3'), 0, 'and nothing was created');
-- Locked out of redeem, ANY code is refused before it is looked up: a right code with nothing to relink and a wrong one answer the same.
select is(public.request_athlete_relink(pg_temp.u('e8'), 'RC-4444-5555-6666-7777'), 'rate_limited', 'locked out, a right code with no copy to relink is refused too');
select is(public.request_athlete_relink(pg_temp.u('e8'), 'RC-ZZZZ-ZZZZ-ZZZZ-AAA6'), 'rate_limited', 'and a wrong code gets the same answer');
select is(pg_temp.failures(), 10, 'neither adds a failure nor a spent code');

-- 6. Who decides: only an active school_admin of the school of the copy.
select pg_temp.as_user('a3');
select throws_ok($$select public.resolve_athlete_relink(pg_temp.rid('b1', 'e2'), true)$$, '42501', null, 'a coach of the school cannot approve');
select pg_temp.as_user('a2');
select throws_ok($$select public.resolve_athlete_relink(pg_temp.rid('b1', 'e2'), true)$$, '42501', null, 'the admin of another school cannot approve');
select pg_temp.as_user('a4');
select throws_ok($$select public.resolve_athlete_relink(pg_temp.rid('b1', 'e2'), true)$$, '42501', null, 'the family cannot approve its own request');
select is(pg_temp.owner_of('f1') || pg_temp.owner_of('f2'), 'e2e2', 'no refusal moved a mark');

-- 7. The approval moves the marks of that school once; the other school's request is still its own.
select pg_temp.as_user('a1');
select is(public.resolve_athlete_relink(pg_temp.rid('b1', 'e2'), true), '{"moved": 2, "status": "approved"}'::jsonb, 'the admin of the school approves and the two marks move');
select is(pg_temp.owner_of('f1') || pg_temp.owner_of('f2') || pg_temp.owner_of('f3'), 'e1e1e5', 'the marks of the school are on the swimmer, the other school''s mark is untouched');
select is(public.resolve_athlete_relink(pg_temp.rid('b1', 'e2'), true), '{"status": "already_resolved"}'::jsonb, 'approving again moves nothing');
select pg_temp.as_user('a4');
select is(public.request_athlete_relink(pg_temp.u('e1'), 'TR-AAAA-BBBB-CCCC-DDDD'), 'already_requested', 'the copy of school B is still open, the relinked one has nothing left');
-- The identity of the copy of B is gone before the approval: the request closes as rejected and no mark moves.
reset role;
update public.athlete_anonymous_copies set identity_id = null where athlete_id = pg_temp.u('e5');
set local role authenticated;
select pg_temp.as_user('a2');
select is(public.resolve_athlete_relink(pg_temp.rid('b2', 'e5'), true), '{"status": "no_longer_valid"}'::jsonb, 'a copy that lost its identity is no longer valid');
select is(pg_temp.owner_of('f3'), 'e5', 'and its mark stays');
select pg_temp.as_user('a4');
select is(public.request_athlete_relink(pg_temp.u('e1'), 'TR-AAAA-BBBB-CCCC-DDDD'), 'nothing_to_relink', 'once the marks of a copy moved, the code relinks nothing more');

-- 8. The list of anonymous swimmers of a school: only its active admins, and never a code or an identity.
select pg_temp.as_user('a3');
select throws_ok($$select * from public.school_anonymous_copies(pg_temp.u('b1'))$$, '42501', null, 'a coach cannot list the anonymous swimmers');
select pg_temp.as_user('a2');
select throws_ok($$select * from public.school_anonymous_copies(pg_temp.u('b1'))$$, '42501', null, 'the admin of another school cannot list them');
select pg_temp.as_user('a1');
select is((select count(*)::int from public.school_anonymous_copies(pg_temp.u('b1'))), 7, 'the admin lists the seven anonymous swimmers of the school');
select is((select linkable from public.school_anonymous_copies(pg_temp.u('b1')) where athlete_id = pg_temp.u('e7')), false, 'one without a code says it cannot be linked');
select is((select times_count from public.school_anonymous_copies(pg_temp.u('b1')) where athlete_id = pg_temp.u('e2')), 0, 'the copy whose marks moved shows none left');
select is((select proargnames from pg_proc where proname = 'school_anonymous_copies' and pronamespace = 'public'::regnamespace),
  '{p_school,athlete_id,created_at,linkable,times_count}'::text[], 'the list returns no identity and no code, only the swimmer, the date, whether it is linkable and the marks');

select * from finish();
rollback;
