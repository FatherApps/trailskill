-- Provenance of imported official results (issue #79): the provider registry
-- keeps to federations of the right country, an import and its confirmation need
-- a manager with the import authorization in force, the rate limit is atomic per
-- athlete, imported results are deduplicated and immutable for every role, a
-- changed value at the source becomes a pending change that is resolved by an
-- explicit choice, only the managers of an athlete with the authorization in
-- force read anything, and no table keeps an identity document, a birth date or
-- the source's key of the athlete. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(95);

-- Users: guardian G (manages e1 and e3, both authorized), guardian H (manages e2,
-- not authorized), stranger S (manages nothing), platform admin P.
insert into auth.users (id, email) values
  ('79a00000-0000-4000-8000-0000000000a1', 'import-guardian-g@example.test'),
  ('79a00000-0000-4000-8000-0000000000a2', 'import-guardian-h@example.test'),
  ('79a00000-0000-4000-8000-0000000000a3', 'import-stranger-s@example.test'),
  ('79a00000-0000-4000-8000-0000000000a4', 'import-admin-p@example.test');
insert into public.platform_admins (user_id) values ('79a00000-0000-4000-8000-0000000000a4');

insert into public.athletes (id, first_name, last_name) values
  ('79a00000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('79a00000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('79a00000-0000-4000-8000-0000000000e3', 'Athlete', 'E3');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('79a00000-0000-4000-8000-0000000000a1', '79a00000-0000-4000-8000-0000000000e1', 'guardian'),
  ('79a00000-0000-4000-8000-0000000000a1', '79a00000-0000-4000-8000-0000000000e3', 'guardian'),
  ('79a00000-0000-4000-8000-0000000000a2', '79a00000-0000-4000-8000-0000000000e2', 'guardian');

-- The import authorization is granted for e1 and e3 only.
insert into public.authorization_texts (id, purpose, version, language, body) values
  ('79a00000-0000-4000-8000-0000000000f1', 'import_official_results', 1, 'en-US', 'Synthetic import text v1');
insert into public.authorizations (athlete_id, purpose, text_id, accepted_at, user_id) values
  ('79a00000-0000-4000-8000-0000000000e1', 'import_official_results', '79a00000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00+00', '79a00000-0000-4000-8000-0000000000a1'),
  ('79a00000-0000-4000-8000-0000000000e3', 'import_official_results', '79a00000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00+00', '79a00000-0000-4000-8000-0000000000a1');

-- Organizations: federation F (country ZZ) with the provider 'zz-test' and a
-- league child L; federation F2 (ZZ) without a source yet; federation F3 of
-- another country (YY); a federation F5 without a country.
insert into public.organizations (id, type, country_code, parent_organization_id, name) values
  ('79a00000-0000-4000-8000-0000000000b1', 'federation', 'ZZ', null, 'Federation Z'),
  ('79a00000-0000-4000-8000-0000000000b2', 'league', 'ZZ', '79a00000-0000-4000-8000-0000000000b1', 'League Z'),
  ('79a00000-0000-4000-8000-0000000000b3', 'federation', 'ZZ', null, 'Federation Z Two'),
  ('79a00000-0000-4000-8000-0000000000b4', 'federation', 'YY', null, 'Federation Y'),
  ('79a00000-0000-4000-8000-0000000000b5', 'federation', null, null, 'Federation Without Country');
insert into public.results_import_sources (organization_id, provider) values
  ('79a00000-0000-4000-8000-0000000000b1', 'zz-test');

-- 1. Schema and privileges.
select is(
  (select count(*) from pg_class
   where relnamespace = 'public'::regnamespace and relrowsecurity
     and relname in ('results_import_sources', 'results_imports', 'results_import_confirmations',
                     'imported_results', 'imported_result_changes', 'results_import_queries')),
  6::bigint,
  'the six tables have row level security enabled'
);
select set_eq(
  $$ select tablename::text from pg_publication_tables
     where pubname = 'powersync'
       and tablename in ('results_import_sources', 'results_imports', 'results_import_confirmations',
                         'imported_results', 'imported_result_changes', 'results_import_queries') $$,
  $$ values ('results_imports'), ('imported_results'), ('imported_result_changes') $$,
  'the powersync publication has the imports, the results and the changes, nothing else'
);
select ok(
  (select bool_and(has_table_privilege('authenticated', t, 'select')
                   and not has_table_privilege('authenticated', t, 'insert, update, delete'))
   from unnest(array['public.results_imports', 'public.results_import_confirmations',
                     'public.imported_results', 'public.imported_result_changes']) t)
    and not has_table_privilege('authenticated', 'public.results_import_queries', 'select, insert, update, delete')
    and not (select bool_or(has_table_privilege('anon', t, 'select, insert, update, delete'))
             from unnest(array['public.results_import_sources', 'public.results_imports',
                               'public.results_import_confirmations', 'public.imported_results',
                               'public.imported_result_changes', 'public.results_import_queries']) t),
  'clients only select the four data tables, nothing on the query state, and anon nothing at all'
);
select ok(
  not has_function_privilege('authenticated', 'public.results_import_claim_query(uuid, uuid, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.record_imported_results(uuid, uuid, uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.record_results_import_confirmation(uuid, uuid, uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_claim_query(uuid, uuid, interval)', 'execute')
    and not has_function_privilege('anon', 'public.record_imported_results(uuid, uuid, uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.record_results_import_confirmation(uuid, uuid, uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.resolve_imported_result_change(uuid, text)', 'execute'),
  'authenticated cannot execute the three service functions, and anon none of the four'
);
select ok(
  has_function_privilege('service_role', 'public.results_import_claim_query(uuid, uuid, interval)', 'execute')
    and has_function_privilege('service_role', 'public.record_imported_results(uuid, uuid, uuid, jsonb)', 'execute')
    and has_function_privilege('service_role', 'public.record_results_import_confirmation(uuid, uuid, uuid, jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.resolve_imported_result_change(uuid, text)', 'execute'),
  'service_role executes the three service functions and authenticated the resolution'
);

-- 2. The registry only holds federations with a country and a provider of that country.
select throws_ok(
  $$ insert into public.results_import_sources (organization_id, provider) values ('79a00000-0000-4000-8000-0000000000b2', 'zz-league') $$,
  '23514', null,
  'a provider on a league is rejected'
);
select throws_ok(
  $$ insert into public.results_import_sources (organization_id, provider) values ('79a00000-0000-4000-8000-0000000000b4', 'zz-other') $$,
  '23514', null,
  'a provider whose country prefix is not the country of the federation is rejected'
);
select throws_ok(
  $$ insert into public.results_import_sources (organization_id, provider) values ('79a00000-0000-4000-8000-0000000000b5', 'zz-other') $$,
  '23514', null,
  'a provider on a federation without a country is rejected'
);

-- 3. The rate limit (service role).
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

select throws_ok(
  $$ select public.results_import_claim_query('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000a3', interval '1 hour') $$,
  '42501', null,
  'a claim by someone who does not manage the athlete is rejected'
);
select throws_ok(
  $$ select public.results_import_claim_query('79a00000-0000-4000-8000-0000000000e2', '79a00000-0000-4000-8000-0000000000a2', interval '1 hour') $$,
  '42501', null,
  'a claim by the manager of an athlete without the import authorization is rejected'
);
select throws_ok(
  $$ select public.results_import_claim_query('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000a1', interval '0 seconds') $$,
  '22023', null,
  'an interval that is not positive is rejected'
);
select is(
  public.results_import_claim_query('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000a1', interval '1 hour'),
  null::timestamptz,
  'the first claim is taken: the source may be queried'
);
do $$
begin
  perform set_config(
    'app.first_query',
    (select last_queried_at::text from public.results_import_queries where athlete_id = '79a00000-0000-4000-8000-0000000000e1'),
    true
  );
end;
$$;
select is(
  public.results_import_claim_query('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000a1', interval '1 hour'),
  current_setting('app.first_query')::timestamptz + interval '1 hour',
  'a second claim inside the interval returns when to retry: the first time plus the interval'
);
select is(
  (select last_queried_at::text from public.results_import_queries where athlete_id = '79a00000-0000-4000-8000-0000000000e1'),
  current_setting('app.first_query'),
  'and leaves the stored time unchanged'
);
select is(
  public.results_import_claim_query('79a00000-0000-4000-8000-0000000000e3', '79a00000-0000-4000-8000-0000000000a1', interval '1 hour'),
  null::timestamptz,
  'another athlete has its own limit: its claim is taken'
);
select is(
  (select last_queried_by from public.results_import_queries where athlete_id = '79a00000-0000-4000-8000-0000000000e1'),
  '79a00000-0000-4000-8000-0000000000a1'::uuid,
  'the claim records who queried'
);

reset role;
update public.results_import_queries set last_queried_at = last_queried_at - interval '2 hours'
  where athlete_id = '79a00000-0000-4000-8000-0000000000e1';
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

select is(
  public.results_import_claim_query('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000a1', interval '1 hour'),
  null::timestamptz,
  'once the interval has passed the claim is taken again'
);

-- 4. Importing (service role). Nothing is written without the authorization.
select throws_ok(
  $$ select public.record_imported_results('79a00000-0000-4000-8000-0000000000e2', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a2',
       '[{"sourceResultKey":"k-201","stroke":"FR","distance":"50m","pool":"SCM","hundredths":3100,"swumOn":"2026-09-01","competition":null}]'::jsonb) $$,
  '42501', 'results import not allowed',
  'an import without the authorization in force is rejected'
);
select throws_ok(
  $$ select public.record_imported_results('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a3',
       '[{"sourceResultKey":"k-101","stroke":"FR","distance":"50m","pool":"SCM","hundredths":3100,"swumOn":"2026-09-01","competition":null}]'::jsonb) $$,
  '42501', 'results import not allowed',
  'and so is an import requested by someone who does not manage the athlete'
);
select throws_ok(
  $$ insert into public.results_imports (athlete_id, organization_id, provider, requested_by)
     values ('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', 'zz-wrong', '79a00000-0000-4000-8000-0000000000a1') $$,
  '42501', 'results import not allowed',
  'a provenance row with a provider other than the registered one is rejected'
);
select throws_ok(
  $$ select public.record_imported_results('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b3', '79a00000-0000-4000-8000-0000000000a1', '[]'::jsonb) $$,
  '22023', null,
  'an organization without a registered source is rejected'
);
select is(
  (select count(*) from public.results_imports) + (select count(*) from public.imported_results),
  0::bigint,
  'nothing was written by the rejected imports'
);

-- Two results, with extra keys that must never be stored: a synthetic document
-- number and birth date. The second has no time.
select is(
  public.record_imported_results('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
    '[{"sourceResultKey":"k-001","stroke":"FR","distance":"50m","pool":"SCM","hundredths":3000,"swumOn":"2026-09-01","competition":"Test Meet","idNumber":"1234567890","birthDate":"2015-03-04"},
      {"sourceResultKey":"k-002","stroke":"BK","distance":"100m","pool":"LCM","hundredths":null,"swumOn":"2026-09-02","competition":null,"idNumber":"1234567890"}]'::jsonb) - 'importId',
  '{"inserted": 2, "duplicates": 0, "changes": 0}'::jsonb,
  'two new results are inserted'
);
select is(
  (select count(*) from public.imported_results where athlete_id = '79a00000-0000-4000-8000-0000000000e1'),
  2::bigint,
  'and stored'
);
select is(
  public.record_imported_results('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
    '[{"sourceResultKey":"k-001","stroke":"FR","distance":"50m","pool":"SCM","hundredths":3000,"swumOn":"2026-09-01","competition":"Test Meet"}]'::jsonb) - 'importId',
  '{"inserted": 0, "duplicates": 1, "changes": 0}'::jsonb,
  'importing the same result again reports a duplicate and inserts nothing'
);
select is(
  (select count(*) from public.imported_results where source_result_key = 'k-001'),
  1::bigint,
  'the result is one row (deduplication)'
);
select is(
  (select hundredths from public.imported_results where source_result_key = 'k-002'),
  null::int,
  'a missing time is stored as null, never 0'
);
select throws_ok(
  $$ select public.record_imported_results('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
       '[{"sourceResultKey":"k-bad","stroke":"FR","distance":"50m","pool":"SCM","hundredths":0,"swumOn":"2026-09-01","competition":null}]'::jsonb) $$,
  '23514', null,
  'a time of 0 hundredths is rejected'
);
select is(
  (select count(*) from public.imported_results where source_result_key = 'k-bad'),
  0::bigint,
  'and nothing of it is stored'
);

-- Immutable for the service role too.
select throws_ok(
  $$ update public.imported_results set hundredths = 1 where source_result_key = 'k-001' $$,
  '42501', null,
  'the service role cannot update an imported result'
);
select throws_ok(
  $$ update public.results_imports set provider = 'zz-test' $$,
  '42501', null,
  'the service role cannot update the provenance of an import'
);

-- A changed value at the source is a pending difference; the result stays.
select is(
  public.record_imported_results('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
    '[{"sourceResultKey":"k-001","stroke":"FR","distance":"50m","pool":"SCM","hundredths":2950,"swumOn":"2026-09-01","competition":"Test Meet"}]'::jsonb) - 'importId',
  '{"inserted": 0, "duplicates": 0, "changes": 1}'::jsonb,
  'a changed value creates a change'
);
select ok(
  (select count(*) = 1 and bool_and(c.status = 'pending' and c.hundredths = 2950 and c.competition = 'Test Meet')
   from public.imported_result_changes c join public.imported_results r on r.id = c.imported_result_id
   where r.source_result_key = 'k-001'),
  'one pending change with the new values'
);
select is(
  (select hundredths from public.imported_results where source_result_key = 'k-001'),
  3000,
  'and the imported result keeps its value'
);
select is(
  public.record_imported_results('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
    '[{"sourceResultKey":"k-001","stroke":"FR","distance":"50m","pool":"SCM","hundredths":2950,"swumOn":"2026-09-01","competition":"Test Meet"}]'::jsonb) - 'importId',
  '{"inserted": 0, "duplicates": 1, "changes": 0}'::jsonb,
  'recording the same changed value again adds nothing'
);
select is(
  (select count(*) from public.imported_result_changes c join public.imported_results r on r.id = c.imported_result_id where r.source_result_key = 'k-001'),
  1::bigint,
  'the changes of the result are still one'
);
select is(
  public.record_imported_results('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
    '[{"sourceResultKey":"k-001","stroke":"FR","distance":"50m","pool":"SCM","hundredths":2900,"swumOn":"2026-09-01","competition":"Test Meet"}]'::jsonb) - 'importId',
  '{"inserted": 0, "duplicates": 0, "changes": 1}'::jsonb,
  'a third, different value creates a change'
);
select ok(
  (select count(*) = 2
          and count(*) filter (where c.status = 'pending') = 1
          and count(*) filter (where c.status = 'pending' and c.hundredths = 2900) = 1
          and count(*) filter (where c.status = 'replaced' and c.hundredths = 2950 and c.resolved_at is not null and c.resolved_by is null) = 1
   from public.imported_result_changes c join public.imported_results r on r.id = c.imported_result_id
   where r.source_result_key = 'k-001'),
  'it replaces the pending one: one pending with the new value and one replaced'
);
select is(
  public.record_imported_results('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
    '[{"sourceResultKey":"k-002","stroke":"BK","distance":"100m","pool":"LCM","hundredths":3500,"swumOn":"2026-09-02","competition":null}]'::jsonb) - 'importId',
  '{"inserted": 0, "duplicates": 0, "changes": 1}'::jsonb,
  'a time that appears where there was none creates a change too'
);

-- The athlete e3 has one result, imported while authorized.
select is(
  public.record_imported_results('79a00000-0000-4000-8000-0000000000e3', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
    '[{"sourceResultKey":"k-301","stroke":"BR","distance":"200m","pool":"SCM","hundredths":24000,"swumOn":"2026-09-03","competition":null}]'::jsonb) - 'importId',
  '{"inserted": 1, "duplicates": 0, "changes": 0}'::jsonb,
  'another athlete imports its own result'
);

-- The confirmation: extra keys of the evidence are ignored, also inside an affiliation.
select ok(
  public.record_results_import_confirmation('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
    '{"name":"Candidate Name E1","affiliations":[{"club":"Club A","league":"League A","years":[2025,2026],"idNumber":"1234567890","birthDate":"2014-02-03"}],"resultCount":2,"idNumber":"1234567890","birthDate":"2015-03-04"}'::jsonb) is not null,
  'a confirmation is recorded'
);
select is(
  (select affiliations from public.results_import_confirmations where athlete_id = '79a00000-0000-4000-8000-0000000000e1'),
  '[{"club":"Club A","league":"League A","years":[2025,2026]}]'::jsonb,
  'a stored affiliation is exactly club, league and years'
);
select is_empty(
  $$ select 1 from public.results_import_confirmations t where row_to_json(t)::text ~ '1234567890|2014-02-03|2015-03-04' $$,
  'no key nested in an affiliation is stored'
);
select throws_ok(
  $$ select public.record_results_import_confirmation('79a00000-0000-4000-8000-0000000000e3', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
       '{"name":"Candidate Name E3","affiliations":[{"club":"Club A","league":null,"years":"2024-2026"}],"resultCount":1}'::jsonb) $$,
  '22023', 'the evidence needs a name, affiliations and a result count',
  'years that are not a list of integers are rejected'
);
select throws_ok(
  $$ select public.record_results_import_confirmation('79a00000-0000-4000-8000-0000000000e3', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
       '{"name":"Candidate Name E3","affiliations":[],"resultCount":-1}'::jsonb) $$,
  '22023', 'the evidence needs a name, affiliations and a result count',
  'a negative result count is rejected'
);
select throws_ok(
  $$ select public.record_results_import_confirmation('79a00000-0000-4000-8000-0000000000e3', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
       '{"name":"","affiliations":[],"resultCount":1}'::jsonb) $$,
  '22023', 'the evidence needs a name, affiliations and a result count',
  'an empty name is rejected'
);
select throws_ok(
  $$ select public.record_results_import_confirmation('79a00000-0000-4000-8000-0000000000e2', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a2',
       '{"name":"Candidate Name E2","affiliations":[],"resultCount":0}'::jsonb) $$,
  '42501', 'results import not allowed',
  'a confirmation without the authorization in force is rejected'
);
select throws_ok(
  $$ update public.results_import_confirmations set result_count = 3 $$,
  '42501', null,
  'a confirmation cannot be updated'
);

-- 5. Immutability and provenance, seen by the owner.
reset role;

select throws_ok(
  $$ update public.imported_results set hundredths = 1 where source_result_key = 'k-001' $$,
  '42501', null,
  'not even the owner updates an imported result'
);
select throws_ok(
  $$ update public.imported_result_changes set hundredths = 1 where status = 'pending' $$,
  '42501', null,
  'a pending change cannot change its values'
);
select throws_ok(
  $$ update public.imported_result_changes set status = 'pending', resolved_at = null where status = 'replaced' $$,
  '42501', null,
  'a resolved change cannot go back'
);
select is_empty(
  $$ select r.id from public.imported_results r
     left join public.results_imports i on i.id = r.import_id
     where i.id is null or i.provider <> r.provider or i.athlete_id <> r.athlete_id
        or i.organization_id is null or i.requested_by is null or i.requested_at is null $$,
  'every imported row has the provenance of an import of the same athlete and provider'
);
select ok(
  exists (
    select 1 from public.imported_results r join public.results_imports i on i.id = r.import_id
    where r.source_result_key = 'k-001' and i.provider = 'zz-test'
      and i.organization_id = '79a00000-0000-4000-8000-0000000000b1'
      and i.requested_by = '79a00000-0000-4000-8000-0000000000a1'
  ),
  'the provenance names the provider, the organization and who requested the import'
);

-- 6. Personal data: no identity column, and nothing of the extra keys is kept.
select is_empty(
  $$ select table_name, column_name from information_schema.columns
     where table_schema = 'public'
       and table_name in ('results_import_sources', 'results_imports', 'results_import_confirmations',
                          'imported_results', 'imported_result_changes', 'results_import_queries')
       and column_name ~* '(document|identif|birth|cedula|number|source_athlete)' $$,
  'no column of a results-import table is an identity document, a birth date or the source key of the athlete'
);
select is_empty(
  $$ select 1 from public.results_imports t where row_to_json(t)::text ~ '1234567890|2015-03-04'
     union all select 1 from public.imported_results t where row_to_json(t)::text ~ '1234567890|2015-03-04'
     union all select 1 from public.imported_result_changes t where row_to_json(t)::text ~ '1234567890|2015-03-04'
     union all select 1 from public.results_import_confirmations t where row_to_json(t)::text ~ '1234567890|2015-03-04'
     union all select 1 from public.results_import_queries t where row_to_json(t)::text ~ '1234567890|2015-03-04' $$,
  'a payload with a document number and a birth date leaves no trace in any table'
);

-- The pending changes the next sections resolve: k-001 (2900) and k-002 (3500).
do $$
begin
  perform set_config('app.change_use_new', (
    select c.id::text from public.imported_result_changes c join public.imported_results r on r.id = c.imported_result_id
    where r.source_result_key = 'k-001' and c.status = 'pending'), true);
  perform set_config('app.change_keep', (
    select c.id::text from public.imported_result_changes c join public.imported_results r on r.id = c.imported_result_id
    where r.source_result_key = 'k-002' and c.status = 'pending'), true);
end;
$$;

-- 7. Visibility: guardian G.
set local role authenticated;
set local request.jwt.claims = '{"sub": "79a00000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select is(
  (select count(*) from public.imported_results where athlete_id = '79a00000-0000-4000-8000-0000000000e1'),
  2::bigint,
  'G sees the imported results of e1'
);
select ok(
  (select count(*) from public.results_imports where athlete_id = '79a00000-0000-4000-8000-0000000000e1') >= 3,
  'G sees the imports of e1'
);
select is(
  (select count(*) from public.imported_result_changes where athlete_id = '79a00000-0000-4000-8000-0000000000e1'),
  3::bigint,
  'G sees the changes of e1'
);
select is(
  (select count(*) from public.results_import_confirmations where athlete_id = '79a00000-0000-4000-8000-0000000000e1'),
  1::bigint,
  'G sees the confirmation of e1'
);
select is(
  (select count(*) from public.imported_results where athlete_id = '79a00000-0000-4000-8000-0000000000e3'),
  1::bigint,
  'G sees the imported result of e3, authorized as well'
);
select ok(
  (select count(*) from public.results_import_sources) >= 1,
  'G reads the registry'
);
select throws_ok(
  $$ select * from public.results_import_queries $$,
  '42501', null,
  'the rate limit state is not readable by clients'
);
select throws_ok(
  $$ insert into public.results_import_sources (organization_id, provider) values ('79a00000-0000-4000-8000-0000000000b3', 'zz-other') $$,
  '42501', null,
  'G cannot write the registry'
);

-- Clients cannot write anything else, and imports cannot be launched from a client.
select throws_ok(
  $$ insert into public.imported_results (import_id, athlete_id, provider, source_result_key, stroke, distance, pool, swum_on)
     select id, athlete_id, provider, 'k-forged', 'FR', '50m', 'SCM', '2026-09-01' from public.results_imports limit 1 $$,
  '42501', null,
  'authenticated cannot insert an imported result'
);
select throws_ok(
  $$ update public.imported_results set hundredths = 1 $$,
  '42501', null,
  'authenticated cannot update an imported result'
);
select throws_ok(
  $$ delete from public.imported_results $$,
  '42501', null,
  'authenticated cannot delete an imported result'
);
select throws_ok(
  $$ update public.results_imports set provider = 'zz-test' $$,
  '42501', null,
  'authenticated cannot update an import'
);
select throws_ok(
  $$ insert into public.results_imports (athlete_id, organization_id, provider, requested_by)
     values ('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', 'zz-test', '79a00000-0000-4000-8000-0000000000a1') $$,
  '42501', null,
  'authenticated cannot launch an import by inserting it'
);
select throws_ok(
  $$ update public.imported_result_changes set status = 'used_new', resolved_by = '79a00000-0000-4000-8000-0000000000a1', resolved_at = now() $$,
  '42501', null,
  'authenticated cannot resolve a change by updating it'
);
select throws_ok(
  $$ select public.results_import_claim_query('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000a1', interval '1 hour') $$,
  '42501', null,
  'authenticated cannot call the rate limit function'
);
select throws_ok(
  $$ select public.record_imported_results('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1', '[]'::jsonb) $$,
  '42501', null,
  'authenticated cannot record imported results'
);
select throws_ok(
  $$ select public.record_results_import_confirmation('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
       '{"name":"Candidate Name E1","affiliations":[],"resultCount":0}'::jsonb) $$,
  '42501', null,
  'authenticated cannot record a confirmation'
);

-- 8. Resolving a change.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "79a00000-0000-4000-8000-0000000000a3", "role": "authenticated"}';

