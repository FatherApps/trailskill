-- Module: timing. Issue #54.
-- When an authorization withdrawal reaches the server, the measurements made
-- after it are kept but hidden from everyone except the guardian (or adult
-- athlete) and the platform admin. Nothing is deleted; the row keeps its author
-- and device. Measurements from before the withdrawal do not change. "After" is
-- judged by the device capture time only (app.recorded_after_withdrawal in
-- accounts): what was captured before the withdrawal stays visible even when it
-- is uploaded later. A re-grant counts by accounts' two-clock rule. A device
-- clock set back on purpose can move the boundary: the open doubt of the issue,
-- provisional pending legal review (#106). created_at is the server reception
-- time, set by the server on insert like accounts sets received_at, for audit.

-- Computed by the server, never by the client.
alter table public.measurements add column hidden boolean not null default false;

-- Whatever the client sends is overwritten: hidden always, created_at on insert
-- (the server reception time; clock_timestamp so events in one transaction stay
-- ordered). Security definer so the client needs no access to the accounts functions.
--
-- The setting below lets an author write a row that ends hidden: Postgres checks the
-- select policy on the new row of INSERT ... RETURNING and UPDATE ... WHERE (the sync
-- connector's writes), so without it that write is refused and the row never arrives.
-- Only ids this statement really writes go in: an insert that hits an existing id
-- (ON CONFLICT DO NOTHING) writes nothing, so it must not unlock that row for reading.
-- measurements_forget_hidden clears it when the statement ends.
--
-- The advisory lock is the one the authorization status trigger takes, so a withdrawal
-- and an upload of the same athlete cannot miss each other: without it each side could
-- not see the other's uncommitted row and a measurement after the withdrawal stayed visible.
create function public.measurements_compute_hidden()
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
    perform set_config(
      'app.hidden_measurements',
      coalesce(current_setting('app.hidden_measurements', true), '') || new.id::text || ',',
      true
    );
  end if;
  return new;
end;
$$;

create function public.measurements_forget_hidden()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('app.hidden_measurements', '', true);
  return null;
end;
$$;

revoke execute on function public.measurements_compute_hidden(), public.measurements_forget_hidden() from public;

-- Triggers fire in name order: this one runs before measurements_only_athlete_changes.
create trigger measurements_compute_hidden
  before insert or update on public.measurements
  for each row execute function public.measurements_compute_hidden();

create trigger measurements_forget_hidden
  after insert or update on public.measurements
  for each statement execute function public.measurements_forget_hidden();

-- hidden is server-computed, so a change to it is not a client edit.
create or replace function public.measurements_only_athlete_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['athlete_id', 'hidden']) is distinct from (to_jsonb(old) - array['athlete_id', 'hidden']) then
    raise exception 'only athlete_id can change on a measurement' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- A withdrawal can arrive after the measurements it covers were uploaded (the
-- device was offline), also inside an authorization that is uploaded already
-- withdrawn (accept and withdraw offline in one row), and a new authorization
-- can re-grant: recompute them retroactively. Rewriting through athlete_id
-- makes the compute trigger recalculate hidden; only rows whose value changes
-- are written, so the others are not synced again.
create function public.measurements_refresh_hidden_after_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Same lock as the compute trigger: see there.
  perform pg_advisory_xact_lock(hashtextextended(new.athlete_id::text || ':' || 'record_times', 0));
  update public.measurements m
    set athlete_id = m.athlete_id
    where m.athlete_id = new.athlete_id
      and m.hidden is distinct from coalesce(
        app.recorded_after_withdrawal(m.athlete_id, m.captured_at), false);
  return null;
end;
$$;

revoke execute on function public.measurements_refresh_hidden_after_withdrawal() from public;

-- The WHEN clause is the only direct reference to an accounts table in timing
-- (accepted coupling, issue #54): accounts must not call timing, so the trigger
-- lives here. Everything else goes through accounts functions.
create trigger measurements_refresh_hidden_after_withdrawal
  after insert or update of withdrawn_at on public.authorizations
  for each row
  when (new.purpose = 'record_times')
  execute function public.measurements_refresh_hidden_after_withdrawal();

-- The guardian or adult athlete (managed_athlete_ids) and the platform admin
-- see everything, hidden rows included. Everyone else sees only what is not hidden,
-- except that an author can write a row that ends hidden (see the compute trigger).
drop policy measurements_select on public.measurements;
create policy measurements_select on public.measurements for select to authenticated
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or (athlete_id in (select app.visible_athlete_ids()) and not hidden)
    or (
      created_by = (select auth.uid())
      and id::text = any (string_to_array(coalesce(current_setting('app.hidden_measurements', true), ''), ','))
    )
    or (
      athlete_id is null
      and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
    )
  );
