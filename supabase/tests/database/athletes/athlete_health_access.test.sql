-- Emergency reveal of the health data to a school admin, with an access log (issue #1370, task 4.2 of the health and emergency design):
-- the share_health_with_school purpose, athlete_health_access_log (append only, nobody reads it directly), reveal_athlete_health (no log
-- means no data, and a refusal leaves no log), the family's read of the log, the withdrawal and the erasure of an account.
-- Users: guardian G (a1: e1, e2, e3, e4), coach K (a2) and admin S (a3) of school b1, admin T (a4) of school b2, admin V (a5) of b1
-- (marked for deletion), stranger N (a6), guardian G2 (a7: e5, erased at the end), guardian G3 (a8: e6).
-- Athletes: e1 active in b1 and share_health_with_school granted (has a health row); e2 active in b1, not granted (has a row); e3 granted
-- but its link with b1 ended (has a row); e4 active in b1 and granted, without a health row; e5 active in b1 and granted (then erased as
-- a marker); e6 active only in b2 and granted. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

create function pg_temp.u(text) returns uuid language sql as $$ select ('13700000-0000-4000-8000-0000000000' || $1)::uuid $$;
create function pg_temp.as_user(text) returns void language sql as
$$ select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u($1), 'role', 'authenticated')::text, true) $$;
-- The log is not readable by clients: the test counts it as its owner.
create function pg_temp.logs(a uuid) returns bigint language sql security definer as
$$ select count(*) from public.athlete_health_access_log where athlete_id = $1 $$;
create function pg_temp.all_logs() returns bigint language sql security definer as
$$ select count(*) from public.athlete_health_access_log $$;
grant execute on function pg_temp.u(text), pg_temp.as_user(text), pg_temp.logs(uuid), pg_temp.all_logs() to authenticated, anon;

insert into auth.users (id, email) values
  (pg_temp.u('a1'), 'reveal-guardian-g@example.test'), (pg_temp.u('a2'), 'reveal-coach-k@example.test'),
  (pg_temp.u('a3'), 'reveal-admin-s@example.test'), (pg_temp.u('a4'), 'reveal-admin-t@example.test'),
  (pg_temp.u('a5'), 'reveal-admin-v@example.test'), (pg_temp.u('a6'), 'reveal-stranger-n@example.test'),
  (pg_temp.u('a7'), 'reveal-guardian-g2@example.test'), (pg_temp.u('a8'), 'reveal-guardian-g3@example.test');
insert into public.adult_profiles (user_id, first_name, last_name) values (pg_temp.u('a3'), 'Admin', 'Siete');
insert into public.schools (id, name) values (pg_temp.u('b1'), 'Reveal School One'), (pg_temp.u('b2'), 'Reveal School Two');
insert into public.training_groups (id, school_id, name) values (pg_temp.u('d1'), pg_temp.u('b1'), 'Reveal Group One');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('b1'), pg_temp.u('a2'), 'coach'), (pg_temp.u('b1'), pg_temp.u('a3'), 'school_admin'),
  (pg_temp.u('b2'), pg_temp.u('a4'), 'school_admin'), (pg_temp.u('b1'), pg_temp.u('a5'), 'school_admin');
insert into public.coach_group_assignments (coach_user_id, group_id) values (pg_temp.u('a2'), pg_temp.u('d1'));
insert into public.athletes (id, first_name, last_name) values
  (pg_temp.u('e1'), 'Athlete', 'R1'), (pg_temp.u('e2'), 'Athlete', 'R2'), (pg_temp.u('e3'), 'Athlete', 'R3'),
  (pg_temp.u('e4'), 'Athlete', 'R4'), (pg_temp.u('e5'), 'Athlete', 'R5'), (pg_temp.u('e6'), 'Athlete', 'R6');
insert into public.athlete_schools (athlete_id, school_id) values
  (pg_temp.u('e1'), pg_temp.u('b1')), (pg_temp.u('e2'), pg_temp.u('b1')), (pg_temp.u('e4'), pg_temp.u('b1')),
  (pg_temp.u('e5'), pg_temp.u('b1')), (pg_temp.u('e6'), pg_temp.u('b2'));
