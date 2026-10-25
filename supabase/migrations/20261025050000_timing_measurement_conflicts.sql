-- Module: timing. Issue #55 (server side).
-- Edit conflicts on measurements. A conflict is a different edit of the same
-- existing record made on different devices without seeing each other; new
-- measurements are append-only and never conflict. An edit says which version
-- it was based on (base_version). If that is not the stored version and the
-- values differ, the stored row stays as it was, both versions go to
-- measurement_conflicts, and the UPDATE still succeeds: a conflict is not an
-- error, so it does not block the upload queue. Nothing is deleted. Only
-- hundredths and athlete_id are editable and versioned. Provisional pending
-- maintainer confirmation; resolving a conflict is a later issue (#56).

alter table public.measurements
  add column version int not null default 1,
  -- Sent by the device with an edit (the version it saw); cleared by the server.
  add column base_version int,
  -- Author, device and time of the current version; null while never edited.
  add column edited_by uuid,
  add column edited_device_id text,
  add column edited_at timestamptz,
  -- Why this version was written (required of a school admin).
  add column edit_reason text;

create table public.measurement_conflicts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  measurement_id uuid not null references public.measurements,
  -- The version the incoming edit was based on; null when it did not say.
  base_version int,
  -- The stored version: hundredths, athlete_id and version, with who wrote it
  -- where and when (the edit, or the creation if it was never edited).
  current_values jsonb not null,
  current_by uuid,
  current_device text,
  current_at timestamptz,
  -- The edit that was not applied.
  incoming_values jsonb not null,
  incoming_by uuid,
  incoming_device text,
  incoming_at timestamptz not null default clock_timestamp(),
  status text not null default 'open' check (status in ('open', 'resolved'))
);

create index measurement_conflicts_measurement_id_idx on public.measurement_conflicts (measurement_id);

alter table public.measurement_conflicts enable row level security;

-- Supabase grants everything on new tables: clients only read. The rows are
-- written by the detection trigger, which runs as its owner.
revoke all on table public.measurement_conflicts from anon, authenticated;
grant select on table public.measurement_conflicts to authenticated;

alter publication powersync add table public.measurement_conflicts;

-- The platform admin and the two authors read a conflict.
create policy measurement_conflicts_select on public.measurement_conflicts for select to authenticated
  using (
    (select app.is_platform_admin())
    or current_by = (select auth.uid())
    or incoming_by = (select auth.uid())
  );

-- A new measurement starts at version 1, unedited, whatever the client sends.
create function public.measurements_init_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := 1;
  new.base_version := null;
  new.edited_by := null;
  new.edited_device_id := null;
  new.edited_at := null;
  new.edit_reason := null;
  return new;
end;
$$;

create trigger measurements_init_version
  before insert on public.measurements
  for each row execute function public.measurements_init_version();

