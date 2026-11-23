-- The meters of each mark of a free-laps time (issue #1430): same length as the splits, immutable once saved, copied when the
-- time is sent, and null on the times saved before free laps. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('14300000-0000-4000-8000-0000000000a1', 'sender-meters@example.test'),
  ('14300000-0000-4000-8000-0000000000a2', 'receiver-meters@example.test');
insert into public.athletes (id, first_name, last_name) values
  ('14300000-0000-4000-8000-0000000000b1', 'Lía', 'Prueba'),
  ('14300000-0000-4000-8000-0000000000b2', 'Ana Sofía', 'Mora');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('14300000-0000-4000-8000-0000000000a1', '14300000-0000-4000-8000-0000000000b1', 'guardian'),
  ('14300000-0000-4000-8000-0000000000a2', '14300000-0000-4000-8000-0000000000b2', 'guardian');
insert into public.athlete_share_codes (athlete_id, code) values ('14300000-0000-4000-8000-0000000000b2', 'TS-MMMMMM');

select has_column('public', 'family_timing_measurements', 'split_meters', 'a measurement has split_meters');
select has_column('public', 'family_timing_transfers', 'split_meters', 'a transfer has split_meters');

set local role authenticated;
set local request.jwt.claims = '{"sub": "14300000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.family_timing_measurements (id, stroke, distance, pool, session_type, captured_at, millis, splits, split_meters)
     values ('14300000-0000-4000-8000-0000000000c1', 'FR', '100m', 'SCM', 'training', now(), 70000, '[17000,35000,52000]', '[25,50,null]') $$,
  'a time with one meters entry per split (numbers or null) is saved'
);
select lives_ok(
  $$ insert into public.family_timing_measurements (id, stroke, distance, pool, session_type, captured_at, millis, splits)
     values ('14300000-0000-4000-8000-0000000000c2', 'FR', '50m', 'SCM', 'training', now(), 35000, '[17000]') $$,
  'a time without split_meters (as before free laps) is saved'
);
select is((select split_meters from public.family_timing_measurements where id = '14300000-0000-4000-8000-0000000000c2'), null,
  'an old time reads null: its meters come from the lap length');
select lives_ok(
  $$ insert into public.family_timing_measurements (stroke, distance, pool, session_type, captured_at, millis, splits, split_meters)
     values ('FR', '50m', 'SCM', 'training', now(), 35000, '[]', '[]') $$,
  'no splits and no meters have the same length');
select throws_ok(
  $$ insert into public.family_timing_measurements (stroke, distance, pool, session_type, captured_at, millis, splits, split_meters)
     values ('FR', '100m', 'SCM', 'training', now(), 70000, '[17000,35000]', '[25]') $$,
  '23514', null, 'meters of another length than the splits are refused'
);
select throws_ok(
  $$ insert into public.family_timing_measurements (stroke, distance, pool, session_type, captured_at, millis, splits, split_meters)
     values ('FR', '100m', 'SCM', 'training', now(), 70000, '[17000]', '["25"]') $$,
  '23514', null, 'a meters entry that is neither a number nor null is refused'
);
select throws_ok(
  $$ insert into public.family_timing_measurements (stroke, distance, pool, session_type, captured_at, millis, splits, split_meters)
     values ('FR', '100m', 'SCM', 'training', now(), 70000, '[17000]', '[[25]]') $$,
  '23514', null, 'a nested array as a meters entry is refused'
);
select throws_ok(
  $$ insert into public.family_timing_measurements (stroke, distance, pool, session_type, captured_at, millis, splits, split_meters)
     values ('FR', '100m', 'SCM', 'training', now(), 70000, '[17000]', '{"a":1}') $$,
  '23514', null, 'meters that are not an array are refused'
);
select throws_ok(
  $$ update public.family_timing_measurements set split_meters = '[30,50,null]' where id = '14300000-0000-4000-8000-0000000000c1' $$,
  '23514', 'a family time keeps its captured values', 'the meters of a saved time never change'
);
select throws_ok(
  $$ update public.family_timing_measurements set split_meters = '[25]' where id = '14300000-0000-4000-8000-0000000000c2' $$,
  '23514', 'a family time keeps its captured values', 'an old time cannot get meters after saving either'
);

select public.send_family_time('14300000-0000-4000-8000-0000000000c1', 'TS-MMMMMM');
select is((select split_meters from public.family_timing_transfers where measurement_id = '14300000-0000-4000-8000-0000000000c1'),
  '[25,50,null]', 'sending a time copies its split_meters');
select public.send_family_time('14300000-0000-4000-8000-0000000000c2', 'TS-MMMMMM');
select is((select split_meters from public.family_timing_transfers where measurement_id = '14300000-0000-4000-8000-0000000000c2'), null,
  'sending an old time copies null');

select * from finish();
rollback;
