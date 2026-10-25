-- Module timing: series and measurements (issue #46), with their row level
-- security policies. A measurement is one captured time, or a done repetition
-- without one. A missing time is null, never 0. Every row keeps its author and
-- the device that captured it.

-- stroke, distance and pool are codes validated in the app against
-- src/core/sport; the database does not copy the catalog.
create table public.timing_series (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  device_id text not null,
  stroke text not null,
  distance text not null,
  pool text not null,
  session_type text not null check (session_type in ('training', 'competition'))
);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  device_id text not null,
  kind text not null check (kind in ('repetition', 'series_total', 'race', 'split', 'completed')),
  -- Null is an arrival not yet assigned to an athlete ("por asignar").
  athlete_id uuid references public.athletes,
  series_id uuid references public.timing_series,
  arrival_position int check (arrival_position > 0),
  -- Null is a missing time, never 0.
  hundredths int check (hundredths > 0),
  stroke text not null,
  distance text not null,
  pool text not null,
  session_type text not null check (session_type in ('training', 'competition')),
  source text not null check (source in ('screen_stopwatch', 'screen_button', 'external_button')),
  captured_at timestamptz not null,
  -- Links a split to its measurement.
  parent_id uuid references public.measurements,
  check (kind <> 'completed' or hundredths is null),
  check (parent_id is null or kind = 'split')
);

create index measurements_athlete_id_idx on public.measurements (athlete_id);
create index measurements_series_id_idx on public.measurements (series_id);

alter table public.timing_series enable row level security;
alter table public.measurements enable row level security;

grant select, insert, update, delete on table
  public.timing_series,
  public.measurements
to authenticated;

alter publication powersync add table
  public.timing_series,
  public.measurements;

create policy timing_series_select on public.timing_series for select to authenticated
  using ((select app.is_platform_admin()) or created_by = (select auth.uid()));

-- Only coaches open a series; guardians cannot add unassigned arrivals
-- through a series of their own.
create policy timing_series_insert on public.timing_series for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.school_memberships
      where user_id = (select auth.uid()) and role = 'coach'
    )
  );

-- visible_athlete_ids covers coaches, guardians and adult athletes, and school
-- admins; unassigned arrivals are visible only to the author of their series.
create policy measurements_select on public.measurements for select to authenticated
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.visible_athlete_ids())
    or (
      athlete_id is null
      and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
    )
  );

create policy measurements_insert on public.measurements for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      athlete_id in (select app.coach_athlete_ids())
      or (
        athlete_id is null
        and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
      )
    )
  );

-- Update only completes an unassigned arrival with an assigned athlete.
-- Editing existing measurements is a later issue (scope 3.9a). No delete policies.
create policy measurements_update on public.measurements for update to authenticated
  using (
    athlete_id is null
    and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
  )
  with check (
    created_by = (select auth.uid())
    and athlete_id in (select app.coach_athlete_ids())
  );
