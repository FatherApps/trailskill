-- The short retry wait after a failed source query runs from the failure, not from the claim (issue #907).
-- `results_import_release_claim` used to anchor the window at `claimed_at`, so a timeout after ~30 s left only ~30 s of
-- wait and a failure slower than the wait allowed an immediate re-query. It now anchors at the release instant
-- (`clock_timestamp()`): the next normal claim is allowed `retry_after` after the failure, however long the query took.
-- The signature, the return value, the validation, the lock and the `claimed_at` guard are unchanged, so the edge
-- function needs no coordinated deploy. The two claim functions are not touched.
create or replace function public.results_import_release_claim(
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
     set last_queried_at = clock_timestamp()
                           - results_import_release_claim.min_interval
                           + results_import_release_claim.retry_after,
         last_queried_by = null
   where q.athlete_id = results_import_release_claim.athlete
     and q.last_queried_at = results_import_release_claim.claimed_at;
  return found;
end;
$$;

revoke execute on function
  public.results_import_release_claim(uuid, timestamptz, interval, interval)
from public, anon, authenticated;

grant execute on function
  public.results_import_release_claim(uuid, timestamptz, interval, interval)
to service_role;
