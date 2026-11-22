-- Relinking the school's times of an erased swimmer (issue #1251). A family asks with the former_athlete_key (request_athlete_relink), the
-- server compares it with the hash that erase_account stored and keeps no text of it, and only an active school_admin of the school that
-- owns the times approves or rejects (resolve_athlete_relink). Users: admin SA of A (a1), admin SB of B (a2), coach K of A (a3), admin DA of
-- A whose membership is deactivated (a4), guardian G of X (a5), guardian H of Y (a6), N with no role (a7).
-- Athletes: X (e1, managed by G, in no school), marker M (e2, no manager, ended link with A and B), Y (e3, managed by H).
-- Times of the marker: f1 and f3 of school A, f2 of school B. The key of M is AAAA-BBBB-CCCC-DDDD-EEEE (a made-up value). All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

create function pg_temp.u(text) returns uuid language sql as $$ select ('12510000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- The id of the request of a school for X (a client cannot read the table; this reads it as the owner).
create function pg_temp.rid(school text) returns uuid language sql security definer as $$
  select id from public.athlete_relink_requests where school_id = pg_temp.u($1) and athlete_id = pg_temp.u('e1') order by created_at desc limit 1 $$;
create function pg_temp.owner_of(mark text) returns text language sql security definer as $$
  select right(athlete_id::text, 2) from public.measurements where id = pg_temp.u($1) $$;
create function pg_temp.state(school text) returns text language sql security definer as $$
  select status || ':' || coalesce(moved_count::text, '-') from public.athlete_relink_requests where id = pg_temp.rid($1) $$;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'admin-sa@example.test'), (pg_temp.u('a2'), 'admin-sb@example.test'), (pg_temp.u('a3'), 'coach-k@example.test'),
  (pg_temp.u('a4'), 'admin-da@example.test'), (pg_temp.u('a5'), 'guardian-g@example.test'), (pg_temp.u('a6'), 'guardian-h@example.test'),
  (pg_temp.u('a7'), 'nobody-n@example.test');
insert into public.schools (id, name) values (pg_temp.u('b1'), 'Relink School A'), (pg_temp.u('b2'), 'Relink School B');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a1'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a2'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a3'), 'coach'), (pg_temp.u('b1'), pg_temp.u('a4'), 'school_admin');
-- A deactivated admin cannot be built through the table check (only coaches are deactivated): lifted here, rolled back with the transaction.
alter table public.school_memberships drop constraint school_memberships_deactivated_coach_only;
update public.school_memberships set deactivated_at = now() where school_id = pg_temp.u('b1') and user_id = pg_temp.u('a4');

insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'X'), (pg_temp.u('e2'), 'Nadador', 'anterior'), (pg_temp.u('e3'), 'Athlete', 'Y');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a5'), pg_temp.u('e1'), 'guardian'), (pg_temp.u('a6'), pg_temp.u('e3'), 'guardian');
-- The marker as erase_account leaves it: an ended link with each school and the hash of the key.
insert into public.athlete_schools (athlete_id, school_id, ended_at, ended_by) values
  (pg_temp.u('e2'), pg_temp.u('b1'), now(), pg_temp.u('a1')), (pg_temp.u('e2'), pg_temp.u('b2'), now(), pg_temp.u('a2'));
