-- `results_import_set_tournament_course` (issue #1482): sets the pool length of a tournament only where it is still unknown.
-- Pins that the catalog row keeps a null length until someone sets it (what the table did before), and the new rule. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.organizations (id, type, country_code, parent_organization_id, name) values
  ('1482a000-0000-4000-8000-0000000000b1', 'results_platform', 'ZZ', null, 'Example Platform One'),
  ('1482a000-0000-4000-8000-0000000000b2', 'results_platform', 'ZZ', null, 'Example Platform Two');

insert into public.results_import_tournaments (organization_id, year, date_key, name, city, discipline, course, source_url) values
  ('1482a000-0000-4000-8000-0000000000b1', 2026, '20260201', 'Unknown Length Open', 'Example City', 'SW', null, 'https://games.example.test/t/1'),
  ('1482a000-0000-4000-8000-0000000000b1', 2026, '20260202', 'Known Length Open', 'Example City', 'SW', 'LCM', 'https://games.example.test/t/2'),
  ('1482a000-0000-4000-8000-0000000000b1', 2026, '20260203', 'Other Unknown Open', 'Example City', 'SW', null, 'https://games.example.test/t/3'),
  ('1482a000-0000-4000-8000-0000000000b2', 2026, '20260201', 'Same Day Other Platform', 'Example City', 'SW', null, 'https://games.example.test/t/4');

-- A catalog row may have no length at all (as before); only service_role runs the new function.
select is(
  (select count(*)::int from public.results_import_tournaments where course is null),
  3, 'a tournament without a known length is still a valid row'
);
select ok(
  not has_function_privilege('anon', 'public.results_import_set_tournament_course(uuid, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_set_tournament_course(uuid, text, text)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_set_tournament_course(uuid, text, text)', 'execute'),
  'only the service role runs the function'
);

set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

create temp table before_set as
  select t.name, t.city, t.discipline, t.source_url, t.refreshed_at from public.results_import_tournaments t
  where t.organization_id = '1482a000-0000-4000-8000-0000000000b1' and t.date_key = '20260201';

select is(
  public.results_import_set_tournament_course('1482a000-0000-4000-8000-0000000000b1', '20260201', 'SCM'),
  true, 'a tournament with no length gets the one chosen'
);
select is(
  (select t.course from public.results_import_tournaments t where t.organization_id = '1482a000-0000-4000-8000-0000000000b1' and t.date_key = '20260201'),
  'SCM', 'and holds it'
);
select is(
  (select array[t.name, t.city, t.discipline, t.source_url] = array[b.name, b.city, b.discipline, b.source_url] and t.refreshed_at = b.refreshed_at
     from public.results_import_tournaments t, before_set b
    where t.organization_id = '1482a000-0000-4000-8000-0000000000b1' and t.date_key = '20260201'),
  true, 'no other column changes'
);

-- A length that is already there is never replaced, by the same value or by another one.
select is(
  public.results_import_set_tournament_course('1482a000-0000-4000-8000-0000000000b1', '20260202', 'SCM'),
  false, 'a known length is not changed by another one'
);
select is(
  (select t.course from public.results_import_tournaments t where t.organization_id = '1482a000-0000-4000-8000-0000000000b1' and t.date_key = '20260202'),
  'LCM', 'and stays as it was'
);
select is(
  public.results_import_set_tournament_course('1482a000-0000-4000-8000-0000000000b1', '20260201', 'LCM'),
  false, 'a length set a moment ago is not changed either'
);
select is(
  (select t.course from public.results_import_tournaments t where t.organization_id = '1482a000-0000-4000-8000-0000000000b1' and t.date_key = '20260201'),
  'SCM', 'the first choice wins'
);

-- Only the platform and the day asked: another day of the platform and the same day of another platform are left alone.
select is(
  (select array_agg(t.course order by t.organization_id, t.date_key) from public.results_import_tournaments t where t.date_key in ('20260201', '20260203') and not (t.organization_id = '1482a000-0000-4000-8000-0000000000b1' and t.date_key = '20260201')),
  array[null, null]::text[], 'no other tournament got a length'
);

-- A day nobody has changes nothing.
select is(
  public.results_import_set_tournament_course('1482a000-0000-4000-8000-0000000000b1', '20260999', 'SCM'),
  false, 'a day the catalog does not hold answers false'
);

-- A value that is not a pool length is refused, and so is none.
select throws_ok(
  $$ select public.results_import_set_tournament_course('1482a000-0000-4000-8000-0000000000b1', '20260203', '25m') $$,
  '22023', null, 'a value that is not SCM or LCM is refused'
);
select throws_ok(
  $$ select public.results_import_set_tournament_course('1482a000-0000-4000-8000-0000000000b1', '20260203', null) $$,
  '22023', null, 'no length is refused'
);

select * from finish();
rollback;
