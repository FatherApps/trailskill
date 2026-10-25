-- What the school console's Athletes section reads (issue #62): athletes,
-- athlete_schools, athlete_groups, athlete_managers, authorization_status,
-- measurements, categories, training_groups, coach_group_assignments and
-- coach_athlete_assignments, for one school. This file covers only what the
-- existing tests do not:
--   * athletes/visibility.test.sql already asserts, on public.athletes itself,
--     coach A (group plus direct assignment), school admin S and a user with
--     no relations; so athletes is not repeated for those three users here.
--   * school-console/admin_permissions.test.sql and managed-visibility.test.sql
--     cover admin writes and what guardians see of categories and groups.
--   * accounts/authorizations.test.sql and timing/measurements.test.sql cover
--     authorization_status and measurements per role, but never next to the
--     other console tables, and never for the admin of another school.
-- Here: the related tables for a coach (only the rows outside the
-- assignments are excluded, plus one positive anchor), the school admin, the
-- admin of ANOTHER school on every table (athletes included), and a user with
-- no relations. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- Users: school admin S and coach A (school 1), school admin T and coach B
-- (school 2), guardian G, and N with no relations.
insert into auth.users (id, email) values
  ('62000000-0000-4000-8000-0000000000a1', 'admin-s@example.test'),
  ('62000000-0000-4000-8000-0000000000a2', 'coach-a@example.test'),
  ('62000000-0000-4000-8000-0000000000a3', 'admin-t@example.test'),
  ('62000000-0000-4000-8000-0000000000a4', 'coach-b@example.test'),
  ('62000000-0000-4000-8000-0000000000a5', 'guardian-g@example.test'),
  ('62000000-0000-4000-8000-0000000000a6', 'no-relations@example.test');

insert into public.schools (id, name) values
  ('62000000-0000-4000-8000-0000000000b1', 'Console School One'),
  ('62000000-0000-4000-8000-0000000000b2', 'Console School Two');