insert into public.athlete_schools (athlete_id, school_id, ended_at, ended_by) values (pg_temp.u('e3'), pg_temp.u('b1'), now(), pg_temp.u('a3'));
insert into public.athlete_groups (athlete_id, group_id) values (pg_temp.u('e1'), pg_temp.u('d1'));
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('a1'), pg_temp.u('e1'), 'guardian'), (pg_temp.u('a1'), pg_temp.u('e2'), 'guardian'),
  (pg_temp.u('a1'), pg_temp.u('e3'), 'guardian'), (pg_temp.u('a1'), pg_temp.u('e4'), 'guardian'),
  (pg_temp.u('a7'), pg_temp.u('e5'), 'guardian'), (pg_temp.u('a8'), pg_temp.u('e6'), 'guardian');

-- The purpose has no text yet (task 4.3): the test adds one, inside this transaction, to be able to grant it.
insert into public.authorization_texts (purpose, version, language, body)
values ('share_health_with_school', 1, 'es-CO', 'Texto de prueba para compartir los datos de salud con la escuela en una emergencia.');
insert into public.authorizations (user_id, athlete_id, purpose, text_id, accepted_at)
select v.u, v.a, 'share_health_with_school', t.id, now() - interval '1 hour'
from (values (pg_temp.u('a1'), pg_temp.u('e1')), (pg_temp.u('a1'), pg_temp.u('e3')), (pg_temp.u('a1'), pg_temp.u('e4')),
             (pg_temp.u('a7'), pg_temp.u('e5')), (pg_temp.u('a8'), pg_temp.u('e6'))) as v(u, a)
join public.authorization_texts t on t.purpose = 'share_health_with_school' and t.version = 1 and t.language = 'es-CO';

-- The family's rows, written as the table owner with the triggers off (store_health_data is not what is tested here): e1, e2, e3, e5.
-- e4 has none.
set local session_replication_role = replica;
insert into public.athlete_health (athlete_id, blood_type, weight_kg, height_cm, measured_on, allergies) values
  (pg_temp.u('e1'), 'O+', 45.5, 150.0, '2026-11-01', 'Penicilina'),
  (pg_temp.u('e2'), 'A-', 50, 160, null, null),
  (pg_temp.u('e3'), 'B+', 60, 170, null, null),
  (pg_temp.u('e5'), 'AB-', 40, 140, null, 'Nueces');
set local session_replication_role = origin;

-- Structure.
select is((select count(*) from public.authorization_purposes where code = 'share_health_with_school'), 1::bigint, 'share_health_with_school is an authorization purpose');
select is((select count(*) from public.authorization_status where purpose = 'share_health_with_school' and is_granted), 5::bigint,
  'it is in force for e1, e3, e4, e5 and e6 through the acceptance rows above, and not for e2');
select is((select relrowsecurity from pg_class where oid = 'public.athlete_health_access_log'::regclass), true, 'the log has row level security enabled');
select is((select count(*) from pg_policy where polrelid = 'public.athlete_health_access_log'::regclass), 0::bigint, 'and no policy');
select ok(not exists (select 1 from pg_publication_tables where pubname = 'powersync' and tablename = 'athlete_health_access_log'), 'the log is not in the powersync publication');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.athlete_health_access_log'::regclass and tgname = 'account_marked_refuses_write'), 'the log has the marked-account guard');
select ok(not has_table_privilege('authenticated', 'public.athlete_health_access_log', 'select, insert, update, delete'), 'authenticated has no privilege on the log');
select ok(not has_table_privilege('anon', 'public.athlete_health_access_log', 'select, insert, update, delete'), 'anon has no privilege on the log');
select ok(has_function_privilege('authenticated', 'public.reveal_athlete_health(uuid, uuid, text)', 'execute'), 'authenticated may execute the reveal');
select ok(not has_function_privilege('anon', 'public.reveal_athlete_health(uuid, uuid, text)', 'execute'), 'anon may not execute the reveal');
select ok(not has_function_privilege('anon', 'public.athlete_health_access_log_for_manager(uuid)', 'execute'), 'anon may not read the log of a family');

-- The admin of the school, with the purpose in force and a valid observation: the data, and exactly one log row.
set local role authenticated;
select pg_temp.as_user('a3');
select is((select blood_type from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), '  Convulsion en el entrenamiento, familia sin contacto  ')),
  'O+', 'the admin of the school gets the health row of an athlete active in the school');
select is(pg_temp.logs(pg_temp.u('e1')), 1::bigint, 'and exactly one log row is left');
select is((select allergies from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), 'Segunda consulta de prueba')), 'Penicilina', 'the row carries the allergies');
select is(pg_temp.logs(pg_temp.u('e1')), 2::bigint, 'each reveal leaves its own row');
select is((select count(*) from public.reveal_athlete_health(pg_temp.u('e4'), pg_temp.u('b1'), 'La familia no guardo datos')), 0::bigint,
  'an athlete whose family stored nothing returns no row');
