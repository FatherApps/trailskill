-- A search -> confirm -> results flow of the same person and athlete is one flow (issue #836):
-- the results query that follows a search the same user confirmed, inside the search's time to
-- live, uses that search's claim instead of asking for a new one. Anything else is a normal
-- claim (`results_import_claim_query`), which refuses without moving the window. The shared
-- claim is one conditional UPDATE under the athlete's advisory lock, so two concurrent calls
-- cannot both use it. Moving `last_queried_at` to now records that it was used: a second call
-- finds no confirmation after it. Returns null (allowed) or the instant of the next allowed
-- query, like `results_import_claim_query`. Only service_role.
create function public.results_import_claim_results_query(
  athlete uuid, requested_by uuid, min_interval interval, search_ttl interval
)
returns timestamptz
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
     );
  if found then
    return null;
  end if;

  return public.results_import_claim_query(
    results_import_claim_results_query.athlete,
    results_import_claim_results_query.requested_by,
    results_import_claim_results_query.min_interval
  );
end;
$$;

revoke execute on function public.results_import_claim_results_query(uuid, uuid, interval, interval)
  from public, anon, authenticated;
grant execute on function public.results_import_claim_results_query(uuid, uuid, interval, interval)
  to service_role;
