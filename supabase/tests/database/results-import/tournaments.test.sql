-- The catalog of tournaments of a results platform (issue #1339): metadata only, one row per
-- (platform, day). Any signed-in user reads it; no client writes it (only the service role does,
-- from the refresh function of a later issue). All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email) values
  ('1339a000-0000-4000-8000-0000000000a1', 'tournaments-reader@example.test');
-- b1 and b2 are results platforms, b3 a federation and b4 a league.
insert into public.organizations (id, type, country_code, parent_organization_id, name) values
  ('1339a000-0000-4000-8000-0000000000b1', 'results_platform', 'ZZ', null, 'Example Platform One'),
  ('1339a000-0000-4000-8000-0000000000b2', 'results_platform', 'ZZ', null, 'Example Platform Two'),
  ('1339a000-0000-4000-8000-0000000000b3', 'federation', 'ZZ', null, 'Federation Z'),
  ('1339a000-0000-4000-8000-0000000000b4', 'league', 'ZZ', null, 'League Z');

-- Shape.
select has_table('public', 'results_import_tournaments', 'the catalog table exists');
select columns_are('public', 'results_import_tournaments',
  array['id', 'organization_id', 'year', 'date_key', 'name', 'city', 'discipline', 'course', 'source_url', 'refreshed_at'],
  'the table has exactly the agreed columns');
select col_is_null('public', 'results_import_tournaments', 'course', 'course is optional');
select col_not_null('public', 'results_import_tournaments', 'refreshed_at', 'refreshed_at is always set');
select is(
  (select relrowsecurity from pg_class where oid = 'public.results_import_tournaments'::regclass),
  true,
  'row level security is on'
);
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'powersync' and schemaname = 'public' and tablename = 'results_import_tournaments'),
  'the table is in the powersync publication'
);
select ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.results_import_tournaments'::regclass and tgname = 'account_marked_refuses_write'),
  'a marked account writes nothing, like every table of the public schema'
);

-- Grants: clients only read, and only with a session.
select ok(
  has_table_privilege('authenticated', 'public.results_import_tournaments', 'select')
    and not has_table_privilege('authenticated', 'public.results_import_tournaments', 'insert')
    and not has_table_privilege('authenticated', 'public.results_import_tournaments', 'update')
    and not has_table_privilege('authenticated', 'public.results_import_tournaments', 'delete'),
  'authenticated may only select'
);
select ok(
  not has_table_privilege('anon', 'public.results_import_tournaments', 'select')
    and not has_table_privilege('anon', 'public.results_import_tournaments', 'insert')
    and not has_table_privilege('anon', 'public.results_import_tournaments', 'update')
    and not has_table_privilege('anon', 'public.results_import_tournaments', 'delete'),
  'anon has no privilege at all'
);
select ok(
  not has_function_privilege('authenticated', 'app.results_import_tournaments_check()', 'execute')
    and not has_function_privilege('anon', 'app.results_import_tournaments_check()', 'execute'),
  'clients execute no helper of the table'
);

-- The service role writes (the refresh function of a later issue).
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

select lives_ok($$
  insert into public.results_import_tournaments (organization_id, year, date_key, name, city, discipline, course, source_url) values
    ('1339a000-0000-4000-8000-0000000000b1', 2025, '20250412', 'Example Open', 'Example City', 'swimming', '25m', 'https://example.test/torneo/20250412'),
    ('1339a000-0000-4000-8000-0000000000b1', 2025, '20250503', 'Example Cup', 'Other City', 'swimming', null, 'https://example.test/torneo/20250503')
$$, 'the service role inserts tournaments, with or without a course');
select lives_ok($$
  insert into public.results_import_tournaments (organization_id, year, date_key, name, city, discipline, source_url) values
    ('1339a000-0000-4000-8000-0000000000b2', 2025, '20250412', 'Same Day Elsewhere', 'Example City', 'swimming', 'https://example.test/otro/20250412')
$$, 'the same day on another platform is another row');
select isnt(
  (select refreshed_at from public.results_import_tournaments where date_key = '20250503'),
  null,
  'refreshed_at takes its default'
);

