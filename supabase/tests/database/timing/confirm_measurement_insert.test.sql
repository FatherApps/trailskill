-- Confirming a re-sent measurement insert (issue #206): when a measurement ends
-- hidden (#54), its author cannot read it back, so the sync connector asks
-- public.confirm_measurement_insert whether the row it sent is already stored.
-- The answer is only a verdict ('stored', 'changed' or 'absent'), never row
-- data, and anyone but the author gets 'absent'. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Users: coach C (the author), guardian G, and X, a coach of another school.
insert into auth.users (id, email) values
  ('59000000-0000-4000-8000-0000000000a1', 'coach-c@example.test'),
  ('59000000-0000-4000-8000-0000000000a3', 'guardian-g@example.test'),
  ('59000000-0000-4000-8000-0000000000a5', 'coach-x@example.test');

insert into public.schools (id, name) values
  ('59000000-0000-4000-8000-0000000000b1', 'Confirm School One'),
  ('59000000-0000-4000-8000-0000000000b2', 'Confirm School Two');

insert into public.school_memberships (school_id, user_id, role) values
  ('59000000-0000-4000-8000-0000000000b1', '59000000-0000-4000-8000-0000000000a1', 'coach'),
  ('59000000-0000-4000-8000-0000000000b2', '59000000-0000-4000-8000-0000000000a5', 'coach');

insert into public.athletes (id, first_name, last_name) values
  ('59000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1');

insert into public.athlete_schools (athlete_id, school_id) values
  ('59000000-0000-4000-8000-0000000000e1', '59000000-0000-4000-8000-0000000000b1');

insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values
  ('59000000-0000-4000-8000-0000000000a1', '59000000-0000-4000-8000-0000000000e1');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('59000000-0000-4000-8000-0000000000a3', '59000000-0000-4000-8000-0000000000e1', 'guardian');

insert into public.authorization_texts (id, purpose, version, language, body) values
  ('59000000-0000-4000-8000-0000000000f1', 'record_times', 1, 'en-US', 'Synthetic record times text v1');

select ok(
  not has_function_privilege('anon', 'public.confirm_measurement_insert(jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.confirm_measurement_insert(jsonb)', 'execute'),
  'only signed-in users can call confirm_measurement_insert'
);

-- What the device sends for d1, the first time and on every re-send.
select set_config('test.sent', '{
  "id": "59000000-0000-4000-8000-0000000000d1", "kind": "repetition",
  "athlete_id": "59000000-0000-4000-8000-0000000000e1", "hundredths": 3150,
  "stroke": "FR", "distance": "50m", "pool": "SCM", "session_type": "training",
  "source": "screen_button", "device_id": "device-c", "captured_at": "2026-10-06T08:00:00.000Z"
}', true);

set local role authenticated;

-- Guardian G accepts, then withdraws: what coach C captures after it ends hidden.
-- The insert policy requires withdrawn_at to be null, so the withdrawal is an update (as in hide_after_withdrawal.test.sql).
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
  values ('59000000-0000-4000-8000-000000000101', '59000000-0000-4000-8000-0000000000e1',
          'record_times', '59000000-0000-4000-8000-0000000000f1', '2026-10-01 08:00:00+00');
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-05 09:00:00+00'
     where id = '59000000-0000-4000-8000-000000000101' $$,
  'guardian G withdraws record_times for e1'
);

set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select is(
  public.confirm_measurement_insert(current_setting('test.sent')::jsonb),
  'absent',
  'before the first upload the measurement is absent'
);

-- The upload as the connector sends it (ON CONFLICT DO NOTHING ... RETURNING id), first and re-sent.
create function pg_temp.upload() returns bigint language sql as $$
  with stored as (
    insert into public.measurements
      (id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
    values
      ('59000000-0000-4000-8000-0000000000d1', 'repetition', '59000000-0000-4000-8000-0000000000e1', 3150,
       'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c', '2026-10-06 08:00:00+00')
    on conflict (id) do nothing
    returning id)
  select count(*) from stored
$$;

select is(pg_temp.upload(), 1::bigint, 'the first upload stores the measurement');
-- Measured on the database: ON CONFLICT DO NOTHING ... RETURNING checks the new row against the select policy, and the hide trigger
-- does not unlock an id that already exists, so a hidden re-send is refused (42501) instead of returning no row.
select throws_ok(
  $$ select pg_temp.upload() $$,
  '42501',
  null,
  'the re-send of the hidden row is refused by row-level security, not answered with no row'
);
select is(
  (select count(*) from public.measurements where id = '59000000-0000-4000-8000-0000000000d1'),
  0::bigint,
  'the author cannot read the hidden measurement'
);

select is(
  public.confirm_measurement_insert(current_setting('test.sent')::jsonb),
  'stored',
  'the re-send of the same values is confirmed as stored'
);
select is(
  public.confirm_measurement_insert(current_setting('test.sent')::jsonb || '{"created_at": "2020-01-01T00:00:00Z", "hidden": false}'),
  'stored',
  'server-set columns (created_at, hidden) are not compared'
);
-- A re-sent whole row carries the edit-version columns of issue #55 (a retried PUT requeues the current row): the server owns them.
select is(
  public.confirm_measurement_insert(current_setting('test.sent')::jsonb
    || '{"version": null, "base_version": null, "edited_by": null, "edited_at": null, "edited_device_id": null, "edit_reason": null}'),
  'stored',
  'edit-version columns sent as null are not compared'
);
select is(
  public.confirm_measurement_insert(current_setting('test.sent')::jsonb
    || '{"version": 2, "base_version": 2, "edited_by": "59000000-0000-4000-8000-0000000000a1", "edited_at": "2026-10-07T08:00:00Z", "edited_device_id": "device-c", "edit_reason": "typo"}'),
  'stored',
  'edit-version columns with values are not compared either'
);
select is(
  public.confirm_measurement_insert(current_setting('test.sent')::jsonb || '{"captured_at": "2026-10-06T03:00:00-05:00"}'),
  'stored',
  'values are compared in their column types (the same instant in another offset)'
);
select is(
  public.confirm_measurement_insert(current_setting('test.sent')::jsonb || '{"hundredths": 3151}'),
  'changed',
  'the same id with another value is changed'
);
select is(
  public.confirm_measurement_insert('{"id": "59000000-0000-4000-8000-0000000000d9", "kind": "repetition"}'),
  'absent',
  'an id that is not stored is absent'
);
select throws_ok(
  $$ select public.confirm_measurement_insert('{"id": "59000000-0000-4000-8000-0000000000d1", "hundredths": "fast"}') $$,
  '22P02',
  null,
  'a value of the wrong type is a permanent error'
);
select is(
  (select count(*) from public.measurements where id = '59000000-0000-4000-8000-0000000000d1'),
  0::bigint,
  'after confirming, the author still cannot read the hidden measurement'
);

-- Anyone but the author learns nothing, not even that the row exists.
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(
  public.confirm_measurement_insert(current_setting('test.sent')::jsonb),
  'absent',
  'another coach gets absent for a stored measurement'
);
set local request.jwt.claims = '{"sub": "59000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(
  public.confirm_measurement_insert(current_setting('test.sent')::jsonb),
  'absent',
  'the guardian, who can read the row, still gets absent: only the author confirms'
);

reset role;
select is(
  (select hidden from public.measurements where id = '59000000-0000-4000-8000-0000000000d1'),
  true,
  'the measurement is stored hidden'
);

select * from finish();
rollback;
