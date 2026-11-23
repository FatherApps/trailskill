-- Recovery codes and account erasure (issue #1416): erase_account detaches the identity of a deleted swimmer instead of deleting it.
-- Only hashes stay, no personal data. A swimmer that kept school times stays as an anonymous marker and the identity still points
-- at it (so it resolves to the school's anonymous copy, former_athlete_keys); a swimmer without school times is deleted and the identity
-- keeps athlete_id null (PROVISIONAL). All users and data are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.u(text) returns uuid language sql as $$ select ('14160000-0000-4000-8000-0000000001' || $1)::uuid $$;

insert into auth.users (id, email) values (pg_temp.u('01'), 'rc-erase-e@example.test'), (pg_temp.u('02'), 'rc-erase-m@example.test');
insert into public.schools (id, name) values (pg_temp.u('c1'), 'Recovery Erase School');
insert into public.athletes (id, first_name, last_name, created_by) values
  (pg_temp.u('d1'), 'Solo', 'One', pg_temp.u('01')), (pg_temp.u('d2'), 'Marker', 'Two', pg_temp.u('01')),
  (pg_temp.u('d3'), 'Shared', 'Three', pg_temp.u('01'));
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('01'), pg_temp.u('d1'), 'guardian'), (pg_temp.u('01'), pg_temp.u('d2'), 'guardian'),
  (pg_temp.u('01'), pg_temp.u('d3'), 'guardian'), (pg_temp.u('02'), pg_temp.u('d3'), 'guardian');
insert into public.school_memberships (school_id, user_id, role) values (pg_temp.u('c1'), pg_temp.u('02'), 'school_admin');
-- D2 was enrolled in the school, the link ended, and the school recorded a time: it becomes a marker. D1 has no school times.
insert into public.athlete_schools (athlete_id, school_id, ended_at, ended_by) values (pg_temp.u('d2'), pg_temp.u('c1'), now(), pg_temp.u('02'));
insert into public.measurements (id, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
values (pg_temp.u('f2'), pg_temp.u('c1'), 'repetition', pg_temp.u('d2'), 3150, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-x',
  '2026-10-24 08:00:00+00', pg_temp.u('02'));

-- An identity with a recovery code for each swimmer, created by E.
insert into public.athlete_recovery_identities (athlete_id, created_by, code_hash) values
  (pg_temp.u('d1'), pg_temp.u('01'), app.athlete_recovery_code_hash('TR-DELETEDDDDD')),
  (pg_temp.u('d2'), pg_temp.u('01'), app.athlete_recovery_code_hash('TR-MARKERRRRRR')),
  (pg_temp.u('d3'), pg_temp.u('01'), app.athlete_recovery_code_hash('TR-SHAREDDDDDD'));
insert into public.athlete_recovery_codes (identity_id, code_set, code_hash)
select i.id, 1, app.athlete_recovery_code_hash('RC-' || i.athlete_id::text) from public.athlete_recovery_identities i;

-- E asks for the deletion, due today.
create temp table req on commit drop as select public.request_account_deletion(pg_temp.u('01')) ->> 'code' as code;
select public.confirm_account_deletion(pg_temp.u('01'), (select code from req));
update public.account_deletion_requests set delete_after = now() - interval '1 day' where user_id = pg_temp.u('01');
select is((public.erase_account((select id from public.account_deletion_requests where user_id = pg_temp.u('01'))) ->> 'status'), 'deleted',
  'erase_account deletes the due account');

select is((select count(*)::int from public.athlete_recovery_identities where code_hash in
  (app.athlete_recovery_code_hash('TR-DELETEDDDDD'), app.athlete_recovery_code_hash('TR-MARKERRRRRR'), app.athlete_recovery_code_hash('TR-SHAREDDDDDD'))),
  3, 'the three identities survive the erasure');
select is((select count(*)::int from public.athlete_recovery_codes), 3, 'and their recovery codes');

-- D1: no school times, the swimmer is deleted and the identity is detached.
select is((select count(*)::int from public.athletes where id = pg_temp.u('d1')), 0, 'D1: the swimmer is deleted');
select is((select athlete_id from public.athlete_recovery_identities where code_hash = app.athlete_recovery_code_hash('TR-DELETEDDDDD')),
  null::uuid, 'D1: the identity is detached, with no swimmer');
select is((select created_by from public.athlete_recovery_identities where code_hash = app.athlete_recovery_code_hash('TR-DELETEDDDDD')),
  null::uuid, 'D1: and with no author');

-- D2: the school keeps its times, the swimmer stays as an anonymous marker and the identity still points at it.
select is((select athlete_id from public.athlete_recovery_identities where code_hash = app.athlete_recovery_code_hash('TR-MARKERRRRRR')),
  pg_temp.u('d2'), 'D2: the identity still points at the anonymous marker');
select is((select first_name || ' ' || last_name from public.athletes where id = pg_temp.u('d2')), 'Nadador anterior', 'D2: which has no name');
select matches((select k.key_hash from public.athlete_recovery_identities i join public.former_athlete_keys k on k.athlete_id = i.athlete_id
  where i.code_hash = app.athlete_recovery_code_hash('TR-MARKERRRRRR')), '^[0-9a-f]{64}$',
  'D2: and resolves to the school''s anonymous copy (its former_athlete_key)');
select is((select created_by from public.athlete_recovery_identities where code_hash = app.athlete_recovery_code_hash('TR-MARKERRRRRR')),
  null::uuid, 'D2: with no author');

-- D3: another guardian keeps the swimmer, so the identity is untouched.
select is((select athlete_id from public.athlete_recovery_identities where code_hash = app.athlete_recovery_code_hash('TR-SHAREDDDDDD')),
  pg_temp.u('d3'), 'D3: the identity of a swimmer that stays is untouched');

-- No personal data is left in the identity rows of the erased swimmers.
select is((select count(*)::int from public.athlete_recovery_identities i where row_to_json(i)::text ~* 'solo|marker|shared|example\.test'), 0,
  'the identity rows hold no name or email');
select is((select count(*)::int from public.athlete_recovery_identities i where i.created_by = pg_temp.u('01')), 0,
  'and no reference to the erased user');

select * from finish();
rollback;
