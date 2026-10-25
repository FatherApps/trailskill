-- A direct coach-to-athlete assignment belongs to one school (issues #257 and
-- #300). The coach must be a coach of that school and the athlete must be in it;
-- the school never changes after the insert. A school admin reads and writes only
-- the assignments of their own schools, the coach reads all of their own. Being
-- assigned in B counts only for an assignment of B or a coach group of B. Athlete
-- X is in schools A and B, athlete Y too, athlete Z only in B. All users and data
-- here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- Users: coach CA of A, coach CB of B, coach W of A and B, admin AA of A, admin
-- AB of B, and N with no relations.
insert into auth.users (id, email) values
  ('25700000-0000-4000-8000-0000000000a1', 'coach-ca@example.test'),
  ('25700000-0000-4000-8000-0000000000a2', 'coach-cb@example.test'),
  ('25700000-0000-4000-8000-0000000000a3', 'coach-w@example.test'),
  ('25700000-0000-4000-8000-0000000000a4', 'admin-aa@example.test'),
  ('25700000-0000-4000-8000-0000000000a5', 'admin-ab@example.test'),
  ('25700000-0000-4000-8000-0000000000a6', 'no-relation-n@example.test');

insert into public.schools (id, name) values
  ('25700000-0000-4000-8000-0000000000b1', 'Assignment School A'),
  ('25700000-0000-4000-8000-0000000000b2', 'Assignment School B');

insert into public.school_memberships (school_id, user_id, role) values
  ('25700000-0000-4000-8000-0000000000b1', '25700000-0000-4000-8000-0000000000a1', 'coach'),
  ('25700000-0000-4000-8000-0000000000b2', '25700000-0000-4000-8000-0000000000a2', 'coach'),
  ('25700000-0000-4000-8000-0000000000b1', '25700000-0000-4000-8000-0000000000a3', 'coach'),
  ('25700000-0000-4000-8000-0000000000b2', '25700000-0000-4000-8000-0000000000a3', 'coach'),
  ('25700000-0000-4000-8000-0000000000b1', '25700000-0000-4000-8000-0000000000a4', 'school_admin'),
  ('25700000-0000-4000-8000-0000000000b2', '25700000-0000-4000-8000-0000000000a5', 'school_admin');

-- e1 is X and e2 is Y, both in A and B; e3 (Z) is only in B.
insert into public.athletes (id, first_name, last_name) values
  ('25700000-0000-4000-8000-0000000000e1', 'Athlete', 'X'),
  ('25700000-0000-4000-8000-0000000000e2', 'Athlete', 'Y'),
  ('25700000-0000-4000-8000-0000000000e3', 'Athlete', 'Z'),
  ('25700000-0000-4000-8000-0000000000e4', 'Athlete', 'V');

insert into public.athlete_schools (athlete_id, school_id) values
  ('25700000-0000-4000-8000-0000000000e1', '25700000-0000-4000-8000-0000000000b1'),
  ('25700000-0000-4000-8000-0000000000e1', '25700000-0000-4000-8000-0000000000b2'),
  ('25700000-0000-4000-8000-0000000000e2', '25700000-0000-4000-8000-0000000000b1'),
  ('25700000-0000-4000-8000-0000000000e2', '25700000-0000-4000-8000-0000000000b2'),
  ('25700000-0000-4000-8000-0000000000e3', '25700000-0000-4000-8000-0000000000b2'),
  ('25700000-0000-4000-8000-0000000000e4', '25700000-0000-4000-8000-0000000000b1');

-- The backfill of the migration (app.coach_assignment_backfill_school_ids)
-- checks every row first and then fails once, naming how many rows have no
-- single possible school and the first ids. Run here, as the owner, with the
-- triggers off so the rows are stored without a school: 0901 has no candidate
-- (coach CA of A, athlete Z only in B), 0902 has two (coach W of A and B, athlete
-- X in both) and 0903 has exactly one (coach CB, athlete X: only B).
alter table public.coach_athlete_assignments alter column school_id drop not null;
alter table public.coach_athlete_assignments disable trigger user;
insert into public.coach_athlete_assignments (id, coach_user_id, athlete_id) values
  ('25700000-0000-4000-8000-000000000901', '25700000-0000-4000-8000-0000000000a1', '25700000-0000-4000-8000-0000000000e3'),
  ('25700000-0000-4000-8000-000000000902', '25700000-0000-4000-8000-0000000000a3', '25700000-0000-4000-8000-0000000000e1'),
  ('25700000-0000-4000-8000-000000000903', '25700000-0000-4000-8000-0000000000a2', '25700000-0000-4000-8000-0000000000e1');
select throws_ok(
  'select app.coach_assignment_backfill_school_ids()',
  'P0001',
  'coach_assignment_school_id backfill: 1 coach_athlete_assignments without a possible school '
    || '(first 10: 25700000-0000-4000-8000-000000000901); 1 with more than one possible school '
    || '(first 10: 25700000-0000-4000-8000-000000000902)',
  'one assignment with no possible school and one with two fail the backfill, reported by type with its id'
);
select is(
  (select school_id from public.coach_athlete_assignments where id = '25700000-0000-4000-8000-000000000903'),
  null,
  'the failed backfill wrote nothing: the assignment with one possible school is still null'
);
delete from public.coach_athlete_assignments where id = '25700000-0000-4000-8000-000000000901';
select throws_ok(
  'select app.coach_assignment_backfill_school_ids()',
  'P0001',
  'coach_assignment_school_id backfill: 0 coach_athlete_assignments without a possible school (first 10: none); '
    || '1 with more than one possible school (first 10: 25700000-0000-4000-8000-000000000902)',
  'with only an ambiguous assignment the backfill reports none for the other type'
);
delete from public.coach_athlete_assignments where id = '25700000-0000-4000-8000-000000000902';
select lives_ok(
  'select app.coach_assignment_backfill_school_ids()',
  'with only assignments that have exactly one possible school the backfill succeeds'
);
select is(
  (select school_id from public.coach_athlete_assignments where id = '25700000-0000-4000-8000-000000000903'),
  '25700000-0000-4000-8000-0000000000b2'::uuid,
  'the backfill gave the assignment its only possible school (B)'
);
select ok(
  not has_function_privilege('anon', 'app.coach_assignment_backfill_school_ids()', 'execute')
    and not has_function_privilege('public', 'app.coach_assignment_backfill_school_ids()', 'execute'),
  'anon and public cannot execute the backfill'
);
set local role authenticated;
select throws_ok(
  'select app.coach_assignment_backfill_school_ids()',
  '42501', null,
  'a signed-in client cannot execute the backfill'
);
reset role;
delete from public.coach_athlete_assignments where id = '25700000-0000-4000-8000-000000000903';
alter table public.coach_athlete_assignments enable trigger user;
alter table public.coach_athlete_assignments alter column school_id set not null;

-- Schema
select col_not_null('public', 'coach_athlete_assignments', 'school_id', 'every assignment has a school');
select fk_ok('public', 'coach_athlete_assignments', 'school_id', 'public', 'schools', 'id', 'the school of an assignment is a school');
select is(
  (select array_agg(cols order by cols) from (
     select (select string_agg(a.attname, ',' order by k.ord)
             from unnest(c.conkey) with ordinality as k(attnum, ord)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols
     from pg_constraint c
     where c.conrelid = 'public.coach_athlete_assignments'::regclass and c.contype = 'u') s),
  array['coach_user_id,athlete_id,school_id'],
  'the only unique key is coach, athlete and school'
);
select ok(
  not exists (
    select 1 from pg_constraint
    where conrelid = 'public.coach_athlete_assignments'::regclass
      and conname = 'coach_athlete_assignments_coach_user_id_athlete_id_key'
  ),
  'the old unique key on coach and athlete no longer exists'
);

-- s1: CA-X in A. s2: CB-X in B. s3 and s4: W-X in A and in B (the same coach and
-- athlete once per school). s5: W-Y in B only.
select lives_ok(
  $$ insert into public.coach_athlete_assignments (id, coach_user_id, athlete_id, school_id) values
       ('25700000-0000-4000-8000-0000000000c1', '25700000-0000-4000-8000-0000000000a1', '25700000-0000-4000-8000-0000000000e1', '25700000-0000-4000-8000-0000000000b1'),
       ('25700000-0000-4000-8000-0000000000c2', '25700000-0000-4000-8000-0000000000a2', '25700000-0000-4000-8000-0000000000e1', '25700000-0000-4000-8000-0000000000b2'),
       ('25700000-0000-4000-8000-0000000000c3', '25700000-0000-4000-8000-0000000000a3', '25700000-0000-4000-8000-0000000000e1', '25700000-0000-4000-8000-0000000000b1'),
       ('25700000-0000-4000-8000-0000000000c4', '25700000-0000-4000-8000-0000000000a3', '25700000-0000-4000-8000-0000000000e1', '25700000-0000-4000-8000-0000000000b2'),
       ('25700000-0000-4000-8000-0000000000c5', '25700000-0000-4000-8000-0000000000a3', '25700000-0000-4000-8000-0000000000e2', '25700000-0000-4000-8000-0000000000b2') $$,
  'the same coach and athlete can be assigned once in each school'
);
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id)
     values ('25700000-0000-4000-8000-0000000000a3', '25700000-0000-4000-8000-0000000000e1', '25700000-0000-4000-8000-0000000000b1') $$,
  '23505', null,
  'the same coach and athlete cannot be assigned twice in one school'
);

