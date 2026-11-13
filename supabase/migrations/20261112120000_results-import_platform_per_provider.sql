-- Results platforms and per-provider state (issue #896).
-- A results platform (a service that publishes the results of many tournaments) is a row of
-- `organizations` with its own type, registered in `results_import_sources` like a federation, so
-- no platform name lives in code. Because one athlete can now query two providers, everything that
-- was "one per athlete" becomes "one per (athlete, provider)": the query window and its lock, the
-- shared claim, the release, and the latest confirmation. Old signatures are dropped; the edge
-- function ships with this migration.

-- 1. Organizations: a new type for results platforms.
alter table public.organizations drop constraint organizations_type_check;
alter table public.organizations add constraint organizations_type_check
  check (type in ('federation', 'league', 'club', 'school', 'results_platform'));

-- 2. The registry accepts a federation or a results platform, with the same country prefix rule.
create or replace function public.results_import_sources_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org public.organizations;
begin
  select * into org from public.organizations where id = new.organization_id;
  if not found
     or org.type not in ('federation', 'results_platform')
     or org.country_code is null
     or split_part(new.provider, '-', 1) <> lower(org.country_code) then
    raise exception 'the provider does not match a federation or results platform of that country' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- 3. The query window is per (athlete, provider).
-- Backfill is conservative: every existing row is copied once per distinct provider of the registry,
-- so no provider gets an earlier query than before (the row stood for "the last query to the
-- source", whichever provider served it). A row is dropped only when there is no source at all.
-- The old primary key goes first so the copies can be inserted next to their originals.
alter table public.results_import_queries drop constraint results_import_queries_pkey;
alter table public.results_import_queries add column provider text;

insert into public.results_import_queries (athlete_id, provider, last_queried_at, last_queried_by)
select q.athlete_id, p.provider, q.last_queried_at, q.last_queried_by
from public.results_import_queries q
cross join (select distinct s.provider from public.results_import_sources s) p
where q.provider is null;

delete from public.results_import_queries where provider is null;

alter table public.results_import_queries alter column provider set not null;
alter table public.results_import_queries add constraint results_import_queries_provider_check
  check (provider ~ '^[a-z]{2}-[a-z0-9]+(-[a-z0-9]+)*$');
alter table public.results_import_queries add primary key (athlete_id, provider);

-- 4. Locks of a claim or a release, always taken in this order (nothing takes them reversed):
-- first the athlete's authorization lock in SHARED mode, then the (athlete, provider) lock.
-- The shared mode still waits for a withdrawal, or any other holder of the exclusive authorization
-- lock (an import cannot race a withdrawal, as before), but two providers no longer block each
-- other. The provider lock serializes the queries of the same provider. The provider is validated
-- before any lock. Security definer with an empty search_path, like every function in schema app.
create function app.results_import_lock_provider(athlete uuid, provider text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if results_import_lock_provider.provider is null
     or results_import_lock_provider.provider !~ '^[a-z]{2}-[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'the provider is not valid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock_shared(
    hashtextextended(results_import_lock_provider.athlete::text || ':' || 'import_official_results', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      results_import_lock_provider.athlete::text || ':' || 'import_official_results' || ':' || results_import_lock_provider.provider,
      0
    )
  );
end;
$$;

revoke execute on function app.results_import_lock_provider(uuid, text) from public, anon, authenticated;

drop function public.results_import_claim_results_query(uuid, uuid, interval, interval);
drop function public.results_import_claim_query(uuid, uuid, interval);
drop function public.results_import_release_claim(uuid, timestamptz, interval, interval);
drop function public.results_import_latest_confirmation(uuid);

-- Rate limit: one claim per (athlete, provider) covers every query to that provider (search and
-- refresh). Taken: retry_at is null and claimed_at is the stored instant. Refused: retry_at is the
-- next allowed instant and claimed_at is null. The upsert is atomic. Only service_role.
create function public.results_import_claim_query(
  athlete uuid, provider text, requested_by uuid, min_interval interval,
  out retry_at timestamptz, out claimed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if results_import_claim_query.min_interval is null or results_import_claim_query.min_interval <= interval '0' then
    raise exception 'the minimum interval must be positive' using errcode = '22023';
  end if;
  perform app.results_import_lock_provider(results_import_claim_query.athlete, results_import_claim_query.provider);
  if results_import_claim_query.requested_by is null
     or not exists (
       select 1 from public.athlete_managers m
       where m.user_id = results_import_claim_query.requested_by
         and m.athlete_id = results_import_claim_query.athlete
     )
     or not app.authorization_in_force_at(
       results_import_claim_query.athlete, 'import_official_results', 'infinity', 'infinity'
     ) then
    raise exception 'results import not allowed' using errcode = '42501';
  end if;

  insert into public.results_import_queries as q (athlete_id, provider, last_queried_at, last_queried_by)
  values (
    results_import_claim_query.athlete, results_import_claim_query.provider,
    clock_timestamp(), results_import_claim_query.requested_by
  )
  on conflict on constraint results_import_queries_pkey do update
    set last_queried_at = excluded.last_queried_at, last_queried_by = excluded.last_queried_by
    where q.last_queried_at + results_import_claim_query.min_interval <= excluded.last_queried_at
  returning q.last_queried_at into claimed_at;
  if found then
    retry_at := null;
    return;
  end if;

  claimed_at := null;
  select q.last_queried_at + results_import_claim_query.min_interval into retry_at
  from public.results_import_queries q
  where q.athlete_id = results_import_claim_query.athlete
    and q.provider = results_import_claim_query.provider;
end;
$$;

-- The results query that follows a search the same user confirmed, inside the search's time to
-- live, uses that search's claim instead of asking for a new one (issue #836). The search, its
-- confirmation and the row must all be of this provider: a confirmation for another provider does
-- not let this one share. One conditional UPDATE under the (athlete, provider) lock.
create function public.results_import_claim_results_query(
  athlete uuid, provider text, requested_by uuid, min_interval interval, search_ttl interval,
  out retry_at timestamptz, out claimed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if results_import_claim_results_query.search_ttl is null or results_import_claim_results_query.search_ttl <= interval '0' then
    raise exception 'the search time to live must be positive' using errcode = '22023';
  end if;
  -- Same locks as results_import_claim_query (reentrant within this transaction).
  perform app.results_import_lock_provider(
    results_import_claim_results_query.athlete, results_import_claim_results_query.provider
  );
  if not public.results_import_access(results_import_claim_results_query.athlete, results_import_claim_results_query.requested_by) then
    raise exception 'results import not allowed' using errcode = '42501';
  end if;

  update public.results_import_queries q
     set last_queried_at = clock_timestamp()
   where q.athlete_id = results_import_claim_results_query.athlete
     and q.provider = results_import_claim_results_query.provider
     and q.last_queried_by = results_import_claim_results_query.requested_by
     and q.last_queried_at + results_import_claim_results_query.search_ttl > clock_timestamp()
     and exists (
       select 1 from public.results_import_confirmations c
       where c.athlete_id = q.athlete_id
         and c.provider = q.provider
         and c.confirmed_by = results_import_claim_results_query.requested_by
         and c.confirmed_at >= q.last_queried_at
     )
  returning q.last_queried_at into claimed_at;
  if found then
    retry_at := null;
    return;
  end if;

  select c.retry_at, c.claimed_at into retry_at, claimed_at
  from public.results_import_claim_query(
    results_import_claim_results_query.athlete,
    results_import_claim_results_query.provider,
    results_import_claim_results_query.requested_by,
    results_import_claim_results_query.min_interval
  ) c;
end;
$$;

-- Gives back a claim the service took when the source query then failed (issues #888, #907). One
-- conditional UPDATE under the (athlete, provider) locks, only if `claimed_at` is still the stored
-- instant of that provider's row (nobody consumed since). It anchors the window at the release, so
-- the next normal claim is allowed `retry_after` after the failure, and clears `last_queried_by`
-- so the released claim can never be shared by a results query. No authorization check: it only
-- returns what the service took; the next claim re-checks.
create function public.results_import_release_claim(
  athlete uuid, provider text, claimed_at timestamptz, min_interval interval, retry_after interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if results_import_release_claim.min_interval is null or results_import_release_claim.min_interval <= interval '0' then
    raise exception 'the minimum interval must be positive' using errcode = '22023';
  end if;
  if results_import_release_claim.retry_after is null
     or results_import_release_claim.retry_after <= interval '0'
     or results_import_release_claim.retry_after > results_import_release_claim.min_interval then
    raise exception 'the retry wait must be positive and no longer than the interval' using errcode = '22023';
  end if;
  perform app.results_import_lock_provider(results_import_release_claim.athlete, results_import_release_claim.provider);

  update public.results_import_queries q
     set last_queried_at = clock_timestamp()
                           - results_import_release_claim.min_interval
                           + results_import_release_claim.retry_after,
         last_queried_by = null
   where q.athlete_id = results_import_release_claim.athlete
     and q.provider = results_import_release_claim.provider
     and q.last_queried_at = results_import_release_claim.claimed_at;
  return found;
end;
$$;

-- The latest "is this the person?" confirmation of the athlete, or no row. With an organization:
-- the latest of that organization. Without: the latest of an organization of type 'federation', so
-- a platform confirmation never changes what the federation update uses. The caller checks access
-- first; this never returns the evidence's affiliations.
create function public.results_import_latest_confirmation(athlete uuid, organization uuid default null)
returns table (organization_id uuid, confirmed_at timestamptz, candidate_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.organization_id, c.confirmed_at, c.candidate_name
  from public.results_import_confirmations c
  where c.athlete_id = results_import_latest_confirmation.athlete
    and case
      when results_import_latest_confirmation.organization is null then exists (
        select 1 from public.organizations o where o.id = c.organization_id and o.type = 'federation'
      )
      else c.organization_id = results_import_latest_confirmation.organization
    end
  order by c.confirmed_at desc, c.id desc
  limit 1;
$$;

revoke execute on function
  public.results_import_claim_query(uuid, text, uuid, interval),
  public.results_import_claim_results_query(uuid, text, uuid, interval, interval),
  public.results_import_release_claim(uuid, text, timestamptz, interval, interval),
  public.results_import_latest_confirmation(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.results_import_claim_query(uuid, text, uuid, interval),
  public.results_import_claim_results_query(uuid, text, uuid, interval, interval),
  public.results_import_release_claim(uuid, text, timestamptz, interval, interval),
  public.results_import_latest_confirmation(uuid, uuid)
to service_role;
