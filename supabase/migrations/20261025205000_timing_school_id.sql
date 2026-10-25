-- Module: timing. Issue #291.
-- Every series and measurement belongs to one school (school_id), written by
-- the device from the active school and fixed after the insert. Attributing a
-- mark to a school through its author was discarded: it depends on the
-- author's current memberships, which change over time and are ambiguous for
-- a coach of two schools. The author must be a coach or admin of that school,
-- the athlete must be in it, and a measurement of a series has the series'
-- school. Coaches and school admins read and edit only the marks of their own schools;
-- the guardian and the adult athlete still read all of theirs, whatever the
-- school. Another school sees them only online, through #68.

alter table public.timing_series add column school_id uuid references public.schools;
alter table public.measurements add column school_id uuid references public.schools;

create index measurements_school_id_idx on public.measurements (school_id);

-- Existing rows get the only possible school, never a guess: the schools where
-- the author is staff, intersected with the schools of the athletes involved.
-- Every row is checked first; if any has no candidate or more than one, the
-- migration fails once, with the count and the first 10 ids of each table (ids
-- and counts only), so the migrate log is enough to fix the data. Only when
-- nothing fails are the schools written. Kept as a function, not a DO block, so
-- the pgTAP tests and the deploy runbook can run the same check.
create function app.timing_backfill_school_ids()
returns void
language plpgsql
-- Security definer like every app function; only the owner may execute it.
security definer
set search_path = ''
as $$
declare
  bad_series bigint;
  bad_measurements bigint;
  series_ids text;
  measurement_ids text;
begin
  drop table if exists pg_temp.timing_backfill;
  create temporary table timing_backfill (tbl text, id uuid, school uuid) on commit drop;

  -- A series: every athlete with an assigned measurement in it must be in the
  -- school. school stays null unless there is exactly one candidate.
  insert into pg_temp.timing_backfill (tbl, id, school)
  select 'timing_series', s.id,
         case when count(distinct sm.school_id) = 1 then (array_agg(sm.school_id))[1] end
  from public.timing_series s
  left join public.school_memberships sm
    on sm.user_id = s.created_by
   and sm.role in ('coach', 'school_admin')
   and not exists (
     select 1 from public.measurements m
     where m.series_id = s.id and m.athlete_id is not null
       and not app.athlete_in_school(m.athlete_id, sm.school_id)
   )
  group by s.id;

  -- A measurement of a series takes the series' school, if it has one and the
  -- author and the athlete belong to it; one without a series takes the
  -- author's staff schools that hold its athlete.
  insert into pg_temp.timing_backfill (tbl, id, school)
  select 'measurements', m.id,
         case
           when m.series_id is not null then (
             select b.school from pg_temp.timing_backfill b
             where b.tbl = 'timing_series' and b.id = m.series_id
               and exists (
                 select 1 from public.school_memberships sm
                 where sm.user_id = m.created_by and sm.school_id = b.school and sm.role in ('coach', 'school_admin')
               )
               and (m.athlete_id is null or app.athlete_in_school(m.athlete_id, b.school))
           )
           else (
             select case when count(distinct sm.school_id) = 1 then (array_agg(sm.school_id))[1] end
             from public.school_memberships sm
             where sm.user_id = m.created_by
               and sm.role in ('coach', 'school_admin')
               and app.athlete_in_school(m.athlete_id, sm.school_id)
           )
         end
  from public.measurements m;

  select count(*) filter (where tbl = 'timing_series'),
         count(*) filter (where tbl = 'measurements')
  into bad_series, bad_measurements
  from pg_temp.timing_backfill where school is null;

  if bad_series > 0 or bad_measurements > 0 then
    select coalesce(string_agg(id::text, ', ' order by id), 'none') into series_ids
    from (select id from pg_temp.timing_backfill where tbl = 'timing_series' and school is null order by id limit 10) f;
    select coalesce(string_agg(id::text, ', ' order by id), 'none') into measurement_ids
    from (select id from pg_temp.timing_backfill where tbl = 'measurements' and school is null order by id limit 10) f;
    raise exception 'timing_school_id backfill: % timing_series without exactly one school (first 10: %); % measurements without exactly one school (first 10: %)',
      bad_series, series_ids, bad_measurements, measurement_ids;
  end if;

  update public.timing_series s set school_id = b.school
  from pg_temp.timing_backfill b where b.tbl = 'timing_series' and b.id = s.id;
  update public.measurements m set school_id = b.school
  from pg_temp.timing_backfill b where b.tbl = 'measurements' and b.id = m.id;
end;
$$;

-- New functions are executable by PUBLIC by default; this one rewrites every row.
revoke execute on function app.timing_backfill_school_ids() from public, anon, authenticated;

-- The measurement triggers are off for the backfill: the column rule of
-- measurements_check_update would refuse it, and the others would recompute
-- hidden or the version, which must stay exactly as they were.
alter table public.measurements disable trigger user;
select app.timing_backfill_school_ids();
alter table public.measurements enable trigger user;

