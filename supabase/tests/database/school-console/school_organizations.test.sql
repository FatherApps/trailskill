-- The organization of a school: an upsert that does not insert leaves no
-- orphan organization, the service role and migrations can relink a school,
-- and renaming a school renames its organization (issue #242). All users and
-- data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('31000000-0000-4000-8000-0000000000a1', 'platform-p@example.test'),
  ('31000000-0000-4000-8000-0000000000a2', 'admin-a@example.test');

insert into public.platform_admins (user_id) values ('31000000-0000-4000-8000-0000000000a1');

-- Spare school organizations c1 and c3, and a league c2 (not of type school).
insert into public.organizations (id, type, country_code, name) values
  ('31000000-0000-4000-8000-0000000000c1', 'school', 'ZZ', 'Spare School Organization 1'),
  ('31000000-0000-4000-8000-0000000000c2', 'league', 'ZZ', 'Synthetic League'),
  ('31000000-0000-4000-8000-0000000000c3', 'school', 'ZZ', 'Spare School Organization 3');

-- School A is created without an organization.
insert into public.schools (id, name)
values ('31000000-0000-4000-8000-0000000000b1', 'Organization School A');
insert into public.school_memberships (school_id, user_id, role)
values ('31000000-0000-4000-8000-0000000000b1', '31000000-0000-4000-8000-0000000000a2', 'school_admin');

create temp table org_count as select count(*) as n from public.organizations;

-- Upserts.
insert into public.schools (id, name)
values ('31000000-0000-4000-8000-0000000000b1', 'Organization School A')
on conflict (id) do nothing;
select is(
  (select count(*) from public.organizations),
  (select n from org_count),
  'an upsert that does nothing leaves no orphan organization'
);

insert into public.schools (id, name)
values ('31000000-0000-4000-8000-0000000000b1', 'Renamed By Upsert')
on conflict (id) do update set name = excluded.name;
select is(
  (select count(*) from public.organizations),
  (select n from org_count),
  'an upsert that updates leaves no orphan organization'
);
select is(
  (select o.name from public.schools s join public.organizations o on o.id = s.organization_id
   where s.id = '31000000-0000-4000-8000-0000000000b1'),
  'Renamed By Upsert',
  'an upsert that renames a school renames its organization'
);

insert into public.schools (id, name)
values ('31000000-0000-4000-8000-0000000000b2', 'Organization School B')
on conflict (id) do update set name = excluded.name;
select is(
  (select count(*) from public.organizations),
  (select n + 1 from org_count),
  'an upsert that inserts creates exactly one organization'
);
select is(
  (select o.type from public.schools s join public.organizations o on o.id = s.organization_id
   where s.id = '31000000-0000-4000-8000-0000000000b2'),
  'school',
  'the organization of an inserted school has type school'
);
select is(
  (select o.name from public.schools s join public.organizations o on o.id = s.organization_id
   where s.id = '31000000-0000-4000-8000-0000000000b2'),
  'Organization School B',
  'the organization of an inserted school is named after it'
);

-- The deferred foreign key holds: every school has its organization.
select lives_ok('set constraints all immediate', 'every school points at an existing organization');
set constraints all deferred;

-- A school admin cannot relink, but renames the school and its organization.
set local role authenticated;
set local request.jwt.claims = '{"sub": "31000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select throws_ok(
  $$ update public.schools set organization_id = '31000000-0000-4000-8000-0000000000c1'
     where id = '31000000-0000-4000-8000-0000000000b1' $$,
  '42501', null,
  'a school admin cannot change the organization of a school'
);
select isnt_empty(
  $$ update public.schools set name = 'Renamed By Admin'
     where id = '31000000-0000-4000-8000-0000000000b1' returning id $$,
  'a school admin can rename the school'
);

reset role;
select is(
  (select o.name from public.schools s join public.organizations o on o.id = s.organization_id
   where s.id = '31000000-0000-4000-8000-0000000000b1'),
  'Renamed By Admin',
  'renaming a school renames its organization'
);
select is(
  (select o.name from public.schools s join public.organizations o on o.id = s.organization_id
   where s.id = '31000000-0000-4000-8000-0000000000b2'),
  'Organization School B',
  'renaming a school leaves the other organizations alone'
);

-- The service role may relink, to a school organization only.
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

select lives_ok(
  $$ update public.schools set organization_id = '31000000-0000-4000-8000-0000000000c1'
     where id = '31000000-0000-4000-8000-0000000000b1' $$,
  'the service role can change the organization of a school'
);
select throws_ok(
  $$ update public.schools set organization_id = '31000000-0000-4000-8000-0000000000c2'
     where id = '31000000-0000-4000-8000-0000000000b1' $$,
  '23514', null,
  'the service role cannot point a school at an organization that is not of type school'
);
select lives_ok(
  $$ update public.schools set name = 'Renamed By Service'
     where id = '31000000-0000-4000-8000-0000000000b1' $$,
  'the service role can rename a school'
);

reset role;
select is(
  (select name from public.organizations where id = '31000000-0000-4000-8000-0000000000c1'),
  'Renamed By Service',
  'the organization a school was relinked to follows its name'
);

-- The owner (migrations) has no signed-in user and may relink too.
set local request.jwt.claims = '';

select lives_ok(
  $$ update public.schools set organization_id = '31000000-0000-4000-8000-0000000000c3'
     where id = '31000000-0000-4000-8000-0000000000b2' $$,
  'the owner can change the organization of a school'
);
select throws_ok(
  $$ update public.schools set organization_id = '31000000-0000-4000-8000-0000000000c2'
     where id = '31000000-0000-4000-8000-0000000000b2' $$,
  '23514', null,
  'the owner cannot point a school at an organization that is not of type school'
);
select is(
  (select organization_id from public.schools where id = '31000000-0000-4000-8000-0000000000b2'),
  '31000000-0000-4000-8000-0000000000c3'::uuid,
  'the school points at the organization it was relinked to'
);

-- Clearing the organization of an existing school creates a new one.
select lives_ok(
  $$ update public.schools set organization_id = null
     where id = '31000000-0000-4000-8000-0000000000b2' $$,
  'the owner can clear the organization of a school'
);
select is(
  (select o.type from public.schools s join public.organizations o on o.id = s.organization_id
   where s.id = '31000000-0000-4000-8000-0000000000b2'),
  'school',
  'a school whose organization was cleared gets a new organization of type school'
);
select is(
  (select o.name = s.name from public.schools s join public.organizations o on o.id = s.organization_id
   where s.id = '31000000-0000-4000-8000-0000000000b2'),
  true,
  'the new organization is named after the school'
);

select lives_ok('set constraints all immediate', 'every school still points at an existing organization');

select * from finish();
rollback;
