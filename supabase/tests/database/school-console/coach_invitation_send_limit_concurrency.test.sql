-- The limit on sending a coach invitation is counted without gaps (issue #1141): claim_coach_invitation_send counts the sends
-- and records the new one afterwards, so claims that overlap must wait for each other instead of all seeing the same count.
-- That holds per admin and per recipient, and a claim of another admin on another recipient is not blocked meanwhile. A race
-- needs real connections whose transactions overlap, so the data is committed through dblink and deleted again at the end (and
-- before, so a failed earlier run leaves nothing behind). Every wait is bounded by a lock timeout so a failure cannot hang.
-- All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(14);

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
  -- The sends go with their invitations (on delete cascade).
  perform extensions.dblink_exec('admin', $c$
    delete from public.coach_invitations where school_id = '11410000-0000-4000-8000-0000000001b1';
    delete from public.school_memberships where school_id = '11410000-0000-4000-8000-0000000001b1';
    delete from public.schools where id = '11410000-0000-4000-8000-0000000001b1';
    delete from auth.users where id in (
      '11410000-0000-4000-8000-0000000001a1', '11410000-0000-4000-8000-0000000001a2',
      '11410000-0000-4000-8000-0000000001a3', '11410000-0000-4000-8000-0000000001a4');
  $c$);
end;
$$;

-- Claims a send as the given user (null: a request without a user) over the connection and answers how it went: the claim
-- ('claimed', 'caller_rate_limited', 'recipient_rate_limited') or the SQLSTATE and message of the error.
create function pg_temp.try_claim(conn text, who uuid, invitation uuid) returns text language plpgsql as $$
declare
  claim text;
begin
  perform extensions.dblink_exec(conn, format('set request.jwt.claims = %L',
    case when who is null then '{"role": "authenticated"}' else json_build_object('sub', who, 'role', 'authenticated')::text end));
  select t.x into claim from extensions.dblink(conn, format($q$ select public.claim_coach_invitation_send(%L) $q$, invitation)) as t(x text);
  return claim;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;

create function pg_temp.sends_of(who uuid) returns bigint language sql as $$
  select n from extensions.dblink('admin', format($q$ select count(*) from public.coach_invitation_sends where sent_by = %L $q$, who)) as t(n bigint);
$$;
create function pg_temp.sends_to(invitation uuid) returns bigint language sql as $$
  select n from extensions.dblink('admin', format($q$ select count(*) from public.coach_invitation_sends where invitation_id = %L $q$, invitation)) as t(n bigint);
$$;

-- Admin 1 has 29 sends on record (one less than the limit of an admin) and c1 and c2 have none; c3 has 2 (one less than the
-- limit of a recipient), sent by admin 4. Admins 1, 2 and 3 administer the school.
select pg_temp.cleanup();
select extensions.dblink_exec('admin', $c$
  insert into auth.users (id, email) values
    ('11410000-0000-4000-8000-0000000001a1', 'parallel-admin-1@example.test'),
    ('11410000-0000-4000-8000-0000000001a2', 'parallel-admin-2@example.test'),
    ('11410000-0000-4000-8000-0000000001a3', 'parallel-admin-3@example.test'),
    ('11410000-0000-4000-8000-0000000001a4', 'parallel-admin-4@example.test');
  insert into public.schools (id, name) values ('11410000-0000-4000-8000-0000000001b1', 'Parallel Send Limit School');
  insert into public.school_memberships (school_id, user_id, role)
    select '11410000-0000-4000-8000-0000000001b1', id, 'school_admin' from auth.users where email like 'parallel-admin-%@example.test';
  insert into public.coach_invitations (id, created_by, school_id, email) values
    ('11410000-0000-4000-8000-0000000001c1', '11410000-0000-4000-8000-0000000001a1', '11410000-0000-4000-8000-0000000001b1', 'one@example.test'),
    ('11410000-0000-4000-8000-0000000001c2', '11410000-0000-4000-8000-0000000001a1', '11410000-0000-4000-8000-0000000001b1', 'two@example.test'),
    ('11410000-0000-4000-8000-0000000001c3', '11410000-0000-4000-8000-0000000001a1', '11410000-0000-4000-8000-0000000001b1', 'three@example.test');
  insert into public.coach_invitations (id, created_by, school_id, email)
    select ('11410000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, '11410000-0000-4000-8000-0000000001a1',
      '11410000-0000-4000-8000-0000000001b1', 'filler-' || n || '@example.test'
    from generate_series(1, 29) as n;
  insert into public.coach_invitation_sends (sent_by, invitation_id)
    select '11410000-0000-4000-8000-0000000001a1', ('11410000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 29) as n;
  insert into public.coach_invitation_sends (sent_by, invitation_id)
    select '11410000-0000-4000-8000-0000000001a4', '11410000-0000-4000-8000-0000000001c3' from generate_series(1, 2);
$c$);

-- 1. Admin 1 claims their 30th send, the last one allowed. Its transaction stays open, as when two requests of the same admin
-- arrive together.
select extensions.dblink_exec('first', 'begin');
select is(pg_temp.try_claim('first', '11410000-0000-4000-8000-0000000001a1', '11410000-0000-4000-8000-0000000001c1'), 'claimed',
  'the last send allowed to an admin is claimed, its transaction stays open');

-- 2. Another claim of the same admin, even for another recipient, waits for it instead of counting only the 29 committed ones.
select is(pg_temp.try_claim('second', '11410000-0000-4000-8000-0000000001a1', '11410000-0000-4000-8000-0000000001c2'), '55P03 canceling statement due to lock timeout',
  'a claim of the same admin waits while another one of theirs is open (lock timeout)');

-- 3. A claim of another admin on another recipient is not blocked meanwhile.
select is(pg_temp.try_claim('second', '11410000-0000-4000-8000-0000000001a2', '11410000-0000-4000-8000-0000000001c2'), 'claimed',
  'a claim of another admin on another recipient is not blocked meanwhile');

-- 4. Once the first one commits the admin has 30 sends, so the limit applies.
select extensions.dblink_exec('first', 'commit');
select is(pg_temp.try_claim('second', '11410000-0000-4000-8000-0000000001a1', '11410000-0000-4000-8000-0000000001c2'), 'caller_rate_limited',
  'once it commits the same admin is rate limited, not blocked');

-- 5. No more than 30 sends of the same admin got through, and the other admin has their own count.
select is(pg_temp.sends_of('11410000-0000-4000-8000-0000000001a1'), 30::bigint, 'no more than 30 sends of the same admin got through');
select is(pg_temp.sends_of('11410000-0000-4000-8000-0000000001a2'), 1::bigint, 'and the other admin has their own count');

-- 6. The same for a recipient: admin 2 claims the third send to c3, the last one allowed, and keeps its transaction open.
select extensions.dblink_exec('first', 'begin');
select is(pg_temp.try_claim('first', '11410000-0000-4000-8000-0000000001a2', '11410000-0000-4000-8000-0000000001c3'), 'claimed',
  'the last send allowed to a recipient is claimed, its transaction stays open');

-- 7. Another admin claiming the same recipient waits for it instead of counting only the 2 committed ones.
select is(pg_temp.try_claim('second', '11410000-0000-4000-8000-0000000001a3', '11410000-0000-4000-8000-0000000001c3'), '55P03 canceling statement due to lock timeout',
  'a claim of another admin on the same recipient waits while another one is open (lock timeout)');

-- 8. Once the first one commits the recipient has 3 sends, so the limit applies.
select extensions.dblink_exec('first', 'commit');
select is(pg_temp.try_claim('second', '11410000-0000-4000-8000-0000000001a3', '11410000-0000-4000-8000-0000000001c3'), 'recipient_rate_limited',
  'once it commits the recipient is rate limited for every admin');
select is(pg_temp.sends_to('11410000-0000-4000-8000-0000000001c3'), 3::bigint, 'no more than 3 sends to the same recipient got through');

-- 9. A request without a user is still refused.
select is(pg_temp.try_claim('second', null, '11410000-0000-4000-8000-0000000001c1'), '42501 claiming a send needs a signed-in user', 'a claim without a signed-in user is refused');

select pg_temp.cleanup();
select extensions.dblink_disconnect('admin');
select extensions.dblink_disconnect('first');
select extensions.dblink_disconnect('second');

-- 10. The claim stays a security definer function with an empty search_path that anon cannot call.
select is((select prosecdef from pg_proc where oid = 'public.claim_coach_invitation_send(uuid)'::regprocedure), true, 'the claim is security definer');
select is((select proconfig from pg_proc where oid = 'public.claim_coach_invitation_send(uuid)'::regprocedure), array['search_path=""'], 'and has an empty search_path');
select ok(not has_function_privilege('anon', 'public.claim_coach_invitation_send(uuid)', 'execute'), 'anon cannot execute it');

select * from finish();
rollback;
