-- Athlete health data (issue #1369): the athlete_health table, the store_health_data purpose, who reads and writes (only a manager of
-- the swimmer: a guardian or the adult athlete), the purge on withdrawal, the checks of the values, the marked-account guard and the
-- erasure of a swimmer who stays as a marker. Staff (coach, school admin) and anon never read or write. All data is synthetic.
-- Users: guardian G (e1 granted, e2 never granted), coach K and school admin S of e1's school, guardian G2 (e3, granted),
-- adult athlete X (e4, relation self, granted), guardian M (e5, granted, then marked for deletion), stranger N, guardian E (e6, erased).
begin;
create extension if not exists pgtap with schema extensions;
select plan(61);

create function pg_temp.u(text) returns uuid language sql as $$ select ('13690000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as
$$ select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
grant execute on function pg_temp.u(text), pg_temp.as_user(text) to authenticated;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'health-guardian-g@example.test'), (pg_temp.u('a2'), 'health-coach-k@example.test'),
  (pg_temp.u('a3'), 'health-admin-s@example.test'), (pg_temp.u('a4'), 'health-guardian-g2@example.test'),
  (pg_temp.u('a5'), 'health-adult-x@example.test'), (pg_temp.u('a6'), 'health-guardian-m@example.test'),
  (pg_temp.u('a7'), 'health-stranger-n@example.test'), (pg_temp.u('a8'), 'health-guardian-e@example.test');
insert into public.schools (id, name) values (pg_temp.u('b1'), 'Health School One');
insert into public.training_groups (id, school_id, name) values (pg_temp.u('d1'), pg_temp.u('b1'), 'Health Group One');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a2'), 'coach'), (pg_temp.u('b1'), pg_temp.u('a3'), 'school_admin');
insert into public.coach_group_assignments (coach_user_id, group_id) values (pg_temp.u('a2'), pg_temp.u('d1'));
insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'H1'), (pg_temp.u('e2'), 'Athlete', 'H2'), (pg_temp.u('e3'), 'Athlete', 'H3'),
  (pg_temp.u('e4'), 'Athlete', 'H4'), (pg_temp.u('e5'), 'Athlete', 'H5'), (pg_temp.u('e6'), 'Athlete', 'H6');
insert into public.athlete_schools (athlete_id, school_id) values (pg_temp.u('e1'), pg_temp.u('b1')), (pg_temp.u('e2'), pg_temp.u('b1'));
insert into public.athlete_groups (athlete_id, group_id) values (pg_temp.u('e1'), pg_temp.u('d1')), (pg_temp.u('e2'), pg_temp.u('d1'));
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a1'), pg_temp.u('e1'), 'guardian'), (pg_temp.u('a1'), pg_temp.u('e2'), 'guardian'),
  (pg_temp.u('a4'), pg_temp.u('e3'), 'guardian'), (pg_temp.u('a5'), pg_temp.u('e4'), 'self'),
  (pg_temp.u('a6'), pg_temp.u('e5'), 'guardian'), (pg_temp.u('a8'), pg_temp.u('e6'), 'guardian');

-- The purpose has no text yet (task 4.3): the test adds one, inside this transaction, to be able to grant it.
insert into public.authorization_texts (purpose, version, language, body)
values ('store_health_data', 1, 'es-CO', 'Texto de prueba para guardar los datos de salud del deportista.');
insert into public.authorizations (user_id, athlete_id, purpose, text_id, accepted_at)
select v.u, v.a, 'store_health_data', t.id, now() - interval '1 hour'
from (values (pg_temp.u('a1'), pg_temp.u('e1')), (pg_temp.u('a4'), pg_temp.u('e3')), (pg_temp.u('a5'), pg_temp.u('e4')),
             (pg_temp.u('a6'), pg_temp.u('e5')), (pg_temp.u('a8'), pg_temp.u('e6'))) as v(u, a)
join public.authorization_texts t on t.purpose = 'store_health_data' and t.version = 1 and t.language = 'es-CO';

-- Rows that already exist, written as the table owner: e1 (G, granted), e2 (G, never granted), e3 (G2), e6 (guardian E, becomes a marker).
insert into public.athlete_health (athlete_id, blood_type, weight_kg, height_cm, measured_on, allergies) values
  (pg_temp.u('e1'), 'O+', 45.5, 150.0, '2026-11-01', 'Penicilina'),
  (pg_temp.u('e2'), 'A-', 50, 160, '2026-11-01', null),
  (pg_temp.u('e3'), 'B+', 60, 170, null, null),
  (pg_temp.u('e6'), 'AB-', 40, 140, null, 'Nueces');