set local role authenticated;

-- Who reads what. Admin A never receives the assignment made in B for X.
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select set_eq(
  'select id from public.coach_athlete_assignments',
  $$ values ('25700000-0000-4000-8000-0000000000c1'::uuid), ('25700000-0000-4000-8000-0000000000c3'::uuid) $$,
  'admin A reads the assignments of A and none made in B'
);
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select set_eq(
  'select id from public.coach_athlete_assignments',
  $$ values ('25700000-0000-4000-8000-0000000000c2'::uuid), ('25700000-0000-4000-8000-0000000000c4'::uuid),
            ('25700000-0000-4000-8000-0000000000c5'::uuid) $$,
  'admin B reads the assignments of B and none made in A'
);
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select set_eq(
  'select id from public.coach_athlete_assignments',
  $$ values ('25700000-0000-4000-8000-0000000000c1'::uuid) $$,
  'coach CA reads their own assignment'
);
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select set_eq(
  'select id from public.coach_athlete_assignments',
  $$ values ('25700000-0000-4000-8000-0000000000c2'::uuid) $$,
  'coach CB reads their own assignment'
);
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select set_eq(
  'select id from public.coach_athlete_assignments',
  $$ values ('25700000-0000-4000-8000-0000000000c3'::uuid), ('25700000-0000-4000-8000-0000000000c4'::uuid),
            ('25700000-0000-4000-8000-0000000000c5'::uuid) $$,
  'coach W reads their own assignments of both schools'
);
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is_empty(
  'select id from public.coach_athlete_assignments',
  'a user with no relation reads no assignment'
);

