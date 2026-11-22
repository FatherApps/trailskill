-- Module family-timing: the meters of each mark of a free-laps time (issue #1430, delivery 2 of 5). `splits` keeps its meaning
-- (cumulative milliseconds); `split_meters` says at how many meters each of those marks was pressed.
-- Old rows get null (nothing is backfilled): their meters keep coming from the lap length the app already knows (`lapMeters`).

-- A JSON array of the same length as `splits`, whose items are numbers or null (a mark with no known meters, for example the
-- one that reaches the distance). Null is a time saved before free laps. Kept as text like `splits`.
alter table public.family_timing_measurements add column split_meters text;
alter table public.family_timing_measurements add constraint family_timing_measurements_split_meters_check check (
  split_meters is null
  or case
    when jsonb_typeof(split_meters::jsonb) = 'array' and jsonb_typeof(splits::jsonb) = 'array'
      then jsonb_array_length(split_meters::jsonb) = jsonb_array_length(splits::jsonb)
        and not jsonb_path_exists(split_meters::jsonb, '$[*] ? (@.type() != "number" && @.type() != "null")')
    else false
  end
);

-- The time as it was sent carries its meters too: the receiving family cannot read the sender's times.
alter table public.family_timing_transfers add column split_meters text;

-- The guard of #973 (20261115030100), plus: the meters of the marks never change after saving, like the splits.
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
    or new.split_meters is distinct from old.split_meters
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

-- send_family_time of #1013 (20261115050000), plus: the meters are copied with the splits.
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
    stroke, distance, pool, session_type, competition, captured_at, millis, splits, split_meters
  ) values (
    m.id, caller, athlete, short_name,
    m.stroke, m.distance, m.pool, m.session_type, m.competition, m.captured_at, m.millis, m.splits, m.split_meters
  );
  return short_name;
end;
$$;

-- create or replace keeps the grants: authenticated only, never anon.
