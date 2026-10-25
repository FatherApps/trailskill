-- Resolving measurement conflicts (issue #56, server side). The platform admin
-- chooses one of the two versions or enters the correct time, always with a
-- reason. resolve_measurement_conflict applies the decision, marks the conflict
-- resolved and writes the audit row in one transaction; only the service role
-- (the timing-resolve-conflict Edge function) runs it. Nothing is deleted. All
-- users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

-- Users: coaches C1 and C2 of e1 and e2, platform admin P.
insert into auth.users (id, email) values
  ('56000000-0000-4000-8000-0000000000a1', 'coach-1@example.test'),
  ('56000000-0000-4000-8000-0000000000a2', 'coach-2@example.test'),
  ('56000000-0000-4000-8000-0000000000a6', 'platform-p@example.test');

insert into public.schools (id, name) values ('56000000-0000-4000-8000-0000000000b1', 'Resolution School');

insert into public.school_memberships (school_id, user_id, role) values
  ('56000000-0000-4000-8000-0000000000b1', '56000000-0000-4000-8000-0000000000a1', 'coach'),
  ('56000000-0000-4000-8000-0000000000b1', '56000000-0000-4000-8000-0000000000a2', 'coach');

insert into public.platform_admins (user_id) values ('56000000-0000-4000-8000-0000000000a6');

insert into public.athletes (id, first_name, last_name) values
  ('56000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('56000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2');

insert into public.athlete_schools (athlete_id, school_id) values
  ('56000000-0000-4000-8000-0000000000e1', '56000000-0000-4000-8000-0000000000b1'),
  ('56000000-0000-4000-8000-0000000000e2', '56000000-0000-4000-8000-0000000000b1');

insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values
  ('56000000-0000-4000-8000-0000000000a1', '56000000-0000-4000-8000-0000000000e1'),
  ('56000000-0000-4000-8000-0000000000a2', '56000000-0000-4000-8000-0000000000e1'),
  ('56000000-0000-4000-8000-0000000000a1', '56000000-0000-4000-8000-0000000000e2'),
  ('56000000-0000-4000-8000-0000000000a2', '56000000-0000-4000-8000-0000000000e2');

insert into public.timing_series (id, created_by, stroke, distance, pool, session_type, device_id) values
  ('56000000-0000-4000-8000-0000000000c1', '56000000-0000-4000-8000-0000000000a1', 'FR', '50m', 'SCM', 'training', 'dev-1');

-- d1 to d7: one measurement per case, each at version 1, created by C1 on dev-1.
insert into public.measurements
  (id, kind, athlete_id, series_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
select id, 'repetition', '56000000-0000-4000-8000-0000000000e1', '56000000-0000-4000-8000-0000000000c1', h, 'FR', '50m', 'SCM',
       'training', 'screen_button', 'dev-1', '2026-10-02 08:00:00+00', '56000000-0000-4000-8000-0000000000a1'
from (values
  ('56000000-0000-4000-8000-0000000000d1'::uuid, 3500),
  ('56000000-0000-4000-8000-0000000000d2', 3510),
  ('56000000-0000-4000-8000-0000000000d3', 3520),
  ('56000000-0000-4000-8000-0000000000d4', 3530),
  ('56000000-0000-4000-8000-0000000000d5', 3540),
  ('56000000-0000-4000-8000-0000000000d6', 3550),
  ('56000000-0000-4000-8000-0000000000d7', 3560)
) as v(id, h);

-- The conflicts #55 detection leaves: the stored version (C1, dev-1) and C2's
-- edit from dev-2 that was not applied. k7 and k8 are two open conflicts of d7.
insert into public.measurement_conflicts (
  id, measurement_id, base_version,
  current_values, current_by, current_device, current_at,
  incoming_values, incoming_by, incoming_device
)
select k, d, 0,
       jsonb_build_object('hundredths', h, 'athlete_id', '56000000-0000-4000-8000-0000000000e1', 'version', 1),
       '56000000-0000-4000-8000-0000000000a1', 'dev-1', '2026-10-02 08:00:00+00',
       jsonb_build_object('hundredths', ih, 'athlete_id', ia, 'edit_reason', null),
       '56000000-0000-4000-8000-0000000000a2', 'dev-2'
from (values
  ('56000000-0000-4000-8000-0000000000f1'::uuid, '56000000-0000-4000-8000-0000000000d1'::uuid, 3500, 3400, '56000000-0000-4000-8000-0000000000e1'::uuid),
  ('56000000-0000-4000-8000-0000000000f2', '56000000-0000-4000-8000-0000000000d2', 3510, 3300, '56000000-0000-4000-8000-0000000000e1'),
  ('56000000-0000-4000-8000-0000000000f3', '56000000-0000-4000-8000-0000000000d3', 3520, 3520, '56000000-0000-4000-8000-0000000000e2'),
  ('56000000-0000-4000-8000-0000000000f4', '56000000-0000-4000-8000-0000000000d4', 3530, 3200, '56000000-0000-4000-8000-0000000000e1'),
  ('56000000-0000-4000-8000-0000000000f5', '56000000-0000-4000-8000-0000000000d5', 3540, 3100, '56000000-0000-4000-8000-0000000000e1'),
  ('56000000-0000-4000-8000-0000000000f6', '56000000-0000-4000-8000-0000000000d6', 3550, 3000, '56000000-0000-4000-8000-0000000000e1'),
  ('56000000-0000-4000-8000-0000000000f7', '56000000-0000-4000-8000-0000000000d7', 3560, 2900, '56000000-0000-4000-8000-0000000000e1'),
  ('56000000-0000-4000-8000-0000000000f8', '56000000-0000-4000-8000-0000000000d7', 3560, 2800, '56000000-0000-4000-8000-0000000000e1')
) as v(k, d, h, ih, ia);

-- Schema
select has_table('public', 'measurement_conflict_resolutions', 'measurement_conflict_resolutions exists');
select is_empty(
  $$ select relname from pg_class
     where relnamespace = 'public'::regnamespace and relname = 'measurement_conflict_resolutions' and not relrowsecurity $$,
  'measurement_conflict_resolutions has row level security enabled'
);
select ok(
  has_table_privilege('authenticated', 'public.measurement_conflict_resolutions', 'select')
    and not has_table_privilege('authenticated', 'public.measurement_conflict_resolutions', 'insert')
    and not has_table_privilege('authenticated', 'public.measurement_conflict_resolutions', 'update')
    and not has_table_privilege('authenticated', 'public.measurement_conflict_resolutions', 'delete')
    and not has_table_privilege('anon', 'public.measurement_conflict_resolutions', 'select'),
  'clients can only select measurement_conflict_resolutions'
);
select has_function(
  'public', 'resolve_measurement_conflict', array['uuid', 'uuid', 'text', 'integer', 'text'],
  'resolve_measurement_conflict exists'
);
select ok(
  not has_function_privilege('anon', 'public.resolve_measurement_conflict(uuid, uuid, text, integer, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.resolve_measurement_conflict(uuid, uuid, text, integer, text)', 'execute')
    and has_function_privilege('service_role', 'public.resolve_measurement_conflict(uuid, uuid, text, integer, text)', 'execute'),
  'only the service role can execute resolve_measurement_conflict'
);

-- A signed-in client cannot call it, not even the platform admin: it trusts the
-- resolver id it is given, which only the Edge function takes from a verified JWT.
set local role authenticated;
set local request.jwt.claims = '{"sub": "56000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select throws_ok(
  $$ select public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f1', '56000000-0000-4000-8000-0000000000a6',
       'incoming', null, 'Video review') $$,
  '42501', null,
  'a signed-in client cannot execute resolve_measurement_conflict'
);
reset role;

-- From here on, the Edge function: the service role, no signed-in user.
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

select throws_ok(
  $$ select public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f1', '56000000-0000-4000-8000-0000000000a1',
       'incoming', null, 'Video review') $$,
  '42501', 'only a platform admin resolves a conflict',
  'a coach cannot resolve a conflict'
);
select throws_ok(
  $$ select public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f1', '56000000-0000-4000-8000-0000000000ff',
       'incoming', null, 'Video review') $$,
  '42501', 'only a platform admin resolves a conflict',
  'an unknown user cannot resolve a conflict'
);
select throws_ok(
  $$ select public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f1', null,
       'incoming', null, 'Video review') $$,
  '42501', 'only a platform admin resolves a conflict',
  'a missing user cannot resolve a conflict'
);
select throws_ok(
  $$ select public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f1', '56000000-0000-4000-8000-0000000000a6',
       'incoming', null, '   ') $$,
  '23514', 'a resolution needs a reason',
  'a blank reason is refused'
);
select throws_ok(
  $$ select public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f1', '56000000-0000-4000-8000-0000000000a6',
       'incoming', null, null) $$,
  '23514', 'a resolution needs a reason',
  'a missing reason is refused'
);
select throws_ok(
  $$ select public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f1', '56000000-0000-4000-8000-0000000000a6',
       'newest', null, 'Video review') $$,
  '22023', 'decision must be current, incoming or value',
  'an unknown decision is refused'
);
select throws_ok(
  $$ select public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f1', '56000000-0000-4000-8000-0000000000a6',
       'incoming', 3333, 'Video review') $$,
  '22023', 'only a value decision takes a time',
  'choosing a version takes no time'
);
select throws_ok(
  $$ select public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000fe', '56000000-0000-4000-8000-0000000000a6',
       'incoming', null, 'Video review') $$,
  'P0002', 'conflict not found',
  'an unknown conflict is refused'
);
select is(
  (select status from public.measurement_conflicts where id = '56000000-0000-4000-8000-0000000000f1'),
  'open', 'a refused resolution leaves the conflict open'
);
select is(
  (select hundredths || '|' || version from public.measurements where id = '56000000-0000-4000-8000-0000000000d1'),
  '3500|1', 'a refused resolution leaves the measurement as it was'
);
select is((select count(*)::int from public.measurement_conflict_resolutions), 0, 'a refused resolution writes no audit row');

