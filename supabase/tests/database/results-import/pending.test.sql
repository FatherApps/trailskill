-- Pending source entries of the official results import (issue #81): what a
-- search found waits on the server, encrypted, until it is confirmed or
-- expires. Nobody with a session reads or executes anything here, an entry is
-- good for one use by the user and athlete that created it, expired entries
-- never come back and are purged, withdrawing import_official_results (or
-- deleting the athlete) removes them, and no error carries the key or the
-- payload. The test creates its own Vault key inside the transaction.
-- All users, athletes and keys here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

-- Users: guardian G (manages e1 and e2, both authorized), guardian H (manages e3,
-- not authorized), stranger S (manages nothing).
insert into auth.users (id, email) values
  ('81a00000-0000-4000-8000-0000000000a1', 'pending-guardian-g@example.test'),
  ('81a00000-0000-4000-8000-0000000000a2', 'pending-guardian-h@example.test'),
  ('81a00000-0000-4000-8000-0000000000a3', 'pending-stranger-s@example.test');
insert into public.athletes (id, first_name, last_name) values
  ('81a00000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('81a00000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('81a00000-0000-4000-8000-0000000000e3', 'Athlete', 'E3');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1', 'guardian'),
  ('81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e2', 'guardian'),
  ('81a00000-0000-4000-8000-0000000000a2', '81a00000-0000-4000-8000-0000000000e3', 'guardian');
insert into public.authorization_texts (id, purpose, version, language, body) values
  ('81a00000-0000-4000-8000-0000000000f1', 'import_official_results', 1, 'en-US', 'Synthetic import text v1');
insert into public.organizations (id, type, country_code, name) values
  ('81a00000-0000-4000-8000-0000000000b1', 'federation', 'ZZ', 'Federation Z');
insert into public.results_import_sources (organization_id, provider) values
  ('81a00000-0000-4000-8000-0000000000b1', 'zz-test');

set local role authenticated;
set local request.jwt.claims = '{"sub": "81a00000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
insert into public.authorizations (id, athlete_id, purpose, text_id, accepted_at) values
  ('81a00000-0000-4000-8000-000000000101', '81a00000-0000-4000-8000-0000000000e1', 'import_official_results', '81a00000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00-05'),
  ('81a00000-0000-4000-8000-000000000102', '81a00000-0000-4000-8000-0000000000e2', 'import_official_results', '81a00000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00-05');
reset role;

-- The text of what failed: message, detail, hint and the full context, with
-- the values passed as parameters like PostgREST does.
create function pg_temp.put_failure(athlete uuid, reference text, payload jsonb, ttl interval) returns text language plpgsql as $$
declare m text; d text; h text; c text;
begin
  perform public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', athlete, '81a00000-0000-4000-8000-0000000000b1', 'zz-test', reference, payload, ttl);
  return 'no error';
exception when others then
  get stacked diagnostics m = message_text, d = pg_exception_detail, h = pg_exception_hint, c = pg_exception_context;
  return concat_ws(' | ', m, d, h, c);
end;
$$;

-- 1. Schema and privileges.
select has_table('public', 'results_import_pending', 'results_import_pending exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.results_import_pending'::regclass)
    and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'results_import_pending'),
  'row level security is on and there is no policy'
);
select ok(
  not has_table_privilege('authenticated', 'public.results_import_pending', 'select, insert, update, delete')
    and not has_table_privilege('anon', 'public.results_import_pending', 'select, insert, update, delete'),
  'clients and anon have no privilege on the table'
);
select is_empty(
  $$ select 1 from pg_publication_tables where pubname = 'powersync' and tablename = 'results_import_pending' $$,
  'the table is not in the powersync publication'
);
select ok(
  has_function_privilege('service_role', 'public.results_import_pending_put(text, uuid, uuid, uuid, text, text, jsonb, interval, uuid, timestamptz)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_pending_take(uuid, text, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_pending_put(text, uuid, uuid, uuid, text, text, jsonb, interval, uuid, timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_pending_take(uuid, text, uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_pending_put(text, uuid, uuid, uuid, text, text, jsonb, interval, uuid, timestamptz)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_pending_take(uuid, text, uuid, uuid)', 'execute')
    and not has_function_privilege('public', 'public.results_import_pending_take(uuid, text, uuid, uuid)', 'execute'),
  'only service_role executes put and take'
);
select is(
  (select count(*) from pg_proc
   where oid in ('public.results_import_pending_put(text, uuid, uuid, uuid, text, text, jsonb, interval, uuid, timestamptz)'::regprocedure,
                 'public.results_import_pending_take(uuid, text, uuid, uuid)'::regprocedure,
                 'public.results_import_pending_purge_on_withdrawal()'::regprocedure)
     and prosecdef and coalesce(proconfig, '{}') @> array['search_path=""']),
  3::bigint,
  'the functions are security definer with an empty search_path'
);

