-- Measurements captured after an authorization withdrawal reached the server
-- (issue #54): they stay on the server, keep their author and device, and are
-- hidden from everyone except the guardian (or adult athlete) and the platform
-- admin. "After" is judged by either clock: the device capture time against the
-- device withdrawal time, or the server reception time against the server
-- withdrawal reception time. Measurements from before the withdrawal do not
-- change. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

-- Users: coach C, school admin S, guardian G, platform admin P, and X, a coach
-- of another school who has nothing to do with these athletes.
insert into auth.users (id, email) values
  ('58000000-0000-4000-8000-0000000000a1', 'coach-c@example.test'),
  ('58000000-0000-4000-8000-0000000000a2', 'admin-s@example.test'),
  ('58000000-0000-4000-8000-0000000000a3', 'guardian-g@example.test'),
  ('58000000-0000-4000-8000-0000000000a4', 'platform-p@example.test'),
  ('58000000-0000-4000-8000-0000000000a5', 'coach-x@example.test');

insert into public.schools (id, name) values
  ('58000000-0000-4000-8000-0000000000b1', 'Withdrawal School One'),
  ('58000000-0000-4000-8000-0000000000b2', 'Withdrawal School Two');

insert into public.school_memberships (school_id, user_id, role) values
  ('58000000-0000-4000-8000-0000000000b1', '58000000-0000-4000-8000-0000000000a1', 'coach'),
  ('58000000-0000-4000-8000-0000000000b1', '58000000-0000-4000-8000-0000000000a2', 'school_admin'),
  ('58000000-0000-4000-8000-0000000000b2', '58000000-0000-4000-8000-0000000000a5', 'coach');

insert into public.platform_admins (user_id) values ('58000000-0000-4000-8000-0000000000a4');

-- e1: withdrawn and re-granted. e2: never withdrawn. e3: withdrawn after its
-- measurements were already stored. e9: the athlete of coach X.
insert into public.athletes (id, first_name, last_name) values
  ('58000000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('58000000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('58000000-0000-4000-8000-0000000000e3', 'Athlete', 'E3'),
  ('58000000-0000-4000-8000-0000000000e9', 'Athlete', 'E9');

insert into public.athlete_schools (athlete_id, school_id) values
  ('58000000-0000-4000-8000-0000000000e1', '58000000-0000-4000-8000-0000000000b1'),
  ('58000000-0000-4000-8000-0000000000e2', '58000000-0000-4000-8000-0000000000b1'),
  ('58000000-0000-4000-8000-0000000000e3', '58000000-0000-4000-8000-0000000000b1'),
  ('58000000-0000-4000-8000-0000000000e9', '58000000-0000-4000-8000-0000000000b2');

insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values
  ('58000000-0000-4000-8000-0000000000a1', '58000000-0000-4000-8000-0000000000e1'),
  ('58000000-0000-4000-8000-0000000000a1', '58000000-0000-4000-8000-0000000000e2'),
  ('58000000-0000-4000-8000-0000000000a1', '58000000-0000-4000-8000-0000000000e3'),
  ('58000000-0000-4000-8000-0000000000a5', '58000000-0000-4000-8000-0000000000e9');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('58000000-0000-4000-8000-0000000000a3', '58000000-0000-4000-8000-0000000000e1', 'guardian'),
  ('58000000-0000-4000-8000-0000000000a3', '58000000-0000-4000-8000-0000000000e2', 'guardian'),
  ('58000000-0000-4000-8000-0000000000a3', '58000000-0000-4000-8000-0000000000e3', 'guardian');

insert into public.authorization_texts (id, purpose, version, language, body) values
  ('58000000-0000-4000-8000-0000000000f1', 'record_times', 1, 'en-US', 'Synthetic record times text v1');

-- Schema
select has_column('public', 'measurements', 'hidden', 'measurements has the hidden column');
select col_not_null('public', 'measurements', 'hidden', 'hidden is not null');
select col_default_is('public', 'measurements', 'hidden', 'false', 'hidden defaults to false');
select ok(
  not has_function_privilege('authenticated', 'app.recorded_after_withdrawal(uuid, timestamptz, timestamptz)', 'execute')
    and not has_function_privilege('anon', 'app.authorization_in_force_at(uuid, text, timestamptz, timestamptz)', 'execute'),
  'clients cannot execute the withdrawal functions'
);

set local role authenticated;

-- Guardian G accepts for e1 and e3 (device time, before everything below).
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
     values ('58000000-0000-4000-8000-000000000101', '58000000-0000-4000-8000-0000000000e1',
             'record_times', '58000000-0000-4000-8000-0000000000f1', '2026-10-01 08:00:00+00'),
            ('58000000-0000-4000-8000-000000000103', '58000000-0000-4000-8000-0000000000e3',
             'record_times', '58000000-0000-4000-8000-0000000000f1', '2026-10-01 08:00:00+00') $$,
  'guardian G accepts record_times for e1 and e3'
);

-- Coach C records before any withdrawal.
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.timing_series (id, stroke, distance, pool, session_type, device_id)
     values ('58000000-0000-4000-8000-0000000000c1', 'FR', '50m', 'SCM', 'training', 'device-c') $$,
  'coach C creates a series'
);

