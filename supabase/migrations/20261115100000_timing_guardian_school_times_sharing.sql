-- Module: timing. Issue #1018 (rule in docs/product/guardian-shared-school-times.md).
-- Sharing school times with the guardian is the school's choice. A guardian reads a measurement
-- only when guardian_visible is true, or when it is hidden after a withdrawal (#54, unchanged).
-- guardian_visible is true for:
--   - every row stored before this migration (they stay visible);
--   - every row of a (swimmer, school) pair whose switch is on;
--   - a row a coach or school admin shared on its own.
-- A pair without a switch row follows the school's default, and a school without a default
-- shares nothing. An adult athlete (athlete_managers.relation = 'self') reads all their rows.
-- Staff visibility does not change. Coaches and school admins of the school change everything
-- through the RPC below; clients cannot read or write the three tables directly.
-- Revert: drop the RPC, the trigger, the functions, the tables and the column, restore
-- measurements_select from 20261115090000 and the guardian query in powersync/sync-config.yaml.

-- When the rule started. Rows received before it stay visible to the guardian.
create table app.timing_guardian_sharing_since (since timestamptz not null);
insert into app.timing_guardian_sharing_since (since) values (now());

-- The school's default for a pair without its own switch.
create table public.timing_guardian_sharing_defaults (
  school_id uuid primary key references public.schools on delete cascade,
  shares_all boolean not null,
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);

-- The switch of a (swimmer, school) pair.
create table public.timing_guardian_sharing (
  athlete_id uuid not null references public.athletes on delete cascade,
  school_id uuid not null references public.schools on delete cascade,
  shares_all boolean not null,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (athlete_id, school_id)
);

-- A measurement shared on its own.
create table public.timing_guardian_shared_measurements (
  measurement_id uuid primary key references public.measurements on delete cascade,
  shared_by uuid not null,
  shared_at timestamptz not null default now()
);

alter table public.timing_guardian_sharing_defaults enable row level security;
alter table public.timing_guardian_sharing enable row level security;
alter table public.timing_guardian_shared_measurements enable row level security;
revoke all on table
  public.timing_guardian_sharing_defaults,
  public.timing_guardian_sharing,
  public.timing_guardian_shared_measurements
from anon, authenticated;

-- The default true is only the backfill of the existing rows; the trigger below sets every new
-- and updated row.
alter table public.measurements add column guardian_visible boolean not null default true;

create function app.measurement_guardian_visible(measurement uuid, athlete uuid, school uuid, received_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select athlete is null or school is null
    or received_at < (select s.since from app.timing_guardian_sharing_since s)
    or coalesce(
      (select g.shares_all from public.timing_guardian_sharing g
       where g.athlete_id = measurement_guardian_visible.athlete and g.school_id = measurement_guardian_visible.school),
      (select d.shares_all from public.timing_guardian_sharing_defaults d
       where d.school_id = measurement_guardian_visible.school),
      false)
    or exists (select 1 from public.timing_guardian_shared_measurements r
               where r.measurement_id = measurement_guardian_visible.measurement);
$$;
revoke execute on function app.measurement_guardian_visible(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;

-- Whatever the client sends is overwritten. Named so it runs after measurements_compute_hidden
-- (triggers fire in name order), which sets created_at to the server reception time on insert.
-- The school lock is shared, so uploads of one school do not block each other, but a default change
-- waits for them. The pair lock is the one a switch change takes after the withdrawal lock, in the
-- same order, so an upload and a switch change of the same pair cannot miss each other.
create function public.measurements_set_guardian_visible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.athlete_id is not null and new.school_id is not null then
    perform pg_advisory_xact_lock_shared(hashtextextended(new.school_id::text || ':guardian_sharing_default', 0));
    perform pg_advisory_xact_lock(hashtextextended(new.athlete_id::text || ':' || new.school_id::text || ':guardian_sharing', 0));
  end if;
  new.guardian_visible := coalesce(
    app.measurement_guardian_visible(new.id, new.athlete_id, new.school_id, new.created_at), false);
  return new;
end;
$$;
revoke execute on function public.measurements_set_guardian_visible() from public;

create trigger measurements_set_guardian_visible
  before insert or update on public.measurements
  for each row execute function public.measurements_set_guardian_visible();

-- Rewriting through athlete_id makes the trigger recompute guardian_visible, like the
-- recompute of #54; only rows whose value changes are written, so the others are not synced again.
create function public.measurements_recompute_guardian_visible(athlete uuid, school uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(measurements_recompute_guardian_visible.athlete::text || ':' || 'record_times', 0));
  perform pg_advisory_xact_lock(hashtextextended(
    measurements_recompute_guardian_visible.athlete::text || ':' || measurements_recompute_guardian_visible.school::text || ':guardian_sharing', 0));
  update public.measurements m
    set athlete_id = m.athlete_id
    where m.athlete_id = measurements_recompute_guardian_visible.athlete
      and m.school_id = measurements_recompute_guardian_visible.school
      and m.guardian_visible is distinct from coalesce(
        app.measurement_guardian_visible(m.id, m.athlete_id, m.school_id, m.created_at), false);
end;
$$;
revoke execute on function public.measurements_recompute_guardian_visible(uuid, uuid) from public, anon, authenticated, service_role;

create function app.require_timing_staff(school uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if school is null or school not in (select app.staff_school_ids()) then
    raise exception 'only a coach or school admin of this school can do this' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function app.require_timing_staff(uuid) from public, anon, authenticated;

create function public.timing_guardian_sharing_default(school uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_timing_staff(school);
  return coalesce(
    (select d.shares_all from public.timing_guardian_sharing_defaults d where d.school_id = timing_guardian_sharing_default.school),
    false);
end;
$$;

-- The default is for new swimmers: it freezes every swimmer the school has or has times of, with the
-- value they had, written as their switch before the default changes. The exclusive school lock makes
-- an upload in flight finish first. A default change (school lock, then the pair rows) and a switch
-- change of a swimmer of the school with rows to recompute (pair row, then the shared school lock in
-- the trigger) can deadlock: Postgres aborts one of them with 40P01, nothing ends wrong, retry it.
create function public.timing_set_guardian_sharing_default(school uuid, shares_all boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old boolean;
begin
  perform app.require_timing_staff(school);
  if shares_all is null then
    raise exception 'shares_all is required' using errcode = '22004';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(school::text || ':guardian_sharing_default', 0));
  v_old := public.timing_guardian_sharing_default(school);
  insert into public.timing_guardian_sharing (athlete_id, school_id, shares_all, updated_by)
  select s.athlete_id, timing_set_guardian_sharing_default.school, v_old, auth.uid()
  from (
    select a.athlete_id from public.athlete_schools a where a.school_id = timing_set_guardian_sharing_default.school
    union
    select m.athlete_id from public.measurements m
    where m.school_id = timing_set_guardian_sharing_default.school and m.athlete_id is not null
  ) s
  on conflict (athlete_id, school_id) do nothing;
  insert into public.timing_guardian_sharing_defaults (school_id, shares_all, updated_by)
  values (school, timing_set_guardian_sharing_default.shares_all, auth.uid())
  on conflict (school_id) do update
    set shares_all = excluded.shares_all, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

create function public.timing_guardian_sharing(athlete uuid, school uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_timing_staff(school);
  return coalesce(
    (select g.shares_all from public.timing_guardian_sharing g
     where g.athlete_id = timing_guardian_sharing.athlete and g.school_id = timing_guardian_sharing.school),
    public.timing_guardian_sharing_default(school));
end;
$$;

create function public.timing_set_guardian_sharing(athlete uuid, school uuid, shares_all boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_timing_staff(school);
  if shares_all is null then
    raise exception 'shares_all is required' using errcode = '22004';
  end if;
  if not app.athlete_in_school(athlete, school) then
    raise exception 'the athlete is not in this school' using errcode = '42501';
  end if;
  insert into public.timing_guardian_sharing (athlete_id, school_id, shares_all, updated_by)
  values (athlete, school, timing_set_guardian_sharing.shares_all, auth.uid())
  on conflict (athlete_id, school_id) do update
    set shares_all = excluded.shares_all, updated_by = excluded.updated_by, updated_at = now();
  perform public.measurements_recompute_guardian_visible(athlete, school);
end;
$$;

create function public.timing_set_measurement_guardian_shared(measurement uuid, shared boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete uuid;
  v_school uuid;
begin
  select m.athlete_id, m.school_id into v_athlete, v_school
  from public.measurements m where m.id = measurement;
  perform app.require_timing_staff(v_school);
  if v_athlete is null then
    raise exception 'only a measurement of an athlete can be shared' using errcode = '42501';
  end if;
  if shared is null then
    raise exception 'shared is required' using errcode = '22004';
  end if;
  if shared then
    insert into public.timing_guardian_shared_measurements (measurement_id, shared_by)
    values (measurement, auth.uid()) on conflict (measurement_id) do nothing;
  else
    delete from public.timing_guardian_shared_measurements where measurement_id = measurement;
  end if;
  perform public.measurements_recompute_guardian_visible(v_athlete, v_school);
end;
$$;

revoke execute on function
  public.timing_guardian_sharing_default(uuid),
  public.timing_set_guardian_sharing_default(uuid, boolean),
  public.timing_guardian_sharing(uuid, uuid),
  public.timing_set_guardian_sharing(uuid, uuid, boolean),
  public.timing_set_measurement_guardian_shared(uuid, boolean)
from public, anon;
grant execute on function
  public.timing_guardian_sharing_default(uuid),
  public.timing_set_guardian_sharing_default(uuid, boolean),
  public.timing_guardian_sharing(uuid, uuid),
  public.timing_set_guardian_sharing(uuid, uuid, boolean),
  public.timing_set_measurement_guardian_shared(uuid, boolean)
to authenticated;

-- Same as 20261115090000 except the guardian branch. Kept in step with the guardian queries of
-- timing_measurements in powersync/sync-config.yaml.
alter policy measurements_select on public.measurements
  using (
    (select app.is_platform_admin())
    or (
      athlete_id in (select app.managed_athlete_ids())
      and (guardian_visible or hidden)
    )
    or athlete_id in (
      select am.athlete_id from public.athlete_managers am
      where am.user_id = (select auth.uid()) and am.relation = 'self'
    )
    or (
      athlete_id in (select app.visible_athlete_ids())
      and not hidden
      and school_id in (select app.staff_school_ids())
    )
    or (
      created_by = (select auth.uid())
      and hidden
      and app.hidden_measurement_written_back(id)
      and school_id in (select app.staff_school_ids())
    )
    or (
      athlete_id is null
      and series_id in (select ts.id from public.timing_series ts where ts.created_by = (select auth.uid()))
      and school_id in (select app.staff_school_ids())
    )
  );
