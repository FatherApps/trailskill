-- A results platform is an organization of its own type, and the query window, the shared claim and
-- the latest confirmation are per (athlete, provider) / per organization (issue #896): a query to
-- the platform never spends the federation's window and a platform confirmation never changes the
-- organization the federation update uses. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

insert into auth.users (id, email) values
  ('89600000-0000-4000-8000-0000000000a1', 'platform-guardian@example.test'),
  ('89600000-0000-4000-8000-0000000000a3', 'platform-stranger@example.test'),
  ('89600000-0000-4000-8000-0000000000a4', 'platform-admin@example.test');
insert into public.platform_admins (user_id) values ('89600000-0000-4000-8000-0000000000a4');
insert into public.athletes (id, first_name, last_name) values
  ('89600000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('89600000-0000-4000-8000-0000000000e2', 'Athlete', 'E2');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('89600000-0000-4000-8000-0000000000a1', '89600000-0000-4000-8000-0000000000e1', 'guardian'),
  ('89600000-0000-4000-8000-0000000000a1', '89600000-0000-4000-8000-0000000000e2', 'guardian');
insert into public.authorization_texts (id, purpose, version, language, body) values
  ('89600000-0000-4000-8000-0000000000f1', 'import_official_results', 1, 'en-US', 'Synthetic import text v1');
insert into public.authorizations (athlete_id, purpose, text_id, accepted_at, user_id) values
  ('89600000-0000-4000-8000-0000000000e1', 'import_official_results', '89600000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00+00', '89600000-0000-4000-8000-0000000000a1'),
  ('89600000-0000-4000-8000-0000000000e2', 'import_official_results', '89600000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00+00', '89600000-0000-4000-8000-0000000000a1');

-- b1 federation ZZ (provider zz-test), b2 platform ZZ (zz-platform, registered below), b3 platform of
-- another country, b4 league ZZ, b5 platform without a country, b6 and b7 platforms ZZ without a source.
insert into public.organizations (id, type, country_code, parent_organization_id, name) values
  ('89600000-0000-4000-8000-0000000000b1', 'federation', 'ZZ', null, 'Federation Z'),
  ('89600000-0000-4000-8000-0000000000b2', 'results_platform', 'ZZ', null, 'Example Platform'),
  ('89600000-0000-4000-8000-0000000000b3', 'results_platform', 'YY', null, 'Example Platform Y'),
  ('89600000-0000-4000-8000-0000000000b4', 'league', 'ZZ', null, 'League Z'),
  ('89600000-0000-4000-8000-0000000000b5', 'results_platform', null, null, 'Example Platform Without Country'),
  ('89600000-0000-4000-8000-0000000000b6', 'results_platform', 'ZZ', null, 'Example Platform Six'),
  ('89600000-0000-4000-8000-0000000000b7', 'results_platform', 'ZZ', null, 'Example Platform Seven');
insert into public.results_import_sources (organization_id, provider) values
  ('89600000-0000-4000-8000-0000000000b1', 'zz-test');

-- Test helpers. `wait` moves every claim row back in time (a confirmation never changes, so only the
-- claim rows move). `claim_into` / `results_claim_into` keep both answers of a claim in settings
-- named <tag>_retry and <tag>_at; `row_at` reads the stored instant of a provider's row.
create function pg_temp.wait(span interval) returns void language sql as $$
  update public.results_import_queries set last_queried_at = last_queried_at - span;
$$;
create function pg_temp.row_at(prov text) returns timestamptz language sql as $$
  select last_queried_at from public.results_import_queries
  where athlete_id = '89600000-0000-4000-8000-0000000000e1' and provider = prov;
$$;
create function pg_temp.claim_into(tag text, prov text) returns void language sql as $$
  select set_config('app.' || tag || '_retry', coalesce(c.retry_at::text, 'null'), true),
         set_config('app.' || tag || '_at', coalesce(c.claimed_at::text, 'null'), true)
  from public.results_import_claim_query('89600000-0000-4000-8000-0000000000e1', prov, '89600000-0000-4000-8000-0000000000a1', interval '1 hour') c;
$$;
create function pg_temp.results_claim_into(tag text, prov text) returns void language sql as $$
  select set_config('app.' || tag || '_retry', coalesce(c.retry_at::text, 'null'), true),
         set_config('app.' || tag || '_at', coalesce(c.claimed_at::text, 'null'), true)
  from public.results_import_claim_results_query('89600000-0000-4000-8000-0000000000e1', prov, '89600000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes') c;
$$;
create function pg_temp.got(name text) returns timestamptz language sql as $$
  select nullif(current_setting('app.' || name), 'null')::timestamptz;
$$;
create function pg_temp.confirm(org uuid, prov text, name text) returns void language sql as $$
  insert into public.results_import_confirmations (athlete_id, organization_id, provider, confirmed_by, candidate_name, affiliations, result_count)
  values ('89600000-0000-4000-8000-0000000000e1', org, prov, '89600000-0000-4000-8000-0000000000a1', name, '[]', 1);
$$;

-- 1. Schema: the organization type, the query window key and the privileges of the new signatures.
select throws_ok(
  $$ insert into public.organizations (type, name) values ('bogus', 'Example Bogus') $$,
  '23514', null,
  'an organization type that does not exist is still rejected'
);
select col_is_pk('public', 'results_import_queries', array['athlete_id', 'provider'],
  'the query window is keyed by athlete and provider');
select col_not_null('public', 'results_import_queries', 'provider', 'and the provider is required');
select hasnt_function('public', 'results_import_claim_query', array['uuid', 'uuid', 'interval'],
  'the claim without a provider is gone');
select hasnt_function('public', 'results_import_claim_results_query', array['uuid', 'uuid', 'interval', 'interval'],
  'so is the shared claim without a provider');
select hasnt_function('public', 'results_import_release_claim', array['uuid', 'timestamptz', 'interval', 'interval'],
  'so is the release without a provider');
select hasnt_function('public', 'results_import_latest_confirmation', array['uuid'],
  'and the latest confirmation of the athlete alone');
select ok(
  not has_function_privilege('authenticated', 'public.results_import_claim_query(uuid, text, uuid, interval)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_claim_query(uuid, text, uuid, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_claim_results_query(uuid, text, uuid, interval, interval)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_claim_results_query(uuid, text, uuid, interval, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_release_claim(uuid, text, timestamptz, interval, interval)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_release_claim(uuid, text, timestamptz, interval, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_latest_confirmation(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_latest_confirmation(uuid, uuid)', 'execute'),
  'clients execute none of the new signatures'
);
select ok(
  has_function_privilege('service_role', 'public.results_import_claim_query(uuid, text, uuid, interval)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_claim_results_query(uuid, text, uuid, interval, interval)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_release_claim(uuid, text, timestamptz, interval, interval)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_latest_confirmation(uuid, uuid)', 'execute'),
  'service_role executes all of them'
);

-- 2. The registry accepts a federation or a results platform, with the country prefix rule.
select lives_ok(
  $$ insert into public.results_import_sources (organization_id, provider) values ('89600000-0000-4000-8000-0000000000b2', 'zz-platform') $$,
  'a results platform of country ZZ accepts the provider zz-platform'
);
select throws_ok(
  $$ insert into public.results_import_sources (organization_id, provider) values ('89600000-0000-4000-8000-0000000000b6', 'yy-platform') $$,
  '23514', null,
  'a provider with the prefix of another country is rejected for a platform'
);
select throws_ok(
  $$ insert into public.results_import_sources (organization_id, provider) values ('89600000-0000-4000-8000-0000000000b3', 'zz-platform') $$,
  '23514', null,
  'a platform of country YY is rejected for a zz provider'
);
select throws_ok(
  $$ insert into public.results_import_sources (organization_id, provider) values ('89600000-0000-4000-8000-0000000000b5', 'zz-platform') $$,
  '23514', null,
  'a platform without a country is rejected'
);
select throws_ok(
  $$ insert into public.results_import_sources (organization_id, provider) values ('89600000-0000-4000-8000-0000000000b4', 'zz-league') $$,
  '23514', null,
  'a league is still rejected'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "89600000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.results_import_sources (organization_id, provider) values ('89600000-0000-4000-8000-0000000000b7', 'zz-seven') $$,
  '42501', null,
  'someone who is not a platform admin cannot register a platform provider'
);
set local request.jwt.claims = '{"sub": "89600000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.results_import_sources (organization_id, provider) values ('89600000-0000-4000-8000-0000000000b7', 'zz-seven') $$,
  'a platform admin registers a platform provider'
);

set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

-- 3. Validation and authorization are kept.
select throws_ok(
  $$ select public.results_import_claim_query('89600000-0000-4000-8000-0000000000e1', null, '89600000-0000-4000-8000-0000000000a1', interval '1 hour') $$,
  '22023', null, 'a claim without a provider is rejected'
);
select throws_ok(
  $$ select public.results_import_claim_query('89600000-0000-4000-8000-0000000000e1', 'ZZ_Bad', '89600000-0000-4000-8000-0000000000a1', interval '1 hour') $$,
  '22023', null, 'a claim with a provider that is not a provider key is rejected'
);
select throws_ok(
  $$ select public.results_import_claim_results_query('89600000-0000-4000-8000-0000000000e1', 'bad', '89600000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes') $$,
  '22023', null, 'so is a shared claim'
);
select throws_ok(
  $$ select public.results_import_release_claim('89600000-0000-4000-8000-0000000000e1', null, now(), interval '1 hour', interval '1 minute') $$,
  '22023', null, 'so is a release'
);
select throws_ok(
  $$ select public.results_import_claim_query('89600000-0000-4000-8000-0000000000e1', 'zz-platform', '89600000-0000-4000-8000-0000000000a3', interval '1 hour') $$,
  '42501', null, 'a claim by someone who does not manage the athlete is still rejected'
);
select throws_ok(
  $$ select public.results_import_claim_results_query('89600000-0000-4000-8000-0000000000e1', 'zz-platform', '89600000-0000-4000-8000-0000000000a3', interval '1 hour', interval '15 minutes') $$,
  '42501', null, 'and so is a shared claim'
);

-- 4. The window is per provider: the platform's query does not spend the federation's.
select pg_temp.claim_into('f1', 'zz-test');
select is(pg_temp.got('f1_retry'), null::timestamptz, 'the claim for the federation provider is taken');
select pg_temp.claim_into('p1', 'zz-platform');
select is(pg_temp.got('p1_retry'), null::timestamptz, 'the claim for the platform provider of the same athlete is taken too');
select is(pg_temp.got('p1_at'), pg_temp.row_at('zz-platform'), 'and answers the instant it stored in its own row');
select is((select count(*) from public.results_import_queries where athlete_id = '89600000-0000-4000-8000-0000000000e1'),
  2::bigint, 'the athlete has one row per provider');
select pg_temp.claim_into('f2', 'zz-test');
select is(pg_temp.got('f2_retry'), pg_temp.got('f1_at') + interval '1 hour',
  'a second claim for the federation is rate limited and answers the federation''s own retry instant');
select is(pg_temp.got('f2_at'), null::timestamptz, 'and gives no instant to give back');
select pg_temp.wait(interval '30 minutes');
select pg_temp.claim_into('p2', 'zz-platform');
select is(pg_temp.got('p2_retry'), pg_temp.row_at('zz-platform') + interval '1 hour',
  'a second claim for the platform answers the platform''s own retry instant');
select ok(
  pg_temp.row_at('zz-test') = pg_temp.got('f1_at') - interval '30 minutes'
    and pg_temp.row_at('zz-platform') = pg_temp.got('p1_at') - interval '30 minutes',
  'and a refused claim does not move the window of either provider');

-- 5. Releasing one provider's claim does not move the other's row.
select set_config('app.b_before', pg_temp.row_at('zz-platform')::text, true);
select is(
  public.results_import_release_claim('89600000-0000-4000-8000-0000000000e1', 'zz-test', pg_temp.row_at('zz-test'), interval '1 hour', interval '1 minute'),
  true, 'releasing the federation''s claim returns true');
select is(pg_temp.row_at('zz-platform')::text, current_setting('app.b_before'), 'and does not move the platform''s row');
select is(
  public.results_import_release_claim('89600000-0000-4000-8000-0000000000e1', 'zz-test', pg_temp.row_at('zz-platform'), interval '1 hour', interval '1 minute'),
  false, 'a release for a provider only matches that provider''s row, whatever instant the other row holds');
select is(pg_temp.row_at('zz-platform')::text, current_setting('app.b_before'), 'which leaves the platform''s row as it was');
select pg_temp.claim_into('f3', 'zz-test');
select ok(pg_temp.got('f3_retry') > clock_timestamp() + interval '59 seconds' and pg_temp.got('f3_retry') <= clock_timestamp() + interval '1 minute',
  'the released federation window is the short wait counted from the release');

-- 6. The shared claim needs a confirmation of the same provider.
select pg_temp.wait(interval '2 hours');
select pg_temp.claim_into('s1', 'zz-test');
select pg_temp.confirm('89600000-0000-4000-8000-0000000000b2', 'zz-platform', 'Platform Swimmer');
select pg_temp.results_claim_into('s2', 'zz-test');
select is(pg_temp.got('s2_retry'), pg_temp.got('s1_at') + interval '1 hour',
  'a confirmation for the platform does not let a results query of the federation share the federation''s search claim');
select is(pg_temp.row_at('zz-test'), pg_temp.got('s1_at'), 'and does not move the federation''s window');
select pg_temp.confirm('89600000-0000-4000-8000-0000000000b1', 'zz-test', 'Federation Swimmer');
select pg_temp.results_claim_into('s3', 'zz-test');
select is(pg_temp.got('s3_retry'), null::timestamptz, 'a confirmation for the federation does');
select is(pg_temp.got('s3_at'), pg_temp.row_at('zz-test'), 'and the claim answers the instant it moved the window to');
select pg_temp.results_claim_into('s4', 'zz-platform');
select is(pg_temp.got('s4_retry'), null::timestamptz,
  'the platform''s own window was spent long ago, so its results query takes a normal claim of its own');
select ok(pg_temp.row_at('zz-platform') > pg_temp.got('s1_at'), 'in its own row');
select pg_temp.wait(interval '2 hours');
select pg_temp.claim_into('s5', 'zz-platform');
select pg_temp.confirm('89600000-0000-4000-8000-0000000000b2', 'zz-platform', 'Platform Swimmer');
select pg_temp.results_claim_into('s6', 'zz-platform');
select is(pg_temp.got('s6_retry'), null::timestamptz,
  'a confirmation for the platform lets a results query of the platform share its search claim');
select ok(pg_temp.row_at('zz-test') < clock_timestamp() - interval '1 hour',
  'without touching the federation''s row');

-- 7. The latest confirmation: per organization, or the newest federation one.
delete from public.results_import_queries where athlete_id = '89600000-0000-4000-8000-0000000000e1';
reset role;
delete from public.results_import_confirmations where athlete_id = '89600000-0000-4000-8000-0000000000e1';
insert into public.results_import_confirmations (athlete_id, organization_id, provider, confirmed_by, confirmed_at, candidate_name, affiliations, result_count) values
  ('89600000-0000-4000-8000-0000000000e1', '89600000-0000-4000-8000-0000000000b1', 'zz-test', '89600000-0000-4000-8000-0000000000a1', '2026-10-20 10:00:00+00', 'Federation Name', '[]', 1),
  ('89600000-0000-4000-8000-0000000000e1', '89600000-0000-4000-8000-0000000000b2', 'zz-platform', '89600000-0000-4000-8000-0000000000a1', '2026-10-28 10:00:00+00', 'Platform Name', '[]', 2),
  ('89600000-0000-4000-8000-0000000000e2', '89600000-0000-4000-8000-0000000000b2', 'zz-platform', '89600000-0000-4000-8000-0000000000a1', '2026-10-28 10:00:00+00', 'Platform Only Name', '[]', 2);
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

select is(
  (select candidate_name from public.results_import_latest_confirmation('89600000-0000-4000-8000-0000000000e1', null)),
  'Federation Name',
  'without an organization the latest confirmation is the federation''s, though a platform one is newer'
);
select is(
  (select organization_id from public.results_import_latest_confirmation('89600000-0000-4000-8000-0000000000e1')),
  '89600000-0000-4000-8000-0000000000b1'::uuid,
  'and the organization answered is the federation''s when none is given'
);
select is(
  (select candidate_name from public.results_import_latest_confirmation('89600000-0000-4000-8000-0000000000e1', '89600000-0000-4000-8000-0000000000b2')),
  'Platform Name',
  'with the platform organization it is the platform''s'
);
select is(
  (select count(*) from public.results_import_latest_confirmation('89600000-0000-4000-8000-0000000000e2', null)),
  0::bigint,
  'an athlete confirmed only on a platform has no federation confirmation'
);
select is(
  (select count(*) from public.results_import_latest_confirmation('89600000-0000-4000-8000-0000000000e2', '89600000-0000-4000-8000-0000000000b1')),
  0::bigint,
  'and none for an organization they never confirmed on'
);

select * from finish();
rollback;
