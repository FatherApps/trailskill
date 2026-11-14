-- Adult profiles read by school admins (issue #220): the admin of a school
-- reads the name and the contact of the guardians of the school's athletes and
-- of the school's coaches, and nobody else's. A coach, a guardian and a user
-- with no relations still read only their own profile. The contact is the
-- account email, copied by the server: nobody can write a different one.
-- All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email) values
  ('22000000-0000-4000-8000-0000000000a1', 'admin-s@example.test'),
  ('22000000-0000-4000-8000-0000000000a2', 'coach-a@example.test'),
  ('22000000-0000-4000-8000-0000000000a3', 'guardian-g@example.test'),
  ('22000000-0000-4000-8000-0000000000a4', 'admin-t@example.test'),
  ('22000000-0000-4000-8000-0000000000a5', 'coach-b@example.test'),
  ('22000000-0000-4000-8000-0000000000a6', 'guardian-h@example.test'),
  ('22000000-0000-4000-8000-0000000000a7', 'adult-m@example.test'),
  ('22000000-0000-4000-8000-0000000000a8', 'no-relations@example.test');

insert into public.schools (id, name) values
  ('22000000-0000-4000-8000-0000000000b1', 'Profiles School One'),
  ('22000000-0000-4000-8000-0000000000b2', 'Profiles School Two');

insert into public.school_memberships (school_id, user_id, role) values
  ('22000000-0000-4000-8000-0000000000b1', '22000000-0000-4000-8000-0000000000a1', 'school_admin'),
  ('22000000-0000-4000-8000-0000000000b1', '22000000-0000-4000-8000-0000000000a2', 'coach'),
  ('22000000-0000-4000-8000-0000000000b2', '22000000-0000-4000-8000-0000000000a4', 'school_admin'),
  ('22000000-0000-4000-8000-0000000000b2', '22000000-0000-4000-8000-0000000000a5', 'coach');

insert into public.athletes (id, first_name, last_name) values
  ('22000000-0000-4000-8000-0000000000d1', 'Ximena', 'Uno'),
  ('22000000-0000-4000-8000-0000000000d2', 'Yago', 'Dos'),
  ('22000000-0000-4000-8000-0000000000d3', 'Zoe', 'Tres');

insert into public.athlete_schools (athlete_id, school_id) values
  ('22000000-0000-4000-8000-0000000000d1', '22000000-0000-4000-8000-0000000000b1'),
  ('22000000-0000-4000-8000-0000000000d2', '22000000-0000-4000-8000-0000000000b2'),
  ('22000000-0000-4000-8000-0000000000d3', '22000000-0000-4000-8000-0000000000b1');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('22000000-0000-4000-8000-0000000000a3', '22000000-0000-4000-8000-0000000000d1', 'guardian'),
  ('22000000-0000-4000-8000-0000000000a6', '22000000-0000-4000-8000-0000000000d2', 'guardian'),
  ('22000000-0000-4000-8000-0000000000a7', '22000000-0000-4000-8000-0000000000d3', 'self');

-- S sends a forged contact: the server replaces it with the account email.
insert into public.adult_profiles (user_id, first_name, last_name, contact_email) values
  ('22000000-0000-4000-8000-0000000000a1', 'Sara', 'Admin', 'forged@example.test'),
  ('22000000-0000-4000-8000-0000000000a2', 'Andres', 'Coach', null),
  ('22000000-0000-4000-8000-0000000000a3', 'Gina', 'Guardian', null),
  ('22000000-0000-4000-8000-0000000000a4', 'Tomas', 'Admin', null),
  ('22000000-0000-4000-8000-0000000000a5', 'Bruno', 'Coach', null),
  ('22000000-0000-4000-8000-0000000000a6', 'Hilda', 'Guardian', null),
  ('22000000-0000-4000-8000-0000000000a7', 'Mia', 'Adult', null);

-- Schema and contact
select has_column('public', 'adult_profiles', 'contact_email', 'adult_profiles has a contact_email column');
select isnt_empty(
  $$ select 1 from pg_publication_tables where pubname = 'powersync' and tablename = 'adult_profiles' $$,
  'adult_profiles is in the powersync publication'
);
select is(
  (select contact_email from public.adult_profiles where user_id = '22000000-0000-4000-8000-0000000000a1'),
  'admin-s@example.test',
  'the contact of S is the account email, not the value sent'
);
update auth.users set email = 'guardian-g-new@example.test' where id = '22000000-0000-4000-8000-0000000000a3';
select is(
  (select contact_email from public.adult_profiles where user_id = '22000000-0000-4000-8000-0000000000a3'),
  'guardian-g-new@example.test',
  'changing the account email of G updates their contact'
);

