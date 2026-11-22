-- Issue #1407: the health data of a swimmer was dropped (20261122000000_athletes_remove_health.sql). Neither the tables, nor the functions,
-- nor the two authorization purposes (and their texts) exist any more, and the account erasure no longer names the dropped tables.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

select hasnt_table('public', 'athlete_health', 'athlete_health is gone');
select hasnt_table('public', 'athlete_health_access_log', 'athlete_health_access_log is gone');
select hasnt_function('public', 'reveal_athlete_health', 'reveal_athlete_health is gone');
select hasnt_function('public', 'athlete_health_access_log_for_manager', 'athlete_health_access_log_for_manager is gone');
select hasnt_function('app', 'athlete_health_writable', 'app.athlete_health_writable is gone');
select hasnt_function('public', 'athlete_health_stamp', 'athlete_health_stamp is gone');
select hasnt_function('public', 'athlete_health_purge_on_withdrawal', 'athlete_health_purge_on_withdrawal is gone');
select is(
  (select count(*) from pg_trigger where tgname in ('athlete_health_stamp', 'athlete_health_purge_on_withdrawal')),
  0::bigint, 'neither health trigger exists'
);
select is(
  (select count(*) from public.authorization_purposes where code in ('store_health_data', 'share_health_with_school')),
  0::bigint, 'the two health purposes are gone'
);
select is(
  (select count(*) from public.authorization_texts where purpose in ('store_health_data', 'share_health_with_school')),
  0::bigint, 'and so are their texts'
);
select doesnt_match(
  pg_get_functiondef('public.erase_account(uuid, timestamptz)'::regprocedure), 'athlete_health',
  'erase_account no longer names the health tables'
);

select * from finish();
rollback;
