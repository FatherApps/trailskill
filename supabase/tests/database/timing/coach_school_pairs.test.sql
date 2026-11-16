-- app.coach_athlete_school_pairs() is the set form of app.coach_has_athlete_in_school() (issue #1127): the
-- (athlete, school) pairs the signed-in coach has assigned, directly or through a group of that school, only in
-- schools where the coach is active. measurements_select uses it as a hashed subplan instead of calling the
-- function per row, and who reads what must not change.
-- Users: coach C (a1) active in A and B, coach K (a2) active in A and deactivated in B, N with no role (a3), school
-- admin SA of A (a4), R (a5) coach of A and B who authored every mark and conflict. Schools: A (b1), B (b2).
-- Swimmers: X (e1) only in A, assigned to C directly in A; Y (e2) in A and B, assigned to C directly only in B and
-- to K directly in B; Z (e3) in A and B, in group gB (c1, school B) coached by C and assigned to K directly in A.
-- Marks: d1 X in A, d2 Y in A, d3 Y in B, d4 Z in A, d5 Z in B; conflict f1..f5 on d1..d5.
-- All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- u('a1') is the uuid 11270000-0000-4000-8000-0000000000a1; as_user sets the signed-in user.
create function pg_temp.u(text) returns uuid language sql as $$ select ('11270000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- The pairs of the current user, by the last two characters of each id.
create function pg_temp.pairs() returns text language sql as $$
  select coalesce(string_agg(right(athlete_id::text, 2) || '/' || right(school_id::text, 2), ',' order by athlete_id, school_id), '')
  from app.coach_athlete_school_pairs() $$;
-- How many (athlete, school) of the fixture differ between the set and the per-row function for the current user.
create function pg_temp.mismatches() returns int language sql as $$
  select count(*)::int
  from (values (pg_temp.u('e1')), (pg_temp.u('e2')), (pg_temp.u('e3'))) a(id)
  cross join (values (pg_temp.u('b1')), (pg_temp.u('b2'))) s(id)
  where ((a.id, s.id) in (select p.athlete_id, p.school_id from app.coach_athlete_school_pairs() p))
    is distinct from app.coach_has_athlete_in_school(a.id, s.id) $$;
-- What the current user reads, by the last two characters of the id.
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(right(id::text, 2), ',' order by id), '') from public.measurements where id::text like '11270000%' $$;
create function pg_temp.seen_conflicts() returns text language sql as $$
  select coalesce(string_agg(right(id::text, 2), ',' order by id), '') from public.measurement_conflicts where id::text like '11270000%' $$;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'coach-c@example.test'), (pg_temp.u('a2'), 'coach-k@example.test'),
  (pg_temp.u('a3'), 'nobody-n@example.test'), (pg_temp.u('a4'), 'admin-sa@example.test'),
  (pg_temp.u('a5'), 'author-r@example.test');
insert into public.schools (id, name) values
  (pg_temp.u('b1'), 'Pairs School A'), (pg_temp.u('b2'), 'Pairs School B');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a1'), 'coach'), (pg_temp.u('b2'), pg_temp.u('a1'), 'coach'),
  (pg_temp.u('b1'), pg_temp.u('a2'), 'coach'), (pg_temp.u('b2'), pg_temp.u('a2'), 'coach'),
  (pg_temp.u('b1'), pg_temp.u('a4'), 'school_admin'),
  (pg_temp.u('b1'), pg_temp.u('a5'), 'coach'), (pg_temp.u('b2'), pg_temp.u('a5'), 'coach');

-- e1 is X (only A), e2 is Y and e3 is Z (both A and B).
insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'X'), (pg_temp.u('e2'), 'Athlete', 'Y'), (pg_temp.u('e3'), 'Athlete', 'Z');
insert into public.athlete_schools (athlete_id, school_id) values
  (pg_temp.u('e1'), pg_temp.u('b1')),
  (pg_temp.u('e2'), pg_temp.u('b1')), (pg_temp.u('e2'), pg_temp.u('b2')),
  (pg_temp.u('e3'), pg_temp.u('b1')), (pg_temp.u('e3'), pg_temp.u('b2'));
insert into public.training_groups (id, school_id, name) values
  (pg_temp.u('c1'), pg_temp.u('b2'), 'Pairs Group B');
insert into public.athlete_groups (athlete_id, group_id) values (pg_temp.u('e3'), pg_temp.u('c1'));
insert into public.coach_group_assignments (coach_user_id, group_id) values (pg_temp.u('a1'), pg_temp.u('c1'));
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  (pg_temp.u('a1'), pg_temp.u('e1'), pg_temp.u('b1')),
  (pg_temp.u('a1'), pg_temp.u('e2'), pg_temp.u('b2')),
  (pg_temp.u('a2'), pg_temp.u('e2'), pg_temp.u('b2')),
  (pg_temp.u('a2'), pg_temp.u('e3'), pg_temp.u('b1'));