select is(pg_temp.logs(pg_temp.u('e4')), 1::bigint, 'but the consultation is still logged');
reset role;
select is((select row(viewer_user_id, school_id, reason, viewed_at = now())::text from public.athlete_health_access_log
           where athlete_id = pg_temp.u('e1') and reason like 'Convulsion%'),
  row(pg_temp.u('a3'), pg_temp.u('b1'), 'Convulsion en el entrenamiento, familia sin contacto', true)::text,
  'the log has who, the school, the trimmed reason and the server time');

-- Refusals leave no data and no log. Rows so far: e1 two, e4 one.
set local role authenticated;
select pg_temp.as_user('a2');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), 'Emergencia con una observacion valida')$$, '42501', null, 'the coach of the school is refused');
select pg_temp.as_user('a4');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), 'Emergencia con una observacion valida')$$, '42501', null, 'an admin of another school is refused for the school he does not run');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b2'), 'Emergencia con una observacion valida')$$, '42501', null, 'and for his own school when the athlete is not linked to it');
select pg_temp.as_user('a3');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e6'), pg_temp.u('b1'), 'Emergencia con una observacion valida')$$, '42501', null, 'the admin of b1 is refused for an athlete of b2 only');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e6'), pg_temp.u('b2'), 'Emergencia con una observacion valida')$$, '42501', null, 'and for b2 itself, which he does not run');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e3'), pg_temp.u('b1'), 'Emergencia con una observacion valida')$$, '42501', null, 'an admin is refused when the link of the athlete with the school ended');
select pg_temp.as_user('a1');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), 'Emergencia con una observacion valida')$$, '42501', null, 'the guardian is refused through the reveal');
select pg_temp.as_user('a6');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), 'Emergencia con una observacion valida')$$, '42501', null, 'a stranger is refused');
set local role anon;
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), 'Emergencia con una observacion valida')$$, '42501', null, 'anon is refused');
set local role authenticated;
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.account_deletion_requests (user_id, email, delete_after) values (pg_temp.u('a5'), 'reveal-admin-v@example.test', now() + interval '30 days');
set local role authenticated;
select pg_temp.as_user('a5');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), 'Emergencia con una observacion valida')$$, '42501', 'the account is marked for deletion',
  'an admin whose account is marked for deletion is refused');
select is(pg_temp.all_logs(), 3::bigint, 'none of the refusals above left a log row');

-- Without share_health_with_school in force: no data, no log.
select pg_temp.as_user('a3');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e2'), pg_temp.u('b1'), 'Emergencia con una observacion valida')$$, '55000', null, 'an athlete whose family never granted the purpose is refused');
select is(pg_temp.all_logs(), 3::bigint, 'with no log row');

-- The observation: from 10 to 500 characters once trimmed.
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), null)$$, '22023', null, 'a missing observation is refused');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), '')$$, '22023', null, 'an empty observation is refused');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), '            ')$$, '22023', null, 'an observation of only spaces is refused');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), '   abcdefghi   ')$$, '22023', null, 'nine characters once trimmed are refused');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), repeat('a', 501))$$, '22023', null, '501 characters are refused');
select is(pg_temp.all_logs(), 3::bigint, 'none of them left a log row');
select lives_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), 'abcdefghij')$$, 'ten characters are accepted');
select lives_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), repeat('a', 500))$$, '500 characters are accepted');
select is(pg_temp.logs(pg_temp.u('e1')), 4::bigint, 'and each left its row');

-- Nobody reads or writes the log directly.
select throws_ok($$select * from public.athlete_health_access_log$$, '42501', null, 'the admin cannot read the log table');
select throws_ok($$insert into public.athlete_health_access_log (athlete_id, school_id, viewer_user_id, reason) values (pg_temp.u('e1'), pg_temp.u('b1'), pg_temp.u('a3'), 'forged entry')$$, '42501', null, 'nor insert into it');
select throws_ok($$update public.athlete_health_access_log set reason = 'edited'$$, '42501', null, 'nor update it');
select throws_ok($$delete from public.athlete_health_access_log$$, '42501', null, 'nor delete from it');
select pg_temp.as_user('a1');
select throws_ok($$select * from public.athlete_health_access_log$$, '42501', null, 'the guardian cannot read the log table either');
set local role anon;
select throws_ok($$select * from public.athlete_health_access_log$$, '42501', null, 'anon cannot read the log table');
set local role authenticated;

