-- Family timing measurements ("Mis tiempos", issue #967): only the owner reads and writes them, a time is saved only for a
-- swimmer the owner manages (or unassigned), the captured values never change, a deletion is reversible for 30 days and
-- then purged. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-0000000000a1', 'guardian-one@example.test'),
  ('30000000-0000-4000-8000-0000000000a2', 'guardian-two@example.test');

insert into public.athletes (id, first_name, last_name) values
  ('30000000-0000-4000-8000-0000000000e1', 'Athlete', 'F1'),
  ('30000000-0000-4000-8000-0000000000e2', 'Athlete', 'F2');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000e1', 'guardian'),
  ('30000000-0000-4000-8000-0000000000a2', '30000000-0000-4000-8000-0000000000e2', 'guardian');

-- Schema
select has_table('public', 'family_timing_measurements', 'family_timing_measurements exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.family_timing_measurements'::regclass),
  'family_timing_measurements has row level security enabled'
);
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'powersync' and tablename = 'family_timing_measurements'),
  'family_timing_measurements is published to PowerSync'
);

-- Guardian one
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.family_timing_measurements (id, athlete_id, stroke, distance, pool, session_type, captured_at, millis, splits)
     values ('30000000-0000-4000-8000-0000000000f1', '30000000-0000-4000-8000-0000000000e1', 'FR', '50m', 'SCM', 'training',
             now(), 35120, '[16720]') $$,
  'a guardian saves a time of their own swimmer'
);
select lives_ok(
  $$ insert into public.family_timing_measurements (id, stroke, distance, pool, session_type, captured_at, millis)
     values ('30000000-0000-4000-8000-0000000000f2', 'FR', '50m', 'SCM', 'competition', now(), 36000) $$,
  'a guardian saves an unassigned time'
);
select throws_ok(
  $$ insert into public.family_timing_measurements (stroke, distance, pool, session_type, captured_at, millis, athlete_id)
     values ('FR', '50m', 'SCM', 'training', now(), 35000, '30000000-0000-4000-8000-0000000000e2') $$,
  '42501', null, 'a guardian cannot save a time for a swimmer they do not manage'
);
select throws_ok(
  $$ insert into public.family_timing_measurements (owner_user_id, stroke, distance, pool, session_type, captured_at, millis)
     values ('30000000-0000-4000-8000-0000000000a2', 'FR', '50m', 'SCM', 'training', now(), 35000) $$,
  '42501', null, 'a guardian cannot save a time owned by someone else'
);
select throws_ok(
  $$ insert into public.family_timing_measurements (stroke, distance, pool, session_type, captured_at, millis)
     values ('FR', '50m', 'SCM', 'training', now(), 0) $$,
  '23514', null, 'a missing time is null, never 0'
);
select throws_ok(
  $$ update public.family_timing_measurements set official_millis = 34990, official_set_at = now()
     where id = '30000000-0000-4000-8000-0000000000f1' $$,
  '23514', null, 'a training time takes no official time'
);
select lives_ok(
  $$ update public.family_timing_measurements set official_millis = 35990, official_set_at = now(), stroke = 'BK'
     where id = '30000000-0000-4000-8000-0000000000f2' $$,
  'a competition time takes the official time, and the stroke can be corrected'
);
select throws_ok(
  $$ update public.family_timing_measurements set millis = 30000 where id = '30000000-0000-4000-8000-0000000000f1' $$,
  '23514', null, 'the captured time never changes'
);
select lives_ok(
  $$ update public.family_timing_measurements set deleted_at = now() where id = '30000000-0000-4000-8000-0000000000f1' $$,
  'a guardian deletes a time (hidden, not removed)'
);
select lives_ok(
  $$ update public.family_timing_measurements set deleted_at = null where id = '30000000-0000-4000-8000-0000000000f1' $$,
  'a time deleted today can be restored'
);
select throws_ok(
  $$ delete from public.family_timing_measurements where id = '30000000-0000-4000-8000-0000000000f1' $$,
  '42501', null, 'nobody deletes a row directly'
);

-- Guardian two sees and changes nothing of guardian one.
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is_empty($$ select id from public.family_timing_measurements $$, 'another guardian reads none of the times');
select is_empty(
  $$ update public.family_timing_measurements set stroke = 'FL' returning id $$,
  'another guardian changes none of the times'
);

-- The server: a time deleted more than 30 days ago cannot come back and is purged.
reset role;
alter table public.family_timing_measurements disable trigger family_timing_measurements_guard;
update public.family_timing_measurements set deleted_at = now() - interval '31 days' where id = '30000000-0000-4000-8000-0000000000f2';
alter table public.family_timing_measurements enable trigger family_timing_measurements_guard;
select throws_ok(
  $$ update public.family_timing_measurements set deleted_at = null where id = '30000000-0000-4000-8000-0000000000f2' $$,
  '23514', null, 'a time deleted more than 30 days ago cannot be restored'
);
select is(app.purge_family_timing_measurements(), 1, 'the purge removes only the time deleted more than 30 days ago');

select * from finish();
rollback;
