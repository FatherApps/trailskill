-- Identity number of an athlete (issue #799): stored encrypted with a Vault
-- key, never readable by a session, written by a guardian (or by the server)
-- only while import_official_results is in force, read in clear only by
-- service_role, deleted when the purpose is withdrawn or the athlete goes, and
-- never echoed by an error. The test creates its own Vault key inside the
-- transaction. All users, numbers and keys here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

-- Users: guardian G (athletes e1, e2, e5) and guardian X (athlete e4).
insert into auth.users (id, email) values
  ('79900000-0000-4000-8000-0000000000a1', 'guardian-g@example.test'),
  ('79900000-0000-4000-8000-0000000000a2', 'guardian-x@example.test');

insert into public.athletes (id, first_name, last_name) values
  ('79900000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('79900000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('79900000-0000-4000-8000-0000000000e3', 'Athlete', 'E3'),
  ('79900000-0000-4000-8000-0000000000e4', 'Athlete', 'E4'),
  ('79900000-0000-4000-8000-0000000000e5', 'Athlete', 'E5');

insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('79900000-0000-4000-8000-0000000000a1', '79900000-0000-4000-8000-0000000000e1', 'guardian'),
  ('79900000-0000-4000-8000-0000000000a1', '79900000-0000-4000-8000-0000000000e2', 'guardian'),
  ('79900000-0000-4000-8000-0000000000a1', '79900000-0000-4000-8000-0000000000e5', 'guardian'),
  ('79900000-0000-4000-8000-0000000000a2', '79900000-0000-4000-8000-0000000000e4', 'guardian');

insert into public.authorization_texts (id, purpose, version, language, body) values
  ('79900000-0000-4000-8000-0000000000f1', 'record_times', 1, 'en-US', 'Synthetic record times text v1'),
  ('79900000-0000-4000-8000-0000000000f2', 'import_official_results', 1, 'en-US', 'Synthetic import text v1');

-- The text of what failed: message, detail, hint and the full context. The
-- number goes in as a parameter, like PostgREST sends it, so the frame of this
-- helper shows $1, $2 and a number in the text would be a real leak.
create function pg_temp.failure_text(stmt text, athlete uuid, identity_number text) returns text language plpgsql as $$
declare m text; d text; h text; c text;
begin
  execute stmt using athlete, identity_number;
  return 'no error';
exception when others then
  get stacked diagnostics m = message_text, d = pg_exception_detail, h = pg_exception_hint, c = pg_exception_context;
  return concat_ws(' | ', m, d, h, c);
end;
$$;

-- G accepts import_official_results for e1 and e2, record_times for e1 and e5.
set local role authenticated;
set local request.jwt.claims = '{"sub": "79900000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at) values
  ('79900000-0000-4000-8000-000000000101', '79900000-0000-4000-8000-0000000000e1', 'import_official_results', '79900000-0000-4000-8000-0000000000f2', '2026-10-01 10:00:00-05'),
  ('79900000-0000-4000-8000-000000000102', '79900000-0000-4000-8000-0000000000e1', 'record_times', '79900000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00-05'),
  ('79900000-0000-4000-8000-000000000103', '79900000-0000-4000-8000-0000000000e2', 'import_official_results', '79900000-0000-4000-8000-0000000000f2', '2026-10-01 10:00:00-05'),
  ('79900000-0000-4000-8000-000000000104', '79900000-0000-4000-8000-0000000000e5', 'record_times', '79900000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00-05');
reset role;

-- Schema and privileges
select has_table('public', 'athlete_identity_documents', 'athlete_identity_documents exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.athlete_identity_documents'::regclass),
  'the table has row level security enabled'
);
select is_empty(
  $$ select policyname from pg_policies where schemaname = 'public' and tablename = 'athlete_identity_documents' $$,
  'the table has no policy for anyone'
);
select ok(
  not has_table_privilege('authenticated', 'public.athlete_identity_documents', 'select, insert, update, delete')
    and not has_table_privilege('anon', 'public.athlete_identity_documents', 'select, insert, update, delete'),
  'authenticated and anon have no privilege on the table'
);
select is_empty(
  $$ select tablename from pg_publication_tables where pubname = 'powersync' and tablename = 'athlete_identity_documents' $$,
  'the table is not in the powersync publication'
);
select ok(
  has_function_privilege('authenticated', 'public.save_athlete_identity_number(uuid, text)', 'execute')
    and has_function_privilege('authenticated', 'public.athlete_identity_number_hint(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.save_athlete_identity_number(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.athlete_identity_number_hint(uuid)', 'execute'),
  'authenticated executes the guardian functions and anon does not'
);
select ok(
  has_function_privilege('service_role', 'public.athlete_identity_number(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.athlete_identity_number(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.athlete_identity_number(uuid)', 'execute')
    and not has_function_privilege('public', 'public.athlete_identity_number(uuid)', 'execute'),
  'only service_role executes the read function'
);
select ok(
  has_function_privilege('service_role', 'public.save_athlete_identity_number_as_service(uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.save_athlete_identity_number_as_service(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.save_athlete_identity_number_as_service(uuid, text)', 'execute')
    and not has_function_privilege('public', 'public.save_athlete_identity_number_as_service(uuid, text)', 'execute'),
  'only service_role executes the server write function'
);
select ok(
  not has_function_privilege('authenticated', 'app.store_athlete_identity_number(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'app.store_athlete_identity_number(uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'app.read_athlete_identity_number(uuid)', 'execute')
    and not has_function_privilege('anon', 'app.read_athlete_identity_number(uuid)', 'execute'),
  'clients cannot execute the private helpers'
);
select is(
  (select count(*) from pg_proc
   where oid in ('public.save_athlete_identity_number(uuid, text)'::regprocedure,
                 'public.save_athlete_identity_number_as_service(uuid, text)'::regprocedure,
                 'public.athlete_identity_number(uuid)'::regprocedure,
                 'public.athlete_identity_number_hint(uuid)'::regprocedure,
                 'app.store_athlete_identity_number(uuid, text)'::regprocedure,
                 'app.read_athlete_identity_number(uuid)'::regprocedure)
     and prosecdef and coalesce(proconfig, '{}') @> array['search_path=""']),
  6::bigint,
  'the six functions are security definer with an empty search_path'
);

-- No Vault secret yet (a local database may have none, but be sure): the
-- write fails clearly, and the number is not in the error.
delete from vault.secrets where name = 'athlete_identity_key';
set local role authenticated;
set local request.jwt.claims = '{"sub": "79900000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.save_athlete_identity_number('79900000-0000-4000-8000-0000000000e1', 'QQ-99.887 766') $$,
  'TS001',
  'athlete identity key is not configured',
  'without the Vault secret the write fails with a clear error'
);
select ok(
  pg_temp.failure_text('select public.save_athlete_identity_number($1, $2)', '79900000-0000-4000-8000-0000000000e1', 'QQ-99.887 766')
    like 'athlete identity key is not configured%'
    and pg_temp.failure_text('select public.save_athlete_identity_number($1, $2)', '79900000-0000-4000-8000-0000000000e1', 'QQ-99.887 766') !~ 'QQ|887|766',
  'the missing key error does not carry the number'
);

reset role;
do $$ begin perform vault.create_secret('synthetic-test-key-not-for-production-0123456789', 'athlete_identity_key'); end $$;

-- Someone who is not a manager of the athlete
set local role authenticated;
set local request.jwt.claims = '{"sub": "79900000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select throws_ok(
  $$ select public.save_athlete_identity_number('79900000-0000-4000-8000-0000000000e1', 'QQ-99.887 766') $$,
  '42501',
  'only a manager of the athlete can save the identity number',
  'guardian X cannot write the number of the athlete e1 of another family'
);
select ok(
  pg_temp.failure_text('select public.save_athlete_identity_number($1, $2)', '79900000-0000-4000-8000-0000000000e1', 'QQ-99.887 766')
    like 'only a manager%'
    and pg_temp.failure_text('select public.save_athlete_identity_number($1, $2)', '79900000-0000-4000-8000-0000000000e1', 'QQ-99.887 766') !~ 'QQ|887|766',
  'the refusal does not carry the number'
);
select throws_ok(
  $$ select * from public.athlete_identity_number_hint('79900000-0000-4000-8000-0000000000e1') $$,
  '42501',
  'only a manager of the athlete can read the identity number hint',
  'guardian X cannot read the hint of the athlete e1'
);

