-- The results query that follows a confirmed search shares that search's claim (issue #836):
-- one search -> confirm -> results flow of the same person spends one claim. Independent
-- searches keep their own interval and a refused claim never moves it. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email) values
  ('83600000-0000-4000-8000-0000000000a1', 'shared-guardian-g@example.test'),
  ('83600000-0000-4000-8000-0000000000a2', 'shared-guardian-h@example.test'),
  ('83600000-0000-4000-8000-0000000000a3', 'shared-stranger-s@example.test');
insert into public.athletes (id, first_name, last_name) values
  ('83600000-0000-4000-8000-0000000000e1', 'Athlete', 'E1');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('83600000-0000-4000-8000-0000000000a1', '83600000-0000-4000-8000-0000000000e1', 'guardian'),
  ('83600000-0000-4000-8000-0000000000a2', '83600000-0000-4000-8000-0000000000e1', 'guardian');
insert into public.authorization_texts (id, purpose, version, language, body) values
  ('83600000-0000-4000-8000-0000000000f1', 'import_official_results', 1, 'en-US', 'Synthetic import text v1');
insert into public.authorizations (athlete_id, purpose, text_id, accepted_at, user_id) values
  ('83600000-0000-4000-8000-0000000000e1', 'import_official_results', '83600000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00+00', '83600000-0000-4000-8000-0000000000a1');
insert into public.organizations (id, type, country_code, parent_organization_id, name) values
  ('83600000-0000-4000-8000-0000000000b1', 'federation', 'ZZ', null, 'Federation Z');
insert into public.results_import_sources (organization_id, provider) values
  ('83600000-0000-4000-8000-0000000000b1', 'zz-test');

-- Test helpers. A confirmation never changes (a trigger), so only the claim row is moved back in
-- time to simulate the wait between steps; each confirmation is made after the search it follows.
create function pg_temp.confirm(by_user uuid) returns void language sql as $$
  insert into public.results_import_confirmations (athlete_id, organization_id, provider, confirmed_by, candidate_name, affiliations, result_count)
  values ('83600000-0000-4000-8000-0000000000e1', '83600000-0000-4000-8000-0000000000b1', 'zz-test', by_user, 'Synthetic Swimmer', '[]', 1);
$$;
create function pg_temp.wait(span interval) returns void language sql as $$
  update public.results_import_queries set last_queried_at = last_queried_at - span;
$$;
create function pg_temp.last_query() returns timestamptz language sql as $$
  select last_queried_at from public.results_import_queries where athlete_id = '83600000-0000-4000-8000-0000000000e1';
$$;

select ok(
  not has_function_privilege('authenticated', 'public.results_import_claim_results_query(uuid, uuid, interval, interval)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_claim_results_query(uuid, uuid, interval, interval)', 'execute'),
  'clients cannot claim a results query'
);
select ok(
  has_function_privilege('service_role', 'public.results_import_claim_results_query(uuid, uuid, interval, interval)', 'execute'),
  'service_role can'
);

set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

select throws_ok(
  $$ select public.results_import_claim_results_query('83600000-0000-4000-8000-0000000000e1', '83600000-0000-4000-8000-0000000000a3', interval '1 hour', interval '15 minutes') $$,
  '42501', null,
  'a results claim by someone who does not manage the athlete is rejected'
);
select throws_ok(
  $$ select public.results_import_claim_results_query('83600000-0000-4000-8000-0000000000e1', '83600000-0000-4000-8000-0000000000a1', interval '1 hour', interval '0 seconds') $$,
  '22023', null,
  'a search time to live that is not positive is rejected'
);

-- 1. Search -> confirm -> results of the same person inside the interval is one flow.
select is(public.results_import_claim_query('83600000-0000-4000-8000-0000000000e1', '83600000-0000-4000-8000-0000000000a1', interval '1 hour'),
  null::timestamptz, 'the search takes the claim');
select pg_temp.confirm('83600000-0000-4000-8000-0000000000a1');
select pg_temp.wait(interval '36 seconds');
select is(public.results_import_claim_results_query('83600000-0000-4000-8000-0000000000e1', '83600000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes'),
  null::timestamptz, 'the results query after the confirmed search uses its claim');
select set_config('app.shared_at', pg_temp.last_query()::text, true);

-- 2. The shared claim works once: a second results query is a new claim.
select is(public.results_import_claim_results_query('83600000-0000-4000-8000-0000000000e1', '83600000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes'),
  current_setting('app.shared_at')::timestamptz + interval '1 hour', 'a second results query inside the interval is rate limited');
select is(pg_temp.last_query()::text, current_setting('app.shared_at'), 'and does not move the window');

-- 3. An independent search inside the interval is still rate limited and does not move the window.
select is(public.results_import_claim_query('83600000-0000-4000-8000-0000000000e1', '83600000-0000-4000-8000-0000000000a1', interval '1 hour'),
  current_setting('app.shared_at')::timestamptz + interval '1 hour', 'a second search of the same person inside the interval is rate limited');
select is(public.results_import_claim_query('83600000-0000-4000-8000-0000000000e1', '83600000-0000-4000-8000-0000000000a2', interval '1 hour'),
  current_setting('app.shared_at')::timestamptz + interval '1 hour', 'and so is a search of another person');
select is(pg_temp.last_query()::text, current_setting('app.shared_at'), 'a refused search does not move the window');

-- 4. Another person's results query never uses the search's claim, even after they confirm.
select pg_temp.wait(interval '2 hours');
select is(public.results_import_claim_query('83600000-0000-4000-8000-0000000000e1', '83600000-0000-4000-8000-0000000000a1', interval '1 hour'),
  null::timestamptz, 'a new search once the interval has passed takes the claim');
select set_config('app.search_at', pg_temp.last_query()::text, true);
select pg_temp.confirm('83600000-0000-4000-8000-0000000000a2');
select is(public.results_import_claim_results_query('83600000-0000-4000-8000-0000000000e1', '83600000-0000-4000-8000-0000000000a2', interval '1 hour', interval '15 minutes'),
  current_setting('app.search_at')::timestamptz + interval '1 hour', 'another person''s results query is rate limited');

-- 5. Without a confirmation after the search, results asks for its own claim.
select is(public.results_import_claim_results_query('83600000-0000-4000-8000-0000000000e1', '83600000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes'),
  current_setting('app.search_at')::timestamptz + interval '1 hour', 'results of an unconfirmed search is rate limited (older confirmations do not count)');
select is(pg_temp.last_query()::text, current_setting('app.search_at'), 'and does not move the window');

-- 6. Past the search's time to live, results asks for a new claim, refused while the interval lasts.
select pg_temp.confirm('83600000-0000-4000-8000-0000000000a1');
select pg_temp.wait(interval '16 minutes');
select is(public.results_import_claim_results_query('83600000-0000-4000-8000-0000000000e1', '83600000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes'),
  pg_temp.last_query() + interval '1 hour', 'results past the search time to live is rate limited while the interval lasts');

-- 7. Once the interval has passed, results takes a new claim of its own.
select pg_temp.wait(interval '1 hour');
select is(public.results_import_claim_results_query('83600000-0000-4000-8000-0000000000e1', '83600000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes'),
  null::timestamptz, 'results once the interval has passed takes a new claim');
select is((select last_queried_by from public.results_import_queries where athlete_id = '83600000-0000-4000-8000-0000000000e1'),
  '83600000-0000-4000-8000-0000000000a1'::uuid, 'the claim records who queried');

select * from finish();
rollback;
