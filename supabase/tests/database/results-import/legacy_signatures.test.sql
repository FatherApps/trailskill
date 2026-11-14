-- Expand/contract of issue #896: the migration adds the per-provider signatures and keeps the old
-- ones working, because the Edge Function in production calls them until the new one is delivered.
-- Here the OLD signatures run against the new schema. The provider they use is derived from the
-- registry (the one federation source), never named in code. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

insert into auth.users (id, email) values
  ('89700000-0000-4000-8000-0000000000a1', 'legacy-guardian@example.test'),
  ('89700000-0000-4000-8000-0000000000a3', 'legacy-stranger@example.test');
insert into public.athletes (id, first_name, last_name) values
  ('89700000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('89700000-0000-4000-8000-0000000000e2', 'Athlete', 'E2');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('89700000-0000-4000-8000-0000000000a1', '89700000-0000-4000-8000-0000000000e1', 'guardian'),
  ('89700000-0000-4000-8000-0000000000a1', '89700000-0000-4000-8000-0000000000e2', 'guardian');
insert into public.authorization_texts (id, purpose, version, language, body) values
  ('89700000-0000-4000-8000-0000000000f1', 'import_official_results', 1, 'en-US', 'Synthetic import text v1');
-- e1 may import; e2 has no authorization.
insert into public.authorizations (athlete_id, purpose, text_id, accepted_at, user_id) values
  ('89700000-0000-4000-8000-0000000000e1', 'import_official_results', '89700000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00+00', '89700000-0000-4000-8000-0000000000a1');
-- b1 federation (zz-test), b2 results platform (zz-platform), b3 a second federation used at the end.
insert into public.organizations (id, type, country_code, parent_organization_id, name) values
  ('89700000-0000-4000-8000-0000000000b1', 'federation', 'ZZ', null, 'Federation Z'),
  ('89700000-0000-4000-8000-0000000000b2', 'results_platform', 'ZZ', null, 'Example Platform'),
  ('89700000-0000-4000-8000-0000000000b3', 'federation', 'ZZ', null, 'Federation Z Two');
insert into public.results_import_sources (organization_id, provider) values
  ('89700000-0000-4000-8000-0000000000b1', 'zz-test'),
  ('89700000-0000-4000-8000-0000000000b2', 'zz-platform');

-- Test helpers. A confirmation never changes (a trigger), so only the claim rows move back in time.
create function pg_temp.wait(span interval) returns void language sql as $$
  update public.results_import_queries set last_queried_at = last_queried_at - span;
$$;
create function pg_temp.row_at(prov text) returns timestamptz language sql as $$
  select last_queried_at from public.results_import_queries
  where athlete_id = '89700000-0000-4000-8000-0000000000e1' and provider = prov;
$$;
create function pg_temp.confirm(org uuid, prov text, name text) returns void language sql as $$
  insert into public.results_import_confirmations (athlete_id, organization_id, provider, confirmed_by, candidate_name, affiliations, result_count)
  values ('89700000-0000-4000-8000-0000000000e1', org, prov, '89700000-0000-4000-8000-0000000000a1', name, '[]', 1);
$$;

-- 1. Privileges: the old signatures, the new ones and the helper.
select ok(
  not has_function_privilege('authenticated', 'public.results_import_claim_query(uuid, uuid, interval)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_claim_query(uuid, uuid, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_claim_results_query(uuid, uuid, interval, interval)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_claim_results_query(uuid, uuid, interval, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_release_claim(uuid, timestamptz, interval, interval)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_release_claim(uuid, timestamptz, interval, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_latest_confirmation(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_latest_confirmation(uuid)', 'execute'),
  'clients execute none of the old signatures'
);
select ok(
  has_function_privilege('service_role', 'public.results_import_claim_query(uuid, uuid, interval)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_claim_results_query(uuid, uuid, interval, interval)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_release_claim(uuid, timestamptz, interval, interval)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_latest_confirmation(uuid)', 'execute'),
  'service_role executes all of the old signatures'
);
select ok(
  not has_function_privilege('authenticated', 'public.results_import_claim_query(uuid, text, uuid, interval)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_claim_query(uuid, text, uuid, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_claim_results_query(uuid, text, uuid, interval, interval)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_claim_results_query(uuid, text, uuid, interval, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_release_claim(uuid, text, timestamptz, interval, interval)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_release_claim(uuid, text, timestamptz, interval, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_latest_confirmation(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_latest_confirmation(uuid, uuid)', 'execute'),
  'clients execute none of the new signatures either'
);
select ok(
  has_function_privilege('service_role', 'public.results_import_claim_query(uuid, text, uuid, interval)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_claim_results_query(uuid, text, uuid, interval, interval)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_release_claim(uuid, text, timestamptz, interval, interval)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_latest_confirmation(uuid, uuid)', 'execute'),
  'service_role executes all of the new signatures'
);
select ok(
  not has_function_privilege('authenticated', 'app.results_import_legacy_provider()', 'execute')
    and not has_function_privilege('anon', 'app.results_import_legacy_provider()', 'execute'),
  'clients cannot execute the legacy provider helper'
);
select is(
  app.results_import_legacy_provider(), 'zz-test',
  'the legacy provider is the provider of the one federation source, not the platform'
);

set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

-- 2. The old claim (athlete, requested_by, min_interval) against the new schema.
select throws_ok(
  $$ select public.results_import_claim_query('89700000-0000-4000-8000-0000000000e1', '89700000-0000-4000-8000-0000000000a1', interval '0 seconds') $$,
  '22023', null, 'an interval that is not positive is rejected'
);
select throws_ok(
  $$ select public.results_import_claim_query('89700000-0000-4000-8000-0000000000e1', '89700000-0000-4000-8000-0000000000a3', interval '1 hour') $$,
  '42501', null, 'a claim by someone who does not manage the athlete is rejected'
);
select throws_ok(
  $$ select public.results_import_claim_query('89700000-0000-4000-8000-0000000000e2', '89700000-0000-4000-8000-0000000000a1', interval '1 hour') $$,
  '42501', null, 'a claim for an athlete without the import authorization is rejected'
);
select set_config('app.claimed_at', c.claimed_at::text, true),
       set_config('app.claimed_retry', coalesce(c.retry_at::text, 'null'), true)
from public.results_import_claim_query('89700000-0000-4000-8000-0000000000e1', '89700000-0000-4000-8000-0000000000a1', interval '1 hour') c;
select is(current_setting('app.claimed_retry'), 'null', 'the first claim is taken: no retry instant');
select is(current_setting('app.claimed_at'), pg_temp.row_at('zz-test')::text,
  'and it answers the instant stored in the row of the federation provider');
select is(
  (select count(*) from public.results_import_queries where athlete_id = '89700000-0000-4000-8000-0000000000e1' and provider = 'zz-platform'),
  0::bigint,
  'the old claim did not write a row for the platform provider'
);
select set_config('app.first_at', pg_temp.row_at('zz-test')::text, true);
select ok(
  (select retry_at = current_setting('app.first_at')::timestamptz + interval '1 hour' and claimed_at is null
     from public.results_import_claim_query('89700000-0000-4000-8000-0000000000e1', '89700000-0000-4000-8000-0000000000a1', interval '1 hour')),
  'a second claim inside the interval is rate limited: the stored instant plus the interval, and no claimed_at'
);
select is(pg_temp.row_at('zz-test')::text, current_setting('app.first_at'), 'and it does not move the window');

-- The old claim does not touch the window of a platform provider, and that window does not limit it.
select ok(
  (select retry_at is null and claimed_at is not null
     from public.results_import_claim_query('89700000-0000-4000-8000-0000000000e1', 'zz-platform', '89700000-0000-4000-8000-0000000000a1', interval '1 hour')),
  'the platform provider has its own window: its first claim is taken though the federation one is spent'
);
select is(pg_temp.row_at('zz-test')::text, current_setting('app.first_at'), 'and the federation window did not move');
select ok(
  (select retry_at is not null from public.results_import_claim_query('89700000-0000-4000-8000-0000000000e1', '89700000-0000-4000-8000-0000000000a1', interval '1 hour')),
  'the old claim is still rate limited by the federation window'
);

-- 3. The old release.
select is(
  public.results_import_release_claim('89700000-0000-4000-8000-0000000000e2', now(), interval '1 hour', interval '1 minute'),
  false, 'an athlete with no row has nothing to release'
);
select throws_ok(
  $$ select public.results_import_release_claim('89700000-0000-4000-8000-0000000000e1', now(), interval '1 hour', interval '2 hours') $$,
  '22023', null, 'a short wait longer than the interval is rejected'
);
select throws_ok(
  $$ select public.results_import_release_claim('89700000-0000-4000-8000-0000000000e1', now(), interval '0 seconds', interval '1 minute') $$,
  '22023', null, 'an interval that is not positive is rejected by the release'
);
select is(
  public.results_import_release_claim('89700000-0000-4000-8000-0000000000e1', now() - interval '5 years', interval '1 hour', interval '1 minute'),
  false, 'a release with another instant than the stored one releases nothing'
);
select is(
  public.results_import_release_claim('89700000-0000-4000-8000-0000000000e1', current_setting('app.first_at')::timestamptz, interval '1 hour', interval '1 minute'),
  true, 'releasing the claim that is still the stored one gives it back'
);
select is(
  (select last_queried_by from public.results_import_queries where athlete_id = '89700000-0000-4000-8000-0000000000e1' and provider = 'zz-test'),
  null::uuid, 'and the released claim can no longer be shared'
);
select ok(
  pg_temp.row_at('zz-test') < now() - interval '58 minutes' and pg_temp.row_at('zz-test') > now() - interval '1 hour',
  'the window now ends one short wait after the release'
);
select is(
  public.results_import_release_claim('89700000-0000-4000-8000-0000000000e1', current_setting('app.first_at')::timestamptz, interval '1 hour', interval '1 minute'),
  false, 'a second release of the same claim releases nothing'
);
select isnt(pg_temp.row_at('zz-platform'), null, 'the release did not touch the platform window');

-- 4. The old shared claim: search -> confirm -> results of the same person is one flow.
select pg_temp.wait(interval '2 hours');
select ok(
  (select retry_at is null and claimed_at is not null
     from public.results_import_claim_query('89700000-0000-4000-8000-0000000000e1', '89700000-0000-4000-8000-0000000000a1', interval '1 hour')),
  'a new search once the interval has passed takes the claim'
);
select pg_temp.confirm('89700000-0000-4000-8000-0000000000b1', 'zz-test', 'Federation Name');
select pg_temp.wait(interval '36 seconds');
select throws_ok(
  $$ select public.results_import_claim_results_query('89700000-0000-4000-8000-0000000000e1', '89700000-0000-4000-8000-0000000000a1', interval '1 hour', interval '0 seconds') $$,
  '22023', null, 'a search time to live that is not positive is rejected'
);
select throws_ok(
  $$ select public.results_import_claim_results_query('89700000-0000-4000-8000-0000000000e1', '89700000-0000-4000-8000-0000000000a3', interval '1 hour', interval '15 minutes') $$,
  '42501', null, 'a results claim by someone who does not manage the athlete is rejected'
);
select set_config('app.search_at', pg_temp.row_at('zz-test')::text, true);
select ok(
  (select retry_at is null and claimed_at is not null
     from public.results_import_claim_results_query('89700000-0000-4000-8000-0000000000e1', '89700000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes')),
  'the results query after the confirmed search uses its claim'
);
select ok(
  (select retry_at = pg_temp.row_at('zz-test') + interval '1 hour' and claimed_at is null
     from public.results_import_claim_results_query('89700000-0000-4000-8000-0000000000e1', '89700000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes')),
  'a second results query inside the interval is rate limited'
);
select ok(pg_temp.row_at('zz-test') > current_setting('app.search_at')::timestamptz, 'the shared claim moved the federation window to its own instant');

-- 5. The old latest confirmation is the newest of ANY organization; the new one without an
-- organization is the federation's.
reset role;
select pg_temp.confirm('89700000-0000-4000-8000-0000000000b2', 'zz-platform', 'Platform Name');
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';
select is(
  (select candidate_name from public.results_import_latest_confirmation('89700000-0000-4000-8000-0000000000e1')),
  'Platform Name',
  'the old latest confirmation is the newest of any organization, a newer platform one included'
);
select is(
  (select organization_id from public.results_import_latest_confirmation('89700000-0000-4000-8000-0000000000e1')),
  '89700000-0000-4000-8000-0000000000b2'::uuid,
  'and it answers that organization'
);
select is(
  (select candidate_name from public.results_import_latest_confirmation('89700000-0000-4000-8000-0000000000e1', null)),
  'Federation Name',
  'while the new one with a null organization is the federation''s'
);

-- 6. The derived provider needs exactly one federation source.
reset role;
update public.organizations set type = 'league' where id = '89700000-0000-4000-8000-0000000000b1';
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';
select throws_ok(
  $$ select public.results_import_claim_query('89700000-0000-4000-8000-0000000000e1', '89700000-0000-4000-8000-0000000000a1', interval '1 hour') $$,
  '22023', 'there is not exactly one federation results source',
  'without a federation source the old claim is rejected, and the message names no provider'
);
select throws_ok(
  $$ select public.results_import_claim_results_query('89700000-0000-4000-8000-0000000000e1', '89700000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes') $$,
  '22023', 'there is not exactly one federation results source',
  'and so is the old shared claim'
);
select throws_ok(
  $$ select public.results_import_release_claim('89700000-0000-4000-8000-0000000000e1', now(), interval '1 hour', interval '1 minute') $$,
  '22023', 'there is not exactly one federation results source',
  'and so is the old release'
);
reset role;
update public.organizations set type = 'federation' where id = '89700000-0000-4000-8000-0000000000b1';
insert into public.results_import_sources (organization_id, provider) values ('89700000-0000-4000-8000-0000000000b3', 'zz-other');
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';
select throws_ok(
  $$ select public.results_import_claim_query('89700000-0000-4000-8000-0000000000e1', '89700000-0000-4000-8000-0000000000a1', interval '1 hour') $$,
  '22023', 'there is not exactly one federation results source',
  'with two federation sources the old claim is rejected too'
);
select is(
  (select count(*) from public.results_import_queries where athlete_id = '89700000-0000-4000-8000-0000000000e1' and provider = 'zz-other'),
  0::bigint, 'and wrote no row for the second provider'
);

select * from finish();
rollback;
