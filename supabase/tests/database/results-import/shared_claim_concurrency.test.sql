-- Two results queries of the same confirmed search that run at the same time spend the search's
-- claim once, not twice (issue #836). A race needs two real connections whose transactions
-- overlap, so the data is committed through dblink and deleted again at the end (and before, so
-- a failed earlier run leaves nothing behind). All data is synthetic.
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
  -- Replica mode skips the triggers that make authorization evidence undeletable; the deletes below are in dependency order.
  perform extensions.dblink_exec('admin', $c$
    set local session_replication_role = replica;
    delete from public.results_import_queries where athlete_id = '83610000-0000-4000-8000-0000000000e1';
    delete from public.results_import_confirmations where athlete_id = '83610000-0000-4000-8000-0000000000e1';
    delete from public.authorizations where athlete_id = '83610000-0000-4000-8000-0000000000e1';
    delete from public.athlete_managers where athlete_id = '83610000-0000-4000-8000-0000000000e1';
    delete from public.athletes where id = '83610000-0000-4000-8000-0000000000e1';
    delete from public.authorization_texts where id = '83610000-0000-4000-8000-0000000000f1';
    delete from public.results_import_sources where organization_id = '83610000-0000-4000-8000-0000000000b1';
    delete from public.organizations where id = '83610000-0000-4000-8000-0000000000b1';
    delete from auth.users where id = '83610000-0000-4000-8000-0000000000a1';
  $c$);
end;
$$;

select pg_temp.cleanup();
select extensions.dblink_exec('admin', $c$
  insert into auth.users (id, email) values ('83610000-0000-4000-8000-0000000000a1', 'race-guardian@example.test');
  insert into public.athletes (id, first_name, last_name) values ('83610000-0000-4000-8000-0000000000e1', 'Athlete', 'Race');
  insert into public.athlete_managers (user_id, athlete_id, relation)
    values ('83610000-0000-4000-8000-0000000000a1', '83610000-0000-4000-8000-0000000000e1', 'guardian');
  insert into public.authorization_texts (id, purpose, version, language, body)
    values ('83610000-0000-4000-8000-0000000000f1', 'import_official_results', 83610, 'zz-ZZ', 'Synthetic import text for the race test');
  insert into public.authorizations (athlete_id, purpose, text_id, accepted_at, user_id)
    values ('83610000-0000-4000-8000-0000000000e1', 'import_official_results', '83610000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00+00', '83610000-0000-4000-8000-0000000000a1');
  insert into public.organizations (id, type, country_code, parent_organization_id, name)
    values ('83610000-0000-4000-8000-0000000000b1', 'federation', 'ZZ', null, 'Federation Z');
  insert into public.results_import_sources (organization_id, provider) values ('83610000-0000-4000-8000-0000000000b1', 'zz-test');
$c$);

-- The search takes the claim and the user confirms it.
select is(
  (select r from extensions.dblink('first',
    $c$ select (public.results_import_claim_query('83610000-0000-4000-8000-0000000000e1', 'zz-test', '83610000-0000-4000-8000-0000000000a1', interval '1 hour')).retry_at $c$
  ) as t(r timestamptz)),
  null::timestamptz, 'the search takes the claim');
select extensions.dblink_exec('admin', $c$
  insert into public.results_import_confirmations (athlete_id, organization_id, provider, confirmed_by, candidate_name, affiliations, result_count)
  values ('83610000-0000-4000-8000-0000000000e1', '83610000-0000-4000-8000-0000000000b1', 'zz-test', '83610000-0000-4000-8000-0000000000a1', 'Synthetic Swimmer', '[]', 1);
$c$);
create temp table searched as
  select last_queried_at from extensions.dblink('admin',
    $c$ select last_queried_at from public.results_import_queries where athlete_id = '83610000-0000-4000-8000-0000000000e1' $c$
  ) as t(last_queried_at timestamptz);

-- Both results queries run now. The sleep sits in the same statement, after the claim, so the
-- first one still holds its transaction (and the athlete's lock) while the second one starts.
select extensions.dblink_send_query('first', $c$
  select (public.results_import_claim_results_query('83610000-0000-4000-8000-0000000000e1', 'zz-test', '83610000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes')).retry_at as r,
         pg_sleep(2)::text as s $c$);
select extensions.dblink_send_query('second', $c$
  select (public.results_import_claim_results_query('83610000-0000-4000-8000-0000000000e1', 'zz-test', '83610000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes')).retry_at as r,
         pg_sleep(2)::text as s $c$);

create temp table outcomes as
  select 'first' as who, r from extensions.dblink_get_result('first') as t(r timestamptz, s text);
insert into outcomes select 'second', r from extensions.dblink_get_result('second') as t(r timestamptz, s text);
select extensions.dblink_get_result('first') as drained_first;
select extensions.dblink_get_result('second') as drained_second;

create temp table final_state as
  select last_queried_at from extensions.dblink('admin',
    $c$ select last_queried_at from public.results_import_queries where athlete_id = '83610000-0000-4000-8000-0000000000e1' $c$
  ) as t(last_queried_at timestamptz);

select is((select count(*) from outcomes where r is null), 1::bigint, 'exactly one of the two results queries used the search''s claim');
select is((select count(*) from outcomes where r is not null), 1::bigint, 'the other one was refused');
select is((select r from outcomes where r is not null), (select last_queried_at from final_state) + interval '1 hour',
  'and told when the next query is allowed, counted from the one claim that was used');
select ok((select f.last_queried_at > s.last_queried_at from final_state f, searched s), 'which moved the window once, to the moment it was used');

select pg_temp.cleanup();
select extensions.dblink_disconnect('admin');
select extensions.dblink_disconnect('first');
select extensions.dblink_disconnect('second');

select * from finish();
rollback;