-- Choosing the edit that was not applied (incoming) applies it.
select isnt(
  public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f1', '56000000-0000-4000-8000-0000000000a6',
    'incoming', null, '  Video review  '),
  null, 'resolving returns the audit row id'
);
select is(
  (select hundredths || '|' || athlete_id || '|' || version || '|' || (edited_by is null) || '|' || (edited_device_id is null)
          || '|' || edit_reason || '|' || (edited_at is not null)
   from public.measurements where id = '56000000-0000-4000-8000-0000000000d1'),
  '3400|56000000-0000-4000-8000-0000000000e1|2|true|true|Video review|true',
  'choosing incoming writes its time as a new version, with the reason and no editor (the admin is in the audit row)'
);
select is(
  (select status from public.measurement_conflicts where id = '56000000-0000-4000-8000-0000000000f1'),
  'resolved', 'the resolved conflict is marked resolved'
);
select is(
  (select (current_values ->> 'hundredths') || '|' || (incoming_values ->> 'hundredths') || '|' || current_by || '|' || incoming_by
   from public.measurement_conflicts where id = '56000000-0000-4000-8000-0000000000f1'),
  '3500|3400|56000000-0000-4000-8000-0000000000a1|56000000-0000-4000-8000-0000000000a2',
  'the resolved conflict keeps both original versions and their authors'
);
select is(
  (select decision || '|' || hundredths || '|' || athlete_id || '|' || reason || '|' || resolved_by || '|' || (resolved_at is not null)
   from public.measurement_conflict_resolutions where conflict_id = '56000000-0000-4000-8000-0000000000f1'),
  'incoming|3400|56000000-0000-4000-8000-0000000000e1|Video review|56000000-0000-4000-8000-0000000000a6|true',
  'the audit row says who, when, the decision, the values applied and the reason'
);
select throws_ok(
  $$ select public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f1', '56000000-0000-4000-8000-0000000000a6',
       'current', null, 'Second thoughts') $$,
  '55000', 'the conflict is already resolved',
  'a resolved conflict cannot be resolved again'
);
select is(
  (select hundredths from public.measurements where id = '56000000-0000-4000-8000-0000000000d1'), 3400,
  'a second resolution changes nothing'
);