-- The server sets created_at, so the order of the statements is the order of
-- reception. d1, d6, da: made and received before the withdrawal. d7: captured
-- after the withdrawal time on the device, but stored before the withdrawal
-- arrives. d8: e2, which never withdrew. d9: an unassigned arrival.
select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, series_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('58000000-0000-4000-8000-0000000000d1', 'repetition', '58000000-0000-4000-8000-0000000000e1',
        '58000000-0000-4000-8000-0000000000c1', 3150, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c',
        '2026-10-02 08:00:00+00'),
       ('58000000-0000-4000-8000-0000000000d6', 'repetition', '58000000-0000-4000-8000-0000000000e3',
        '58000000-0000-4000-8000-0000000000c1', 3160, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c',
        '2026-10-02 08:00:00+00'),
       ('58000000-0000-4000-8000-0000000000d7', 'repetition', '58000000-0000-4000-8000-0000000000e3',
        '58000000-0000-4000-8000-0000000000c1', 3170, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c',
        '2026-10-06 08:00:00+00'),
       ('58000000-0000-4000-8000-0000000000d8', 'repetition', '58000000-0000-4000-8000-0000000000e2',
        '58000000-0000-4000-8000-0000000000c1', 3180, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c',
        '2026-10-06 08:00:00+00'),
       ('58000000-0000-4000-8000-0000000000da', 'repetition', '58000000-0000-4000-8000-0000000000e1',
        '58000000-0000-4000-8000-0000000000c1', 3215, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c',
        '2026-10-03 08:00:00+00') $$,
  'coach C records before any withdrawal'
);
select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, series_id, stroke, distance, pool, session_type, source, device_id, captured_at, hundredths)
     values
       ('58000000-0000-4000-8000-0000000000d9', 'repetition', null,
        '58000000-0000-4000-8000-0000000000c1', 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c',
        '2026-10-06 08:30:00+00', 3190) $$,
  'coach C records an unassigned arrival'
);

select is(
  (select count(*) from public.measurements where athlete_id = '58000000-0000-4000-8000-0000000000e3'),
  2::bigint,
  'coach C sees both measurements of e3 before the withdrawal'
);
select is(
  (select hidden from public.measurements where id = '58000000-0000-4000-8000-0000000000d7'),
  false,
  'a measurement captured when no withdrawal exists is not hidden'
);

-- Retroactive hiding needs to leave untouched rows alone: remember the version
-- of r1 (xmin changes when a row is rewritten).
reset role;
select set_config('test.r1_xmin',
  (select xmin::text from public.measurements where id = '58000000-0000-4000-8000-0000000000d6'), true);
set local role authenticated;

-- Guardian G withdraws for e1 and e3. The device time is 2026-10-05; the
-- server time is the moment of this statement.
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';

select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-05 09:00:00+00'
     where id in ('58000000-0000-4000-8000-000000000101', '58000000-0000-4000-8000-000000000103') $$,
  'guardian G withdraws for e1 and e3'
);

-- Coach C keeps recording e1 after the withdrawal.
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

