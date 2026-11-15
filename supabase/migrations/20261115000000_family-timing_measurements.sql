-- Module family-timing: the times a guardian or adult athlete measures on their own phone ("Mis tiempos", issue #967).
-- Until now they lived only on the phone and were lost on signing out. They are the owner's, never the school's record:
-- only the owner reads and writes them. A missing time is null, never 0. A deleted time is hidden (deleted_at) and can be
-- restored for 30 days; after that it is removed from the server.

-- stroke, distance and pool are codes validated in the app against src/core/sport; the database does not copy the catalog.
create table public.family_timing_measurements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Who holds the time now. A later issue moves a time to another family (#973); it never changes otherwise.
  owner_user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- Who pressed the stopwatch. Never changes.
  captured_by uuid not null default auth.uid() references auth.users on delete cascade,
  -- Null is a time not assigned to a swimmer yet.
  athlete_id uuid references public.athletes on delete cascade,
  stroke text not null,
  distance text not null,
  pool text not null,
  session_type text not null check (session_type in ('training', 'competition')),
  -- Free text for a competition, for example the meet's name.
  competition text,
  captured_at timestamptz not null,
  -- Milliseconds; null is a missing time, never 0.
  millis int check (millis > 0),
  -- JSON array of cumulative split milliseconds, kept as text like the device stores it.
  splits text not null default '[]' check (jsonb_typeof(splits::jsonb) = 'array'),
  -- The event's official time typed by the guardian; competitions only.
  official_millis int check (official_millis > 0),
  official_set_at timestamptz,
  source text not null default 'screen_stopwatch' check (source in ('screen_stopwatch', 'screen_button', 'external_button')),
  deleted_at timestamptz,
  check (session_type = 'competition' or official_millis is null),
  check ((official_millis is null) = (official_set_at is null))
);

create index family_timing_measurements_owner_idx on public.family_timing_measurements (owner_user_id);

alter table public.family_timing_measurements enable row level security;

grant select, insert, update on table public.family_timing_measurements to authenticated;
-- The default privileges of the schema grant every new table to anon and authenticated: only the three above stay, so a direct
-- DELETE fails instead of matching no row.
revoke all on table public.family_timing_measurements from anon;
revoke delete, truncate, references, trigger on table public.family_timing_measurements from authenticated;

alter publication powersync add table public.family_timing_measurements;

-- The swimmers the signed-in user manages (guardian or adult athlete).
create function app.family_timing_managed_athlete(athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.athlete_managers where user_id = (select auth.uid()) and athlete_id = athlete
  );
$$;

revoke execute on function app.family_timing_managed_athlete(uuid) from public, anon;
grant execute on function app.family_timing_managed_athlete(uuid) to authenticated;

create policy family_timing_measurements_select on public.family_timing_measurements for select to authenticated
  using (owner_user_id = (select auth.uid()));

create policy family_timing_measurements_insert on public.family_timing_measurements for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and captured_by = (select auth.uid())
    and (athlete_id is null or app.family_timing_managed_athlete(athlete_id))
  );

create policy family_timing_measurements_update on public.family_timing_measurements for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (
    owner_user_id = (select auth.uid())
    and (athlete_id is null or app.family_timing_managed_athlete(athlete_id))
  );

-- No delete policy: a deletion is deleted_at, and the server removes it after 30 days.

-- The captured time and who captured it never change; a deleted time can be restored only within 30 days.
create function app.guard_family_timing_measurement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id
    or new.captured_by is distinct from old.captured_by
    or new.created_at is distinct from old.created_at
    or new.captured_at is distinct from old.captured_at
    or new.millis is distinct from old.millis
    or new.splits is distinct from old.splits
    or new.session_type is distinct from old.session_type then
    raise exception 'a family time keeps its captured values' using errcode = '23514';
  end if;
  if old.deleted_at is not null and new.deleted_at is null and old.deleted_at < now() - interval '30 days' then
    raise exception 'a family time deleted more than 30 days ago cannot be restored' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger family_timing_measurements_guard
  before update on public.family_timing_measurements
  for each row execute function app.guard_family_timing_measurement();

-- Removes the times deleted more than 30 days ago. Runs daily where pg_cron is available (the Supabase images ship it).
create function app.purge_family_timing_measurements()
returns integer
language sql
security definer
set search_path = ''
as $$
  with removed as (
    delete from public.family_timing_measurements where deleted_at < now() - interval '30 days' returning 1
  )
  select count(*)::integer from removed;
$$;

revoke execute on function app.purge_family_timing_measurements() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('family-timing-purge-deleted', '17 4 * * *', 'select app.purge_family_timing_measurements()');
  end if;
end;
$$;
