-- A coach reads a plan fulfillment only when the swimmer is assigned to them, directly or through a group, in the
-- school of the fulfillment's assignment, and the coach is active in that school (issue #1127, as #1122 did for
-- measurements). A swimmer of schools A and B assigned to coach K only in B: K reads the B fulfillments, not the A
-- ones. School admins, the platform admin, guardians and adult athletes read what they read before. The
-- training_plans_fulfillments stream gives staff the same rows; src/modules/training-plans/__tests__/
-- coachFulfillmentsSyncStream.test.ts pins its queries: change both together.
-- Users: platform admin P (a1), school admins SA of A (a2) and SB of B (a3), coach K active in A and B (a4, e1
-- direct in B, e2 through group gB), coach C of A (a5, e1 direct in A, e2 through group gA), coach D deactivated
-- in A (a6, e1 direct in A), guardian G of e1 (a7), adult athlete AA of e3 (a8), N with no role (a9), M school
-- admin of A and coach of B with no assignment in B (aa). All users and data here are synthetic.
-- Fulfillments (school-wide assignments d1 in A and d2 in B): 41 e1 in A, 42 e2 in A, 43 e3 in A, 44 e1 in B,
-- 45 e2 in B, 46 e1 in A hidden (captured after the withdrawal of the record_times authorization of e1).
-- What the policy gave before this change, unchanged for everybody but the coaches: the platform admin all rows; the
-- managers of a swimmer all rows of that swimmer, hidden included; a school admin the not hidden rows of the
-- swimmers of their admin schools, whatever the school of the assignment.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- u('a1') is the uuid 11271000-0000-4000-8000-0000000000a1; as_user sets the signed-in user.
create function pg_temp.u(text) returns uuid language sql as $$ select ('11271000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- What the current user reads, by the last two characters of the id.
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(right(id::text, 2), ',' order by id), '') from public.training_plan_fulfillments where id::text like '11271000%' $$;
-- The staff queries of training_plans_fulfillments in powersync/sync-config.yaml, with the with: subqueries inlined for
-- the user. Pinned by src/modules/training-plans/__tests__/coachFulfillmentsSyncStream.test.ts: change both together.
create function pg_temp.staff_stream_ids(uuid) returns setof uuid language sql as $$
  select f.id from public.training_plan_fulfillments f
    join public.training_plan_assignments a on f.assignment_id = a.id
    join public.coach_athlete_assignments ca on f.athlete_id = ca.athlete_id and a.school_id = ca.school_id
    where ca.coach_user_id = $1 and f.hidden = false
      and a.school_id in (select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)
  union
  select f.id from public.training_plan_fulfillments f
    join public.training_plan_assignments a on f.assignment_id = a.id
    join public.athlete_groups ag on f.athlete_id = ag.athlete_id
    join public.training_groups tg on ag.group_id = tg.id and a.school_id = tg.school_id
    where ag.group_id in (
        select group_id from public.coach_group_assignments where coach_user_id = $1 and group_id in (
          select id from public.training_groups where school_id in (
            select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)))
      and f.hidden = false
      and a.school_id in (select school_id from public.school_memberships where user_id = $1 and deactivated_at is null)
  union
  select id from public.training_plan_fulfillments
    where athlete_id in (select athlete_id from public.athlete_schools where school_id in (
        select school_id from public.school_memberships where user_id = $1 and role = 'school_admin'))
      and hidden = false $$;
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
  (pg_temp.u('b1'), 'Fulfillment School A'), (pg_temp.u('b2'), 'Fulfillment School B');
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

-- A plan with one version and one block in each school, and a school-wide assignment of each: d1 in A, d2 in B.
insert into public.training_plans (id, created_by, school_id, name) values
  (pg_temp.u('f1'), pg_temp.u('a2'), pg_temp.u('b1'), 'Plan A'),
  (pg_temp.u('f2'), pg_temp.u('a3'), pg_temp.u('b2'), 'Plan B');
insert into public.training_plan_versions (id, created_by, plan_id, version) values
  (pg_temp.u('51'), pg_temp.u('a2'), pg_temp.u('f1'), 1),
  (pg_temp.u('52'), pg_temp.u('a3'), pg_temp.u('f2'), 1);
