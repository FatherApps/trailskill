-- Module: timing. Issue #56 (server side).
-- A platform admin resolves a measurement conflict (issue #55): keeps the stored
-- version, applies the edit that was not applied, or enters the correct time,
-- always with a reason. The decision, the conflict status and the audit row
-- change in one transaction. Nothing is deleted: the conflict keeps both
-- versions and only its status changes. Provisional pending maintainer
-- confirmation.

-- One row per resolved conflict: who decided, what and why.
create table public.measurement_conflict_resolutions (
  id uuid primary key default gen_random_uuid(),
  conflict_id uuid not null unique references public.measurement_conflicts,
  decision text not null check (decision in ('current', 'incoming', 'value')),
  -- The values applied to the measurement; a missing time is null, never 0.
  hundredths int,
  athlete_id uuid,
  reason text not null check (btrim(reason) <> ''),
  resolved_by uuid not null references auth.users,
  resolved_at timestamptz not null default now()
);

alter table public.measurement_conflict_resolutions enable row level security;

-- Supabase grants everything on new tables: clients only read. The rows are
-- written by resolve_measurement_conflict. Not in the powersync publication:
-- the platform admin reads them online.
revoke all on table public.measurement_conflict_resolutions from anon, authenticated;
grant select on table public.measurement_conflict_resolutions to authenticated;

create policy measurement_conflict_resolutions_select on public.measurement_conflict_resolutions for select to authenticated
  using ((select app.is_platform_admin()));

-- The platform admin calls this as an authenticated user. The admin is checked
-- here, on the server. expected_version is the measurements.version the admin
-- saw: if the measurement moved on since (another resolution or edit), nothing
-- is written and the error code is PT409 (HTTP 409 through PostgREST), whatever
-- the decision. Parameters are qualified with the function name because several
-- share a column name.
create function public.resolve_measurement_conflict(
  conflict_id uuid, expected_version int, decision text, hundredths int, reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolver_id uuid := (select auth.uid());
  conflict public.measurement_conflicts;
  stored_version int;
  new_hundredths int;
  new_athlete_id uuid;
  resolution_id uuid;
  saved_sub text;
  saved_claims text;
begin
  if resolver_id is null or not exists (
    select 1 from public.platform_admins p where p.user_id = resolver_id
  ) then
    raise exception 'only a platform admin resolves a conflict' using errcode = '42501';
  end if;
  if coalesce(btrim(resolve_measurement_conflict.reason), '') = '' then
    raise exception 'a resolution needs a reason' using errcode = '23514';
  end if;
  if resolve_measurement_conflict.decision is distinct from 'current'
     and resolve_measurement_conflict.decision is distinct from 'incoming'
     and resolve_measurement_conflict.decision is distinct from 'value' then
    raise exception 'decision must be current, incoming or value' using errcode = '22023';
  end if;
  if resolve_measurement_conflict.decision <> 'value' and resolve_measurement_conflict.hundredths is not null then
    raise exception 'only a value decision takes a time' using errcode = '22023';
  end if;

  select * into conflict from public.measurement_conflicts c
  where c.id = resolve_measurement_conflict.conflict_id for update;
  if not found then
    raise exception 'conflict not found' using errcode = 'P0002';
  end if;
  if conflict.status <> 'open' then
    raise exception 'the conflict is already resolved' using errcode = '55000';
  end if;

  -- Locks the measurement, so a concurrent edit waits for this resolution; the
  -- version is compared in a separate statement, once the lock is held.
  perform 1 from public.measurements m where m.id = conflict.measurement_id for update;
  select m.version into stored_version from public.measurements m where m.id = conflict.measurement_id;
  if stored_version is distinct from resolve_measurement_conflict.expected_version then
    raise exception 'the measurement changed, review it again' using errcode = 'PT409';
  end if;

  if resolve_measurement_conflict.decision = 'value' then
    new_hundredths := resolve_measurement_conflict.hundredths;
    select m.athlete_id into new_athlete_id from public.measurements m where m.id = conflict.measurement_id;
  else
    -- The chosen version's snapshot; a missing time stays null.
    new_hundredths := ((case when resolve_measurement_conflict.decision = 'current'
      then conflict.current_values else conflict.incoming_values end) ->> 'hundredths')::int;
    new_athlete_id := ((case when resolve_measurement_conflict.decision = 'current'
      then conflict.current_values else conflict.incoming_values end) ->> 'athlete_id')::uuid;
  end if;

  -- The measurement triggers treat a signed-in user as a client edit (checks,
  -- conflict detection). Hide the user for the update only, so they take the
  -- no-user path (issue #55): a new version with no editor, who resolved it is
  -- in the audit row. auth.uid() reads these two settings; restored right after.
  saved_sub := current_setting('request.jwt.claim.sub', true);
  saved_claims := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);

  update public.measurements m
  set hundredths = new_hundredths,
      athlete_id = new_athlete_id,
      edit_reason = btrim(resolve_measurement_conflict.reason),
      edited_device_id = null
  where m.id = conflict.measurement_id;

  perform set_config('request.jwt.claim.sub', coalesce(saved_sub, ''), true),
          set_config('request.jwt.claims', coalesce(saved_claims, ''), true);

  update public.measurement_conflicts c set status = 'resolved' where c.id = conflict.id;

  insert into public.measurement_conflict_resolutions (conflict_id, decision, hundredths, athlete_id, reason, resolved_by)
  values (
    conflict.id, resolve_measurement_conflict.decision, new_hundredths, new_athlete_id,
    btrim(resolve_measurement_conflict.reason), resolver_id
  )
  returning id into resolution_id;

  return resolution_id;
end;
$$;

revoke execute on function public.resolve_measurement_conflict(uuid, int, text, int, text)
  from public, anon;
grant execute on function public.resolve_measurement_conflict(uuid, int, text, int, text) to authenticated;