-- The only column that holds the source's reference is reference_encrypted, a bytea; the rest
-- cannot hold it in the clear, and there is no grant or policy for anon or authenticated.
select columns_are(
  'public', 'results_import_pending',
  array['id', 'kind', 'requested_by', 'athlete_id', 'organization_id', 'provider', 'reference_encrypted', 'payload', 'created_at', 'expires_at'],
  'the table has exactly these columns'
);
select col_type_is('public', 'results_import_pending', 'reference_encrypted', 'bytea', 'the reference is stored as encrypted bytea');
select is(
  (select array_agg(column_name::text order by column_name) from information_schema.columns
   where table_schema = 'public' and table_name = 'results_import_pending' and data_type in ('text', 'character varying', 'jsonb')),
  array['kind', 'payload', 'provider'],
  'the only text columns are kind, provider and the payload, which holds no reference or number'
);
select is_empty(
  $$ select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'results_import_pending' and grantee in ('anon', 'authenticated', 'PUBLIC')
     union all select 1 from information_schema.role_column_grants
     where table_schema = 'public' and table_name = 'results_import_pending' and grantee in ('anon', 'authenticated', 'PUBLIC')
     union all select 1 from pg_policies
     where schemaname = 'public' and tablename = 'results_import_pending' $$,
  'no table grant, column grant or policy exists for anon, authenticated or public'
);

-- 2. Without the Vault secret nothing is stored, and the error carries nothing.
delete from vault.secrets where name = 'athlete_identity_key';
select throws_ok(
  $$ select public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
       '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '15 minutes') $$,
  'TS001',
  'athlete identity key is not configured',
  'without the Vault secret put fails with a clear error'
);
select ok(
  pg_temp.put_failure('81a00000-0000-4000-8000-0000000000e1', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '15 minutes') !~ 'REF-SECRET|123|Payload',
  'the missing key error does not carry the reference or the payload'
);
select is((select count(*) from public.results_import_pending), 0::bigint, 'nothing was stored without the key');
select throws_ok(
  $$ select * from public.results_import_pending_take('81a00000-0000-4000-8000-000000000999', 'search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1') $$,
  'TS001',
  'athlete identity key is not configured',
  'without the Vault secret take fails with a clear error, before deleting anything'
);
do $$ begin perform vault.create_secret('synthetic-test-key-not-for-production-0123456789', 'athlete_identity_key'); end $$;

-- 3. Put: who may store, and what is stored.
select throws_ok(
  $$ select public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a3', '81a00000-0000-4000-8000-0000000000e1',
       '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '15 minutes') $$,
  '42501', 'results import not allowed', 'a user who does not manage the athlete cannot store'
);
select throws_ok(
  $$ select public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e3',
       '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '15 minutes') $$,
  '42501', 'results import not allowed', 'a user cannot store for an athlete managed by someone else'
);
select throws_ok(
  $$ select public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a2', '81a00000-0000-4000-8000-0000000000e3',
       '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '15 minutes') $$,
  '42501', 'results import not allowed', 'a manager cannot store while import_official_results is not in force'
);
select throws_ok(
  $$ select public.results_import_pending_put('search', null, '81a00000-0000-4000-8000-0000000000e1',
       '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '15 minutes') $$,
  '42501', 'results import not allowed', 'a missing user cannot store'
);
select is((select count(*) from public.results_import_pending), 0::bigint, 'the refused calls stored nothing');

select throws_ok(
  $$ select public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
       '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '0') $$,
  '22023', 'the pending entry is not valid', 'a zero lifetime is refused'
);
select throws_ok(
  $$ select public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
       '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '15 minutes 1 second') $$,
  '22023', 'the pending entry is not valid', 'a lifetime over 15 minutes is refused'
);
select throws_ok(
  $$ select public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
       '81a00000-0000-4000-8000-0000000000b1', 'zz-test', '', '{"name": "Payload Name"}', interval '15 minutes') $$,
  '22023', 'the pending entry is not valid', 'an empty reference is refused'
);
select throws_ok(
  $$ select public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
       '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-SECRET-123', '["not an object"]', interval '15 minutes') $$,
  '22023', 'the pending entry is not valid', 'a payload that is not an object is refused'
);
select ok(
  pg_temp.put_failure('81a00000-0000-4000-8000-0000000000e1', 'REF-SECRET-123', '["Payload Name"]', interval '15 minutes') !~ 'REF-SECRET|123|Payload',
  'a refused entry does not echo the reference or the payload'
);

create temp table ids (name text primary key, id uuid);
grant all on ids to public;
insert into ids select 'e1', public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
  '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '15 minutes');
