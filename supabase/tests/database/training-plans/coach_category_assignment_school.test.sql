-- A coach gets the assignments of a category through the training_plans_assignments_staff stream only for the categories
-- of the (swimmer, school) pairs where the swimmer is assigned to them in that same school, directly or through a group
-- of that school (issue #1149, as #1127 did for fulfillments and #1132 for enrollments). Before this change the stream
-- matched the swimmer and the school separately (coach_direct_category_ids, coach_group_category_ids): a swimmer
-- assigned to coach K only in A and also enrolled in B with a category of B gave K the assignments of that category of
-- B. The select policy of training_plan_assignments lets any member read the whole school, so this change is sync only.
-- src/modules/training-plans/__tests__/coachCategoryAssignmentsSyncStream.test.ts pins the queries: change both together.
-- Users: coach K active in A and B (a4, e1 direct in A, e2 direct in B), coach L active in A and B (a7, group gA of A),
-- coach M active in A and B (a8, group gB of B), coach D deactivated in A (a6, e1 direct in A), N with no role (a9),
-- school admin SA of A (a2) and SB of B (a3). All users and data here are synthetic.
-- Enrollment: e1 and e2 in A and B, e3 in A and B; categories c1..c3 in A and c4..c6 in B: e1 has c1 in A and c4 in B,
-- e2 has c2 in A and c5 in B, e3 has c3 in A and c6 in B. e3 is in group gA (91, A) and gB (92, B).
-- Category assignments: d1 c1, d2 c2, d3 c3 in A; d4 c4, d5 c5, d6 c6 in B; d7 c1 in A, withdrawn.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- u('a1') is the uuid 11490000-0000-4000-8000-0000000000a1.
create function pg_temp.u(text) returns uuid language sql as $$ select ('11490000-0000-4000-8000-0000000000' || $1)::uuid $$;
-- The ids as the last two characters of the id, in order: d1,d5.
create function pg_temp.sfx(uuid[]) returns text language sql as $$
  select coalesce(string_agg(right(i::text, 2), ',' order by i), '') from unnest($1) i $$;
-- The first coach category query of training_plans_assignments_staff in powersync/sync-config.yaml, with the with:
-- subquery member_school_ids inlined for the user. Pinned by src/modules/training-plans/__tests__/
-- coachCategoryAssignmentsSyncStream.test.ts: change both together.
create function pg_temp.stream_direct_category(uuid) returns setof uuid language sql as $$
  select a.id from public.training_plan_assignments a
    join public.athlete_schools s on a.category_id = s.category_id and a.school_id = s.school_id
    join public.coach_athlete_assignments ca on s.athlete_id = ca.athlete_id and s.school_id = ca.school_id
    where ca.coach_user_id = $1
      and a.school_id in (select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)
      and a.withdrawn_at is null $$;
-- The second one: coach_group_ids is the group assignments in the active schools. Pinned by the same Jest test.
create function pg_temp.stream_group_category(uuid) returns setof uuid language sql as $$
  select a.id from public.training_plan_assignments a
    join public.athlete_schools s on a.category_id = s.category_id and a.school_id = s.school_id
    join public.athlete_groups ag on s.athlete_id = ag.athlete_id
    join public.training_groups tg on ag.group_id = tg.id and s.school_id = tg.school_id
    where ag.group_id in (
        select group_id from public.coach_group_assignments where coach_user_id = $1 and group_id in (
          select id from public.training_groups where school_id in (
            select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)))
      and a.school_id in (select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)
      and a.withdrawn_at is null $$;
create function pg_temp.stream_ids(uuid) returns text language sql as $$
  select pg_temp.sfx(array(select pg_temp.stream_direct_category($1) union select pg_temp.stream_group_category($1))) $$;
-- What the stream gave before this change: coach_direct_category_ids and coach_group_category_ids matched the school and
-- the swimmer separately, and the assignment query matched the category and the school separately.
create function pg_temp.old_stream_ids(uuid) returns text language sql as $$
  select pg_temp.sfx(array(
    select id from public.training_plan_assignments
      where category_id in (
        select category_id from public.athlete_schools where category_id is not null
          and school_id in (select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)
          and athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = $1 and school_id in (
            select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)))
        and school_id in (select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)
        and withdrawn_at is null
    union
    select id from public.training_plan_assignments
      where category_id in (
        select category_id from public.athlete_schools where category_id is not null
          and school_id in (select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)
          and athlete_id in (select athlete_id from public.athlete_groups where group_id in (
            select group_id from public.coach_group_assignments where coach_user_id = $1 and group_id in (
              select id from public.training_groups where school_id in (
                select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)))))
        and school_id in (select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)
        and withdrawn_at is null)) $$;