select throws_ok(
  format($$ select public.resolve_imported_result_change(%L, 'use_new') $$, current_setting('app.change_use_new')),
  '42501', 'results import not allowed',
  'a stranger cannot resolve a change'
);

set local request.jwt.claims = '{"sub": "79a00000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

select throws_ok(
  format($$ select public.resolve_imported_result_change(%L, 'use_new') $$, current_setting('app.change_use_new')),
  '42501', 'results import not allowed',
  'nor the manager of another athlete'
);

set local request.jwt.claims = '{"sub": "79a00000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  format($$ select public.resolve_imported_result_change(%L, 'merge') $$, current_setting('app.change_use_new')),
  '22023', null,
  'a choice other than use_new or keep_current is rejected'
);
select is(
  public.resolve_imported_result_change(current_setting('app.change_keep')::uuid, 'keep_current'),
  (select id from public.imported_results where source_result_key = 'k-002'),
  'keeping the current value returns the id of the imported result'
);
select ok(
  (select c.status = 'kept_current'
          and c.resolved_by = '79a00000-0000-4000-8000-0000000000a1'
          and c.resolved_at is not null
   from public.imported_result_changes c where c.id = current_setting('app.change_keep')::uuid),
  'and the change records the choice, who made it and when'
);
select is(
  (select count(*) from public.imported_results where source_result_key = 'k-002'),
  1::bigint,
  'keeping adds no revision'
);
select throws_ok(
  format($$ select public.resolve_imported_result_change(%L, 'keep_current') $$, current_setting('app.change_keep')),
  '55000', null,
  'a change that is resolved cannot be resolved again'
);
do $$
begin
  perform set_config(
    'app.new_revision',
    public.resolve_imported_result_change(current_setting('app.change_use_new')::uuid, 'use_new')::text,
    true
  );