-- The family reads the log of its athlete through its function, and nobody else does.
select pg_temp.as_user('a1');
select is((select count(*) from public.athlete_health_access_log_for_manager(pg_temp.u('e1'))), 4::bigint, 'the guardian reads the four consultations of e1');
select is((select row(viewer_name, school_name, reason)::text from public.athlete_health_access_log_for_manager(pg_temp.u('e1')) where reason like 'Convulsion%'),
  row('Admin Siete', 'Reveal School One', 'Convulsion en el entrenamiento, familia sin contacto')::text, 'with who, the school and the reason');
select is((select viewed_at from public.athlete_health_access_log_for_manager(pg_temp.u('e1')) order by viewed_at desc, id limit 1), now(), 'and when');
select is((select count(*) from public.athlete_health_access_log_for_manager(pg_temp.u('e4'))), 1::bigint, 'including the consultation of an athlete with no health row');
select is((select count(*) from public.athlete_health_access_log_for_manager(pg_temp.u('e5'))), 0::bigint, 'and nothing for an athlete the guardian does not manage');
select pg_temp.as_user('a3');
select is((select count(*) from public.athlete_health_access_log_for_manager(pg_temp.u('e1'))), 0::bigint, 'the admin who consulted gets nothing from the family function');
select pg_temp.as_user('a2');
select is((select count(*) from public.athlete_health_access_log_for_manager(pg_temp.u('e1'))), 0::bigint, 'the coach gets nothing from it');
select pg_temp.as_user('a6');
select is((select count(*) from public.athlete_health_access_log_for_manager(pg_temp.u('e1'))), 0::bigint, 'a stranger gets nothing from it');
set local role anon;
select throws_ok($$select * from public.athlete_health_access_log_for_manager(pg_temp.u('e1'))$$, '42501', null, 'anon cannot call it');
set local role authenticated;

-- Withdrawing the purpose: the next reveal is refused; the family's row and the earlier log stay.
reset role;
update public.authorizations set withdrawn_at = now() where athlete_id = pg_temp.u('e1') and purpose = 'share_health_with_school';
set local role authenticated;
select pg_temp.as_user('a3');
select throws_ok($$select * from public.reveal_athlete_health(pg_temp.u('e1'), pg_temp.u('b1'), 'Emergencia con una observacion valida')$$, '55000', null, 'after the withdrawal the reveal is refused');
reset role;
select is((select count(*) from public.athlete_health where athlete_id = pg_temp.u('e1')), 1::bigint, 'the family''s row stays');
select is(pg_temp.logs(pg_temp.u('e1')), 4::bigint, 'and so do the earlier log rows, with none added');

-- erase_account: e5 is revealed, its school link ends, it keeps a school time (so it stays as a marker), then its guardian is erased.
set local role authenticated;
select pg_temp.as_user('a3');
select lives_ok($$select * from public.reveal_athlete_health(pg_temp.u('e5'), pg_temp.u('b1'), 'Emergencia con una observacion valida')$$, 'the admin reveals e5');
select lives_ok($$select public.end_athlete_school(pg_temp.u('e5'), pg_temp.u('b1'))$$, 'the school ends the link of e5');
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.measurements (id, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
values (pg_temp.u('f5'), pg_temp.u('b1'), 'repetition', pg_temp.u('e5'), 3150, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-x', '2026-10-24 08:00:00+00', pg_temp.u('a2'));
select public.confirm_account_deletion(pg_temp.u('a7'), (public.request_account_deletion(pg_temp.u('a7')) ->> 'code'));
update public.account_deletion_requests set delete_after = now() - interval '1 day' where user_id = pg_temp.u('a7');
select is(pg_temp.logs(pg_temp.u('e5')), 1::bigint, 'e5 has its log row before the erasure');
select is((public.erase_account((select id from public.account_deletion_requests where user_id = pg_temp.u('a7'))) ->> 'status'), 'deleted', 'erase_account runs for the guardian of e5');
select is((select first_name from public.athletes where id = pg_temp.u('e5')), 'Nadador', 'e5 stays as a marker because of its school time');
select is(pg_temp.logs(pg_temp.u('e5')), 0::bigint, 'erase_account deletes the log rows of the marker');
select is(pg_temp.logs(pg_temp.u('e1')), 4::bigint, 'and only those');

select * from finish();
rollback;