set local request.jwt.claims = '{"sub": "79900000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ select public.save_athlete_identity_number('79900000-0000-4000-8000-0000000000e4', 'QQ-99.887 766') $$,
  '42501',
  'only a manager of the athlete can save the identity number',
  'guardian G cannot write the number of the athlete e4'
);

-- import_official_results not in force (e5 only accepted record_times)
select throws_ok(
  $$ select public.save_athlete_identity_number('79900000-0000-4000-8000-0000000000e5', 'QQ-99.887 766') $$,
  '55000',
  'import_official_results is not in force for the athlete',
  'the write fails without import_official_results in force'
);
select ok(
  pg_temp.failure_text('select public.save_athlete_identity_number($1, $2)', '79900000-0000-4000-8000-0000000000e5', 'QQ-99.887 766')
    like 'import_official_results is not in force%'
    and pg_temp.failure_text('select public.save_athlete_identity_number($1, $2)', '79900000-0000-4000-8000-0000000000e5', 'QQ-99.887 766') !~ 'QQ|887|766',
  'the not in force error does not carry the number'
);

-- Invalid numbers (e1 has the purpose in force)
select throws_ok(
  $$ select public.save_athlete_identity_number('79900000-0000-4000-8000-0000000000e1', 'QQ#99887766') $$,
  '22023', 'identity number is not valid',
  'a number with a symbol is refused'
);
select throws_ok(
  $$ select public.save_athlete_identity_number('79900000-0000-4000-8000-0000000000e1', '123456789012345678901') $$,
  '22023', 'identity number is not valid',
  'a number of 21 characters is refused'
);
select throws_ok(
  $$ select public.save_athlete_identity_number('79900000-0000-4000-8000-0000000000e1', ' . - ') $$,
  '22023', 'identity number is not valid',
  'a number that is empty once cleaned is refused'
);
select throws_ok(
  $$ select public.save_athlete_identity_number('79900000-0000-4000-8000-0000000000e1', null) $$,
  '22023', 'identity number is not valid',
  'a null number is refused'
);
select ok(
  pg_temp.failure_text('select public.save_athlete_identity_number($1, $2)', '79900000-0000-4000-8000-0000000000e1', 'QQ#99887766')
    like 'identity number is not valid%'
    and pg_temp.failure_text('select public.save_athlete_identity_number($1, $2)', '79900000-0000-4000-8000-0000000000e1', 'QQ#99887766') !~ 'QQ|887|766',
  'the invalid number error does not carry the number'
);

