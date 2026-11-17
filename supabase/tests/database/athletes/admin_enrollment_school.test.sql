-- A school admin reads the enrollment (athlete_schools) and group (athlete_groups) rows of a swimmer only in the
-- schools they administer (issue #1150, as #1145 did for coaches and #1132 for fulfillments). A swimmer of schools A, B
-- and C read by the admin of C: the C enrollment row and the C group row, not the A and B ones. Before this change the
-- admin branch of both policies checked the swimmer only (app.admin_athlete_ids()), so the admin of C read every row of
-- a swimmer enrolled in C, in any school.
-- The platform admin, managed (guardian, adult athlete) and coach branches do not change.
-- The athletes_visible stream gives admins the same rows; src/modules/athletes/__tests__/adminAthletesSyncStream.test.ts
-- pins its queries: change both together (pg_temp.stream_schools_admin, pg_temp.stream_groups_admin).
-- Users: platform admin P (a1), school admin SC of C only (a2), school admin SAC of A and C (a3), CA coach of A (e1
-- direct) and school admin of C (a4), coach K of A (e1 direct, same assignment as CA) (a5), coach D deactivated in A
-- (a6, e1 direct), guardian G of e1 (a7), adult athlete AA of e2 (a8), N with no role (a9). All users and data here
-- are synthetic.
-- Enrollment: e1 in A, B and C, e2 only in A. Groups: gA (c1) in A, gB (c2) in B, gC (c3) in C; e1 is in all three,
-- e2 in c1.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- u('a1') is the uuid 11500000-0000-4000-8000-0000000000a1; as_user sets the signed-in user.
create function pg_temp.u(text) returns uuid language sql as $$ select ('11500000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- The enrollment rows the current user reads, as <athlete suffix>:<school suffix>.
create function pg_temp.seen_schools() returns text language sql as $$
  select coalesce(string_agg(entry, ',' order by entry), '') from (
    select right(athlete_id::text, 2) || ':' || right(school_id::text, 2) as entry
    from public.athlete_schools where athlete_id::text like '11500000%') r $$;
-- The group rows the current user reads, as <athlete suffix>:<group suffix>.
create function pg_temp.seen_groups() returns text language sql as $$
  select coalesce(string_agg(entry, ',' order by entry), '') from (
    select right(athlete_id::text, 2) || ':' || right(group_id::text, 2) as entry
    from public.athlete_groups where athlete_id::text like '11500000%') r $$;
-- The admin query of athletes_visible on athlete_schools in powersync/sync-config.yaml, with admin_school_ids inlined
-- for the user: the enrollment row is itself the (swimmer, school) pair of the school the user administers. Pinned by
-- src/modules/athletes/__tests__/adminAthletesSyncStream.test.ts: change both together.
create function pg_temp.stream_schools_admin(uuid) returns table (athlete_id uuid, school_id uuid) language sql as $$
  select s.athlete_id, s.school_id from public.athlete_schools s
    where s.school_id in (select school_id from public.school_memberships where user_id = $1 and role = 'school_admin') $$;
-- The admin query of athletes_visible on athlete_groups, inlined the same way: the group row of a swimmer in a school
-- the user administers, joined to the enrollment of that swimmer in the group's school. Pinned by the same Jest test.
create function pg_temp.stream_groups_admin(uuid) returns table (athlete_id uuid, group_id uuid) language sql as $$
  select ag.athlete_id, ag.group_id from public.athlete_groups ag
    join public.training_groups tg on ag.group_id = tg.id
    join public.athlete_schools s on ag.athlete_id = s.athlete_id and tg.school_id = s.school_id
    where s.school_id in (select school_id from public.school_memberships where user_id = $1 and role = 'school_admin') $$;
create temp table rls_schools (who text, athlete_id uuid, school_id uuid);
create temp table rls_groups (who text, athlete_id uuid, group_id uuid);
grant all on rls_schools, rls_groups to authenticated;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'platform-p@example.test'), (pg_temp.u('a2'), 'admin-sc@example.test'),
  (pg_temp.u('a3'), 'admin-sac@example.test'), (pg_temp.u('a4'), 'coach-admin-ca@example.test'),
  (pg_temp.u('a5'), 'coach-k@example.test'), (pg_temp.u('a6'), 'coach-d@example.test'),
  (pg_temp.u('a7'), 'guardian-g@example.test'), (pg_temp.u('a8'), 'adult-aa@example.test'),
  (pg_temp.u('a9'), 'nobody-n@example.test');
insert into public.platform_admins (user_id) values (pg_temp.u('a1'));
insert into public.schools (id, name) values
  (pg_temp.u('b1'), 'Admin Enrollment School A'), (pg_temp.u('b2'), 'Admin Enrollment School B'),
  (pg_temp.u('b3'), 'Admin Enrollment School C');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b3'), pg_temp.u('a2'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a3'), 'school_admin'), (pg_temp.u('b3'), pg_temp.u('a3'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a4'), 'coach'), (pg_temp.u('b3'), pg_temp.u('a4'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a5'), 'coach'), (pg_temp.u('b1'), pg_temp.u('a6'), 'coach');
