-- A coach reads the enrollment (athlete_schools) and group (athlete_groups) rows of a swimmer only in the school where
-- the swimmer is assigned to them, directly or through a group, and the coach is active (issue #1132, as #1127 did for
-- fulfillments). A swimmer of schools A and B assigned to coach K only in B: K reads the B enrollment row and the B
-- group rows, not the A ones. Before this change the policies checked the swimmer (app.coach_athlete_ids()) and the
-- school (app.staff_school_ids()) separately, so K read every row of that swimmer in any school where K is active.
-- The platform admin and managed (guardian, adult athlete) branches do not change. The admin branch binds the school
-- the same way since #1150: supabase/tests/database/athletes/admin_enrollment_school.test.sql.
-- The athletes_visible stream gives staff the same rows; src/modules/athletes/__tests__/coachAthletesSyncStream.test.ts
-- pins its queries: change both together.
-- Users: platform admin P (a1), school admins SA of A (a2) and SB of B (a3), coach K active in A and B (a4, e1 direct
-- in B, e2 through group gB), coach C of A (a5, e1 direct in A, e2 and e3 through group gA), coach D deactivated in A
-- (a6, e1 direct in A), guardian G of e1 (a7), adult athlete AA of e3 (a8), N with no role (a9), X school admin of
-- school C only (aa). All users and data here are synthetic.
-- Enrollment: e1 and e2 in A and B, e3 only in A. Groups: gA (c1) in A, gB (c2) and gB2 (c3) in B; e1 is in c1 and c3,
-- e2 in c1 and c2, e3 in c1.
-- What the policies gave before this change, unchanged for everybody but coach K: K read the schools e1:b1, e1:b2,
-- e2:b1, e2:b2 and the groups e1:c1, e1:c3, e2:c1, e2:c2 (the A rows too); every other role read what it reads now.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- u('a1') is the uuid 11320000-0000-4000-8000-0000000000a1; as_user sets the signed-in user.
create function pg_temp.u(text) returns uuid language sql as $$ select ('11320000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- The enrollment rows the current user reads, as <athlete suffix>:<school suffix>.
create function pg_temp.seen_schools() returns text language sql as $$
  select coalesce(string_agg(entry, ',' order by entry), '') from (
    select right(athlete_id::text, 2) || ':' || right(school_id::text, 2) as entry
    from public.athlete_schools where athlete_id::text like '11320000%') r $$;
-- The group rows the current user reads, as <athlete suffix>:<group suffix>.
create function pg_temp.seen_groups() returns text language sql as $$
  select coalesce(string_agg(entry, ',' order by entry), '') from (
    select right(athlete_id::text, 2) || ':' || right(group_id::text, 2) as entry
    from public.athlete_groups where athlete_id::text like '11320000%') r $$;
-- The coach queries of athletes_visible on athlete_schools (Q1 union Q2) in powersync/sync-config.yaml, with the with:
-- subqueries inlined for the user: member_school_ids is the active memberships, coach_group_ids the group assignments
-- in those schools. Pinned by src/modules/athletes/__tests__/coachAthletesSyncStream.test.ts: change both together.
create function pg_temp.stream_schools(uuid) returns table (athlete_id uuid, school_id uuid) language sql as $$
  select s.athlete_id, s.school_id from public.athlete_schools s
    join public.coach_athlete_assignments ca on s.athlete_id = ca.athlete_id and s.school_id = ca.school_id
    where ca.coach_user_id = $1
      and s.school_id in (select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)
  union
  select s.athlete_id, s.school_id from public.athlete_schools s
    join public.athlete_groups ag on s.athlete_id = ag.athlete_id
    join public.training_groups tg on ag.group_id = tg.id and s.school_id = tg.school_id
    where ag.group_id in (
        select group_id from public.coach_group_assignments where coach_user_id = $1 and group_id in (
          select id from public.training_groups where school_id in (
            select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)))
      and s.school_id in (select school_id from public.school_memberships where user_id = $1 and deactivated_at is null) $$;
-- The coach queries of athletes_visible on athlete_groups (Q3 union Q4), inlined the same way; member_group_ids is the
-- groups of the active schools. Pinned by the same Jest test.
create function pg_temp.stream_groups(uuid) returns table (athlete_id uuid, group_id uuid) language sql as $$
  select ag.athlete_id, ag.group_id from public.athlete_groups ag
    join public.training_groups tg on ag.group_id = tg.id
    join public.coach_athlete_assignments ca on ag.athlete_id = ca.athlete_id and tg.school_id = ca.school_id
    where ca.coach_user_id = $1
      and ag.group_id in (
        select id from public.training_groups where school_id in (
          select school_id from public.school_memberships where user_id = $1 and deactivated_at is null))
  union
  select ag.athlete_id, ag.group_id from public.athlete_groups ag
    join public.training_groups tg on ag.group_id = tg.id
    join public.athlete_groups coached on ag.athlete_id = coached.athlete_id
    join public.training_groups coached_groups on coached.group_id = coached_groups.id and tg.school_id = coached_groups.school_id
    where coached.group_id in (
        select group_id from public.coach_group_assignments where coach_user_id = $1 and group_id in (
          select id from public.training_groups where school_id in (
            select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)))
      and ag.group_id in (
        select id from public.training_groups where school_id in (
          select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)) $$;
create temp table rls_schools (who text, athlete_id uuid, school_id uuid);
create temp table rls_groups (who text, athlete_id uuid, group_id uuid);
grant all on rls_schools, rls_groups to authenticated;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'platform-p@example.test'), (pg_temp.u('a2'), 'admin-sa@example.test'),
  (pg_temp.u('a3'), 'admin-sb@example.test'), (pg_temp.u('a4'), 'coach-k@example.test'),
  (pg_temp.u('a5'), 'coach-c@example.test'), (pg_temp.u('a6'), 'coach-d@example.test'),
  (pg_temp.u('a7'), 'guardian-g@example.test'), (pg_temp.u('a8'), 'adult-aa@example.test'),
  (pg_temp.u('a9'), 'nobody-n@example.test'), (pg_temp.u('aa'), 'admin-x@example.test');
