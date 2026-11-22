-- Module athletes: a 30-day read window after a baja (issue #1418). Rule confirmed by the maintainer (2026-11-22): when a swimmer
-- leaves a school the school keeps seeing the swimmer's data for 30 days and the swimmer is free to join another school.
-- The baja of #1243 cut the school's access at once; now only the WRITES are cut from athlete_schools.ended_at on, and the READS
-- go on until ended_at + 30 days (that moment is outside the window). Guardians and adult athletes keep everything, as before.
--
-- Reads (the seven helpers of 20261120100000, and everything that reads through them: athletes, athlete_schools, athlete_groups,
-- athlete_managers, authorizations, authorization_status, athlete_photos, adult_profiles, measurements and fulfillments):
-- a link counts while it is active or ended less than 30 days ago.
-- Writes (marks, plan assignment, requesting a sharing, athlete_schools and athlete_groups edits, the checks of a mark update):
-- the same four helpers as before, now under their own names ending in _active (they keep the old body: ended_at is null). Four
-- policies, two functions and one trigger function point to them.
-- Not part of the window, kept cut at the baja: the results of another school (app.result_sharing_in_force). They are data of the
-- other school, shared on the guardian's consent for the relation that just ended; see the pull request.
--
-- Sync: PowerSync does not re-evaluate time, so a stream cannot say "ended less than 30 days ago". athlete_schools gets a stored
-- column, read_window_closed_at, stamped with ended_at + 30 days by app.close_athlete_school_read_windows() once that moment has
-- passed, and the staff streams of powersync/sync-config.yaml filter on read_window_closed_at IS NULL instead of ended_at IS NULL.
-- The row change replicates, the staff bucket of that pair disappears and the device deletes the swimmer's rows. Online (RLS) the
-- rule reads the clock, so the server closes at day 30 exactly; the device closes when the job runs (PROVISIONAL: daily at
-- 04:47 UTC, so a device keeps the data up to one more day). The job is scheduled with pg_cron when it is installed, as the other
-- daily jobs; without pg_cron it must be run by another scheduler or the data stays on the devices (deploy/README.md).
--
-- Revert: recreate the seven read helpers from 20261120100000 (ended_at is null / not ended) and make can_assign_training_plan,
-- request_result_sharing and measurements_check_update call the old names again (bodies in 20261120100000 and 20261116040000);
-- restore measurements_insert, measurements_update, training_plan_fulfillments_insert, athlete_groups_write and
-- athlete_schools_write with the old names; recreate coach_athlete_assignments_insert from 20261026010000; recreate app.schedule_family_timing_jobs() from 20261120120300 and
-- athlete_schools_ended_guard() from 20261120100000; select cron.unschedule('athlete-school-read-window-close') if it was
-- scheduled; drop the functions app.close_athlete_school_read_windows, app.schedule_athlete_school_read_window_job,
-- app.athlete_school_window_closed, app.athlete_school_read_window and the four *_active helpers; drop the check
-- athlete_schools_read_window_closed_after_end and the column read_window_closed_at; restore powersync/sync-config.yaml.
-- Nothing is lost: every ended link is cut at once again, as in #1243.

-- The window, in one place. A link is out of it when it was ended and the window has passed.
create function app.athlete_school_read_window()
returns interval
language sql
immutable
security definer
set search_path = ''
as $$ select interval '30 days' $$;

create function app.athlete_school_window_closed(ended timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select ended is not null and ended + app.athlete_school_read_window() <= now() $$;

revoke execute on function app.athlete_school_read_window(), app.athlete_school_window_closed(timestamptz) from public, anon, authenticated;

alter table public.athlete_schools
  add column read_window_closed_at timestamptz,
  add constraint athlete_schools_read_window_closed_after_end
    check (read_window_closed_at is null or (ended_at is not null and read_window_closed_at >= ended_at + interval '30 days'));

-- A client role never writes the new column either: only the job (the owner) does.
create or replace function public.athlete_schools_ended_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated', 'service_role') then
    if tg_op = 'INSERT' then
      if new.ended_at is not null or new.ended_by is not null then
        raise exception 'a link is ended only with end_athlete_school' using errcode = '42501';
      end if;
      if new.read_window_closed_at is not null then
        raise exception 'the read window is closed only by the scheduled job' using errcode = '42501';
      end if;
    elsif new.ended_at is distinct from old.ended_at or new.ended_by is distinct from old.ended_by then
      raise exception 'a link is ended only with end_athlete_school' using errcode = '42501';
    elsif new.read_window_closed_at is distinct from old.read_window_closed_at then
      raise exception 'the read window is closed only by the scheduled job' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- WRITE helpers: the bodies of 20261120100000, under their own names. They still require an active link.
create function app.admin_athlete_ids_active()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_id from public.athlete_schools
  where school_id in (select app.admin_school_ids()) and ended_at is null;
$$;

create function app.admin_athlete_school_pairs_active()
returns table (athlete_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select s.athlete_id, s.school_id
  from public.athlete_schools s
  where s.school_id in (select app.admin_school_ids()) and s.ended_at is null;
$$;

create function app.admin_has_athlete_in_school_active(athlete uuid, school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select admin_has_athlete_in_school_active.school in (select app.admin_school_ids())
    and exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = admin_has_athlete_in_school_active.athlete
        and s.school_id = admin_has_athlete_in_school_active.school
        and s.ended_at is null
    );
$$;

create function app.coach_has_athlete_in_school_active(athlete uuid, school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coach_has_athlete_in_school_active.school in (select app.staff_school_ids())
    and not exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = coach_has_athlete_in_school_active.athlete
        and s.school_id = coach_has_athlete_in_school_active.school
        and s.ended_at is not null
    )
    and (
      exists (
        select 1 from public.coach_athlete_assignments ca
        where ca.coach_user_id = (select auth.uid())
          and ca.athlete_id = coach_has_athlete_in_school_active.athlete
          and ca.school_id = coach_has_athlete_in_school_active.school
      )
      or exists (
        select 1 from public.athlete_groups ag
        join public.coach_group_assignments cg on cg.group_id = ag.group_id
        join public.training_groups tg on tg.id = ag.group_id
        where cg.coach_user_id = (select auth.uid())
          and ag.athlete_id = coach_has_athlete_in_school_active.athlete
          and tg.school_id = coach_has_athlete_in_school_active.school
      )
    );
$$;

-- READ helpers: the same seven functions, a link counts while it is active or inside the window.
create or replace function app.admin_athlete_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_id from public.athlete_schools
  where school_id in (select app.admin_school_ids()) and not app.athlete_school_window_closed(ended_at);
$$;

create or replace function app.admin_athlete_school_pairs()
returns table (athlete_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select s.athlete_id, s.school_id
  from public.athlete_schools s
  where s.school_id in (select app.admin_school_ids()) and not app.athlete_school_window_closed(s.ended_at);
$$;

create or replace function app.admin_athlete_schools()
returns table (athlete_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_id, school_id from public.athlete_schools
  where school_id in (select app.admin_school_ids()) and not app.athlete_school_window_closed(ended_at);
$$;

create or replace function app.admin_has_athlete_in_school(athlete uuid, school uuid)
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
        and not app.athlete_school_window_closed(s.ended_at)
    );
$$;

create or replace function app.coach_athlete_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ag.athlete_id
  from public.athlete_groups ag
  join public.coach_group_assignments cga on cga.group_id = ag.group_id
  join public.training_groups tg on tg.id = cga.group_id
  where cga.coach_user_id = (select auth.uid())
    and tg.school_id in (select app.staff_school_ids())
    and not exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = ag.athlete_id and s.school_id = tg.school_id and app.athlete_school_window_closed(s.ended_at)
    )
  union
  select ca.athlete_id from public.coach_athlete_assignments ca
  where ca.coach_user_id = (select auth.uid())
    and ca.school_id in (select app.staff_school_ids())
    and not exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = ca.athlete_id and s.school_id = ca.school_id and app.athlete_school_window_closed(s.ended_at)
    );
$$;

create or replace function app.coach_athlete_school_pairs()
returns table (athlete_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select ca.athlete_id, ca.school_id
  from public.coach_athlete_assignments ca
  where ca.coach_user_id = (select auth.uid())
    and ca.school_id in (select app.staff_school_ids())
    and not exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = ca.athlete_id and s.school_id = ca.school_id and app.athlete_school_window_closed(s.ended_at)
    )
  union
  select ag.athlete_id, tg.school_id
  from public.athlete_groups ag
  join public.coach_group_assignments cg on cg.group_id = ag.group_id
  join public.training_groups tg on tg.id = ag.group_id
  where cg.coach_user_id = (select auth.uid())
    and tg.school_id in (select app.staff_school_ids())
    and not exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = ag.athlete_id and s.school_id = tg.school_id and app.athlete_school_window_closed(s.ended_at)
    );
$$;

create or replace function app.coach_has_athlete_in_school(athlete uuid, school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coach_has_athlete_in_school.school in (select app.staff_school_ids())
    and not exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = coach_has_athlete_in_school.athlete
        and s.school_id = coach_has_athlete_in_school.school
        and app.athlete_school_window_closed(s.ended_at)
    )
    and (
      exists (
        select 1 from public.coach_athlete_assignments ca
        where ca.coach_user_id = (select auth.uid())
          and ca.athlete_id = coach_has_athlete_in_school.athlete
          and ca.school_id = coach_has_athlete_in_school.school
      )
      or exists (
        select 1 from public.athlete_groups ag
        join public.coach_group_assignments cg on cg.group_id = ag.group_id
        join public.training_groups tg on tg.id = ag.group_id
        where cg.coach_user_id = (select auth.uid())
          and ag.athlete_id = coach_has_athlete_in_school.athlete
          and tg.school_id = coach_has_athlete_in_school.school
      )
    );
$$;

revoke execute on function
  app.admin_athlete_ids_active(), app.admin_athlete_school_pairs_active(), app.admin_has_athlete_in_school_active(uuid, uuid),
  app.coach_has_athlete_in_school_active(uuid, uuid)
from public, anon;
grant execute on function
  app.admin_athlete_ids_active(), app.admin_athlete_school_pairs_active(), app.admin_has_athlete_in_school_active(uuid, uuid),
  app.coach_has_athlete_in_school_active(uuid, uuid)
to authenticated;

-- Writes point to the active helpers. Nothing else changes in these definitions.
alter policy measurements_insert on public.measurements
  with check (
    created_by = (select auth.uid())
    and (
      (
        app.coach_has_athlete_in_school_active(athlete_id, school_id)
        and (series_id is null or series_id in (select ts.id from public.timing_series ts where ts.created_by = (select auth.uid())))
      )
      or (
        athlete_id is null
        and series_id in (select ts.id from public.timing_series ts where ts.created_by = (select auth.uid()))
      )
    )
  );

alter policy measurements_update on public.measurements
  using (
    (
      (app.coach_has_athlete_in_school_active(athlete_id, school_id) or app.admin_has_athlete_in_school_active(athlete_id, school_id))
      and school_id in (select app.staff_school_ids())
    )
    or created_by = (select auth.uid())
    or (
      athlete_id is null
      and series_id in (select ts.id from public.timing_series ts where ts.created_by = (select auth.uid()))
    )
  )
  with check (
    (
      (app.coach_has_athlete_in_school_active(athlete_id, school_id) or app.admin_has_athlete_in_school_active(athlete_id, school_id))
      and school_id in (select app.staff_school_ids())
    )
    or (
      athlete_id is null
      and series_id in (select ts.id from public.timing_series ts where ts.created_by = (select auth.uid()))
    )
  );

alter policy training_plan_fulfillments_insert on public.training_plan_fulfillments
  with check (
    created_by = (select auth.uid())
    and athlete_id in (select app.athletes_with_authorization('record_times'))
    and exists (
      select 1
      from public.training_plan_assignments a
      join public.school_memberships m on m.school_id = a.school_id
      where a.id = training_plan_fulfillments.assignment_id
        and m.user_id = (select auth.uid())
        and m.role = 'coach'
        and app.coach_has_athlete_in_school_active(training_plan_fulfillments.athlete_id, a.school_id)
    )
  );

alter policy athlete_schools_write on public.athlete_schools
  using (
    (select app.is_platform_admin())
    or (
      school_id in (select app.admin_school_ids())
      and athlete_id in (select app.admin_athlete_ids_active())
      and ended_at is null
    )
  )
  with check (
    (select app.is_platform_admin())
    or (
      school_id in (select app.admin_school_ids())
      and athlete_id in (select app.admin_athlete_ids_active())
      and ended_at is null
    )
  );

-- athlete_groups_write is "for all": the group edits of an admin need an active link; the reads of the window go through
-- athlete_groups_select.
alter policy athlete_groups_write on public.athlete_groups
  using (
    (select app.is_platform_admin())
    or (athlete_id, group_id) in (
      select p.athlete_id, tg.id
      from app.admin_athlete_school_pairs_active() p
      join public.training_groups tg on tg.school_id = p.school_id
    )
  )
  with check (
    (select app.is_platform_admin())
    or (athlete_id, group_id) in (
      select p.athlete_id, tg.id
      from app.admin_athlete_school_pairs_active() p
      join public.training_groups tg on tg.school_id = p.school_id
    )
  );

-- Requesting a sharing and assigning a plan are writes: they need an active link (the coach branch of the plan check moves to
-- the active helper; its admin branch already read athlete_schools directly).
create or replace function public.request_result_sharing(athlete uuid, school uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  created int;
begin
  if not coalesce(app.admin_has_athlete_in_school_active(athlete, school), false) then
    raise exception 'only an admin of a school of this athlete can request' using errcode = '42501';
  end if;

  insert into public.school_result_sharing (school_id, target_school_id, athlete_id)
  select s.school_id, request_result_sharing.school, request_result_sharing.athlete
  from public.athlete_schools s
  where s.athlete_id = request_result_sharing.athlete
    and s.school_id <> request_result_sharing.school
  on conflict (school_id, target_school_id) where withdrawn_at is null do nothing;

  get diagnostics created = row_count;
  return created;
end;
$$;

create or replace function app.can_assign_training_plan(school uuid, target text, athlete uuid, grp uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select app.is_platform_admin())
    or (
      school in (select app.admin_school_ids())
      and (
        target <> 'athlete'
        or not exists (
          select 1 from public.athlete_schools s
          where s.athlete_id = can_assign_training_plan.athlete
            and s.school_id = can_assign_training_plan.school
            and s.ended_at is not null
        )
      )
    )
    or (
      school in (
        select m.school_id from public.school_memberships m
        where m.user_id = (select auth.uid()) and m.role = 'coach'
          and m.deactivated_at is null
      )
      and (
        (target = 'athlete' and app.coach_has_athlete_in_school_active(athlete, school))
        or (target = 'group' and grp in (
          select g.group_id from public.coach_group_assignments g
          where g.coach_user_id = (select auth.uid())
        ))
      )
    );
$$;

-- The checks of a mark update (20261116040000) are write checks: the active helpers.
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
       or not app.coach_has_athlete_in_school_active(new.athlete_id, new.school_id)
       or (old.athlete_id is not null and not app.coach_has_athlete_in_school_active(old.athlete_id, old.school_id)) then
      raise exception 'the athlete of a measurement can only move between athletes of the coach' using errcode = '42501';
    end if;
  end if;

  -- A school admin of this measurement's school who is neither a coach of the
  -- athlete in this measurement's school nor the author corrects a time only
  -- with a reason, and a new one: the stored reason is the previous
  -- correction's.
  if new.hundredths is distinct from old.hundredths
     and app.admin_has_athlete_in_school_active(old.athlete_id, old.school_id)
     and not app.coach_has_athlete_in_school_active(old.athlete_id, old.school_id)
     and old.created_by is distinct from auth.uid()
     and (coalesce(btrim(new.edit_reason), '') = '' or new.edit_reason is not distinct from old.edit_reason) then
    raise exception 'a school admin needs a reason to edit a time' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- The job that closes the window on the devices. It stamps the moment the window closed, not the time of the run, so a late run
-- leaves the same data as an on-time one. Repeating it changes nothing.
create function app.close_athlete_school_read_windows()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
begin
  update public.athlete_schools s
  set read_window_closed_at = s.ended_at + app.athlete_school_read_window()
  where s.ended_at is not null
    and s.read_window_closed_at is null
    and s.ended_at + app.athlete_school_read_window() <= now();
  get diagnostics closed = row_count;
  return closed;
end;
$$;

revoke execute on function app.close_athlete_school_read_windows() from public, anon, authenticated;

-- Schedules the daily job when pg_cron is installed; does nothing otherwise. cron.schedule upserts by job name. Never fails the
-- caller: a refused schedule logs the SQLSTATE only and returns 0. PROVISIONAL: daily at 04:47 UTC (23:47 Bogotá, after the
-- other daily jobs), so a device keeps the data up to one more day.
create function app.schedule_athlete_school_read_window_job()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    return 0;
  end if;
  begin
    perform cron.schedule('athlete-school-read-window-close', '47 4 * * *', 'select app.close_athlete_school_read_windows()');
    return 1;
  exception when others then
    raise warning 'scheduled read window job failed: SQLSTATE %', sqlstate;
    return 0;
  end;
end;
$$;

revoke execute on function app.schedule_athlete_school_read_window_job() from public, anon, authenticated;

-- migrate.sh calls app.schedule_family_timing_jobs() on every deploy, so enabling pg_cron later takes effect without a new
-- migration: that function also schedules this job (its own result, the count of family-timing jobs, is unchanged).
create or replace function app.schedule_family_timing_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    return 0;
  end if;
  -- Never fails the caller: a refused schedule logs the SQLSTATE only and returns 0.
  -- The block is a subtransaction, so a partial failure leaves none of the new jobs.
  begin
    perform cron.schedule('family-timing-purge-deleted', '17 4 * * *', 'select app.purge_family_timing_measurements()');
    perform cron.schedule('family-timing-expire-transfers', '27 4 * * *', 'select app.expire_family_timing_transfers()');
    perform app.schedule_account_deletion_job();
    perform app.schedule_athlete_school_read_window_job();
    return 2;
  exception when others then
    raise warning 'scheduled jobs failed: SQLSTATE %', sqlstate;
    return 0;
  end;
end;
$$;

revoke execute on function app.schedule_family_timing_jobs() from public, anon, authenticated;

-- During the window an admin must not give a NEW coach read access to a swimmer the school already ended: before this
-- migration that insert granted nothing (the helpers saw only active links), now a direct assignment would read until day 30.
-- The trigger coach_athlete_assignments_check_school only requires a link of any age, so the policy requires an active one.
drop policy coach_athlete_assignments_insert on public.coach_athlete_assignments;
create policy coach_athlete_assignments_insert on public.coach_athlete_assignments for insert to authenticated
  with check ((select app.is_platform_admin()) or (select app.admin_has_athlete_in_school_active(athlete_id, school_id)));

select app.schedule_athlete_school_read_window_job();

-- Safety net: closes at once the windows that already ran out (rows ended more than 30 days ago), so the sync streams
-- do not wait for the first run of the daily job after this migration.
select app.close_athlete_school_read_windows();
