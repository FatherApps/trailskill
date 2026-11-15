-- A guardian sends a time to another swimmer's family with the swimmer's share code (issue #973). All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

-- a1 measures; a2 manages swimmer b2 (the receiving family); a3 is someone else; a4 and a5 try codes until they are stopped.
insert into auth.users (id, email) values
  ('97300000-0000-4000-8000-0000000000a1', 'sender@example.test'),
  ('97300000-0000-4000-8000-0000000000a2', 'receiver@example.test'),
  ('97300000-0000-4000-8000-0000000000a3', 'other@example.test'),
  ('97300000-0000-4000-8000-0000000000a4', 'guesser@example.test'),
  ('97300000-0000-4000-8000-0000000000a5', 'mixed-guesser@example.test');
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
   '97300000-0000-4000-8000-0000000000b1', 'FL', '50m', 'SCM', 'training', '2026-11-14T10:00:00Z', 36000),
  ('97300000-0000-4000-8000-0000000000c4', '97300000-0000-4000-8000-0000000000a4', '97300000-0000-4000-8000-0000000000a4', null,
   'BR', '50m', 'SCM', 'training', '2026-11-14T10:00:00Z', 40000),
  ('97300000-0000-4000-8000-0000000000c5', '97300000-0000-4000-8000-0000000000a5', '97300000-0000-4000-8000-0000000000a5', null,
   'BR', '50m', 'SCM', 'training', '2026-11-14T10:00:00Z', 41000),
  ('97300000-0000-4000-8000-0000000000c6', '97300000-0000-4000-8000-0000000000a1', '97300000-0000-4000-8000-0000000000a1', null,
   'FR', '50m', 'SCM', 'training', '2026-11-14T10:00:00Z', 33000);

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
select is(public.send_family_time('97300000-0000-4000-8000-0000000000c1', 'TS-ZZZZZZ'), null,
  'an unknown code sends nothing and returns no name');
select throws_ok($$ select public.send_family_time('97300000-0000-4000-8000-0000000000c1', 'TS-AAAAAA') $$, 'P0001', 'own_athlete',
  'a time for one of your own swimmers is assigned, not sent');
select is(public.send_family_time('97300000-0000-4000-8000-0000000000c3', 'ts bbbbbb'), 'Ana M.', 'sending returns the short name');
select is((select athlete_id from public.family_timing_measurements where id = '97300000-0000-4000-8000-0000000000c3'), null,
  'the sent time leaves the sender''s swimmer while it waits');
select throws_ok($$ select public.send_family_time('97300000-0000-4000-8000-0000000000c3', 'TS-BBBBBB') $$, 'P0001', 'already_sent',
  'a time waits for one answer at a time');
select lives_ok($$ update public.family_timing_measurements set deleted_at = now() where id = '97300000-0000-4000-8000-0000000000c6' $$,
  'the owner deletes a time');
select throws_ok($$ select public.send_family_time('97300000-0000-4000-8000-0000000000c6', 'TS-BBBBBB') $$, 'P0001', 'deleted_time',
  'a deleted time cannot be sent');
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
select is((select count(*)::int from public.family_timing_transfers where id = (select id from sent)), 1,
  'the receiving family still reads the accepted request');
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is((select count(*)::int from public.family_timing_measurements where id = '97300000-0000-4000-8000-0000000000c3'), 0,
  'the sender no longer has it: nobody sees it twice');
select is((select count(*)::int from public.family_timing_transfers where id = (select id from sent)), 0,
  'the sender no longer reads the accepted request either (issue #1014)');
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
select is((select status from public.family_timing_transfers where measurement_id = '97300000-0000-4000-8000-0000000000c1'), 'rejected',
  'the sender still reads a rejected request');
select lives_ok($$ update public.family_timing_measurements set athlete_id = '97300000-0000-4000-8000-0000000000b1'
  where id = '97300000-0000-4000-8000-0000000000c1' $$, 'and can be given to the sender''s swimmer again');

-- Withdrawing, and expiry after 30 days.
select public.send_family_time('97300000-0000-4000-8000-0000000000c2', 'TS-BBBBBB');
select lives_ok(format('select public.withdraw_family_time(%L)',
  (select id from public.family_timing_transfers where measurement_id = '97300000-0000-4000-8000-0000000000c2')), 'the sender withdraws');
select is((select status from public.family_timing_transfers where measurement_id = '97300000-0000-4000-8000-0000000000c2'), 'withdrawn',
  'the sender still reads a withdrawn request');
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
set local role authenticated;
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is((select count(*)::int from public.family_timing_transfers), 0, 'anyone else reads no request, whatever its status');
reset role;

-- Every failed code counts, even through send_family_time (issue #1013): 5 in 15 minutes stop the sixth try.
set local role authenticated;
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is(public.send_family_time('97300000-0000-4000-8000-0000000000c4', 'TS-ZZZZZ1'), null, 'failed send 1 returns null');
select is(public.send_family_time('97300000-0000-4000-8000-0000000000c4', 'TS-ZZZZZ2'), null, 'failed send 2 returns null');
select is(public.send_family_time('97300000-0000-4000-8000-0000000000c4', 'TS-ZZZZZ3'), null, 'failed send 3 returns null');
select is(public.send_family_time('97300000-0000-4000-8000-0000000000c4', 'TS-ZZZZZ4'), null, 'failed send 4 returns null');
select is(public.send_family_time('97300000-0000-4000-8000-0000000000c4', 'TS-ZZZZZ5'), null, 'failed send 5 returns null');
select throws_ok($$ select public.send_family_time('97300000-0000-4000-8000-0000000000c4', 'TS-BBBBBB') $$, 'P0001', 'too_many_attempts',
  'after 5 failed sends even a real code is stopped');
select throws_ok($$ select public.send_family_time('97300000-0000-4000-8000-0000000000c4', 'TS-ZZZZZ6') $$, 'P0001', 'too_many_attempts',
  'and so is another unknown code');

-- Lookups and sends share the limit: 3 failed lookups and 2 failed sends stop the sixth try.
set local request.jwt.claims = '{"sub": "97300000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(public.find_athlete_by_share_code('TS-YYYYY1'), null, 'failed lookup 1');
select is(public.find_athlete_by_share_code('TS-YYYYY2'), null, 'failed lookup 2');
select is(public.find_athlete_by_share_code('TS-YYYYY3'), null, 'failed lookup 3');
select is(public.send_family_time('97300000-0000-4000-8000-0000000000c5', 'TS-YYYYY4'), null, 'failed send after lookups 1');
select is(public.send_family_time('97300000-0000-4000-8000-0000000000c5', 'TS-YYYYY5'), null, 'failed send after lookups 2');
select throws_ok($$ select public.send_family_time('97300000-0000-4000-8000-0000000000c5', 'TS-BBBBBB') $$, 'P0001', 'too_many_attempts',
  'failed lookups and sends count together');
reset role;
select is((select count(*)::int from public.athlete_share_code_lookups
  where user_id = '97300000-0000-4000-8000-0000000000a4' and not matched), 5, 'the 5 failed sends are recorded');

select * from finish();
rollback;
