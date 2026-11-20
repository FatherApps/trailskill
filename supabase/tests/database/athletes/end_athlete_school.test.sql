-- Ending a swimmer's link with a school (issue #1243). public.end_athlete_school(athlete, school) is the only way to set
-- athlete_schools.ended_at and ended_by: only an active school_admin of that school may call it, the server stamps the
-- time and the caller, and no role writes the columns directly. After the baja the coaches and admins of that school no
-- longer read the swimmer, online (RLS) or in the sync; guardians and adult athletes keep reading. Nothing is deleted.
-- Users: platform admin P (a1), admin SA of A (a2), admin SB of B (a3), coach K of A with X and W direct (a4), coach C of
-- A through group gA (a5), DA an admin of A whose membership is deactivated (a6), guardian G of X (a7), adult athlete AA
-- of Y (a8), N with no role (a9), coach E of B with X direct in B (aa), admin AB of A and B (ab).
-- Athletes: X in A and B (guardian G), Y in A (adult athlete AA), W in A only (control, never ended).
-- Groups: gA (c1) in A holds X, Y and W; gB (c2) in B holds X. Marks: m1 of X in A, m2 of X in B, m3 of W in A.
-- All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- u('a1') is the uuid 12430000-0000-4000-8000-0000000000a1; as_user sets the signed-in user.
create function pg_temp.u(text) returns uuid language sql as $$ select ('12430000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- What the current user reads of the fixture, as one line: athletes, enrollment rows (<athlete>:<school>), group rows
-- (<athlete>:<group>) and marks.
create function pg_temp.seen() returns text language sql as $$
  select 'athletes=' || coalesce((select string_agg(right(id::text, 2), ',' order by id) from public.athletes where id::text like '12430000%'), '')
    || '|schools=' || coalesce((select string_agg(right(athlete_id::text, 2) || ':' || right(school_id::text, 2), ',' order by athlete_id, school_id) from public.athlete_schools where athlete_id::text like '12430000%'), '')
    || '|groups=' || coalesce((select string_agg(right(athlete_id::text, 2) || ':' || right(group_id::text, 2), ',' order by athlete_id, group_id) from public.athlete_groups where athlete_id::text like '12430000%'), '')
    || '|marks=' || coalesce((select string_agg(right(id::text, 2), ',' order by id) from public.measurements where id::text like '12430000%'), '') $$;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'platform-p@example.test'), (pg_temp.u('a2'), 'admin-sa@example.test'),
  (pg_temp.u('a3'), 'admin-sb@example.test'), (pg_temp.u('a4'), 'coach-k@example.test'),
  (pg_temp.u('a5'), 'coach-c@example.test'), (pg_temp.u('a6'), 'admin-da@example.test'),
  (pg_temp.u('a7'), 'guardian-g@example.test'), (pg_temp.u('a8'), 'adult-aa@example.test'),
  (pg_temp.u('a9'), 'nobody-n@example.test'), (pg_temp.u('aa'), 'coach-e@example.test'),
  (pg_temp.u('ab'), 'admin-ab@example.test');
