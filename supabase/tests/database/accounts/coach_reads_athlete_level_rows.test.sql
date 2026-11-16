-- #1127: athlete_managers and authorization_status hold one row per swimmer (per swimmer and purpose) with no school
-- column, so a row is the same in every school. Pinned as is, no policy change: a coach who is active in A and B and has
-- swimmer Y assigned only in B reads the rows of Y (the rows they would read in A); a coach whose only assignment of a
-- swimmer is in a school where they are deactivated does not; a user with no role reads nothing. School admins, the
-- platform admin, guardians and adult athletes read what they read before. The accounts_athlete_managers and
-- accounts_authorization_status queries in powersync/sync-config.yaml give the same rows; their text is pinned by
-- src/modules/accounts/__tests__/coachAthleteLevelSyncStreams.test.ts (pg_temp.stream_athlete_ids holds a copy of
-- their athlete filter): change both together.
-- Users: platform admin P (a1), school admins SA of A (a2) and SB of B (a3), coach K active in A and B (a4, Y direct in
-- B, Z through group gB of B), coach D active in B and deactivated in A (a5, X direct in A), guardian G of Y (a6),
-- adult athlete AA of W (a7), N with no role (a8), guardian M of X and Z (a9). Swimmers: X (e1) only in A; Y (e2) and
-- Z (e3) in A and B; W (e4) only in A. Each swimmer has one manager row (G-Y, AA-W, M-X, M-Z) and one
-- authorization_status row. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- u('a1') is the uuid 11273000-0000-4000-8000-0000000000a1; as_user sets the signed-in user.
create function pg_temp.u(text) returns uuid language sql as $$ select ('11273000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- The swimmers whose manager rows and whose authorization_status rows the current user reads, by the last two
-- characters of the athlete id.
create function pg_temp.seen_managers() returns text language sql as $$
  select coalesce(string_agg(right(athlete_id::text, 2), ',' order by athlete_id), '')
    from public.athlete_managers where athlete_id::text like '11273000%' $$;
create function pg_temp.seen_status() returns text language sql as $$
  select coalesce(string_agg(right(athlete_id::text, 2), ',' order by athlete_id), '')
    from public.authorization_status where athlete_id::text like '11273000%' $$;
-- The athlete filter shared by the accounts_athlete_managers and accounts_authorization_status queries in
-- powersync/sync-config.yaml, with the with: subqueries inlined for the user; the two functions apply it to each table.
create function pg_temp.stream_athlete_ids(uuid) returns setof uuid language sql as $$
  select athlete_id from public.athlete_managers where user_id = $1
  union
  select athlete_id from public.coach_athlete_assignments where coach_user_id = $1 and school_id in (
      select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)
  union
  select athlete_id from public.athlete_groups where group_id in (
      select group_id from public.coach_group_assignments where coach_user_id = $1 and group_id in (
        select id from public.training_groups where school_id in (
          select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)))
  union
  select athlete_id from public.athlete_schools where school_id in (
      select school_id from public.school_memberships where user_id = $1 and role = 'school_admin') $$;
create function pg_temp.stream_managers(uuid) returns text language sql as $$
  select coalesce(string_agg(right(athlete_id::text, 2), ',' order by athlete_id), '')
    from public.athlete_managers where athlete_id::text like '11273000%'
      and athlete_id in (select * from pg_temp.stream_athlete_ids($1)) $$;
create function pg_temp.stream_status(uuid) returns text language sql as $$
  select coalesce(string_agg(right(athlete_id::text, 2), ',' order by athlete_id), '')
    from public.authorization_status where athlete_id::text like '11273000%'
      and athlete_id in (select * from pg_temp.stream_athlete_ids($1)) $$;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'platform-p@example.test'), (pg_temp.u('a2'), 'admin-sa@example.test'),
  (pg_temp.u('a3'), 'admin-sb@example.test'), (pg_temp.u('a4'), 'coach-k@example.test'),
  (pg_temp.u('a5'), 'coach-d@example.test'), (pg_temp.u('a6'), 'guardian-g@example.test'),
  (pg_temp.u('a7'), 'adult-aa@example.test'), (pg_temp.u('a8'), 'nobody-n@example.test'),
  (pg_temp.u('a9'), 'guardian-m@example.test');
