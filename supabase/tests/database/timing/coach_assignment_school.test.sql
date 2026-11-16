-- A coach reads a measurement only in a school where the coach is active and has the swimmer assigned there,
-- directly or through a group of that school (issue #1122). A swimmer of schools A and B assigned to coach K only
-- in B: K reads the B marks and conflicts, not the A ones. School admins, the platform admin, guardians and adult
-- athletes read what they read before. The timing_measurements stream gives staff the same rows.
-- Users: platform admin P (a1), school admins SA of A (a2) and SB of B (a3), coach K active in A and B (a4, e1
-- direct in B, e2 through group gB), coach C of A (a5, e1 direct in A, e2 through group gA), coach D deactivated
-- in A (a6, e1 direct in A), guardian G of e1 (a7), adult athlete AA of e3 (a8), N with no role (a9), M school
-- admin of A and coach of B with no assignment in B (aa). All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- u('a1') is the uuid 11220000-0000-4000-8000-0000000000a1; as_user sets the signed-in user.
create function pg_temp.u(text) returns uuid language sql as $$ select ('11220000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- What the current user reads, by the last two characters of the id.
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(right(id::text, 2), ',' order by id), '') from public.measurements where id::text like '11220000%' $$;
create function pg_temp.seen_conflicts() returns text language sql as $$
  select coalesce(string_agg(right(id::text, 2), ',' order by id), '') from public.measurement_conflicts where id::text like '11220000%' $$;
-- The staff queries of timing_measurements in powersync/sync-config.yaml, with the with: subqueries inlined for the
-- user. Pinned by src/modules/timing/__tests__/coachSyncStream.test.ts: change both together.
create function pg_temp.staff_stream_ids(uuid) returns setof uuid language sql as $$
  select m.id from public.measurements m
    join public.coach_athlete_assignments ca on m.athlete_id = ca.athlete_id and m.school_id = ca.school_id
    where ca.coach_user_id = $1 and m.hidden = false
      and m.school_id in (select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)
  union
  select m.id from public.measurements m
    join public.athlete_groups ag on m.athlete_id = ag.athlete_id
    join public.training_groups tg on ag.group_id = tg.id and m.school_id = tg.school_id
    where ag.group_id in (
        select group_id from public.coach_group_assignments where coach_user_id = $1 and group_id in (
          select id from public.training_groups where school_id in (
            select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)))
      and m.hidden = false
      and m.school_id in (select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)
  union
  select id from public.measurements
    where athlete_id in (select athlete_id from public.athlete_schools where school_id in (
        select school_id from public.school_memberships where user_id = $1 and role = 'school_admin'))
      and hidden = false
      and school_id in (select school_id from public.school_memberships where user_id = $1 and role = 'school_admin') $$;
create temp table rls_seen (who text, id uuid);
grant all on rls_seen to authenticated;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'platform-p@example.test'), (pg_temp.u('a2'), 'admin-sa@example.test'),
  (pg_temp.u('a3'), 'admin-sb@example.test'), (pg_temp.u('a4'), 'coach-k@example.test'),
  (pg_temp.u('a5'), 'coach-c@example.test'), (pg_temp.u('a6'), 'coach-d@example.test'),
  (pg_temp.u('a7'), 'guardian-g@example.test'), (pg_temp.u('a8'), 'adult-aa@example.test'),
  (pg_temp.u('a9'), 'nobody-n@example.test'), (pg_temp.u('aa'), 'admin-coach-m@example.test');