-- Replaces measurements_only_athlete_changes (issue #129). BEFORE UPDATE
-- triggers fire in name order: this one (check_update) runs first, so an
-- invalid edit is an error and never hides behind a conflict; then
-- measurements_compute_hidden (issue #54); then measurements_detect_conflict.
-- Only athlete_id and hundredths are editable; version, base_version,
-- edited_* and edit_reason are handled by the server, and hidden is computed.
drop trigger measurements_only_athlete_changes on public.measurements;
drop function public.measurements_only_athlete_changes();

create function public.measurements_check_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  server_columns text[] := array[
    'athlete_id', 'hundredths', 'hidden', 'version', 'base_version',
    'edited_by', 'edited_device_id', 'edited_at', 'edit_reason'
  ];
begin
  if (to_jsonb(new) - server_columns) is distinct from (to_jsonb(old) - server_columns) then
    raise exception 'only athlete_id and hundredths can change on a measurement' using errcode = '42501';
  end if;

  -- Without a signed-in user (the owner, the service role) only the column
  -- rule above applies. The recompute of issue #54 changes no editable value.
  if auth.uid() is null
     or (new.hundredths is not distinct from old.hundredths and new.athlete_id is not distinct from old.athlete_id) then
    return new;
  end if;

  -- A name goes to an athlete the editor coaches; an arrival not yet assigned
  -- is completed by the author of its series (the update policy).
  if new.athlete_id is distinct from old.athlete_id then
    if new.athlete_id is null
       or new.athlete_id not in (select app.coach_athlete_ids())
       or (old.athlete_id is not null and old.athlete_id not in (select app.coach_athlete_ids())) then
      raise exception 'the athlete of a measurement can only move between athletes of the coach' using errcode = '42501';
    end if;
  end if;

  -- A school admin who is neither a coach of the athlete nor the author
  -- corrects a time only with a reason, and a new one: the stored reason is
  -- the previous correction's.
  if new.hundredths is distinct from old.hundredths
     and old.athlete_id in (select app.admin_athlete_ids())
     and old.athlete_id not in (select app.coach_athlete_ids())
     and old.created_by is distinct from auth.uid()
     and (coalesce(btrim(new.edit_reason), '') = '' or new.edit_reason is not distinct from old.edit_reason) then
    raise exception 'a school admin needs a reason to edit a time' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger measurements_check_update
  before update on public.measurements
  for each row execute function public.measurements_check_update();

-- Versions the edit, or records the conflict. Security definer so the client
-- needs no write access to measurement_conflicts. Without a signed-in user
-- (maintenance as the owner or the service role) an edit applies directly.
create function public.measurements_detect_conflict()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming jsonb;
begin
  if new.hundredths is not distinct from old.hundredths and new.athlete_id is not distinct from old.athlete_id then
    -- Nothing editable changed (a retry of an applied edit, or the recompute of
    -- issue #54): no new version and no conflict. The server columns stay as
    -- they were, whatever the client sent.
    new.version := old.version;
    new.base_version := null;
    new.edited_by := old.edited_by;
    new.edited_device_id := old.edited_device_id;
    new.edited_at := old.edited_at;
    new.edit_reason := old.edit_reason;
    return new;
  end if;

  -- An edit that does not say which version it saw (null) is stale. Two
  -- concurrent edits from one base cannot both apply: the second waits for the
  -- row lock and then runs this trigger against the first one's new version.
  -- A stale base still applies when the stored version is this same user's, from
  -- this same device: offline, the device only knows the version it last synced,
  -- and its own earlier edit is not an edit it failed to see.
  if auth.uid() is null or new.base_version = old.version
     or (old.edited_by = auth.uid() and new.edited_device_id is not null
         and old.edited_device_id = new.edited_device_id) then
    new.version := old.version + 1;
    new.edited_by := auth.uid();
    new.edited_at := clock_timestamp();
    new.base_version := null;
    return new;
  end if;

  incoming := jsonb_build_object(
    'hundredths', new.hundredths, 'athlete_id', new.athlete_id, 'edit_reason', new.edit_reason
  );
  -- A retry of the same upload adds nothing.
  insert into public.measurement_conflicts (
    measurement_id, base_version,
    current_values, current_by, current_device, current_at,
    incoming_values, incoming_by, incoming_device
  )
  select
    old.id, new.base_version,
    jsonb_build_object('hundredths', old.hundredths, 'athlete_id', old.athlete_id, 'version', old.version),
    case when old.edited_at is null then old.created_by else old.edited_by end,
    case when old.edited_at is null then old.device_id else old.edited_device_id end,
    coalesce(old.edited_at, old.created_at),
    incoming, auth.uid(), new.edited_device_id
  where not exists (
    select 1 from public.measurement_conflicts c
    where c.measurement_id = old.id and c.status = 'open'
      and c.base_version is not distinct from new.base_version
      and c.incoming_values = incoming
      and c.incoming_by is not distinct from auth.uid()
      and (c.current_values ->> 'version')::int = old.version
  );

  -- The stored row stays as it was; the update still succeeds.
  return old;
end;
$$;

revoke execute on function
  public.measurements_init_version(),
  public.measurements_check_update(),
  public.measurements_detect_conflict()
from public;

create trigger measurements_detect_conflict
  before update on public.measurements
  for each row execute function public.measurements_detect_conflict();

-- Who may update (the guard above narrows what they may change):
--   - a coach of the athlete, or a school admin of the athlete (a time only,
--     with a reason, see the guard), or the author of the measurement;
--   - the author of the series, for an arrival not yet assigned.
-- Guardians never edit. A hidden row (issue #54) is not visible to a coach or
-- a school admin, so the select policy keeps it out of reach here too. The
-- check also accepts the unassigned row that a conflicting edit leaves as it was.
drop policy measurements_update on public.measurements;
create policy measurements_update on public.measurements for update to authenticated
  using (
    athlete_id in (select app.coach_athlete_ids())
    or athlete_id in (select app.admin_athlete_ids())
    or created_by = (select auth.uid())
    or (
      athlete_id is null
      and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
    )
  )
  with check (
    athlete_id in (select app.coach_athlete_ids())
    or athlete_id in (select app.admin_athlete_ids())
    or (
      athlete_id is null
      and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
    )
  );
