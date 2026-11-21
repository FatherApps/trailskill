-- Module results-import: what the `refresh_tournaments` action of the function needs in the database (issue #1341).
-- The function asks the platform for its tournaments of the year, at most once per interval per platform, and saves them in
-- `results_import_tournaments`. The platform is asked over the network, outside any transaction, so the "at most once" cannot be
-- a lock held while asking: it is a claim, one conditional upsert per platform that two concurrent calls cannot both win, the same
-- shape as `results_import_claim_query`. A claim whose request then failed is given back, so a platform that is down is retried soon.
-- Additive: a new table and three new functions, nothing existing changes. Only service_role uses any of them.

create table public.results_import_tournament_refreshes (
  organization_id uuid primary key references public.organizations on delete cascade,
  claimed_at timestamptz not null
);

alter table public.results_import_tournament_refreshes enable row level security;
-- The default privileges grant every new table to anon and authenticated: no client reads or writes the claims.
revoke all on table public.results_import_tournament_refreshes from anon, authenticated;
grant all on table public.results_import_tournament_refreshes to service_role;

-- A marked account writes nothing (#1244), like every table of the public schema.
select app.guard_marked_account_writes('public.results_import_tournament_refreshes');

-- Takes the refresh of a platform if none was taken in the last `min_interval`. Taken: retry_at is null and claimed_at is the instant
-- stored, the token `results_import_release_tournament_refresh` needs. Refused: retry_at is the next allowed instant and claimed_at is null.
-- The conditional upsert locks the platform's row (or, for the first claim, its unique key), so a concurrent claim waits for this one
-- and then finds the interval already spent.
create function public.results_import_claim_tournament_refresh(
  organization uuid, min_interval interval, out retry_at timestamptz, out claimed_at timestamptz
)
returns record
language plpgsql
security definer
set search_path = ''
as $$
begin
  if results_import_claim_tournament_refresh.min_interval is null or results_import_claim_tournament_refresh.min_interval <= interval '0' then
    raise exception 'the minimum interval must be positive' using errcode = '22023';
  end if;
  -- Only a results platform owns a catalog (the same rule as the table's trigger), checked before anything is claimed.
  if not exists (
    select 1 from public.organizations org
    where org.id = results_import_claim_tournament_refresh.organization and org.type = 'results_platform'
  ) then
    raise exception 'the organization must be a results platform' using errcode = '23514';
  end if;

  insert into public.results_import_tournament_refreshes as r (organization_id, claimed_at)
  values (results_import_claim_tournament_refresh.organization, clock_timestamp())
  on conflict (organization_id) do update
    set claimed_at = excluded.claimed_at
    where r.claimed_at + results_import_claim_tournament_refresh.min_interval <= excluded.claimed_at
  returning r.claimed_at into claimed_at;
  if found then
    retry_at := null;
    return;
  end if;

  claimed_at := null;
  select r.claimed_at + results_import_claim_tournament_refresh.min_interval into retry_at
  from public.results_import_tournament_refreshes r
  where r.organization_id = results_import_claim_tournament_refresh.organization;
end;
$$;

-- Gives back a claim the service took when the platform then did not answer. One conditional UPDATE, only if `claimed_at` is still the
-- stored instant (nobody claimed since). It moves the claim so the next one is allowed `retry_after` after the failed one, not a whole
-- interval later. No other check: it only returns what the service took.
create function public.results_import_release_tournament_refresh(
  organization uuid, claimed_at timestamptz, min_interval interval, retry_after interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if results_import_release_tournament_refresh.min_interval is null or results_import_release_tournament_refresh.min_interval <= interval '0' then
    raise exception 'the minimum interval must be positive' using errcode = '22023';
  end if;
  if results_import_release_tournament_refresh.retry_after is null
     or results_import_release_tournament_refresh.retry_after <= interval '0'
     or results_import_release_tournament_refresh.retry_after > results_import_release_tournament_refresh.min_interval then
    raise exception 'the retry wait must be positive and no longer than the interval' using errcode = '22023';
  end if;

  update public.results_import_tournament_refreshes r
     set claimed_at = results_import_release_tournament_refresh.claimed_at
                      - results_import_release_tournament_refresh.min_interval
                      + results_import_release_tournament_refresh.retry_after
   where r.organization_id = results_import_release_tournament_refresh.organization
     and r.claimed_at = results_import_release_tournament_refresh.claimed_at;
  return found;
end;
$$;

-- Saves what the platform listed, all or none, by (platform, day): a new day is inserted, a known one is updated and its `refreshed_at`
-- moves to now. A tournament the list no longer has is left alone: the stored list is never emptied by a refresh. `rows` is a JSON list of
-- `{ year, date_key, name, city, discipline, course, source_url }`; the table's own checks and trigger refuse a bad row, and then nothing
-- is saved. Two entries of the same day are one tournament (the day is the key): the first one is kept, so one upsert never touches a row twice.
-- Answers how many rows were saved.
create function public.results_import_save_tournaments(organization uuid, rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved integer;
begin
  if results_import_save_tournaments.rows is null or jsonb_typeof(results_import_save_tournaments.rows) <> 'array' then
    raise exception 'the tournaments must be a list' using errcode = '22023';
  end if;

  insert into public.results_import_tournaments as t (organization_id, year, date_key, name, city, discipline, course, source_url, refreshed_at)
  select distinct on (r.date_key)
    results_import_save_tournaments.organization, r.year, r.date_key, r.name, r.city, r.discipline, r.course, r.source_url, clock_timestamp()
  from rows from (
    jsonb_to_recordset(results_import_save_tournaments.rows)
      as (year integer, date_key text, name text, city text, discipline text, course text, source_url text)
  ) with ordinality as r(year, date_key, name, city, discipline, course, source_url, position)
  order by r.date_key, r.position
  on conflict (organization_id, date_key) do update
    set year = excluded.year,
        name = excluded.name,
        city = excluded.city,
        discipline = excluded.discipline,
        course = excluded.course,
        source_url = excluded.source_url,
        refreshed_at = excluded.refreshed_at;
  get diagnostics saved = row_count;
  return saved;
end;
$$;

revoke execute on function
  public.results_import_claim_tournament_refresh(uuid, interval),
  public.results_import_release_tournament_refresh(uuid, timestamptz, interval, interval),
  public.results_import_save_tournaments(uuid, jsonb)
from public, anon, authenticated;

grant execute on function
  public.results_import_claim_tournament_refresh(uuid, interval),
  public.results_import_release_tournament_refresh(uuid, timestamptz, interval, interval),
  public.results_import_save_tournaments(uuid, jsonb)
to service_role;