-- d2: captured and received after the withdrawal. d3: captured before it on the
-- device but received after it, so only the server clock says after.
-- d4: claims hidden = false. d7 (above) is the device clock alone, retroactively.
select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, series_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('58000000-0000-4000-8000-0000000000d2', 'repetition', '58000000-0000-4000-8000-0000000000e1',
        '58000000-0000-4000-8000-0000000000c1', 3200, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c',
        '2026-10-06 08:00:00+00'),
       ('58000000-0000-4000-8000-0000000000d3', 'repetition', '58000000-0000-4000-8000-0000000000e1',
        '58000000-0000-4000-8000-0000000000c1', 3210, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c',
        '2026-10-04 08:00:00+00') $$,
  'coach C sends measurements of e1 after the withdrawal arrived'
);
select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, series_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, hidden)
     values
       ('58000000-0000-4000-8000-0000000000d4', 'repetition', '58000000-0000-4000-8000-0000000000e1',
        '58000000-0000-4000-8000-0000000000c1', 3220, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c',
        '2026-10-07 08:00:00+00', false) $$,
  'coach C inserts a measurement after the withdrawal that claims hidden = false'
);

-- 1. After the withdrawal by the device clock: hidden from the coach, the
-- school admin and any other user; visible to the guardian and the platform admin.
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000d2'),
  0::bigint, 'coach C no longer sees a measurement captured after the withdrawal'
);
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000d2'),
  0::bigint, 'the school admin does not see it'
);
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000d2'),
  0::bigint, 'another user does not see it'
);
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000d2'),
  1::bigint, 'guardian G still sees it'
);
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000d2'),
  1::bigint, 'the platform admin still sees it'
);

-- 2. Captured before the withdrawal on the device but received after it on the
-- server: either clock is enough to hide it.
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000d3'),
  0::bigint, 'coach C does not see a measurement received after the withdrawal, whatever its device time'
);
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000d3'),
  0::bigint, 'the school admin does not see it either'
);
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000d3'),
  1::bigint, 'guardian G sees it'
);

-- 3. Before the withdrawal by both clocks: unchanged for who could see it.
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000d1'),
  1::bigint, 'guardian G still sees a measurement made before the withdrawal'
);
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  (select count(*) from public.measurements where id in
     ('58000000-0000-4000-8000-0000000000d1', '58000000-0000-4000-8000-0000000000da')),
  2::bigint, 'coach C still sees the measurements made before the withdrawal'
);
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000d1'),
  1::bigint, 'the school admin still sees a measurement made before the withdrawal'
);

-- 4. The hidden row still exists with its author and device; nothing is deleted.
reset role;
select is(
  (select count(*) from public.measurements where athlete_id = '58000000-0000-4000-8000-0000000000e1'),
  5::bigint, 'all five measurements of e1 still exist, none deleted'
);
select is(
  (select created_by::text || '|' || device_id from public.measurements
   where id = '58000000-0000-4000-8000-0000000000d2'),
  '58000000-0000-4000-8000-0000000000a1|device-c',
  'the hidden measurement keeps its author and device'
);
select is(
  (select hundredths from public.measurements where id = '58000000-0000-4000-8000-0000000000d2'),
  3200, 'and its time'
);
select is(
  (select array_agg(id::text order by id) from public.measurements
   where athlete_id = '58000000-0000-4000-8000-0000000000e1' and hidden),
  array['58000000-0000-4000-8000-0000000000d2', '58000000-0000-4000-8000-0000000000d3',
        '58000000-0000-4000-8000-0000000000d4'],
  'exactly the three measurements recorded after the withdrawal are hidden'
);

-- 8. The client cannot force visibility.
select is(
  (select hidden from public.measurements where id = '58000000-0000-4000-8000-0000000000d4'),
  true, 'an insert that claims hidden = false ends hidden'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ update public.measurements set athlete_id = '58000000-0000-4000-8000-0000000000e1', hidden = false
     where id = '58000000-0000-4000-8000-0000000000d9' $$,
  'coach C completes an unassigned arrival and claims hidden = false'
);
reset role;
select is(
  (select hidden from public.measurements where id = '58000000-0000-4000-8000-0000000000d9'),
  true, 'the completed arrival was captured after the withdrawal, so it is hidden'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000d9'),
  0::bigint, 'and the coach no longer sees it'
);
reset role;
-- Not even the owner can unhide a row: the server recomputes hidden on update.
select lives_ok(
  $$ update public.measurements set hidden = false where id = '58000000-0000-4000-8000-0000000000d2' $$,
  'an update that sets hidden = false is accepted'
);
select is(
  (select hidden from public.measurements where id = '58000000-0000-4000-8000-0000000000d2'),
  true, 'but the measurement stays hidden'
);
select throws_ok(
  $$ update public.measurements set hundredths = 1 where id = '58000000-0000-4000-8000-0000000000d2' $$,
  '42501', 'only athlete_id can change on a measurement',
  'no other column can change'
);
select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, hidden)
     values
       ('58000000-0000-4000-8000-0000000000db', 'repetition', '58000000-0000-4000-8000-0000000000e2', 3300,
        'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c', '2026-10-02 08:10:00+00', true) $$,
  'an insert for an athlete who never withdrew that claims hidden = true'
);
select is(
  (select hidden from public.measurements where id = '58000000-0000-4000-8000-0000000000db'),
  false, 'the server computes hidden, so the claim is overwritten'
);
delete from public.measurements where id = '58000000-0000-4000-8000-0000000000db';

