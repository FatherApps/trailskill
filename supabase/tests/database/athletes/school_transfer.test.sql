-- Transfer to another school (issue #1419), "todo el historial siempre". When the family accepts the invitation of a school for a swimmer
-- that other schools had, the new school reads, read only, through other_school_results, the marks of ALL the previous schools, whatever
-- their age, along the chain (A, B, C: C reads A and B). A school that ended the swimmer (#1243) inside its 30-day read window (#1418)
-- stops reading them at that moment (athlete_schools.read_window_closed_at, the column the helpers and the sync streams read).
-- Swimmers: X (e1) ended in A, family accepts B. Z (e2) ended in A 40 days ago (window already closed), family accepts B.
-- Y (e3) active in A, family accepts B. V (e4) ended in A, B links V without the family. U (e5) ended in A and in C, family accepts B.
-- T (e6) ended in A, family accepts B, B ends T, the family erases the account. S (e7) chain: A, then B, then C.
-- Users: admin SA of A (a1), coach KA of A with X, Y and V direct (a2), admin SB of B (a3), coach KB of B with X assigned in B (a4),
-- guardian G of X, Z, Y, U and S (a5), coach KB2 of B, not assigned (a6), admin SC of C (a7). All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

create function pg_temp.u(text) returns uuid language sql as $$ select ('14190000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
create function pg_temp.at() returns timestamptz language sql as $$ select '2026-11-01 10:00:00+00'::timestamptz $$;
create function pg_temp.text_of(p text) returns uuid language sql as $$
  select id from public.authorization_texts where purpose = p and language = 'es-CO' order by version limit 1 $$;
-- The three objects the app sends; the ids derive from the seed, so a retry sends the same ids.
create function pg_temp.auths(seed text) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('id', md5(seed || p)::uuid, 'purpose', p, 'text_id', pg_temp.text_of(p)) order by p)
  from unnest(array['record_times', 'import_official_results', 'share_results_with_school']) as p $$;
-- What the current user reads of the swimmer through other_school_results, as one line of mark ids.
create function pg_temp.history(athlete text) returns text language sql as $$
  select coalesce(string_agg(right(id::text, 2), ',' order by id), '') from public.other_school_results(pg_temp.u(athlete)) $$;
create function pg_temp.rows_changed(stmt text) returns int language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end;
$$;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'admin-sa@example.test'), (pg_temp.u('a2'), 'coach-ka@example.test'), (pg_temp.u('a3'), 'admin-sb@example.test'),
  (pg_temp.u('a4'), 'coach-kb@example.test'), (pg_temp.u('a5'), 'guardian-g@example.test'), (pg_temp.u('a6'), 'coach-kb2@example.test'),
  (pg_temp.u('a7'), 'admin-sc@example.test'), (pg_temp.u('a8'), 'guardian-h@example.test');
insert into public.schools (id, name) values
  (pg_temp.u('b1'), 'Transfer School A'), (pg_temp.u('b2'), 'Transfer School B'), (pg_temp.u('b3'), 'Transfer School C');
insert into public.training_groups (id, school_id, name) values
  (pg_temp.u('c1'), pg_temp.u('b1'), 'Group A'), (pg_temp.u('c2'), pg_temp.u('b2'), 'Group B'), (pg_temp.u('c3'), pg_temp.u('b3'), 'Group C');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a1'), 'school_admin'), (pg_temp.u('b1'), pg_temp.u('a2'), 'coach'),
  (pg_temp.u('b2'), pg_temp.u('a3'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a4'), 'coach'), (pg_temp.u('b2'), pg_temp.u('a6'), 'coach'),
  (pg_temp.u('b3'), pg_temp.u('a7'), 'school_admin');
insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'X'), (pg_temp.u('e2'), 'Athlete', 'Z'), (pg_temp.u('e3'), 'Athlete', 'Y'),
  (pg_temp.u('e4'), 'Athlete', 'V'), (pg_temp.u('e5'), 'Athlete', 'U'), (pg_temp.u('e6'), 'Athlete', 'T'),
  (pg_temp.u('e7'), 'Athlete', 'S');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a5'), pg_temp.u('e1'), 'guardian'), (pg_temp.u('a5'), pg_temp.u('e2'), 'guardian'),
  (pg_temp.u('a5'), pg_temp.u('e3'), 'guardian'), (pg_temp.u('a5'), pg_temp.u('e5'), 'guardian'),
  (pg_temp.u('a8'), pg_temp.u('e6'), 'guardian'), (pg_temp.u('a5'), pg_temp.u('e7'), 'guardian');
insert into public.athlete_schools (athlete_id, school_id) values
  (pg_temp.u('e1'), pg_temp.u('b1')), (pg_temp.u('e2'), pg_temp.u('b1')), (pg_temp.u('e3'), pg_temp.u('b1')),
  (pg_temp.u('e4'), pg_temp.u('b1')), (pg_temp.u('e5'), pg_temp.u('b1')), (pg_temp.u('e5'), pg_temp.u('b3')),
  (pg_temp.u('e6'), pg_temp.u('b1')), (pg_temp.u('e7'), pg_temp.u('b1'));
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  (pg_temp.u('a2'), pg_temp.u('e1'), pg_temp.u('b1')), (pg_temp.u('a2'), pg_temp.u('e3'), pg_temp.u('b1')),
  (pg_temp.u('a2'), pg_temp.u('e4'), pg_temp.u('b1'));
-- f1 X, f2 Y, f3 V, f4 U and f6 Z recorded in A; f5 U recorded in C. All were captured before the family accepts anything.
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
values
  (pg_temp.u('f1'), pg_temp.u('a2'), pg_temp.u('b1'), 'repetition', pg_temp.u('e1'), 3100, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-ka', '2026-10-01 08:00:00+00'),
  (pg_temp.u('f2'), pg_temp.u('a2'), pg_temp.u('b1'), 'repetition', pg_temp.u('e3'), 3200, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-ka', '2026-10-01 09:00:00+00'),
  (pg_temp.u('f3'), pg_temp.u('a2'), pg_temp.u('b1'), 'repetition', pg_temp.u('e4'), 3300, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-ka', '2026-10-01 10:00:00+00'),
  (pg_temp.u('f4'), pg_temp.u('a2'), pg_temp.u('b1'), 'repetition', pg_temp.u('e5'), 3400, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-ka', '2026-10-01 11:00:00+00'),
  (pg_temp.u('f5'), pg_temp.u('a7'), pg_temp.u('b3'), 'repetition', pg_temp.u('e5'), 3500, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-sc', '2026-10-01 12:00:00+00'),
  (pg_temp.u('f6'), pg_temp.u('a2'), pg_temp.u('b1'), 'repetition', pg_temp.u('e2'), 3600, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-ka', '2026-10-01 13:00:00+00'),
  (pg_temp.u('f8'), pg_temp.u('a2'), pg_temp.u('b1'), 'repetition', pg_temp.u('e6'), 3700, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-ka', '2026-10-01 14:00:00+00'),
  (pg_temp.u('f9'), pg_temp.u('a2'), pg_temp.u('b1'), 'repetition', pg_temp.u('e7'), 3800, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-ka', '2026-10-01 15:00:00+00');

-- The invitations of B and C, made by their admins.
set local role authenticated;
select pg_temp.as_user('a3');
insert into public.school_invitations (id, school_id, group_id) values (pg_temp.u('01'), pg_temp.u('b2'), pg_temp.u('c2'));
select pg_temp.as_user('a7');
insert into public.school_invitations (id, school_id, group_id) values (pg_temp.u('02'), pg_temp.u('b3'), pg_temp.u('c3'));
reset role;
do $$ begin
  perform set_config('test.token', (select token from public.school_invitations where id = '14190000-0000-4000-8000-000000000001'), true);
  perform set_config('test.token_c', (select token from public.school_invitations where id = '14190000-0000-4000-8000-000000000002'), true);
end $$;

select has_column('public', 'athlete_schools', 'transferred_to_school_id', 'athlete_schools has transferred_to_school_id');
select has_table('public', 'athlete_history_grants', 'the grants of the history exist');
select has_function('app', 'athlete_school_window_closed', array['timestamp with time zone'], 'the one-argument window rule of #1418 still exists: other changes call it');
-- It answers from the clock alone, as before: an active link, a link ended 10 days ago and one ended 40 days ago.
select is(app.athlete_school_window_closed(null::timestamptz), false, 'one-argument rule: an active link is not closed');
select is(app.athlete_school_window_closed(now() - interval '10 days'), false, 'one-argument rule: a link ended 10 days ago is not closed');
select is(app.athlete_school_window_closed(now() - interval '40 days'), true, 'one-argument rule: a link ended 40 days ago is closed');

-- A ends X, Z, V and U (the real flow); C ends U. Z is then moved 40 days back and its window is closed by the job.
set local role authenticated;
select pg_temp.as_user('a1');
select public.end_athlete_school(pg_temp.u('e1'), pg_temp.u('b1'));
select public.end_athlete_school(pg_temp.u('e2'), pg_temp.u('b1'));
select public.end_athlete_school(pg_temp.u('e4'), pg_temp.u('b1'));
select public.end_athlete_school(pg_temp.u('e5'), pg_temp.u('b1'));
select pg_temp.as_user('a7');
select public.end_athlete_school(pg_temp.u('e5'), pg_temp.u('b3'));
reset role;
update public.athlete_schools set ended_at = now() - interval '40 days' where athlete_id = pg_temp.u('e2') and school_id = pg_temp.u('b1');
select app.close_athlete_school_read_windows();

set local role authenticated;
select pg_temp.as_user('a1');
select is((select count(*)::int from public.athletes where id = pg_temp.u('e1')), 1, 'day 0 of the baja: the admin of A still reads X');
select pg_temp.as_user('a3');
select is(pg_temp.history('e1'), '', 'before the acceptance the staff of B read nothing of X in A');

-- The family accepts B for X.
select pg_temp.as_user('a5');
select lives_ok(
  format($$ select public.accept_invitation(%L, %L, null, pg_temp.at(), pg_temp.auths('x')) $$, current_setting('test.token'), pg_temp.u('e1')),
  'the family accepts the invitation of B for X');
reset role;
select is(
  (select transferred_to_school_id = pg_temp.u('b2') and read_window_closed_at is not null and read_window_closed_at <= now()
   from public.athlete_schools where athlete_id = pg_temp.u('e1') and school_id = pg_temp.u('b1')),
  true, 'the link of X in A points to B and its window is closed at once, without waiting for 30 days');
-- Every link of the test as <id>:<destination>:<stamped?>, to compare after the repetition (ids and counts, not a timestamp of this transaction).
-- It also lists the grants (count and every source>target@swimmer), so a repetition that added or changed one shows.
create function pg_temp.links() returns text language sql as $$
  select (select count(*) || '|' || coalesce(string_agg(id::text || ':' || coalesce(transferred_to_school_id::text, '-') || ':' || (read_window_closed_at is not null)::text, ',' order by id), '')
          from public.athlete_schools where athlete_id in (pg_temp.u('e1'), pg_temp.u('e2'), pg_temp.u('e3'), pg_temp.u('e4'), pg_temp.u('e5'), pg_temp.u('e6')))
    || '#' ||
         (select count(*) || '|' || coalesce(string_agg(source_school_id::text || '>' || target_school_id::text || '@' || athlete_id::text, ',' order by athlete_id, source_school_id, target_school_id), '')
          from public.athlete_history_grants where athlete_id in (pg_temp.u('e1'), pg_temp.u('e2'), pg_temp.u('e3'), pg_temp.u('e4'), pg_temp.u('e5'), pg_temp.u('e6'))) $$;
-- The owner does the fixture work without a signed-in user (the trigger of the assignment only lets an admin write when there is one).
select set_config('request.jwt.claims', '', true);
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values (pg_temp.u('a4'), pg_temp.u('e1'), pg_temp.u('b2'));

set local role authenticated;
select pg_temp.as_user('a1');
select is((select count(*)::int from public.athletes where id = pg_temp.u('e1')), 0, 'the admin of A stops reading X when the family accepts B');
select is((select count(*)::int from public.measurements where id = pg_temp.u('f1')), 0, 'the admin of A stops reading the marks of X');
select pg_temp.as_user('a2');
select is((select count(*)::int from public.athletes where id = pg_temp.u('e1')) + (select count(*)::int from public.measurements where id = pg_temp.u('f1')), 0,
  'coach KA of A stops reading X and the marks of X');

-- B reads the history of A, read only.
select pg_temp.as_user('a3');
select is(pg_temp.history('e1'), 'f1', 'the admin of B reads the mark of X recorded in A');
select pg_temp.as_user('a4');
select is(pg_temp.history('e1'), 'f1', 'coach KB, who has X assigned in B, reads the mark of X recorded in A');
select pg_temp.as_user('a6');
select is(pg_temp.history('e1'), '', 'coach KB2, who does not have X assigned in B, reads nothing');
select pg_temp.as_user('a7');
select is(pg_temp.history('e1'), '', 'the admin of C, a school that never had X, reads nothing');
select pg_temp.as_user('a3');
select is((select count(*)::int from public.measurements where id = pg_temp.u('f1')), 0, 'B reads the history only through the function: the table of marks still hides it');
select is(pg_temp.rows_changed($$ update public.measurements set hundredths = 1 where id = pg_temp.u('f1') $$), 0, 'B cannot change the mark of X recorded in A');
select throws_ok(
  $$ insert into public.measurements (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values (pg_temp.u('f7'), pg_temp.u('a3'), pg_temp.u('b1'), 'repetition', pg_temp.u('e1'), 3900, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-sb', '2026-11-02 08:00:00+00') $$,
  '42501', null, 'B cannot add a mark to the history of A');
select pg_temp.as_user('a5');
select is((select count(*)::int from public.athletes where id = pg_temp.u('e1')), 1, 'the guardian keeps reading X');
select is((select count(*)::int from public.athlete_schools where athlete_id = pg_temp.u('e1')), 2, 'the guardian keeps reading both links of X');

-- Z: the window of A had already closed (40 days), so no window moves, but B still reads all the history of A: no 30-day condition.
select lives_ok(
  format($$ select public.accept_invitation(%L, %L, null, pg_temp.at(), pg_temp.auths('z')) $$, current_setting('test.token'), pg_temp.u('e2')),
  'the family accepts the invitation of B for Z');
reset role;
select is((select transferred_to_school_id from public.athlete_schools where athlete_id = pg_temp.u('e2') and school_id = pg_temp.u('b1')), null,
  'a window that had already closed is not stamped again');
set local role authenticated;
select pg_temp.as_user('a3');
select is(pg_temp.history('e2'), 'f6', 'B reads the mark of Z recorded in A even though A ended Z 40 days ago');

-- Y is active in A: nothing is lost there.
select pg_temp.as_user('a5');
select lives_ok(
  format($$ select public.accept_invitation(%L, %L, null, pg_temp.at(), pg_temp.auths('y')) $$, current_setting('test.token'), pg_temp.u('e3')),
  'the family accepts the invitation of B for Y');
select pg_temp.as_user('a1');
select is((select count(*)::int from public.athletes where id = pg_temp.u('e3')) + (select count(*)::int from public.measurements where id = pg_temp.u('f2')), 2,
  'Y, active in A and in B at once, keeps the access of A');
select pg_temp.as_user('a3');
select is(pg_temp.history('e3'), 'f2', 'B reads the history of A for Y although A still has Y active: all the history, always');
reset role;
select is((select transferred_to_school_id is null and read_window_closed_at is null from public.athlete_schools where athlete_id = pg_temp.u('e3') and school_id = pg_temp.u('b1')),
  true, 'the active link of Y in A is untouched');
-- Today's behavior for a swimmer still ACTIVE in A who joined B (a product question for the maintainer, not changed here): A keeps the
-- access, and if A ends Y later A gets the full 30-day read window, as for any baja.
set local role authenticated;
select pg_temp.as_user('a1');
select public.end_athlete_school(pg_temp.u('e3'), pg_temp.u('b1'));
select is((select count(*)::int from public.athletes where id = pg_temp.u('e3')) + (select count(*)::int from public.measurements where id = pg_temp.u('f2')), 2,
  'A ends Y after the acceptance: A still reads Y and the marks during its full 30-day window');
reset role;

-- V: B links V without the family. V has a manager and the sharing authorization, so the only thing missing is the acceptance: B gets
-- no grant and reads nothing of A.
select set_config('request.jwt.claims', '', true);
insert into public.athlete_managers (user_id, athlete_id, relation) values (pg_temp.u('a5'), pg_temp.u('e4'), 'guardian');
insert into public.authorizations (user_id, athlete_id, purpose, text_id, accepted_at)
  values (pg_temp.u('a5'), pg_temp.u('e4'), 'share_results_with_school', pg_temp.text_of('share_results_with_school'), now() - interval '1 day');
insert into public.athlete_schools (athlete_id, school_id) values (pg_temp.u('e4'), pg_temp.u('b2'));
select is((select count(*)::int from public.athlete_history_grants where athlete_id = pg_temp.u('e4')), 0, 'linking V without the family creates no grant');
set local role authenticated;
select pg_temp.as_user('a3');
select is(pg_temp.history('e4'), '', 'without the acceptance of the family B reads nothing of A, even with the sharing authorization in force');

-- U: ended in A and in C, both inside their window: both move to B.
select pg_temp.as_user('a5');
select lives_ok(
  format($$ select public.accept_invitation(%L, %L, null, pg_temp.at(), pg_temp.auths('u')) $$, current_setting('test.token'), pg_temp.u('e5')),
  'the family accepts the invitation of B for U');
select pg_temp.as_user('a3');
select is(pg_temp.history('e5'), 'f4,f5', 'B reads the marks of U recorded in A and in C');
select pg_temp.as_user('a1');
select is((select count(*)::int from public.athletes where id = pg_temp.u('e5')), 0, 'the admin of A stops reading U');
select pg_temp.as_user('a7');
select is((select count(*)::int from public.athletes where id = pg_temp.u('e5')), 0, 'the admin of C stops reading U');

-- A retry of the acceptance changes nothing.
reset role;
select set_config('test.links', pg_temp.links(), true);
set local role authenticated;
select pg_temp.as_user('a5');
select lives_ok(
  format($$ select public.accept_invitation(%L, %L, null, pg_temp.at(), pg_temp.auths('x')) $$, current_setting('test.token'), pg_temp.u('e1')),
  'the family repeats the acceptance for X');
reset role;
select is(pg_temp.links(), current_setting('test.links'), 'the repetition leaves the same links, destinations, stamps and grants');
select is(app.transfer_athlete_school_history(pg_temp.u('e1'), pg_temp.u('b2')), 0, 'the transfer closes no window when repeated');
select is(pg_temp.links(), current_setting('test.links'), 'a direct repeat of the transfer leaves the same links and grants');

-- No client role writes the transfer.
set local role authenticated;
-- The admin of B stamps the ACTIVE link of Y in B (an ended link is hidden from client updates by RLS and would change nothing).
select pg_temp.as_user('a3');
select throws_ok(
  $$ update public.athlete_schools set transferred_to_school_id = pg_temp.u('b1') where athlete_id = pg_temp.u('e3') and school_id = pg_temp.u('b2') $$,
  '42501', null, 'a client cannot stamp a transfer on a link');
reset role;

-- The sync streams filter on read_window_closed_at IS NULL: once the job has run, they agree with the helpers on every link of the test.
select app.close_athlete_school_read_windows();
select is((select count(*)::int from public.athlete_schools
  where athlete_id in (pg_temp.u('e1'), pg_temp.u('e2'), pg_temp.u('e3'), pg_temp.u('e4'), pg_temp.u('e5'))
    and (read_window_closed_at is null) <> (not app.athlete_school_window_closed(ended_at, read_window_closed_at))), 0,
  'the stored column and the helpers give the same answer for every link');

-- S: the chain. A ends S, the family accepts B, B records a mark and ends S, the family accepts C: C reads what A and B recorded.
set local role authenticated;
select pg_temp.as_user('a1');
select public.end_athlete_school(pg_temp.u('e7'), pg_temp.u('b1'));
select pg_temp.as_user('a5');
select lives_ok(
  format($$ select public.accept_invitation(%L, %L, null, pg_temp.at(), pg_temp.auths('s-b')) $$, current_setting('test.token'), pg_temp.u('e7')),
  'the family accepts the invitation of B for S');
select pg_temp.as_user('a3');
select is(pg_temp.history('e7'), 'f9', 'B reads the mark of S recorded in A');
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
values
  (pg_temp.u('fa'), pg_temp.u('a4'), pg_temp.u('b2'), 'repetition', pg_temp.u('e7'), 3900, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-kb', '2026-11-02 09:00:00+00');
set local role authenticated;
select pg_temp.as_user('a3');
select public.end_athlete_school(pg_temp.u('e7'), pg_temp.u('b2'));
select pg_temp.as_user('a5');
select lives_ok(
  format($$ select public.accept_invitation(%L, %L, null, pg_temp.at(), pg_temp.auths('s-c')) $$, current_setting('test.token_c'), pg_temp.u('e7')),
  'the family accepts the invitation of C for S');
select pg_temp.as_user('a7');
select is(pg_temp.history('e7'), 'f9,fa', 'C reads what A and B recorded for S: the whole chain');
select throws_ok($$ select * from public.athlete_history_grants $$, '42501', null, 'a client has no privilege on the grants table');
reset role;
select is((select count(*)::int from public.athlete_history_grants where athlete_id = pg_temp.u('e7')), 3, 'three grants: A to B, A to C and B to C');
select is((select transferred_to_school_id from public.athlete_schools where athlete_id = pg_temp.u('e7') and school_id = pg_temp.u('b2')), pg_temp.u('b3'),
  'the link of S that B ended points to C, and its window closes at once');

-- T: the family accepts B, B ends T, and the family then erases their account. The authorizations are erased with it and T stays in A
-- as a marker without identity, so B no longer reads what A recorded.
set local role authenticated;
select pg_temp.as_user('a1');
select public.end_athlete_school(pg_temp.u('e6'), pg_temp.u('b1'));
select pg_temp.as_user('a8');
select public.accept_invitation(current_setting('test.token'), pg_temp.u('e6'), null, pg_temp.at(), pg_temp.auths('t'));
select pg_temp.as_user('a3');
select is(pg_temp.history('e6'), 'f8', 'B reads the mark of T recorded in A before the family erases the account');
select public.end_athlete_school(pg_temp.u('e6'), pg_temp.u('b2'));
reset role;
select set_config('request.jwt.claims', '', true);
create temp table req on commit drop as select public.request_account_deletion(pg_temp.u('a8')) ->> 'code' as code;
select public.confirm_account_deletion(pg_temp.u('a8'), (select code from req));
update public.account_deletion_requests set delete_after = now() - interval '1 day' where user_id = pg_temp.u('a8');
select is((public.erase_account((select id from public.account_deletion_requests where user_id = pg_temp.u('a8'))) ->> 'status'), 'deleted',
  'the family of T erases the account');
set local role authenticated;
select pg_temp.as_user('a3');
select is(pg_temp.history('e6'), '', 'after the erasure B no longer reads what A recorded for T');
reset role;

-- The family withdraws the sharing authorization: B stops reading the history of A.
set local role authenticated;
select pg_temp.as_user('a5');
select lives_ok($$ update public.authorizations set withdrawn_at = now() where id = md5('x' || 'share_results_with_school')::uuid $$,
  'the family withdraws share_results_with_school for X');
select pg_temp.as_user('a3');
select is(pg_temp.history('e1'), '', 'without the sharing authorization B stops reading the history of X');

select * from finish();
rollback;
