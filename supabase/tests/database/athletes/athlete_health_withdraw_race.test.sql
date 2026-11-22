-- Health data versus a withdrawal at the same time (issue #1369): an insert of athlete_health that starts while the withdrawal of
-- store_health_data is still open must wait for it and then be refused, so no row is left behind after the purge. A race needs real
-- connections whose transactions overlap, so the data is committed through dblink and deleted again at the end (and before, so a
-- failed earlier run leaves nothing behind). Every wait is bounded by a timeout so a failure cannot hang. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(8);

select set_config(
  'app.dblink_conn',
  format('dbname=%s user=postgres password=postgres host=%s port=%s',
    current_database(), coalesce(host(inet_server_addr()), '127.0.0.1'), current_setting('port')),
  true
);
select extensions.dblink_connect('admin', current_setting('app.dblink_conn'));
select extensions.dblink_connect('withdraw', current_setting('app.dblink_conn'));
select extensions.dblink_connect('insert', current_setting('app.dblink_conn'));
select extensions.dblink_exec('insert', 'set role authenticated');
select extensions.dblink_exec('insert', 'set lock_timeout = ''15s''');
select extensions.dblink_exec('insert', $q$set request.jwt.claims = '{"sub": "13690000-0000-4000-8000-0000000000f1", "role": "authenticated"}'$q$);

create function pg_temp.cleanup() returns void language plpgsql as $$
begin
  perform extensions.dblink_exec('admin', $c$
    delete from public.athlete_health where athlete_id in ('13690000-0000-4000-8000-0000000000f2', '13690000-0000-4000-8000-0000000000f3');
    delete from public.authorization_status where athlete_id in ('13690000-0000-4000-8000-0000000000f2', '13690000-0000-4000-8000-0000000000f3');
    delete from public.athlete_managers where athlete_id in ('13690000-0000-4000-8000-0000000000f2', '13690000-0000-4000-8000-0000000000f3');
    delete from public.athletes where id in ('13690000-0000-4000-8000-0000000000f2', '13690000-0000-4000-8000-0000000000f3');
    delete from auth.users where id = '13690000-0000-4000-8000-0000000000f1';
  $c$);
end;
$$;

create function pg_temp.health_rows(a uuid) returns bigint language sql as $$
  select n from extensions.dblink('admin', format('select count(*) from public.athlete_health where athlete_id = %L', a)) as t(n bigint);
$$;

select pg_temp.cleanup();
-- Guardian F manages f2 and f3; store_health_data is in force for both (the status row is what the triggers keep).
select extensions.dblink_exec('admin', $c$
  insert into auth.users (id, email) values ('13690000-0000-4000-8000-0000000000f1', 'health-race-guardian@example.test');
  insert into public.athletes (id, first_name, last_name) values
    ('13690000-0000-4000-8000-0000000000f2', 'Athlete', 'R2'), ('13690000-0000-4000-8000-0000000000f3', 'Athlete', 'R3');
  insert into public.athlete_managers (user_id, athlete_id, relation) values
    ('13690000-0000-4000-8000-0000000000f1', '13690000-0000-4000-8000-0000000000f2', 'guardian'),
    ('13690000-0000-4000-8000-0000000000f1', '13690000-0000-4000-8000-0000000000f3', 'guardian');
  insert into public.authorization_status (athlete_id, purpose, is_granted) values
    ('13690000-0000-4000-8000-0000000000f2', 'store_health_data', true), ('13690000-0000-4000-8000-0000000000f3', 'store_health_data', true);
$c$);

-- 1. The withdrawal of f2 is open (its transaction updated the status row and has not committed).
select extensions.dblink_exec('withdraw', 'begin');
select extensions.dblink_exec('withdraw', $q$update public.authorization_status set is_granted = false
  where athlete_id = '13690000-0000-4000-8000-0000000000f2' and purpose = 'store_health_data'$q$);

-- 2. The insert for f2 starts now, from its own connection, and has to wait for the withdrawal.
select is(extensions.dblink_send_query('insert', $q$insert into public.athlete_health (athlete_id, blood_type)
  values ('13690000-0000-4000-8000-0000000000f2', 'O+')$q$), 1, 'the insert for f2 is sent while the withdrawal is open');
select pg_sleep(0.7);
select is(extensions.dblink_is_busy('insert'), 1, 'the insert waits for the open withdrawal');

-- 3. An insert for f3 (no withdrawal) is not blocked: it goes through another connection and is accepted.
select extensions.dblink_exec('admin', $q$set role authenticated$q$);
select extensions.dblink_exec('admin', $q$set request.jwt.claims = '{"sub": "13690000-0000-4000-8000-0000000000f1", "role": "authenticated"}'$q$);
select is(extensions.dblink_exec('admin', $q$insert into public.athlete_health (athlete_id, blood_type) values ('13690000-0000-4000-8000-0000000000f3', 'A+')$q$),
  'INSERT 0 1', 'an insert for an athlete without a withdrawal is not blocked');
select extensions.dblink_exec('admin', 'reset role');

-- 4. The withdrawal commits: the waiting insert looks again, finds the purpose no longer granted and is refused.
select extensions.dblink_exec('withdraw', 'commit');
create function pg_temp.insert_result() returns text language plpgsql as $$
begin
  perform * from extensions.dblink_get_result('insert') as t(x text);
  return 'inserted';
exception when others then
  -- The error result is consumed; the connection must also be told there is nothing more before it takes another command.
  declare code text := sqlstate;
  begin
    begin perform * from extensions.dblink_get_result('insert') as t(x text); exception when others then null; end;
    return code;
  end;
end;
$$;
select is(pg_temp.insert_result(), '42501', 'once the withdrawal commits the waiting insert is refused');
select is(pg_temp.health_rows('13690000-0000-4000-8000-0000000000f2'), 0::bigint, 'no health row is left for the withdrawn athlete');
select is(pg_temp.health_rows('13690000-0000-4000-8000-0000000000f3'), 1::bigint, 'the other athlete keeps their row');

-- 5. The other order: a withdrawal that arrives while an insert is open waits for it and then purges the new row.
select extensions.dblink_exec('insert', 'begin');
select extensions.dblink_exec('insert', $q$insert into public.athlete_health (athlete_id, blood_type) values ('13690000-0000-4000-8000-0000000000f3', 'B+')
  on conflict (athlete_id) do update set blood_type = excluded.blood_type$q$);
select extensions.dblink_exec('withdraw', 'set lock_timeout = ''1500ms''');
create function pg_temp.withdraw_f3() returns text language plpgsql as $$
begin
  perform extensions.dblink_exec('withdraw', $q$update public.authorization_status set is_granted = false
    where athlete_id = '13690000-0000-4000-8000-0000000000f3' and purpose = 'store_health_data'$q$);
  return 'withdrawn';
exception when others then
  return sqlstate;
end;
$$;
select is(pg_temp.withdraw_f3(), '55P03', 'a withdrawal waits while an insert of that athlete is open');
select extensions.dblink_exec('insert', 'commit');
select pg_temp.withdraw_f3();
select is(pg_temp.health_rows('13690000-0000-4000-8000-0000000000f3'), 0::bigint, 'after both finish the withdrawn athlete has no health row');

select pg_temp.cleanup();
select * from finish();
rollback;