-- The trigger stamps the time, so K is deactivated in B after being created active.
update public.school_memberships set deactivated_at = now()
  where school_id = pg_temp.u('b2') and user_id = pg_temp.u('a2');

insert into public.measurements
  (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
values
  (pg_temp.u('d1'), pg_temp.u('a5'), pg_temp.u('b1'), 'repetition', pg_temp.u('e1'), 3500, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-11-10 08:00:00+00'),
  (pg_temp.u('d2'), pg_temp.u('a5'), pg_temp.u('b1'), 'repetition', pg_temp.u('e2'), 3600, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-11-10 08:01:00+00'),
  (pg_temp.u('d3'), pg_temp.u('a5'), pg_temp.u('b2'), 'repetition', pg_temp.u('e2'), 3700, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-2', '2026-11-10 08:02:00+00'),
  (pg_temp.u('d4'), pg_temp.u('a5'), pg_temp.u('b1'), 'repetition', pg_temp.u('e3'), 3800, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', '2026-11-10 08:03:00+00'),
  (pg_temp.u('d5'), pg_temp.u('a5'), pg_temp.u('b2'), 'repetition', pg_temp.u('e3'), 3900, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-2', '2026-11-10 08:04:00+00');
-- Conflicts, inserted as the owner (clients cannot write), by R so no reader gets one as a party.
insert into public.measurement_conflicts
  (id, measurement_id, base_version, current_values, current_by, incoming_values, incoming_by)
select pg_temp.u('f' || n), pg_temp.u('d' || n), 1, '{"hundredths": 3000, "version": 2}', pg_temp.u('a5'), '{"hundredths": 3050}', pg_temp.u('a5')
from generate_series(1, 5) n;

set local role authenticated;

-- 1-3. The pairs: C has X in A, Y in B and Z in B (group); K keeps only Z in A, its B assignment drops with the
-- deactivation; N has none.
select pg_temp.as_user('a1');
select is(pg_temp.pairs(), 'e1/b1,e2/b2,e3/b2', 'C has the pairs X in A, Y in B and Z in B');
select pg_temp.as_user('a2');
select is(pg_temp.pairs(), 'e3/b1', 'K has only Z in A: the B assignment is dropped because K is deactivated in B');
select pg_temp.as_user('a3');
select is(pg_temp.pairs(), '', 'N has no pair');

-- 4. The set and the per-row function agree on every swimmer and school of the fixture.
select pg_temp.as_user('a1');
select is(pg_temp.mismatches(), 0, 'for C the set and coach_has_athlete_in_school agree on every swimmer and school');
select pg_temp.as_user('a2');
select is(pg_temp.mismatches(), 0, 'for K the set and coach_has_athlete_in_school agree on every swimmer and school');
select pg_temp.as_user('a3');
select is(pg_temp.mismatches(), 0, 'for N the set and coach_has_athlete_in_school agree on every swimmer and school');

-- 5-6. C reads X in A, Y in B and Z in B, not Y in A nor Z in A, and the conflicts of those marks.
select pg_temp.as_user('a1');
select is(pg_temp.seen(), 'd1,d3,d5', 'C reads the marks of X in A, Y in B and Z in B, not Y in A nor Z in A');
select is(pg_temp.seen_conflicts(), 'f1,f3,f5', 'C reads the conflicts of those marks');

-- 7. K reads only Z in A.
select pg_temp.as_user('a2');
select is(pg_temp.seen(), 'd4', 'K reads only the mark of Z in A');
select is(pg_temp.seen_conflicts(), 'f4', 'K reads only the conflict of that mark');

-- 8. N reads nothing.
select pg_temp.as_user('a3');
select is(pg_temp.seen(), '', 'N reads no mark');
select is(pg_temp.seen_conflicts(), '', 'N reads no conflict');

-- School admin SA of A reads every mark of A, as before.
select pg_temp.as_user('a4');
select is(pg_temp.seen(), 'd1,d2,d4', 'SA reads every mark of A and none of B');
select is(pg_temp.seen_conflicts(), 'f1,f2,f4', 'SA reads every conflict of A and none of B');

reset role;

-- 9. The coach branch of the policy uses the set, not the per-row function.
select ok(
  (select qual like '%coach_athlete_school_pairs%' and qual not like '%coach_has_athlete_in_school%'
   from pg_policies where tablename = 'measurements' and policyname = 'measurements_select'),
  'measurements_select uses coach_athlete_school_pairs and no longer coach_has_athlete_in_school'
);

-- 10. Only signed-in users can call it.
select ok(
  not has_function_privilege('anon', 'app.coach_athlete_school_pairs()', 'execute'),
  'anon cannot execute coach_athlete_school_pairs'
);
select ok(
  has_function_privilege('authenticated', 'app.coach_athlete_school_pairs()', 'execute'),
  'signed-in users can execute coach_athlete_school_pairs'
);

select * from finish();
rollback;