insert into public.training_plan_blocks
  (id, created_by, version_id, position, repetitions, distance, stroke, phase, recording) values
  (pg_temp.u('61'), pg_temp.u('a2'), pg_temp.u('51'), 1, 4, '50m', 'FR', 'warm_up', 'completion'),
  (pg_temp.u('62'), pg_temp.u('a3'), pg_temp.u('52'), 1, 4, '50m', 'FR', 'warm_up', 'completion');
insert into public.training_plan_assignments (id, created_by, school_id, plan_id, version_id, session_date, target) values
  (pg_temp.u('d1'), pg_temp.u('a2'), pg_temp.u('b1'), pg_temp.u('f1'), pg_temp.u('51'), '2026-10-26', 'school'),
  (pg_temp.u('d2'), pg_temp.u('a3'), pg_temp.u('b2'), pg_temp.u('f2'), pg_temp.u('52'), '2026-10-26', 'school');

-- The guardian of e1 authorizes record_times and withdraws on device day 2026-10-05: a mark of e1 captured after
-- that day is stored and ends hidden (the compute trigger decides, never the insert).
insert into public.authorization_texts (id, purpose, version, language, body) values
  (pg_temp.u('71'), 'record_times', 1, 'en-US', 'Synthetic record times text v1');
insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at, user_id) values
  (pg_temp.u('81'), pg_temp.u('e1'), 'record_times', pg_temp.u('71'), '2026-10-01 08:00:00+00', pg_temp.u('a7'));
update public.authorizations set withdrawn_at = '2026-10-05 09:00:00+00' where id = pg_temp.u('81');

-- Inserted as the owner, with the author set. 41 e1 in A, 42 e2 in A, 43 e3 in A, 44 e1 in B, 45 e2 in B,
-- 46 e1 in A captured after the withdrawal.
insert into public.training_plan_fulfillments
  (id, created_by, device_id, assignment_id, version_id, block_id, athlete_id, captured_at) values
  (pg_temp.u('41'), pg_temp.u('a5'), 'dev-1', pg_temp.u('d1'), pg_temp.u('51'), pg_temp.u('61'), pg_temp.u('e1'), '2026-10-02 08:00:00+00'),
  (pg_temp.u('42'), pg_temp.u('a5'), 'dev-1', pg_temp.u('d1'), pg_temp.u('51'), pg_temp.u('61'), pg_temp.u('e2'), '2026-10-02 08:01:00+00'),
  (pg_temp.u('43'), pg_temp.u('a5'), 'dev-1', pg_temp.u('d1'), pg_temp.u('51'), pg_temp.u('61'), pg_temp.u('e3'), '2026-10-02 08:02:00+00'),
  (pg_temp.u('44'), pg_temp.u('a4'), 'dev-2', pg_temp.u('d2'), pg_temp.u('52'), pg_temp.u('62'), pg_temp.u('e1'), '2026-10-02 08:03:00+00'),
  (pg_temp.u('45'), pg_temp.u('a4'), 'dev-2', pg_temp.u('d2'), pg_temp.u('52'), pg_temp.u('62'), pg_temp.u('e2'), '2026-10-02 08:04:00+00'),
  (pg_temp.u('46'), pg_temp.u('a5'), 'dev-1', pg_temp.u('d1'), pg_temp.u('51'), pg_temp.u('61'), pg_temp.u('e1'), '2026-10-07 08:00:00+00');

select is((select hidden from public.training_plan_fulfillments where id = pg_temp.u('46')), true,
  'the fixture has a hidden fulfillment: 46, e1 in A, captured after the withdrawal');

set local role authenticated;

-- 1. Coach K, active in A and B, has e1 (direct) and e2 (group) only in B: the B fulfillments, not the A ones.
select pg_temp.as_user('a4');
select is(pg_temp.seen(), '44,45', 'K reads the B fulfillments of e1 and e2, not their A ones nor e3');
insert into rls_seen select 'K', id from public.training_plan_fulfillments where id::text like '11271000%';