insert into auth.users (id, email) values
  (pg_temp.u('a2'), 'admin-sa@example.test'), (pg_temp.u('a3'), 'admin-sb@example.test'),
  (pg_temp.u('a4'), 'coach-k@example.test'), (pg_temp.u('a6'), 'coach-d@example.test'),
  (pg_temp.u('a7'), 'coach-l@example.test'), (pg_temp.u('a8'), 'coach-m@example.test'),
  (pg_temp.u('a9'), 'nobody-n@example.test');
insert into public.schools (id, name) values
  (pg_temp.u('b1'), 'Category School A'), (pg_temp.u('b2'), 'Category School B');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a2'), 'school_admin'), (pg_temp.u('b2'), pg_temp.u('a3'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a4'), 'coach'), (pg_temp.u('b2'), pg_temp.u('a4'), 'coach'),
  (pg_temp.u('b1'), pg_temp.u('a6'), 'coach'),
  (pg_temp.u('b1'), pg_temp.u('a7'), 'coach'), (pg_temp.u('b2'), pg_temp.u('a7'), 'coach'),
  (pg_temp.u('b1'), pg_temp.u('a8'), 'coach'), (pg_temp.u('b2'), pg_temp.u('a8'), 'coach');
-- The trigger stamps the time, so D is deactivated after being created active.
update public.school_memberships set deactivated_at = now()
  where school_id = pg_temp.u('b1') and user_id = pg_temp.u('a6');

insert into public.categories (id, school_id, name) values
  (pg_temp.u('c1'), pg_temp.u('b1'), 'Category A1'), (pg_temp.u('c2'), pg_temp.u('b1'), 'Category A2'),
  (pg_temp.u('c3'), pg_temp.u('b1'), 'Category A3'), (pg_temp.u('c4'), pg_temp.u('b2'), 'Category B1'),
  (pg_temp.u('c5'), pg_temp.u('b2'), 'Category B2'), (pg_temp.u('c6'), pg_temp.u('b2'), 'Category B3');
insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'E1'), (pg_temp.u('e2'), 'Athlete', 'E2'), (pg_temp.u('e3'), 'Athlete', 'E3');
insert into public.athlete_schools (athlete_id, school_id, category_id) values
  (pg_temp.u('e1'), pg_temp.u('b1'), pg_temp.u('c1')), (pg_temp.u('e1'), pg_temp.u('b2'), pg_temp.u('c4')),
  (pg_temp.u('e2'), pg_temp.u('b1'), pg_temp.u('c2')), (pg_temp.u('e2'), pg_temp.u('b2'), pg_temp.u('c5')),
  (pg_temp.u('e3'), pg_temp.u('b1'), pg_temp.u('c3')), (pg_temp.u('e3'), pg_temp.u('b2'), pg_temp.u('c6'));
insert into public.training_groups (id, school_id, name) values
  (pg_temp.u('91'), pg_temp.u('b1'), 'Group A'), (pg_temp.u('92'), pg_temp.u('b2'), 'Group B');
insert into public.athlete_groups (athlete_id, group_id) values
  (pg_temp.u('e3'), pg_temp.u('91')), (pg_temp.u('e3'), pg_temp.u('92'));
insert into public.coach_group_assignments (coach_user_id, group_id) values
  (pg_temp.u('a7'), pg_temp.u('91')), (pg_temp.u('a8'), pg_temp.u('92'));
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  (pg_temp.u('a4'), pg_temp.u('e1'), pg_temp.u('b1')),
  (pg_temp.u('a4'), pg_temp.u('e2'), pg_temp.u('b2')),
  (pg_temp.u('a6'), pg_temp.u('e1'), pg_temp.u('b1'));

insert into public.training_plans (id, created_by, school_id, name) values
  (pg_temp.u('f1'), pg_temp.u('a2'), pg_temp.u('b1'), 'Plan A'),
  (pg_temp.u('f2'), pg_temp.u('a3'), pg_temp.u('b2'), 'Plan B');