select isnt((select id from ids where name = 'e1'), null, 'a manager with the purpose in force stores an entry and gets its id');
select is((select count(*) from public.results_import_pending), 1::bigint, 'one row was stored');
select ok(
  (select expires_at > clock_timestamp() + interval '14 minutes' and expires_at <= clock_timestamp() + interval '15 minutes'
   from public.results_import_pending),
  'it expires 15 minutes after it was stored'
);
select ok(
  (select position('REF-SECRET-123'::bytea in reference_encrypted) = 0
          and reference_encrypted::text !~ 'REF-SECRET'
          and row_to_json(p)::text !~ 'REF-SECRET'
   from public.results_import_pending p),
  'the reference is not stored in the clear'
);
select is(
  (select extensions.pgp_sym_decrypt(reference_encrypted, 'synthetic-test-key-not-for-production-0123456789') from public.results_import_pending),
  'REF-SECRET-123',
  'it is encrypted with the Vault key'
);

-- 4. Clients cannot read or execute.
set local role authenticated;
set local request.jwt.claims = '{"sub": "81a00000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok($$ select * from public.results_import_pending $$, '42501', null, 'a guardian cannot read the table');
select throws_ok(
  $$ select * from public.results_import_pending_take((select id from ids where name = 'e1'), 'search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1') $$,
  '42501', null, 'a guardian cannot execute take'
);
reset role;

-- 5. Take: only the user, athlete and kind that stored it, once.
select is_empty(
  $$ select * from public.results_import_pending_take((select id from ids where name = 'e1'), 'search', '81a00000-0000-4000-8000-0000000000a3', '81a00000-0000-4000-8000-0000000000e1') $$,
  'another user does not get the entry'
);
select is_empty(
  $$ select * from public.results_import_pending_take((select id from ids where name = 'e1'), 'search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e2') $$,
  'another athlete does not get the entry'
);
select is_empty(
  $$ select * from public.results_import_pending_take((select id from ids where name = 'e1'), 'results', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1') $$,
  'another kind does not get the entry'
);
select is_empty(
  $$ select * from public.results_import_pending_take('81a00000-0000-4000-8000-000000000999', 'search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1') $$,
  'an id that was never issued gets nothing'
);
select is((select count(*) from public.results_import_pending), 1::bigint, 'the refused takes did not consume the entry');
select results_eq(
  $$ select organization_id, provider, reference, payload, expires_at is not null from public.results_import_pending_take(
       (select id from ids where name = 'e1'), 'search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1') $$,
  $$ values ('81a00000-0000-4000-8000-0000000000b1'::uuid, 'zz-test', 'REF-SECRET-123', '{"name": "Payload Name"}'::jsonb, true) $$,
  'the right user, athlete and kind get the organization, the provider, the decrypted reference, the payload and when it expires'
);
select is((select count(*) from public.results_import_pending), 0::bigint, 'after confirming no row is left');
select is_empty(
  $$ select * from public.results_import_pending_take((select id from ids where name = 'e1'), 'search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1') $$,
  'an entry can be taken only once'
);

-- 6. Restore: the same id works again after a failed confirmation.
select is(
  public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
    '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '15 minutes',
    (select id from ids where name = 'e1')),
  (select id from ids where name = 'e1'),
  'an entry can be put back under its old id'
);
select is(
  (select count(*) from public.results_import_pending_take((select id from ids where name = 'e1'), 'search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1')),
  1::bigint,
  'and then it is taken again'
);

-- 6b. A restored entry never lives past the instant it was due to expire, and cannot be restored once past.
select throws_ok(
  $$ select public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
       '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '15 minutes',
       '81a00000-0000-4000-8000-0000000000c1', now() - interval '1 second') $$,
  '22023', 'the pending entry is not valid', 'an entry whose time already ran out is not put back'
);
select public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
  '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '15 minutes',
  '81a00000-0000-4000-8000-0000000000c2', clock_timestamp() + interval '1 minute');
select ok(
  (select expires_at <= now() + interval '1 minute 1 second' from public.results_import_pending where id = '81a00000-0000-4000-8000-0000000000c2'),
  'a restored entry expires no later than the instant it had'
);
select public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
  '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '1 minute',
  '81a00000-0000-4000-8000-0000000000c3', clock_timestamp() + interval '1 hour');
select ok(
  (select expires_at <= now() + interval '1 minute 1 second' from public.results_import_pending where id = '81a00000-0000-4000-8000-0000000000c3'),
  'and no later than the time the caller asked for either'
);
delete from public.results_import_pending where id in ('81a00000-0000-4000-8000-0000000000c2', '81a00000-0000-4000-8000-0000000000c3');

