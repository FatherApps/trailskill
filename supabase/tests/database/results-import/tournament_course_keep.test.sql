-- The save of the tournament catalog keeps a pool length already stored (issue #1481): `course = coalesce(t.course, excluded.course)`.
-- Pins what the upsert did before (insert, update of every other column, first of a day, atomic) and the new rule. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.organizations (id, type, country_code, parent_organization_id, name) values
  ('1481a000-0000-4000-8000-0000000000b1', 'results_platform', 'ZZ', null, 'Example Platform One');

set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

-- The grants of the function are the ones it had: only the service role runs it.
reset role;
select ok(
  not has_function_privilege('anon', 'public.results_import_save_tournaments(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_save_tournaments(uuid, jsonb)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_save_tournaments(uuid, jsonb)', 'execute'),
  'only the service role still runs the save'
);
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

-- New days are inserted with the length they carry, or none.
select is(
  public.results_import_save_tournaments('1481a000-0000-4000-8000-0000000000b1', $j$[
    {"year": 2026, "date_key": "20260101", "name": "Long Open", "city": "Example City", "discipline": "SW", "course": "LCM", "source_url": "https://games.example.test/t/1"},
    {"year": 2026, "date_key": "20260102", "name": "Plain Open", "city": "Example City", "discipline": "SW", "course": null, "source_url": "https://games.example.test/t/2"},
    {"year": 2026, "date_key": "20260103", "name": "Short Open", "city": "Example City", "discipline": "SW", "course": "SCM", "source_url": "https://games.example.test/t/3"}
  ]$j$::jsonb),
  3,
  'new days are inserted and counted'
);
select is(
  (select array_agg(t.course order by t.date_key) from public.results_import_tournaments t where t.date_key in ('20260101', '20260102', '20260103')),
  array['LCM', null, 'SCM'],
  'a new day keeps the length it came with, or none'
);

-- A later read without a length leaves a stored one alone, and still updates every other column and refreshed_at.
create temp table before_read as
  select t.refreshed_at from public.results_import_tournaments t where t.date_key = '20260101';
select is(
  public.results_import_save_tournaments('1481a000-0000-4000-8000-0000000000b1', $j$[
    {"year": 2026, "date_key": "20260101", "name": "Long Open Renamed", "city": "Moved City", "discipline": "PO", "course": null, "source_url": "https://games.example.test/t/moved"}
  ]$j$::jsonb),
  1,
  'a known day is saved again'
);
select is(
  (select t.course from public.results_import_tournaments t where t.date_key = '20260101'),
  'LCM',
  'a read without a length keeps the stored LCM'
);
select is(
  (select array[t.name, t.city, t.discipline, t.source_url] from public.results_import_tournaments t where t.date_key = '20260101'),
  array['Long Open Renamed', 'Moved City', 'PO', 'https://games.example.test/t/moved'],
  'the name, city, discipline and address are still updated'
);
select ok(
  (select t.refreshed_at > (select b.refreshed_at from before_read b) from public.results_import_tournaments t where t.date_key = '20260101'),
  'refreshed_at still moves'
);

-- A read with a length fills a missing one.
select public.results_import_save_tournaments('1481a000-0000-4000-8000-0000000000b1', $j$[
  {"year": 2026, "date_key": "20260102", "name": "Plain Open", "city": "Example City", "discipline": "SW", "course": "SCM", "source_url": "https://games.example.test/t/2"}
]$j$::jsonb);
select is(
  (select t.course from public.results_import_tournaments t where t.date_key = '20260102'),
  'SCM',
  'a read with SCM fills a day that had no length'
);

-- A stored length is not replaced by another one, and a missing one stays missing.
select public.results_import_save_tournaments('1481a000-0000-4000-8000-0000000000b1', $j$[
  {"year": 2026, "date_key": "20260103", "name": "Short Open", "city": "Example City", "discipline": "SW", "course": "LCM", "source_url": "https://games.example.test/t/3"},
  {"year": 2026, "date_key": "20260104", "name": "Never Said", "city": "Example City", "discipline": "SW", "course": null, "source_url": "https://games.example.test/t/4"}
]$j$::jsonb);
select is(
  (select t.course from public.results_import_tournaments t where t.date_key = '20260103'),
  'SCM',
  'the stored SCM is kept when a later read says LCM'
);
select is(
  (select t.course from public.results_import_tournaments t where t.date_key = '20260104'),
  null,
  'a day that never had a length stays without one'
);
select public.results_import_save_tournaments('1481a000-0000-4000-8000-0000000000b1', $j$[
  {"year": 2026, "date_key": "20260104", "name": "Never Said", "city": "Example City", "discipline": "SW", "course": null, "source_url": "https://games.example.test/t/4"}
]$j$::jsonb);
select is(
  (select t.course from public.results_import_tournaments t where t.date_key = '20260104'),
  null,
  'null over null stays null'
);

-- Two entries of one day are still one row, the first, with its length.
select is(
  public.results_import_save_tournaments('1481a000-0000-4000-8000-0000000000b1', $j$[
    {"year": 2026, "date_key": "20260105", "name": "First Of The Day", "city": "Example City", "discipline": "SW", "course": "SCM", "source_url": "https://games.example.test/t/5a"},
    {"year": 2026, "date_key": "20260105", "name": "Second Of The Day", "city": "Example City", "discipline": "PO", "course": "LCM", "source_url": "https://games.example.test/t/5b"}
  ]$j$::jsonb),
  1,
  'two entries of one day are one row'
);

-- A list with a bad row saves nothing, as before: the good row's length is not written either.
select throws_ok(
  $$ select public.results_import_save_tournaments('1481a000-0000-4000-8000-0000000000b1', '[
    {"year": 2026, "date_key": "20260106", "name": "Fine", "city": "C", "discipline": "SW", "course": "LCM", "source_url": "https://games.example.test/t/6"},
    {"year": 2026, "date_key": "not-a-key", "name": "Broken", "city": "C", "discipline": "SW", "course": null, "source_url": "https://games.example.test/t/7"}
  ]'::jsonb) $$,
  '23514', null, 'a list with a bad row is refused whole'
);
select is(
  (select count(*)::int from public.results_import_tournaments where date_key = '20260106'),
  0, 'and the good row beside it is not saved either'
);

select * from finish();
rollback;
