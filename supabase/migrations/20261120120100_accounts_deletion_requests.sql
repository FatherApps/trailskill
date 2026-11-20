-- Module accounts: delete an account after a 30-day grace period (issue #1244). A user asks for the deletion with a code sent
-- to the account email; confirming the code MARKS the account ("se borra en 30 días"); a daily worker deletes it on day 30
-- (20261120120200). While marked the account is blocked: its writes are refused and nothing syncs to it. The user cancels by
-- signing in again. Rule of the maintainer: a user linked to a school cannot delete the data until the school ends the link.
--
-- Everything here is called by the Edge Function accounts-delete-account as service_role, after it verified the JWT: a user
-- must not be able to ask the database for their own code (a stolen token would skip the email check). Only
-- account_deletion_status() is for the signed-in user. The tables have row level security and no policies: only the functions
-- below touch them.

-- One row per request. The email lives here only until the last email leaves and goes with the row; nowhere else keeps it.
-- former_athlete_keys holds, until the confirmation email leaves, the plain keys of the anonymized swimmers (the server keeps
-- only their hash, in former_athlete_keys). No foreign key to auth.users: the user is deleted while the row lives on.
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'deleted', 'stopped')),
  requested_at timestamptz not null default now(),
  delete_after timestamptz not null,
  reminder_sent_at timestamptz,
  mail_claimed_at timestamptz,
  former_athlete_keys text[] not null default '{}'
);

-- One open request per user; the sync and the write guard look the user up here.
create unique index account_deletion_requests_pending_idx on public.account_deletion_requests (user_id) where status = 'pending';

-- The code of the confirmation: salted hash only, one per user.
create table public.account_deletion_codes (
  user_id uuid primary key,
  code_hash text not null,
  salt text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0
);

-- Counts the codes sent per account, like coach_invitation_sends: the count is in the database, so it survives restarts.
create table public.account_deletion_code_sends (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  sent_at timestamptz not null default now()
);
create index account_deletion_code_sends_user_idx on public.account_deletion_code_sends (user_id, sent_at);

-- What was deleted, with nothing of the user: a random id, the time, the roles and counts.
create table public.account_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  erased_at timestamptz not null default now(),
  roles text[] not null default '{}',
  counts jsonb not null default '{}'
);

-- The server keeps only the hash of the key an anonymized swimmer was given (to relink their times later).
create table public.former_athlete_keys (
  athlete_id uuid primary key references public.athletes on delete cascade,
  key_hash text not null unique
);

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_codes enable row level security;
alter table public.account_deletion_code_sends enable row level security;
alter table public.account_deletion_audit enable row level security;
alter table public.former_athlete_keys enable row level security;
revoke all on table public.account_deletion_requests, public.account_deletion_codes, public.account_deletion_code_sends,
  public.account_deletion_audit, public.former_athlete_keys from anon, authenticated;

-- PowerSync reads only who is marked: the column list keeps the email out of the replication stream. A column list must hold
-- the replica identity (id).
alter publication powersync add table public.account_deletion_requests (id, user_id, status);

-- Is the account marked for deletion? Security definer: clients have no grant on the table.
create function app.account_marked_for_deletion(account uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.account_deletion_requests r where r.user_id = account and r.status = 'pending');
$$;

revoke execute on function app.account_marked_for_deletion(uuid) from public, anon;
grant execute on function app.account_marked_for_deletion(uuid) to authenticated, service_role;

-- The write guard of a marked account. A trigger, not only row level security, because the security definer functions the app
-- calls (create_managed_athlete, accept_invitation, the share codes, ...) skip policies and a trigger still sees the caller.
-- No signed-in user (service role, the worker, the owner) is never refused.
create function app.refuse_marked_account_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and app.account_marked_for_deletion(auth.uid()) then
    raise exception 'the account is marked for deletion' using errcode = '42501';
  end if;
  return null;
end;
$$;

revoke execute on function app.refuse_marked_account_write() from public, anon, authenticated;