insert into public.school_memberships (school_id, user_id, role) values
  ('62000000-0000-4000-8000-0000000000b1', '62000000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('62000000-0000-4000-8000-0000000000b1', '62000000-0000-4000-8000-0000000000a2', 'coach'),
  ('62000000-0000-4000-8000-0000000000b2', '62000000-0000-4000-8000-0000000000a3', 'school_admin'),
  ('62000000-0000-4000-8000-0000000000b2', '62000000-0000-4000-8000-0000000000a4', 'coach');

-- Categories c1, c2 in school 1; c3 in school 2.
insert into public.categories (id, school_id, name) values
  ('62000000-0000-4000-8000-0000000000c1', '62000000-0000-4000-8000-0000000000b1', 'Category One'),
  ('62000000-0000-4000-8000-0000000000c2', '62000000-0000-4000-8000-0000000000b1', 'Category Two'),
  ('62000000-0000-4000-8000-0000000000c3', '62000000-0000-4000-8000-0000000000b2', 'Category Three');

-- Group d1 is A's group; d2 is another group of school 1; d3 is in school 2.
insert into public.training_groups (id, school_id, name) values
  ('62000000-0000-4000-8000-0000000000d1', '62000000-0000-4000-8000-0000000000b1', 'Group One'),
  ('62000000-0000-4000-8000-0000000000d2', '62000000-0000-4000-8000-0000000000b1', 'Group Two'),
  ('62000000-0000-4000-8000-0000000000d3', '62000000-0000-4000-8000-0000000000b2', 'Group Three');

-- Athletes: e1 in d1 (A's group), e2 in d2 (outside A's assignments), e3 in d2
-- but assigned directly to A, e4 in school 2.
insert into public.athletes (id, first_name, last_name) values
  ('62000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('62000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('62000000-0000-4000-8000-0000000000e3', 'Athlete', 'E3'),
  ('62000000-0000-4000-8000-0000000000e4', 'Athlete', 'E4');

insert into public.athlete_schools (athlete_id, school_id, category_id) values
  ('62000000-0000-4000-8000-0000000000e1', '62000000-0000-4000-8000-0000000000b1', '62000000-0000-4000-8000-0000000000c1'),
  ('62000000-0000-4000-8000-0000000000e2', '62000000-0000-4000-8000-0000000000b1', '62000000-0000-4000-8000-0000000000c2'),
  ('62000000-0000-4000-8000-0000000000e3', '62000000-0000-4000-8000-0000000000b1', '62000000-0000-4000-8000-0000000000c1'),
  ('62000000-0000-4000-8000-0000000000e4', '62000000-0000-4000-8000-0000000000b2', '62000000-0000-4000-8000-0000000000c3');

insert into public.athlete_groups (athlete_id, group_id) values
  ('62000000-0000-4000-8000-0000000000e1', '62000000-0000-4000-8000-0000000000d1'),
  ('62000000-0000-4000-8000-0000000000e2', '62000000-0000-4000-8000-0000000000d2'),
  ('62000000-0000-4000-8000-0000000000e3', '62000000-0000-4000-8000-0000000000d2'),
  ('62000000-0000-4000-8000-0000000000e4', '62000000-0000-4000-8000-0000000000d3');

insert into public.coach_group_assignments (coach_user_id, group_id) values
  ('62000000-0000-4000-8000-0000000000a2', '62000000-0000-4000-8000-0000000000d1'),
  ('62000000-0000-4000-8000-0000000000a4', '62000000-0000-4000-8000-0000000000d3');

insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values
  ('62000000-0000-4000-8000-0000000000a2', '62000000-0000-4000-8000-0000000000e3'),
  ('62000000-0000-4000-8000-0000000000a4', '62000000-0000-4000-8000-0000000000e4');

-- Guardian G manages e1 and e2 (school 1); e3 has no manager; e4 (school 2) too.
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('62000000-0000-4000-8000-0000000000a5', '62000000-0000-4000-8000-0000000000e1', 'guardian'),
  ('62000000-0000-4000-8000-0000000000a5', '62000000-0000-4000-8000-0000000000e2', 'guardian'),
  ('62000000-0000-4000-8000-0000000000a5', '62000000-0000-4000-8000-0000000000e4', 'guardian');

-- The status table is maintained by a trigger on authorizations; as the test
-- owner the rows are written directly, one per athlete.
insert into public.authorization_status (athlete_id, purpose, is_granted) values
  ('62000000-0000-4000-8000-0000000000e1', 'record_times', true),
  ('62000000-0000-4000-8000-0000000000e2', 'record_times', false),
  ('62000000-0000-4000-8000-0000000000e3', 'record_times', true),
  ('62000000-0000-4000-8000-0000000000e4', 'record_times', true);

-- One measurement per athlete (m1..m4).
insert into public.measurements
  (id, created_by, device_id, kind, athlete_id, hundredths, stroke, distance, pool,
   session_type, source, captured_at)
select ('62000000-0000-4000-8000-0000000000f' || n)::uuid,
       '62000000-0000-4000-8000-0000000000a2', 'device-a', 'repetition',
       ('62000000-0000-4000-8000-0000000000e' || n)::uuid, 3150, 'FR', '50m', 'SCM',
       'training', 'screen_button', '2026-10-24 08:00:00+00'
from generate_series(1, 4) n;

set local role authenticated;

-- Coach A: assigned athletes are e1 (group d1) and e3 (direct); e2 is outside.
set local request.jwt.claims = '{"sub": "62000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select set_eq(
  'select athlete_id from public.athlete_schools',
  $$ values ('62000000-0000-4000-8000-0000000000e1'::uuid),
            ('62000000-0000-4000-8000-0000000000e3'::uuid) $$,
  'coach A reads the school link of assigned athletes only, not of e2'
);
select set_eq(
  'select athlete_id from public.athlete_groups',
  $$ values ('62000000-0000-4000-8000-0000000000e1'::uuid),
            ('62000000-0000-4000-8000-0000000000e3'::uuid) $$,
  'coach A reads the group link of assigned athletes only, not of e2'
);
select set_eq(
  'select athlete_id from public.authorization_status',
  $$ values ('62000000-0000-4000-8000-0000000000e1'::uuid),
            ('62000000-0000-4000-8000-0000000000e3'::uuid) $$,
  'coach A reads the authorization status of assigned athletes only, not of e2'
);
select set_eq(
  'select athlete_id from public.measurements',
  $$ values ('62000000-0000-4000-8000-0000000000e1'::uuid),
            ('62000000-0000-4000-8000-0000000000e3'::uuid) $$,
  'coach A reads the measurements of assigned athletes only, not of e2'
);

-- School admin S: every athlete of school 1 and the related rows, none of school 2.
set local request.jwt.claims = '{"sub": "62000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select set_eq(
  'select athlete_id from public.athlete_schools',
  $$ values ('62000000-0000-4000-8000-0000000000e1'::uuid),
            ('62000000-0000-4000-8000-0000000000e2'::uuid),
            ('62000000-0000-4000-8000-0000000000e3'::uuid) $$,
  'school admin S reads the school link of every athlete of S''s school only'
);
select set_eq(
  'select athlete_id from public.athlete_groups',
  $$ values ('62000000-0000-4000-8000-0000000000e1'::uuid),
            ('62000000-0000-4000-8000-0000000000e2'::uuid),
            ('62000000-0000-4000-8000-0000000000e3'::uuid) $$,
  'school admin S reads the group link of every athlete of S''s school only'
);
select set_eq(
  'select athlete_id from public.athlete_managers',
  $$ values ('62000000-0000-4000-8000-0000000000e1'::uuid),
            ('62000000-0000-4000-8000-0000000000e2'::uuid) $$,
  'school admin S reads the guardian links of S''s school athletes only'
);
select set_eq(
  'select athlete_id from public.authorization_status',
  $$ values ('62000000-0000-4000-8000-0000000000e1'::uuid),
            ('62000000-0000-4000-8000-0000000000e2'::uuid),
            ('62000000-0000-4000-8000-0000000000e3'::uuid) $$,
  'school admin S reads the authorization status of every athlete of S''s school only'
);
select set_eq(
  'select athlete_id from public.measurements',
  $$ values ('62000000-0000-4000-8000-0000000000e1'::uuid),
            ('62000000-0000-4000-8000-0000000000e2'::uuid),
            ('62000000-0000-4000-8000-0000000000e3'::uuid) $$,
  'school admin S reads the measurements of every athlete of S''s school only'
);
select set_eq(
  'select id from public.categories',
  $$ values ('62000000-0000-4000-8000-0000000000c1'::uuid),
            ('62000000-0000-4000-8000-0000000000c2'::uuid) $$,
  'school admin S reads the categories of S''s school only'
);
select set_eq(
  'select id from public.training_groups',
  $$ values ('62000000-0000-4000-8000-0000000000d1'::uuid),
            ('62000000-0000-4000-8000-0000000000d2'::uuid) $$,
  'school admin S reads the training groups of S''s school only'
);
select set_eq(
  'select group_id from public.coach_group_assignments',
  $$ values ('62000000-0000-4000-8000-0000000000d1'::uuid) $$,
  'school admin S reads the coach group assignments of S''s school only'
);
select set_eq(
  'select athlete_id from public.coach_athlete_assignments',
  $$ values ('62000000-0000-4000-8000-0000000000e3'::uuid) $$,
  'school admin S reads the direct coach assignments of S''s school only'
);

