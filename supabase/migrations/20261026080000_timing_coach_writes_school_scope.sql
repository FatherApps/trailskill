-- Module: timing (and the training-plans fulfillment insert policy). Issue #321.
-- app.coach_athlete_ids() is the union of a coach's assignments over every
-- school, so a coach of A who has athlete Y assigned only in B could write Y's
-- marks in A. Measurement writes and plan fulfillments now ask
-- app.coach_has_athlete_in_school with the row's school instead. This realizes
-- the "callers add their own school filter" of
-- 20261026010000_school-console_coach_assignment_school.sql. Rejection codes and
-- texts are unchanged.

-- RLS policies and public.measurements_check_update() (not security definer)
-- run as the caller, so signed-in users may now execute the function. It only
-- answers about the caller's own charge (auth.uid()), takes no user parameter
-- and reveals nothing beyond the caller's own assignments. Public and anon stay
-- revoked.
grant execute on function app.coach_has_athlete_in_school(uuid, uuid) to authenticated;

-- Same as 20261025000000, except that the athlete must be in the coach's charge
-- in the measurement's school.
drop policy measurements_insert on public.measurements;
create policy measurements_insert on public.measurements for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (
        app.coach_has_athlete_in_school(athlete_id, school_id)
        and (
          series_id is null
          or series_id in (select id from public.timing_series where created_by = (select auth.uid()))
        )
      )
      or (
        athlete_id is null
        and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
      )
    )
  );

-- Same as 20261025205000 (a coach or school admin of the athlete edits only the
-- marks of their own schools), except that a coach must have the athlete in
-- their charge in the measurement's school, not in any school. The author and
-- the series author keep their branches.
drop policy measurements_update on public.measurements;
create policy measurements_update on public.measurements for update to authenticated
  using (
    (
      (app.coach_has_athlete_in_school(athlete_id, school_id) or athlete_id in (select app.admin_athlete_ids()))
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
      (app.coach_has_athlete_in_school(athlete_id, school_id) or athlete_id in (select app.admin_athlete_ids()))
      and school_id in (select app.staff_school_ids())
    )
    or (
      athlete_id is null
      and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
    )
  );

-- Same as 20261025170000, except that "an athlete of the coach" means one in
-- the editor's charge in this measurement's school. The school cannot change
-- on update (the column rule below refuses it).
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

  -- A school admin who is neither a coach of the athlete in this measurement's
  -- school nor the author corrects a time only with a reason, and a new one:
  -- the stored reason is the previous correction's.
  if new.hundredths is distinct from old.hundredths
     and old.athlete_id in (select app.admin_athlete_ids())
     and not app.coach_has_athlete_in_school(old.athlete_id, old.school_id)
     and old.created_by is distinct from auth.uid()
     and (coalesce(btrim(new.edit_reason), '') = '' or new.edit_reason is not distinct from old.edit_reason) then
    raise exception 'a school admin needs a reason to edit a time' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Same as 20261025150300, except that the athlete must be in the coach's charge
-- in the assignment's school. The fulfillment columns are qualified: the
-- assignment has its own athlete_id.
drop policy training_plan_fulfillments_insert on public.training_plan_fulfillments;
create policy training_plan_fulfillments_insert on public.training_plan_fulfillments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and athlete_id in (select app.athletes_with_authorization('record_times'))
    and exists (
      select 1 from public.training_plan_assignments a
      join public.school_memberships m on m.school_id = a.school_id
      where a.id = training_plan_fulfillments.assignment_id
        and m.user_id = (select auth.uid()) and m.role = 'coach'
        and app.coach_has_athlete_in_school(training_plan_fulfillments.athlete_id, a.school_id)
    )
  );
