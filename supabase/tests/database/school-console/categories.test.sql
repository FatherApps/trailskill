-- Organizations, category templates, seeding on school creation and who may
-- edit categories (issue #67). All users and data here are synthetic.
-- There is no birth_date column yet, so the "profile edit keeps the category"
-- check uses the name columns of the athlete.
begin;
create extension if not exists pgtap with schema extensions;
select plan(69);

-- Users: platform admin P, school admin of A, school admin of B, coach of A,
-- guardian G.
insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-0000000000a1', 'platform-p@example.test'),
  ('30000000-0000-4000-8000-0000000000a2', 'admin-a@example.test'),
  ('30000000-0000-4000-8000-0000000000a3', 'admin-b@example.test'),
  ('30000000-0000-4000-8000-0000000000a4', 'coach-a@example.test'),
  ('30000000-0000-4000-8000-0000000000a5', 'guardian-g@example.test'),
  ('30000000-0000-4000-8000-0000000000a6', 'unrelated-n@example.test');

insert into public.platform_admins (user_id) values ('30000000-0000-4000-8000-0000000000a1');

-- Federation c1 (grandparent) > league c2 (parent) > school organization c3.
insert into public.organizations (id, type, country_code, parent_organization_id, name) values
  ('30000000-0000-4000-8000-0000000000c1', 'federation', 'ZZ', null, 'Synthetic Federation'),
  ('30000000-0000-4000-8000-0000000000c2', 'league', 'ZZ', '30000000-0000-4000-8000-0000000000c1', 'Synthetic League'),
  ('30000000-0000-4000-8000-0000000000c3', 'school', 'ZZ', '30000000-0000-4000-8000-0000000000c2', 'Synthetic School Organization');

-- A second school organization, to relink a school to.
insert into public.organizations (id, type, country_code, name)
values ('30000000-0000-4000-8000-0000000000c5', 'school', 'ZZ', 'Other School Organization');

insert into public.category_templates (organization_id, name, sort_order) values
  ('30000000-0000-4000-8000-0000000000c1', 'Grandparent Template', 5),
  ('30000000-0000-4000-8000-0000000000c2', 'Category A', 1),
  ('30000000-0000-4000-8000-0000000000c2', 'Category B', 2);

-- School A is given its organization (parent has templates); school B is
-- created without one.
insert into public.schools (id, name, organization_id)
values ('30000000-0000-4000-8000-0000000000b1', 'Categories School A', '30000000-0000-4000-8000-0000000000c3');
insert into public.schools (id, name)
values ('30000000-0000-4000-8000-0000000000b2', 'Categories School B');

select col_not_null('public', 'schools', 'organization_id', 'schools.organization_id is required');
select is(
  (select count(*) from public.schools where organization_id is null),
  0::bigint,
  'no school is left without an organization'
);
select is(
  (select o.type from public.schools s join public.organizations o on o.id = s.organization_id
   where s.id = '30000000-0000-4000-8000-0000000000b2'),
  'school',
  'a school created without organization_id gets an organization of type school'
);
select is(
  (select o.name from public.schools s join public.organizations o on o.id = s.organization_id
   where s.id = '30000000-0000-4000-8000-0000000000b2'),
  'Categories School B',
  'the new school organization is named after the school'
);
select is(
  (select o.parent_organization_id from public.schools s join public.organizations o on o.id = s.organization_id
   where s.id = '30000000-0000-4000-8000-0000000000b2'),
  null::uuid,
  'the new school organization has no parent'
);
select throws_ok(
  $$ insert into public.schools (name, organization_id)
     values ('Wrong Type School', '30000000-0000-4000-8000-0000000000c2') $$,
  '23514', null,
  'a school cannot point at an organization that is not of type school'
);
select set_eq(
  $$ select name, sort_order, active from public.categories
     where school_id = '30000000-0000-4000-8000-0000000000b1' $$,
  $$ values ('Category A', 1, true), ('Category B', 2, true) $$,
  'school A got the templates of its direct parent and not the grandparent''s'
);
select is(
  (select count(*) from public.categories where school_id = '30000000-0000-4000-8000-0000000000b2'),
  0::bigint,
  'a school whose organization has no parent starts without categories'
);

-- Manual categories: d1 and d3 in school A, d2 in school B.
insert into public.categories (id, school_id, name, sort_order) values
  ('30000000-0000-4000-8000-0000000000d1', '30000000-0000-4000-8000-0000000000b1', 'Unused A', 9),
  ('30000000-0000-4000-8000-0000000000d2', '30000000-0000-4000-8000-0000000000b2', 'Category B1', 1),
  ('30000000-0000-4000-8000-0000000000d3', '30000000-0000-4000-8000-0000000000b1', 'In Use A', 3);

insert into public.school_memberships (school_id, user_id, role) values
  ('30000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000a2', 'school_admin'),
  ('30000000-0000-4000-8000-0000000000b2', '30000000-0000-4000-8000-0000000000a3', 'school_admin'),
  ('30000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000a4', 'coach');

-- e1 is in school A with category d3; e2 is in school A without category.
insert into public.athletes (id, first_name, last_name) values
  ('30000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('30000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2');
insert into public.athlete_schools (athlete_id, school_id, category_id) values
  ('30000000-0000-4000-8000-0000000000e1', '30000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000d3'),
  ('30000000-0000-4000-8000-0000000000e2', '30000000-0000-4000-8000-0000000000b1', null);
insert into public.athlete_managers (user_id, athlete_id, relation)
values ('30000000-0000-4000-8000-0000000000a5', '30000000-0000-4000-8000-0000000000e1', 'guardian');

-- A template of the organization of school A.
insert into public.category_templates (organization_id, name)
values ('30000000-0000-4000-8000-0000000000c3', 'School Organization Template');

set local role authenticated;

-- Who sees which organization: school organizations only to people who can
-- see the school, everything else to everyone.
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';

select is_empty(
  $$ select 1 from public.organizations where id = '30000000-0000-4000-8000-0000000000c3' $$,
  'a user with no relation does not see the organization of school A'
);
select is_empty(
  $$ select 1 from public.organizations o join public.schools s on s.organization_id = o.id $$,
  'a user with no relation sees no school organization'
);
select isnt_empty(
  $$ select 1 from public.organizations where id = '30000000-0000-4000-8000-0000000000c1' $$,
  'a user with no relation sees a federation'
);
select is_empty(
  $$ select 1 from public.category_templates where organization_id = '30000000-0000-4000-8000-0000000000c3' $$,
  'a user with no relation does not see the templates of a school organization'
);
select isnt_empty(
  $$ select 1 from public.category_templates where organization_id = '30000000-0000-4000-8000-0000000000c1' $$,
  'a user with no relation sees the templates of a federation'
);

set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';

select isnt_empty(
  $$ select 1 from public.organizations where id = '30000000-0000-4000-8000-0000000000c3' $$,
  'the guardian sees the organization of the athlete''s school'
);

set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select isnt_empty(
  $$ select 1 from public.organizations where id = '30000000-0000-4000-8000-0000000000c3' $$,
  'a school member sees the organization of the school'
);
select is_empty(
  $$ select 1 from public.organizations
     where id = (select organization_id from public.schools where name = 'Categories School B') $$,
  'a school member does not see the organization of another school'
);

set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select isnt_empty(
  $$ select 1 from public.organizations where id = '30000000-0000-4000-8000-0000000000c3' $$,
  'platform admin P sees the organization of school A'
);
select isnt_empty(
  $$ select 1 from public.organizations where id = '30000000-0000-4000-8000-0000000000c5' $$,
  'platform admin P sees a school organization no school uses'
);

-- Platform admin P
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.organizations (id, type, country_code, name)
     values ('30000000-0000-4000-8000-0000000000c4', 'club', 'ZZ', 'Synthetic Club') $$,
  'platform admin P can create an organization'
);
select isnt_empty(
  $$ update public.organizations set name = 'Synthetic Club Renamed'
     where id = '30000000-0000-4000-8000-0000000000c4' returning id $$,
  'platform admin P can update an organization'
);
select throws_ok(
  $$ insert into public.organizations (type, country_code, name) values ('club', 'zz', 'Bad Country') $$,
  '23514', null,
  'an organization country code must be two uppercase letters'
);
select throws_ok(
  $$ insert into public.organizations (type, name) values ('country', 'Bad Type') $$,
  '23514', null,
  'an organization type must be federation, league, club or school'
);
select lives_ok(
  $$ insert into public.category_templates (id, organization_id, name)
     values ('30000000-0000-4000-8000-0000000000f1', '30000000-0000-4000-8000-0000000000c4', 'Template P') $$,
  'platform admin P can create a category template'
);
select isnt_empty(
  $$ update public.category_templates set name = 'Template P Renamed'
     where id = '30000000-0000-4000-8000-0000000000f1' returning id $$,
  'platform admin P can update a category template'
);
select isnt_empty(
  $$ delete from public.category_templates
     where id = '30000000-0000-4000-8000-0000000000f1' returning id $$,
  'platform admin P can delete a category template'
);
select isnt_empty(
  $$ delete from public.organizations
     where id = '30000000-0000-4000-8000-0000000000c4' returning id $$,
  'platform admin P can delete an organization'
);

-- School admin A
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select isnt_empty(
  $$ select 1 from public.organizations where id = '30000000-0000-4000-8000-0000000000c1' $$,
  'school admin A can read organizations'
);
select isnt_empty(
  $$ select 1 from public.category_templates where name = 'Category A' $$,
  'school admin A can read category templates'
);
select throws_ok(
  $$ insert into public.organizations (type, name) values ('club', 'Admin Club') $$,
  '42501', null,
  'school admin A cannot create an organization'
);
select is_empty(
  $$ update public.organizations set name = 'Hacked'
     where id = '30000000-0000-4000-8000-0000000000c2' returning id $$,
  'school admin A cannot update an organization'
);
select is_empty(
  $$ delete from public.organizations
     where id = '30000000-0000-4000-8000-0000000000c1' returning id $$,
  'school admin A cannot delete an organization'
);
select throws_ok(
  $$ insert into public.category_templates (organization_id, name)
     values ('30000000-0000-4000-8000-0000000000c2', 'Admin Template') $$,
  '42501', null,
  'school admin A cannot create a category template'
);
select is_empty(
  $$ update public.category_templates set name = 'Hacked'
     where name = 'Category A' returning id $$,
  'school admin A cannot update a category template'
);
select is_empty(
  $$ delete from public.category_templates where name = 'Category A' returning id $$,
  'school admin A cannot delete a category template'
);

select isnt_empty(
  $$ select 1 from public.categories where school_id = '30000000-0000-4000-8000-0000000000b1' $$,
  'school admin A sees the categories of school A'
);
select is(
  (select count(*) from public.categories where school_id <> '30000000-0000-4000-8000-0000000000b1'),
  0::bigint,
  'school admin A sees no category of another school'
);
select lives_ok(
  $$ insert into public.categories (id, school_id, name, sort_order)
     values ('30000000-0000-4000-8000-0000000000d4', '30000000-0000-4000-8000-0000000000b1', 'Created By Admin', 10) $$,
  'school admin A can create a category in school A'
);
select isnt_empty(
  $$ update public.categories set name = 'Renamed By Admin'
     where id = '30000000-0000-4000-8000-0000000000d4' returning id $$,
  'school admin A can rename a category of school A'
);
select isnt_empty(
  $$ update public.categories set sort_order = 1
     where id = '30000000-0000-4000-8000-0000000000d1' returning id $$,
  'school admin A can reorder a category of school A'
);
select throws_ok(
  $$ insert into public.categories (school_id, name) values ('30000000-0000-4000-8000-0000000000b2', 'Intruder') $$,
  '42501', null,
  'school admin A cannot create a category in school B'
);
select is_empty(
  $$ update public.categories set name = 'Hacked'
     where id = '30000000-0000-4000-8000-0000000000d2' returning id $$,
  'school admin A cannot update a category of school B'
);
select throws_ok(
  $$ update public.categories set school_id = '30000000-0000-4000-8000-0000000000b2'
     where id = '30000000-0000-4000-8000-0000000000d1' $$,
  '42501', null,
  'school admin A cannot move a category to school B'
);
select is_empty(
  $$ delete from public.categories
     where id = '30000000-0000-4000-8000-0000000000d2' returning id $$,
  'school admin A cannot delete a category of school B'
);

-- The organization of a school is changed by platform admins only
select throws_ok(
  $$ update public.schools set organization_id = '30000000-0000-4000-8000-0000000000c5'
     where id = '30000000-0000-4000-8000-0000000000b1' $$,
  '42501', null,
  'school admin A cannot change the organization of school A'
);
select isnt_empty(
  $$ update public.schools set name = 'Categories School A Renamed'
     where id = '30000000-0000-4000-8000-0000000000b1' returning id $$,
  'school admin A can still rename school A'
);

-- A category in use is deactivated, never deleted
select throws_ok(
  $$ delete from public.categories where id = '30000000-0000-4000-8000-0000000000d3' $$,
  '23503', null,
  'a category in use cannot be deleted'
);
select isnt_empty(
  $$ update public.categories set active = false
     where id = '30000000-0000-4000-8000-0000000000d3' returning id $$,
  'school admin A can deactivate a category in use'
);
select is(
  (select category_id from public.athlete_schools
   where athlete_id = '30000000-0000-4000-8000-0000000000e1'
     and school_id = '30000000-0000-4000-8000-0000000000b1'),
  '30000000-0000-4000-8000-0000000000d3'::uuid,
  'the athlete keeps a deactivated category'
);
select throws_ok(
  $$ update public.athlete_schools set category_id = '30000000-0000-4000-8000-0000000000d3'
     where athlete_id = '30000000-0000-4000-8000-0000000000e2'
       and school_id = '30000000-0000-4000-8000-0000000000b1' $$,
  '23514', null,
  'a deactivated category cannot be newly assigned'
);
select isnt_empty(
  $$ update public.athlete_schools set category_id = '30000000-0000-4000-8000-0000000000d3'
     where athlete_id = '30000000-0000-4000-8000-0000000000e1'
       and school_id = '30000000-0000-4000-8000-0000000000b1' returning id $$,
  'an athlete who already has a category keeps it after it is deactivated'
);
select isnt_empty(
  $$ update public.categories set active = true
     where id = '30000000-0000-4000-8000-0000000000d3' returning id $$,
  'school admin A can reactivate a category'
);
select isnt_empty(
  $$ update public.athlete_schools set category_id = '30000000-0000-4000-8000-0000000000d3'
     where athlete_id = '30000000-0000-4000-8000-0000000000e2'
       and school_id = '30000000-0000-4000-8000-0000000000b1' returning id $$,
  'a reactivated category can be assigned again'
);
select lives_ok(
  $$ update public.athlete_schools set category_id = null
     where athlete_id = '30000000-0000-4000-8000-0000000000e2' $$,
  'school admin A clears the category of the second athlete again'
);
select isnt_empty(
  $$ delete from public.categories
     where id = '30000000-0000-4000-8000-0000000000d4' returning id $$,
  'school admin A can delete a category that is not in use'
);

-- School admin B
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';

select is(
  (select count(*) from public.categories where school_id <> '30000000-0000-4000-8000-0000000000b2'),
  0::bigint,
  'school admin B sees no category of another school'
);
select is_empty(
  $$ update public.categories set name = 'Hacked'
     where school_id = '30000000-0000-4000-8000-0000000000b1' returning id $$,
  'school admin B cannot update the categories of school A'
);
select is_empty(
  $$ update public.athlete_schools set category_id = null
     where athlete_id = '30000000-0000-4000-8000-0000000000e1' returning id $$,
  'school admin B cannot change the category of an athlete of school A'
);

-- Coach of school A
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';

select isnt_empty(
  $$ select 1 from public.categories where school_id = '30000000-0000-4000-8000-0000000000b1' $$,
  'the coach reads the categories of the school'
);
select is_empty(
  $$ update public.categories set name = 'Hacked'
     where id = '30000000-0000-4000-8000-0000000000d1' returning id $$,
  'the coach cannot update a category'
);
select throws_ok(
  $$ insert into public.categories (school_id, name) values ('30000000-0000-4000-8000-0000000000b1', 'Coach Category') $$,
  '42501', null,
  'the coach cannot create a category'
);
select is_empty(
  $$ delete from public.categories
     where id = '30000000-0000-4000-8000-0000000000d1' returning id $$,
  'the coach cannot delete a category'
);
select is_empty(
  $$ update public.athlete_schools set category_id = '30000000-0000-4000-8000-0000000000d1'
     where athlete_id = '30000000-0000-4000-8000-0000000000e2' returning id $$,
  'the coach cannot assign a category to an athlete'
);

-- Guardian G
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';

select is_empty(
  $$ update public.categories set name = 'Hacked'
     where id = '30000000-0000-4000-8000-0000000000d3' returning id $$,
  'the guardian cannot update a category'
);
select is_empty(
  $$ update public.athlete_schools set category_id = '30000000-0000-4000-8000-0000000000d1'
     where athlete_id = '30000000-0000-4000-8000-0000000000e1' returning id $$,
  'the guardian cannot change the category of the athlete'
);

-- Platform admin P edits the profile of e1 (school admins cannot).
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select isnt_empty(
  $$ update public.athletes set first_name = 'Changed', last_name = 'Profile'
     where id = '30000000-0000-4000-8000-0000000000e1' returning id $$,
  'platform admin P can edit the athlete profile'
);

select isnt_empty(
  $$ update public.schools set organization_id = '30000000-0000-4000-8000-0000000000c5'
     where id = '30000000-0000-4000-8000-0000000000b1' returning id $$,
  'platform admin P can relink a school to another school organization'
);
select throws_ok(
  $$ update public.schools set organization_id = '30000000-0000-4000-8000-0000000000c2'
     where id = '30000000-0000-4000-8000-0000000000b1' $$,
  '23514', null,
  'platform admin P cannot relink a school to an organization that is not of type school'
);

reset role;
select is(
  (select category_id from public.athlete_schools
   where athlete_id = '30000000-0000-4000-8000-0000000000e1'
     and school_id = '30000000-0000-4000-8000-0000000000b1'),
  '30000000-0000-4000-8000-0000000000d3'::uuid,
  'editing the athlete profile does not change the category'
);
select is(
  (select category_id from public.athlete_schools
   where athlete_id = '30000000-0000-4000-8000-0000000000e2'),
  null::uuid,
  'the failed and denied attempts left the other athlete without a category'
);

select * from finish();
rollback;