-- School admin T (school 2): anchor on T's own athlete, then nothing of school 1.
set local request.jwt.claims = '{"sub": "62000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select set_eq(
  'select athlete_id from public.athlete_schools',
  $$ values ('62000000-0000-4000-8000-0000000000e4'::uuid) $$,
  'school admin T reads the school link of T''s own athlete only'
);
select is_empty(
  $$ select 1 from public.athletes
     where id in ('62000000-0000-4000-8000-0000000000e1', '62000000-0000-4000-8000-0000000000e2',
                  '62000000-0000-4000-8000-0000000000e3') $$,
  'school admin T reads no athlete of another school'
);
select is_empty(
  $$ select 1 from public.athlete_schools
     where school_id = '62000000-0000-4000-8000-0000000000b1' $$,
  'school admin T reads no school link of another school'
);
select is_empty(
  $$ select 1 from public.athlete_groups
     where group_id in ('62000000-0000-4000-8000-0000000000d1', '62000000-0000-4000-8000-0000000000d2') $$,
  'school admin T reads no group link of another school'
);
select is_empty(
  $$ select 1 from public.athlete_managers
     where athlete_id in ('62000000-0000-4000-8000-0000000000e1', '62000000-0000-4000-8000-0000000000e2') $$,
  'school admin T reads no guardian link of another school'
);
select is_empty(
  $$ select 1 from public.authorization_status
     where athlete_id in ('62000000-0000-4000-8000-0000000000e1', '62000000-0000-4000-8000-0000000000e2',
                          '62000000-0000-4000-8000-0000000000e3') $$,
  'school admin T reads no authorization status of another school'
);
select is_empty(
  $$ select 1 from public.measurements
     where athlete_id in ('62000000-0000-4000-8000-0000000000e1', '62000000-0000-4000-8000-0000000000e2',
                          '62000000-0000-4000-8000-0000000000e3') $$,
  'school admin T reads no measurement of another school'
);
select is_empty(
  $$ select 1 from public.categories where school_id = '62000000-0000-4000-8000-0000000000b1' $$,
  'school admin T reads no category of another school'
);
select is_empty(
  $$ select 1 from public.training_groups where school_id = '62000000-0000-4000-8000-0000000000b1' $$,
  'school admin T reads no training group of another school'
);
select is_empty(
  $$ select 1 from public.coach_group_assignments
     where group_id in ('62000000-0000-4000-8000-0000000000d1', '62000000-0000-4000-8000-0000000000d2') $$,
  'school admin T reads no coach group assignment of another school'
);
select is_empty(
  $$ select 1 from public.coach_athlete_assignments
     where athlete_id in ('62000000-0000-4000-8000-0000000000e1', '62000000-0000-4000-8000-0000000000e2',
                          '62000000-0000-4000-8000-0000000000e3') $$,
  'school admin T reads no direct coach assignment of another school'
);

-- User with no relations: nothing in any console table (athletes is covered
-- by athletes/visibility.test.sql).
set local request.jwt.claims = '{"sub": "62000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is_empty('select 1 from public.athlete_schools', 'a user with no relations reads no school link');
select is_empty('select 1 from public.athlete_groups', 'a user with no relations reads no group link');
select is_empty('select 1 from public.athlete_managers', 'a user with no relations reads no guardian link');
select is_empty('select 1 from public.authorization_status', 'a user with no relations reads no authorization status');
select is_empty('select 1 from public.measurements', 'a user with no relations reads no measurement');
select is_empty('select 1 from public.categories', 'a user with no relations reads no category');
select is_empty('select 1 from public.training_groups', 'a user with no relations reads no training group');
select is_empty('select 1 from public.coach_group_assignments', 'a user with no relations reads no coach group assignment');
select is_empty('select 1 from public.coach_athlete_assignments', 'a user with no relations reads no direct coach assignment');

select * from finish();
rollback;
