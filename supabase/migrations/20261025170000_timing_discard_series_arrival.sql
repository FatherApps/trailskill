-- Module: timing. Issue #50.
-- "Deshacer última" (undo the last arrival) discards the arrival instead of
-- deleting it, because a delete on the server cannot be undone. The row stays,
-- with who discarded it and when; every client read leaves discarded rows out.
-- Only the author discards, only an arrival of a series that is still
-- unassigned, and only once: an assigned arrival or an individual time is never
-- discarded, and a discard is never cleared or changed. Measurements still have
-- no delete policy. Provisional pending maintainer confirmation of the data model.
--
-- A discard is a PATCH of discarded_at and discarded_by only. It changes no
-- editable value, so measurements_detect_conflict (#55) takes its "nothing
-- editable changed" path: no new version and never a conflict. Its retry with
-- the same values is the same no-op and still returns the row. hidden (#54)
-- stays false (an unassigned arrival has no athlete). confirm_measurement_insert
-- compares discarded_* like any column the device sends.

alter table public.measurements
  -- Set together by the device with a discard; null while not discarded.
  add column discarded_at timestamptz,
  add column discarded_by uuid,
  add constraint measurements_discarded_together check ((discarded_at is null) = (discarded_by is null));

-- Who discards what, once. BEFORE triggers fire in name order, so this runs
-- before measurements_check_update. Without a signed-in user (the owner, the
-- service role) nothing here applies, as in measurements_check_update. It also
-- runs on insert: a failed upload is requeued as the whole current row
-- (retryFailedRecord), which carries a discard made on the device meanwhile.
create function public.measurements_check_discard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.discarded_at is null and new.discarded_by is null then
      return new;
    end if;
  elsif new.discarded_at is not distinct from old.discarded_at and new.discarded_by is not distinct from old.discarded_by then
    -- Not a discard, or the retry of one already stored.
    return new;
  elsif old.discarded_at is not null then
    raise exception 'a discarded measurement cannot be restored or discarded again' using errcode = '42501';
  elsif new.hundredths is distinct from old.hundredths or new.athlete_id is distinct from old.athlete_id then
    -- Kept apart from edits, so a discard never goes through the conflict check of #55.
    raise exception 'a discard cannot change anything else' using errcode = '42501';
  end if;
  if new.discarded_by is distinct from auth.uid()
     or new.created_by is distinct from auth.uid()
     or new.athlete_id is not null
     or new.series_id is null then
    raise exception 'only the author can discard an unassigned arrival of a series' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.measurements_check_discard() from public;

create trigger measurements_check_discard
  before insert or update on public.measurements
  for each row execute function public.measurements_check_discard();

-- Same guard as issue #55, with discarded_at and discarded_by among the columns
-- the column rule leaves to other checks (measurements_check_discard above).
create or replace function public.measurements_check_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  server_columns text[] := array[
    'athlete_id', 'hundredths', 'hidden', 'version', 'base_version',
    'edited_by', 'edited_device_id', 'edited_at', 'edit_reason',
    'discarded_at', 'discarded_by'
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
