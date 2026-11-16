-- A guardian reads a school time only when the school shares it (issue #1018, rule in
-- docs/product/guardian-shared-school-times.md): per (swimmer, school) switch, school default for new
-- swimmers, or record by record. Rows from before the rule stay visible, adult athletes read all theirs,
-- rows hidden after a withdrawal (#54) stay readable by the guardian. Staff visibility does not change.
-- All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

-- u('a1') is the uuid 10180000-0000-4000-8000-0000000000a1; as_user sets the signed-in user.
create function pg_temp.u(text) returns uuid language sql as $$ select ('10180000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- The measurements the current user reads, by the last two characters of the id.
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(right(id::text, 2), ',' order by id), '') from public.measurements where id::text like '10180000%' $$;
-- What the five setters answer when the current user calls them for e1 in b1 and the record d1.
create function pg_temp.try_setters() returns text language plpgsql as $$
declare r text[] := '{}'; q text;
begin
  foreach q in array array[
    format('select public.timing_guardian_sharing_default(%L)', pg_temp.u('b1')),
    format('select public.timing_set_guardian_sharing_default(%L, true)', pg_temp.u('b1')),
    format('select public.timing_guardian_sharing(%L, %L)', pg_temp.u('e1'), pg_temp.u('b1')),
    format('select public.timing_set_guardian_sharing(%L, %L, true)', pg_temp.u('e1'), pg_temp.u('b1')),
    format('select public.timing_set_measurement_guardian_shared(%L, true)', pg_temp.u('d1'))] loop
    begin execute q; r := r || 'ok'; exception when others then r := r || sqlstate; end;
  end loop;
  return array_to_string(r, ',');
end $$;
-- What the two default functions answer for school b2 to the current user.
create function pg_temp.try_defaults_b2() returns text language plpgsql as $$
declare r text[] := '{}'; q text;
begin
  foreach q in array array[
    format('select public.timing_guardian_sharing_default(%L)', pg_temp.u('b2')),
    format('select public.timing_set_guardian_sharing_default(%L, true)', pg_temp.u('b2'))] loop
    begin execute q; r := r || 'ok'; exception when others then r := r || sqlstate; end;
  end loop;
  return array_to_string(r, ',');
end $$;
-- The guardian queries of timing_measurements in powersync/sync-config.yaml, with the with: subqueries
-- inlined for the user. Pinned by src/modules/timing/__tests__/guardianSyncStream.test.ts: change both together.
create function pg_temp.stream_ids(uuid) returns setof uuid language sql as $$
  select id from public.measurements
    where athlete_id in (select athlete_id from public.athlete_managers where user_id = $1) and guardian_visible = true
  union
  select id from public.measurements
    where athlete_id in (select athlete_id from public.athlete_managers where user_id = $1) and hidden = true
  union
  select id from public.measurements
    where athlete_id in (select athlete_id from public.athlete_managers where user_id = $1 and relation = 'self') $$;
create temp table rls_seen (who text, id uuid);
grant all on rls_seen to authenticated;

-- Users: coach C (a1), school admin S (a2), guardian G of e1 (a3), guardian G2 of e2 (a4), coach X of
-- another school (a5), platform admin P (a6), adult athlete A, self of e3 (a7), coach D deactivated in b1 (a8).
insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'coach-c@example.test'), (pg_temp.u('a2'), 'admin-s@example.test'),
  (pg_temp.u('a3'), 'guardian-g@example.test'), (pg_temp.u('a4'), 'guardian-g2@example.test'),
  (pg_temp.u('a5'), 'coach-x@example.test'), (pg_temp.u('a6'), 'platform-p@example.test'),
  (pg_temp.u('a7'), 'adult-a@example.test'), (pg_temp.u('a8'), 'coach-d@example.test');
insert into public.schools (id, name) values (pg_temp.u('b1'), 'Sharing School One'), (pg_temp.u('b2'), 'Sharing School Two');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a1'), 'coach'), (pg_temp.u('b1'), pg_temp.u('a2'), 'school_admin'),
  (pg_temp.u('b2'), pg_temp.u('a5'), 'coach');