insert into public.platform_admins (user_id) values (pg_temp.u('a1'));
insert into public.schools (id, name) values
  (pg_temp.u('b1'), 'Enrollment School A'), (pg_temp.u('b2'), 'Enrollment School B'),
  (pg_temp.u('b3'), 'Enrollment School C');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a2'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a3'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a4'), 'coach'), (pg_temp.u('b2'), pg_temp.u('a4'), 'coach'),
  (pg_temp.u('b1'), pg_temp.u('a5'), 'coach'), (pg_temp.u('b1'), pg_temp.u('a6'), 'coach'),
  (pg_temp.u('b3'), pg_temp.u('aa'), 'school_admin');
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
  (pg_temp.u('c1'), pg_temp.u('b1'), 'Group A'), (pg_temp.u('c2'), pg_temp.u('b2'), 'Group B'),
  (pg_temp.u('c3'), pg_temp.u('b2'), 'Group B2');
insert into public.athlete_groups (athlete_id, group_id) values
  (pg_temp.u('e1'), pg_temp.u('c1')), (pg_temp.u('e1'), pg_temp.u('c3')),
  (pg_temp.u('e2'), pg_temp.u('c1')), (pg_temp.u('e2'), pg_temp.u('c2')),
  (pg_temp.u('e3'), pg_temp.u('c1'));
insert into public.coach_group_assignments (coach_user_id, group_id) values
  (pg_temp.u('a5'), pg_temp.u('c1')), (pg_temp.u('a4'), pg_temp.u('c2'));
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  (pg_temp.u('a4'), pg_temp.u('e1'), pg_temp.u('b2')),
  (pg_temp.u('a5'), pg_temp.u('e1'), pg_temp.u('b1')),
  (pg_temp.u('a6'), pg_temp.u('e1'), pg_temp.u('b1'));

set local role authenticated;

-- 1. Coach K, active in A and B, has e1 (direct) and e2 (group gB) only in B: the B rows, not the A ones.
select pg_temp.as_user('a4');
select is(pg_temp.seen_schools(), 'e1:b2,e2:b2',
  'K reads the B enrollment of e1 (direct) and of e2 (through group gB), not their A rows nor e3');
select is(pg_temp.seen_groups(), 'e1:c3,e2:c2',
  'K reads the B group row of e1 (direct: c3, not the A group c1) and of e2 (through group gB: c2, not the A group c1)');
insert into rls_schools select 'K', athlete_id, school_id from public.athlete_schools where athlete_id::text like '11320000%';
insert into rls_groups select 'K', athlete_id, group_id from public.athlete_groups where athlete_id::text like '11320000%';

-- 2. Coach C of A, e1 direct and e2, e3 through group gA: the A rows, never the B group rows of e1 and e2.
select pg_temp.as_user('a5');
select is(pg_temp.seen_schools(), 'e1:b1,e2:b1,e3:b1', 'C reads the A enrollment of the direct swimmer and of the group swimmers');
select is(pg_temp.seen_groups(), 'e1:c1,e2:c1,e3:c1', 'C reads the A group rows of the direct swimmer and of the group swimmers, not their B ones');
insert into rls_schools select 'C', athlete_id, school_id from public.athlete_schools where athlete_id::text like '11320000%';
insert into rls_groups select 'C', athlete_id, group_id from public.athlete_groups where athlete_id::text like '11320000%';

