-- Module family-timing: a guardian sends a time they measured to the family of another swimmer, with the swimmer's
-- share code (issue #973, decisions 3 and 4). The time leaves the sender's swimmers ("Sin asignar") while the request
-- waits. The swimmer's guardian accepts it, and the time becomes theirs in one transaction, so nobody sees it twice; or
-- rejects it, or lets 30 days pass, and it stays the sender's under "Sin asignar". The sender can withdraw it before.
-- Nobody writes the requests directly: only the functions below, which check who calls.

create table public.family_timing_transfers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  measurement_id uuid not null references public.family_timing_measurements on delete cascade,
  from_user_id uuid not null references auth.users on delete cascade,
  athlete_id uuid not null references public.athletes on delete cascade,
  -- The short name of the swimmer ("Ana M."), what the sender saw when sending; the sender reads nothing else of them.
  athlete_short_name text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'withdrawn', 'expired')),
  expires_at timestamptz not null default now() + interval '30 days',
  decided_at timestamptz,
  decided_by uuid references auth.users on delete set null,
  -- What the receiving family sees before accepting: the time as it was sent. They cannot read the sender's times.
  stroke text not null,
  distance text not null,
  pool text not null,
  session_type text not null,
  competition text,
  captured_at timestamptz not null,
  millis int,
  splits text not null default '[]',
  check ((status = 'pending') = (decided_at is null))
);

-- One waiting request per time.
create unique index family_timing_transfers_one_pending_idx on public.family_timing_transfers (measurement_id) where status = 'pending';
create index family_timing_transfers_from_idx on public.family_timing_transfers (from_user_id);
create index family_timing_transfers_athlete_idx on public.family_timing_transfers (athlete_id);

alter table public.family_timing_transfers enable row level security;
-- The default privileges grant every new table to anon and authenticated: only reading stays, for the two sides.
revoke all on table public.family_timing_transfers from anon, authenticated;
grant select on table public.family_timing_transfers to authenticated;

create policy family_timing_transfers_select on public.family_timing_transfers for select to authenticated
  using (from_user_id = (select auth.uid()) or app.family_timing_managed_athlete(athlete_id));

alter publication powersync add table public.family_timing_transfers;

-- A waiting request still in time.
create function app.family_timing_pending_transfer(measurement uuid)
returns public.family_timing_transfers
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.family_timing_transfers
  where measurement_id = measurement and status = 'pending' and expires_at > now();
$$;

revoke execute on function app.family_timing_pending_transfer(uuid) from public, anon, authenticated;

-- The guard of #967, plus: the owner changes only to who just accepted a request for the time, and a time waiting for an
-- answer keeps its swimmer (none) and cannot be deleted.
create or replace function app.guard_family_timing_measurement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted boolean := exists (
    select 1 from public.family_timing_transfers t
    where t.measurement_id = new.id and t.status = 'accepted' and t.decided_by = new.owner_user_id and t.decided_at = now()
  );
begin
  if (new.owner_user_id is distinct from old.owner_user_id and not accepted)
    or new.captured_by is distinct from old.captured_by
    or new.created_at is distinct from old.created_at
    or new.captured_at is distinct from old.captured_at
    or new.millis is distinct from old.millis
    or new.splits is distinct from old.splits
    or new.session_type is distinct from old.session_type then
    raise exception 'a family time keeps its captured values' using errcode = '23514';
  end if;
  if old.deleted_at is not null and new.deleted_at is null and old.deleted_at < now() - interval '30 days' then
    raise exception 'a family time deleted more than 30 days ago cannot be restored' using errcode = '23514';
  end if;
  if (app.family_timing_pending_transfer(new.id)).id is not null
    and (new.athlete_id is not null or new.deleted_at is not null) then
    raise exception 'a family time waiting for another family keeps no swimmer and cannot be deleted' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Sends one of the caller's times to the swimmer with that share code. Returns the swimmer's short name. Raises
