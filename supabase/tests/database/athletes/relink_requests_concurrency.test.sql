-- Two approvals of the same relink request at once move the times once (issue #1251): resolve_athlete_relink locks the row of the request, so
-- the second approval waits for the first and then finds the request resolved. A race needs real connections whose transactions overlap, so
-- the data is committed through dblink and deleted again at the end (and before, so a failed earlier run leaves nothing behind). Every wait
-- is bounded by a statement timeout so a failure cannot hang. All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(9);

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
select extensions.dblink_exec('second', 'set statement_timeout = ''20s''');

create function pg_temp.cleanup() returns void language plpgsql as $$
begin
  perform extensions.dblink_exec('admin', $c$
    delete from public.measurements where school_id = '12510000-0000-4000-8000-0000000003b1';
    delete from public.athlete_relink_requests where school_id = '12510000-0000-4000-8000-0000000003b1';
    delete from public.athlete_schools where school_id = '12510000-0000-4000-8000-0000000003b1';
    delete from public.school_memberships where school_id = '12510000-0000-4000-8000-0000000003b1';
    delete from public.schools where id = '12510000-0000-4000-8000-0000000003b1';
    delete from public.former_athlete_keys where athlete_id = '12510000-0000-4000-8000-0000000003e2';
    delete from public.athlete_managers where athlete_id = '12510000-0000-4000-8000-0000000003e1';
    delete from public.athletes where id in ('12510000-0000-4000-8000-0000000003e1', '12510000-0000-4000-8000-0000000003e2');
    delete from auth.users where id in (
      '12510000-0000-4000-8000-0000000003a1', '12510000-0000-4000-8000-0000000003a2', '12510000-0000-4000-8000-0000000003a3');
  $c$);
end;
$$;

-- Calls resolve_athlete_relink as the given user over the connection and answers the result, or the SQLSTATE and message of the error.
create function pg_temp.try_resolve(conn text, who uuid, request uuid, approve boolean) returns text language plpgsql as $$
declare
  answer text;
begin
  perform extensions.dblink_exec(conn, format('set request.jwt.claims = %L', json_build_object('sub', who, 'role', 'authenticated')::text));
  select t.x into answer from extensions.dblink(conn, format($q$ select public.resolve_athlete_relink(%L, %L::boolean)::text $q$, request, approve)) as t(x text);
  return answer;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;

create function pg_temp.count_of(query text) returns bigint language sql as $$
  select n from extensions.dblink('admin', $1) as t(n bigint);
$$;

-- Admins 1 and 2 administer the school; guardian 3 manages X. The marker M holds two times of the school and the key of M is made up.
select pg_temp.cleanup();
select extensions.dblink_exec('admin', $c$
  insert into auth.users (id, email) values
    ('12510000-0000-4000-8000-0000000003a1', 'relink-admin-1@example.test'),
    ('12510000-0000-4000-8000-0000000003a2', 'relink-admin-2@example.test'),
    ('12510000-0000-4000-8000-0000000003a3', 'relink-guardian@example.test');
  insert into public.schools (id, name) values ('12510000-0000-4000-8000-0000000003b1', 'Parallel Relink School');
  insert into public.school_memberships (school_id, user_id, role) values
    ('12510000-0000-4000-8000-0000000003b1', '12510000-0000-4000-8000-0000000003a1', 'school_admin'),
    ('12510000-0000-4000-8000-0000000003b1', '12510000-0000-4000-8000-0000000003a2', 'school_admin');
  insert into public.athletes (id, first_name, last_name) values
    ('12510000-0000-4000-8000-0000000003e1', 'Athlete', 'X'), ('12510000-0000-4000-8000-0000000003e2', 'Nadador', 'anterior');
  insert into public.athlete_managers (user_id, athlete_id, relation)
    values ('12510000-0000-4000-8000-0000000003a3', '12510000-0000-4000-8000-0000000003e1', 'guardian');
  insert into public.athlete_schools (athlete_id, school_id, ended_at, ended_by)
    values ('12510000-0000-4000-8000-0000000003e2', '12510000-0000-4000-8000-0000000003b1', now(), '12510000-0000-4000-8000-0000000003a1');
  insert into public.former_athlete_keys (athlete_id, key_hash)
    values ('12510000-0000-4000-8000-0000000003e2', encode(sha256(convert_to('1111-2222-3333-4444-5555', 'UTF8')), 'hex'));
  insert into public.measurements
    (id, created_by, school_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, device_id, captured_at)
  select ('12510000-0000-4000-8000-00000000030' || n)::uuid, '12510000-0000-4000-8000-0000000003a1', '12510000-0000-4000-8000-0000000003b1',
    'repetition', '12510000-0000-4000-8000-0000000003e2', 3000 + n, 'FR', '50m', 'SCM', 'training', 'screen_button', 'dev-1', now() - make_interval(mins => n)
  from generate_series(1, 2) as n;
$c$);

-- The family asks, as the guardian, over a connection of its own.
select extensions.dblink_exec('first', format('set request.jwt.claims = %L',
  json_build_object('sub', '12510000-0000-4000-8000-0000000003a3', 'role', 'authenticated')::text));
select is((select t.x from extensions.dblink('first', $q$ select public.request_athlete_relink('12510000-0000-4000-8000-0000000003e1', '1111-2222-3333-4444-5555') $q$) as t(x text)),
  'requested', 'the family asks with the key');

create function pg_temp.the_request() returns uuid language sql as $$
  select id from extensions.dblink('admin', $q$ select id from public.athlete_relink_requests where school_id = '12510000-0000-4000-8000-0000000003b1' $q$) as t(id uuid);
$$;

-- 1. Admin 1 approves; the transaction stays open, as when two admins press the button together.
select extensions.dblink_exec('first', 'begin');
select is(pg_temp.try_resolve('first', '12510000-0000-4000-8000-0000000003a1', pg_temp.the_request(), true),
  '{"moved": 2, "status": "approved"}', 'the first approval moves the two times, its transaction stays open');

-- 2. Admin 2 approves the same request meanwhile: the call is sent and has to wait for the row of the request.
select extensions.dblink_exec('second', format('set request.jwt.claims = %L',
  json_build_object('sub', '12510000-0000-4000-8000-0000000003a2', 'role', 'authenticated')::text));
select extensions.dblink_send_query('second', format($q$ select public.resolve_athlete_relink(%L, true)::text $q$, pg_temp.the_request()));
select pg_sleep(0.7);
select is(extensions.dblink_is_busy('second'), 1, 'the second approval waits while the first one is open');

-- 3. Once the first commits, the second finds the request resolved and moves nothing.
select extensions.dblink_exec('first', 'commit');
select is((select t.x from extensions.dblink_get_result('second') as t(x text)), '{"status": "already_resolved"}',
  'the second approval finds the request resolved');
select is(pg_temp.count_of($q$ select count(*) from public.measurements where athlete_id = '12510000-0000-4000-8000-0000000003e1' $q$), 2::bigint,
  'the two times are on the swimmer of the family, once');
select is(pg_temp.count_of($q$ select count(*) from public.measurements where athlete_id = '12510000-0000-4000-8000-0000000003e2' $q$), 0::bigint,
  'and none is left on the marker');
select is(pg_temp.count_of($q$ select moved_count from public.athlete_relink_requests where school_id = '12510000-0000-4000-8000-0000000003b1' $q$), 2::bigint,
  'the request records the two times once');
select is(pg_temp.count_of($q$ select count(*) from pg_trigger where tgrelid = 'public.measurements'::regclass and tgenabled <> 'O' $q$), 0::bigint,
  'the triggers of measurements are back on in the database');

select pg_temp.cleanup();
select is(pg_temp.count_of($q$ select count(*) from public.schools where id = '12510000-0000-4000-8000-0000000003b1' $q$), 0::bigint, 'the data of the test is deleted');
select extensions.dblink_disconnect('admin');
select extensions.dblink_disconnect('first');
select extensions.dblink_disconnect('second');

select * from finish();
rollback;
