-- Read-only helpers of the results-import Edge Function (issue #82). Neither spends the
-- source rate limit: `status` and `import` must check who may act, and show the last
-- confirmation, without claiming a query. Only service_role executes them.

-- True when the user manages the athlete and `import_official_results` is in force:
-- the same check `results_import_claim_query` makes, without the claim.
create function public.results_import_access(athlete uuid, requested_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select results_import_access.requested_by is not null
    and exists (
      select 1 from public.athlete_managers m
      where m.user_id = results_import_access.requested_by
        and m.athlete_id = results_import_access.athlete
    )
    and app.authorization_in_force_at(results_import_access.athlete, 'import_official_results', 'infinity', 'infinity');
$$;

-- The latest "is this the person?" confirmation of the athlete, or no row.
-- The caller checks access first; this never returns the evidence's affiliations.
create function public.results_import_latest_confirmation(athlete uuid)
returns table (organization_id uuid, confirmed_at timestamptz, candidate_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.organization_id, c.confirmed_at, c.candidate_name
  from public.results_import_confirmations c
  where c.athlete_id = results_import_latest_confirmation.athlete
  order by c.confirmed_at desc, c.id desc
  limit 1;
$$;

revoke execute on function
  public.results_import_access(uuid, uuid),
  public.results_import_latest_confirmation(uuid)
from public, anon, authenticated;

grant execute on function
  public.results_import_access(uuid, uuid),
  public.results_import_latest_confirmation(uuid)
to service_role;
