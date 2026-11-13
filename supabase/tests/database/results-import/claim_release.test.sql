-- A failed source query gives its claim back (issue #888): only if nobody consumed since, leaving a
-- short wait counted from the release (the failure, issue #907) instead of the whole interval, and
-- never shareable by a results query. Test values: interval
-- 1 hour, search time to live 15 minutes, short wait 1 minute. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (id, email) values
  ('88800000-0000-4000-8000-0000000000a1', 'release-guardian@example.test');
insert into public.athletes (id, first_name, last_name) values
  ('88800000-0000-4000-8000-0000000000e1', 'Athlete', 'E1');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('88800000-0000-4000-8000-0000000000a1', '88800000-0000-4000-8000-0000000000e1', 'guardian');
insert into public.authorization_texts (id, purpose, version, language, body) values
  ('88800000-0000-4000-8000-0000000000f1', 'import_official_results', 1, 'en-US', 'Synthetic import text v1');
insert into public.authorizations (athlete_id, purpose, text_id, accepted_at, user_id) values
  ('88800000-0000-4000-8000-0000000000e1', 'import_official_results', '88800000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00+00', '88800000-0000-4000-8000-0000000000a1');
insert into public.organizations (id, type, country_code, parent_organization_id, name) values
  ('88800000-0000-4000-8000-0000000000b1', 'federation', 'ZZ', null, 'Federation Z');
insert into public.results_import_sources (organization_id, provider) values
  ('88800000-0000-4000-8000-0000000000b1', 'zz-test');

-- Test helpers. `wait` moves the claim row back in time to simulate the wait between steps.
-- `claim_into` / `results_claim_into` keep both answers of a claim in settings named <tag>_retry and <tag>_at.
create function pg_temp.wait(span interval) returns void language sql as $$
  update public.results_import_queries set last_queried_at = last_queried_at - span;
$$;
create function pg_temp.last_query() returns timestamptz language sql as $$
  select last_queried_at from public.results_import_queries where athlete_id = '88800000-0000-4000-8000-0000000000e1';
$$;
create function pg_temp.confirm(by_user uuid) returns void language sql as $$
  insert into public.results_import_confirmations (athlete_id, organization_id, provider, confirmed_by, candidate_name, affiliations, result_count)
  values ('88800000-0000-4000-8000-0000000000e1', '88800000-0000-4000-8000-0000000000b1', 'zz-test', by_user, 'Synthetic Swimmer', '[]', 1);
$$;
create function pg_temp.claim_into(tag text) returns void language sql as $$
  select set_config('app.' || tag || '_retry', coalesce(c.retry_at::text, 'null'), true),
         set_config('app.' || tag || '_at', coalesce(c.claimed_at::text, 'null'), true)
  from public.results_import_claim_query('88800000-0000-4000-8000-0000000000e1', '88800000-0000-4000-8000-0000000000a1', interval '1 hour') c;
$$;
create function pg_temp.results_claim_into(tag text) returns void language sql as $$
  select set_config('app.' || tag || '_retry', coalesce(c.retry_at::text, 'null'), true),
         set_config('app.' || tag || '_at', coalesce(c.claimed_at::text, 'null'), true)
  from public.results_import_claim_results_query('88800000-0000-4000-8000-0000000000e1', '88800000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes') c;
$$;
create function pg_temp.got(name text) returns timestamptz language sql as $$
  select nullif(current_setting('app.' || name), 'null')::timestamptz;
$$;
create function pg_temp.release(at timestamptz) returns boolean language sql as $$
  select public.results_import_release_claim('88800000-0000-4000-8000-0000000000e1', at, interval '1 hour', interval '1 minute');
$$;
-- `release_into` keeps the instant just before the release (the failure) in the setting <tag>_from.
create function pg_temp.release_into(tag text, at timestamptz) returns boolean language sql as $$
  select set_config('app.' || tag || '_from', clock_timestamp()::text, true);
  select pg_temp.release(at);
$$;
-- True when `retry` is the short wait counted from the release kept under <tag>: no sooner, no later.
create function pg_temp.short_wait_from(retry timestamptz, tag text) returns boolean language sql as $$
  select retry >= pg_temp.got(tag || '_from') + interval '1 minute' and retry <= clock_timestamp() + interval '1 minute';
$$;

select ok(
  not has_function_privilege('authenticated', 'public.results_import_release_claim(uuid, timestamptz, interval, interval)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_release_claim(uuid, timestamptz, interval, interval)', 'execute'),
  'clients cannot release a claim'
);
select ok(
  has_function_privilege('service_role', 'public.results_import_release_claim(uuid, timestamptz, interval, interval)', 'execute'),
  'service_role can'
);

set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

select throws_ok(
  $$ select public.results_import_release_claim('88800000-0000-4000-8000-0000000000e1', now(), interval '1 hour', interval '0 seconds') $$,
  '22023', null, 'a short wait that is not positive is rejected'
);
select throws_ok(
  $$ select public.results_import_release_claim('88800000-0000-4000-8000-0000000000e1', now(), interval '1 hour', interval '2 hours') $$,
  '22023', null, 'a short wait longer than the interval is rejected'
);
select throws_ok(
  $$ select public.results_import_release_claim('88800000-0000-4000-8000-0000000000e1', now(), interval '0 seconds', interval '1 minute') $$,
  '22023', null, 'an interval that is not positive is rejected'
);

-- 1. A claim answers the instant it took; a refused one answers none.
select pg_temp.claim_into('c1');
select is(pg_temp.got('c1_retry'), null::timestamptz, 'a taken claim answers no retry instant');
select is(pg_temp.got('c1_at'), pg_temp.last_query(), 'and the exact instant it stored');
select pg_temp.claim_into('c2');
select is(pg_temp.got('c2_at'), null::timestamptz, 'a refused claim answers no instant to give back');
select is(pg_temp.got('c2_retry'), pg_temp.got('c1_at') + interval '1 hour', 'and when the next one is allowed');

-- 2. Releasing: true once, then a short wait instead of the whole interval.
select is(pg_temp.release_into('c1', pg_temp.got('c1_at')), true, 'releasing the claim just taken returns true');
select pg_temp.claim_into('c3');
select ok(pg_temp.short_wait_from(pg_temp.got('c3_retry'), 'c1'), 'right after, a claim waits the short time counted from the release');
select is(pg_temp.release(pg_temp.got('c1_at')), false, 'a claim is released only once');
select pg_temp.wait(interval '1 minute');
select pg_temp.claim_into('c4');
select is(pg_temp.got('c4_retry'), null::timestamptz, 'after the short wait a claim is allowed');

-- 3. A success keeps the whole window.
select pg_temp.wait(interval '2 minutes');
select pg_temp.claim_into('c5');
select is(pg_temp.got('c5_retry'), pg_temp.last_query() + interval '1 hour', 'after a claim that is not released, two minutes later the window is still whole');

-- 3b. The short wait runs from the failure, not from the claim (issue #907).
select pg_temp.wait(interval '2 hours');
select pg_temp.claim_into('f1');
select pg_temp.wait(interval '30 seconds');
select is(pg_temp.release_into('f1', pg_temp.last_query()), true, 'a claim whose query failed after 30 seconds is released');
select pg_temp.claim_into('f2');
select ok(pg_temp.short_wait_from(pg_temp.got('f2_retry'), 'f1'), 'the next claim waits the short time counted from the failure');
select ok(pg_temp.got('f2_retry') > clock_timestamp() + interval '59 seconds', 'so about a minute from now, not the 30 seconds left since the claim');
select pg_temp.wait(interval '2 hours');
select pg_temp.claim_into('g1');
select pg_temp.wait(interval '90 seconds');
select is(pg_temp.release_into('g1', pg_temp.last_query()), true, 'a claim whose query failed after 90 seconds is released');
select pg_temp.claim_into('g2');
select is(pg_temp.got('g2_at'), null::timestamptz, 'a failure slower than the short wait does not allow an immediate new query');
select ok(pg_temp.short_wait_from(pg_temp.got('g2_retry'), 'g1'), 'it waits the short time counted from the failure');

-- 4. A release changes nothing unless the claim is still the stored one.
select pg_temp.wait(interval '2 hours');
select pg_temp.claim_into('d1');
select pg_temp.wait(interval '1 hour');
select pg_temp.claim_into('d2');
select is(pg_temp.release(pg_temp.got('d1_at')), false, 'an earlier claim (someone claimed after) is not released');
select is(pg_temp.release(pg_temp.last_query() + interval '1 microsecond'), false, 'an instant that was never taken is not released');
select is(pg_temp.release(null), false, 'a null instant is not released');
select is(pg_temp.last_query(), pg_temp.got('d2_at'), 'and the newer claim keeps its place');
select pg_temp.claim_into('d3');
select is(pg_temp.got('d3_retry'), pg_temp.got('d2_at') + interval '1 hour', 'and its whole interval');
select is(
  public.results_import_release_claim('88800000-0000-4000-8000-0000000000e2', now(), interval '1 hour', interval '1 minute'),
  false, 'an athlete with no row has nothing to release'
);

-- 5. A released shared claim is never shared again.
select pg_temp.wait(interval '2 hours');
select pg_temp.claim_into('s1');
select pg_temp.confirm('88800000-0000-4000-8000-0000000000a1');
select pg_temp.wait(interval '36 seconds');
select pg_temp.results_claim_into('s2');
select is(pg_temp.got('s2_retry'), null::timestamptz, 'the results query after the confirmed search shares its claim');
select is(pg_temp.got('s2_at'), pg_temp.last_query(), 'and answers the instant it moved the window to');
select is(pg_temp.release_into('s2', pg_temp.got('s2_at')), true, 'the shared claim is released');
select pg_temp.results_claim_into('s3');
select ok(pg_temp.short_wait_from(pg_temp.got('s3_retry'), 's2'), 'a results query right after is not shared again: it waits the short time');
select pg_temp.claim_into('s4');
select ok(pg_temp.short_wait_from(pg_temp.got('s4_retry'), 's2'), 'and so does a search');
select is((select last_queried_by from public.results_import_queries where athlete_id = '88800000-0000-4000-8000-0000000000e1'),
  null::uuid, 'a released claim records no one');
select pg_temp.wait(interval '1 minute');
select pg_temp.results_claim_into('s5');
select is(pg_temp.got('s5_retry'), null::timestamptz, 'after the short wait a results query takes a normal claim');
select pg_temp.results_claim_into('s6');
select is(pg_temp.got('s6_retry'), pg_temp.got('s5_at') + interval '1 hour', 'which spends the whole window');

select * from finish();
rollback;
