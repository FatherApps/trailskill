-- A source query that fails (timeout, 5xx, network) does not spend the whole window (issue #888).
-- Both claim functions now also answer the instant they took (`claimed_at`, the exact value stored
-- in `last_queried_at`), the token `results_import_release_claim` needs to give that claim back.
-- Taken: retry_at is null and claimed_at is set. Refused: retry_at is the next allowed instant and
-- claimed_at is null. The bodies are otherwise those of the provenance and shared claim migrations.
drop function public.results_import_claim_results_query(uuid, uuid, interval, interval);
drop function public.results_import_claim_query(uuid, uuid, interval);

create function public.results_import_claim_query(
  athlete uuid, requested_by uuid, min_interval interval, out retry_at timestamptz, out claimed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if results_import_claim_query.min_interval is null or results_import_claim_query.min_interval <= interval '0' then
    raise exception 'the minimum interval must be positive' using errcode = '22023';
  end if;
  -- Same lock as the authorization refresh: an import cannot race a withdrawal.
  perform pg_advisory_xact_lock(
    hashtextextended(results_import_claim_query.athlete::text || ':' || 'import_official_results', 0)
  );
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

  insert into public.results_import_queries as q (athlete_id, last_queried_at, last_queried_by)
  values (
    results_import_claim_query.athlete, clock_timestamp(), results_import_claim_query.requested_by
  )
  on conflict (athlete_id) do update
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
  where q.athlete_id = results_import_claim_query.athlete;
end;
$$;

create function public.results_import_claim_results_query(
  athlete uuid, requested_by uuid, min_interval interval, search_ttl interval,
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
  -- Same lock as results_import_claim_query (reentrant within this transaction).
  perform pg_advisory_xact_lock(
    hashtextextended(results_import_claim_results_query.athlete::text || ':' || 'import_official_results', 0)
  );
  if not public.results_import_access(results_import_claim_results_query.athlete, results_import_claim_results_query.requested_by) then
    raise exception 'results import not allowed' using errcode = '42501';
  end if;

  update public.results_import_queries q
     set last_queried_at = clock_timestamp()
   where q.athlete_id = results_import_claim_results_query.athlete
     and q.last_queried_by = results_import_claim_results_query.requested_by
     and q.last_queried_at + results_import_claim_results_query.search_ttl > clock_timestamp()
     and exists (
       select 1 from public.results_import_confirmations c
       where c.athlete_id = q.athlete_id
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
    results_import_claim_results_query.requested_by,
    results_import_claim_results_query.min_interval
  ) c;
end;
$$;

-- Gives back a claim the service took when the source query then failed. One conditional UPDATE
-- under the athlete's lock, only if `claimed_at` is still the stored instant (nobody consumed
-- since). It moves the window so the next normal claim is allowed `retry_after` after the failed
-- one, not a whole interval later, and clears `last_queried_by` so the released claim can never be
-- shared by a results query: the next query is a normal claim that spends the whole window on
-- success. No authorization check: it only returns what the service took; the next claim re-checks.
create function public.results_import_release_claim(
  athlete uuid, claimed_at timestamptz, min_interval interval, retry_after interval
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
  perform pg_advisory_xact_lock(
    hashtextextended(results_import_release_claim.athlete::text || ':' || 'import_official_results', 0)
  );

  update public.results_import_queries q
     set last_queried_at = results_import_release_claim.claimed_at
                           - results_import_release_claim.min_interval
                           + results_import_release_claim.retry_after,
         last_queried_by = null
   where q.athlete_id = results_import_release_claim.athlete
     and q.last_queried_at = results_import_release_claim.claimed_at;
  return found;
end;
$$;

revoke execute on function
  public.results_import_claim_query(uuid, uuid, interval),
  public.results_import_claim_results_query(uuid, uuid, interval, interval),
  public.results_import_release_claim(uuid, timestamptz, interval, interval)
from public, anon, authenticated;

grant execute on function
  public.results_import_claim_query(uuid, uuid, interval),
  public.results_import_claim_results_query(uuid, uuid, interval, interval),
  public.results_import_release_claim(uuid, timestamptz, interval, interval)
to service_role;
