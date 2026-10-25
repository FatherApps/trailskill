-- Adult profiles (issue #41): the owner reads, creates and edits only their own
-- profile, a platform admin reads every profile but changes none, nobody deletes
-- one from the app, names are never blank or longer than 100 characters, and
-- the table is not synced to devices. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Users: owner A, other user B, platform admin P.
insert into auth.users (id, email) values
  ('41000000-0000-4000-8000-0000000000a1', 'owner-a@example.test'),
  ('41000000-0000-4000-8000-0000000000a2', 'other-b@example.test'),
  ('41000000-0000-4000-8000-0000000000a3', 'platform-p@example.test');

insert into public.platform_admins (user_id) values ('41000000-0000-4000-8000-0000000000a3');

-- Schema
select has_table('public', 'adult_profiles', 'adult_profiles exists');
select is_empty(
  $$ select relname from pg_class
     where relnamespace = 'public'::regnamespace and relname = 'adult_profiles' and not relrowsecurity $$,
  'adult_profiles has row level security enabled'
);
select is_empty(
  $$ select 1 from pg_publication_tables where pubname = 'powersync' and tablename = 'adult_profiles' $$,
  'adult_profiles is not in the powersync publication'
);

set local role anon;
select throws_ok(
  'select 1 from public.adult_profiles',
  '42501', null,
  'anon has no privileges on adult_profiles'
);

set local role authenticated;

-- Owner A
set local request.jwt.claims = '{"sub": "41000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.adult_profiles (user_id, first_name, last_name)
     values ('41000000-0000-4000-8000-0000000000a1', 'Ana', 'Uno') $$,
  'A creates their own profile'
);
select throws_ok(
  $$ insert into public.adult_profiles (user_id, first_name, last_name)
     values ('41000000-0000-4000-8000-0000000000a2', 'Fake', 'Bea') $$,
  '42501', null,
  'A cannot create a profile for B'
);
select lives_ok(
  $$ insert into public.adult_profiles (user_id, first_name, last_name)
     values ('41000000-0000-4000-8000-0000000000a1', 'Ana Maria', 'Uno')
     on conflict (user_id) do update set first_name = excluded.first_name $$,
  'A upserts their own profile'
);
select is(
  (select first_name from public.adult_profiles where user_id = '41000000-0000-4000-8000-0000000000a1'),
  'Ana Maria',
  'the upsert stores the new name'
);

reset role;
insert into public.adult_profiles (user_id, first_name, last_name)
  values ('41000000-0000-4000-8000-0000000000a2', 'Bea', 'Dos');
set local role authenticated;
set local request.jwt.claims = '{"sub": "41000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select is(
  (select array_agg(user_id) from public.adult_profiles),
  array['41000000-0000-4000-8000-0000000000a1']::uuid[],
  'A selects only their own profile'
);
select lives_ok(
  $$ update public.adult_profiles set first_name = 'Hacked'
     where user_id = '41000000-0000-4000-8000-0000000000a2' $$,
  'A updating the profile of B runs without error'
);
select throws_ok(
  $$ update public.adult_profiles set user_id = '41000000-0000-4000-8000-0000000000a2'
     where user_id = '41000000-0000-4000-8000-0000000000a1' $$,
  '42501', null,
  'A cannot move their profile to B'
);
select throws_ok(
  $$ delete from public.adult_profiles where user_id = '41000000-0000-4000-8000-0000000000a1' $$,
  '42501', null,
  'A cannot delete their own profile'
);

reset role;
select is(
  (select first_name from public.adult_profiles where user_id = '41000000-0000-4000-8000-0000000000a2'),
  'Bea',
  'the profile of B is unchanged'
);

-- Platform admin P
set local role authenticated;
set local request.jwt.claims = '{"sub": "41000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';

select is((select count(*) from public.adult_profiles), 2::bigint, 'P reads both profiles');
select lives_ok(
  $$ update public.adult_profiles set first_name = 'Hacked'
     where user_id = '41000000-0000-4000-8000-0000000000a1' $$,
  'P updating the profile of A runs without error'
);

reset role;
select is(
  (select first_name from public.adult_profiles where user_id = '41000000-0000-4000-8000-0000000000a1'),
  'Ana Maria',
  'the profile of A is unchanged by P'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "41000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.adult_profiles (user_id, first_name, last_name)
     values ('41000000-0000-4000-8000-0000000000a1', 'Fake', 'Uno') $$,
  '42501', null,
  'P cannot create a profile for A'
);

-- Names (P has no profile yet)
reset role;
select throws_ok(
  $$ insert into public.adult_profiles (user_id, first_name, last_name)
     values ('41000000-0000-4000-8000-0000000000a3', '', 'Tres') $$,
  '23514', null,
  'an empty first name is rejected'
);
select throws_ok(
  $$ insert into public.adult_profiles (user_id, first_name, last_name)
     values ('41000000-0000-4000-8000-0000000000a3', '   ', 'Tres') $$,
  '23514', null,
  'a whitespace-only first name is rejected'
);
select throws_ok(
  $$ insert into public.adult_profiles (user_id, first_name, last_name)
     values ('41000000-0000-4000-8000-0000000000a3', 'Pia', '   ') $$,
  '23514', null,
  'a whitespace-only last name is rejected'
);
select throws_ok(
  format($$ insert into public.adult_profiles (user_id, first_name, last_name)
            values ('41000000-0000-4000-8000-0000000000a3', 'Pia', %L) $$, repeat('x', 101)),
  '23514', null,
  'a 101-character last name is rejected'
);

-- Deleting the account removes the profile.
delete from auth.users where id = '41000000-0000-4000-8000-0000000000a2';
select is_empty(
  $$ select 1 from public.adult_profiles where user_id = '41000000-0000-4000-8000-0000000000a2' $$,
  'deleting the auth user deletes the profile'
);

select * from finish();
rollback;
