-- What guardians and adult athletes see of schools, categories and training
-- groups (issue #126): only the rows linked to the athletes they manage, never
-- another school or the school's other categories and groups. All users and
-- data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- Users: guardian G, adult athlete X (relation 'self'), and N with no relations.
insert into auth.users (id, email) values
  ('20000000-0000-4000-8000-0000000000a1', 'guardian-g@example.test'),
  ('20000000-0000-4000-8000-0000000000a2', 'adult-x@example.test'),
  ('20000000-0000-4000-8000-0000000000a3', 'no-relations@example.test');

insert into public.schools (id, name) values
  ('20000000-0000-4000-8000-0000000000b1', 'Managed School One'),
  ('20000000-0000-4000-8000-0000000000b2', 'Managed School Two');

-- School 1: c1 (G's athlete), c2 (X), c3 (nobody here). School 2: c4.
insert into public.categories (id, school_id, name) values
  ('20000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000b1', 'Category One'),
  ('20000000-0000-4000-8000-0000000000c2', '20000000-0000-4000-8000-0000000000b1', 'Category Two'),
  ('20000000-0000-4000-8000-0000000000c3', '20000000-0000-4000-8000-0000000000b1', 'Category Three'),
  ('20000000-0000-4000-8000-0000000000c4', '20000000-0000-4000-8000-0000000000b2', 'Category Four');

-- School 1: g1 (G's athlete), g2 (nobody here). School 2: g3.
insert into public.training_groups (id, school_id, name) values
  ('20000000-0000-4000-8000-0000000000d1', '20000000-0000-4000-8000-0000000000b1', 'Group One'),
  ('20000000-0000-4000-8000-0000000000d2', '20000000-0000-4000-8000-0000000000b1', 'Group Two'),
  ('20000000-0000-4000-8000-0000000000d3', '20000000-0000-4000-8000-0000000000b2', 'Group Three');

-- e1 (G's) school 1 / c1 / g1; e2 (X's) school 1 / c2 / no group;
-- e3 school 2 / c4 / g3, managed by nobody here.
insert into public.athletes (id, first_name, last_name) values
  ('20000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('20000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('20000000-0000-4000-8000-0000000000e3', 'Athlete', 'E3');

insert into public.athlete_schools (athlete_id, school_id, category_id) values
  ('20000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000c1'),
  ('20000000-0000-4000-8000-0000000000e2', '20000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000c2'),
  ('20000000-0000-4000-8000-0000000000e3', '20000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-0000000000c4');

insert into public.athlete_groups (athlete_id, group_id) values
  ('20000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000d1'),
  ('20000000-0000-4000-8000-0000000000e3', '20000000-0000-4000-8000-0000000000d3');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('20000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000e1', 'guardian'),
  ('20000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-0000000000e2', 'self');

select is_empty(
  $$ select f.name from (values ('managed_school_ids'), ('managed_category_ids'), ('managed_group_ids')) f(name)
     where has_function_privilege('anon', 'app.' || f.name || '()', 'execute')
        or not has_function_privilege('authenticated', 'app.' || f.name || '()', 'execute') $$,
  'only authenticated can execute the managed link functions'
);

set local role authenticated;

-- Guardian G
set local request.jwt.claims = '{"sub": "20000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select set_eq(
  'select id from public.schools',
  $$ values ('20000000-0000-4000-8000-0000000000b1'::uuid) $$,
  'guardian G sees only the school of G''s athlete'
);
select set_eq(
  'select id from public.categories',
  $$ values ('20000000-0000-4000-8000-0000000000c1'::uuid) $$,
  'guardian G sees only the category of G''s athlete, not the school''s other categories'
);
select set_eq(
  'select id from public.training_groups',
  $$ values ('20000000-0000-4000-8000-0000000000d1'::uuid) $$,
  'guardian G sees only the group of G''s athlete, not the school''s other groups'
);

-- G cannot write what G can read.
select throws_ok(
  $$ insert into public.schools (name) values ('Guardian School') $$,
  '42501', null, 'guardian G cannot insert a school'
);
select throws_ok(
  $$ insert into public.categories (school_id, name)
     values ('20000000-0000-4000-8000-0000000000b1', 'Guardian Category') $$,
  '42501', null, 'guardian G cannot insert a category'
);
select throws_ok(
  $$ insert into public.training_groups (school_id, name)
     values ('20000000-0000-4000-8000-0000000000b1', 'Guardian Group') $$,
  '42501', null, 'guardian G cannot insert a training group'
);
select is_empty(
  $$ update public.schools set name = 'Changed'
     where id = '20000000-0000-4000-8000-0000000000b1' returning id $$,
  'guardian G updates no school'
);
select is_empty(
  $$ update public.categories set name = 'Changed'
     where id = '20000000-0000-4000-8000-0000000000c1' returning id $$,
  'guardian G updates no category'
);
select is_empty(
  $$ update public.training_groups set name = 'Changed'
     where id = '20000000-0000-4000-8000-0000000000d1' returning id $$,
  'guardian G updates no training group'
);

-- Adult athlete X: school and category, no group.
set local request.jwt.claims = '{"sub": "20000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select set_eq(
  'select id from public.schools',
  $$ values ('20000000-0000-4000-8000-0000000000b1'::uuid) $$,
  'adult athlete X sees the school of X'
);
select set_eq(
  'select id from public.categories',
  $$ values ('20000000-0000-4000-8000-0000000000c2'::uuid) $$,
  'adult athlete X sees only X''s own category'
);
select is_empty(
  'select 1 from public.training_groups',
  'adult athlete X without a group sees no training groups'
);

-- User with no relations
set local request.jwt.claims = '{"sub": "20000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is_empty(
  $$ select 1 from public.schools
     union all select 1 from public.categories
     union all select 1 from public.training_groups $$,
  'a user with no relations sees no schools, categories or groups'
);

-- Removing the athlete's group link (as the owner) removes the group from G's view.
reset role;
delete from public.athlete_groups
where athlete_id = '20000000-0000-4000-8000-0000000000e1';
set local role authenticated;
set local request.jwt.claims = '{"sub": "20000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is_empty(
  'select 1 from public.training_groups',
  'guardian G sees no group once the athlete leaves it'
);

select * from finish();
rollback;
