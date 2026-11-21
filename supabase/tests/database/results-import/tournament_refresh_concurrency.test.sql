-- Two refreshes of the same platform at the same moment ask the platform once (issue #1341): exactly one claim is taken, with no row yet
-- and with an expired one. A race needs two real connections whose transactions overlap, so the data is committed through dblink
-- and deleted again at the end (and before, so a failed earlier run leaves nothing behind). All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(5);

-- The server connects to itself over the network, so the password is checked even for a local
-- run; the address and port come from the current connection and work the same in CI.
select set_config(
  'app.dblink_conn',
  format('dbname=%s user=postgres password=postgres host=%s port=%s',
    current_database(), coalesce(host(inet_server_addr()), '127.0.0.1'), current_setting('port')),
  true
);
select extensions.dblink_connect('admin', current_setting('app.dblink_conn'));
select extensions.dblink_connect('first', current_setting('app.dblink_conn'));
select extensions.dblink_connect('second', current_setting('app.dblink_conn'));
select extensions.dblink_exec('first', 'set role service_role');
select extensions.dblink_exec('second', 'set role service_role');

create function pg_temp.cleanup() returns void language plpgsql as $$
begin
  perform extensions.dblink_exec('admin', $c$
    delete from public.results_import_tournament_refreshes where organization_id = '1341c000-0000-4000-8000-0000000000b1';
    delete from public.organizations where id = '1341c000-0000-4000-8000-0000000000b1';
  $c$);
end;
$$;

select pg_temp.cleanup();
select extensions.dblink_exec('admin', $c$
  insert into public.organizations (id, type, country_code, parent_organization_id, name)
    values ('1341c000-0000-4000-8000-0000000000b1', 'results_platform', 'ZZ', null, 'Example Platform Race');
$c$);

-- Round one: no claim row yet. The sleep sits in the same statement, after the call, so the first to claim still holds its
-- transaction while the other one is waiting for it.
select extensions.dblink_send_query('first', $c$
  select (public.results_import_claim_tournament_refresh('1341c000-0000-4000-8000-0000000000b1', interval '24 hours')).claimed_at as c,
         pg_sleep(2)::text as s $c$);
select extensions.dblink_send_query('second', $c$
  select (public.results_import_claim_tournament_refresh('1341c000-0000-4000-8000-0000000000b1', interval '24 hours')).claimed_at as c,
         pg_sleep(2)::text as s $c$);
create temp table round_one as
  select 'first' as who, c from extensions.dblink_get_result('first') as t(c timestamptz, s text)
  union all
  select 'second', c from extensions.dblink_get_result('second') as t(c timestamptz, s text);
select extensions.dblink_get_result('first') as drained_first;
select extensions.dblink_get_result('second') as drained_second;

select is((select count(*)::int from round_one where c is not null), 1, 'round one: with no claim yet, exactly one of two concurrent claims is taken');
select is((select count(*)::int from round_one where c is null), 1, 'round one: the other one is refused');
select is(
  (select count(*)::int from extensions.dblink('admin', $c$ select organization_id from public.results_import_tournament_refreshes where organization_id = '1341c000-0000-4000-8000-0000000000b1' $c$) as t(organization_id uuid)),
  1, 'round one: one claim row is stored'
);

-- Round two: the stored claim has expired.
select extensions.dblink_exec('admin', $c$
  update public.results_import_tournament_refreshes set claimed_at = claimed_at - interval '25 hours'
    where organization_id = '1341c000-0000-4000-8000-0000000000b1';
$c$);
select extensions.dblink_send_query('first', $c$
  select (public.results_import_claim_tournament_refresh('1341c000-0000-4000-8000-0000000000b1', interval '24 hours')).claimed_at as c,
         pg_sleep(2)::text as s $c$);
select extensions.dblink_send_query('second', $c$
  select (public.results_import_claim_tournament_refresh('1341c000-0000-4000-8000-0000000000b1', interval '24 hours')).claimed_at as c,
         pg_sleep(2)::text as s $c$);
create temp table round_two as
  select 'first' as who, c from extensions.dblink_get_result('first') as t(c timestamptz, s text)
  union all
  select 'second', c from extensions.dblink_get_result('second') as t(c timestamptz, s text);
select extensions.dblink_get_result('first') as drained_first_two;
select extensions.dblink_get_result('second') as drained_second_two;

select is((select count(*)::int from round_two where c is not null), 1, 'round two: with an expired claim, exactly one of two concurrent claims is taken');
select is((select count(*)::int from round_two where c is null), 1, 'round two: the other one is refused');

select pg_temp.cleanup();
select extensions.dblink_disconnect('admin');
select extensions.dblink_disconnect('first');
select extensions.dblink_disconnect('second');

select * from finish();
rollback;
