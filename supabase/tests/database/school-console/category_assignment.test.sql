-- An athlete's category must belong to the athlete's school (issue #67).
-- Uses only tables that exist before the categories feature. Synthetic data.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('31000000-0000-4000-8000-0000000000a1', 'admin-a@example.test'),
  ('31000000-0000-4000-8000-0000000000a2', 'guardian-g@example.test');

insert into public.schools (id, name) values
  ('31000000-0000-4000-8000-0000000000b1', 'Assignment School A'),
  ('31000000-0000-4000-8000-0000000000b2', 'Assignment School B');

insert into public.categories (id, school_id, name) values
  ('31000000-0000-4000-8000-0000000000d1', '31000000-0000-4000-8000-0000000000b1', 'Category A1'),
  ('31000000-0000-4000-8000-0000000000d2', '31000000-0000-4000-8000-0000000000b2', 'Category B1');

insert into public.school_memberships (school_id, user_id, role)
values ('31000000-0000-4000-8000-0000000000b1', '31000000-0000-4000-8000-0000000000a1', 'school_admin');

insert into public.athletes (id, first_name, last_name)
values ('31000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1');
insert into public.athlete_schools (athlete_id, school_id)
values ('31000000-0000-4000-8000-0000000000e1', '31000000-0000-4000-8000-0000000000b1');
insert into public.athlete_managers (user_id, athlete_id, relation)
values ('31000000-0000-4000-8000-0000000000a2', '31000000-0000-4000-8000-0000000000e1', 'guardian');

set local role authenticated;

-- School admin of school A
set local request.jwt.claims = '{"sub": "31000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select isnt_empty(
  $$ update public.athlete_schools set category_id = '31000000-0000-4000-8000-0000000000d1'
     where athlete_id = '31000000-0000-4000-8000-0000000000e1' returning id $$,
  'school admin A can assign a category of school A to an athlete of school A'
);
select throws_ok(
  $$ update public.athlete_schools set category_id = '31000000-0000-4000-8000-0000000000d2'
     where athlete_id = '31000000-0000-4000-8000-0000000000e1' $$,
  '23503', null,
  'school admin A cannot assign a category of school B to an athlete of school A'
);
select isnt_empty(
  $$ update public.athlete_schools set category_id = null
     where athlete_id = '31000000-0000-4000-8000-0000000000e1' returning id $$,
  'school admin A can clear the category of an athlete'
);

-- Guardian
set local request.jwt.claims = '{"sub": "31000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select is_empty(
  $$ update public.athlete_schools set category_id = '31000000-0000-4000-8000-0000000000d1'
     where athlete_id = '31000000-0000-4000-8000-0000000000e1' returning id $$,
  'the guardian cannot assign a category'
);

select * from finish();
rollback;
