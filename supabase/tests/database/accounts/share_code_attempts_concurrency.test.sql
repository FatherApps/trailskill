-- The limit of failed share code lookups is counted per user without gaps (issue #1027): the lookup
-- counts the failed attempts of the last 15 minutes and records the new one afterwards, so lookups
-- of the same user that overlap must wait for each other instead of all seeing the same count. A
-- lookup of another user is not blocked meanwhile. A race needs real connections whose transactions
-- overlap, so the data is committed through dblink and deleted again at the end (and before, so a
-- failed earlier run leaves nothing behind). Every wait is bounded by a lock timeout so a failure
-- cannot hang. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(12);

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
select extensions.dblink_exec('first', 'set role authenticated');
select extensions.dblink_exec('second', 'set role authenticated');
select extensions.dblink_exec('first', 'set statement_timeout = ''20s''');
select extensions.dblink_exec('second', 'set lock_timeout = ''1500ms''');

create function pg_temp.cleanup() returns void language plpgsql as $$
begin
  -- The lookups of both users go with them (on delete cascade).
  perform extensions.dblink_exec('admin', $c$
    delete from auth.users where id in ('10270000-0000-4000-8000-0000000000a1', '10270000-0000-4000-8000-0000000000a2');
  $c$);
end;
$$;

-- Looks up a share code as the given user (null: a request without a user) over the connection
-- and answers how it went: 'passed', or the SQLSTATE, message and hint of the error.
create function pg_temp.try_lookup(conn text, who uuid) returns text language plpgsql as $$
declare
  hint text;
begin
  perform extensions.dblink_exec(conn, format('set request.jwt.claims = %L',
    case when who is null then '{"role": "authenticated"}' else json_build_object('sub', who, 'role', 'authenticated')::text end));
  perform 1 from extensions.dblink(conn, $q$ select public.find_athlete_by_share_code('TS-ZZZZZZ') $q$) as t(x text);
  return 'passed';
exception when others then
  get stacked diagnostics hint = pg_exception_hint;
  return sqlstate || ' ' || sqlerrm || coalesce(' / ' || nullif(hint, ''), '');
end;
$$;

create function pg_temp.failed_lookups(who uuid) returns bigint language sql as $$
  select n from extensions.dblink('admin', format(
    $q$ select count(*) from public.athlete_share_code_lookups where user_id = %L and not matched $q$, who
  )) as t(n bigint);
$$;

select pg_temp.cleanup();
select extensions.dblink_exec('admin', $c$
  insert into auth.users (id, email) values
    ('10270000-0000-4000-8000-0000000000a1', 'parallel-guessing@example.test'),
    ('10270000-0000-4000-8000-0000000000a2', 'other-family@example.test');
  insert into public.athlete_share_code_lookups (user_id, matched)
    select '10270000-0000-4000-8000-0000000000a1', false from generate_series(1, 4);
$c$);

-- 1. Four failed lookups are on record, so the next one is the fifth and still allowed. Its
-- transaction stays open, as when two requests of the same user arrive together.
select extensions.dblink_exec('first', 'begin');
select is(pg_temp.try_lookup('first', '10270000-0000-4000-8000-0000000000a1'), 'passed', 'the fifth failed lookup of a user goes through, its transaction stays open');

-- 2. Another lookup of the same user waits for it instead of counting only the four committed ones.
select is(pg_temp.try_lookup('second', '10270000-0000-4000-8000-0000000000a1'), '55P03 canceling statement due to lock timeout',
  'a lookup of the same user waits while another one of theirs is open (lock timeout)');

-- 3. A lookup of another user is not blocked meanwhile.
select is(pg_temp.try_lookup('second', '10270000-0000-4000-8000-0000000000a2'), 'passed', 'a lookup of another user is not blocked meanwhile');

-- 4. Once the first one commits there are five failed lookups, so the limit applies.
select extensions.dblink_exec('first', 'commit');
select is(pg_temp.try_lookup('second', '10270000-0000-4000-8000-0000000000a1'), 'P0001 too_many_attempts / Try again in 15 minutes.',
  'once it commits the same user is rate limited, not blocked');

-- 5. No more than five failed lookups of the same user got through.
select is(pg_temp.failed_lookups('10270000-0000-4000-8000-0000000000a1'), 5::bigint, 'no more than 5 failed lookups of the same user got through');
select is(pg_temp.failed_lookups('10270000-0000-4000-8000-0000000000a2'), 1::bigint, 'and the other user has their own count');

-- 6. A request without a user is still refused.
select is(pg_temp.try_lookup('second', null), '42501 a share code lookup needs a signed-in user', 'a lookup without a signed-in user is refused');

select pg_temp.cleanup();
select extensions.dblink_disconnect('admin');
select extensions.dblink_disconnect('first');
select extensions.dblink_disconnect('second');

-- 7. The lookup stays a security definer function with an empty search_path that the app roles
-- cannot call directly.
select is((select prosecdef from pg_proc where oid = 'app.athlete_by_share_code(text)'::regprocedure), true, 'the lookup is still security definer');
select is((select proconfig from pg_proc where oid = 'app.athlete_by_share_code(text)'::regprocedure), array['search_path=""'], 'and still has an empty search_path');
select ok(not has_function_privilege('public', 'app.athlete_by_share_code(text)', 'execute'), 'public cannot execute it');
select ok(not has_function_privilege('anon', 'app.athlete_by_share_code(text)', 'execute'), 'anon cannot execute it');
select ok(not has_function_privilege('authenticated', 'app.athlete_by_share_code(text)', 'execute'), 'authenticated cannot execute it');

select * from finish();
rollback;
