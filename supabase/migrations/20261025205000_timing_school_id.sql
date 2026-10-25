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
-- No candidate or more than one fails the migration; the data is fixed first.
-- The measurement triggers are off for the backfill: the column rule of
-- measurements_check_update would refuse it, and the others would recompute
-- hidden or the version, which must stay exactly as they were.
alter table public.measurements disable trigger user;

do $$
declare
  r record;
  schools uuid[];
begin
  -- A series: every athlete with an assigned measurement in it must be in the school.
  for r in select s.id, s.created_by from public.timing_series s loop
    select array_agg(distinct sm.school_id) into schools
    from public.school_memberships sm
    where sm.user_id = r.created_by
      and sm.role in ('coach', 'school_admin')
      and not exists (
        select 1 from public.measurements m
        where m.series_id = r.id and m.athlete_id is not null
          and not app.athlete_in_school(m.athlete_id, sm.school_id)
      );
    if coalesce(cardinality(schools), 0) <> 1 then
      raise exception 'timing series % has % possible schools, not one: fix the data before this migration',
        r.id, coalesce(cardinality(schools), 0);
    end if;
    update public.timing_series set school_id = schools[1] where id = r.id;
  end loop;

  -- A measurement of a series takes the series' school.
  update public.measurements m set school_id = s.school_id
  from public.timing_series s
  where s.id = m.series_id;

  -- A measurement without a series: the author's staff schools that hold its athlete.
  for r in select m.id, m.created_by, m.athlete_id from public.measurements m where m.series_id is null loop
    select array_agg(distinct sm.school_id) into schools
    from public.school_memberships sm
    where sm.user_id = r.created_by
      and sm.role in ('coach', 'school_admin')
      and app.athlete_in_school(r.athlete_id, sm.school_id);
    if coalesce(cardinality(schools), 0) <> 1 then
      raise exception 'measurement % has % possible schools, not one: fix the data before this migration',
        r.id, coalesce(cardinality(schools), 0);
    end if;
    update public.measurements set school_id = schools[1] where id = r.id;
  end loop;

  -- Every measurement now has a school its author and its athlete belong to.
  select m.id into r
  from public.measurements m
  where not exists (
      select 1 from public.school_memberships sm
      where sm.user_id = m.created_by and sm.school_id = m.school_id and sm.role in ('coach', 'school_admin')
    )
    or (m.athlete_id is not null and not app.athlete_in_school(m.athlete_id, m.school_id))
  limit 1;
  if found then
    raise exception 'measurement % has an author or athlete outside the school of its series: fix the data before this migration', r.id;
  end if;
end;
$$;

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
-- because app.athlete_in_school is not executable by clients. A missing school
-- is left to the not null constraint.
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
