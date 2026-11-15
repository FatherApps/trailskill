-- Module family-timing: a failed share code counts even when it is tried through send_family_time (issue #1013). An unknown
-- code used to raise unknown_code, which rolled back the lookup that app.athlete_by_share_code had just recorded, so codes
-- could be tried without limit. The function now returns null for an unknown code, and the failed attempt stays recorded.

-- Sends one of the caller's times to the swimmer with that share code. Returns the swimmer's short name, or null when no
-- swimmer has that code (the attempt still counts). Raises too_many_attempts like a lookup, and P0001 'own_athlete',
-- 'already_sent' or 'deleted_time'.
create or replace function public.send_family_time(measurement uuid, share_code text)
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
  -- Not raised: raising would roll back the failed attempt athlete_by_share_code just recorded.
  if athlete is null then
    return null;
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

-- create or replace keeps the grants: authenticated only, never anon.