-- too_many_attempts like a lookup, and P0001 'unknown_code', 'own_athlete', 'already_sent' or 'deleted_time'.
create function public.send_family_time(measurement uuid, share_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  m public.family_timing_measurements;
  athlete uuid;
  short_name text;
begin
  select * into m from public.family_timing_measurements where id = measurement and owner_user_id = caller for update;
  if m.id is null then
    raise exception 'only the owner can send a family time' using errcode = '42501';
  end if;
  if m.deleted_at is not null then
    raise exception 'deleted_time' using errcode = 'P0001';
  end if;
  if (app.family_timing_pending_transfer(m.id)).id is not null then
    raise exception 'already_sent' using errcode = 'P0001';
  end if;

  athlete := app.athlete_by_share_code(share_code);
  if athlete is null then
    raise exception 'unknown_code' using errcode = 'P0001';
  end if;
  if app.family_timing_managed_athlete(athlete) then
    raise exception 'own_athlete' using errcode = 'P0001';
  end if;
  short_name := app.athlete_short_name(athlete);

  -- A request that ran out of time is closed before the new one.
  update public.family_timing_transfers set status = 'expired', decided_at = now()
  where measurement_id = m.id and status = 'pending';
  update public.family_timing_measurements set athlete_id = null where id = m.id;
  insert into public.family_timing_transfers (
    measurement_id, from_user_id, athlete_id, athlete_short_name,
    stroke, distance, pool, session_type, competition, captured_at, millis, splits
  ) values (
    m.id, caller, athlete, short_name,
    m.stroke, m.distance, m.pool, m.session_type, m.competition, m.captured_at, m.millis, m.splits
  );
  return short_name;
end;
$$;

-- The pending request, locked, if the caller may answer it as the swimmer's guardian (or withdraw it as its sender).
create function app.family_timing_open_transfer(transfer uuid, as_sender boolean)
returns public.family_timing_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.family_timing_transfers;
begin
  select * into t from public.family_timing_transfers where id = transfer for update;
  if t.id is null
    or (as_sender and t.from_user_id is distinct from (select auth.uid()))
    or (not as_sender and not app.family_timing_managed_athlete(t.athlete_id)) then
    raise exception 'not your request' using errcode = '42501';
  end if;
  if t.status <> 'pending' or t.expires_at <= now() then
    raise exception 'request_closed' using errcode = 'P0001';
  end if;
  return t;
end;
$$;

revoke execute on function app.family_timing_open_transfer(uuid, boolean) from public, anon, authenticated;

-- The swimmer's guardian takes the time: it is theirs now, for that swimmer, and leaves the sender.
create function public.accept_family_time(transfer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.family_timing_transfers := app.family_timing_open_transfer(transfer, false);
begin
  update public.family_timing_transfers set status = 'accepted', decided_at = now(), decided_by = (select auth.uid()) where id = t.id;
  update public.family_timing_measurements
  set owner_user_id = (select auth.uid()), athlete_id = t.athlete_id
  where id = t.measurement_id;
end;
$$;

-- The swimmer's guardian does not take it: it stays the sender's, under "Sin asignar".
create function public.reject_family_time(transfer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.family_timing_transfers := app.family_timing_open_transfer(transfer, false);
begin
  update public.family_timing_transfers set status = 'rejected', decided_at = now(), decided_by = (select auth.uid()) where id = t.id;
end;
$$;

-- The sender takes the request back before it is answered.
create function public.withdraw_family_time(transfer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.family_timing_transfers := app.family_timing_open_transfer(transfer, true);
begin
  update public.family_timing_transfers set status = 'withdrawn', decided_at = now(), decided_by = (select auth.uid()) where id = t.id;
end;
$$;

revoke execute on function public.send_family_time(uuid, text), public.accept_family_time(uuid), public.reject_family_time(uuid),
  public.withdraw_family_time(uuid) from public, anon;
grant execute on function public.send_family_time(uuid, text), public.accept_family_time(uuid), public.reject_family_time(uuid),
  public.withdraw_family_time(uuid) to authenticated;

-- Closes the requests nobody answered in 30 days. They already count as closed from expires_at; this keeps the status true.
create function app.expire_family_timing_transfers()
returns integer
language sql
security definer
set search_path = ''
as $$
  with closed as (
    update public.family_timing_transfers set status = 'expired', decided_at = now()
    where status = 'pending' and expires_at <= now() returning 1
  )
  select count(*)::integer from closed;
$$;

revoke execute on function app.expire_family_timing_transfers() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('family-timing-expire-transfers', '27 4 * * *', 'select app.expire_family_timing_transfers()');
  end if;
end;
$$;
