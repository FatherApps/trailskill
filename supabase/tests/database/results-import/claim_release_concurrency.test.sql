-- Releasing a failed search's claim races a results query that would share it (issue #888): exactly
-- one of the two wins, and the release never leaves less than the short wait. A race needs two real
-- connections whose transactions overlap, so the data is committed through dblink and deleted again at the end (and before, so
-- a failed earlier run leaves nothing behind). All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(10);

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
    delete from public.results_import_queries where athlete_id = '88810000-0000-4000-8000-0000000000e1';
    delete from public.results_import_confirmations where athlete_id = '88810000-0000-4000-8000-0000000000e1';
    delete from public.authorizations where athlete_id = '88810000-0000-4000-8000-0000000000e1';
    delete from public.athlete_managers where athlete_id = '88810000-0000-4000-8000-0000000000e1';
    delete from public.athletes where id = '88810000-0000-4000-8000-0000000000e1';
    delete from public.authorization_texts where id = '88810000-0000-4000-8000-0000000000f1';
    delete from public.results_import_sources where organization_id = '88810000-0000-4000-8000-0000000000b1';
    delete from public.organizations where id = '88810000-0000-4000-8000-0000000000b1';
    delete from auth.users where id = '88810000-0000-4000-8000-0000000000a1';
  $c$);
end;
$$;

select pg_temp.cleanup();
select extensions.dblink_exec('admin', $c$
  insert into auth.users (id, email) values ('88810000-0000-4000-8000-0000000000a1', 'race-guardian@example.test');
  insert into public.athletes (id, first_name, last_name) values ('88810000-0000-4000-8000-0000000000e1', 'Athlete', 'Race');
  insert into public.athlete_managers (user_id, athlete_id, relation)
    values ('88810000-0000-4000-8000-0000000000a1', '88810000-0000-4000-8000-0000000000e1', 'guardian');
  insert into public.authorization_texts (id, purpose, version, language, body)
    values ('88810000-0000-4000-8000-0000000000f1', 'import_official_results', 88810, 'zz-ZZ', 'Synthetic import text for the race test');
  insert into public.authorizations (athlete_id, purpose, text_id, accepted_at, user_id)
    values ('88810000-0000-4000-8000-0000000000e1', 'import_official_results', '88810000-0000-4000-8000-0000000000f1', '2026-10-01 10:00:00+00', '88810000-0000-4000-8000-0000000000a1');
  insert into public.organizations (id, type, country_code, parent_organization_id, name)
    values ('88810000-0000-4000-8000-0000000000b1', 'federation', 'ZZ', null, 'Federation Z');
  insert into public.results_import_sources (organization_id, provider) values ('88810000-0000-4000-8000-0000000000b1', 'zz-test');
$c$);

-- The search takes the claim; the user confirms it, so a results query could share it.
create temp table searched as
  select retry_at, claimed_at from extensions.dblink('first',
    $c$ select retry_at, claimed_at from public.results_import_claim_query('88810000-0000-4000-8000-0000000000e1', 'zz-test', '88810000-0000-4000-8000-0000000000a1', interval '1 hour') $c$
  ) as t(retry_at timestamptz, claimed_at timestamptz);
select ok((select retry_at is null and claimed_at is not null from searched), 'the search takes the claim and answers the instant it took');
select extensions.dblink_exec('admin', $c$
  insert into public.results_import_confirmations (athlete_id, organization_id, provider, confirmed_by, candidate_name, affiliations, result_count)
  values ('88810000-0000-4000-8000-0000000000e1', '88810000-0000-4000-8000-0000000000b1', 'zz-test', '88810000-0000-4000-8000-0000000000a1', 'Synthetic Swimmer', '[]', 1);
$c$);

-- The release of the search's claim and a results query run now. The sleep sits in the same
-- statement, after the call, so the first one to get the athlete's lock still holds its
-- transaction while the other one waits for it.
select extensions.dblink_send_query('first', format(
  $f$ select public.results_import_release_claim('88810000-0000-4000-8000-0000000000e1', 'zz-test', %L, interval '1 hour', interval '1 minute') as released,
            pg_sleep(2)::text as s $f$,
  (select claimed_at::text from searched)));
select extensions.dblink_send_query('second', $c$
  select (public.results_import_claim_results_query('88810000-0000-4000-8000-0000000000e1', 'zz-test', '88810000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes')).retry_at as r,
         pg_sleep(2)::text as s $c$);

create temp table released_outcome as
  select released from extensions.dblink_get_result('first') as t(released boolean, s text);
create temp table claim_outcome as
  select r from extensions.dblink_get_result('second') as t(r timestamptz, s text);
select extensions.dblink_get_result('first') as drained_first;
select extensions.dblink_get_result('second') as drained_second;

