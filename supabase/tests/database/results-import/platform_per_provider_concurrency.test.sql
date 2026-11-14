-- The query window and its lock are per (athlete, provider) (issue #896): two claims of the same
-- athlete and provider give exactly one winner, a claim of another provider is not blocked while
-- the first one is still open, and a claim still waits for whoever holds the athlete's exclusive
-- authorization lock (a withdrawal). A race needs real connections whose transactions overlap, so
-- the data is committed through dblink and deleted again at the end (and before, so a failed
-- earlier run leaves nothing behind). Every wait is bounded by a lock timeout so a failure cannot
-- hang. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(9);

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
select extensions.dblink_exec('first', 'set statement_timeout = ''20s''');
select extensions.dblink_exec('second', 'set statement_timeout = ''20s''');

create function pg_temp.cleanup() returns void language plpgsql as $$
begin
  -- Replica mode skips the triggers that make authorization evidence undeletable; the deletes below are in dependency order.
  perform extensions.dblink_exec('admin', $c$
    set local session_replication_role = replica;
    delete from public.results_import_queries where athlete_id = '89610000-0000-4000-8000-0000000000e1';
    delete from public.authorizations where athlete_id = '89610000-0000-4000-8000-0000000000e1';
    delete from public.athlete_managers where athlete_id = '89610000-0000-4000-8000-0000000000e1';
    delete from public.athletes where id = '89610000-0000-4000-8000-0000000000e1';
    delete from public.authorization_texts where id = '89610000-0000-4000-8000-0000000000f1';
    delete from public.results_import_sources where organization_id in ('89610000-0000-4000-8000-0000000000b1', '89610000-0000-4000-8000-0000000000b2');
    delete from public.organizations where id in ('89610000-0000-4000-8000-0000000000b1', '89610000-0000-4000-8000-0000000000b2');
    delete from auth.users where id = '89610000-0000-4000-8000-0000000000a1';
  $c$);
end;
$$;

-- Claims for the provider over the given connection and answers how it went: 'taken', 'refused'
-- (rate limited) or the SQLSTATE of the error (55P03 is the lock timeout).
create function pg_temp.try_claim(conn text, prov text) returns text language plpgsql as $$
declare
  r timestamptz;
  c timestamptz;
begin
  select t.r, t.c into r, c from extensions.dblink(conn, format(
    $q$ select retry_at, claimed_at from public.results_import_claim_query('89610000-0000-4000-8000-0000000000e1', %L, '89610000-0000-4000-8000-0000000000a1', interval '1 hour') $q$, prov
  )) as t(r timestamptz, c timestamptz);
  return case when c is not null then 'taken' else 'refused' end;
exception when others then
  return sqlstate;
end;
$$;

select pg_temp.cleanup();
select extensions.dblink_exec('admin', $c$
  insert into auth.users (id, email) values ('89610000-0000-4000-8000-0000000000a1', 'provider-race-guardian@example.test');
  insert into public.athletes (id, first_name, last_name) values ('89610000-0000-4000-8000-0000000000e1', 'Athlete', 'Race');
  insert into public.athlete_managers (user_id, athlete_id, relation)
    values ('89610000-0000-4000-8000-0000000000a1', '89610000-0000-4000-8000-0000000000e1', 'guardian');
  insert into public.authorization_texts (id, purpose, version, language, body)
    values ('89610000-0000-4000-8000-0000000000f1', 'import_official_results', 89610, 'zz-ZZ', 'Synthetic import text for the provider race test');
  insert into public.authorizations (athlete_id, purpose, text_id, accepted_at, user_id)
    values ('89610000-0000-4000-8000-0000000000e1', 'import_official_results', '89610000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00+00', '89610000-0000-4000-8000-0000000000a1');
  insert into public.organizations (id, type, country_code, parent_organization_id, name) values
    ('89610000-0000-4000-8000-0000000000b1', 'federation', 'ZZ', null, 'Federation Z'),
    ('89610000-0000-4000-8000-0000000000b2', 'results_platform', 'ZZ', null, 'Example Platform');
  insert into public.results_import_sources (organization_id, provider) values
    ('89610000-0000-4000-8000-0000000000b1', 'zz-test'),
    ('89610000-0000-4000-8000-0000000000b2', 'zz-platform');
$c$);

-- 1. Two claims of the same athlete and provider at the same time. The sleep sits in the same
-- statement, after the claim, so the first one still holds its transaction (and the provider's
-- lock) while the second one starts.
select extensions.dblink_send_query('first', $c$
  select retry_at as r, pg_sleep(2)::text as s
  from public.results_import_claim_query('89610000-0000-4000-8000-0000000000e1', 'zz-test', '89610000-0000-4000-8000-0000000000a1', interval '1 hour') $c$);
select extensions.dblink_send_query('second', $c$
  select retry_at as r, pg_sleep(2)::text as s
  from public.results_import_claim_query('89610000-0000-4000-8000-0000000000e1', 'zz-test', '89610000-0000-4000-8000-0000000000a1', interval '1 hour') $c$);

create temp table outcomes as
  select 'first' as who, r from extensions.dblink_get_result('first') as t(r timestamptz, s text);
insert into outcomes select 'second', r from extensions.dblink_get_result('second') as t(r timestamptz, s text);
select extensions.dblink_get_result('first') as drained_first;
select extensions.dblink_get_result('second') as drained_second;

create temp table final_state as
  select last_queried_at from extensions.dblink('admin',
    $c$ select last_queried_at from public.results_import_queries
        where athlete_id = '89610000-0000-4000-8000-0000000000e1' and provider = 'zz-test' $c$
  ) as t(last_queried_at timestamptz);

select is((select count(*) from outcomes where r is null), 1::bigint, 'exactly one of the two claims for the same provider won');
select is((select count(*) from outcomes where r is not null), 1::bigint, 'the other one was refused');
select is((select r from outcomes where r is not null), (select last_queried_at from final_state) + interval '1 hour',
  'and told when the next query is allowed, counted from the one claim that won');

-- 2. A claim of another provider is not blocked while the first provider's claim is still open.
select extensions.dblink_exec('admin', $c$ delete from public.results_import_queries where athlete_id = '89610000-0000-4000-8000-0000000000e1' $c$);
select extensions.dblink_exec('second', 'set lock_timeout = ''1500ms''');
select extensions.dblink_exec('first', 'begin');
select is(pg_temp.try_claim('first', 'zz-test'), 'taken', 'the first transaction takes the federation provider''s claim and keeps it open');
select is(pg_temp.try_claim('second', 'zz-platform'), 'taken', 'a claim of the platform provider is not blocked meanwhile');
select is(pg_temp.try_claim('second', 'zz-test'), '55P03', 'while a claim of the same provider waits for the open one (lock timeout)');
select extensions.dblink_exec('first', 'commit');
select is(pg_temp.try_claim('second', 'zz-test'), 'refused', 'once it commits the same provider is rate limited, not blocked');

-- 3. A claim of any provider still waits for the exclusive lock of the athlete's authorization, the
-- one a withdrawal holds: an import cannot race a withdrawal.
select extensions.dblink_exec('admin', $c$ delete from public.results_import_queries where athlete_id = '89610000-0000-4000-8000-0000000000e1' $c$);
select extensions.dblink_exec('first', 'begin');
select 1 from extensions.dblink('first', $c$
  select 1 from (select pg_advisory_xact_lock(hashtextextended('89610000-0000-4000-8000-0000000000e1' || ':' || 'import_official_results', 0))) s $c$
) as t(x int);
select is(pg_temp.try_claim('second', 'zz-platform'), '55P03', 'a claim waits while a withdrawal holds the authorization lock');
select extensions.dblink_exec('first', 'rollback');
select is(pg_temp.try_claim('second', 'zz-platform'), 'taken', 'and goes through once the lock is released');

select pg_temp.cleanup();
select extensions.dblink_disconnect('admin');
select extensions.dblink_disconnect('first');
select extensions.dblink_disconnect('second');

select * from finish();
rollback;
