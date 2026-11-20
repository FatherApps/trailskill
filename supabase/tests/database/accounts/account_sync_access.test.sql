-- Account deletion, who may sync (issue #1244): every user that is not marked has a row in account_sync_access, which the streams of
-- powersync/sync-config.yaml require. Marking takes it away; cancelling, a stopped request or closing the request gives it back.
-- Clients have no access to the table. All users are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

create function pg_temp.u(text) returns uuid language sql as $$ select ('12460000-0000-4000-8000-0000000000' || $1)::uuid $$;

select is((select count(*) from auth.users u where not exists (select 1 from public.account_sync_access a where a.user_id = u.id)), 0::bigint, 'every existing user may sync');

insert into auth.users (id, email) values (pg_temp.u('a1'), 'sync-1@example.test'), (pg_temp.u('a2'), 'sync-2@example.test');
select is((select count(*) from public.account_sync_access where user_id in (pg_temp.u('a1'), pg_temp.u('a2'))), 2::bigint, 'a new user gets a row');

create function pg_temp.mark(text) returns void language plpgsql as $$
begin
  perform public.confirm_account_deletion(pg_temp.u($1), public.request_account_deletion(pg_temp.u($1)) ->> 'code');
end;
$$;

select pg_temp.mark('a1');
select is((select count(*) from public.account_sync_access where user_id = pg_temp.u('a1')), 0::bigint, 'marking takes the row away');
select is((select count(*) from public.account_sync_access where user_id = pg_temp.u('a2')), 1::bigint, 'and only that user''s');

select public.cancel_account_deletion(pg_temp.u('a1'));
select is((select count(*) from public.account_sync_access where user_id = pg_temp.u('a1')), 1::bigint, 'cancelling gives it back');

select pg_temp.mark('a1');
update public.account_deletion_requests set status = 'stopped' where user_id = pg_temp.u('a1');
select is((select count(*) from public.account_sync_access where user_id = pg_temp.u('a1')), 1::bigint, 'a stopped request gives it back');
delete from public.account_deletion_requests where user_id = pg_temp.u('a1');
select is((select count(*) from public.account_sync_access where user_id = pg_temp.u('a1')), 1::bigint, 'closing the request keeps it');

-- An old stopped request that a worker touches (the final email) must not give the sync back to a user marked again.
insert into auth.users (id, email) values (pg_temp.u('a3'), 'sync-3@example.test');
select pg_temp.mark('a3');
update public.account_deletion_requests set status = 'stopped' where user_id = pg_temp.u('a3');
select pg_temp.mark('a3');
select is((select count(*) from public.account_sync_access where user_id = pg_temp.u('a3')), 0::bigint, 'marked again after a stopped request: no row');
select public.claim_account_deletion_mail();
select public.finish_account_deletion_mail((select id from public.account_deletion_requests where user_id = pg_temp.u('a3') and status = 'stopped'), 'stopped');
select is((select count(*) from public.account_sync_access where user_id = pg_temp.u('a3')), 0::bigint, 'the final email of the old request does not give it back');
select public.cancel_account_deletion(pg_temp.u('a3'));

-- The day-30 erase removes the user and the row with it, and the closing of the request does not bring a row back.
select pg_temp.mark('a2');
update public.account_deletion_requests set delete_after = now() - interval '1 day' where user_id = pg_temp.u('a2');
select is((public.erase_account((select id from public.account_deletion_requests where user_id = pg_temp.u('a2'))) ->> 'status'), 'deleted', 'a2 is erased');
select is((select count(*) from public.account_sync_access where user_id = pg_temp.u('a2')), 0::bigint, 'an erased user has no row');
delete from public.account_deletion_requests where user_id = pg_temp.u('a2');
select is((select count(*) from public.account_sync_access where user_id = pg_temp.u('a2')), 0::bigint, 'and closing its request brings none back');

-- Nobody but the database reads or writes it.
set local role authenticated;
select throws_ok($$select * from public.account_sync_access$$, '42501', null, 'a signed-in user cannot read the table');
reset role;
select is((select count(*) from pg_publication_tables where pubname = 'powersync' and tablename = 'account_sync_access'), 1::bigint, 'PowerSync replicates it');
select is((select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'account_sync_access_for_new_user'), 1::bigint, 'the trigger of new users is in place');

select * from finish();
rollback;