-- Structure.
select is((select count(*) from public.authorization_purposes where code = 'store_health_data'), 1::bigint, 'store_health_data is an authorization purpose');
select is((select relrowsecurity from pg_class where oid = 'public.athlete_health'::regclass), true, 'athlete_health has row level security enabled');
select ok(exists (select 1 from pg_publication_tables where pubname = 'powersync' and tablename = 'athlete_health'), 'athlete_health is in the powersync publication');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.athlete_health'::regclass and tgname = 'account_marked_refuses_write'), 'athlete_health has the marked-account guard');
select ok(not has_table_privilege('anon', 'public.athlete_health', 'select, insert, update, delete'), 'anon has no privilege on athlete_health');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'athlete_health'), 4::bigint, 'athlete_health has the four manager policies and no other');

set local role authenticated;

-- Guardian G: reads e1 and e2, not another family's.
select pg_temp.as_user('a1');
select set_eq($$select athlete_id from public.athlete_health$$,
  $$values (pg_temp.u('e1')), (pg_temp.u('e2'))$$, 'guardian G reads the rows of their own athletes only');
select lives_ok($$update public.athlete_health set weight_kg = 46.0, allergies = 'Penicilina y polen' where athlete_id = pg_temp.u('e1')$$,
  'G updates the row of e1 while store_health_data is in force');
select is((select weight_kg from public.athlete_health where athlete_id = pg_temp.u('e1')), 46.0, 'the update landed');
select is((select updated_by from public.athlete_health where athlete_id = pg_temp.u('e1')), pg_temp.u('a1'), 'the server stamps who changed it');
select throws_ok($$update public.athlete_health set athlete_id = pg_temp.u('e2') where athlete_id = pg_temp.u('e1')$$, '42501', null, 'the row keeps its athlete');
-- e2: no store_health_data: nothing written, the owner can read and delete.
select is((select count(*) from public.athlete_health where athlete_id = pg_temp.u('e2')), 1::bigint, 'without the authorization G still reads the existing row');
update public.athlete_health set weight_kg = 99 where athlete_id = pg_temp.u('e2');
select is((select weight_kg from public.athlete_health where athlete_id = pg_temp.u('e2')), 50.00, 'without store_health_data an update changes nothing');
select throws_ok($$insert into public.athlete_health (athlete_id, blood_type) values (pg_temp.u('e2'), 'O-')$$, '42501', null, 'without store_health_data a manager cannot insert (and the athlete has a row)');
select lives_ok($$delete from public.athlete_health where athlete_id = pg_temp.u('e2')$$, 'without store_health_data G can still delete the row');
select is((select count(*) from public.athlete_health where athlete_id = pg_temp.u('e2')), 0::bigint, 'the row of e2 is gone');
select throws_ok($$insert into public.athlete_health (athlete_id, blood_type) values (pg_temp.u('e2'), 'O-')$$, '42501', null, 'and still cannot insert it again without the authorization');
select throws_ok($$insert into public.athlete_health (athlete_id, blood_type) values (pg_temp.u('e3'), 'O-')$$, '42501', null, 'G cannot insert for another family''s athlete');
select lives_ok($$delete from public.athlete_health where athlete_id = pg_temp.u('e1')$$, 'G deletes the row of e1');
select lives_ok($$insert into public.athlete_health (athlete_id, blood_type, weight_kg) values (pg_temp.u('e1'), 'AB+', 47)$$, 'G inserts it again while store_health_data is in force');
select is((select height_cm from public.athlete_health where athlete_id = pg_temp.u('e1')), null, 'a field left empty stays null, not zero');
select is((select allergies from public.athlete_health where athlete_id = pg_temp.u('e1')), null, 'empty allergies stay null');