end;
$$;
select ok(
  exists (
    select 1
    from public.imported_results n join public.imported_results o on o.id = n.supersedes_id
    where n.id = current_setting('app.new_revision')::uuid
      and n.source_result_key = 'k-001' and n.revision = 2 and o.revision = 1
      and n.hundredths = 2900 and o.hundredths = 3000
      and n.import_id = (select c.import_id from public.imported_result_changes c where c.id = current_setting('app.change_use_new')::uuid)
  ),
  'using the new value adds revision 2 that supersedes revision 1, with the values of the change'
);
select ok(
  (select c.status = 'used_new'
          and c.resolved_by = '79a00000-0000-4000-8000-0000000000a1'
          and c.resolved_at is not null
   from public.imported_result_changes c where c.id = current_setting('app.change_use_new')::uuid),
  'and the change records the choice, who made it and when'
);
select is(
  (select hundredths from public.imported_results where source_result_key = 'k-001' and revision = 1),
  3000,
  'revision 1 keeps its value'
);

-- The source reports the values of revision 2: nothing new.
reset role;
select is(
  public.record_imported_results('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
    '[{"sourceResultKey":"k-001","stroke":"FR","distance":"50m","pool":"SCM","hundredths":2900,"swumOn":"2026-09-01","competition":"Test Meet"}]'::jsonb) - 'importId',
  '{"inserted": 0, "duplicates": 1, "changes": 0}'::jsonb,
  'recording the values of revision 2 counts as a duplicate'
);
select is(
  public.record_imported_results('79a00000-0000-4000-8000-0000000000e1', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
    '[{"sourceResultKey":"k-002","stroke":"BK","distance":"100m","pool":"LCM","hundredths":3500,"swumOn":"2026-09-02","competition":null}]'::jsonb) - 'importId',
  '{"inserted": 0, "duplicates": 1, "changes": 0}'::jsonb,
  'a difference the guardian chose to keep is not proposed again'
);
select is(
  (select count(*) from public.imported_results where source_result_key = 'k-001'),
  2::bigint,
  'and no revision is added'
);

