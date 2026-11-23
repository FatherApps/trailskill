-- Transfer to another school (issue #1419). When the family accepts the invitation of school B for a swimmer that school A ended (#1243)
-- inside its 30-day read window (#1418), A's window closes at that moment (athlete_schools.read_window_closed_at, the column the
-- helpers and the sync streams read) and the staff of B read the swimmer's marks recorded in A, read only, through other_school_results.
-- Swimmers: X (e1) ended in A, family accepts B. Z (e2) ended in A 40 days ago (window already closed), family accepts B.
-- Y (e3) active in A, family accepts B. V (e4) ended in A, B links V without the family. U (e5) ended in A and in C, family accepts B.
-- Users: admin SA of A (a1), coach KA of A with X, Y and V direct (a2), admin SB of B (a3), coach KB of B with X assigned in B (a4),
-- guardian G of X, Z, Y and U (a5), coach KB2 of B, not assigned (a6), admin SC of C (a7). All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

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
insert into public.training_groups (id, school_id, name) values (pg_temp.u('c1'), pg_temp.u('b1'), 'Group A'), (pg_temp.u('c2'), pg_temp.u('b2'), 'Group B');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a1'), 'school_admin'), (pg_temp.u('b1'), pg_temp.u('a2'), 'coach'),
  (pg_temp.u('b2'), pg_temp.u('a3'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a4'), 'coach'), (pg_temp.u('b2'), pg_temp.u('a6'), 'coach'),
  (pg_temp.u('b3'), pg_temp.u('a7'), 'school_admin');
insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'X'), (pg_temp.u('e2'), 'Athlete', 'Z'), (pg_temp.u('e3'), 'Athlete', 'Y'),
  (pg_temp.u('e4'), 'Athlete', 'V'), (pg_temp.u('e5'), 'Athlete', 'U'), (pg_temp.u('e6'), 'Athlete', 'T');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a5'), pg_temp.u('e1'), 'guardian'), (pg_temp.u('a5'), pg_temp.u('e2'), 'guardian'),
  (pg_temp.u('a5'), pg_temp.u('e3'), 'guardian'), (pg_temp.u('a5'), pg_temp.u('e5'), 'guardian'),
  (pg_temp.u('a8'), pg_temp.u('e6'), 'guardian');
insert into public.athlete_schools (athlete_id, school_id) values
  (pg_temp.u('e1'), pg_temp.u('b1')), (pg_temp.u('e2'), pg_temp.u('b1')), (pg_temp.u('e3'), pg_temp.u('b1')),
  (pg_temp.u('e4'), pg_temp.u('b1')), (pg_temp.u('e5'), pg_temp.u('b1')), (pg_temp.u('e5'), pg_temp.u('b3')),
  (pg_temp.u('e6'), pg_temp.u('b1'));
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
  (pg_temp.u('f8'), pg_temp.u('a2'), pg_temp.u('b1'), 'repetition', pg_temp.u('e6'), 3700, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-ka', '2026-10-01 14:00:00+00');

-- The invitation of B, made by its admin.
set local role authenticated;
select pg_temp.as_user('a3');
insert into public.school_invitations (id, school_id, group_id) values (pg_temp.u('01'), pg_temp.u('b2'), pg_temp.u('c2'));
reset role;
do $$ begin
  perform set_config('test.token', (select token from public.school_invitations where id = '14190000-0000-4000-8000-000000000001'), true);
end $$;

select has_column('public', 'athlete_schools', 'transferred_to_school_id', 'athlete_schools has transferred_to_school_id');
select hasnt_function('app', 'athlete_school_window_closed', array['timestamp with time zone'], 'the one-argument window rule of #1418 is gone');

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
select set_config('test.closed_at', (select read_window_closed_at::text from public.athlete_schools where athlete_id = pg_temp.u('e1') and school_id = pg_temp.u('b1')), true);
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

-- Z: the window of A had already closed, so nothing moves. The family accepts B all the same.
select lives_ok(
  format($$ select public.accept_invitation(%L, %L, null, pg_temp.at(), pg_temp.auths('z')) $$, current_setting('test.token'), pg_temp.u('e2')),
  'the family accepts the invitation of B for Z');
reset role;
select is((select transferred_to_school_id from public.athlete_schools where athlete_id = pg_temp.u('e2') and school_id = pg_temp.u('b1')), null,
  'a window that had already closed is not transferred');
set local role authenticated;
select pg_temp.as_user('a3');
select is(pg_temp.history('e2'), '', 'B reads nothing of Z recorded in A');

-- Y is active in A: nothing is lost there.
select pg_temp.as_user('a5');
select lives_ok(
  format($$ select public.accept_invitation(%L, %L, null, pg_temp.at(), pg_temp.auths('y')) $$, current_setting('test.token'), pg_temp.u('e3')),
  'the family accepts the invitation of B for Y');
select pg_temp.as_user('a1');
select is((select count(*)::int from public.athletes where id = pg_temp.u('e3')) + (select count(*)::int from public.measurements where id = pg_temp.u('f2')), 2,
  'Y, active in A and in B at once, keeps the access of A');
reset role;
select is((select transferred_to_school_id is null and read_window_closed_at is null from public.athlete_schools where athlete_id = pg_temp.u('e3') and school_id = pg_temp.u('b1')),
  true, 'the active link of Y in A is untouched');

-- V: B links V without the family: B reads nothing of A.
insert into public.athlete_schools (athlete_id, school_id) values (pg_temp.u('e4'), pg_temp.u('b2'));
set local role authenticated;
select pg_temp.as_user('a3');
select is(pg_temp.history('e4'), '', 'without the acceptance of the family B reads nothing of A');

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
select pg_temp.as_user('a5');
select lives_ok(
  format($$ select public.accept_invitation(%L, %L, null, pg_temp.at(), pg_temp.auths('x')) $$, current_setting('test.token'), pg_temp.u('e1')),
  'the family repeats the acceptance for X');
reset role;
select is((select read_window_closed_at::text from public.athlete_schools where athlete_id = pg_temp.u('e1') and school_id = pg_temp.u('b1')),
  current_setting('test.closed_at'), 'the repetition keeps the moment the window closed');
select is(app.transfer_athlete_school_history(pg_temp.u('e1'), pg_temp.u('b2')), 0, 'the transfer is idempotent');

-- No client role writes the transfer.
set local role authenticated;
select pg_temp.as_user('a1');
select throws_ok(
  $$ update public.athlete_schools set transferred_to_school_id = pg_temp.u('b2') where athlete_id = pg_temp.u('e3') and school_id = pg_temp.u('b1') $$,
  '42501', null, 'a client cannot stamp a transfer on a link');
reset role;

-- The sync streams filter on read_window_closed_at IS NULL: once the job has run, they agree with the helpers on every link of the test.
select app.close_athlete_school_read_windows();
select is((select count(*)::int from public.athlete_schools
  where athlete_id in (pg_temp.u('e1'), pg_temp.u('e2'), pg_temp.u('e3'), pg_temp.u('e4'), pg_temp.u('e5'))
    and (read_window_closed_at is null) <> (not app.athlete_school_window_closed(ended_at, read_window_closed_at))), 0,
  'the stored column and the helpers give the same answer for every link');

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