insert into public.former_athlete_keys (athlete_id, key_hash)
  values (pg_temp.u('e2'), encode(sha256(convert_to('AAAA-BBBB-CCCC-DDDD-EEEE', 'UTF8')), 'hex'));
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
values
  (pg_temp.u('f1'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('e2'), 3100, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 08:00:00+00'),
  (pg_temp.u('f2'), pg_temp.u('a2'), pg_temp.u('b2'), 'repetition', pg_temp.u('e2'), 3200, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-e', '2026-11-01 09:00:00+00'),
  (pg_temp.u('f3'), pg_temp.u('a1'), pg_temp.u('b1'), 'repetition', pg_temp.u('e2'), 3300, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 10:00:00+00');

select has_table('public', 'athlete_relink_requests', 'the requests table exists');
select hasnt_column('public', 'athlete_relink_requests', 'key_hash', 'the requests table keeps no key, not even its hash');

set local role authenticated;

-- 1. Nobody reads or writes the tables directly.
select pg_temp.as_user('a5');
select throws_ok($$select * from public.athlete_relink_requests$$, '42501', null, 'a client cannot read the requests table');
select throws_ok($$insert into public.athlete_relink_attempts (user_id, athlete_id) values (pg_temp.u('a5'), pg_temp.u('e1'))$$, '42501', null, 'a client cannot write the attempts table');

-- 2. Who may ask: only a manager of the current swimmer.
select throws_ok($$select public.request_athlete_relink(pg_temp.u('e3'), 'AAAA-BBBB-CCCC-DDDD-EEEE')$$, '42501', null, 'a guardian cannot ask for the swimmer of another family');
select pg_temp.as_user('a7');
select throws_ok($$select public.request_athlete_relink(pg_temp.u('e1'), 'AAAA-BBBB-CCCC-DDDD-EEEE')$$, '42501', null, 'a user who manages no swimmer cannot ask');

-- 3. The right key creates one pending request per school that owns times, and nothing keeps the text of the key.
select pg_temp.as_user('a5');
select is(public.request_athlete_relink(pg_temp.u('e1'), 'AAAA-BBBB-CCCC-DDDD-EEEE'), 'requested', 'the right key creates the requests');
select is((select count(*)::int from public.athlete_relink_requests_for_manager(pg_temp.u('e1'))), 2, 'one request per school with times');
reset role;
select is((select count(*)::int from public.athlete_relink_requests where status = 'pending' and athlete_id = pg_temp.u('e1') and former_athlete_id = pg_temp.u('e2')),
  2, 'both are pending, for the swimmer of the family and the marker');
select is((select count(*)::int from public.athlete_relink_requests r where r::text ~* 'AAAA' or r::text ~* 'BBBB-CCCC'), 0, 'no request holds the text of the key');
select is((select count(*)::int from public.athlete_relink_attempts), 0, 'a right key records no failed attempt');
set local role authenticated;
select pg_temp.as_user('a5');
select is(public.request_athlete_relink(pg_temp.u('e1'), ' aaaa bbbb-cccc DDDDEEEE '), 'already_requested', 'spaces, hyphens and case do not matter, and asking again is the same request');

-- 4. A wrong key creates nothing and answers the same whether or not a marker exists.
select pg_temp.as_user('a6');
select is(public.request_athlete_relink(pg_temp.u('e3'), 'FFFF-FFFF-FFFF-FFFF-FFFF'), 'invalid_key', 'a key of no marker is invalid');
select is(public.request_athlete_relink(pg_temp.u('e3'), 'not a key'), 'invalid_key', 'a text that is not shaped like a key is invalid, the same answer');
select is(public.request_athlete_relink(pg_temp.u('e3'), null), 'invalid_key', 'no text is invalid, the same answer');
select is((select count(*)::int from public.athlete_relink_requests_for_manager(pg_temp.u('e3'))), 0, 'a wrong key creates no request');

-- 5. The limit: 5 wrong keys per swimmer (PROVISIONAL); then even the right key is refused and nothing is checked.
select is(public.request_athlete_relink(pg_temp.u('e3'), 'FFFF-FFFF-FFFF-FFFF-FFF0'), 'invalid_key', 'fourth wrong key');
select is(public.request_athlete_relink(pg_temp.u('e3'), 'FFFF-FFFF-FFFF-FFFF-FFF1'), 'invalid_key', 'fifth wrong key');
select is(public.request_athlete_relink(pg_temp.u('e3'), 'AAAA-BBBB-CCCC-DDDD-EEEE'), 'rate_limited', 'past the limit the right key answers rate_limited');
select is((select count(*)::int from public.athlete_relink_requests_for_manager(pg_temp.u('e3'))), 0, 'and creates no request');
reset role;
select is((select count(*)::int from public.athlete_relink_attempts where athlete_id = pg_temp.u('e3')), 5, 'only the five wrong keys are recorded');
set local role authenticated;

-- 6. Who may decide: only an active school_admin of the school that owns the times.
select pg_temp.as_user('a3');
select throws_ok($$select public.resolve_athlete_relink(pg_temp.rid('b1'), true)$$, '42501', null, 'a coach of the school cannot approve');
select throws_ok($$select * from public.school_relink_requests(pg_temp.u('b1'))$$, '42501', null, 'a coach of the school cannot read the inbox');
select pg_temp.as_user('a2');
select throws_ok($$select public.resolve_athlete_relink(pg_temp.rid('b1'), true)$$, '42501', null, 'the admin of another school cannot approve');
select pg_temp.as_user('a4');
select throws_ok($$select public.resolve_athlete_relink(pg_temp.rid('b1'), true)$$, '42501', null, 'an admin with a deactivated membership cannot approve');
select pg_temp.as_user('a5');
select throws_ok($$select public.resolve_athlete_relink(pg_temp.rid('b1'), false)$$, '42501', null, 'the family cannot decide, not even to reject');
select pg_temp.as_user('a1');
select throws_ok($$select public.resolve_athlete_relink('12510000-0000-4000-8000-0000000000ff', true)$$, '42501', null, 'a request that does not exist answers like a refusal');
select is(pg_temp.owner_of('f1') || pg_temp.owner_of('f2') || pg_temp.owner_of('f3'), 'e2e2e2', 'no refusal moved a time');

-- 7. Approving moves the times of that school to the swimmer of the family, even when the swimmer is in no school, and closes the request.
select is((select count(*)::int from public.school_relink_requests(pg_temp.u('b1')) where status = 'pending' and times_count = 2 and athlete_first_name = 'Athlete'),
  1, 'the inbox of school A shows the pending request with the two times and the name of the swimmer');
select is(public.resolve_athlete_relink(pg_temp.rid('b1'), true), '{"status": "approved", "moved": 2}'::jsonb, 'the admin of A approves: two times moved');
select is(pg_temp.owner_of('f1') || pg_temp.owner_of('f3') || pg_temp.owner_of('f2'), 'e1e1e2', 'the times of A are on the swimmer, the time of B stays on the marker');
select is(pg_temp.state('b1'), 'approved:2', 'the request is closed with the count');
select is(public.resolve_athlete_relink(pg_temp.rid('b1'), true), '{"status": "already_resolved"}'::jsonb, 'approving again changes nothing');
select is(pg_temp.owner_of('f1') || pg_temp.owner_of('f3'), 'e1e1', 'and the times are still where they were');

-- 8. Rejecting moves nothing and is final for that request.
select pg_temp.as_user('a2');
select is(public.resolve_athlete_relink(pg_temp.rid('b2'), false), '{"status": "rejected", "moved": 0}'::jsonb, 'the admin of B rejects');
select is(pg_temp.owner_of('f2'), 'e2', 'a rejection moves no time');
select is(public.resolve_athlete_relink(pg_temp.rid('b2'), true), '{"status": "already_resolved"}'::jsonb, 'a rejected request cannot be approved afterwards');
reset role;
select is((select count(*)::int from pg_trigger where tgrelid = 'public.measurements'::regclass and tgenabled <> 'O'), 0, 'the triggers of measurements are back on');

select * from finish();
rollback;