-- 6c. Keeping the identity number is one step: saves when empty, true for the same, false (and untouched) for another.
select is(public.results_import_keep_identity_number('81a00000-0000-4000-8000-0000000000e1', 'ZZ-111.222'), true, 'an athlete without a number gets the one the source returned');
select is(public.results_import_keep_identity_number('81a00000-0000-4000-8000-0000000000e1', 'zz111222'), false, 'a different number is a conflict (case differs)');
select is(public.results_import_keep_identity_number('81a00000-0000-4000-8000-0000000000e1', ' ZZ 111.222 '), true, 'the same number with other formatting is not a conflict');
select is(app.read_athlete_identity_number('81a00000-0000-4000-8000-0000000000e1'), 'ZZ111222', 'the conflicting number replaced nothing');
select throws_ok(
  $$ select public.results_import_keep_identity_number('81a00000-0000-4000-8000-0000000000e3', 'ZZ111222') $$,
  '55000', 'import_official_results is not in force for the athlete', 'without the authorization nothing is kept'
);
select ok(
  has_function_privilege('service_role', 'public.results_import_keep_identity_number(uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_keep_identity_number(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_keep_identity_number(uuid, text)', 'execute'),
  'only service_role executes keep_identity_number'
);

-- 7. Expiry.
insert into ids select 'old', public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
  '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-OLD', '{"name": "Old"}', interval '15 minutes');
update public.results_import_pending set expires_at = clock_timestamp() - interval '1 second' where id = (select id from ids where name = 'old');
select is_empty(
  $$ select * from public.results_import_pending_take((select id from ids where name = 'old'), 'search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1') $$,
  'an expired entry is not given'
);
select is((select count(*) from public.results_import_pending), 0::bigint, 'after expiring no row is left (take purges it)');

insert into ids select 'stale', public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
  '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-STALE', '{"name": "Stale"}', interval '15 minutes');
update public.results_import_pending set expires_at = clock_timestamp() - interval '1 second';
select isnt(
  public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e2',
    '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-NEW', '{"name": "New"}', interval '15 minutes'),
  null,
  'a new entry is stored'
);
select is(
  (select count(*) from public.results_import_pending where id = (select id from ids where name = 'stale')),
  0::bigint,
  'storing purges the entries that expired, without a job'
);
select is((select count(*) from public.results_import_pending), 1::bigint, 'only the new entry is left');

-- 8. Withdrawing import_official_results removes the athlete's entries, not others'.
select public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
  '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-E1', '{"name": "E1"}', interval '15 minutes');
select is((select count(*) from public.results_import_pending), 2::bigint, 'entries exist for e1 and e2');
set local role authenticated;
set local request.jwt.claims = '{"sub": "81a00000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ update public.authorizations set withdrawn_at = '2026-10-05 09:00:00-05' where id = '81a00000-0000-4000-8000-000000000101' $$,
  'guardian G withdraws import_official_results for e1'
);
reset role;
select is(
  (select count(*) from public.results_import_pending where athlete_id = '81a00000-0000-4000-8000-0000000000e1'),
  0::bigint,
  'withdrawing the purpose removes the pending entries of that athlete'
);
select is(
  (select count(*) from public.results_import_pending where athlete_id = '81a00000-0000-4000-8000-0000000000e2'),
  1::bigint,
  'the entries of other athletes stay'
);
select throws_ok(
  $$ select public.results_import_pending_put('search', '81a00000-0000-4000-8000-0000000000a1', '81a00000-0000-4000-8000-0000000000e1',
       '81a00000-0000-4000-8000-0000000000b1', 'zz-test', 'REF-E1', '{"name": "E1"}', interval '15 minutes') $$,
  '42501', 'results import not allowed', 'after the withdrawal nothing can be stored for that athlete'
);

-- 9. Deleting the athlete or the organization deletes the entries.
-- (An athlete with authorizations cannot be deleted in a test, so the cascade is read from the constraints.)
select is(
  (select count(*) from pg_constraint
   where conrelid = 'public.results_import_pending'::regclass and contype = 'f' and confdeltype = 'c'),
  3::bigint,
  'deleting the athlete, the organization or the user deletes the entries'
);

-- 10. No error carries the reference or the payload.
select ok(
  pg_temp.put_failure('81a00000-0000-4000-8000-0000000000e3', 'REF-SECRET-123', '{"name": "Payload Name"}', interval '15 minutes') !~ 'REF-SECRET|123|Payload',
  'the refusal for a stranger athlete does not carry the reference or the payload'
);
select is_empty(
  $$ select 1 from public.results_import_pending p where row_to_json(p)::text ~ 'REF-|Payload'
     union all select 1 from public.results_import_pending p where p.reference_encrypted::text ~ 'REF' $$,
  'no row holds a reference in the clear'
);

select * from finish();
rollback;