alter table public.timing_series alter column school_id set not null;
alter table public.measurements alter column school_id set not null;

-- Schools where the user is a coach or a school admin.
create function app.staff_school_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select school_id from public.school_memberships
  where user_id = (select auth.uid()) and role in ('coach', 'school_admin');
$$;

revoke execute on function app.staff_school_ids() from public;
grant execute on function app.staff_school_ids() to authenticated;

-- The checks hold for every writer, the owner and the service role included,
-- so they look at created_by, not at the signed-in user. Security definer
-- because app.athlete_in_school is not executable by clients. On insert a
-- missing school (an upload queued offline before the app sent it, or from an
-- old app) gets the only possible school, as in the backfill, then passes the
-- same checks and RLS; with none or several it stays null and the row is rejected.
create function public.timing_series_check_school()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.school_id is distinct from old.school_id then
      raise exception 'the school of a series cannot change' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.school_id is null then
    select case when count(distinct school_id) = 1 then (array_agg(school_id))[1] end into new.school_id
    from public.school_memberships
    where user_id = new.created_by and role in ('coach', 'school_admin');
  end if;
  if new.school_id is not null and not exists (
    select 1 from public.school_memberships
    where user_id = new.created_by and school_id = new.school_id and role in ('coach', 'school_admin')
  ) then
    raise exception 'the author of a series or measurement must be a coach or admin of its school' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- A change of school_id itself is refused by the column rule of
-- measurements_check_update. On update only a new athlete is checked: an
-- arrival named later stays inside the measurement's school.
create function public.measurements_check_school()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.school_id is null then
    if new.series_id is not null then
      select s.school_id into new.school_id from public.timing_series s where s.id = new.series_id;
    else
      select case when count(distinct sm.school_id) = 1 then (array_agg(sm.school_id))[1] end into new.school_id
      from public.school_memberships sm
      where sm.user_id = new.created_by and sm.role in ('coach', 'school_admin')
        and (new.athlete_id is null or app.athlete_in_school(new.athlete_id, sm.school_id));
    end if;
  end if;
  if new.school_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.school_memberships
      where user_id = new.created_by and school_id = new.school_id and role in ('coach', 'school_admin')
    ) then
      raise exception 'the author of a series or measurement must be a coach or admin of its school' using errcode = '42501';
    end if;
    -- A series that does not exist is left to the foreign key.
    if exists (select 1 from public.timing_series s where s.id = new.series_id and s.school_id <> new.school_id) then
      raise exception 'a measurement must have the school of its series' using errcode = '42501';
    end if;
  elsif new.athlete_id is not distinct from old.athlete_id then
    return new;
  end if;
  if new.athlete_id is not null and not app.athlete_in_school(new.athlete_id, new.school_id) then
    raise exception 'the athlete of a measurement must be in its school' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.timing_series_check_school(), public.measurements_check_school() from public;

create trigger timing_series_check_school
  before insert or update on public.timing_series
  for each row execute function public.timing_series_check_school();

-- BEFORE triggers fire in name order: this one runs after
-- measurements_check_discard and before measurements_check_update and
-- measurements_detect_conflict, so a name outside the school is an error, never a conflict.
create trigger measurements_check_school
  before insert or update of athlete_id on public.measurements
  for each row execute function public.measurements_check_school();

-- A coach or a school admin of the series' school opens it (before, only a coach of any school).
drop policy timing_series_insert on public.timing_series;
create policy timing_series_insert on public.timing_series for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and school_id in (select app.staff_school_ids())
  );

-- Same as issue #54, except that coaches and school admins now read only the
-- marks of their own schools. The guardian or adult athlete
-- (managed_athlete_ids) and the platform admin still see everything, hidden
-- rows included, from every school.
drop policy measurements_select on public.measurements;
create policy measurements_select on public.measurements for select to authenticated
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or (
      athlete_id in (select app.visible_athlete_ids())
      and not hidden
      and school_id in (select app.staff_school_ids())
    )
    or (
      created_by = (select auth.uid())
      and id::text = any (string_to_array(coalesce(current_setting('app.hidden_measurements', true), ''), ','))
    )
    or (
      athlete_id is null
      and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
    )
  );

-- Same as issue #55, except that a coach or school admin of the athlete edits
-- only the marks of their own schools: an UPDATE whose WHERE reads no column
-- skips the select policy, so without this B could rewrite A's times of a
-- shared athlete. The author and the series author keep their branches.
drop policy measurements_update on public.measurements;
create policy measurements_update on public.measurements for update to authenticated
  using (
    (
      (athlete_id in (select app.coach_athlete_ids()) or athlete_id in (select app.admin_athlete_ids()))
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
      (athlete_id in (select app.coach_athlete_ids()) or athlete_id in (select app.admin_athlete_ids()))
      and school_id in (select app.staff_school_ids())
    )
    or (
      athlete_id is null
      and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
    )
  );