reset role;
select is_empty(
  'select 1 from public.athlete_identity_documents',
  'none of the refused writes stored anything'
);

-- The guardian writes (spaces, dots and hyphens are removed)
set local role authenticated;
set local request.jwt.claims = '{"sub": "79900000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select lives_ok(
  $$ select public.save_athlete_identity_number('79900000-0000-4000-8000-0000000000e1', 'AB-12.345 678') $$,
  'guardian G writes the number of e1'
);
select lives_ok(
  $$ select public.save_athlete_identity_number('79900000-0000-4000-8000-0000000000e2', 'A1') $$,
  'guardian G writes a short number for e2'
);

-- Not even the guardian reads the table
select throws_ok(
  'select count(*) from public.athlete_identity_documents',
  '42501', null,
  'guardian G cannot read the table'
);
select throws_ok(
  $$ insert into public.athlete_identity_documents (athlete_id, identity_number_encrypted)
     values ('79900000-0000-4000-8000-0000000000e5', '\x00') $$,
  '42501', null,
  'guardian G cannot insert into the table'
);
select throws_ok(
  $$ select public.athlete_identity_number('79900000-0000-4000-8000-0000000000e1') $$,
  '42501', null,
  'guardian G cannot execute the read function'
);
select throws_ok(
  $$ select public.save_athlete_identity_number_as_service('79900000-0000-4000-8000-0000000000e1', 'ZZ9') $$,
  '42501', null,
  'guardian G cannot execute the server write function'
);

-- The hint: whether it exists and the last three characters, nothing more
select results_eq(
  $$ select * from public.athlete_identity_number_hint('79900000-0000-4000-8000-0000000000e1') $$,
  $$ values (true, '678'::text) $$,
  'the hint of e1 is that it exists and its last three characters'
);
select results_eq(
  $$ select * from public.athlete_identity_number_hint('79900000-0000-4000-8000-0000000000e2') $$,
  $$ values (true, null::text) $$,
  'the hint of a number of three characters or fewer shows no characters'
);
select results_eq(
  $$ select * from public.athlete_identity_number_hint('79900000-0000-4000-8000-0000000000e5') $$,
  $$ values (false, null::text) $$,
  'the hint of an athlete with no number says so'
);

-- Anonymous callers
reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok(
  $$ select public.athlete_identity_number('79900000-0000-4000-8000-0000000000e1') $$,
  '42501', null, 'anon cannot execute the read function'
);
select throws_ok(
  $$ select public.save_athlete_identity_number_as_service('79900000-0000-4000-8000-0000000000e1', 'ZZ9') $$,
  '42501', null, 'anon cannot execute the server write function'
);
select throws_ok(
  $$ select public.save_athlete_identity_number('79900000-0000-4000-8000-0000000000e1', 'ZZ9') $$,
  '42501', null, 'anon cannot execute the guardian write function'
);

-- What is stored is not the number
reset role;
select is(
  (select count(*) from public.athlete_identity_documents),
  2::bigint,
  'two numbers are stored'
);
select is(
  (select position(convert_to('AB12345678', 'UTF8') in identity_number_encrypted)
   from public.athlete_identity_documents where athlete_id = '79900000-0000-4000-8000-0000000000e1'),
  0,
  'the stored value does not contain the number in clear'
);

