-- Module accounts: who may sync (issue #1244). A marked account is blocked and the sync must deliver nothing to it, but PowerSync Sync
-- Streams cannot say "NOT IN (subquery)": only a positive condition works. So this table holds one row for every account that may
-- sync, i.e. every user that is not marked for deletion, and the streams of powersync/sync-config.yaml require that row.
-- Maintained by triggers: a new user gets a row; a request that marks the account takes it away; a request that goes (cancelled, stopped
-- or closed) gives it back while the user exists. Nothing else writes here and clients have no access: PowerSync reads it by replication.

create table public.account_sync_access (
  user_id uuid primary key references auth.users on delete cascade
);

alter table public.account_sync_access enable row level security;
revoke all on table public.account_sync_access from anon, authenticated;

-- Every existing account may sync, except the ones already marked (none when this runs, but the statement is exact).
insert into public.account_sync_access (user_id)
select u.id from auth.users u
where not exists (select 1 from public.account_deletion_requests r where r.user_id = u.id and r.status = 'pending');

alter publication powersync add table public.account_sync_access;

create function app.grant_account_sync_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_sync_access (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

revoke execute on function app.grant_account_sync_access() from public, anon, authenticated;

create trigger account_sync_access_for_new_user after insert on auth.users
  for each row execute function app.grant_account_sync_access();

-- The state of the user decides, never the row that was touched: an old stopped or deleted request that a worker updates or deletes
-- must not give the sync back to a user who has another request pending. A user that exists and has no pending request may sync.
create function app.sync_access_follows_deletion_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  if exists (select 1 from public.account_deletion_requests r where r.user_id = account and r.status = 'pending') then
    delete from public.account_sync_access a where a.user_id = account;
  else
    insert into public.account_sync_access (user_id)
    select u.id from auth.users u where u.id = account
    on conflict do nothing;
  end if;
  return null;
end;
$$;

revoke execute on function app.sync_access_follows_deletion_request() from public, anon, authenticated;

create trigger account_sync_access_follows_request after insert or update or delete on public.account_deletion_requests
  for each row execute function app.sync_access_follows_deletion_request();

select app.guard_marked_account_writes('public.account_sync_access');
