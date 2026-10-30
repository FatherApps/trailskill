-- Read-only helpers of the results-import function (issue #82): the access check
-- (manager plus `import_official_results` in force) and the latest confirmation.
-- Only service_role executes them. All users and data here are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('82a00000-0000-4000-8000-0000000000a1', 'access-guardian-g@example.test'),
  ('82a00000-0000-4000-8000-0000000000a2', 'access-guardian-h@example.test'),
  ('82a00000-0000-4000-8000-0000000000a3', 'access-stranger-s@example.test');
insert into public.athletes (id, first_name, last_name) values
  ('82a00000-0000-4000-8000-0000000000e1', 'Athlete', 'E1'),
  ('82a00000-0000-4000-8000-0000000000e2', 'Athlete', 'E2'),
  ('82a00000-0000-4000-8000-0000000000e3', 'Athlete', 'E3');
insert into public.athlete_managers (user_id, athlete_id, relation) values
  ('82a00000-0000-4000-8000-0000000000a1', '82a00000-0000-4000-8000-0000000000e1', 'guardian'),
  ('82a00000-0000-4000-8000-0000000000a2', '82a00000-0000-4000-8000-0000000000e2', 'guardian'),
  ('82a00000-0000-4000-8000-0000000000a1', '82a00000-0000-4000-8000-0000000000e3', 'guardian');
insert into public.authorization_texts (id, purpose, version, language, body) values
  ('82a00000-0000-4000-8000-0000000000f1', 'import_official_results', 1, 'en-US', 'Synthetic import text v1');
-- e1 and e3 have the authorization (e3's is withdrawn below); e2 never had it.
insert into public.authorizations (athlete_id, purpose, text_id, accepted_at, user_id) values
  ('82a00000-0000-4000-8000-0000000000e1', 'import_official_results', '82a00000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00+00', '82a00000-0000-4000-8000-0000000000a1'),
  ('82a00000-0000-4000-8000-0000000000e3', 'import_official_results', '82a00000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00+00', '82a00000-0000-4000-8000-0000000000a1');
insert into public.organizations (id, type, country_code, parent_organization_id, name) values
  ('82a00000-0000-4000-8000-0000000000b1', 'federation', 'ZZ', null, 'Federation Z');
insert into public.results_import_sources (organization_id, provider) values
  ('82a00000-0000-4000-8000-0000000000b1', 'zz-test');
insert into public.results_import_confirmations (athlete_id, organization_id, provider, confirmed_by, confirmed_at, candidate_name, affiliations, result_count) values
  ('82a00000-0000-4000-8000-0000000000e1', '82a00000-0000-4000-8000-0000000000b1', 'zz-test', '82a00000-0000-4000-8000-0000000000a1', '2026-10-20 10:00:00+00', 'Old Name', '[]', 1),
  ('82a00000-0000-4000-8000-0000000000e1', '82a00000-0000-4000-8000-0000000000b1', 'zz-test', '82a00000-0000-4000-8000-0000000000a1', '2026-10-28 10:00:00+00', 'Synthetic Swimmer', '[]', 3);

select ok(
  not has_function_privilege('authenticated', 'public.results_import_access(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_access(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.results_import_latest_confirmation(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.results_import_latest_confirmation(uuid)', 'execute'),
  'clients execute neither helper'
);
select ok(
  has_function_privilege('service_role', 'public.results_import_access(uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.results_import_latest_confirmation(uuid)', 'execute'),
  'service_role executes both'
);

set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

select is(public.results_import_access('82a00000-0000-4000-8000-0000000000e1', '82a00000-0000-4000-8000-0000000000a1'), true,
  'the manager of an athlete with the authorization in force has access');
select is(public.results_import_access('82a00000-0000-4000-8000-0000000000e1', '82a00000-0000-4000-8000-0000000000a3'), false,
  'a stranger has none');
select is(public.results_import_access('82a00000-0000-4000-8000-0000000000e2', '82a00000-0000-4000-8000-0000000000a2'), false,
  'the manager of an athlete without the authorization has none');
select is(public.results_import_access('82a00000-0000-4000-8000-0000000000e1', null), false,
  'no user, no access');
select is(public.results_import_access('82a00000-0000-4000-8000-0000000000ff', '82a00000-0000-4000-8000-0000000000a1'), false,
  'an athlete that does not exist gives false, not an error');
select is(public.results_import_access('82a00000-0000-4000-8000-0000000000e3', '82a00000-0000-4000-8000-0000000000a1'), true,
  'before the withdrawal the manager of e3 has access');

reset role;
update public.authorizations set withdrawn_at = '2026-10-20 10:00:00+00'
  where athlete_id = '82a00000-0000-4000-8000-0000000000e3' and purpose = 'import_official_results';
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

select is(public.results_import_access('82a00000-0000-4000-8000-0000000000e3', '82a00000-0000-4000-8000-0000000000a1'), false,
  'after the authorization is withdrawn the same manager has none');
select is((select count(*) from public.results_import_queries), 0::bigint,
  'checking the access spends no rate limit');

select is(
  (select candidate_name from public.results_import_latest_confirmation('82a00000-0000-4000-8000-0000000000e1')),
  'Synthetic Swimmer',
  'the latest confirmation is the newest one'
);
select is(
  (select count(*) from public.results_import_latest_confirmation('82a00000-0000-4000-8000-0000000000e2')),
  0::bigint,
  'an athlete never confirmed has none'
);

select * from finish();
rollback;
