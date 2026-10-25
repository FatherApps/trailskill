-- Foundations schema: the 11 tables exist, every one has row level security
-- and the policies its role needs, the powersync publication includes them,
-- every app function is security definer with an empty search_path, and anon
-- reads and writes nothing. All data here is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create temp table expected_tables (name text primary key) on commit drop;
insert into expected_tables (name) values
  ('schools'), ('categories'), ('training_groups'), ('school_memberships'),
  ('coach_group_assignments'), ('coach_athlete_assignments'),
  ('athletes'), ('athlete_schools'), ('athlete_groups'),
  ('athlete_managers'), ('platform_admins');

select has_table('public', 'schools', 'schools exists');
select has_table('public', 'categories', 'categories exists');
select has_table('public', 'training_groups', 'training_groups exists');
select has_table('public', 'school_memberships', 'school_memberships exists');
select has_table('public', 'coach_group_assignments', 'coach_group_assignments exists');
select has_table('public', 'coach_athlete_assignments', 'coach_athlete_assignments exists');
select has_table('public', 'athletes', 'athletes exists');
select has_table('public', 'athlete_schools', 'athlete_schools exists');
select has_table('public', 'athlete_groups', 'athlete_groups exists');
select has_table('public', 'athlete_managers', 'athlete_managers exists');
select has_table('public', 'platform_admins', 'platform_admins exists');

select is_empty(
  $$ select e.name from expected_tables e
     left join pg_class c on c.relname = e.name and c.relnamespace = 'public'::regnamespace
     where not coalesce(c.relrowsecurity, false) $$,
  'every table has row level security enabled'
);

select is_empty(
  $$ select name from expected_tables
     except
     select tablename::text from pg_publication_tables
     where pubname = 'powersync' and schemaname = 'public' $$,
  'the powersync publication includes every table'
);

-- One synthetic row per table, inserted as the test owner (bypasses RLS).
insert into auth.users (id, email)
values ('00000000-0000-4000-8000-0000000000a1', 'schema-test-user@example.test');
insert into public.schools (id, name)
values ('00000000-0000-4000-8000-0000000000b1', 'Schema Test School');
insert into public.categories (id, school_id, name)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'Schema Test Category');
insert into public.training_groups (id, school_id, name)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b1', 'Schema Test Group');
insert into public.school_memberships (school_id, user_id, role)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'coach');
insert into public.coach_group_assignments (coach_user_id, group_id)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1');
insert into public.athletes (id, first_name, last_name)
values ('00000000-0000-4000-8000-0000000000e1', 'Test', 'Athlete');
insert into public.athlete_schools (athlete_id, school_id, category_id)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1');
insert into public.athlete_groups (athlete_id, group_id)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1');
insert into public.coach_athlete_assignments (coach_user_id, athlete_id)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1');
insert into public.athlete_managers (user_id, athlete_id, relation)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'guardian');
insert into public.platform_admins (user_id)
values ('00000000-0000-4000-8000-0000000000a1');

select is_empty(
  $$ select e.name, c.cmd from expected_tables e
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) c(cmd)
     where not exists (
       select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = e.name
         and 'authenticated' = any (p.roles)
         and p.cmd in (c.cmd, 'ALL')
     ) $$,
  'every table has a policy for each command authenticated uses'
);

select is_empty(
  $$ select proname from pg_proc
     where pronamespace = 'app'::regnamespace
       and not (prosecdef and coalesce(proconfig, '{}') @> array['search_path=""']) $$,
  'every app function is security definer with an empty search_path'
);

-- anon has no policies: it reads nothing and cannot write.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is_empty('select 1 from public.schools', 'anon reads no schools');
select is_empty('select 1 from public.categories', 'anon reads no categories');
select is_empty('select 1 from public.training_groups', 'anon reads no training_groups');
select is_empty('select 1 from public.school_memberships', 'anon reads no school_memberships');
select is_empty('select 1 from public.coach_group_assignments', 'anon reads no coach_group_assignments');
select is_empty('select 1 from public.coach_athlete_assignments', 'anon reads no coach_athlete_assignments');
select is_empty('select 1 from public.athletes', 'anon reads no athletes');
select is_empty('select 1 from public.athlete_schools', 'anon reads no athlete_schools');
select is_empty('select 1 from public.athlete_groups', 'anon reads no athlete_groups');
select is_empty('select 1 from public.athlete_managers', 'anon reads no athlete_managers');
select is_empty('select 1 from public.platform_admins', 'anon reads no platform_admins');
select throws_ok(
  $$ insert into public.athletes (first_name, last_name) values ('Anon', 'Writer') $$,
  '42501', null,
  'anon cannot insert into athletes'
);

select * from finish();
rollback;