-- 6. Offline and retroactive: e3 already had two stored measurements when the
-- withdrawal arrived. The one captured after it becomes hidden, the earlier one
-- does not, and the earlier one is not even rewritten.
select is(
  (select hidden from public.measurements where id = '58000000-0000-4000-8000-0000000000d7'),
  true, 'a stored measurement captured after a withdrawal that arrived later becomes hidden'
);
select is(
  (select hidden from public.measurements where id = '58000000-0000-4000-8000-0000000000d6'),
  false, 'the one captured before the withdrawal stays visible'
);
select is(
  (select xmin::text from public.measurements where id = '58000000-0000-4000-8000-0000000000d6'),
  current_setting('test.r1_xmin'),
  'and it was not rewritten, so devices do not sync it again'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  (select array_agg(id::text) from public.measurements where athlete_id = '58000000-0000-4000-8000-0000000000e3'),
  array['58000000-0000-4000-8000-0000000000d6'],
  'coach C sees only the earlier measurement of e3'
);

-- 7. Another athlete is unaffected.
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000d8'),
  1::bigint, 'a measurement of e2, who never withdrew, stays visible to coach C'
);

-- 9. The coach and school admin streams. This mirrors the timing_measurements
-- stream in powersync/sync-config.yaml: its queries and the with: subqueries,
-- with auth.user_id() replaced by the user id, plus AND hidden = false (the
-- three source queries are joined with OR here; they are separate queries there).
reset role;
select set_eq(
  $$ select id from public.measurements
     where hidden = false
       and (athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '58000000-0000-4000-8000-0000000000a1')
         or athlete_id in (select athlete_id from public.athlete_groups where group_id in (select group_id from public.coach_group_assignments where coach_user_id = '58000000-0000-4000-8000-0000000000a1'))
         or athlete_id in (select athlete_id from public.athlete_schools where school_id in (select school_id from public.school_memberships where user_id = '58000000-0000-4000-8000-0000000000a1' and role = 'school_admin'))) $$,
  $$ values ('58000000-0000-4000-8000-0000000000d1'::uuid), ('58000000-0000-4000-8000-0000000000d6'),
            ('58000000-0000-4000-8000-0000000000d8'), ('58000000-0000-4000-8000-0000000000da') $$,
  'the coach stream returns the visible measurements and none of the hidden ones'
);
select set_eq(
  $$ select id from public.measurements
     where hidden = false
       and (athlete_id in (select athlete_id from public.coach_athlete_assignments where coach_user_id = '58000000-0000-4000-8000-0000000000a2')
         or athlete_id in (select athlete_id from public.athlete_groups where group_id in (select group_id from public.coach_group_assignments where coach_user_id = '58000000-0000-4000-8000-0000000000a2'))
         or athlete_id in (select athlete_id from public.athlete_schools where school_id in (select school_id from public.school_memberships where user_id = '58000000-0000-4000-8000-0000000000a2' and role = 'school_admin'))) $$,
  $$ values ('58000000-0000-4000-8000-0000000000d1'::uuid), ('58000000-0000-4000-8000-0000000000d6'),
            ('58000000-0000-4000-8000-0000000000d8'), ('58000000-0000-4000-8000-0000000000da') $$,
  'the school admin stream returns the visible measurements and none of the hidden ones'
);
select is(
  (select count(*) from public.measurements
   where athlete_id in (select athlete_id from public.athlete_managers where user_id = '58000000-0000-4000-8000-0000000000a3')
     and athlete_id = '58000000-0000-4000-8000-0000000000e1'),
  6::bigint, 'the guardian stream has no hidden filter, so it carries the hidden rows'
);