insert into public.platform_admins (user_id) values (pg_temp.u('a1'));
insert into public.schools (id, name) values
  (pg_temp.u('b1'), 'Assignment School A'), (pg_temp.u('b2'), 'Assignment School B');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a2'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a3'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a4'), 'coach'), (pg_temp.u('b2'), pg_temp.u('a4'), 'coach'),
  (pg_temp.u('b1'), pg_temp.u('a5'), 'coach'), (pg_temp.u('b1'), pg_temp.u('a6'), 'coach'),
  (pg_temp.u('b1'), pg_temp.u('aa'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('aa'), 'coach');
-- The trigger stamps the time, so D is deactivated after being created active.
update public.school_memberships set deactivated_at = now()
  where school_id = pg_temp.u('b1') and user_id = pg_temp.u('a6');

-- e1 and e2 belong to A and B, e3 only to A.
insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'E1'), (pg_temp.u('e2'), 'Athlete', 'E2'), (pg_temp.u('e3'), 'Athlete', 'E3');
insert into public.athlete_schools (athlete_id, school_id) values
  (pg_temp.u('e1'), pg_temp.u('b1')), (pg_temp.u('e1'), pg_temp.u('b2')),
  (pg_temp.u('e2'), pg_temp.u('b1')), (pg_temp.u('e2'), pg_temp.u('b2')),
  (pg_temp.u('e3'), pg_temp.u('b1'));
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a7'), pg_temp.u('e1'), 'guardian'), (pg_temp.u('a8'), pg_temp.u('e3'), 'self');
insert into public.training_groups (id, school_id, name) values
  (pg_temp.u('c1'), pg_temp.u('b1'), 'Group A'), (pg_temp.u('c2'), pg_temp.u('b2'), 'Group B');
insert into public.athlete_groups (athlete_id, group_id) values
  (pg_temp.u('e2'), pg_temp.u('c1')), (pg_temp.u('e2'), pg_temp.u('c2'));
insert into public.coach_group_assignments (coach_user_id, group_id) values
  (pg_temp.u('a5'), pg_temp.u('c1')), (pg_temp.u('a4'), pg_temp.u('c2'));
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  (pg_temp.u('a4'), pg_temp.u('e1'), pg_temp.u('b2')),
  (pg_temp.u('a5'), pg_temp.u('e1'), pg_temp.u('b1')),
  (pg_temp.u('a6'), pg_temp.u('e1'), pg_temp.u('b1'));