-- Constraints.
select throws_ok($$
  insert into public.results_import_tournaments (organization_id, year, date_key, name, city, discipline, source_url) values
    ('1339a000-0000-4000-8000-0000000000b1', 2025, '20250412', 'Duplicate', 'Example City', 'swimming', 'https://example.test/dup')
$$, '23505', null, 'a second row for the same (platform, day) fails');
select throws_ok($$
  insert into public.results_import_tournaments (organization_id, year, date_key, name, city, discipline, source_url) values
    ('1339a000-0000-4000-8000-0000000000b3', 2025, '20250601', 'On a federation', 'Example City', 'swimming', 'https://example.test/f')
$$, '23514', null, 'a federation is not a valid organization');
select throws_ok($$
  insert into public.results_import_tournaments (organization_id, year, date_key, name, city, discipline, source_url) values
    ('1339a000-0000-4000-8000-0000000000b4', 2025, '20250601', 'On a league', 'Example City', 'swimming', 'https://example.test/l')
$$, '23514', null, 'a league is not a valid organization');
select throws_ok($$
  update public.results_import_tournaments set organization_id = '1339a000-0000-4000-8000-0000000000b3' where date_key = '20250503'
$$, '23514', null, 'a row cannot be moved to a federation');
select throws_ok($$
  insert into public.results_import_tournaments (organization_id, year, date_key, name, city, discipline, source_url) values
    ('1339a000-0000-4000-8000-0000000000ff', 2025, '20250601', 'No such platform', 'Example City', 'swimming', 'https://example.test/n')
$$, '23514', null, 'an organization that does not exist is refused (the trigger runs before the foreign key)');
select throws_ok($$
  insert into public.results_import_tournaments (organization_id, year, date_key, name, city, discipline, source_url) values
    ('1339a000-0000-4000-8000-0000000000b1', 2025, '2025-06-01', 'Bad key', 'Example City', 'swimming', 'https://example.test/k')
$$, '23514', null, 'date_key must be YYYYMMDD');

-- Reads: a signed-in user reads everything, anonymous reads nothing.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "1339a000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

select is((select count(*) from public.results_import_tournaments), 3::bigint, 'a signed-in user reads the catalog');
select throws_ok($$
  insert into public.results_import_tournaments (organization_id, year, date_key, name, city, discipline, source_url) values
    ('1339a000-0000-4000-8000-0000000000b1', 2025, '20250701', 'Client write', 'Example City', 'swimming', 'https://example.test/c')
$$, '42501', null, 'a signed-in user cannot insert');
select throws_ok($$
  update public.results_import_tournaments set name = 'Changed'
$$, '42501', null, 'a signed-in user cannot update');
select throws_ok($$
  delete from public.results_import_tournaments
$$, '42501', null, 'a signed-in user cannot delete');

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok($$
  select count(*) from public.results_import_tournaments
$$, '42501', null, 'an anonymous client cannot read');
select throws_ok($$
  insert into public.results_import_tournaments (organization_id, year, date_key, name, city, discipline, source_url) values
    ('1339a000-0000-4000-8000-0000000000b1', 2025, '20250701', 'Anon write', 'Example City', 'swimming', 'https://example.test/a')
$$, '42501', null, 'an anonymous client cannot insert');

-- Nothing the clients tried left a trace; removing a platform removes its catalog.
reset role;
select is((select count(*) from public.results_import_tournaments), 3::bigint, 'the refused writes changed nothing');
select is((select count(*) from public.results_import_tournaments where name = 'Changed'), 0::bigint, 'no row was renamed');
delete from public.organizations where id = '1339a000-0000-4000-8000-0000000000b2';
select is((select count(*) from public.results_import_tournaments), 2::bigint, 'removing a platform removes its tournaments');
select is(
  (select count(*) from public.results_import_tournaments where organization_id = '1339a000-0000-4000-8000-0000000000b1'),
  2::bigint,
  'the other platform keeps its tournaments'
);

select * from finish();
rollback;