insert into public.platform_admins (user_id) values (pg_temp.u('a1'));
insert into public.schools (id, name) values (pg_temp.u('b1'), 'End School A'), (pg_temp.u('b2'), 'End School B');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a2'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a3'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a4'), 'coach'), (pg_temp.u('b1'), pg_temp.u('a5'), 'coach'),
  (pg_temp.u('b1'), pg_temp.u('a6'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('aa'), 'coach'),
  (pg_temp.u('b1'), pg_temp.u('ab'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('ab'), 'school_admin');
-- A deactivated admin cannot be built through the table check (only coaches are deactivated), so it is lifted here and
-- rolled back with the transaction: the function must still refuse a membership with deactivated_at set.
alter table public.school_memberships drop constraint school_memberships_deactivated_coach_only;
update public.school_memberships set deactivated_at = now() where school_id = pg_temp.u('b1') and user_id = pg_temp.u('a6');

insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'X'), (pg_temp.u('e2'), 'Athlete', 'Y'), (pg_temp.u('e3'), 'Athlete', 'W');
insert into public.athlete_schools (athlete_id, school_id) values
  (pg_temp.u('e1'), pg_temp.u('b1')), (pg_temp.u('e1'), pg_temp.u('b2')),
  (pg_temp.u('e2'), pg_temp.u('b1')), (pg_temp.u('e3'), pg_temp.u('b1'));
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a7'), pg_temp.u('e1'), 'guardian'), (pg_temp.u('a8'), pg_temp.u('e2'), 'self');
insert into public.training_groups (id, school_id, name) values
  (pg_temp.u('c1'), pg_temp.u('b1'), 'Group A'), (pg_temp.u('c2'), pg_temp.u('b2'), 'Group B');
insert into public.athlete_groups (athlete_id, group_id) values
  (pg_temp.u('e1'), pg_temp.u('c1')), (pg_temp.u('e2'), pg_temp.u('c1')), (pg_temp.u('e3'), pg_temp.u('c1')),
  (pg_temp.u('e1'), pg_temp.u('c2'));
insert into public.coach_group_assignments (coach_user_id, group_id) values (pg_temp.u('a5'), pg_temp.u('c1'));
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  (pg_temp.u('a4'), pg_temp.u('e1'), pg_temp.u('b1')), (pg_temp.u('a4'), pg_temp.u('e3'), pg_temp.u('b1')),
  (pg_temp.u('aa'), pg_temp.u('e1'), pg_temp.u('b2'));
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, guardian_visible)
values
  (pg_temp.u('f1'), pg_temp.u('a4'), pg_temp.u('b1'), 'repetition', pg_temp.u('e1'), 3100, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 08:00:00+00', true),
  (pg_temp.u('f2'), pg_temp.u('aa'), pg_temp.u('b2'), 'repetition', pg_temp.u('e1'), 3200, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-e', '2026-11-01 09:00:00+00', true),
  (pg_temp.u('f3'), pg_temp.u('a4'), pg_temp.u('b1'), 'repetition', pg_temp.u('e3'), 3300, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-01 10:00:00+00', true);

select has_column('public', 'athlete_schools', 'ended_at', 'athlete_schools has ended_at');
select has_column('public', 'athlete_schools', 'ended_by', 'athlete_schools has ended_by');

-- 1. Who may end a link: only an active admin of that school.
set local role authenticated;
select pg_temp.as_user('a4');
select throws_ok($$select public.end_athlete_school(pg_temp.u('e1'), pg_temp.u('b1'))$$, '42501', null, 'a coach cannot end the link');
select pg_temp.as_user('a3');
select throws_ok($$select public.end_athlete_school(pg_temp.u('e1'), pg_temp.u('b1'))$$, '42501', null, 'the admin of another school cannot end the link');
select pg_temp.as_user('a6');
select throws_ok($$select public.end_athlete_school(pg_temp.u('e1'), pg_temp.u('b1'))$$, '42501', null, 'an admin with a deactivated membership cannot end the link');
select pg_temp.as_user('a7');
select throws_ok($$select public.end_athlete_school(pg_temp.u('e1'), pg_temp.u('b1'))$$, '42501', null, 'the guardian cannot end the link');
select pg_temp.as_user('a9');
select throws_ok($$select public.end_athlete_school(pg_temp.u('e1'), pg_temp.u('b1'))$$, '42501', null, 'a user with no role cannot end the link');
select pg_temp.as_user('a1');
select throws_ok($$select public.end_athlete_school(pg_temp.u('e1'), pg_temp.u('b1'))$$, '42501', null, 'the platform admin cannot end the link');
reset role;
set local role anon;
select throws_ok($$select public.end_athlete_school(pg_temp.u('e1'), pg_temp.u('b1'))$$, '42501', null, 'an anonymous user cannot end the link');
reset role;
select is((select count(*)::int from public.athlete_schools where ended_at is not null or ended_by is not null), 0,
  'no row changed after the rejected calls');

-- 2. The admin ends the link: the server stamps both columns, a repeat keeps the first stamp, nothing is deleted.
set local role authenticated;
select pg_temp.as_user('a2');
select is(public.end_athlete_school(pg_temp.u('e1'), pg_temp.u('b1')), now(), 'the admin of A ends X in A and gets the stamp');
select pg_temp.as_user('ab');
select lives_ok($$select public.end_athlete_school(pg_temp.u('e1'), pg_temp.u('b1'))$$, 'repeating the call does not fail');
select pg_temp.as_user('a3');
select throws_ok($$select public.end_athlete_school(pg_temp.u('e3'), pg_temp.u('b2'))$$, 'P0002', null, 'ending a link that does not exist fails');
reset role;
select is(
  (select ended_by::text || '@' || (ended_at = now())::text from public.athlete_schools where athlete_id = pg_temp.u('e1') and school_id = pg_temp.u('b1')),
  pg_temp.u('a2')::text || '@true', 'ended_by is the first admin and ended_at the server time');
select is((select count(*)::int from public.athlete_schools where athlete_id = pg_temp.u('e1')), 2, 'the baja deletes no enrollment row');

-- 3. No role writes the columns directly.
set local role authenticated;
select pg_temp.as_user('a2');
select throws_ok($$update public.athlete_schools set ended_at = now() where athlete_id = pg_temp.u('e3') and school_id = pg_temp.u('b1')$$,
  '42501', null, 'an admin cannot set ended_at with an update');
select throws_ok($$update public.athlete_schools set ended_by = pg_temp.u('a2') where athlete_id = pg_temp.u('e3') and school_id = pg_temp.u('b1')$$,
  '42501', null, 'an admin cannot set ended_by with an update');
select pg_temp.as_user('a1');
select throws_ok($$update public.athlete_schools set ended_at = null, ended_by = null where athlete_id = pg_temp.u('e1') and school_id = pg_temp.u('b1')$$,
  '42501', null, 'not even the platform admin reactivates a link with an update');
select throws_ok($$insert into public.athlete_schools (athlete_id, school_id, ended_at, ended_by) values (pg_temp.u('e3'), pg_temp.u('b2'), now(), pg_temp.u('a1'))$$,
  '42501', null, 'a link cannot be inserted already ended');
reset role;

-- 4. Y, the adult athlete, is ended too. What each role reads: staff of A lose X and Y; the staff of B and the admin of
-- both schools keep X through B; guardian and adult athlete keep theirs.
select pg_temp.as_user('a2');
set local role authenticated;
select public.end_athlete_school(pg_temp.u('e2'), pg_temp.u('b1'));
select is(pg_temp.seen(), 'athletes=e3|schools=e3:b1|groups=e3:c1|marks=f3', 'the admin of A reads only W');
select pg_temp.as_user('a4');
select is(pg_temp.seen(), 'athletes=e3|schools=e3:b1|groups=e3:c1|marks=f3', 'coach K (direct) reads only W');
select pg_temp.as_user('a5');
select is(pg_temp.seen(), 'athletes=e3|schools=e3:b1|groups=e3:c1|marks=f3', 'coach C (through group gA) reads only W');
select pg_temp.as_user('ab');
select is(pg_temp.seen(), 'athletes=e1,e3|schools=e1:b2,e3:b1|groups=e1:c2,e3:c1|marks=f2,f3',
  'the admin of A and B reads X only through B: its A enrollment, group and mark are gone');
select pg_temp.as_user('aa');
select is(pg_temp.seen(), 'athletes=e1|schools=e1:b2|groups=e1:c2|marks=f2', 'coach E of B still reads X through B');
select pg_temp.as_user('a7');
select is(pg_temp.seen(), 'athletes=e1|schools=e1:b1,e1:b2|groups=e1:c1,e1:c2|marks=f1,f2', 'the guardian still reads X, the ended link included');
select pg_temp.as_user('a8');
select is(pg_temp.seen(), 'athletes=e2|schools=e2:b1|groups=e2:c1|marks=', 'the adult athlete still reads their own rows');

-- 5. Staff cannot write marks for the ended swimmer, and still can for an active one.
select pg_temp.as_user('a4');
select throws_ok(
  $$insert into public.measurements (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
    values (pg_temp.u('f4'), pg_temp.u('a4'), pg_temp.u('b1'), 'repetition', pg_temp.u('e1'), 3400, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-02 08:00:00+00')$$,
  '42501', null, 'a coach cannot record a mark for the ended swimmer');
select lives_ok(
  $$insert into public.measurements (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
    values (pg_temp.u('f5'), pg_temp.u('a4'), pg_temp.u('b1'), 'repetition', pg_temp.u('e3'), 3500, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-k', '2026-11-02 08:01:00+00')$$,
  'a coach still records a mark for an active swimmer');
reset role;

select * from finish();
rollback;