-- 2. Coach C of A, e1 direct and e2 through group gA: the A fulfillments, never the hidden 46.
select pg_temp.as_user('a5');
select is(pg_temp.seen(), '41,42', 'C reads the A fulfillments of the direct and the group swimmer, not the hidden one');
insert into rls_seen select 'C', id from public.training_plan_fulfillments where id::text like '11271000%';

-- 3. Coach D, deactivated in A, and N with no role read nothing.
select pg_temp.as_user('a6');
select is(pg_temp.seen(), '', 'deactivated D reads no fulfillment');
select pg_temp.as_user('a9');
select is(pg_temp.seen(), '', 'N reads no fulfillment');

-- 4. School admins read the not hidden fulfillments of the swimmers of their schools, whatever the assignment school:
-- SA the swimmers of A (e1, e2, e3), SB those of B (e1, e2).
select pg_temp.as_user('a2');
select is(pg_temp.seen(), '41,42,43,44,45', 'SA reads the not hidden fulfillments of e1, e2 and e3, as before');
insert into rls_seen select 'SA', id from public.training_plan_fulfillments where id::text like '11271000%';
select pg_temp.as_user('a3');
select is(pg_temp.seen(), '41,42,44,45', 'SB reads the not hidden fulfillments of e1 and e2, as before');
insert into rls_seen select 'SB', id from public.training_plan_fulfillments where id::text like '11271000%';

-- 5. M, admin of A and coach of B with no swimmer assigned in B: as admin of A, the swimmers of A; nothing as coach.
select pg_temp.as_user('aa');
select is(pg_temp.seen(), '41,42,43,44,45', 'M reads as admin of A, as before, and gains nothing as coach of B');
insert into rls_seen select 'M', id from public.training_plan_fulfillments where id::text like '11271000%';

-- 6. Platform admin reads everything, hidden included.
select pg_temp.as_user('a1');
select is(pg_temp.seen(), '41,42,43,44,45,46', 'P reads every fulfillment, the hidden one too');

-- 7. Guardian of e1 reads every fulfillment of e1, hidden included; the adult athlete e3 their own.
select pg_temp.as_user('a7');
select is(pg_temp.seen(), '41,44,46', 'G reads every fulfillment of e1, the hidden one too, as before');
select pg_temp.as_user('a8');
select is(pg_temp.seen(), '43', 'AA reads their own fulfillment, as before');

-- 8. Offline: the staff queries of the stream give each staff user what the policy gives.
reset role;
select set_eq($$ select id from rls_seen where who = 'K' $$, $$ select * from pg_temp.staff_stream_ids(pg_temp.u('a4')) $$, 'the stream gives K what the policy gives');
select set_eq($$ select id from rls_seen where who = 'C' $$, $$ select * from pg_temp.staff_stream_ids(pg_temp.u('a5')) $$, 'the stream gives C what the policy gives');
select is_empty($$ select * from pg_temp.staff_stream_ids(pg_temp.u('a6')) $$, 'the stream gives deactivated D nothing');
select is_empty($$ select * from pg_temp.staff_stream_ids(pg_temp.u('a9')) $$, 'the stream gives N nothing');
select set_eq($$ select id from rls_seen where who = 'SA' $$, $$ select * from pg_temp.staff_stream_ids(pg_temp.u('a2')) $$, 'the stream gives SA what the policy gives');
select set_eq($$ select id from rls_seen where who = 'SB' $$, $$ select * from pg_temp.staff_stream_ids(pg_temp.u('a3')) $$, 'the stream gives SB what the policy gives');
select set_eq($$ select id from rls_seen where who = 'M' $$, $$ select * from pg_temp.staff_stream_ids(pg_temp.u('aa')) $$, 'the stream gives M what the policy gives');

-- 9. The coach branch of the policy uses the (swimmer, school) pairs, no longer the school-free coach_athlete_ids.
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'training_plan_fulfillments'
     and policyname = 'training_plan_fulfillments_select') like '%coach_athlete_school_pairs%'
  and (select qual from pg_policies where schemaname = 'public' and tablename = 'training_plan_fulfillments'
     and policyname = 'training_plan_fulfillments_select') not like '%coach_athlete_ids%',
  'the select policy matches the coach pairs of app.coach_athlete_school_pairs() and not coach_athlete_ids');

select * from finish();
rollback;