-- Choosing the stored version (current) keeps it: no new version.
select isnt(
  public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f2', '56000000-0000-4000-8000-0000000000a6',
    'current', null, 'Stopwatch was right'),
  null, 'choosing current resolves'
);
select is(
  (select hundredths || '|' || version || '|' || (edit_reason is null)
   from public.measurements where id = '56000000-0000-4000-8000-0000000000d2'),
  '3510|1|true', 'choosing the stored version leaves the measurement as it was'
);
select is(
  (select decision || '|' || hundredths || '|' || athlete_id
   from public.measurement_conflict_resolutions where conflict_id = '56000000-0000-4000-8000-0000000000f2'),
  'current|3510|56000000-0000-4000-8000-0000000000e1', 'the audit row records the current decision and its values'
);
select is(
  (select status from public.measurement_conflicts where id = '56000000-0000-4000-8000-0000000000f2'),
  'resolved', 'choosing current marks the conflict resolved'
);

-- A version that moved the record to another athlete moves it.
select isnt(
  public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f3', '56000000-0000-4000-8000-0000000000a6',
    'incoming', null, 'Wrong lane'),
  null, 'choosing an athlete change resolves'
);
select is(
  (select athlete_id || '|' || hundredths || '|' || version from public.measurements where id = '56000000-0000-4000-8000-0000000000d3'),
  '56000000-0000-4000-8000-0000000000e2|3520|2', 'choosing a version applies its athlete'
);