-- Writes of admin A.
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id)
     values ('25700000-0000-4000-8000-0000000000a2', '25700000-0000-4000-8000-0000000000e2', '25700000-0000-4000-8000-0000000000b2') $$,
  '42501', 'new row violates row-level security policy for table "coach_athlete_assignments"',
  'admin A cannot assign in B, although the coach and the athlete are in B'
);
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id)
     values ('25700000-0000-4000-8000-0000000000a2', '25700000-0000-4000-8000-0000000000e1', '25700000-0000-4000-8000-0000000000b1') $$,
  '42501', 'the coach of an assignment must be a coach of its school',
  'admin A cannot assign in A a coach who is not a coach of A'
);
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id)
     values ('25700000-0000-4000-8000-0000000000a1', '25700000-0000-4000-8000-0000000000e3', '25700000-0000-4000-8000-0000000000b1') $$,
  '42501', 'the athlete of a coach assignment must be in its school',
  'admin A cannot assign in A an athlete who is not in A'
);
select throws_ok(
  $$ update public.coach_athlete_assignments set school_id = '25700000-0000-4000-8000-0000000000b2'
     where id = '25700000-0000-4000-8000-0000000000c3' $$,
  '42501', 'the school of a coach assignment cannot change',
  'admin A cannot move an assignment to another school'
);
select is_empty(
  $$ update public.coach_athlete_assignments set athlete_id = athlete_id
     where id = '25700000-0000-4000-8000-0000000000c4' returning id $$,
  'admin A updates no assignment of B'
);
select is_empty(
  $$ delete from public.coach_athlete_assignments
     where id = '25700000-0000-4000-8000-0000000000c4' returning id $$,
  'admin A deletes no assignment of B'
);
select lives_ok(
  $$ insert into public.coach_athlete_assignments (id, coach_user_id, athlete_id)
     values ('25700000-0000-4000-8000-0000000000c6', '25700000-0000-4000-8000-0000000000a1', '25700000-0000-4000-8000-0000000000e2') $$,
  'admin A assigns without school_id a coach of A only: the only possible school is A'
);
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id)
     values ('25700000-0000-4000-8000-0000000000a3', '25700000-0000-4000-8000-0000000000e2') $$,
  '42501', 'new row violates row-level security policy for table "coach_athlete_assignments"',
  'admin A cannot assign without school_id when two schools are possible: RLS refuses the null school'
);
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id)
     values ('25700000-0000-4000-8000-0000000000a1', '25700000-0000-4000-8000-0000000000e1', '25700000-0000-4000-8000-0000000000b1') $$,
  '42501', null,
  'a coach cannot assign anyone, not even themselves'
);
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select throws_ok(
  $$ update public.coach_athlete_assignments set coach_user_id = '25700000-0000-4000-8000-0000000000a2'
     where id = '25700000-0000-4000-8000-0000000000c3' $$,
  '42501', 'the coach of an assignment must be a coach of its school',
  'admin A cannot move an assignment of A to a user who is not a coach of A'
);

