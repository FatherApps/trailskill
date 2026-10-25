-- School admins read the edit conflicts of their school's measurements
-- (issue #316), so the console can flag "Revisar". The school comes from
-- measurements.school_id and only the school_admin role counts (never a plain
-- coach). Also pins the readers that already existed: the two authors while
-- they can read the measurement, and the platform admin. The last sections
-- mirror the timing_measurement_conflicts stream. All users and data are
-- synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Users: coaches C1 and C2 of e1 (the two authors), coach N of e1 (not an
-- author), coach X of school two, school admins S1 and S2, platform admin P.
insert into auth.users (id, email) values
  ('31600000-0000-4000-8000-0000000000a1', 'coach-1@example.test'),
  ('31600000-0000-4000-8000-0000000000a2', 'coach-2@example.test'),
  ('31600000-0000-4000-8000-0000000000a3', 'coach-n@example.test'),
  ('31600000-0000-4000-8000-0000000000a4', 'coach-x@example.test'),
  ('31600000-0000-4000-8000-0000000000a5', 'admin-s1@example.test'),
  ('31600000-0000-4000-8000-0000000000a6', 'admin-s2@example.test'),
  ('31600000-0000-4000-8000-0000000000a7', 'platform-p@example.test');

insert into public.schools (id, name) values
  ('31600000-0000-4000-8000-0000000000b1', 'Admin Conflict School One'),
  ('31600000-0000-4000-8000-0000000000b2', 'Admin Conflict School Two');

insert into public.school_memberships (school_id, user_id, role) values
  ('31600000-0000-4000-8000-0000000000b1', '31600000-0000-4000-8000-0000000000a1', 'coach'),
  ('31600000-0000-4000-8000-0000000000b1', '31600000-0000-4000-8000-0000000000a2', 'coach'),
  ('31600000-0000-4000-8000-0000000000b1', '31600000-0000-4000-8000-0000000000a3', 'coach'),
  ('31600000-0000-4000-8000-0000000000b2', '31600000-0000-4000-8000-0000000000a4', 'coach'),
  ('31600000-0000-4000-8000-0000000000b1', '31600000-0000-4000-8000-0000000000a5', 'school_admin'),
  ('31600000-0000-4000-8000-0000000000b2', '31600000-0000-4000-8000-0000000000a6', 'school_admin');

insert into public.platform_admins (user_id) values ('31600000-0000-4000-8000-0000000000a7');

insert into public.athletes (id, first_name, last_name) values
  ('31600000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('31600000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('31600000-0000-4000-8000-0000000000e9', 'Athlete', 'E9');

insert into public.athlete_schools (athlete_id, school_id) values
  ('31600000-0000-4000-8000-0000000000e1', '31600000-0000-4000-8000-0000000000b1'),
  ('31600000-0000-4000-8000-0000000000e2', '31600000-0000-4000-8000-0000000000b1'),
  ('31600000-0000-4000-8000-0000000000e9', '31600000-0000-4000-8000-0000000000b2');

insert into public.coach_athlete_assignments (coach_user_id, athlete_id) values
  ('31600000-0000-4000-8000-0000000000a1', '31600000-0000-4000-8000-0000000000e1'),
  ('31600000-0000-4000-8000-0000000000a2', '31600000-0000-4000-8000-0000000000e1'),
  ('31600000-0000-4000-8000-0000000000a3', '31600000-0000-4000-8000-0000000000e1'),
  ('31600000-0000-4000-8000-0000000000a4', '31600000-0000-4000-8000-0000000000e9');

insert into public.timing_series (school_id, id, created_by, stroke, distance, pool, session_type, device_id) values
  ('31600000-0000-4000-8000-0000000000b1', '31600000-0000-4000-8000-0000000000c1', '31600000-0000-4000-8000-0000000000a1', 'FR', '50m', 'SCM', 'training', 'dev-1'),
  ('31600000-0000-4000-8000-0000000000b2', '31600000-0000-4000-8000-0000000000c2', '31600000-0000-4000-8000-0000000000a4', 'FR', '50m', 'SCM', 'training', 'dev-9');

-- d1: school one, visible. d9: school two. d2: school one and hidden, because
-- its athlete e2 withdrew record_times before it was captured (issue #54).
insert into public.measurements
  (school_id, id, kind, athlete_id, series_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
values
  ('31600000-0000-4000-8000-0000000000b1', '31600000-0000-4000-8000-0000000000d1', 'repetition', '31600000-0000-4000-8000-0000000000e1',
   '31600000-0000-4000-8000-0000000000c1', 3500, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1',
   '2026-10-02 08:00:00+00', '31600000-0000-4000-8000-0000000000a1'),
  ('31600000-0000-4000-8000-0000000000b2', '31600000-0000-4000-8000-0000000000d9', 'repetition', '31600000-0000-4000-8000-0000000000e9',
   '31600000-0000-4000-8000-0000000000c2', 3600, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-9',
   '2026-10-02 08:00:00+00', '31600000-0000-4000-8000-0000000000a4');

insert into public.authorization_texts (id, purpose, version, language, body) values
  ('31600000-0000-4000-8000-0000000000aa', 'record_times', 1, 'en-US', 'Synthetic record times text v1');
insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at, user_id) values
  ('31600000-0000-4000-8000-000000000101', '31600000-0000-4000-8000-0000000000e2', 'record_times',
   '31600000-0000-4000-8000-0000000000aa', '2026-10-01 08:00:00+00', '31600000-0000-4000-8000-0000000000a5');
insert into public.measurements
  (school_id, id, kind, athlete_id, series_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
values
  ('31600000-0000-4000-8000-0000000000b1', '31600000-0000-4000-8000-0000000000d2', 'repetition', '31600000-0000-4000-8000-0000000000e2',
   '31600000-0000-4000-8000-0000000000c1', 3540, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1',
   '2026-10-06 08:00:00+00', '31600000-0000-4000-8000-0000000000a1');
update public.authorizations set withdrawn_at = '2026-10-05 09:00:00+00', withdrawn_by = '31600000-0000-4000-8000-0000000000a5'
  where id = '31600000-0000-4000-8000-000000000101';

-- Conflicts, inserted as the owner (clients cannot write): f1 on d1 between
-- C1 (stored) and C2 (not applied), f9 on d9, f2 on the hidden d2.
insert into public.measurement_conflicts
  (id, measurement_id, base_version, current_values, current_by, incoming_values, incoming_by)
values
  ('31600000-0000-4000-8000-0000000000f1', '31600000-0000-4000-8000-0000000000d1', 1,
   '{"hundredths": 3000, "version": 2}', '31600000-0000-4000-8000-0000000000a1',
   '{"hundredths": 3100}', '31600000-0000-4000-8000-0000000000a2'),
  ('31600000-0000-4000-8000-0000000000f9', '31600000-0000-4000-8000-0000000000d9', 1,
   '{"hundredths": 3300, "version": 2}', '31600000-0000-4000-8000-0000000000a4',
   '{"hundredths": 3400}', '31600000-0000-4000-8000-0000000000a4'),
  ('31600000-0000-4000-8000-0000000000f2', '31600000-0000-4000-8000-0000000000d2', 1,
   '{"hundredths": 3200, "version": 2}', '31600000-0000-4000-8000-0000000000a1',
   '{"hundredths": 3250}', '31600000-0000-4000-8000-0000000000a2');

select is(
  (select hidden from public.measurements where id = '31600000-0000-4000-8000-0000000000d2'),
  true, 'd2 is hidden after the withdrawal'
);

set local role authenticated;

-- 1-2. School admin S1 reads the conflict of their school, not the one of the hidden d2.
set local request.jwt.claims = '{"sub": "31600000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select set_eq(
  $$ select id from public.measurement_conflicts $$,
  $$ values ('31600000-0000-4000-8000-0000000000f1'::uuid) $$,
  'school admin S1 reads the conflict of their school and not the hidden one'
);
select is(
  (select status from public.measurement_conflicts where id = '31600000-0000-4000-8000-0000000000f1'),
  'open', 'S1 reads the status of the conflict'
);

-- 3. The admin of another school does not read it.
set local request.jwt.claims = '{"sub": "31600000-0000-4000-8000-0000000000a6", "role": "authenticated"}';
select set_eq(
  $$ select id from public.measurement_conflicts $$,
  $$ values ('31600000-0000-4000-8000-0000000000f9'::uuid) $$,
  'school admin S2 reads only the conflict of school two'
);

-- 4. A coach who is not an author does not.
set local request.jwt.claims = '{"sub": "31600000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is_empty(
  $$ select id from public.measurement_conflicts $$,
  'a coach who is not an author reads no conflict'
);

-- 5-8. Regression: the authors, the other school's coach and the platform admin.
set local request.jwt.claims = '{"sub": "31600000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select set_eq(
  $$ select id from public.measurement_conflicts $$,
  $$ values ('31600000-0000-4000-8000-0000000000f1'::uuid) $$,
  'author C1 still reads f1 and not the one of the hidden d2'
);
set local request.jwt.claims = '{"sub": "31600000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select set_eq(
  $$ select id from public.measurement_conflicts $$,
  $$ values ('31600000-0000-4000-8000-0000000000f1'::uuid) $$,
  'author C2 still reads f1'
);
set local request.jwt.claims = '{"sub": "31600000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select set_eq(
  $$ select id from public.measurement_conflicts $$,
  $$ values ('31600000-0000-4000-8000-0000000000f9'::uuid) $$,
  'coach X still reads only f9'
);
set local request.jwt.claims = '{"sub": "31600000-0000-4000-8000-0000000000a7", "role": "authenticated"}';
select set_eq(
  $$ select id from public.measurement_conflicts $$,
  $$ values ('31600000-0000-4000-8000-0000000000f1'::uuid), ('31600000-0000-4000-8000-0000000000f9'),
            ('31600000-0000-4000-8000-0000000000f2') $$,
  'the platform admin still reads every conflict, the hidden one included'
);

