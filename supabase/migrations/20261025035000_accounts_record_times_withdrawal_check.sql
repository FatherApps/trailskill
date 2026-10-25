-- Module: accounts. Issue #54.
-- Answers "was this purpose authorized at that instant?" so other modules can
-- hide what was recorded after a withdrawal without reading accounts tables.
-- The rule is the one that already keeps authorization_status: the most recent
-- event wins, judged by the device clock and the server clock together; it is
-- provisional pending legal review (#106). The status trigger now calls the
-- same function, so the two cannot drift apart.

-- True when some authorization of the athlete and purpose was in force at the
-- instant, given as a device time and a server time:
--   - given before the instant by both clocks;
--   - not withdrawn before the instant (by either clock);
--   - later, by both clocks, than the latest withdrawal before the instant.
-- With both instants at 'infinity' every event is "before", which is exactly
-- the current status: a withdrawn authorization never counts, and a counted one
-- is later than the latest withdrawal of any adult.
create function app.authorization_in_force_at(
  athlete uuid, purpose text, device_at timestamptz, server_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.authorizations a
    cross join lateral (
      select coalesce(max(w.withdrawn_at), '-infinity') as device_at,
             coalesce(max(w.withdrawal_received_at), '-infinity') as server_at
      from public.authorizations w
      where w.athlete_id = authorization_in_force_at.athlete
        and w.purpose = authorization_in_force_at.purpose
        and w.withdrawn_at is not null
        and (w.withdrawn_at < authorization_in_force_at.device_at
             or w.withdrawal_received_at < authorization_in_force_at.server_at)
    ) latest
    where a.athlete_id = authorization_in_force_at.athlete
      and a.purpose = authorization_in_force_at.purpose
      and a.accepted_at <= authorization_in_force_at.device_at
      and a.received_at <= authorization_in_force_at.server_at
      and (a.withdrawn_at is null
           or not (a.withdrawn_at < authorization_in_force_at.device_at
                   or a.withdrawal_received_at < authorization_in_force_at.server_at))
      and a.accepted_at > latest.device_at
      and a.received_at > latest.server_at
  );
$$;

-- Same body as before, except that the rule now lives in the function above.
create or replace function public.authorizations_refresh_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.athlete_id::text || ':' || new.purpose, 0));

  insert into public.authorization_status (athlete_id, purpose, is_granted)
  values (
    new.athlete_id,
    new.purpose,
    app.authorization_in_force_at(new.athlete_id, new.purpose, 'infinity', 'infinity')
  )
  on conflict (athlete_id, purpose) do update
    set is_granted = excluded.is_granted, updated_at = clock_timestamp()
    -- No change, no write: it would only make every device sync the row again.
    where authorization_status.is_granted is distinct from excluded.is_granted;
  return null;
end;
$$;

revoke execute on function public.authorizations_refresh_status() from public;

-- True when the athlete withdrew record_times before this capture (by either
-- clock) and no authorization given after that withdrawal covered it. A
-- capture that no withdrawal ever preceded is never "after a withdrawal", even
-- if the athlete had no authorization yet. Null athlete: false.
create function app.recorded_after_withdrawal(
  athlete uuid, captured_at timestamptz, received_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.authorizations w
      where w.athlete_id = recorded_after_withdrawal.athlete
        and w.purpose = 'record_times'
        and w.withdrawn_at is not null
        and (w.withdrawn_at < recorded_after_withdrawal.captured_at
             or w.withdrawal_received_at < recorded_after_withdrawal.received_at)
    )
    and not app.authorization_in_force_at(
      recorded_after_withdrawal.athlete, 'record_times',
      recorded_after_withdrawal.captured_at, recorded_after_withdrawal.received_at
    ),
    false
  );
$$;

-- Not executable by clients: the timing triggers that call it run as their
-- owner, and a client could otherwise probe withdrawals of any athlete.
revoke execute on function
  app.authorization_in_force_at(uuid, text, timestamptz, timestamptz),
  app.recorded_after_withdrawal(uuid, timestamptz, timestamptz)
from public;
