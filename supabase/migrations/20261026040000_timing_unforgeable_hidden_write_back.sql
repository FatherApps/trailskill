-- Module: timing. Issue #272.
-- The author of a row that ends hidden (issue #54) could read it whenever its id
-- was in the session setting app.hidden_measurements (app.hidden_fulfillments for
-- marks). The compute trigger filled it so the sync connector's
-- INSERT ... ON CONFLICT DO NOTHING RETURNING id is not refused (Postgres checks the
-- select policy on the new row), but any client with SQL access can set it by hand
-- with set_config and read its own hidden rows. The write-back now lives in a private
-- table that only the security definer compute trigger writes, and the setting is
-- gone. The training-plans part (training_plan_fulfillments) is included here because
-- the issue asks to apply the same fix to both tables, which share the mechanism.

-- Rows live only inside the writing statement: the compute trigger adds the ids it
-- really writes and an AFTER STATEMENT trigger deletes them. The transaction id is part
-- of the key as a second guard: a row counts only for the transaction that wrote it, and
-- each transaction deletes only its own rows. Clients have no access and no policy.
create table app.hidden_measurement_write_backs (
  xact_id xid8 not null default pg_current_xact_id(),
  record_id uuid not null,
  primary key (xact_id, record_id)
);

create table app.hidden_fulfillment_write_backs (
  xact_id xid8 not null default pg_current_xact_id(),
  record_id uuid not null,
  primary key (xact_id, record_id)
);

revoke all on table app.hidden_measurement_write_backs, app.hidden_fulfillment_write_backs
from public, anon, authenticated;
alter table app.hidden_measurement_write_backs enable row level security;
alter table app.hidden_fulfillment_write_backs enable row level security;

-- Whether this transaction's current statement wrote the row back. Volatile on purpose:
-- a volatile function takes a fresh snapshot, so it sees the row the compute trigger of
-- this same statement just wrote (a stable one would read with the statement's snapshot
-- and miss it). pg_current_xact_id_if_assigned so a plain read never forces a
-- transaction id. Policies run as the invoker, so authenticated executes it.
create function app.hidden_measurement_written_back(row_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.hidden_measurement_write_backs w
    where w.record_id = row_id and w.xact_id = pg_current_xact_id_if_assigned()
  );
$$;

create function app.hidden_fulfillment_written_back(row_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.hidden_fulfillment_write_backs w
    where w.record_id = row_id and w.xact_id = pg_current_xact_id_if_assigned()
  );
$$;

revoke execute on function
  app.hidden_measurement_written_back(uuid),
  app.hidden_fulfillment_written_back(uuid)
from public, anon;
grant execute on function
  app.hidden_measurement_written_back(uuid),
  app.hidden_fulfillment_written_back(uuid)
to authenticated;

-- Same as issue #54, except that the write-back goes to app.hidden_measurement_write_backs
-- instead of the session setting. It lets an author write a row that ends hidden: Postgres
-- checks the select policy on the new row of INSERT ... RETURNING and UPDATE ... WHERE (the
-- sync connector's writes), so without it that write is refused and the row never arrives.
-- Only ids this statement really writes go in: an insert that hits an existing id
-- (ON CONFLICT DO NOTHING) writes nothing, so it must not unlock that row for reading.
-- measurements_clear_hidden_write_backs deletes them when the statement ends.
--
-- The advisory lock is the one the authorization status trigger takes, so a withdrawal
-- and an upload of the same athlete cannot miss each other: without it each side could
-- not see the other's uncommitted row and a measurement after the withdrawal stayed visible.
create or replace function public.measurements_compute_hidden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.athlete_id is not null then
    -- Same key as public.authorizations_refresh_status. Taken before hidden is computed,
    -- so the lookup below sees any withdrawal committed while this waited.
    perform pg_advisory_xact_lock(hashtextextended(new.athlete_id::text || ':' || 'record_times', 0));
  end if;
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
  end if;
  new.hidden := coalesce(
    app.recorded_after_withdrawal(new.athlete_id, new.captured_at),
    false
  );
  if new.hidden
     and (tg_op = 'UPDATE' or not exists (select 1 from public.measurements where id = new.id)) then
    insert into app.hidden_measurement_write_backs (record_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Same as issue #54 for marks (see training-plans_assignments), with the write-back in
-- app.hidden_fulfillment_write_backs instead of the session setting.
create or replace function public.training_plan_fulfillments_compute_hidden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.athlete_id::text || ':' || 'record_times', 0));
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
  end if;
  new.hidden := coalesce(
    app.recorded_after_withdrawal(new.athlete_id, new.captured_at),
    false
  );
  if new.hidden
     and (tg_op = 'UPDATE' or not exists (select 1 from public.training_plan_fulfillments where id = new.id)) then
    insert into app.hidden_fulfillment_write_backs (record_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

-- The setting is gone, and so are the triggers that cleared it.
drop trigger measurements_forget_hidden on public.measurements;
drop function public.measurements_forget_hidden();
drop trigger training_plan_fulfillments_forget_hidden on public.training_plan_fulfillments;
drop function public.training_plan_fulfillments_forget_hidden();

-- When the statement ends, the transaction deletes its own write-backs and only those.
create function public.measurements_clear_hidden_write_backs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from app.hidden_measurement_write_backs where xact_id = pg_current_xact_id_if_assigned();
  return null;
end;
$$;

create function public.training_plan_fulfillments_clear_hidden_write_backs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from app.hidden_fulfillment_write_backs where xact_id = pg_current_xact_id_if_assigned();
  return null;
end;
$$;

revoke execute on function
  public.measurements_clear_hidden_write_backs(),
  public.training_plan_fulfillments_clear_hidden_write_backs()
from public;

create trigger measurements_clear_hidden_write_backs
  after insert or update on public.measurements
  for each statement execute function public.measurements_clear_hidden_write_backs();

create trigger training_plan_fulfillments_clear_hidden_write_backs
  after insert or update on public.training_plan_fulfillments
  for each statement execute function public.training_plan_fulfillments_clear_hidden_write_backs();

-- Same as issue #291 (timing_school_id), except that the author reads a hidden row only
-- while the statement that writes it runs: the write-back now comes from the private
-- table, not from a setting the client can forge. hidden goes first so the check runs
-- for hidden rows only.
drop policy measurements_select on public.measurements;
create policy measurements_select on public.measurements for select to authenticated
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or (
      athlete_id in (select app.visible_athlete_ids())
      and not hidden
      and school_id in (select app.staff_school_ids())
    )
    or (
      created_by = (select auth.uid())
      and hidden
      and app.hidden_measurement_written_back(id)
    )
    or (
      athlete_id is null
      and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
    )
  );

-- Fulfillment, same as training-plans_assignments except for the author branch, as above.
drop policy training_plan_fulfillments_select on public.training_plan_fulfillments;
create policy training_plan_fulfillments_select on public.training_plan_fulfillments for select to authenticated
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or (athlete_id in (select app.visible_athlete_ids()) and not hidden)
    or (
      created_by = (select auth.uid())
      and hidden
      and app.hidden_fulfillment_written_back(id)
    )
  );
