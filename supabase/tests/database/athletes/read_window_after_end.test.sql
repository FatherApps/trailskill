-- Read window after a baja (issue #1418). After a school ends a swimmer's link (athlete_schools.ended_at, #1243) its coaches and
-- admins keep READING that swimmer, the marks and the history for 30 days; every write stays cut from the baja on. The window
-- is counted from ended_at, it is closed (ended_at + 30 days is no longer inside), and a stored column,
-- athlete_schools.read_window_closed_at, is what the sync streams filter on: PowerSync does not re-evaluate time, so
-- app.close_athlete_school_read_windows() (a scheduled job) stamps it once the 30 days pass. Online (RLS) the rule reads the clock.
-- Users: admin SA of A (a2), admin SB of B (a3), coach K of A with X and W direct (a4), coach C of A through group gA (a5),
-- coach E of B with X direct in B (aa), admin AB of A and B (ab), guardian G of X (a7).
-- Athletes: X (e1) in A and B, W (e3) in A only (never ended). Groups: gA (c1) in A holds X and W, gB (c2) in B holds X, gC (c3)
-- in A is empty. Marks: f1 of X in A (by K), f2 of X in B (by E), f3 of W in A (by K).
-- The days are simulated by moving ended_at back, as the table owner. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

create function pg_temp.u(text) returns uuid language sql as $$ select ('14180000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- What the current user reads of X and W, as one line: athletes, enrollment rows (<athlete>:<school>), group rows
-- (<athlete>:<group>) and marks.
create function pg_temp.seen() returns text language sql as $$
  select 'athletes=' || coalesce((select string_agg(right(id::text, 2), ',' order by id) from public.athletes where id in (pg_temp.u('e1'), pg_temp.u('e3'))), '')
    || '|schools=' || coalesce((select string_agg(right(athlete_id::text, 2) || ':' || right(school_id::text, 2), ',' order by athlete_id, school_id) from public.athlete_schools where athlete_id in (pg_temp.u('e1'), pg_temp.u('e3'))), '')
    || '|groups=' || coalesce((select string_agg(right(athlete_id::text, 2) || ':' || right(group_id::text, 2), ',' order by athlete_id, group_id) from public.athlete_groups where athlete_id in (pg_temp.u('e1'), pg_temp.u('e3'))), '')
    || '|marks=' || coalesce((select string_agg(right(id::text, 2), ',' order by id) from public.measurements where id in (pg_temp.u('f1'), pg_temp.u('f2'), pg_temp.u('f3'))), '') $$;
-- Rows a write statement changes under the current role (RLS filters silently on update and delete).
create function pg_temp.rows_changed(stmt text) returns int language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end;
$$;
-- Moves X's link with A to <days> days ago (the table owner only: no client role writes ended_at).
create function pg_temp.age_link(days numeric) returns void language plpgsql as $$
begin
  reset role;
  update public.athlete_schools set ended_at = now() - make_interval(secs => days * 86400)
    where athlete_id = pg_temp.u('e1') and school_id = pg_temp.u('b1');
  set local role authenticated;
end;
$$;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'platform-p@example.test'), (pg_temp.u('a2'), 'admin-sa@example.test'), (pg_temp.u('a3'), 'admin-sb@example.test'),
  (pg_temp.u('a4'), 'coach-k@example.test'), (pg_temp.u('a5'), 'coach-c@example.test'),
  (pg_temp.u('aa'), 'coach-e@example.test'), (pg_temp.u('ab'), 'admin-ab@example.test'),
  (pg_temp.u('a7'), 'guardian-g@example.test');
insert into public.schools (id, name) values (pg_temp.u('b1'), 'Window School A'), (pg_temp.u('b2'), 'Window School B');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a2'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a3'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a4'), 'coach'), (pg_temp.u('b1'), pg_temp.u('a5'), 'coach'),
  (pg_temp.u('b2'), pg_temp.u('aa'), 'coach'),
  (pg_temp.u('b1'), pg_temp.u('ab'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('ab'), 'school_admin');
insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'X'), (pg_temp.u('e3'), 'Athlete', 'W');
insert into public.athlete_schools (athlete_id, school_id) values
  (pg_temp.u('e1'), pg_temp.u('b1')), (pg_temp.u('e1'), pg_temp.u('b2')), (pg_temp.u('e3'), pg_temp.u('b1'));
insert into public.athlete_managers (user_id, athlete_id, relation) values (pg_temp.u('a7'), pg_temp.u('e1'), 'guardian');
insert into public.training_groups (id, school_id, name) values
  (pg_temp.u('c1'), pg_temp.u('b1'), 'Group A'), (pg_temp.u('c2'), pg_temp.u('b2'), 'Group B'), (pg_temp.u('c3'), pg_temp.u('b1'), 'Group C');
insert into public.athlete_groups (athlete_id, group_id) values
  (pg_temp.u('e1'), pg_temp.u('c1')), (pg_temp.u('e3'), pg_temp.u('c1')), (pg_temp.u('e1'), pg_temp.u('c2'));
insert into public.coach_group_assignments (coach_user_id, group_id) values (pg_temp.u('a5'), pg_temp.u('c1'));
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  (pg_temp.u('a4'), pg_temp.u('e1'), pg_temp.u('b1')), (pg_temp.u('a4'), pg_temp.u('e3'), pg_temp.u('b1')),
  (pg_temp.u('aa'), pg_temp.u('e1'), pg_temp.u('b2'));
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
values
  (pg_temp.u('f1'), pg_temp.u('a4'), pg_temp.u('b1'), 'repetition', pg_temp.u('e1'), 3100, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 08:00:00+00'),
  (pg_temp.u('f2'), pg_temp.u('aa'), pg_temp.u('b2'), 'repetition', pg_temp.u('e1'), 3200, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-e', '2026-11-01 09:00:00+00'),
  (pg_temp.u('f3'), pg_temp.u('a4'), pg_temp.u('b1'), 'repetition', pg_temp.u('e3'), 3300, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 10:00:00+00');

select has_column('public', 'athlete_schools', 'read_window_closed_at', 'athlete_schools has read_window_closed_at');
select is(app.athlete_school_read_window(), interval '30 days', 'the read window is 30 days, in one place');
select is((select count(*)::int from public.athlete_schools where athlete_id in (pg_temp.u('e1'), pg_temp.u('e3')) and read_window_closed_at is not null), 0,
  'no link starts with a closed window');

-- 1. Day 0: the admin of A ends X in A (the real flow). Staff of A keep reading X; B, the double admin and the guardian are as before.
set local role authenticated;
select pg_temp.as_user('a2');
select public.end_athlete_school(pg_temp.u('e1'), pg_temp.u('b1'));
select is(pg_temp.seen(), 'athletes=e1,e3|schools=e1:b1,e3:b1|groups=e1:c1,e3:c1|marks=f1,f3', 'day 0: the admin of A still reads X and W');
select pg_temp.as_user('a4');
select is(pg_temp.seen(), 'athletes=e1,e3|schools=e1:b1,e3:b1|groups=e1:c1,e3:c1|marks=f1,f3', 'day 0: coach K (direct) still reads X and W');
select pg_temp.as_user('a5');
select is(pg_temp.seen(), 'athletes=e1,e3|schools=e1:b1,e3:b1|groups=e1:c1,e3:c1|marks=f1,f3', 'day 0: coach C (through group gA) still reads X and W');
select pg_temp.as_user('ab');
select is(pg_temp.seen(), 'athletes=e1,e3|schools=e1:b1,e1:b2,e3:b1|groups=e1:c1,e1:c2,e3:c1|marks=f1,f2,f3', 'day 0: the admin of A and B reads everything');
select pg_temp.as_user('aa');
select is(pg_temp.seen(), 'athletes=e1|schools=e1:b2|groups=e1:c2|marks=f2', 'day 0: coach E of B reads X through B, as before');
select pg_temp.as_user('a3');
select is(pg_temp.seen(), 'athletes=e1|schools=e1:b2|groups=e1:c2|marks=f2', 'day 0: the admin of B reads X through B, as before');
select pg_temp.as_user('a7');
select is(pg_temp.seen(), 'athletes=e1|schools=e1:b1,e1:b2|groups=e1:c1,e1:c2|marks=', 'day 0: the guardian reads X, the ended link included');

-- 2. Day 29: the same reads.
select pg_temp.age_link(29);
select pg_temp.as_user('a2');
select is(pg_temp.seen(), 'athletes=e1,e3|schools=e1:b1,e3:b1|groups=e1:c1,e3:c1|marks=f1,f3', 'day 29: the admin of A reads X, the enrollment, the groups and the marks');
select pg_temp.as_user('a4');
select is(pg_temp.seen(), 'athletes=e1,e3|schools=e1:b1,e3:b1|groups=e1:c1,e3:c1|marks=f1,f3', 'day 29: coach K (direct) reads X');
select pg_temp.as_user('a5');
select is(pg_temp.seen(), 'athletes=e1,e3|schools=e1:b1,e3:b1|groups=e1:c1,e3:c1|marks=f1,f3', 'day 29: coach C (through group gA) reads X');
select pg_temp.as_user('ab');
select is(pg_temp.seen(), 'athletes=e1,e3|schools=e1:b1,e1:b2,e3:b1|groups=e1:c1,e1:c2,e3:c1|marks=f1,f2,f3', 'day 29: the admin of A and B reads X in both schools');
select pg_temp.as_user('aa');
select is(pg_temp.seen(), 'athletes=e1|schools=e1:b2|groups=e1:c2|marks=f2', 'day 29: coach E of B is unchanged');
select pg_temp.as_user('a2');
select is((select count(*)::int from public.athletes where id = pg_temp.u('e1')), 1, 'day 29: the admin of A reads the athlete row of X');

-- 3. Day 29: every write is cut from the baja on.
select throws_ok(
  $$insert into public.measurements (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
    values (pg_temp.u('f6'), pg_temp.u('a2'), pg_temp.u('b1'), 'repetition', pg_temp.u('e1'), 3450, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-sa', '2026-11-02 08:02:00+00')$$,
  '42501', null, 'day 29: the admin of A cannot record a mark for X');
select pg_temp.as_user('a4');
select throws_ok(
  $$insert into public.measurements (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
    values (pg_temp.u('f4'), pg_temp.u('a4'), pg_temp.u('b1'), 'repetition', pg_temp.u('e1'), 3400, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-02 08:00:00+00')$$,
  '42501', null, 'day 29: coach K cannot record a mark for X');
select lives_ok(
  $$insert into public.measurements (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
    values (pg_temp.u('f5'), pg_temp.u('a4'), pg_temp.u('b1'), 'repetition', pg_temp.u('e3'), 3500, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-02 08:01:00+00')$$,
  'day 29: coach K still records a mark for W, active in A');
select throws_ok($$update public.measurements set hundredths = 3111 where id = pg_temp.u('f1')$$, '42501', null, 'day 29: coach K cannot change the time of X, not even the mark they recorded');
select pg_temp.as_user('a5');
select is(pg_temp.rows_changed($$update public.measurements set hundredths = 3112 where id = pg_temp.u('f1')$$), 0, 'day 29: coach C changes no mark of X');
select pg_temp.as_user('a2');
select is(pg_temp.rows_changed($$update public.measurements set hundredths = 3113, edit_reason = 'late correction' where id = pg_temp.u('f1')$$), 0, 'day 29: the admin of A changes no mark of X');
select is(pg_temp.rows_changed($$update public.measurements set hundredths = 3301, edit_reason = 'still active' where id = pg_temp.u('f3')$$), 1, 'day 29: the admin of A still corrects a mark of W');
select is(app.can_assign_training_plan(pg_temp.u('b1'), 'athlete', pg_temp.u('e1'), null), false, 'day 29: the admin of A cannot assign a plan to X');
select is(app.can_assign_training_plan(pg_temp.u('b1'), 'athlete', pg_temp.u('e3'), null), true, 'day 29: the admin of A still assigns a plan to W');
select throws_ok($$select public.request_result_sharing(pg_temp.u('e1'), pg_temp.u('b1'))$$, '42501', null, 'day 29: the admin of A cannot request a sharing for X');
select is(pg_temp.rows_changed($$update public.athlete_schools set category_id = null where athlete_id = pg_temp.u('e1') and school_id = pg_temp.u('b1')$$), 0, 'day 29: the admin of A cannot edit the link of X');
select is(pg_temp.rows_changed($$delete from public.athlete_schools where athlete_id = pg_temp.u('e1') and school_id = pg_temp.u('b1')$$), 0, 'day 29: the admin of A cannot delete the link of X');
select is(pg_temp.rows_changed($$delete from public.athlete_groups where athlete_id = pg_temp.u('e1') and group_id = pg_temp.u('c1')$$), 0, 'day 29: the admin of A cannot take X out of a group');
select throws_ok($$insert into public.athlete_groups (athlete_id, group_id) values (pg_temp.u('e1'), pg_temp.u('c3'))$$, '42501', null, 'day 29: the admin of A cannot put X in a group');
select lives_ok($$insert into public.athlete_groups (athlete_id, group_id) values (pg_temp.u('e3'), pg_temp.u('c3'))$$, 'day 29: the admin of A still puts W in a group');
select pg_temp.as_user('a4');
select is(app.can_assign_training_plan(pg_temp.u('b1'), 'athlete', pg_temp.u('e1'), null), false, 'day 29: coach K cannot assign a plan to X');
select is(app.coach_has_athlete_in_school_active(pg_temp.u('e1'), pg_temp.u('b1')), false, 'day 29: coach K is no active coach of X in A');
select is(app.coach_has_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1')), true, 'day 29: coach K still reads X in A');
select is(app.coach_has_athlete_in_school_active(pg_temp.u('e3'), pg_temp.u('b1')), true, 'day 29: coach K is an active coach of W in A');
select pg_temp.as_user('ab');
select is(app.admin_has_athlete_in_school_active(pg_temp.u('e1'), pg_temp.u('b1')), false, 'day 29: the admin of A and B is no active admin of X in A');
select is(app.admin_has_athlete_in_school(pg_temp.u('e1'), pg_temp.u('b1')), true, 'day 29: the admin of A and B still reads X in A');
select is(app.admin_has_athlete_in_school_active(pg_temp.u('e1'), pg_temp.u('b2')), true, 'day 29: the admin of A and B is an active admin of X in B');
select pg_temp.as_user('aa');
select lives_ok(
  $$insert into public.measurements (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
    values (pg_temp.u('f7'), pg_temp.u('aa'), pg_temp.u('b2'), 'repetition', pg_temp.u('e1'), 3600, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-e', '2026-11-02 09:00:00+00')$$,
  'day 29: coach E of B, where the link is active, still records a mark for X');

-- 4. The edge of the window: ended_at + 30 days is not inside it.
select pg_temp.age_link(30 - 1.0 / 86400);
select pg_temp.as_user('a2');
select is((select count(*)::int from public.athletes where id = pg_temp.u('e1')), 1, 'one second before day 30 the admin of A still reads X');
select pg_temp.age_link(30);
select is((select count(*)::int from public.athletes where id = pg_temp.u('e1')), 0, 'at exactly 30 days the window is closed');

-- 5. Day 31, before the job runs (RLS reads the clock): staff of A lose X, the rest is as before.
select pg_temp.age_link(31);
select is(pg_temp.seen(), 'athletes=e3|schools=e3:b1|groups=e3:c1,e3:c3|marks=f3', 'day 31: the admin of A reads only W');
select pg_temp.as_user('a4');
select is(pg_temp.seen(), 'athletes=e3|schools=e3:b1|groups=e3:c1,e3:c3|marks=f3', 'day 31: coach K (direct) reads only W');
select pg_temp.as_user('a5');
select is(pg_temp.seen(), 'athletes=e3|schools=e3:b1|groups=e3:c1,e3:c3|marks=f3', 'day 31: coach C (through group gA) reads only W');
select pg_temp.as_user('ab');
select is(pg_temp.seen(), 'athletes=e1,e3|schools=e1:b2,e3:b1|groups=e1:c2,e3:c1,e3:c3|marks=f2,f3', 'day 31: the admin of A and B reads X only through B');
select pg_temp.as_user('aa');
select is(pg_temp.seen(), 'athletes=e1|schools=e1:b2|groups=e1:c2|marks=f2', 'day 31: coach E of B is unchanged');
select pg_temp.as_user('a7');
select is(pg_temp.seen(), 'athletes=e1|schools=e1:b1,e1:b2|groups=e1:c1,e1:c2|marks=', 'day 31: the guardian still reads X, the ended link included');

-- 6. The stored column that closes the window on the device.
reset role;
insert into public.athletes (id, first_name, last_name) values (pg_temp.u('e4'), 'Athlete', 'Z'), (pg_temp.u('e5'), 'Athlete', 'V');
insert into public.athlete_schools (athlete_id, school_id, ended_at, ended_by) values
  (pg_temp.u('e4'), pg_temp.u('b2'), now() - interval '29 days', pg_temp.u('a3')),
  (pg_temp.u('e5'), pg_temp.u('b2'), now() - interval '40 days', pg_temp.u('a3'));
select is(app.close_athlete_school_read_windows(), 2, 'the job closes the two links ended more than 30 days ago');
select is(
  (select string_agg(right(athlete_id::text, 2) || ':' || right(school_id::text, 2), ',' order by athlete_id, school_id)
   from public.athlete_schools where read_window_closed_at is not null and athlete_id in (pg_temp.u('e1'), pg_temp.u('e3'), pg_temp.u('e4'), pg_temp.u('e5'))),
  'e1:b1,e5:b2', 'only those two links carry the closed window');
select is(
  (select bool_and(read_window_closed_at = ended_at + interval '30 days') from public.athlete_schools where read_window_closed_at is not null and athlete_id in (pg_temp.u('e1'), pg_temp.u('e5'))),
  true, 'the stamp is the moment the window closed (ended_at + 30 days), not the time of the run');
select is(app.close_athlete_school_read_windows(), 0, 'running the job again changes nothing');
select is((select read_window_closed_at from public.athlete_schools where athlete_id = pg_temp.u('e4')), null, 'a link ended 29 days ago stays open');
select is((select read_window_closed_at from public.athlete_schools where athlete_id = pg_temp.u('e3')), null, 'an active link is never closed');
select throws_ok($$update public.athlete_schools set read_window_closed_at = now() where athlete_id = pg_temp.u('e3')$$, '23514', null, 'an active link cannot carry a closed window');
select throws_ok($$update public.athlete_schools set read_window_closed_at = ended_at + interval '10 days' where athlete_id = pg_temp.u('e4')$$, '23514', null, 'the window cannot be closed before its 30 days');
-- 7. No client role writes the column or runs the job. Rows the roles can update (active links) and a platform admin make
-- the guard, not the check or the policies, the reason of each refusal.
insert into public.platform_admins (user_id) values (pg_temp.u('a1'));
set local role authenticated;
select pg_temp.as_user('a3');
select throws_ok($$update public.athlete_schools set read_window_closed_at = now() where athlete_id = pg_temp.u('e1') and school_id = pg_temp.u('b2')$$, '42501', null, 'an admin cannot write read_window_closed_at');
select pg_temp.as_user('a1');
select throws_ok($$update public.athlete_schools set read_window_closed_at = null where athlete_id = pg_temp.u('e5') and school_id = pg_temp.u('b2')$$, '42501', null, 'not even the platform admin reopens a closed window');
select throws_ok($$insert into public.athlete_schools (athlete_id, school_id, read_window_closed_at) values (pg_temp.u('e5'), pg_temp.u('b1'), now())$$, '42501', null, 'a link cannot be inserted with a closed window');
reset role;
select is(has_function_privilege('authenticated', 'app.close_athlete_school_read_windows()', 'execute'), false, 'authenticated cannot run the job');
select is(has_function_privilege('anon', 'app.close_athlete_school_read_windows()', 'execute'), false, 'anon cannot run the job');
select is(has_function_privilege('authenticated', 'app.schedule_athlete_school_read_window_job()', 'execute'), false, 'authenticated cannot schedule the job');

-- 8. Scheduling does nothing without pg_cron and never fails the caller.
select is(
  case when exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then null else app.schedule_athlete_school_read_window_job() end,
  case when exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then null else 0 end,
  'without pg_cron the scheduling function returns 0');
select is(
  (select count(*)::int from pg_catalog.pg_proc p where p.pronamespace = 'app'::regnamespace and p.proname = 'schedule_family_timing_jobs'
     and p.prosrc like '%schedule_athlete_school_read_window_job%'),
  1, 'the deploy hook app.schedule_family_timing_jobs() also schedules the job');

select * from finish();
rollback;
