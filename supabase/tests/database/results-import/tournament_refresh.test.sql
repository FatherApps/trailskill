-- The refresh of the tournament catalog (issue #1341): one claim per platform per interval, the save of what the platform listed, and
-- nothing for a client. All organizations and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- b1 and b2 are results platforms, b3 a federation.
insert into public.organizations (id, type, country_code, parent_organization_id, name) values
  ('1341a000-0000-4000-8000-0000000000b1', 'results_platform', 'ZZ', null, 'Example Platform One'),
  ('1341a000-0000-4000-8000-0000000000b2', 'results_platform', 'ZZ', null, 'Example Platform Two'),
  ('1341a000-0000-4000-8000-0000000000b3', 'federation', 'ZZ', null, 'Federation Z');

-- Shape and access.
select has_table('public', 'results_import_tournament_refreshes', 'the claim table exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.results_import_tournament_refreshes'::regclass),
  true,
  'row level security is on'
);
select ok(
  not has_table_privilege('anon', 'public.results_import_tournament_refreshes', 'select')
    and not has_table_privilege('authenticated', 'public.results_import_tournament_refreshes', 'select')
    and not has_table_privilege('authenticated', 'public.results_import_tournament_refreshes', 'insert'),
  'no client reads or writes the claims'
);
select ok(
  not has_function_privilege('anon', 'public.results_import_claim_tournament_refresh(uuid, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_claim_tournament_refresh(uuid, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_release_tournament_refresh(uuid, timestamptz, interval, interval)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_save_tournaments(uuid, jsonb)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_claim_tournament_refresh(uuid, interval)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_release_tournament_refresh(uuid, timestamptz, interval, interval)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_save_tournaments(uuid, jsonb)', 'execute'),
  'only the service role runs the three functions'
);

set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

-- The first claim of a platform is taken.
create temp table first_claim as
  select * from public.results_import_claim_tournament_refresh('1341a000-0000-4000-8000-0000000000b1', interval '24 hours');
select ok((select retry_at is null and claimed_at is not null from first_claim), 'the first claim is taken and answers the instant it took');

-- A second one inside the interval is refused, with the instant it can be taken again.
create temp table second_claim as
  select * from public.results_import_claim_tournament_refresh('1341a000-0000-4000-8000-0000000000b1', interval '24 hours');
select ok((select claimed_at is null from second_claim), 'a second claim inside the interval is refused');
select is((select retry_at from second_claim), (select claimed_at + interval '24 hours' from first_claim), 'the refusal says when the next claim is allowed');

-- Another platform has its own window.
select ok(
  (select claimed_at is not null from public.results_import_claim_tournament_refresh('1341a000-0000-4000-8000-0000000000b2', interval '24 hours')),
  'another platform is claimed independently'
);

-- Only a results platform is claimed, and the interval must be positive.
select throws_ok(
  $$ select * from public.results_import_claim_tournament_refresh('1341a000-0000-4000-8000-0000000000b3', interval '24 hours') $$,
  '23514', null, 'a federation has no catalog to refresh'
);
select throws_ok(
  $$ select * from public.results_import_claim_tournament_refresh('1341a000-0000-4000-8000-000000000999', interval '24 hours') $$,
  '23514', null, 'an organization that does not exist has none either'
);
select throws_ok(
  $$ select * from public.results_import_claim_tournament_refresh('1341a000-0000-4000-8000-0000000000b1', interval '0') $$,
  '22023', null, 'the interval must be positive'
);

-- Once the interval has passed, the claim is taken again.
reset role;
update public.results_import_tournament_refreshes set claimed_at = claimed_at - interval '25 hours'
  where organization_id = '1341a000-0000-4000-8000-0000000000b1';
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';
create temp table third_claim as
  select * from public.results_import_claim_tournament_refresh('1341a000-0000-4000-8000-0000000000b1', interval '24 hours');
select ok((select retry_at is null and claimed_at is not null from third_claim), 'after the interval the claim is taken again');

-- A release gives a failed claim back, but only if nobody claimed since: the next claim waits the short time, not the whole interval.
select is(
  public.results_import_release_tournament_refresh('1341a000-0000-4000-8000-0000000000b1', (select claimed_at from second_claim), interval '24 hours', interval '1 minute'),
  false, 'a release with the wrong instant gives nothing back'
);
select is(
  public.results_import_release_tournament_refresh('1341a000-0000-4000-8000-0000000000b1', (select claimed_at from third_claim), interval '24 hours', interval '1 minute'),
  true, 'a release with the instant of the claim gives it back'
);
select ok(
  (select claimed_at is null and retry_at <= clock_timestamp() + interval '1 minute' and retry_at > clock_timestamp()
   from public.results_import_claim_tournament_refresh('1341a000-0000-4000-8000-0000000000b1', interval '24 hours')),
  'a released claim waits the short time, not the whole interval'
);
select throws_ok(
  $$ select public.results_import_release_tournament_refresh('1341a000-0000-4000-8000-0000000000b1', now(), interval '1 hour', interval '2 hours') $$,
  '22023', null, 'the retry wait cannot be longer than the interval'
);