-- Puts the guard on a table. A new table in the public schema calls this in its migration (a database test fails otherwise).
create function app.guard_marked_account_writes(target regclass)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from pg_catalog.pg_trigger t where t.tgrelid = target and t.tgname = 'account_marked_refuses_write') then
    execute format('drop trigger account_marked_refuses_write on %s', target);
  end if;
  execute format(
    'create trigger account_marked_refuses_write before insert or update or delete on %s for each statement execute function app.refuse_marked_account_write()',
    target
  );
end;
$$;

revoke execute on function app.guard_marked_account_writes(regclass) from public, anon, authenticated;

-- Every table of the public schema, not only the ones clients may write: many tables are written only by the security definer
-- functions the app calls (share codes, family timing transfers, results import, ...). A database test fails when a table has no guard.
do $$
declare
  t record;
begin
  for t in select c.oid::regclass as target from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') loop
    perform app.guard_marked_account_writes(t.target);
  end loop;
end;
$$;

-- Photo files go through the Storage API, not through a table: the same refusal as a restrictive policy.
create policy account_marked_refuses_photo_insert on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'athlete-photos' or not app.account_marked_for_deletion());
create policy account_marked_refuses_photo_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'athlete-photos' or not app.account_marked_for_deletion())
  with check (bucket_id <> 'athlete-photos' or not app.account_marked_for_deletion());
create policy account_marked_refuses_photo_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'athlete-photos' or not app.account_marked_for_deletion());

-- Why a user may not delete: a platform admin (support does it), an active school_admin or coach membership, or a swimmer they
-- manage that is still active in a school. null when nothing blocks. The schools are named so the screen says whom to contact.
create function app.account_deletion_blockers(account uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found_schools jsonb;
begin
  if exists (select 1 from public.platform_admins p where p.user_id = account) then
    return jsonb_build_object('reason', 'platform_admin', 'schools', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name, s.id), '[]'::jsonb) into found_schools
  from public.schools s
  where s.id in (
    select m.school_id from public.school_memberships m
    where m.user_id = account and (m.role = 'school_admin' or m.deactivated_at is null)
    union
    select active.school_id
    from public.athlete_managers am
    cross join lateral app.athlete_active_school_ids(am.athlete_id) as active(school_id)
    where am.user_id = account
  );
  if found_schools = '[]'::jsonb then
    return null;
  end if;
  return jsonb_build_object('reason', 'school', 'schools', found_schools);
end;
$$;

revoke execute on function app.account_deletion_blockers(uuid) from public, anon, authenticated;

