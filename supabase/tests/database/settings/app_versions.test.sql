-- App versions (issue #1189): everyone, anonymous callers included, reads the minimum and latest app version
-- per platform; only the service role writes them; a minimum above the latest or a malformed version is rejected.
-- All data here is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.app_versions (platform, min_version, latest_version) values ('android', '0.1.0', '0.2.0');

-- Anonymous: reads, never writes.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select results_eq(
  $$ select platform, min_version, latest_version from public.app_versions $$,
  $$ values ('android'::text, '0.1.0'::text, '0.2.0'::text) $$,
  'anon reads the versions'
);
select throws_ok(
  $$ insert into public.app_versions (platform, min_version, latest_version) values ('ios', '0.1.0', '0.1.0') $$,
  '42501', null, 'anon cannot insert'
);
select throws_ok($$ update public.app_versions set min_version = '0.2.0' $$, '42501', null, 'anon cannot update');
select throws_ok($$ delete from public.app_versions $$, '42501', null, 'anon cannot delete');

-- Signed in: reads, never writes.
set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated", "sub": "75000000-0000-4000-8000-0000000000a1"}';
select results_eq(
  $$ select platform, min_version, latest_version from public.app_versions $$,
  $$ values ('android'::text, '0.1.0'::text, '0.2.0'::text) $$,
  'authenticated reads the versions'
);
select throws_ok(
  $$ insert into public.app_versions (platform, min_version, latest_version) values ('ios', '0.1.0', '0.1.0') $$,
  '42501', null, 'authenticated cannot insert'
);
select throws_ok($$ update public.app_versions set min_version = '0.2.0' $$, '42501', null, 'authenticated cannot update');
select throws_ok($$ delete from public.app_versions $$, '42501', null, 'authenticated cannot delete');

-- Service role: writes.
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';
select lives_ok(
  $$ insert into public.app_versions (platform, min_version, latest_version) values ('ios', '0.1.0', '0.1.0') $$,
  'service_role inserts'
);
select lives_ok($$ update public.app_versions set min_version = '0.2.0' where platform = 'android' $$, 'service_role updates');
select lives_ok($$ delete from public.app_versions where platform = 'ios' $$, 'service_role deletes');

-- Versions compare as numbers, so 0.10.0 is above 0.2.0; and only dotted numbers are valid.
select throws_ok(
  $$ update public.app_versions set min_version = '0.10.0', latest_version = '0.2.0' where platform = 'android' $$,
  '23514', null, 'a minimum above the latest is rejected'
);
select throws_ok(
  $$ update public.app_versions set latest_version = 'v1' where platform = 'android' $$,
  '23514', null, 'a malformed version is rejected'
);
select throws_ok(
  $$ update public.app_versions set latest_version = '1.0000000000' where platform = 'android' $$,
  '23514', null, 'a version part longer than 9 digits is rejected'
);

select * from finish();
rollback;