-- Guardian G
set local role authenticated;
set local request.jwt.claims = '{"sub": "22000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';

select lives_ok(
  $$ update public.adult_profiles set contact_email = 'forged@example.test'
     where user_id = '22000000-0000-4000-8000-0000000000a3' $$,
  'G writing their own contact runs without error'
);
select is(
  (select contact_email from public.adult_profiles where user_id = '22000000-0000-4000-8000-0000000000a3'),
  'guardian-g-new@example.test',
  'the contact of G stays the account email'
);
select is(
  (select array_agg(user_id) from public.adult_profiles),
  array['22000000-0000-4000-8000-0000000000a3']::uuid[],
  'G reads only their own profile'
);
select is_empty(
  $$ select 1 from public.adult_profiles where user_id = '22000000-0000-4000-8000-0000000000a6' $$,
  'G does not read the contact of H'
);

-- School admin S (school one)
set local request.jwt.claims = '{"sub": "22000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select is(
  (select array_agg(user_id order by user_id) from public.adult_profiles),
  array[
    '22000000-0000-4000-8000-0000000000a1',
    '22000000-0000-4000-8000-0000000000a2',
    '22000000-0000-4000-8000-0000000000a3'
  ]::uuid[],
  'S reads exactly themselves, the coach of school one and the guardian of its athlete'
);
select results_eq(
  $$ select first_name, last_name, contact_email from public.adult_profiles
     where user_id = '22000000-0000-4000-8000-0000000000a3' $$,
  $$ values ('Gina'::text, 'Guardian'::text, 'guardian-g-new@example.test'::text) $$,
  'S reads the name and the contact of G'
);
select is_empty(
  $$ select 1 from public.adult_profiles where user_id = '22000000-0000-4000-8000-0000000000a6' $$,
  'S does not read the guardian of another school'
);
select is_empty(
  $$ select 1 from public.adult_profiles where user_id = '22000000-0000-4000-8000-0000000000a5' $$,
  'S does not read the coach of another school'
);
select lives_ok(
  $$ update public.adult_profiles set first_name = 'Hacked'
     where user_id = '22000000-0000-4000-8000-0000000000a3' $$,
  'S updating the profile of G runs without error'
);
reset role;
select is(
  (select first_name from public.adult_profiles where user_id = '22000000-0000-4000-8000-0000000000a3'),
  'Gina',
  'the profile of G is unchanged by S'
);

-- School admin T (school two)
set local role authenticated;
set local request.jwt.claims = '{"sub": "22000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is(
  (select array_agg(user_id order by user_id) from public.adult_profiles),
  array[
    '22000000-0000-4000-8000-0000000000a4',
    '22000000-0000-4000-8000-0000000000a5',
    '22000000-0000-4000-8000-0000000000a6'
  ]::uuid[],
  'T reads exactly themselves, the coach of school two and the guardian of its athlete'
);

-- Coach A never reads guardians
set local request.jwt.claims = '{"sub": "22000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  (select array_agg(user_id) from public.adult_profiles),
  array['22000000-0000-4000-8000-0000000000a2']::uuid[],
  'coach A reads only their own profile, not the guardians'
);

-- Adult athlete M (relation self) and user N without relations
set local request.jwt.claims = '{"sub": "22000000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select is(
  (select array_agg(user_id) from public.adult_profiles),
  array['22000000-0000-4000-8000-0000000000a7']::uuid[],
  'adult athlete M reads only their own profile'
);
set local request.jwt.claims = '{"sub": "22000000-0000-4000-8000-0000000000a8", "role": "authenticated"}';
select is_empty($$ select 1 from public.adult_profiles $$, 'N with no relations reads no profile');

-- Removing the coach membership removes the access.
reset role;
delete from public.school_memberships
  where school_id = '22000000-0000-4000-8000-0000000000b1' and user_id = '22000000-0000-4000-8000-0000000000a2';
set local role authenticated;
set local request.jwt.claims = '{"sub": "22000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is_empty(
  $$ select 1 from public.adult_profiles where user_id = '22000000-0000-4000-8000-0000000000a2' $$,
  'S no longer reads a coach who left the school'
);

select * from finish();
rollback;
