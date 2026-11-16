-- #1127: the athletes row of a swimmer has no school column, so it is the same row in every school. Pinned as is, no
-- policy change: a coach who is active in A and B and has swimmer Y assigned only in B reads Y (the row they would read
-- in A); a coach whose only assignment of a swimmer is in a school where they are deactivated does not; a user with no
-- role reads nothing. School admins, the platform admin, guardians and adult athletes read what they read before.
-- The athletes_visible query of athletes in powersync/sync-config.yaml gives the same rows; its text is pinned by
-- src/modules/athletes/__tests__/coachAthletesSyncStream.test.ts (pg_temp.stream_athlete_ids holds a copy of it):
-- change both together.
-- Users: platform admin P (a1), school admins SA of A (a2) and SB of B (a3), coach K active in A and B (a4, Y direct in
-- B, Z through group gB of B), coach D active in B and deactivated in A (a5, X direct in A), guardian G of Y (a6),
-- adult athlete AA of W (a7), N with no role (a8). Swimmers: X (e1) only in A; Y (e2) and Z (e3) in A and B; W (e4)
-- only in A. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- u('a1') is the uuid 11272000-0000-4000-8000-0000000000a1; as_user sets the signed-in user.
create function pg_temp.u(text) returns uuid language sql as $$ select ('11272000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- The athletes the current user reads, by the last two characters of the id.
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(right(id::text, 2), ',' order by id), '') from public.athletes where id::text like '11272000%' $$;
-- The athletes query of athletes_visible in powersync/sync-config.yaml, with the with: subqueries inlined for the user.
create function pg_temp.stream_athlete_ids(uuid) returns text language sql as $$
  select coalesce(string_agg(right(a.id::text, 2), ',' order by a.id), '') from public.athletes a
    where a.id::text like '11272000%' and (
      a.id in (select athlete_id from public.athlete_managers where user_id = $1)
      or a.id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = $1 and school_id in (
          select school_id from public.school_memberships where user_id = $1 and deactivated_at is null))
      or a.id in (select athlete_id from public.athlete_groups where group_id in (
          select group_id from public.coach_group_assignments where coach_user_id = $1 and group_id in (
            select id from public.training_groups where school_id in (
              select school_id from public.school_memberships where user_id = $1 and deactivated_at is null))))
      or a.id in (select athlete_id from public.athlete_schools where school_id in (
          select school_id from public.school_memberships where user_id = $1 and role = 'school_admin'))) $$;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'platform-p@example.test'), (pg_temp.u('a2'), 'admin-sa@example.test'),
  (pg_temp.u('a3'), 'admin-sb@example.test'), (pg_temp.u('a4'), 'coach-k@example.test'),
  (pg_temp.u('a5'), 'coach-d@example.test'), (pg_temp.u('a6'), 'guardian-g@example.test'),
  (pg_temp.u('a7'), 'adult-aa@example.test'), (pg_temp.u('a8'), 'nobody-n@example.test');
insert into public.platform_admins (user_id) values (pg_temp.u('a1'));
insert into public.schools (id, name) values
  (pg_temp.u('b1'), 'Athlete Rows School A'), (pg_temp.u('b2'), 'Athlete Rows School B');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a2'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a3'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a4'), 'coach'), (pg_temp.u('b2'), pg_temp.u('a4'), 'coach'),
  (pg_temp.u('b1'), pg_temp.u('a5'), 'coach'), (pg_temp.u('b2'), pg_temp.u('a5'), 'coach');

insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'X'), (pg_temp.u('e2'), 'Athlete', 'Y'),
  (pg_temp.u('e3'), 'Athlete', 'Z'), (pg_temp.u('e4'), 'Athlete', 'W');
insert into public.athlete_schools (athlete_id, school_id) values
  (pg_temp.u('e1'), pg_temp.u('b1')),
  (pg_temp.u('e2'), pg_temp.u('b1')), (pg_temp.u('e2'), pg_temp.u('b2')),
  (pg_temp.u('e3'), pg_temp.u('b1')), (pg_temp.u('e3'), pg_temp.u('b2')),
  (pg_temp.u('e4'), pg_temp.u('b1'));
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a6'), pg_temp.u('e2'), 'guardian'), (pg_temp.u('a7'), pg_temp.u('e4'), 'self');
insert into public.training_groups (id, school_id, name) values (pg_temp.u('c2'), pg_temp.u('b2'), 'Group B');
insert into public.athlete_groups (athlete_id, group_id) values (pg_temp.u('e3'), pg_temp.u('c2'));
insert into public.coach_group_assignments (coach_user_id, group_id) values (pg_temp.u('a4'), pg_temp.u('c2'));
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  (pg_temp.u('a4'), pg_temp.u('e2'), pg_temp.u('b2')),
  (pg_temp.u('a5'), pg_temp.u('e1'), pg_temp.u('b1'));
-- The trigger stamps the time, so D is deactivated in A after being created active.
update public.school_memberships set deactivated_at = now()
  where school_id = pg_temp.u('b1') and user_id = pg_temp.u('a5');

set local role authenticated;

-- 1. Coach K, active in A and B: Y (direct, only in B) and Z (group of B), the same rows as in any school.
select pg_temp.as_user('a4');
select is(pg_temp.seen(), 'e2,e3', 'K reads Y and Z, assigned only in B');

-- 2. Coach D, deactivated in A where X is assigned, reads nothing; N with no role reads nothing.
select pg_temp.as_user('a5');
select is(pg_temp.seen(), '', 'deactivated D reads no swimmer');
select pg_temp.as_user('a8');
select is(pg_temp.seen(), '', 'N reads no swimmer');

-- 3. School admins read the swimmers of their school, the platform admin all of them.
select pg_temp.as_user('a2');
select is(pg_temp.seen(), 'e1,e2,e3,e4', 'SA reads every swimmer of A');
select pg_temp.as_user('a3');
select is(pg_temp.seen(), 'e2,e3', 'SB reads every swimmer of B');
select pg_temp.as_user('a1');
select is(pg_temp.seen(), 'e1,e2,e3,e4', 'P reads every swimmer');

-- 4. Guardian and adult athlete read the swimmers they manage.
select pg_temp.as_user('a6');
select is(pg_temp.seen(), 'e2', 'G reads Y');
select pg_temp.as_user('a7');
select is(pg_temp.seen(), 'e4', 'AA reads W');

-- 5. Offline: the athletes query of the stream gives K, D and N what the policy gives.
reset role;
select is(pg_temp.stream_athlete_ids(pg_temp.u('a4')), 'e2,e3', 'the stream gives K Y and Z');
select is(pg_temp.stream_athlete_ids(pg_temp.u('a5')), '', 'the stream gives deactivated D no swimmer');
select is(pg_temp.stream_athlete_ids(pg_temp.u('a8')), '', 'the stream gives N no swimmer');

select * from finish();
rollback;
