-- Module results-import: the catalog of tournaments of a results platform (issue #1339). It lets a guardian pick a
-- tournament by city and date instead of pasting a URL, and it syncs to the phone so the list works offline.
-- Only tournament metadata lives here: no results and no swimmers. One row per (platform, day).
-- Any signed-in user reads it; no client writes it. Only the service role does, from the refresh function of a later issue.
-- Additive: a new table, nothing existing changes.

create table public.results_import_tournaments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  year integer not null,
  -- The day of the tournament as YYYYMMDD, the key the platform's index uses.
  date_key text not null check (date_key ~ '^[0-9]{8}$'),
  name text not null,
  city text not null,
  discipline text not null,
  course text,
  source_url text not null,
  refreshed_at timestamptz not null default now(),
  unique (organization_id, date_key)
);

-- Only a results platform owns a catalog. A trigger because a check cannot read another table; the same shape as
-- results_import_sources_check. The type is checked again if the organization is changed.
create function app.results_import_tournaments_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.organizations org where org.id = new.organization_id and org.type = 'results_platform'
  ) then
    raise exception 'the organization of a tournament must be a results platform' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function app.results_import_tournaments_check() from public, anon, authenticated;

create trigger results_import_tournaments_check
  before insert or update of organization_id on public.results_import_tournaments
  for each row execute function app.results_import_tournaments_check();

alter table public.results_import_tournaments enable row level security;
-- The default privileges grant every new table to anon and authenticated: only reading stays, and only with a session.
revoke all on table public.results_import_tournaments from anon, authenticated;
grant select on table public.results_import_tournaments to authenticated;
grant all on table public.results_import_tournaments to service_role;

create policy results_import_tournaments_select on public.results_import_tournaments for select to authenticated
  using (true);

alter publication powersync add table public.results_import_tournaments;

-- A marked account writes nothing (#1244), like every table of the public schema.
select app.guard_marked_account_writes('public.results_import_tournaments');