-- service_role reads in clear and writes
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

select is(
  public.athlete_identity_number('79900000-0000-4000-8000-0000000000e1'),
  'AB12345678',
  'service_role reads the normalized number in clear'
);
select is(
  public.athlete_identity_number('79900000-0000-4000-8000-0000000000e4'),
  null::text,
  'service_role reads null for an athlete with no number'
);
select lives_ok(
  $$ select public.save_athlete_identity_number_as_service('79900000-0000-4000-8000-0000000000e1', 'cd 4455.667') $$,
  'service_role writes the number of e1 with the server function'
);
select is(
  public.athlete_identity_number('79900000-0000-4000-8000-0000000000e1'),
  'cd4455667',
  'the server write replaced the number'
);
select throws_ok(
  $$ select public.save_athlete_identity_number_as_service('79900000-0000-4000-8000-0000000000e5', 'QQ-99.887 766') $$,
  '55000',
  'import_official_results is not in force for the athlete',
  'the server write fails without import_official_results in force'
);
select throws_ok(
  $$ select public.save_athlete_identity_number_as_service('79900000-0000-4000-8000-0000000000e1', 'QQ#99887766') $$,
  '22023', 'identity number is not valid',
  'the server write refuses an invalid number'
);
select ok(
  pg_temp.failure_text('select public.save_athlete_identity_number_as_service($1, $2)', '79900000-0000-4000-8000-0000000000e5', 'QQ-99.887 766') !~ 'QQ|887|766'
    and pg_temp.failure_text('select public.save_athlete_identity_number_as_service($1, $2)', '79900000-0000-4000-8000-0000000000e1', 'QQ#99887766') !~ 'QQ|887|766',
  'the server write errors do not carry the number'
);

reset role;
select is(
  (select count(*) from public.athlete_identity_documents where athlete_id = '79900000-0000-4000-8000-0000000000e1'),
  1::bigint,
  'writing again keeps one row per athlete'
);

-- The hint follows the new number
set local role authenticated;
set local request.jwt.claims = '{"sub": "79900000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select results_eq(
  $$ select * from public.athlete_identity_number_hint('79900000-0000-4000-8000-0000000000e1') $$,
  $$ values (true, '667'::text) $$,
  'the hint follows the new number'
);

-- Withdrawing record_times does not touch the number
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-05 09:00:00-05'
     where id = '79900000-0000-4000-8000-000000000102' $$,
  'guardian G withdraws record_times for e1'
);
reset role;
select is(
  (select count(*) from public.athlete_identity_documents where athlete_id = '79900000-0000-4000-8000-0000000000e1'),
  1::bigint,
  'withdrawing another purpose keeps the number'
);

-- Withdrawing import_official_results deletes the number
set local role authenticated;
set local request.jwt.claims = '{"sub": "79900000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-05 09:00:00-05'
     where id = '79900000-0000-4000-8000-000000000103' $$,
  'guardian G withdraws import_official_results for e2'
);
reset role;
select is(
  (select count(*) from public.athlete_identity_documents where athlete_id = '79900000-0000-4000-8000-0000000000e2'),
  0::bigint,
  'withdrawing the purpose deletes the number'
);
select is(
  (select count(*) from public.athlete_identity_documents where athlete_id = '79900000-0000-4000-8000-0000000000e1'),
  1::bigint,
  'the number of another athlete stays'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "79900000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_athlete_identity_number('79900000-0000-4000-8000-0000000000e2', 'A1') $$,
  '55000', null,
  'after the withdrawal the number cannot be written again'
);
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-05 09:00:00-05'
     where id = '79900000-0000-4000-8000-000000000101' $$,
  'guardian G withdraws import_official_results for e1'
);
reset role;
select is(
  (select count(*) from public.athlete_identity_documents where athlete_id = '79900000-0000-4000-8000-0000000000e1'),
  0::bigint,
  'withdrawing the purpose deletes the number of e1 too'
);

-- Deleting the athlete deletes the number (e3 has no authorization rows,
-- which are evidence and keep an athlete from being deleted)
insert into public.athlete_identity_documents (athlete_id, identity_number_encrypted)
values ('79900000-0000-4000-8000-0000000000e3', extensions.pgp_sym_encrypt('XX123', 'synthetic-other-key'));
select is(
  (select count(*) from public.athlete_identity_documents where athlete_id = '79900000-0000-4000-8000-0000000000e3'),
  1::bigint,
  'the number of e3 is stored'
);
delete from public.athletes where id = '79900000-0000-4000-8000-0000000000e3';
select is(
  (select count(*) from public.athlete_identity_documents where athlete_id = '79900000-0000-4000-8000-0000000000e3'),
  0::bigint,
  'deleting the athlete deletes the number'
);

select * from finish();
rollback;
