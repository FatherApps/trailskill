-- A short code per swimmer, to share times with them (issue #972). All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('97200000-0000-4000-8000-0000000000a1', 'guardian-a@example.test'),
  ('97200000-0000-4000-8000-0000000000a2', 'guardian-b@example.test'),
  ('97200000-0000-4000-8000-0000000000a3', 'guessing@example.test');

insert into public.athletes (id, first_name, last_name) values
  ('97200000-0000-4000-8000-0000000000b1', 'Ana Sofía', 'Mora Prueba'),
  ('97200000-0000-4000-8000-0000000000b2', 'Bruno', 'Lara');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('97200000-0000-4000-8000-0000000000a1', '97200000-0000-4000-8000-0000000000b1', 'guardian'),
  ('97200000-0000-4000-8000-0000000000a2', '97200000-0000-4000-8000-0000000000b2', 'guardian');

-- Nobody reads or writes the tables directly.
select ok(not has_table_privilege('authenticated', 'public.athlete_share_codes', 'select'), 'authenticated cannot read the codes');
select ok(not has_table_privilege('authenticated', 'public.athlete_share_codes', 'insert'), 'authenticated cannot write a code');
select ok(not has_table_privilege('authenticated', 'public.athlete_share_code_lookups', 'select'), 'authenticated cannot read the lookups');
select ok(not has_function_privilege('anon', 'public.find_athlete_by_share_code(text)', 'execute'), 'anon cannot look a code up');
select ok(not has_function_privilege('anon', 'public.athlete_share_code(uuid)', 'execute'), 'anon cannot ask for a code');

-- The guardian gets the swimmer's code, the same one every time.
set local role authenticated;
set local request.jwt.claims = '{"sub": "97200000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
create temp table codes (n int primary key, first text);
insert into codes values (1, public.athlete_share_code('97200000-0000-4000-8000-0000000000b1'));
select matches((select first from codes where n = 1), '^TS-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$', 'the code is TS- and 6 characters that do not read alike');
select is(public.athlete_share_code('97200000-0000-4000-8000-0000000000b1'), (select first from codes where n = 1), 'asking again gives the same code');
select throws_ok($$ select public.athlete_share_code('97200000-0000-4000-8000-0000000000b2') $$, '42501', null,
  'a guardian cannot get the code of a swimmer they do not manage');
select throws_ok($$ select public.rotate_athlete_share_code('97200000-0000-4000-8000-0000000000b2') $$, '42501', null,
  'a guardian cannot change the code of a swimmer they do not manage');

-- Another guardian finds the swimmer by the code, in any spelling, and gets only the short name.
set local request.jwt.claims = '{"sub": "97200000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(public.find_athlete_by_share_code((select first from codes where n = 1)), 'Ana M.', 'the code gives the short name only');
select is(public.find_athlete_by_share_code(lower(replace((select first from codes where n = 1), 'TS-', ''))), 'Ana M.',
  'the code works in lower case and without TS-');
select is(public.find_athlete_by_share_code(' ' || replace((select first from codes where n = 1), '-', ' ') || ' '), 'Ana M.', 'spaces do not matter');
select is(public.find_athlete_by_share_code('TS-ZZZZZZ'), null, 'an unknown code gives nothing');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
   where p.proname = 'find_athlete_by_share_code' and p.prorettype = 'text'::regtype),
  array['find_athlete_by_share_code'], 'the lookup returns one text: no other data of the swimmer');

-- Changing the code: the old one stops working at once.
set local request.jwt.claims = '{"sub": "97200000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
insert into codes values (2, public.rotate_athlete_share_code('97200000-0000-4000-8000-0000000000b1'));
select isnt((select first from codes where n = 2), (select first from codes where n = 1), 'the new code is another one');
select is(public.athlete_share_code('97200000-0000-4000-8000-0000000000b1'), (select first from codes where n = 2),
  'the profile shows the new code');
set local request.jwt.claims = '{"sub": "97200000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(public.find_athlete_by_share_code((select first from codes where n = 1)), null, 'the old code no longer finds the swimmer');
select is(public.find_athlete_by_share_code((select first from codes where n = 2)), 'Ana M.', 'the new code finds the swimmer');

-- After 5 failed lookups in 15 minutes the caller is blocked, even with a right code; others are not.
set local request.jwt.claims = '{"sub": "97200000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select public.find_athlete_by_share_code('TS-AAAAA' || n) from generate_series(2, 6) n;
select throws_ok(format('select public.find_athlete_by_share_code(%L)', (select first from codes where n = 2)), 'P0001', 'too_many_attempts',
  'the sixth lookup after 5 failures is refused, even with a right code');
set local request.jwt.claims = '{"sub": "97200000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(public.find_athlete_by_share_code((select first from codes where n = 2)), 'Ana M.', 'another user is not blocked');
reset role;
update public.athlete_share_code_lookups set looked_up_at = now() - interval '16 minutes'
where user_id = '97200000-0000-4000-8000-0000000000a3';
set local role authenticated;
set local request.jwt.claims = '{"sub": "97200000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(public.find_athlete_by_share_code((select first from codes where n = 2)), 'Ana M.', 'after 15 minutes the lookup works again');

-- A signed-out caller gets nothing.
set local request.jwt.claims = '{"role": "authenticated"}';
select throws_ok($$ select public.find_athlete_by_share_code('TS-ZZZZZZ') $$, '42501', null, 'a lookup needs a signed-in user');

select * from finish();
rollback;
