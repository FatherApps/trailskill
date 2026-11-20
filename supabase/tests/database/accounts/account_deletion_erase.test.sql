-- Account deletion, the day-30 side (issue #1244): erase_account in one transaction, the rule of the schools checked again, the
-- anonymized swimmer, the co-guardian that keeps the swimmer, the author columns of a deactivated coach, the audit row without
-- identity, the emails of the worker (reminder, final) and the inventory of foreign keys. All users and data are synthetic.
-- Users: E (deletes), M (co-guardian that stays), DC (deactivated coach that deletes), R (a school links their swimmer again),
-- RM (reminder), FL (a failure in the middle), L (late: not due yet), A (a school admin).
-- Swimmers: S1 (E only, photo, no school), S2 (E only, times recorded by a school: becomes a marker), S3 (E and M),
-- S5 (R only), S6 (FL only).
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

create function pg_temp.u(text) returns uuid language sql as $$ select ('12450000-0000-4000-8000-0000000000' || $1)::uuid $$;
-- Marks a user: the code goes through the real functions, then the day is moved to the past (or where asked).
create function pg_temp.mark(text, interval default '-1 day') returns uuid language plpgsql as $$
declare c text; rid uuid;
begin
  c := public.request_account_deletion(pg_temp.u($1)) ->> 'code';
  perform public.confirm_account_deletion(pg_temp.u($1), c);
  update public.account_deletion_requests set delete_after = now() + $2 where user_id = pg_temp.u($1) returning id into rid;
  return rid;
end;
$$;

insert into auth.users (id, email) values
  (pg_temp.u('e1'), 'erase-e@example.test'), (pg_temp.u('e2'), 'stays-m@example.test'), (pg_temp.u('e3'), 'coach-dc@example.test'),
  (pg_temp.u('e4'), 'relink-r@example.test'), (pg_temp.u('e5'), 'reminder-rm@example.test'), (pg_temp.u('e6'), 'fail-fl@example.test'),
  (pg_temp.u('e7'), 'late-l@example.test'), (pg_temp.u('e8'), 'admin-a@example.test');
insert into public.schools (id, name) values (pg_temp.u('c1'), 'Erase School');
insert into public.school_memberships (school_id, user_id, role) values
  (pg_temp.u('c1'), pg_temp.u('e3'), 'coach'), (pg_temp.u('c1'), pg_temp.u('e8'), 'school_admin');
update public.school_memberships set deactivated_at = now() where user_id = pg_temp.u('e3');
insert into public.adult_profiles (user_id, first_name, last_name) values (pg_temp.u('e1'), 'Erase', 'Guardian');
insert into public.athletes (id, first_name, last_name, created_by) values
  (pg_temp.u('d1'), 'Solo', 'One', pg_temp.u('e1')), (pg_temp.u('d2'), 'Marker', 'Two', pg_temp.u('e1')),
  (pg_temp.u('d3'), 'Shared', 'Three', pg_temp.u('e1')), (pg_temp.u('d5'), 'Relinked', 'Five', null), (pg_temp.u('d6'), 'Failing', 'Six', null);
insert into public.athlete_managers (user_id, athlete_id, relation) values
  (pg_temp.u('e1'), pg_temp.u('d1'), 'guardian'), (pg_temp.u('e1'), pg_temp.u('d2'), 'guardian'), (pg_temp.u('e1'), pg_temp.u('d3'), 'guardian'),
  (pg_temp.u('e2'), pg_temp.u('d3'), 'guardian'), (pg_temp.u('e4'), pg_temp.u('d5'), 'guardian'), (pg_temp.u('e6'), pg_temp.u('d6'), 'guardian');
-- S2 was enrolled in the school, the link ended, and the school recorded a time (by the coach DC).
insert into public.athlete_schools (athlete_id, school_id, ended_at, ended_by) values (pg_temp.u('d2'), pg_temp.u('c1'), now(), pg_temp.u('e8'));
insert into public.measurements (id, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at, created_by)
values (pg_temp.u('f2'), pg_temp.u('c1'), 'repetition', pg_temp.u('d2'), 3150, 'FR', '50m', 'SCM', 'training', 'screen_button', 'device-x',
  '2026-10-24 08:00:00+00', pg_temp.u('e3'));
insert into public.athlete_photos (athlete_id, storage_path, created_by)
values (pg_temp.u('d1'), pg_temp.u('d1')::text || '/' || pg_temp.u('f1')::text || '.jpg', pg_temp.u('e1'));
insert into public.athlete_share_codes (athlete_id, code, created_by) values (pg_temp.u('d1'), 'TS-ABCDEF', pg_temp.u('e1'));
insert into public.authorizations (user_id, athlete_id, purpose, text_id, accepted_at)
select pg_temp.u(x.u), pg_temp.u(x.a), 'record_times', t.id, now() from (values ('e1', 'd1'), ('e1', 'd3'), ('e2', 'd3')) x(u, a),
  lateral (select id from public.authorization_texts where purpose = 'record_times' limit 1) t;
insert into public.family_timing_measurements (owner_user_id, captured_by, athlete_id, stroke, distance, pool, session_type, captured_at, millis)
values (pg_temp.u('e1'), pg_temp.u('e1'), pg_temp.u('d1'), 'FR', '50m', 'SCM', 'training', now(), 31500),
  (pg_temp.u('e1'), pg_temp.u('e1'), null, 'FR', '50m', 'SCM', 'training', now(), 32000);

-- Marked, due: E, DC. R is marked and a school links their swimmer afterwards. RM is 6 days away. L is 20 days away.
create temp table req on commit drop as select 'e' as who, pg_temp.mark('e1') as id union all select 'dc', pg_temp.mark('e3');
insert into req select 'r', pg_temp.mark('e4');
insert into req select 'rm', pg_temp.mark('e5', interval '6 days');
insert into req select 'l', pg_temp.mark('e7', interval '20 days');
insert into req select 'fl', pg_temp.mark('e6');
insert into public.athlete_schools (athlete_id, school_id) values (pg_temp.u('d5'), pg_temp.u('c1'));

create function pg_temp.id_of(text) returns uuid language sql as $$ select id from req where who = $1 $$;
create function pg_temp.status_of(text) returns text language sql as $$ select status from public.account_deletion_requests where id = pg_temp.id_of($1) $$;

-- 1. Not due yet, and nobody but service_role.
select is((public.erase_account(pg_temp.id_of('l')) ->> 'status'), 'skipped', 'a request that is not due is skipped');
select is((select count(*) from auth.users where id = pg_temp.u('e7')), 1::bigint, 'and its user is untouched');
set local role authenticated;
select throws_ok($$select public.list_due_account_deletions()$$, '42501', null, 'a signed-in user cannot list the due requests');
select throws_ok($$select public.claim_account_deletion_mail()$$, '42501', null, 'nor claim the emails');
reset role;
select is(public.list_due_account_deletions() @> to_jsonb(pg_temp.id_of('e')::text), true, 'the due list holds the due request');
select is(jsonb_array_length(public.list_due_account_deletions()) , 4, 'and only the due ones (e, dc, r, fl)');

-- 2. The rule again on the day: a school linked R's swimmer during the grace period.
select is((public.erase_account(pg_temp.id_of('r')) ->> 'status'), 'stopped', 'a swimmer linked by a school again: nothing is deleted');
select is(pg_temp.status_of('r'), 'stopped', 'the request is closed as stopped');
select is((select count(*) from auth.users where id = pg_temp.u('e4')), 1::bigint, 'the user still exists');
select is((select count(*) from public.athletes where id = pg_temp.u('d5')), 1::bigint, 'and the swimmer too');
select is((public.erase_account(pg_temp.id_of('r')) ->> 'status'), 'skipped', 'a stopped request is not processed again');

-- 3. A failure in the middle leaves everything as it was (one transaction).
create function public.pg_test_refuse_delete() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end; $$;
create trigger pg_test_refuse_delete before delete on auth.users for each row when (old.id = '12450000-0000-4000-8000-0000000000e6')
  execute function public.pg_test_refuse_delete();
select throws_ok($$select public.erase_account(pg_temp.id_of('fl'))$$, 'P0001', 'forced failure', 'a failure in the last step raises');
select is(pg_temp.status_of('fl'), 'pending', 'the request is still pending');
select is((select count(*) from public.athletes where id = pg_temp.u('d6')), 1::bigint, 'the swimmer was not deleted');
select is((select count(*) from public.athlete_managers where user_id = pg_temp.u('e6')), 1::bigint, 'the link was not deleted');
select is((select count(*) from public.account_deletion_audit), 0::bigint, 'no audit row was written');
drop trigger pg_test_refuse_delete on auth.users;

-- 4. The normal day 30, E (guardian of S1 and S2 alone, of S3 with M).
select is((public.erase_account(pg_temp.id_of('e')) ->> 'status'), 'deleted', 'erase_account deletes the due account');
select is((select count(*) from auth.users where id = pg_temp.u('e1')), 0::bigint, 'the user is gone from auth.users');
select is((select count(*) from public.adult_profiles where user_id = pg_temp.u('e1')), 0::bigint, 'and the profile');
select is((select count(*) from public.family_timing_measurements where owner_user_id = pg_temp.u('e1')), 0::bigint, 'and Mis tiempos');
select is((select count(*) from public.authorizations where user_id = pg_temp.u('e1')), 0::bigint, 'and the authorizations the user gave');
select is((select count(*) from public.athlete_managers where user_id = pg_temp.u('e1')), 0::bigint, 'and every link with a swimmer');
select is((select count(*) from public.athlete_share_codes where athlete_id = pg_temp.u('d1')), 0::bigint, 'and the share codes');
select is((select count(*) from public.athletes where id = pg_temp.u('d1')), 0::bigint, 'the swimmer E alone was responsible for no longer exists');
select is((select count(*) from public.athlete_photos where athlete_id = pg_temp.u('d1')), 0::bigint, 'with their photo row');
select is((select count(*) from public.storage_deletion_queue where bucket_id = 'athlete-photos' and storage_path like pg_temp.u('d1')::text || '/%'), 1::bigint, 'and the photo file is queued for the Storage API');
-- The swimmer with times recorded by a school stays as a marker without identity.
select is((select count(*) from public.measurements where athlete_id = pg_temp.u('d2')), 1::bigint, 'S2: the school keeps its time');
select is((select first_name || ' ' || last_name from public.athletes where id = pg_temp.u('d2')), 'Nadador anterior', 'S2: the name is gone');
select is((select count(*) from public.athlete_managers where athlete_id = pg_temp.u('d2')), 0::bigint, 'S2: no manager links');
select is((select count(*) from public.athlete_photos where athlete_id = pg_temp.u('d2')) + (select count(*) from public.athlete_identity_documents where athlete_id = pg_temp.u('d2')), 0::bigint, 'S2: no photo, no document');
select is((select created_by from public.athletes where id = pg_temp.u('d2')), null::uuid, 'S2: no creator');
select matches((select key_hash from public.former_athlete_keys where athlete_id = pg_temp.u('d2')), '^[0-9a-f]{64}$', 'S2: the server keeps only the hash of the former_athlete_key');
-- The swimmer another guardian also manages stays.
select is((select count(*) from public.athletes where id = pg_temp.u('d3') and first_name = 'Shared'), 1::bigint, 'S3: the shared swimmer stays, with their name');
select is((select array_agg(user_id) from public.athlete_managers where athlete_id = pg_temp.u('d3')), array[pg_temp.u('e2')], 'S3: only the other guardian is left');
select is((select is_granted from public.authorization_status where athlete_id = pg_temp.u('d3') and purpose = 'record_times'), true, 'S3: the other guardian''s authorization keeps the status granted');

-- 5. The audit row: random id, time, roles and counts, nothing of the user.
select is((select count(*) from public.account_deletion_audit), 1::bigint, 'one audit row for E');
select is((select array_agg(k order by k) from public.account_deletion_audit a, jsonb_object_keys(to_jsonb(a)) k), array['counts', 'erased_at', 'id', 'roles'], 'the audit row has only id, time, roles and counts');
select is((select count(*) from public.account_deletion_audit a where a::text like '%example.test%' or a::text like '%' || pg_temp.u('e1')::text || '%' or a::text ilike '%Erase%'), 0::bigint, 'and holds no email, name or id of the user');
select is((select counts ->> 'athletes_anonymized' from public.account_deletion_audit), '1', 'the counts say what happened');

-- 6. A deactivated coach may delete: their records stay with a null author.
select is((public.erase_account(pg_temp.id_of('dc')) ->> 'status'), 'deleted', 'a deactivated coach is deleted');
select is((select created_by from public.measurements where id = pg_temp.u('f2')), null::uuid, 'the school''s time stays with a null author');
select is((select count(*) from auth.users where id = pg_temp.u('e3')), 0::bigint, 'the coach is gone');

-- 7. Idempotence: a second run does nothing and does not write a second audit row.
select is((public.erase_account(pg_temp.id_of('e')) ->> 'status'), 'skipped', 'running it again is skipped');
select is((select count(*) from public.account_deletion_audit), 2::bigint, 'and writes no second audit row');

-- 8. The emails: reminder on day 23 once, the final ones once, then the address is gone.
create temp table claimed on commit drop as select e ->> 'kind' as kind, (e ->> 'request_id')::uuid as request_id, e ->> 'email' as email, e -> 'former_athlete_keys' as keys
  from jsonb_array_elements(public.claim_account_deletion_mail()) e;
select is((select string_agg(kind, ',' order by kind) from claimed), 'deleted,deleted,reminder,stopped', 'the claim offers the reminder (day 23), both final emails and the stopped notice, not the request 20 days away');
select is((select jsonb_array_length(keys) from claimed where request_id = pg_temp.id_of('e')), 1, 'the confirmation of E carries the former_athlete_key');
select is((select encode(sha256(convert_to(keys ->> 0, 'UTF8')), 'hex') from claimed where request_id = pg_temp.id_of('e')), (select key_hash from public.former_athlete_keys), 'whose hash is what the server keeps');
select is(jsonb_array_length(public.claim_account_deletion_mail()), 0, 'a claimed email is not offered again to another worker');
select public.finish_account_deletion_mail(pg_temp.id_of('rm'), 'reminder');
select public.finish_account_deletion_mail(pg_temp.id_of('e'), 'deleted');
select public.finish_account_deletion_mail(pg_temp.id_of('dc'), 'deleted');
select public.finish_account_deletion_mail(pg_temp.id_of('r'), 'stopped');
select is((select count(*) from public.account_deletion_requests where email like '%example.test' and status in ('deleted', 'stopped')), 0::bigint, 'after the last email the address is kept nowhere');
select is((select reminder_sent_at is not null from public.account_deletion_requests where id = pg_temp.id_of('rm')), true, 'the reminder is recorded');
update public.account_deletion_requests set mail_claimed_at = now() - interval '1 hour';
select is(jsonb_array_length(public.claim_account_deletion_mail()), 0, 'the reminder is sent once; nothing else is due');

-- 9. The inventory of foreign keys: a new one that erase_account does not know fails here.
select is((select array_agg(x order by x) from (select conrelid::regclass || '.' || (select attname from pg_attribute where attrelid = conrelid and attnum = conkey[1]) as x
  from pg_constraint where contype = 'f' and confrelid = 'auth.users'::regclass and connamespace = 'public'::regnamespace and confdeltype in ('a', 'r')) q),
  array['athlete_managers.user_id', 'authorizations.user_id', 'authorizations.withdrawn_by', 'coach_athlete_assignments.coach_user_id',
    'coach_group_assignments.coach_user_id', 'coach_invitations.accepted_by', 'coach_invitations.created_by', 'imported_result_changes.resolved_by',
    'measurement_conflict_resolutions.resolved_by', 'platform_admins.user_id', 'results_import_confirmations.confirmed_by',
    'results_import_queries.last_queried_by', 'results_imports.requested_by', 'school_invitations.created_by', 'school_memberships.user_id',
    'school_result_sharing.approved_by', 'school_result_sharing.requested_by', 'school_result_sharing.withdrawn_by',
    'training_plan_assignments.withdrawn_by'],
  'every foreign key to auth.users without an on delete rule is one erase_account knows');
select is((select array_agg(x order by x) from (select conrelid::regclass || '.' || (select attname from pg_attribute where attrelid = conrelid and attnum = conkey[1]) as x
  from pg_constraint where contype = 'f' and confrelid = 'public.athletes'::regclass and confdeltype in ('a', 'r')) q),
  array['athlete_groups.athlete_id', 'athlete_managers.athlete_id', 'athlete_schools.athlete_id', 'authorization_status.athlete_id',
    'authorizations.athlete_id', 'coach_athlete_assignments.athlete_id', 'measurements.athlete_id', 'school_result_sharing.athlete_id',
    'training_plan_assignments.athlete_id', 'training_plan_fulfillments.athlete_id', 'training_plan_notices.athlete_id'],
  'every foreign key to athletes without an on delete rule is one erase_account knows');
select is((select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'account_marked_refuses_write')), 0::bigint,
  'every table of the public schema has the write guard of a marked account');

select * from finish();
rollback;