-- A signed-in user who does not administer the school learns nothing about it:
-- both rejections carry the same generic RLS message. V is only in A.
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id)
     values ('25700000-0000-4000-8000-0000000000a1', '25700000-0000-4000-8000-0000000000e1', '25700000-0000-4000-8000-0000000000b2') $$,
  '42501', 'new row violates row-level security policy for table "coach_athlete_assignments"',
  'a coach of A, not admin of B, gets the generic RLS error when the coach is not a coach of B'
);
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id)
     values ('25700000-0000-4000-8000-0000000000a2', '25700000-0000-4000-8000-0000000000e4', '25700000-0000-4000-8000-0000000000b2') $$,
  '42501', 'new row violates row-level security policy for table "coach_athlete_assignments"',
  'a coach of A, not admin of B, gets the same generic RLS error when the athlete is not in B'
);
-- An admin of the school still gets the detailed messages.
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id)
     values ('25700000-0000-4000-8000-0000000000a1', '25700000-0000-4000-8000-0000000000e1', '25700000-0000-4000-8000-0000000000b2') $$,
  '42501', 'the coach of an assignment must be a coach of its school',
  'admin B still gets the detailed error when the coach is not a coach of B'
);
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id)
     values ('25700000-0000-4000-8000-0000000000a2', '25700000-0000-4000-8000-0000000000e4', '25700000-0000-4000-8000-0000000000b2') $$,
  '42501', 'the athlete of a coach assignment must be in its school',
  'admin B still gets the detailed error when the athlete is not in B'
);
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select isnt_empty(
  $$ delete from public.coach_athlete_assignments
     where id = '25700000-0000-4000-8000-0000000000c6' returning id $$,
  'admin A deletes an assignment of A'
);

-- The rows of B are still there and the school never changed.
reset role;
set local request.jwt.claims = '';
select is(
  (select count(*) from public.coach_athlete_assignments
   where id = '25700000-0000-4000-8000-0000000000c4' and school_id = '25700000-0000-4000-8000-0000000000b2'),
  1::bigint,
  'the assignment of B is still there, in B'
);
select is(
  (select school_id from public.coach_athlete_assignments where id = '25700000-0000-4000-8000-0000000000c3'),
  '25700000-0000-4000-8000-0000000000b1'::uuid,
  'the assignment of A is still in A'
);
select throws_ok(
  $$ update public.coach_athlete_assignments set school_id = '25700000-0000-4000-8000-0000000000b2'
     where id = '25700000-0000-4000-8000-0000000000c3' $$,
  '42501', 'the school of a coach assignment cannot change',
  'the owner cannot move an assignment to another school'
);
select throws_ok(
  $$ insert into public.coach_athlete_assignments (coach_user_id, athlete_id)
     values ('25700000-0000-4000-8000-0000000000a3', '25700000-0000-4000-8000-0000000000e2') $$,
  '23502', null,
  'without school_id and with two possible schools the row is rejected: school_id is not null'
);
select throws_ok(
  $$ update public.coach_athlete_assignments set athlete_id = '25700000-0000-4000-8000-0000000000e3'
     where id = '25700000-0000-4000-8000-0000000000c1' $$,
  '42501', 'the athlete of a coach assignment must be in its school',
  'the owner cannot point an assignment of A to an athlete who is not in A'
);

-- Training plans: a direct assignment counts only in its own school. W is
-- assigned to X in A and B, and to Y only in B.
set local role authenticated;
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(
  app.can_assign_training_plan('25700000-0000-4000-8000-0000000000b2', 'athlete', '25700000-0000-4000-8000-0000000000e2', null),
  true,
  'coach W may assign a plan in B to Y, assigned to them in B'
);
select is(
  app.can_assign_training_plan('25700000-0000-4000-8000-0000000000b1', 'athlete', '25700000-0000-4000-8000-0000000000e2', null),
  false,
  'coach W may not assign a plan in A to Y, assigned to them only in B'
);
select is(
  app.can_assign_training_plan('25700000-0000-4000-8000-0000000000b1', 'athlete', '25700000-0000-4000-8000-0000000000e1', null),
  true,
  'coach W may assign a plan in A to X, assigned to them in A'
);
select is(
  app.can_assign_training_plan('25700000-0000-4000-8000-0000000000b2', 'athlete', '25700000-0000-4000-8000-0000000000e1', null),
  true,
  'coach W may assign a plan in B to X, assigned to them in B'
);

-- The marks of an assigned athlete still work for the coach of the school.
set local request.jwt.claims = '{"sub": "25700000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.measurements
       (id, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('25700000-0000-4000-8000-0000000000f1', '25700000-0000-4000-8000-0000000000b2', 'repetition',
        '25700000-0000-4000-8000-0000000000e1', 3200, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-cb',
        '2026-10-24 09:00:00+00') $$,
  'coach CB, assigned to X in B, records a mark of X in B'
);
select is(
  (select count(*) from public.measurements where id = '25700000-0000-4000-8000-0000000000f1'),
  1::bigint,
  'coach CB reads the mark of X they recorded in B'
);

select * from finish();
rollback;