-- The checks of the values.
select throws_ok($$update public.athlete_health set blood_type = 'C+' where athlete_id = pg_temp.u('e1')$$, '23514', null, 'blood type outside the eight values is refused');
select throws_ok($$update public.athlete_health set blood_type = 'o+' where athlete_id = pg_temp.u('e1')$$, '23514', null, 'blood type is case sensitive');
select throws_ok($$update public.athlete_health set allergies = repeat('a', 501) where athlete_id = pg_temp.u('e1')$$, '23514', null, 'allergies over 500 characters are refused');
select lives_ok($$update public.athlete_health set allergies = repeat('a', 500) where athlete_id = pg_temp.u('e1')$$, 'allergies of exactly 500 characters are accepted');
select throws_ok($$update public.athlete_health set allergies = '' where athlete_id = pg_temp.u('e1')$$, '23514', null, 'empty allergies text is refused (the app stores null)');
select throws_ok($$update public.athlete_health set weight_kg = 9.9 where athlete_id = pg_temp.u('e1')$$, '23514', null, 'weight 9.9 kg is refused');
select lives_ok($$update public.athlete_health set weight_kg = 10 where athlete_id = pg_temp.u('e1')$$, 'weight 10 kg is accepted');
select lives_ok($$update public.athlete_health set weight_kg = 200 where athlete_id = pg_temp.u('e1')$$, 'weight 200 kg is accepted');
select throws_ok($$update public.athlete_health set weight_kg = 200.1 where athlete_id = pg_temp.u('e1')$$, '23514', null, 'weight 200.1 kg is refused');
select throws_ok($$update public.athlete_health set weight_kg = 0 where athlete_id = pg_temp.u('e1')$$, '23514', null, 'weight 0 is refused');
select lives_ok($$update public.athlete_health set weight_kg = 45.5 where athlete_id = pg_temp.u('e1')$$, 'weight with one decimal is accepted');
select throws_ok($$update public.athlete_health set weight_kg = 45.55 where athlete_id = pg_temp.u('e1')$$, '23514', null, 'weight with two decimals is refused, not rounded');
select throws_ok($$update public.athlete_health set height_cm = 79.9 where athlete_id = pg_temp.u('e1')$$, '23514', null, 'height 79.9 cm is refused');
select lives_ok($$update public.athlete_health set height_cm = 80 where athlete_id = pg_temp.u('e1')$$, 'height 80 cm is accepted');
select lives_ok($$update public.athlete_health set height_cm = 230 where athlete_id = pg_temp.u('e1')$$, 'height 230 cm is accepted');
select throws_ok($$update public.athlete_health set height_cm = 230.1 where athlete_id = pg_temp.u('e1')$$, '23514', null, 'height 230.1 cm is refused');
select lives_ok($$update public.athlete_health set height_cm = 150.5 where athlete_id = pg_temp.u('e1')$$, 'height with one decimal is accepted');
select throws_ok($$update public.athlete_health set height_cm = 150.55 where athlete_id = pg_temp.u('e1')$$, '23514', null, 'height with two decimals is refused, not rounded');

-- Another guardian, a stranger, the coach, the school admin and anon: nothing.
select pg_temp.as_user('a4');
select set_eq($$select athlete_id from public.athlete_health$$, $$values (pg_temp.u('e3'))$$, 'guardian G2 reads only their own athlete');
select pg_temp.as_user('a7');
select is((select count(*) from public.athlete_health), 0::bigint, 'a stranger reads nothing');
select pg_temp.as_user('a2');
select is((select count(*) from public.athlete_health), 0::bigint, 'the coach of the athlete reads nothing');
select throws_ok($$insert into public.athlete_health (athlete_id, blood_type) values (pg_temp.u('e1'), 'O+')$$, '42501', null, 'the coach cannot write');
select pg_temp.as_user('a3');
select is((select count(*) from public.athlete_health), 0::bigint, 'the school admin of the athlete reads nothing');
update public.athlete_health set blood_type = 'A+';
delete from public.athlete_health;
select throws_ok($$insert into public.athlete_health (athlete_id, blood_type) values (pg_temp.u('e1'), 'O+')$$, '42501', null, 'the school admin cannot write');
reset role;
select is((select count(*) from public.athlete_health where athlete_id in (pg_temp.u('e1'), pg_temp.u('e3'))), 2::bigint, 'staff updates and deletes touched no row');
set local role anon;
select throws_ok($$select count(*) from public.athlete_health$$, '42501', null, 'anon cannot read the table');
reset role;

-- athletes_visible: the athlete row carries none of the health fields.
select is((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'athletes'
  and column_name in ('blood_type', 'weight_kg', 'height_cm', 'allergies', 'measured_on')), 0::bigint, 'the athletes table has no health column');

-- The adult athlete X (relation self) is a manager too.
set local role authenticated;
select pg_temp.as_user('a5');
select lives_ok($$insert into public.athlete_health (athlete_id, blood_type) values (pg_temp.u('e4'), 'B-')$$, 'the adult athlete inserts their own row');
reset role;