-- Entering the correct time keeps the stored athlete.
select isnt(
  public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f4', '56000000-0000-4000-8000-0000000000a6',
    'value', 3333, 'Checked the video'),
  null, 'entering a time resolves'
);
select is(
  (select hundredths || '|' || athlete_id || '|' || version || '|' || edit_reason
   from public.measurements where id = '56000000-0000-4000-8000-0000000000d4'),
  '3333|56000000-0000-4000-8000-0000000000e1|2|Checked the video', 'the entered time is the new version'
);
select is(
  (select decision || '|' || hundredths || '|' || athlete_id
   from public.measurement_conflict_resolutions where conflict_id = '56000000-0000-4000-8000-0000000000f4'),
  'value|3333|56000000-0000-4000-8000-0000000000e1', 'the audit row records the entered time'
);

-- A missing time is stored as null, never 0.
select isnt(
  public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f5', '56000000-0000-4000-8000-0000000000a6',
    'value', null, 'No valid time'),
  null, 'entering a missing time resolves'
);
select ok(
  (select hundredths is null and version = 2 from public.measurements where id = '56000000-0000-4000-8000-0000000000d5'),
  'a missing time is stored as null'
);
select ok(
  (select decision = 'value' and hundredths is null
   from public.measurement_conflict_resolutions where conflict_id = '56000000-0000-4000-8000-0000000000f5'),
  'the audit row records a missing time as null'
);
select throws_ok(
  $$ select public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f6', '56000000-0000-4000-8000-0000000000a6',
       'value', 0, 'Zero') $$,
  '23514', null,
  'a time of 0 is refused'
);
select is(
  (select status from public.measurement_conflicts where id = '56000000-0000-4000-8000-0000000000f6'),
  'open', 'a refused time leaves the conflict open'
);

-- Resolving one conflict of a measurement leaves its other open conflicts open.
select isnt(
  public.resolve_measurement_conflict('56000000-0000-4000-8000-0000000000f7', '56000000-0000-4000-8000-0000000000a6',
    'incoming', null, 'First edit'),
  null, 'one of two conflicts of a measurement resolves'
);
select is(
  (select status from public.measurement_conflicts where id = '56000000-0000-4000-8000-0000000000f8'),
  'open', 'the other conflict of the same measurement stays open'
);

-- Nothing is deleted.
select is((select count(*)::int from public.measurement_conflicts), 8, 'every conflict row is kept');
select is((select count(*)::int from public.measurement_conflict_resolutions), 6, 'one audit row per resolution');
reset role;

-- Only the platform admin reads the audit; no client writes it.
set local role authenticated;
set local request.jwt.claims = '{"sub": "56000000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select is((select count(*)::int from public.measurement_conflict_resolutions), 6, 'the platform admin reads every audit row');
select throws_ok(
  $$ insert into public.measurement_conflict_resolutions (conflict_id, decision, hundredths, reason, resolved_by)
     values ('56000000-0000-4000-8000-0000000000f6', 'value', 3000, 'Direct write', '56000000-0000-4000-8000-0000000000a6') $$,
  '42501', null,
  'not even the platform admin writes the audit directly'
);
select throws_ok(
  $$ update public.measurement_conflicts set status = 'resolved' where id = '56000000-0000-4000-8000-0000000000f6' $$,
  '42501', null,
  'a client cannot mark a conflict resolved without the function'
);

set local request.jwt.claims = '{"sub": "56000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is((select count(*)::int from public.measurement_conflict_resolutions), 0, 'a coach reads no audit row');
-- The authors' devices learn the outcome by sync: the conflict they read is resolved.
select is(
  (select status from public.measurement_conflicts where id = '56000000-0000-4000-8000-0000000000f1'),
  'resolved', 'the author of the stored version reads the conflict as resolved'
);
set local request.jwt.claims = '{"sub": "56000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  (select status from public.measurement_conflicts where id = '56000000-0000-4000-8000-0000000000f1'),
  'resolved', 'the author of the edit that was not applied reads the conflict as resolved'
);
reset role;

select * from finish();
rollback;
