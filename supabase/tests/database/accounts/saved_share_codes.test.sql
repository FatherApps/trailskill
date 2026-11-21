-- A guardian keeps the share code of another family once that family accepted a time sent with it (issue #1302). All data
-- is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- s1 sends; r1 manages swimmer b1 (the receiving family); o1 is someone else.
insert into auth.users (id, email) values
  ('99100000-0000-4000-8000-0000000000a1', 'sender@example.test'),
  ('99100000-0000-4000-8000-0000000000a2', 'receiver@example.test'),
  ('99100000-0000-4000-8000-0000000000a3', 'other@example.test');
insert into public.athletes (id, first_name, last_name) values ('99100000-0000-4000-8000-0000000000b1', 'Ana Sofía', 'Mora');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('99100000-0000-4000-8000-0000000000a2', '99100000-0000-4000-8000-0000000000b1', 'guardian');
insert into public.athlete_share_codes (athlete_id, code, created_at) values ('99100000-0000-4000-8000-0000000000b1', 'TS-BBBBBB', now() - interval '1 day');
insert into public.family_timing_measurements (id, owner_user_id, captured_by, athlete_id, stroke, distance, pool, session_type, captured_at, millis)
select ('99100000-0000-4000-8000-0000000000c' || n)::uuid, '99100000-0000-4000-8000-0000000000a1', '99100000-0000-4000-8000-0000000000a1', null,
  'FR', '50m', 'SCM', 'training', '2026-11-20T10:00:00Z', 30000 + n
from generate_series(1, 5) n;

select ok(not has_table_privilege('authenticated', 'public.saved_athlete_share_codes', 'insert'), 'nobody keeps a code directly');
select ok(not has_table_privilege('authenticated', 'public.saved_athlete_share_codes', 'update'), 'nobody changes a kept code directly');
select ok(not has_table_privilege('authenticated', 'public.saved_athlete_share_codes', 'delete'), 'nobody deletes a kept code directly');
select ok(not has_table_privilege('anon', 'public.saved_athlete_share_codes', 'select'), 'anon reads no kept codes');
select ok(not has_function_privilege('authenticated', 'app.save_athlete_share_code(uuid, uuid, timestamptz)', 'execute'),
  'the app cannot keep a code by itself');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;

-- A rejected first send keeps nothing.
set local role authenticated;
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a1');
select public.send_family_time('99100000-0000-4000-8000-0000000000c1', 'TS-BBBBBB');
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a2');
select public.reject_family_time((select id from public.family_timing_transfers where measurement_id = '99100000-0000-4000-8000-0000000000c1'));
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a1');
select is((select count(*)::int from public.saved_athlete_share_codes), 0, 'a rejected send keeps no code');

-- An accepted send keeps the code for the sender, with the short name only.
select public.send_family_time('99100000-0000-4000-8000-0000000000c2', 'TS-BBBBBB');
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a2');
select public.accept_family_time((select id from public.family_timing_transfers where measurement_id = '99100000-0000-4000-8000-0000000000c2'));
select is((select count(*)::int from public.saved_athlete_share_codes), 0, 'the receiving family reads no one''s kept codes');
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a1');
select results_eq($$ select code, athlete_short_name from public.saved_athlete_share_codes $$,
  $$ values ('TS-BBBBBB', 'Ana M.') $$, 'the sender keeps the code and the short name');

-- A later reject leaves a kept code; another accepted send keeps one row.
select public.send_family_time('99100000-0000-4000-8000-0000000000c3', 'TS-BBBBBB');
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a2');
select public.reject_family_time((select id from public.family_timing_transfers where measurement_id = '99100000-0000-4000-8000-0000000000c3'));
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a1');
select is((select count(*)::int from public.saved_athlete_share_codes), 1, 'a later rejected send leaves the kept code');
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a3');
select is((select count(*)::int from public.saved_athlete_share_codes), 0, 'anyone else reads no kept codes');
select lives_ok($$ select public.forget_saved_athlete_share_code((select id from public.saved_athlete_share_codes limit 1)) $$,
  'forgetting a code that is not yours runs');
reset role;
select is((select count(*)::int from public.saved_athlete_share_codes), 1, 'and removes nothing');

-- The family changes the code: the row stays, marked as expired, with the old code (issue #1320).
set local role authenticated;
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a2');
select isnt(public.rotate_athlete_share_code('99100000-0000-4000-8000-0000000000b1'), 'TS-BBBBBB', 'the family changes the code');
reset role;
select is((select count(*)::int from public.saved_athlete_share_codes), 1, 'a changed code is not deleted for who kept it');
select results_eq($$ select code, expired_at is not null from public.saved_athlete_share_codes $$,
  $$ values ('TS-BBBBBB', true) $$, 'it keeps the old code and is marked as expired');
-- The select policy is the same: the owner reads the expired row, nobody else does, and nobody else can remove it.
set local role authenticated;
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a1');
select results_eq($$ select code, expired_at is not null from public.saved_athlete_share_codes $$,
  $$ values ('TS-BBBBBB', true) $$, 'the owner reads their expired code');
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a3');
select is((select count(*)::int from public.saved_athlete_share_codes), 0, 'anyone else reads no expired codes');
select lives_ok($$ select public.forget_saved_athlete_share_code((select id from public.saved_athlete_share_codes limit 1)) $$,
  'forgetting an expired code that is not yours runs');
reset role;
select is((select count(*)::int from public.saved_athlete_share_codes), 1, 'and removes nothing');

-- A send made with the code of then, accepted after the family changed it, keeps nothing: the sender never had the new code.
update public.athlete_share_codes set code = 'TS-DDDDDD', created_at = now() - interval '1 hour'
where athlete_id = '99100000-0000-4000-8000-0000000000b1';
set local role authenticated;
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a1');
select public.send_family_time('99100000-0000-4000-8000-0000000000c4', 'TS-DDDDDD');
reset role;
update public.athlete_share_codes set code = 'TS-CCCCCC', created_at = now() + interval '1 second'
where athlete_id = '99100000-0000-4000-8000-0000000000b1';
set local role authenticated;
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a2');
select lives_ok(format('select public.accept_family_time(%L)',
  (select id from public.family_timing_transfers where measurement_id = '99100000-0000-4000-8000-0000000000c4')),
  'the family accepts a time sent before the change');
reset role;
select results_eq($$ select code, expired_at is not null from public.saved_athlete_share_codes $$,
  $$ values ('TS-BBBBBB', true) $$, 'the new code is not kept for a sender who never had it: the row stays expired');

-- Later (the code is an hour old now).
update public.athlete_share_codes set created_at = now() - interval '1 hour' where athlete_id = '99100000-0000-4000-8000-0000000000b1';
-- Accepted with the current code it is kept again; the owner can remove it ("Quitar").
set local role authenticated;
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a1');
select public.send_family_time('99100000-0000-4000-8000-0000000000c5', 'TS-CCCCCC');
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a2');
select public.accept_family_time((select id from public.family_timing_transfers where measurement_id = '99100000-0000-4000-8000-0000000000c5'));
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a1');
select results_eq($$ select code, expired_at is null from public.saved_athlete_share_codes $$,
  $$ values ('TS-CCCCCC', true) $$, 'the new code is kept after an accepted send and the expired mark is gone');
select lives_ok($$ select public.forget_saved_athlete_share_code((select id from public.saved_athlete_share_codes limit 1)) $$,
  'the owner removes a kept code');
select is((select count(*)::int from public.saved_athlete_share_codes), 0, 'and it is gone');

-- The owner removes an expired code too ("Quitar").
reset role;
insert into public.saved_athlete_share_codes (user_id, athlete_id, code, athlete_short_name, expired_at)
values ('99100000-0000-4000-8000-0000000000a1', '99100000-0000-4000-8000-0000000000b1', 'TS-CCCCCC', 'Ana M.', now());
set local role authenticated;
select pg_temp.as_user('99100000-0000-4000-8000-0000000000a1');
select lives_ok($$ select public.forget_saved_athlete_share_code((select id from public.saved_athlete_share_codes limit 1)) $$,
  'the owner removes an expired code');
select is((select count(*)::int from public.saved_athlete_share_codes), 0, 'and it is gone too');

-- A removed code takes the kept codes along, expired or not.
reset role;
insert into public.saved_athlete_share_codes (user_id, athlete_id, code, athlete_short_name, expired_at)
values ('99100000-0000-4000-8000-0000000000a1', '99100000-0000-4000-8000-0000000000b1', 'TS-CCCCCC', 'Ana M.', now());
delete from public.athlete_share_codes where athlete_id = '99100000-0000-4000-8000-0000000000b1';
select is((select count(*)::int from public.saved_athlete_share_codes), 0, 'a removed code is kept by nobody');

-- So does a removed swimmer (the cascade of athlete_id).
insert into public.athlete_share_codes (athlete_id, code, created_at) values ('99100000-0000-4000-8000-0000000000b1', 'TS-EEEEEE', now() - interval '1 day');
insert into public.saved_athlete_share_codes (user_id, athlete_id, code, athlete_short_name, expired_at)
values ('99100000-0000-4000-8000-0000000000a1', '99100000-0000-4000-8000-0000000000b1', 'TS-CCCCCC', 'Ana M.', now());
delete from public.athlete_managers where athlete_id = '99100000-0000-4000-8000-0000000000b1';
delete from public.athletes where id = '99100000-0000-4000-8000-0000000000b1';
select is((select count(*)::int from public.saved_athlete_share_codes), 0, 'a removed swimmer is kept by nobody');

select * from finish();
rollback;