insert into public.platform_admins (user_id) values (pg_temp.u('a1'));
insert into public.schools (id, name) values
  (pg_temp.u('b1'), 'Athlete Level School A'), (pg_temp.u('b2'), 'Athlete Level School B');
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
  (pg_temp.u('a6'), pg_temp.u('e2'), 'guardian'), (pg_temp.u('a7'), pg_temp.u('e4'), 'self'),
  (pg_temp.u('a9'), pg_temp.u('e1'), 'guardian'), (pg_temp.u('a9'), pg_temp.u('e3'), 'guardian');
-- Inserted as the owner: clients cannot write the status, a trigger of authorizations keeps it.
insert into public.authorization_status (athlete_id, purpose, is_granted) values
  (pg_temp.u('e1'), 'record_times', true), (pg_temp.u('e2'), 'record_times', true),
  (pg_temp.u('e3'), 'record_times', false), (pg_temp.u('e4'), 'record_times', true);
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

-- 1. Coach K, active in A and B: the rows of Y (direct, only in B) and Z (group of B), the same rows as in any school.
select pg_temp.as_user('a4');
select is(pg_temp.seen_managers(), 'e2,e3', 'K reads the manager rows of Y and Z, assigned only in B');
select is(pg_temp.seen_status(), 'e2,e3', 'K reads the authorization status of Y and Z');

-- 2. Coach D, deactivated in A where X is assigned, reads nothing; N with no role reads nothing.
select pg_temp.as_user('a5');
select is(pg_temp.seen_managers(), '', 'deactivated D reads no manager row');
select is(pg_temp.seen_status(), '', 'deactivated D reads no authorization status');
select pg_temp.as_user('a8');
select is(pg_temp.seen_managers(), '', 'N reads no manager row');
select is(pg_temp.seen_status(), '', 'N reads no authorization status');

-- 3. School admins read the rows of the swimmers of their school, the platform admin all of them.
select pg_temp.as_user('a2');
select is(pg_temp.seen_managers(), 'e1,e2,e3,e4', 'SA reads the manager rows of A');
select is(pg_temp.seen_status(), 'e1,e2,e3,e4', 'SA reads the authorization status of A');
select pg_temp.as_user('a3');
select is(pg_temp.seen_managers(), 'e2,e3', 'SB reads the manager rows of B');
select is(pg_temp.seen_status(), 'e2,e3', 'SB reads the authorization status of B');
select pg_temp.as_user('a1');
select is(pg_temp.seen_managers(), 'e1,e2,e3,e4', 'P reads every manager row');
select is(pg_temp.seen_status(), 'e1,e2,e3,e4', 'P reads every authorization status');

-- 4. Guardians and the adult athlete read the rows of the swimmers they manage.
select pg_temp.as_user('a6');
select is(pg_temp.seen_managers(), 'e2', 'G reads the manager row of Y');
select is(pg_temp.seen_status(), 'e2', 'G reads the authorization status of Y');
select pg_temp.as_user('a7');
select is(pg_temp.seen_managers(), 'e4', 'AA reads the manager row of W');
select is(pg_temp.seen_status(), 'e4', 'AA reads the authorization status of W');
select pg_temp.as_user('a9');
select is(pg_temp.seen_managers(), 'e1,e3', 'M reads the manager rows of X and Z');
select is(pg_temp.seen_status(), 'e1,e3', 'M reads the authorization status of X and Z');

-- 5. Offline: the two queries of the streams give K, D and N what the policies give.
reset role;
select is(pg_temp.stream_managers(pg_temp.u('a4')), 'e2,e3', 'the managers stream gives K the rows of Y and Z');
select is(pg_temp.stream_managers(pg_temp.u('a5')), '', 'the managers stream gives deactivated D nothing');
select is(pg_temp.stream_managers(pg_temp.u('a8')), '', 'the managers stream gives N nothing');
select is(pg_temp.stream_status(pg_temp.u('a4')), 'e2,e3', 'the status stream gives K the rows of Y and Z');
select is(pg_temp.stream_status(pg_temp.u('a5')), '', 'the status stream gives deactivated D nothing');
select is(pg_temp.stream_status(pg_temp.u('a8')), '', 'the status stream gives N nothing');

select * from finish();
rollback;
