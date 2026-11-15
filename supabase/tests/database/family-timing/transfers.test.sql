-- A guardian sends a time to another swimmer's family with the swimmer's share code (issue #973). All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- a1 measures; a2 manages swimmer b2 (the receiving family); a3 is someone else.
insert into auth.users (id, email) values
  ('97300000-0000-4000-8000-0000000000a1', 'sender@example.test'),
  ('97300000-0000-4000-8000-0000000000a2', 'receiver@example.test'),
  ('97300000-0000-4000-8000-0000000000a3', 'other@example.test');
insert into public.athletes (id, first_name, last_name) values
  ('97300000-0000-4000-8000-0000000000b1', 'Lía', 'Prueba'),
  ('97300000-0000-4000-8000-0000000000b2', 'Ana Sofía', 'Mora');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('97300000-0000-4000-8000-0000000000a1', '97300000-0000-4000-8000-0000000000b1', 'guardian'),
  ('97300000-0000-4000-8000-0000000000a2', '97300000-0000-4000-8000-0000000000b2', 'guardian');
insert into public.athlete_share_codes (athlete_id, code) values
  ('97300000-0000-4000-8000-0000000000b1', 'TS-AAAAAA'),
  ('97300000-0000-4000-8000-0000000000b2', 'TS-BBBBBB');
insert into public.family_timing_measurements (id, owner_user_id, captured_by, athlete_id, stroke, distance, pool, session_type, captured_at, millis)
values
  ('97300000-0000-4000-8000-0000000000c1', '97300000-0000-4000-8000-0000000000a1', '97300000-0000-4000-8000-0000000000a1', null,
   'FR', '50m', 'SCM', 'training', '2026-11-14T10:00:00Z', 32000),
  ('97300000-0000-4000-8000-0000000000c2', '97300000-0000-4000-8000-0000000000a1', '97300000-0000-4000-8000-0000000000a1', null,
   'BK', '50m', 'SCM', 'training', '2026-11-14T10:00:00Z', 34000),
  ('97300000-0000-4000-8000-0000000000c3', '97300000-0000-4000-8000-0000000000a1', '97300000-0000-4000-8000-0000000000a1',
   '97300000-0000-4000-8000-0000000000b1', 'FL', '50m', 'SCM', 'training', '2026-11-14T10:00:00Z', 36000);

select ok(not has_table_privilege('authenticated', 'public.family_timing_transfers', 'insert'), 'nobody inserts a request directly');
select ok(not has_table_privilege('authenticated', 'public.family_timing_transfers', 'update'), 'nobody changes a request directly');
select ok(not has_table_privilege('anon', 'public.family_timing_transfers', 'select'), 'anon reads no requests');
select ok(not has_function_privilege('anon', 'public.send_family_time(uuid, text)', 'execute'), 'anon cannot send a time');

-- Sending.
set local role authenticated;
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select throws_ok($$ select public.send_family_time('97300000-0000-4000-8000-0000000000c1', 'TS-BBBBBB') $$, '42501', null,
  'only the owner can send a time');
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok($$ select public.send_family_time('97300000-0000-4000-8000-0000000000c1', 'TS-ZZZZZZ') $$, 'P0001', 'unknown_code',
  'an unknown code sends nothing');
select throws_ok($$ select public.send_family_time('97300000-0000-4000-8000-0000000000c1', 'TS-AAAAAA') $$, 'P0001', 'own_athlete',
  'a time for one of your own swimmers is assigned, not sent');
select is(public.send_family_time('97300000-0000-4000-8000-0000000000c3', 'ts bbbbbb'), 'Ana M.', 'sending returns the short name');
select is((select athlete_id from public.family_timing_measurements where id = '97300000-0000-4000-8000-0000000000c3'), null,
  'the sent time leaves the sender''s swimmer while it waits');
select throws_ok($$ select public.send_family_time('97300000-0000-4000-8000-0000000000c3', 'TS-BBBBBB') $$, 'P0001', 'already_sent',
  'a time waits for one answer at a time');
select throws_ok($$ update public.family_timing_measurements set athlete_id = '97300000-0000-4000-8000-0000000000b1'
  where id = '97300000-0000-4000-8000-0000000000c3' $$, '23514', null, 'a waiting time cannot be given to a swimmer');
select throws_ok($$ update public.family_timing_measurements set deleted_at = now() where id = '97300000-0000-4000-8000-0000000000c3' $$,
  '23514', null, 'a waiting time cannot be deleted');
select is((select count(*)::int from public.family_timing_transfers), 1, 'the sender reads their request');

-- The receiving family sees the request, and the time as it was sent; not the sender's times.
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is((select millis from public.family_timing_transfers), 36000, 'the receiving family reads the time in the request');
select is((select count(*)::int from public.family_timing_measurements), 0, 'the receiving family reads none of the sender''s times');
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is((select count(*)::int from public.family_timing_transfers), 0, 'anyone else reads no request');
select throws_ok(format('select public.accept_family_time(%L)', (select id from public.family_timing_transfers limit 1)), '42501', null,
  'only the swimmer''s family can accept');
reset role;
create temp table sent as select id from public.family_timing_transfers where measurement_id = '97300000-0000-4000-8000-0000000000c3';
grant select on sent to authenticated;

-- Accepting moves the time in one step: it is the receiving family's, for their swimmer, and leaves the sender.
set local role authenticated;
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(format('select public.accept_family_time(%L)', (select id from sent)), 'the swimmer''s family accepts');
select is((select athlete_id from public.family_timing_measurements where id = '97300000-0000-4000-8000-0000000000c3'),
  '97300000-0000-4000-8000-0000000000b2'::uuid, 'the time is now for their swimmer');
select is((select millis from public.family_timing_measurements where id = '97300000-0000-4000-8000-0000000000c3'), 36000,
  'the captured time is the same');
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is((select count(*)::int from public.family_timing_measurements where id = '97300000-0000-4000-8000-0000000000c3'), 0,
  'the sender no longer has it: nobody sees it twice');
select throws_ok(format('select public.withdraw_family_time(%L)', (select id from sent)), 'P0001', 'request_closed',
  'an answered request cannot be withdrawn');
reset role;
select throws_ok($$ update public.family_timing_measurements set owner_user_id = '97300000-0000-4000-8000-0000000000a2'
  where id = '97300000-0000-4000-8000-0000000000c1' $$, '23514', null, 'nobody changes the owner by hand, even past the policies');
set local role authenticated;
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

-- Rejecting keeps it the sender's, under "Sin asignar"; it can be given to their swimmer again.
select public.send_family_time('97300000-0000-4000-8000-0000000000c1', 'TS-BBBBBB');
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select lives_ok(format('select public.reject_family_time(%L)',
  (select id from public.family_timing_transfers where measurement_id = '97300000-0000-4000-8000-0000000000c1')), 'the family rejects');
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is((select owner_user_id from public.family_timing_measurements where id = '97300000-0000-4000-8000-0000000000c1'),
  '97300000-0000-4000-8000-0000000000a1'::uuid, 'a rejected time stays the sender''s');
select lives_ok($$ update public.family_timing_measurements set athlete_id = '97300000-0000-4000-8000-0000000000b1'
  where id = '97300000-0000-4000-8000-0000000000c1' $$, 'and can be given to the sender''s swimmer again');

-- Withdrawing, and expiry after 30 days.
select public.send_family_time('97300000-0000-4000-8000-0000000000c2', 'TS-BBBBBB');
select lives_ok(format('select public.withdraw_family_time(%L)',
  (select id from public.family_timing_transfers where measurement_id = '97300000-0000-4000-8000-0000000000c2')), 'the sender withdraws');
select public.send_family_time('97300000-0000-4000-8000-0000000000c2', 'TS-BBBBBB');
reset role;
update public.family_timing_transfers set expires_at = now() - interval '1 second'
where measurement_id = '97300000-0000-4000-8000-0000000000c2' and status = 'pending';
set local role authenticated;
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok(format('select public.accept_family_time(%L)',
  (select id from public.family_timing_transfers where measurement_id = '97300000-0000-4000-8000-0000000000c2' and status = 'pending')),
  'P0001', 'request_closed', 'a request older than 30 days cannot be accepted');
reset role;
select is(app.expire_family_timing_transfers(), 1, 'the daily job closes the request nobody answered');
select is((select owner_user_id from public.family_timing_measurements where id = '97300000-0000-4000-8000-0000000000c2'),
  '97300000-0000-4000-8000-0000000000a1'::uuid, 'an expired time stays the sender''s');

select * from finish();
rollback;