-- Joining a school (accept_invitation, #1328) neither requires nor grants store_health_data: e7 joins school one through a real
-- invitation, and its status shows the three school purposes and nothing for health. Sending store_health_data too is refused.
reset role;
insert into public.athletes (id, first_name, last_name) values (pg_temp.u('e7'), 'Athlete', 'H7');
insert into public.athlete_managers (user_id, athlete_id, relation) values (pg_temp.u('a1'), pg_temp.u('e7'), 'guardian');
set local role authenticated;
select pg_temp.as_user('a3');
insert into public.school_invitations (id, school_id, group_id) values (pg_temp.u('c1'), pg_temp.u('b1'), pg_temp.u('d1'));
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('test.token', (select token from public.school_invitations where id = pg_temp.u('c1')), true);
create function pg_temp.auths(extra text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'purpose', p,
    'text_id', (select id from public.authorization_texts where purpose = p and language = 'es-CO' order by version limit 1)) order by p)
  from unnest(array['record_times', 'import_official_results', 'share_results_with_school'] || extra) as p $$;
grant execute on function pg_temp.auths(text[]) to authenticated;
set local role authenticated;
select pg_temp.as_user('a1');
select throws_ok($$select public.accept_invitation(current_setting('test.token'), pg_temp.u('e7'), null, now(), pg_temp.auths(array['store_health_data']))$$,
  '22023', null, 'joining a school refuses a fourth object for store_health_data');
select lives_ok($$select public.accept_invitation(current_setting('test.token'), pg_temp.u('e7'), null, now(), pg_temp.auths(array[]::text[]))$$,
  'the guardian joins the school with the three school authorizations');
reset role;
select is((select count(*) from public.authorization_status where athlete_id = pg_temp.u('e7') and is_granted), 3::bigint,
  'joining the school granted exactly the three school purposes');
select is((select count(*) from public.authorization_status where athlete_id = pg_temp.u('e7') and purpose = 'store_health_data'), 0::bigint,
  'joining the school did not grant store_health_data');
select is((select count(*) from public.authorizations where athlete_id = pg_temp.u('e7') and purpose = 'store_health_data'), 0::bigint,
  'nor recorded any acceptance of it');

-- Withdrawing store_health_data deletes the row in the same transaction.
update public.authorizations set withdrawn_at = now() where athlete_id = pg_temp.u('e3') and purpose = 'store_health_data';
select is((select count(*) from public.athlete_health where athlete_id = pg_temp.u('e3')), 0::bigint, 'withdrawing store_health_data purges the row');
select is((select count(*) from public.athlete_health where athlete_id = pg_temp.u('e4')), 1::bigint, 'and only that athlete''s row');

-- A marked account is refused.
create temp table m1 on commit drop as
  select public.confirm_account_deletion(pg_temp.u('a6'), (public.request_account_deletion(pg_temp.u('a6')) ->> 'code')) as r;
set local role authenticated;
select pg_temp.as_user('a6');
select throws_ok($$insert into public.athlete_health (athlete_id, blood_type) values (pg_temp.u('e5'), 'O+')$$, '42501', 'the account is marked for deletion', 'a marked account cannot write health data');
reset role;
select set_config('request.jwt.claims', '', true);

-- erase_account: e6 has a school time, so it stays as a marker; its health row must go.
insert into public.athlete_schools (athlete_id, school_id, ended_at, ended_by) values (pg_temp.u('e6'), pg_temp.u('b1'), now(), pg_temp.u('a3'));
insert into public.measurements (id, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
values (pg_temp.u('f6'), pg_temp.u('b1'), 'repetition', pg_temp.u('e6'), 3150, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-x', '2026-10-24 08:00:00+00', pg_temp.u('a2'));
select public.confirm_account_deletion(pg_temp.u('a8'), (public.request_account_deletion(pg_temp.u('a8')) ->> 'code'));
update public.account_deletion_requests set delete_after = now() - interval '1 day' where user_id = pg_temp.u('a8');
select is((public.erase_account((select id from public.account_deletion_requests where user_id = pg_temp.u('a8'))) ->> 'status'), 'deleted', 'erase_account runs for the guardian of e6');
select is((select first_name from public.athletes where id = pg_temp.u('e6')), 'Nadador', 'e6 stays as a marker because of its school time');
select is((select count(*) from public.athlete_health where athlete_id = pg_temp.u('e6')), 0::bigint, 'erase_account deletes the health row of the marker');

select * from finish();
rollback;