-- 9. Others see nothing.
set local role authenticated;
set local request.jwt.claims = '{"sub": "79a00000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(
  (select count(*) from public.imported_results) + (select count(*) from public.results_imports)
    + (select count(*) from public.imported_result_changes) + (select count(*) from public.results_import_confirmations),
  0::bigint,
  'a stranger sees no result, import, change or confirmation'
);

set local request.jwt.claims = '{"sub": "79a00000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(
  (select count(*) from public.imported_results) + (select count(*) from public.results_imports)
    + (select count(*) from public.imported_result_changes) + (select count(*) from public.results_import_confirmations),
  0::bigint,
  'the manager of another athlete sees none of them'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok(
  $$ select * from public.imported_results $$,
  '42501', null,
  'anon cannot read imported results'
);
select throws_ok(
  $$ select * from public.imported_result_changes $$,
  '42501', null,
  'anon cannot read changes'
);

-- 10. A withdrawal closes everything for the athlete.
reset role;
update public.authorizations set withdrawn_at = '2026-10-20 10:00:00+00'
  where athlete_id = '79a00000-0000-4000-8000-0000000000e3' and purpose = 'import_official_results';

set local role authenticated;
set local request.jwt.claims = '{"sub": "79a00000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(
  (select count(*) from public.imported_results where athlete_id = '79a00000-0000-4000-8000-0000000000e3')
    + (select count(*) from public.results_imports where athlete_id = '79a00000-0000-4000-8000-0000000000e3'),
  0::bigint,
  'after the withdrawal G sees nothing of e3'
);
select is(
  (select count(*) from public.imported_results where athlete_id = '79a00000-0000-4000-8000-0000000000e1'),
  3::bigint,
  'and still sees the three rows of e1'
);

reset role;
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';
select throws_ok(
  $$ select public.record_imported_results('79a00000-0000-4000-8000-0000000000e3', '79a00000-0000-4000-8000-0000000000b1', '79a00000-0000-4000-8000-0000000000a1',
       '[{"sourceResultKey":"k-302","stroke":"FR","distance":"50m","pool":"SCM","hundredths":3100,"swumOn":"2026-09-04","competition":null}]'::jsonb) $$,
  '42501', 'results import not allowed',
  'after a withdrawal an import is rejected'
);
select throws_ok(
  $$ select public.results_import_claim_query('79a00000-0000-4000-8000-0000000000e3', '79a00000-0000-4000-8000-0000000000a1', interval '0.001 seconds') $$,
  '42501', null,
  'and so is a claim'
);
select is(
  (select count(*) from public.imported_results where athlete_id = '79a00000-0000-4000-8000-0000000000e3'),
  1::bigint,
  'and nothing new was written for e3'
);

-- 11. Platform admin writes the registry.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "79a00000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.results_import_sources (organization_id, provider) values ('79a00000-0000-4000-8000-0000000000b3', 'zz-other') $$,
  'a platform admin registers a provider for a federation'
);

select * from finish();
rollback;