-- 9. The school_admin role is required: S1 as a plain coach reads nothing.
reset role;
update public.school_memberships set role = 'coach'
  where school_id = '31600000-0000-4000-8000-0000000000b1' and user_id = '31600000-0000-4000-8000-0000000000a5';
set local role authenticated;
set local request.jwt.claims = '{"sub": "31600000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
select is_empty(
  $$ select id from public.measurement_conflicts $$,
  'S1 as a plain coach of the school reads no conflict'
);
reset role;
update public.school_memberships set role = 'school_admin'
  where school_id = '31600000-0000-4000-8000-0000000000b1' and user_id = '31600000-0000-4000-8000-0000000000a5';

-- 10. The stream. This mirrors the new timing_measurement_conflicts query in
-- powersync/sync-config.yaml with the with: subqueries inlined and
-- auth.user_id() replaced by the user id.
select set_eq(
  $$ select id from public.measurement_conflicts
     where measurement_id in (
       select id from public.measurements
       where school_id in (select school_id from public.school_memberships where user_id = '31600000-0000-4000-8000-0000000000a5' and role = 'school_admin')
         and athlete_id in (select athlete_id from public.athlete_schools where school_id in (select school_id from public.school_memberships where user_id = '31600000-0000-4000-8000-0000000000a5' and role = 'school_admin'))
         and hidden = false) $$,
  $$ values ('31600000-0000-4000-8000-0000000000f1'::uuid) $$,
  'the admin stream carries the conflict of their school and not the hidden one'
);
select is_empty(
  $$ select id from public.measurement_conflicts
     where measurement_id in (
       select id from public.measurements
       where school_id in (select school_id from public.school_memberships where user_id = '31600000-0000-4000-8000-0000000000a3' and role = 'school_admin')
         and athlete_id in (select athlete_id from public.athlete_schools where school_id in (select school_id from public.school_memberships where user_id = '31600000-0000-4000-8000-0000000000a3' and role = 'school_admin'))
         and hidden = false) $$,
  'the admin stream carries nothing for a coach'
);

select * from finish();
rollback;