-- The server clock: a client that sends an old created_at is ignored. The
-- device time is before the withdrawal, so only the server time can hide it.
-- e6: captured after the coming new authorization on the device, but received
-- before it reaches the server, so the server clock does not authorize it.
reset role;
select set_config('test.before_insert', clock_timestamp()::text, true);
set local role authenticated;
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, series_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, created_at)
     values
       ('58000000-0000-4000-8000-0000000000ea', 'repetition', '58000000-0000-4000-8000-0000000000e1',
        '58000000-0000-4000-8000-0000000000c1', 3430, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c',
        '2026-10-04 09:00:00+00', '2000-01-01 00:00:00+00'),
       ('58000000-0000-4000-8000-0000000000e6', 'repetition', '58000000-0000-4000-8000-0000000000e1',
        '58000000-0000-4000-8000-0000000000c1', 3410, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c',
        '2026-10-09 09:00:00+00', '2000-01-01 00:00:00+00') $$,
  'coach C sends measurements with an old created_at'
);
reset role;
select ok(
  (select min(created_at) >= current_setting('test.before_insert')::timestamptz from public.measurements
   where id in ('58000000-0000-4000-8000-0000000000ea', '58000000-0000-4000-8000-0000000000e6')),
  'the server ignores the created_at sent and sets its own on insert'
);
select is(
  (select array_agg(hidden order by id) from public.measurements
   where id in ('58000000-0000-4000-8000-0000000000ea', '58000000-0000-4000-8000-0000000000e6')),
  array[true, true],
  'so they end hidden by the server clock, however old the created_at sent'
);

-- 5. The guardian authorizes again after the withdrawal. What was recorded in
-- between stays hidden; what is recorded after the new authorization follows
-- the normal rules.
set local role authenticated;
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
     values ('58000000-0000-4000-8000-000000000102', '58000000-0000-4000-8000-0000000000e1',
             'record_times', '58000000-0000-4000-8000-0000000000f1', '2026-10-08 08:00:00+00') $$,
  'guardian G authorizes e1 again'
);
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, series_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('58000000-0000-4000-8000-0000000000e5', 'repetition', '58000000-0000-4000-8000-0000000000e1',
        '58000000-0000-4000-8000-0000000000c1', 3400, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c',
        '2026-10-09 08:00:00+00') $$,
  'coach C records after the new authorization'
);
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000e5'),
  1::bigint, 'a measurement made after the new authorization is visible by the normal rules'
);
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000e6'),
  0::bigint, 'one received before the new authorization reached the server stays hidden'
);
select is(
  (select count(*) from public.measurements
   where id in ('58000000-0000-4000-8000-0000000000d2', '58000000-0000-4000-8000-0000000000d3',
                '58000000-0000-4000-8000-0000000000d4')),
  0::bigint, 'the measurements hidden in between stay hidden'
);
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000e5'),
  1::bigint, 'the school admin sees it too'
);
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(
  (select count(*) from public.measurements where athlete_id = '58000000-0000-4000-8000-0000000000e1'),
  9::bigint, 'guardian G sees all the measurements of e1'
);

-- The sync connector inserts with ON CONFLICT DO NOTHING RETURNING id. A row
-- that ends hidden must still be stored, not refused.
set local request.jwt.claims = '{"sub": "58000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.measurements
       (id, kind, athlete_id, series_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
     values
       ('58000000-0000-4000-8000-0000000000e7', 'repetition', '58000000-0000-4000-8000-0000000000e3',
        '58000000-0000-4000-8000-0000000000c1', 3500, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-c',
        '2026-10-10 08:00:00+00')
     on conflict (id) do nothing returning id $$,
  'an upload of a row that ends hidden, with ON CONFLICT DO NOTHING RETURNING, is not refused'
);
select is(
  (select count(*) from public.measurements where id = '58000000-0000-4000-8000-0000000000e7'),
  0::bigint, 'the author can write it but not read it afterwards'
);
reset role;
select is(
  (select hidden from public.measurements where id = '58000000-0000-4000-8000-0000000000e7'),
  true, 'and it is stored hidden'
);

select * from finish();
rollback;