insert into public.school_memberships (school_id, user_id, role, deactivated_at)
  values (pg_temp.u('b1'), pg_temp.u('a8'), 'coach', now());
insert into public.platform_admins (user_id) values (pg_temp.u('a6'));
-- e1 and e3 swim in both schools; e2 only in b1.
insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'E1'), (pg_temp.u('e2'), 'Athlete', 'E2'), (pg_temp.u('e3'), 'Athlete', 'E3');
insert into public.athlete_schools (athlete_id, school_id) values
  (pg_temp.u('e1'), pg_temp.u('b1')), (pg_temp.u('e1'), pg_temp.u('b2')),
  (pg_temp.u('e2'), pg_temp.u('b1')), (pg_temp.u('e3'), pg_temp.u('b1')), (pg_temp.u('e3'), pg_temp.u('b2'));
insert into public.coach_athlete_assignments (coach_user_id, athlete_id, school_id) values
  (pg_temp.u('a1'), pg_temp.u('e1'), pg_temp.u('b1')), (pg_temp.u('a1'), pg_temp.u('e2'), pg_temp.u('b1')),
  (pg_temp.u('a1'), pg_temp.u('e3'), pg_temp.u('b1')), (pg_temp.u('a5'), pg_temp.u('e1'), pg_temp.u('b2'));
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a3'), pg_temp.u('e1'), 'guardian'), (pg_temp.u('a4'), pg_temp.u('e2'), 'guardian'),
  (pg_temp.u('a7'), pg_temp.u('e3'), 'self');
insert into public.authorization_texts (id, purpose, version, language, body)
  values (pg_temp.u('f1'), 'record_times', 1, 'en-US', 'Synthetic record times text v1');

-- G accepts record_times for e1 and withdraws on 2026-10-05, so d6 (captured on the 6th) is hidden (#54).
set local role authenticated;
select pg_temp.as_user('a3');
insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at)
  values (pg_temp.u('f2'), pg_temp.u('e1'), 'record_times', pg_temp.u('f1'), '2026-10-01 08:00:00+00');
update public.authorizations set withdrawn_at = '2026-10-05 09:00:00+00' where id = pg_temp.u('f2');
reset role;