-- The trigger stamps the time, so D is deactivated after being created active.
update public.school_memberships set deactivated_at = now()
  where school_id = pg_temp.u('b1') and user_id = pg_temp.u('a6');

-- e1 belongs to A, B and C, e2 only to A.
insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'E1'), (pg_temp.u('e2'), 'Athlete', 'E2');
insert into public.athlete_schools (athlete_id, school_id) values
  (pg_temp.u('e1'), pg_temp.u('b1')), (pg_temp.u('e1'), pg_temp.u('b2')), (pg_temp.u('e1'), pg_temp.u('b3')),
  (pg_temp.u('e2'), pg_temp.u('b1'));
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a7'), pg_temp.u('e1'), 'guardian'), (pg_temp.u('a8'), pg_temp.u('e2'), 'self');
insert into public.training_groups (id, school_id, name) values
  (pg_temp.u('c1'), pg_temp.u('b1'), 'Group A'), (pg_temp.u('c2'), pg_temp.u('b2'), 'Group B'),
  (pg_temp.u('c3'), pg_temp.u('b3'), 'Group C');
insert into public.athlete_groups (athlete_id, group_id) values
  (pg_temp.u('e1'), pg_temp.u('c1')), (pg_temp.u('e1'), pg_temp.u('c2')), (pg_temp.u('e1'), pg_temp.u('c3')),
  (pg_temp.u('e2'), pg_temp.u('c1'));
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  (pg_temp.u('a4'), pg_temp.u('e1'), pg_temp.u('b1')),
  (pg_temp.u('a5'), pg_temp.u('e1'), pg_temp.u('b1')),
  (pg_temp.u('a6'), pg_temp.u('e1'), pg_temp.u('b1'));

set local role authenticated;

-- 1. SC, admin of C only: the C enrollment and the C group of e1, nothing of A or B, nothing of e2.
select pg_temp.as_user('a2');
select is(pg_temp.seen_schools(), 'e1:b3', 'SC reads the C enrollment row of e1, not its A and B rows nor e2');
select is(pg_temp.seen_groups(), 'e1:c3', 'SC reads the C group row of e1, not its A and B group rows nor e2');
insert into rls_schools select 'SC', athlete_id, school_id from public.athlete_schools where athlete_id::text like '11500000%';
insert into rls_groups select 'SC', athlete_id, group_id from public.athlete_groups where athlete_id::text like '11500000%';

-- 2. SAC, admin of A and C: the A and C rows (e1 and e2 in A), never the B ones.
select pg_temp.as_user('a3');
select is(pg_temp.seen_schools(), 'e1:b1,e1:b3,e2:b1', 'SAC reads the A and C enrollment rows, never the B one');
select is(pg_temp.seen_groups(), 'e1:c1,e1:c3,e2:c1', 'SAC reads the A and C group rows, never the B one');
insert into rls_schools select 'SAC', athlete_id, school_id from public.athlete_schools where athlete_id::text like '11500000%';
insert into rls_groups select 'SAC', athlete_id, group_id from public.athlete_groups where athlete_id::text like '11500000%';

-- 3. K, coach of A with e1 direct, reads the A rows of e1; CA, with the same assignment and admin of C, reads the A
--    rows (as coach) and the C rows (as admin): exactly the union of what K and SC read, never B.
select pg_temp.as_user('a5');
select is(pg_temp.seen_schools(), 'e1:b1', 'K reads the A enrollment row of e1');
select is(pg_temp.seen_groups(), 'e1:c1', 'K reads the A group row of e1');
insert into rls_schools select 'K', athlete_id, school_id from public.athlete_schools where athlete_id::text like '11500000%';
insert into rls_groups select 'K', athlete_id, group_id from public.athlete_groups where athlete_id::text like '11500000%';
select pg_temp.as_user('a4');
select is(pg_temp.seen_schools(), 'e1:b1,e1:b3', 'CA reads the A (coach) and C (admin) enrollment rows of e1, never the B one');
select is(pg_temp.seen_groups(), 'e1:c1,e1:c3', 'CA reads the A (coach) and C (admin) group rows of e1, never the B one');
insert into rls_schools select 'CA', athlete_id, school_id from public.athlete_schools where athlete_id::text like '11500000%';
insert into rls_groups select 'CA', athlete_id, group_id from public.athlete_groups where athlete_id::text like '11500000%';
reset role;
select set_eq($$ select athlete_id, school_id from rls_schools where who = 'CA' $$,
  $$ select athlete_id, school_id from rls_schools where who in ('K', 'SC') $$,
  'CA reads the union of the enrollment rows of a coach of A and an admin of C');