-- 1. A code is issued: answers it (to be emailed by the caller, never to the user), the account email, or why not.
create function public.request_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- PROVISIONAL starting values, for the maintainer to confirm (issue #1244): codes per account in the window.
  send_limit constant integer := 3;
  send_window constant interval := '24 hours';
  code_lifetime constant interval := '10 minutes';
  existing timestamptz;
  blockers jsonb;
  account_email text;
  new_code text;
  new_salt text;
begin
  if p_user_id is null then
    raise exception 'a user id is required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':account-deletion', 0));

  select r.delete_after into existing from public.account_deletion_requests r where r.user_id = p_user_id and r.status = 'pending';
  if existing is not null then
    return jsonb_build_object('status', 'already_marked', 'delete_after', existing);
  end if;
  blockers := app.account_deletion_blockers(p_user_id);
  if blockers is not null then
    return jsonb_build_object('status', 'blocked') || blockers;
  end if;
  select u.email into account_email from auth.users u where u.id = p_user_id;
  if account_email is null or account_email = '' then
    raise exception 'the account has no email' using errcode = 'P0002';
  end if;

  delete from public.account_deletion_code_sends s where s.user_id = p_user_id and s.sent_at < now() - send_window;
  if (select count(*) from public.account_deletion_code_sends s where s.user_id = p_user_id) >= send_limit then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into public.account_deletion_code_sends (user_id) values (p_user_id);

  -- gen_random_uuid() is the server's cryptographic random source: 32 bits of it make the 6 digits.
  new_code := lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');
  new_salt := replace(gen_random_uuid()::text, '-', '');
  insert into public.account_deletion_codes (user_id, code_hash, salt, expires_at, attempts)
  values (p_user_id, encode(sha256(convert_to(new_salt || new_code, 'UTF8')), 'hex'), new_salt, now() + code_lifetime, 0)
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, salt = excluded.salt, expires_at = excluded.expires_at, attempts = 0;

  return jsonb_build_object('status', 'code_issued', 'code', new_code, 'email', account_email);
end;
$$;

-- 2. The code is confirmed: marks the account. The attempt is counted even when it fails, and the sixth fails even if right.
create function public.confirm_account_deletion(p_user_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempts_allowed constant integer := 5;
  grace constant interval := '30 days';
  existing timestamptz;
  blockers jsonb;
  stored public.account_deletion_codes;
  account_email text;
  due timestamptz;
begin
  if p_user_id is null then
    raise exception 'a user id is required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':account-deletion', 0));

  select r.delete_after into existing from public.account_deletion_requests r where r.user_id = p_user_id and r.status = 'pending';
  if existing is not null then
    return jsonb_build_object('status', 'already_marked', 'delete_after', existing);
  end if;
  -- The rule is checked again here, before the code: a refusal marks nothing and costs no attempt.
  blockers := app.account_deletion_blockers(p_user_id);
  if blockers is not null then
    return jsonb_build_object('status', 'blocked') || blockers;
  end if;

  select * into stored from public.account_deletion_codes c where c.user_id = p_user_id for update;
  if not found or stored.expires_at <= now() then
    delete from public.account_deletion_codes c where c.user_id = p_user_id;
    return jsonb_build_object('status', 'code_expired');
  end if;
  if stored.attempts >= attempts_allowed then
    return jsonb_build_object('status', 'too_many_attempts');
  end if;
  update public.account_deletion_codes c set attempts = c.attempts + 1 where c.user_id = p_user_id;
  if stored.code_hash <> encode(sha256(convert_to(stored.salt || coalesce(p_code, ''), 'UTF8')), 'hex') then
    return jsonb_build_object('status', 'invalid_code');
  end if;

  select u.email into account_email from auth.users u where u.id = p_user_id;
  if account_email is null or account_email = '' then
    raise exception 'the account has no email' using errcode = 'P0002';
  end if;
  due := now() + grace;
  insert into public.account_deletion_requests (user_id, email, delete_after) values (p_user_id, account_email, due);
  delete from public.account_deletion_codes c where c.user_id = p_user_id;
  return jsonb_build_object('status', 'marked', 'delete_after', due, 'email', account_email);
end;
$$;

-- 3. The user changes their mind during the grace period: the mark goes and everything is as before (nothing was touched).
create function public.cancel_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if p_user_id is null then
    raise exception 'a user id is required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':account-deletion', 0));
  delete from public.account_deletion_requests r where r.user_id = p_user_id and r.status = 'pending';
  get diagnostics removed = row_count;
  delete from public.account_deletion_codes c where c.user_id = p_user_id;
  return jsonb_build_object('status', case when removed > 0 then 'cancelled' else 'not_marked' end);
end;
$$;

-- For the signed-in user: when their account will be deleted, or null. The only function of this module a client calls.
create function public.account_deletion_status()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select r.delete_after from public.account_deletion_requests r where r.user_id = (select auth.uid()) and r.status = 'pending';
$$;

revoke execute on function public.request_account_deletion(uuid), public.confirm_account_deletion(uuid, text),
  public.cancel_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.request_account_deletion(uuid), public.confirm_account_deletion(uuid, text),
  public.cancel_account_deletion(uuid) to service_role;
revoke execute on function public.account_deletion_status() from public, anon;
grant execute on function public.account_deletion_status() to authenticated;