-- d1: e1 in A, d2: e1 in B, d3: e2 in A, d4: e2 in B, d5: e3 in A.
insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
values
  (pg_temp.u('d1'), pg_temp.u('a5'), pg_temp.u('b1'), 'repetition', pg_temp.u('e1'), 3500, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-11-10 08:00:00+00'),
  (pg_temp.u('d2'), pg_temp.u('a4'), pg_temp.u('b2'), 'repetition', pg_temp.u('e1'), 3600, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-2', '2026-11-10 08:01:00+00'),
  (pg_temp.u('d3'), pg_temp.u('a5'), pg_temp.u('b1'), 'repetition', pg_temp.u('e2'), 3700, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-11-10 08:02:00+00'),
  (pg_temp.u('d4'), pg_temp.u('a4'), pg_temp.u('b2'), 'repetition', pg_temp.u('e2'), 3800, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-2', '2026-11-10 08:03:00+00'),
  (pg_temp.u('d5'), pg_temp.u('a5'), pg_temp.u('b1'), 'repetition', pg_temp.u('e3'), 3900, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-11-10 08:04:00+00');

-- Conflicts, inserted as the owner (clients cannot write): f1 on d1 by C, f2 on d2 by K, f3 on d3 by C,
-- f4 on d4 by K.
insert into public.measurement_conflicts
  (id, measurement_id, base_version, current_values, current_by, incoming_values, incoming_by)
values
  (pg_temp.u('f1'), pg_temp.u('d1'), 1, '{"hundredths": 3000, "version": 2}', pg_temp.u('a5'), '{"hundredths": 3050}', pg_temp.u('a5')),
  (pg_temp.u('f2'), pg_temp.u('d2'), 1, '{"hundredths": 3100, "version": 2}', pg_temp.u('a4'), '{"hundredths": 3150}', pg_temp.u('a4')),
  (pg_temp.u('f3'), pg_temp.u('d3'), 1, '{"hundredths": 3200, "version": 2}', pg_temp.u('a5'), '{"hundredths": 3250}', pg_temp.u('a5')),
  (pg_temp.u('f4'), pg_temp.u('d4'), 1, '{"hundredths": 3300, "version": 2}', pg_temp.u('a4'), '{"hundredths": 3350}', pg_temp.u('a4'));

set local role authenticated;

-- 1. Coach K, active in A and B, has e1 (direct) and e2 (group) only in B.
select pg_temp.as_user('a4');
select is(pg_temp.seen(), 'd2,d4', 'K reads the B marks of e1 and e2, not their A marks');
select is(pg_temp.seen_conflicts(), 'f2,f4', 'K reads the B conflicts, not the A ones');
insert into rls_seen select 'K', id from public.measurements where id::text like '11220000%';

-- 2. Coach C of A, e1 direct and e2 through group gA.
select pg_temp.as_user('a5');
select is(pg_temp.seen(), 'd1,d3', 'C reads the A marks of the direct and the group swimmer');
select is(pg_temp.seen_conflicts(), 'f1,f3', 'C reads the A conflicts of those marks');
insert into rls_seen select 'C', id from public.measurements where id::text like '11220000%';

-- 3. Coach D, deactivated in A, reads nothing as staff.
select pg_temp.as_user('a6');
select is(pg_temp.seen(), '', 'deactivated D reads no mark');
select is(pg_temp.seen_conflicts(), '', 'deactivated D reads no conflict');

-- 4. School admins read every mark of their school, as before.
select pg_temp.as_user('a2');
select is(pg_temp.seen(), 'd1,d3,d5', 'SA reads every mark of A');
select is(pg_temp.seen_conflicts(), 'f1,f3', 'SA reads every conflict of A');
insert into rls_seen select 'SA', id from public.measurements where id::text like '11220000%';
select pg_temp.as_user('a3');
select is(pg_temp.seen(), 'd2,d4', 'SB reads every mark of B');
select is(pg_temp.seen_conflicts(), 'f2,f4', 'SB reads every conflict of B');
insert into rls_seen select 'SB', id from public.measurements where id::text like '11220000%';

-- 5. M, admin of A and coach of B with no swimmer assigned in B: A as admin, nothing of B.
select pg_temp.as_user('aa');
select is(pg_temp.seen(), 'd1,d3,d5', 'M reads A as admin and no B mark without an assignment there');
select is(pg_temp.seen_conflicts(), 'f1,f3', 'M reads the A conflicts only');
insert into rls_seen select 'M', id from public.measurements where id::text like '11220000%';

-- 6. Platform admin reads everything.
select pg_temp.as_user('a1');
select is(pg_temp.seen(), 'd1,d2,d3,d4,d5', 'P reads every mark');
select is(pg_temp.seen_conflicts(), 'f1,f2,f3,f4', 'P reads every conflict');

-- 7. Guardian, adult athlete and a user with no role.
select pg_temp.as_user('a7');
select is(pg_temp.seen(), '', 'G reads no school time of e1 the school did not share');
select is(pg_temp.seen_conflicts(), '', 'G reads no conflict');
select pg_temp.as_user('a8');
select is(pg_temp.seen(), 'd5', 'AA reads their own mark');
select is(pg_temp.seen_conflicts(), '', 'AA reads no conflict');
select pg_temp.as_user('a9');
select is(pg_temp.seen(), '', 'N reads no mark');
select is(pg_temp.seen_conflicts(), '', 'N reads no conflict');

-- 8. Offline: the staff queries of the stream give each staff user what the policy gives.
reset role;
select set_eq($$ select id from rls_seen where who = 'K' $$, $$ select * from pg_temp.staff_stream_ids(pg_temp.u('a4')) $$, 'the stream gives K what the policy gives');
select set_eq($$ select id from rls_seen where who = 'C' $$, $$ select * from pg_temp.staff_stream_ids(pg_temp.u('a5')) $$, 'the stream gives C what the policy gives');
select is_empty($$ select * from pg_temp.staff_stream_ids(pg_temp.u('a6')) $$, 'the stream gives deactivated D nothing');
select set_eq($$ select id from rls_seen where who = 'SA' $$, $$ select * from pg_temp.staff_stream_ids(pg_temp.u('a2')) $$, 'the stream gives SA what the policy gives');
select set_eq($$ select id from rls_seen where who = 'SB' $$, $$ select * from pg_temp.staff_stream_ids(pg_temp.u('a3')) $$, 'the stream gives SB what the policy gives');
select set_eq($$ select id from rls_seen where who = 'M' $$, $$ select * from pg_temp.staff_stream_ids(pg_temp.u('aa')) $$, 'the stream gives M what the policy gives');
select is_empty($$ select * from pg_temp.staff_stream_ids(pg_temp.u('a7')) $$, 'the staff queries give guardian G nothing');

select * from finish();
rollback;