select set_eq($$ select athlete_id, group_id from rls_groups where who = 'CA' $$,
  $$ select athlete_id, group_id from rls_groups where who in ('K', 'SC') $$,
  'CA reads the union of the group rows of a coach of A and an admin of C');
set local role authenticated;

-- 4. N with no role and the deactivated coach D read nothing. A school_admin membership cannot be deactivated (check
--    constraint), so a deactivated admin does not exist.
select pg_temp.as_user('a9');
select is(pg_temp.seen_schools(), '', 'N reads no enrollment row');
select is(pg_temp.seen_groups(), '', 'N reads no group row');
select pg_temp.as_user('a6');
select is(pg_temp.seen_schools(), '', 'deactivated D reads no enrollment row');
select is(pg_temp.seen_groups(), '', 'deactivated D reads no group row');
reset role;
select throws_ok(
  $$ update public.school_memberships set deactivated_at = now()
     where school_id = '11500000-0000-4000-8000-0000000000b3' and user_id = '11500000-0000-4000-8000-0000000000a2' $$,
  '23514', null,
  'a school_admin membership cannot be deactivated, so a deactivated admin does not exist');
set local role authenticated;

-- 5. Platform admin, guardian of e1 and adult athlete e2 read what they read before.
select pg_temp.as_user('a1');
select is(pg_temp.seen_schools(), 'e1:b1,e1:b2,e1:b3,e2:b1', 'P reads every enrollment row');
select is(pg_temp.seen_groups(), 'e1:c1,e1:c2,e1:c3,e2:c1', 'P reads every group row');
select pg_temp.as_user('a7');
select is(pg_temp.seen_schools(), 'e1:b1,e1:b2,e1:b3', 'G reads every enrollment row of e1, as before');
select is(pg_temp.seen_groups(), 'e1:c1,e1:c2,e1:c3', 'G reads every group row of e1, as before');
select pg_temp.as_user('a8');
select is(pg_temp.seen_schools(), 'e2:b1', 'AA reads their own enrollment row, as before');
select is(pg_temp.seen_groups(), 'e2:c1', 'AA reads their own group row, as before');

-- 6. Offline: the admin queries of the stream give each admin what the policies give.
reset role;
select set_eq($$ select athlete_id, school_id from rls_schools where who = 'SC' $$, $$ select * from pg_temp.stream_schools_admin(pg_temp.u('a2')) $$, 'the stream gives SC the enrollment rows the policy gives');
select set_eq($$ select athlete_id, group_id from rls_groups where who = 'SC' $$, $$ select * from pg_temp.stream_groups_admin(pg_temp.u('a2')) $$, 'the stream gives SC the group rows the policy gives');
select set_eq($$ select athlete_id, school_id from rls_schools where who = 'SAC' $$, $$ select * from pg_temp.stream_schools_admin(pg_temp.u('a3')) $$, 'the stream gives SAC the enrollment rows the policy gives');
select set_eq($$ select athlete_id, group_id from rls_groups where who = 'SAC' $$, $$ select * from pg_temp.stream_groups_admin(pg_temp.u('a3')) $$, 'the stream gives SAC the group rows the policy gives');

-- 7. The admin branch of both policies uses the (swimmer, school) pairs, no longer the school-free admin_athlete_ids.
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'athlete_schools'
     and policyname = 'athlete_schools_select') like '%admin_athlete_school_pairs%'
  and (select qual from pg_policies where schemaname = 'public' and tablename = 'athlete_schools'
     and policyname = 'athlete_schools_select') not like '%admin_athlete_ids%',
  'the athlete_schools select policy matches the admin pairs of app.admin_athlete_school_pairs() and not admin_athlete_ids');
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'athlete_groups'
     and policyname = 'athlete_groups_select') like '%admin_athlete_school_pairs%'
  and (select qual from pg_policies where schemaname = 'public' and tablename = 'athlete_groups'
     and policyname = 'athlete_groups_select') not like '%admin_athlete_ids%',
  'the athlete_groups select policy matches the admin pairs of app.admin_athlete_school_pairs() and not admin_athlete_ids');

select * from finish();
rollback;