-- 3. Coach D, deactivated in A, N with no role and X, school admin of a school with no swimmer, read nothing.
select pg_temp.as_user('a6');
select is(pg_temp.seen_schools(), '', 'deactivated D reads no enrollment row');
select is(pg_temp.seen_groups(), '', 'deactivated D reads no group row');
select pg_temp.as_user('a9');
select is(pg_temp.seen_schools(), '', 'N reads no enrollment row');
select is(pg_temp.seen_groups(), '', 'N reads no group row');
select pg_temp.as_user('aa');
select is(pg_temp.seen_schools(), '', 'X, admin of school C only, reads no enrollment row');
select is(pg_temp.seen_groups(), '', 'X, admin of school C only, reads no group row');

-- 4. School admins read the enrollment and group rows of the swimmers only in the schools they administer (#1150).
select pg_temp.as_user('a2');
select is(pg_temp.seen_schools(), 'e1:b1,e2:b1,e3:b1', 'SA reads the A enrollment rows of e1, e2 and e3, not their B ones');
select is(pg_temp.seen_groups(), 'e1:c1,e2:c1,e3:c1', 'SA reads the A group rows of e1, e2 and e3, not their B ones');
select pg_temp.as_user('a3');
select is(pg_temp.seen_schools(), 'e1:b2,e2:b2', 'SB reads the B enrollment rows of e1 and e2, not their A ones');
select is(pg_temp.seen_groups(), 'e1:c3,e2:c2', 'SB reads the B group rows of e1 and e2, not their A ones');

-- 5. Platform admin reads everything.
select pg_temp.as_user('a1');
select is(pg_temp.seen_schools(), 'e1:b1,e1:b2,e2:b1,e2:b2,e3:b1', 'P reads every enrollment row');
select is(pg_temp.seen_groups(), 'e1:c1,e1:c3,e2:c1,e2:c2,e3:c1', 'P reads every group row');

-- 6. Guardian of e1 reads every row of e1; the adult athlete e3 their own.
select pg_temp.as_user('a7');
select is(pg_temp.seen_schools(), 'e1:b1,e1:b2', 'G reads every enrollment row of e1, as before');
select is(pg_temp.seen_groups(), 'e1:c1,e1:c3', 'G reads every group row of e1, as before');
select pg_temp.as_user('a8');
select is(pg_temp.seen_schools(), 'e3:b1', 'AA reads their own enrollment row, as before');
select is(pg_temp.seen_groups(), 'e3:c1', 'AA reads their own group row, as before');

-- 7. Offline: the coach queries of the stream give each coach what the policies give.
reset role;
select set_eq($$ select athlete_id, school_id from rls_schools where who = 'K' $$, $$ select * from pg_temp.stream_schools(pg_temp.u('a4')) $$, 'the stream gives K the enrollment rows the policy gives');
select set_eq($$ select athlete_id, group_id from rls_groups where who = 'K' $$, $$ select * from pg_temp.stream_groups(pg_temp.u('a4')) $$, 'the stream gives K the group rows the policy gives');
select set_eq($$ select athlete_id, school_id from rls_schools where who = 'C' $$, $$ select * from pg_temp.stream_schools(pg_temp.u('a5')) $$, 'the stream gives C the enrollment rows the policy gives');
select set_eq($$ select athlete_id, group_id from rls_groups where who = 'C' $$, $$ select * from pg_temp.stream_groups(pg_temp.u('a5')) $$, 'the stream gives C the group rows the policy gives');
select is_empty($$ select * from pg_temp.stream_schools(pg_temp.u('a6')) $$, 'the stream gives deactivated D no enrollment row');
select is_empty($$ select * from pg_temp.stream_groups(pg_temp.u('a6')) $$, 'the stream gives deactivated D no group row');
select is_empty($$ select * from pg_temp.stream_schools(pg_temp.u('a9')) $$, 'the stream gives N no enrollment row');
select is_empty($$ select * from pg_temp.stream_groups(pg_temp.u('a9')) $$, 'the stream gives N no group row');

-- 8. The coach branch of both policies uses the (swimmer, school) pairs, no longer the school-free coach_athlete_ids.
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'athlete_schools'
     and policyname = 'athlete_schools_select') like '%coach_athlete_school_pairs%'
  and (select qual from pg_policies where schemaname = 'public' and tablename = 'athlete_schools'
     and policyname = 'athlete_schools_select') not like '%coach_athlete_ids%',
  'the athlete_schools select policy matches the coach pairs of app.coach_athlete_school_pairs() and not coach_athlete_ids');
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'athlete_groups'
     and policyname = 'athlete_groups_select') like '%coach_athlete_school_pairs%'
  and (select qual from pg_policies where schemaname = 'public' and tablename = 'athlete_groups'
     and policyname = 'athlete_groups_select') not like '%coach_athlete_ids%',
  'the athlete_groups select policy matches the coach pairs of app.coach_athlete_school_pairs() and not coach_athlete_ids');

select * from finish();
rollback;