-- Saving what the platform listed: new rows are inserted with refreshed_at set.
select is(
  public.results_import_save_tournaments('1341a000-0000-4000-8000-0000000000b1', $j$[
    {"year": 2026, "date_key": "20260314", "name": "Synthetic Open", "city": "Example City", "discipline": "SW", "course": null, "source_url": "https://games.example.test/t/20260314"},
    {"year": 2026, "date_key": "20260418", "name": "Synthetic Cup", "city": "Other City", "discipline": "SW", "course": null, "source_url": "https://games.example.test/t/20260418"}
  ]$j$::jsonb),
  2, 'two new tournaments are saved'
);
select is((select count(*)::int from public.results_import_tournaments where organization_id = '1341a000-0000-4000-8000-0000000000b1'), 2, 'both rows are in the catalog');
select ok(
  (select bool_and(refreshed_at >= now() - interval '1 minute') from public.results_import_tournaments where organization_id = '1341a000-0000-4000-8000-0000000000b1'),
  'refreshed_at is set on the saved rows'
);

-- Saving again updates by (platform, day): no duplicates, the changed row is updated, one the list no longer has stays.
create temp table before_second_save as
  select date_key, refreshed_at from public.results_import_tournaments where organization_id = '1341a000-0000-4000-8000-0000000000b1';
select is(
  public.results_import_save_tournaments('1341a000-0000-4000-8000-0000000000b1', $j$[
    {"year": 2026, "date_key": "20260314", "name": "Synthetic Open Renamed", "city": "Example City", "discipline": "SW", "course": null, "source_url": "https://games.example.test/t/20260314"}
  ]$j$::jsonb),
  1, 'one tournament is saved again'
);
select is((select count(*)::int from public.results_import_tournaments where organization_id = '1341a000-0000-4000-8000-0000000000b1'), 2, 'there are still two rows');
select is(
  (select name from public.results_import_tournaments where organization_id = '1341a000-0000-4000-8000-0000000000b1' and date_key = '20260314'),
  'Synthetic Open Renamed', 'the changed tournament is updated'
);
select ok(
  (select t.refreshed_at > b.refreshed_at from public.results_import_tournaments t join before_second_save b using (date_key)
   where t.organization_id = '1341a000-0000-4000-8000-0000000000b1' and date_key = '20260314'),
  'its refreshed_at moves forward'
);
select ok(
  (select t.refreshed_at = b.refreshed_at from public.results_import_tournaments t join before_second_save b using (date_key)
   where t.organization_id = '1341a000-0000-4000-8000-0000000000b1' and date_key = '20260418'),
  'a tournament the list did not carry is left as it was'
);

-- Two entries of the same day are one tournament: the first is kept, and the list is saved instead of failing.
select is(
  public.results_import_save_tournaments('1341a000-0000-4000-8000-0000000000b2', $j$[
    {"year": 2026, "date_key": "20260607", "name": "First Of The Day", "city": "Example City", "discipline": "SW", "course": null, "source_url": "https://games.example.test/t/a"},
    {"year": 2026, "date_key": "20260607", "name": "Second Of The Day", "city": "Example City", "discipline": "PO", "course": null, "source_url": "https://games.example.test/t/b"}
  ]$j$::jsonb),
  1, 'two entries of the same day save one row'
);
select is(
  (select name from public.results_import_tournaments where organization_id = '1341a000-0000-4000-8000-0000000000b2' and date_key = '20260607'),
  'First Of The Day', 'the first entry of the day wins'
);

-- An empty list saves nothing and changes nothing.
select is(public.results_import_save_tournaments('1341a000-0000-4000-8000-0000000000b1', '[]'::jsonb), 0, 'an empty list saves nothing');
select is((select count(*)::int from public.results_import_tournaments where organization_id = '1341a000-0000-4000-8000-0000000000b1'), 2, 'and removes nothing');

-- What the table refuses, it refuses here too, and nothing is saved when one row fails.
select throws_ok(
  $$ select public.results_import_save_tournaments('1341a000-0000-4000-8000-0000000000b3', '[{"year": 2026, "date_key": "20260314", "name": "N", "city": "C", "discipline": "SW", "course": null, "source_url": "https://games.example.test/t"}]'::jsonb) $$,
  '23514', null, 'a federation holds no tournaments'
);
select throws_ok(
  $$ select public.results_import_save_tournaments('1341a000-0000-4000-8000-0000000000b1', '[
    {"year": 2026, "date_key": "20260501", "name": "Fine", "city": "C", "discipline": "SW", "course": null, "source_url": "https://games.example.test/t/1"},
    {"year": 2026, "date_key": "not-a-key", "name": "Broken", "city": "C", "discipline": "SW", "course": null, "source_url": "https://games.example.test/t/2"}
  ]'::jsonb) $$,
  '23514', null, 'a row with a bad date key is refused'
);
select is(
  (select count(*)::int from public.results_import_tournaments where organization_id = '1341a000-0000-4000-8000-0000000000b1' and date_key = '20260501'),
  0, 'and the good row beside it is not saved either'
);
select throws_ok(
  $$ select public.results_import_save_tournaments('1341a000-0000-4000-8000-0000000000b1', '{"not": "a list"}'::jsonb) $$,
  '22023', null, 'the rows must be a list'
);

-- A signed-in client cannot call any of them.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated"}';
select throws_ok(
  $$ select * from public.results_import_claim_tournament_refresh('1341a000-0000-4000-8000-0000000000b1', interval '24 hours') $$,
  '42501', null, 'a signed-in client cannot claim a refresh'
);

select * from finish();
rollback;
