-- Module: timing. Issue #333. The school-admin branch of measurements_update
-- and the admin reason exception of measurements_check_update() asked
-- app.admin_athlete_ids(), which spans every school the user administers. A
-- school admin of A who is staff of B could thus edit B marks of an athlete in
-- A and B. Both now ask app.admin_has_athlete_in_school with the measurement's
-- school, like the coach branch of 20261026080000. app.admin_athlete_ids()
-- stays as it is: reads and other policies use it. The trigger keeps its
-- rejection codes and texts.

-- Whether the signed-in user is school admin of this school and the athlete is
-- in it. Like app.coach_has_athlete_in_school, it only answers about the
-- caller (auth.uid()) and takes no user parameter, so signed-in users may run
-- it: RLS policies and the trigger (not security definer) run as the caller.
create function app.admin_has_athlete_in_school(athlete uuid, school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select admin_has_athlete_in_school.school in (select app.admin_school_ids())
    and exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = admin_has_athlete_in_school.athlete
        and s.school_id = admin_has_athlete_in_school.school
    );
$$;

revoke execute on function app.admin_has_athlete_in_school(uuid, uuid) from public, anon;
grant execute on function app.admin_has_athlete_in_school(uuid, uuid) to authenticated;

-- Same as 20261026080000, except that a school admin must administer the
-- measurement's school.
drop policy measurements_update on public.measurements;
create policy measurements_update on public.measurements for update to authenticated
  using (
    (
      (app.coach_has_athlete_in_school(athlete_id, school_id) or app.admin_has_athlete_in_school(athlete_id, school_id))
      and school_id in (select app.staff_school_ids())
    )
    or created_by = (select auth.uid())
    or (
      athlete_id is null
      and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
    )
  )
  with check (
    (
      (app.coach_has_athlete_in_school(athlete_id, school_id) or app.admin_has_athlete_in_school(athlete_id, school_id))
      and school_id in (select app.staff_school_ids())
    )
    or (
      athlete_id is null
      and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
    )
  );

-- Same as 20261026080000, except that the admin reason exception applies to an
-- admin of this measurement's school.
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

  -- A name goes to an athlete the editor coaches in this measurement's school;
  -- an arrival not yet assigned is completed by the author of its series (the
  -- update policy).
  if new.athlete_id is distinct from old.athlete_id then
    if new.athlete_id is null
       or not app.coach_has_athlete_in_school(new.athlete_id, new.school_id)
       or (old.athlete_id is not null and not app.coach_has_athlete_in_school(old.athlete_id, old.school_id)) then
      raise exception 'the athlete of a measurement can only move between athletes of the coach' using errcode = '42501';
    end if;
  end if;

  -- A school admin of this measurement's school who is neither a coach of the
  -- athlete in this measurement's school nor the author corrects a time only
  -- with a reason, and a new one: the stored reason is the previous
  -- correction's.
  if new.hundredths is distinct from old.hundredths
     and app.admin_has_athlete_in_school(old.athlete_id, old.school_id)
     and not app.coach_has_athlete_in_school(old.athlete_id, old.school_id)
     and old.created_by is distinct from auth.uid()
     and (coalesce(btrim(new.edit_reason), '') = '' or new.edit_reason is not distinct from old.edit_reason) then
    raise exception 'a school admin needs a reason to edit a time' using errcode = '42501';
  end if;
  return new;
end;
$$;