insert into public.training_plan_versions (id, created_by, plan_id, version) values
  (pg_temp.u('51'), pg_temp.u('a2'), pg_temp.u('f1'), 1),
  (pg_temp.u('52'), pg_temp.u('a3'), pg_temp.u('f2'), 1);
insert into public.training_plan_assignments (id, created_by, school_id, plan_id, version_id, session_date, target, category_id) values
  (pg_temp.u('d1'), pg_temp.u('a2'), pg_temp.u('b1'), pg_temp.u('f1'), pg_temp.u('51'), '2026-10-26', 'category', pg_temp.u('c1')),
  (pg_temp.u('d2'), pg_temp.u('a2'), pg_temp.u('b1'), pg_temp.u('f1'), pg_temp.u('51'), '2026-10-26', 'category', pg_temp.u('c2')),
  (pg_temp.u('d3'), pg_temp.u('a2'), pg_temp.u('b1'), pg_temp.u('f1'), pg_temp.u('51'), '2026-10-26', 'category', pg_temp.u('c3')),
  (pg_temp.u('d4'), pg_temp.u('a3'), pg_temp.u('b2'), pg_temp.u('f2'), pg_temp.u('52'), '2026-10-26', 'category', pg_temp.u('c4')),
  (pg_temp.u('d5'), pg_temp.u('a3'), pg_temp.u('b2'), pg_temp.u('f2'), pg_temp.u('52'), '2026-10-26', 'category', pg_temp.u('c5')),
  (pg_temp.u('d6'), pg_temp.u('a3'), pg_temp.u('b2'), pg_temp.u('f2'), pg_temp.u('52'), '2026-10-26', 'category', pg_temp.u('c6'));
-- d7 is d1 withdrawn: the trigger stamps the time and keeps the author of the withdrawal.
insert into public.training_plan_assignments (id, created_by, school_id, plan_id, version_id, session_date, target, category_id, withdrawn_at, withdrawn_by) values
  (pg_temp.u('d7'), pg_temp.u('a2'), pg_temp.u('b1'), pg_temp.u('f1'), pg_temp.u('51'), '2026-10-27', 'category', pg_temp.u('c1'), now(), pg_temp.u('a2'));

-- 1. K is assigned e1 only in A: the A category of e1 (d1), not its B category (d4). K is assigned e2 only in B: the B
-- category of e2 (d5), not its A category (d2).
select is(pg_temp.stream_ids(pg_temp.u('a4')), 'd1,d5', 'K gets the category assignments of e1 in A and of e2 in B, not d2 nor d4');
select is(pg_temp.old_stream_ids(pg_temp.u('a4')), 'd1,d2,d4,d5', 'before this change K also got d4 (e1 in B) and d2 (e2 in A) with the same data');
select is(pg_temp.sfx(array(select pg_temp.stream_direct_category(pg_temp.u('a4')))), 'd1,d5', 'both come through the direct query');
select is(pg_temp.sfx(array(select pg_temp.stream_group_category(pg_temp.u('a4')))), '', 'K has no group: the group query gives nothing');

-- 2. L has group gA (A) and e3 is in gA and gB: the A category of e3 (d3), not its B category (d6).
select is(pg_temp.stream_ids(pg_temp.u('a7')), 'd3', 'L, with the group of A only, gets d3 and not d6');
select is(pg_temp.old_stream_ids(pg_temp.u('a7')), 'd3,d6', 'before this change L also got d6 with the same data');
-- 3. M has group gB (B): the B category of e3 (d6), not its A category (d3).
select is(pg_temp.stream_ids(pg_temp.u('a8')), 'd6', 'M, with the group of B, gets d6 and not d3');

-- 4. A deactivated coach and a user with no role get nothing.
select is(pg_temp.stream_ids(pg_temp.u('a6')), '', 'deactivated D gets no category assignment');
select is(pg_temp.stream_ids(pg_temp.u('a9')), '', 'N gets no category assignment');

-- 5. A withdrawn assignment reaches nobody: d7 has the category of d1, yet K gets only d1.
select is((select count(*)::int from public.training_plan_assignments where category_id = pg_temp.u('c1') and withdrawn_at is not null), 1,
  'the fixture has a withdrawn assignment of the category of d1');
select is(pg_temp.stream_ids(pg_temp.u('a4')) like '%d7%', false, 'K does not get the withdrawn d7');

select * from finish();
rollback;