-- d1, d2: e1 in b1. d3: e1 in b2. db: e3 in b2, written by coach X. d4: e2. d5: e3. d6: e1 in b1, hidden. d7: e2, the client sends guardian_visible = true.
insert into public.measurements (school_id, id, created_by, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at) values
  (pg_temp.u('b1'), pg_temp.u('d1'), pg_temp.u('a1'), 'repetition', pg_temp.u('e1'), 3150, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-02 08:00:00+00'),
  (pg_temp.u('b1'), pg_temp.u('d2'), pg_temp.u('a1'), 'repetition', pg_temp.u('e1'), 3160, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-03 08:00:00+00'),
  (pg_temp.u('b2'), pg_temp.u('d3'), pg_temp.u('a5'), 'repetition', pg_temp.u('e1'), 3170, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-x', '2026-10-03 08:00:00+00'),
  (pg_temp.u('b1'), pg_temp.u('d4'), pg_temp.u('a1'), 'repetition', pg_temp.u('e2'), 3180, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-03 08:00:00+00'),
  (pg_temp.u('b1'), pg_temp.u('d5'), pg_temp.u('a1'), 'repetition', pg_temp.u('e3'), 3190, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-03 08:00:00+00'),
  (pg_temp.u('b1'), pg_temp.u('d6'), pg_temp.u('a1'), 'repetition', pg_temp.u('e1'), 3200, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-06 08:00:00+00');
insert into public.measurements (school_id, id, created_by, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, guardian_visible)
  values (pg_temp.u('b1'), pg_temp.u('d7'), pg_temp.u('a1'), 'repetition', pg_temp.u('e2'), 3210, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-03 08:30:00+00', true);

insert into public.measurements (school_id, id, created_by, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
  values (pg_temp.u('b2'), pg_temp.u('db'), pg_temp.u('a5'), 'repetition', pg_temp.u('e3'), 3250, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-x', '2026-10-03 09:00:00+00');

-- 1. Schema.
select has_column('public', 'measurements', 'guardian_visible', 'measurements has guardian_visible');
select col_not_null('public', 'measurements', 'guardian_visible', 'guardian_visible is not null');
select col_default_is('public', 'measurements', 'guardian_visible', 'true', 'guardian_visible defaults to true');
select ok(
  not exists (
    select 1 from unnest(array['public.timing_guardian_sharing_defaults', 'public.timing_guardian_sharing', 'public.timing_guardian_shared_measurements']) t,
      unnest(array['authenticated', 'anon']) r, unnest(array['select', 'insert', 'update', 'delete']) p
    where has_table_privilege(r, t, p)),
  'clients cannot read or write the three sharing tables');
select ok(
  not exists (
    select 1 from unnest(array[
      'public.timing_guardian_sharing_default(uuid)', 'public.timing_set_guardian_sharing_default(uuid, boolean)',
      'public.timing_guardian_sharing(uuid, uuid)', 'public.timing_set_guardian_sharing(uuid, uuid, boolean)',
      'public.timing_set_measurement_guardian_shared(uuid, boolean)']) f
    where has_function_privilege('anon', f, 'execute')),
  'anon cannot execute the sharing functions');
select is(
  (select guardian_visible from public.measurements where id = pg_temp.u('d7')), false,
  'a guardian_visible = true sent on insert is stored false');
select throws_ok(
  $$ update public.measurements set guardian_visible = true where id = pg_temp.u('d7') $$,
  null, 'only athlete_id and hundredths can change on a measurement', 'and an update cannot set it');

-- 2. A new unshared time: the guardian does not read it, staff and the adult athlete do.
set local role authenticated;
select pg_temp.as_user('a3');
select is(pg_temp.seen(), 'd6', 'G reads no unshared time, only the one hidden after the withdrawal');
select pg_temp.as_user('a4');
select is(pg_temp.seen(), '', 'G2 reads no unshared time');
select pg_temp.as_user('a1');
select is(pg_temp.seen(), 'd1,d2,d4,d5,d7', 'coach C reads the times of b1, not the hidden one');
select pg_temp.as_user('a2');
select is(pg_temp.seen(), 'd1,d2,d4,d5,d7', 'school admin S reads the same');
select pg_temp.as_user('a6');
select is(pg_temp.seen(), 'd1,d2,d3,d4,d5,d6,d7,db', 'platform admin P reads everything');
select pg_temp.as_user('a5');
select is(pg_temp.seen(), 'd3', 'coach X reads only the time of b2');
select pg_temp.as_user('a7');
select is(pg_temp.seen(), 'd5,db', 'adult athlete A reads all their own times, in both schools, with nothing shared');

-- 3. The switch of e1 in b1.
select pg_temp.as_user('a1');
select is(public.timing_guardian_sharing(pg_temp.u('e1'), pg_temp.u('b1')), false, 'the switch is off without a row nor default');
select lives_ok($$ select public.timing_set_guardian_sharing(pg_temp.u('e1'), pg_temp.u('b1'), true) $$, 'coach C turns the switch of e1 in b1 on');
select pg_temp.as_user('a3');
select is(pg_temp.seen(), 'd1,d2,d6', 'G reads all the times of e1 in b1, and not the one of b2');
insert into rls_seen select 'G1', id from public.measurements;
select pg_temp.as_user('a7');
insert into rls_seen select 'A1', id from public.measurements;
reset role;
select set_eq($$ select id from rls_seen where who = 'G1' $$, $$ select * from pg_temp.stream_ids(pg_temp.u('a3')) $$, 'the stream gives G what the policy gives (switch on)');
select set_eq($$ select id from rls_seen where who = 'A1' $$, $$ select * from pg_temp.stream_ids(pg_temp.u('a7')) $$, 'the stream gives A what the policy gives');
set local role authenticated;
select pg_temp.as_user('a4');
select is(pg_temp.seen(), '', 'G2 still reads nothing');
select pg_temp.as_user('a1');
select is(pg_temp.seen(), 'd1,d2,d4,d5,d7', 'staff view does not change');
select pg_temp.as_user('a2');
select lives_ok($$ select public.timing_set_guardian_sharing(pg_temp.u('e1'), pg_temp.u('b1'), false) $$, 'school admin S turns it off');
select pg_temp.as_user('a3');
select is(pg_temp.seen(), 'd6', 'G does not read them again');

-- 4. A record shared on its own.
select pg_temp.as_user('a2');
select lives_ok($$ select public.timing_set_measurement_guardian_shared(pg_temp.u('d1'), true) $$, 'S shares d1 on its own');
select pg_temp.as_user('a3');
select is(pg_temp.seen(), 'd1,d6', 'G reads d1 only');
insert into rls_seen select 'G2', id from public.measurements;
reset role;
select set_eq($$ select id from rls_seen where who = 'G2' $$, $$ select * from pg_temp.stream_ids(pg_temp.u('a3')) $$, 'the stream gives G what the policy gives (one record shared)');
set local role authenticated;
select pg_temp.as_user('a1');
select throws_ok($$ select public.timing_set_measurement_guardian_shared(pg_temp.u('d3'), true) $$, '42501', null, 'C cannot share a time of another school');
select pg_temp.as_user('a2');
select lives_ok($$ select public.timing_set_measurement_guardian_shared(pg_temp.u('d1'), false) $$, 'S stops sharing d1');
select pg_temp.as_user('a3');
select is(pg_temp.seen(), 'd6', 'G does not read it again');

-- 5. Only the staff of the school read or change the switches and the default.
select pg_temp.as_user('a3');
select is(pg_temp.try_setters(), '42501,42501,42501,42501,42501', 'guardian G cannot call any of them');
select pg_temp.as_user('a4');
select is(pg_temp.try_setters(), '42501,42501,42501,42501,42501', 'guardian G2 cannot call any of them');
select pg_temp.as_user('a5');
select is(pg_temp.try_setters(), '42501,42501,42501,42501,42501', 'coach X of another school cannot call any of them');
select pg_temp.as_user('a7');
select is(pg_temp.try_setters(), '42501,42501,42501,42501,42501', 'adult athlete A cannot call any of them');
select pg_temp.as_user('a6');
select is(pg_temp.try_setters(), '42501,42501,42501,42501,42501', 'platform admin P is not staff and cannot call any of them');
select pg_temp.as_user('a8');
select is(pg_temp.try_setters(), '42501,42501,42501,42501,42501', 'coach D, deactivated in b1, cannot call any of them');
select pg_temp.as_user('a1');
select is(pg_temp.try_defaults_b2(), '42501,42501', 'coach C of b1 cannot read nor set the default of b2');
select pg_temp.as_user('a2');
select is(pg_temp.try_defaults_b2(), '42501,42501', 'school admin S of b1 cannot read nor set the default of b2');
reset role;
set local role anon;
select is(pg_temp.try_setters(), '42501,42501,42501,42501,42501', 'anon cannot call any of them');
reset role;
set local role authenticated;
select pg_temp.as_user('a2');
select throws_ok($$ select public.timing_set_guardian_sharing(pg_temp.u('e5'), pg_temp.u('b1'), true) $$, '42501', null, 'S cannot set the switch of an athlete who is not in the school');
select throws_ok($$ select public.timing_set_guardian_sharing(pg_temp.u('e1'), pg_temp.u('b1'), null) $$, '22004', null, 'a switch needs a value');

-- 6. Rows received before the rule stay visible: move its start after the stored rows and recompute.
reset role;
select set_config('test.since', (select since::text from app.timing_guardian_sharing_since), true);
update app.timing_guardian_sharing_since set since = now() + interval '1 hour';
set local role authenticated;
select pg_temp.as_user('a1');
select lives_ok($$ select public.timing_set_guardian_sharing(pg_temp.u('e1'), pg_temp.u('b1'), true) $$, 'C turns the switch on after the rule started');
select lives_ok($$ select public.timing_set_guardian_sharing(pg_temp.u('e1'), pg_temp.u('b1'), false) $$, 'and off again');
select pg_temp.as_user('a3');
select is(pg_temp.seen(), 'd1,d2,d6', 'G keeps reading the rows received before the rule');
reset role;
update app.timing_guardian_sharing_since set since = current_setting('test.since')::timestamptz;
set local role authenticated;
select pg_temp.as_user('a1');
select lives_ok($$ select public.timing_set_guardian_sharing(pg_temp.u('e1'), pg_temp.u('b1'), false) $$, 'the rule start goes back and C recomputes');
select pg_temp.as_user('a3');
select is(pg_temp.seen(), 'd6', 'the rows are unshared again');

-- e4 has a time in b1 but no athlete_schools row (it was removed after the upload).
reset role;
insert into public.athletes (id, first_name, last_name) values (pg_temp.u('e4'), 'Athlete', 'E4');
insert into public.athlete_schools (athlete_id, school_id) values (pg_temp.u('e4'), pg_temp.u('b1'));
insert into public.athlete_managers (user_id, athlete_id, relation) values (pg_temp.u('a4'), pg_temp.u('e4'), 'guardian');
insert into public.measurements (school_id, id, created_by, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
  values (pg_temp.u('b1'), pg_temp.u('da'), pg_temp.u('a1'), 'repetition', pg_temp.u('e4'), 3240, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-08 08:00:00+00');
delete from public.athlete_schools where athlete_id = pg_temp.u('e4');
set local role authenticated;

-- 7. The school default is for new swimmers: the swimmers without a switch keep what they had.
select pg_temp.as_user('a2');
select is(public.timing_guardian_sharing_default(pg_temp.u('b1')), false, 'a school without a default shares nothing');
select is(public.timing_guardian_sharing(pg_temp.u('e2'), pg_temp.u('b1')), false, 'e2 has no switch and follows it');
select lives_ok($$ select public.timing_set_guardian_sharing_default(pg_temp.u('b1'), true) $$, 'S sets the default of b1 to share');
select is(public.timing_guardian_sharing_default(pg_temp.u('b1')), true, 'the default reads true');
select is(public.timing_guardian_sharing(pg_temp.u('e2'), pg_temp.u('b1')), false, 'e2 keeps not sharing: its value was frozen');
reset role;
select is((select guardian_visible from public.measurements where id = pg_temp.u('da')), false, 'e4, with times and no athlete_schools row, keeps its value');
update public.measurements set athlete_id = athlete_id where id = pg_temp.u('da');
select is((select guardian_visible from public.measurements where id = pg_temp.u('da')), false, 'also when the row is rewritten');
select is((select shares_all from public.timing_guardian_sharing where athlete_id = pg_temp.u('e4') and school_id = pg_temp.u('b1')), false, 'and its switch was frozen');
reset role;
insert into public.athletes (id, first_name, last_name) values (pg_temp.u('e5'), 'Athlete', 'E5');
insert into public.athlete_schools (athlete_id, school_id) values (pg_temp.u('e5'), pg_temp.u('b1'));
insert into public.athlete_managers (user_id, athlete_id, relation) values (pg_temp.u('a4'), pg_temp.u('e5'), 'guardian');
insert into public.measurements (school_id, id, created_by, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at) values
  (pg_temp.u('b1'), pg_temp.u('d8'), pg_temp.u('a1'), 'repetition', pg_temp.u('e5'), 3220, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-08 08:00:00+00'),
  (pg_temp.u('b1'), pg_temp.u('d9'), pg_temp.u('a1'), 'repetition', pg_temp.u('e2'), 3230, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-c', '2026-10-08 08:00:00+00');
set local role authenticated;
select pg_temp.as_user('a2');
select is(public.timing_guardian_sharing(pg_temp.u('e5'), pg_temp.u('b1')), true, 'a swimmer added afterwards shares by default');
select pg_temp.as_user('a4');
select is(pg_temp.seen(), 'd8', 'G2 reads the new swimmer and not the older one');
insert into rls_seen select 'G3', id from public.measurements;
reset role;
select set_eq($$ select id from rls_seen where who = 'G3' $$, $$ select * from pg_temp.stream_ids(pg_temp.u('a4')) $$, 'the stream gives G2 what the policy gives (default)');

select * from finish();
rollback;