create temp table final_state as
  select last_queried_at, last_queried_by from extensions.dblink('admin',
    $c$ select last_queried_at, last_queried_by from public.results_import_queries where athlete_id = '88810000-0000-4000-8000-0000000000e1' $c$
  ) as t(last_queried_at timestamptz, last_queried_by uuid);

select is(
  (select (case when released then 1 else 0 end) + (case when r is null then 1 else 0 end) from released_outcome, claim_outcome),
  1, 'exactly one of the release and the results query won');
select ok(
  (select case when o.released then f.last_queried_by is null
                                    and c.r = f.last_queried_at + interval '1 hour'
                                    and c.r > s.claimed_at + interval '1 minute'
                                    and c.r <= clock_timestamp() + interval '1 minute'
               else true end
   from released_outcome o, claim_outcome c, final_state f, searched s),
  'if the release won, the claim is no one''s and the results query waits the short time from the release');
select ok(
  (select case when not o.released then f.last_queried_at > s.claimed_at else true end
   from released_outcome o, final_state f, searched s),
  'if the results query won, it moved the window to the moment it was used and the release found nothing to give back');
select ok(
  (select f.last_queried_at + interval '1 hour' >= s.claimed_at + interval '1 minute' from final_state f, searched s),
  'either way the window is never shorter than the short wait');

-- Round two, the order reversed: the results query reaches the athlete's lock first and shares the
-- search's claim, so the release that comes right after finds nothing to give back and must not
-- step on it. Reset the state first: no claim row, a fresh search claim and a confirmation after it.
select extensions.dblink_exec('admin', $c$
  delete from public.results_import_queries where athlete_id = '88810000-0000-4000-8000-0000000000e1';
$c$);
create temp table searched_two as
  select retry_at, claimed_at from extensions.dblink('first',
    $c$ select retry_at, claimed_at from public.results_import_claim_query('88810000-0000-4000-8000-0000000000e1', 'zz-test', '88810000-0000-4000-8000-0000000000a1', interval '1 hour') $c$
  ) as t(retry_at timestamptz, claimed_at timestamptz);
select ok((select retry_at is null and claimed_at is not null from searched_two), 'round two: the search takes a fresh claim and answers the instant it took');
select extensions.dblink_exec('admin', $c$
  insert into public.results_import_confirmations (athlete_id, organization_id, provider, confirmed_by, candidate_name, affiliations, result_count)
  values ('88810000-0000-4000-8000-0000000000e1', '88810000-0000-4000-8000-0000000000b1', 'zz-test', '88810000-0000-4000-8000-0000000000a1', 'Synthetic Swimmer', '[]', 1);
$c$);

select extensions.dblink_send_query('second', $c$
  select (public.results_import_claim_results_query('88810000-0000-4000-8000-0000000000e1', 'zz-test', '88810000-0000-4000-8000-0000000000a1', interval '1 hour', interval '15 minutes')).retry_at as r,
         pg_sleep(2)::text as s $c$);
-- Give the results query time to take the lock before the release is sent, so the order is the one named above.
select pg_sleep(0.5);
select extensions.dblink_send_query('first', format(
  $f$ select public.results_import_release_claim('88810000-0000-4000-8000-0000000000e1', 'zz-test', %L, interval '1 hour', interval '1 minute') as released,
            pg_sleep(2)::text as s $f$,
  (select claimed_at::text from searched_two)));

create temp table claim_outcome_two as
  select r from extensions.dblink_get_result('second') as t(r timestamptz, s text);
create temp table released_outcome_two as
  select released from extensions.dblink_get_result('first') as t(released boolean, s text);
select extensions.dblink_get_result('second') as drained_second_two;
select extensions.dblink_get_result('first') as drained_first_two;

create temp table final_state_two as
  select last_queried_at, last_queried_by from extensions.dblink('admin',
    $c$ select last_queried_at, last_queried_by from public.results_import_queries where athlete_id = '88810000-0000-4000-8000-0000000000e1' $c$
  ) as t(last_queried_at timestamptz, last_queried_by uuid);

select ok((select r is null from claim_outcome_two), 'round two: the results query shared the search''s claim');
select is((select released from released_outcome_two), false, 'round two: the release found nothing to give back');
select ok((select f.last_queried_at > s.claimed_at from final_state_two f, searched_two s),
  'round two: the window is at the moment the shared claim was used');
select is((select last_queried_by from final_state_two), '88810000-0000-4000-8000-0000000000a1'::uuid,
  'round two: the release did not step on the claim: it still records who used it');

select pg_temp.cleanup();
select extensions.dblink_disconnect('admin');
select extensions.dblink_disconnect('first');
select extensions.dblink_disconnect('second');

select * from finish();
rollback;
