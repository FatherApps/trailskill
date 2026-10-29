-- Module: results-import. Issue #79.
-- Provenance tables for official results imported from a federation: which
-- provider serves which federation (data, not code), who asked for each import,
-- the evidence of "is this the person?", the imported results themselves
-- (immutable, deduplicated), the pending differences when the source later
-- changes a result, and the per-athlete rate limit of queries to the source.
--
-- Personal data (maintainer decision on #120): the source's reference to the
-- athlete is treated as an identity document number. NO table here stores it,
-- not as text, not as a hash, not in provenance: there is no column for a
-- document, a birth date or the source's athlete key. The number is read when
-- needed through the service_role function of the accounts module (#799), from
-- the Edge Function, never from this SQL. The source key kept here (and used to
-- deduplicate) is the key of the RESULT, which names no person.
--
-- Everything is written by service_role functions (the Edge Function) or by
-- resolve_imported_result_change; clients only read. Imported results are
-- immutable for every role: a changed value at the source becomes a pending
-- change that a guardian or adult athlete accepts or keeps (nothing is
-- overwritten silently). Provisional pending maintainer review.

-- Which provider (adapter) serves which federation. The provider key is
-- '<country>-<organization>' and its country prefix must be the ISO code of the
-- federation, lower case.
create table public.results_import_sources (
  organization_id uuid primary key references public.organizations on delete cascade,
  provider text not null check (provider ~ '^[a-z]{2}-[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- Provenance of each import: who asked, for which athlete, through which
-- provider, when. Rows never change.
create table public.results_imports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  athlete_id uuid not null references public.athletes on delete cascade,
  organization_id uuid not null references public.results_import_sources (organization_id),
  provider text not null,
  requested_by uuid not null references auth.users,
  requested_at timestamptz not null default clock_timestamp()
);

create index results_imports_athlete_id_idx on public.results_imports (athlete_id);

-- Evidence that the guardian or adult athlete confirmed "is this the person?"
-- before an import. It keeps what was shown (name, clubs and leagues with
-- years, how many results), never an identity document or a birth date.
create table public.results_import_confirmations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  athlete_id uuid not null references public.athletes on delete cascade,
  organization_id uuid not null references public.results_import_sources (organization_id),
  provider text not null,
  confirmed_by uuid not null references auth.users,
  confirmed_at timestamptz not null default clock_timestamp(),
  candidate_name text not null,
  affiliations jsonb not null,
  result_count int not null check (result_count >= 0)
);

create index results_import_confirmations_athlete_id_idx on public.results_import_confirmations (athlete_id);

-- Imported results. A missing time is null, never 0. The unique key is the
-- deduplication key: the same result of the source is one row per revision.
-- A revision above 1 supersedes the previous one (the guardian chose "use the
-- new value"); the superseded row stays.
create table public.imported_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  import_id uuid not null references public.results_imports,
  athlete_id uuid not null references public.athletes on delete cascade,
  provider text not null,
  -- The source's key of the RESULT, not of the athlete.
  source_result_key text not null check (length(source_result_key) > 0),
  revision int not null default 1 check (revision > 0),
  supersedes_id uuid references public.imported_results,
  check ((revision = 1) = (supersedes_id is null)),
  stroke text not null,
  distance text not null,
  pool text not null,
  hundredths int check (hundredths > 0),
  swum_on date not null,
  competition text,
  unique (athlete_id, provider, source_result_key, revision)
);

create index imported_results_import_id_idx on public.imported_results (import_id);

-- Pending differences: the source now reports other values for a result that
-- was already imported. Only result fields, never a document or a birth date.
-- The imported result is not touched; the change waits for a choice.
create table public.imported_result_changes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default clock_timestamp(),
  imported_result_id uuid not null references public.imported_results on delete cascade,
  athlete_id uuid not null references public.athletes on delete cascade,
  -- The import that saw the change.
  import_id uuid not null references public.results_imports,
  stroke text not null,
  distance text not null,
  pool text not null,
  hundredths int check (hundredths > 0),
  swum_on date not null,
  competition text,
  status text not null default 'pending' check (status in ('pending', 'used_new', 'kept_current', 'replaced')),
  resolved_by uuid references auth.users,
  resolved_at timestamptz,
  check ((status = 'pending') = (resolved_at is null)),
  check ((status in ('used_new', 'kept_current')) = (resolved_by is not null))
);

create index imported_result_changes_athlete_id_idx on public.imported_result_changes (athlete_id);
create index imported_result_changes_import_id_idx on public.imported_result_changes (import_id);
create unique index imported_result_changes_one_pending_idx
  on public.imported_result_changes (imported_result_id) where status = 'pending';

-- Rate limit state: the last query to the source, one row per athlete.
create table public.results_import_queries (
  athlete_id uuid primary key references public.athletes on delete cascade,
  last_queried_at timestamptz not null,
  last_queried_by uuid references auth.users
);

alter table public.results_import_sources enable row level security;
alter table public.results_imports enable row level security;
alter table public.results_import_confirmations enable row level security;
alter table public.imported_results enable row level security;
alter table public.imported_result_changes enable row level security;
alter table public.results_import_queries enable row level security;

-- Supabase grants anon and authenticated everything on new tables: take it
-- back. Clients read; the registry is written by platform admins (policies
-- below); everything else is written by the functions further down.
-- service_role keeps its default access. results_import_queries: no client access.
revoke all on table
  public.results_import_sources,
  public.results_imports,
  public.results_import_confirmations,
  public.imported_results,
  public.imported_result_changes,
  public.results_import_queries
from anon, authenticated;

grant select on table
  public.results_imports,
  public.results_import_confirmations,
  public.imported_results,
  public.imported_result_changes
to authenticated;
-- The registry is data that platform admins maintain, like organizations.
grant select, insert, update, delete on table public.results_import_sources to authenticated;

-- Imports, results and pending changes reach the app through sync streams; the
-- confirmations, the sources and the query state are read online or not at all.
alter publication powersync add table
  public.results_imports,
  public.imported_results,
  public.imported_result_changes;

-- The registry must stay coherent: the organization is a federation with a
-- country, and the provider key starts with that country in lower case.
-- Security definer to read organizations whatever the caller can see.
create function public.results_import_sources_check()
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
     or org.type <> 'federation'
     or org.country_code is null
     or split_part(new.provider, '-', 1) <> lower(org.country_code) then
    raise exception 'the provider does not match a federation of that country' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.results_import_sources_check() from public, anon, authenticated;

create trigger results_import_sources_check
  before insert or update on public.results_import_sources
  for each row execute function public.results_import_sources_check();

-- The rule behind every write of an import or a confirmation: the requester
-- manages the athlete, the import authorization is in force now, and the
-- provider is the one registered for the organization. One message for every
-- reason, and no personal data in it. Not executable by clients.
create function app.results_import_assert_allowed(
  athlete uuid, requester uuid, organization uuid, provider text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Same lock as the authorization refresh: an import cannot race a withdrawal.
  perform pg_advisory_xact_lock(
    hashtextextended(results_import_assert_allowed.athlete::text || ':' || 'import_official_results', 0)
  );
  if requester is null
     or not exists (
       select 1 from public.athlete_managers m
       where m.user_id = results_import_assert_allowed.requester
         and m.athlete_id = results_import_assert_allowed.athlete
     )
     or not app.authorization_in_force_at(
       results_import_assert_allowed.athlete, 'import_official_results', 'infinity', 'infinity'
     )
     or results_import_assert_allowed.provider is distinct from (
       select s.provider from public.results_import_sources s
       where s.organization_id = results_import_assert_allowed.organization
     ) then
    raise exception 'results import not allowed' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function app.results_import_assert_allowed(uuid, uuid, uuid, text) from public, anon, authenticated;

create function public.results_imports_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.results_import_assert_allowed(new.athlete_id, new.requested_by, new.organization_id, new.provider);
  return new;
end;
$$;

create function public.results_import_confirmations_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.results_import_assert_allowed(new.athlete_id, new.confirmed_by, new.organization_id, new.provider);
  return new;
end;
$$;

revoke execute on function
  public.results_imports_check(),
  public.results_import_confirmations_check()
from public, anon, authenticated;

create trigger results_imports_check
  before insert on public.results_imports
  for each row execute function public.results_imports_check();

create trigger results_import_confirmations_check
  before insert on public.results_import_confirmations
  for each row execute function public.results_import_confirmations_check();

-- Provenance, evidence and imported results never change, for any role (a
-- trigger, not grants, so the owner and service_role are bound too). Clients
-- cannot delete; service_role can (and the athlete's cascade does).
create function public.results_import_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'imported results and their provenance cannot change' using errcode = '42501';
end;
$$;

revoke execute on function public.results_import_immutable() from public, anon, authenticated;

create trigger results_imports_immutable
  before update on public.results_imports
  for each row execute function public.results_import_immutable();

create trigger results_import_confirmations_immutable
  before update on public.results_import_confirmations
  for each row execute function public.results_import_immutable();

create trigger imported_results_immutable
  before update on public.imported_results
  for each row execute function public.results_import_immutable();

-- An imported result belongs to the athlete and provider of its import, and a
-- revision above 1 supersedes the previous revision of the same source result.
create function public.imported_results_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  imp public.results_imports;
  prev public.imported_results;
begin
  select * into imp from public.results_imports where id = new.import_id;
  if not found or imp.athlete_id <> new.athlete_id or imp.provider <> new.provider then
    raise exception 'the result does not match its import' using errcode = '23514';
  end if;
  if new.supersedes_id is not null then
    select * into prev from public.imported_results where id = new.supersedes_id;
    if not found
       or prev.athlete_id <> new.athlete_id
       or prev.provider <> new.provider
       or prev.source_result_key <> new.source_result_key
       or prev.revision <> new.revision - 1 then
      raise exception 'the revision does not supersede the previous one' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.imported_results_check() from public, anon, authenticated;

create trigger imported_results_check
  before insert on public.imported_results
  for each row execute function public.imported_results_check();

-- A change only goes from pending to resolved; its values never move.
create function public.imported_result_changes_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'pending'
     or new.status = 'pending'
     or (to_jsonb(new) - array['status', 'resolved_by', 'resolved_at'])
        is distinct from (to_jsonb(old) - array['status', 'resolved_by', 'resolved_at']) then
    raise exception 'a pending change only becomes resolved' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.imported_result_changes_guard() from public, anon, authenticated;

create trigger imported_result_changes_guard
  before update on public.imported_result_changes
  for each row execute function public.imported_result_changes_guard();

-- Read: the guardian or adult athlete of the athlete while the import
-- authorization is in force; nobody else (no admin, no coach). The status table
-- is read through its own policy: app.authorization_in_force_at is not
-- executable by clients. Imported results are read-only for everyone.
create policy results_import_sources_select on public.results_import_sources for select to authenticated
  using (true);
create policy results_import_sources_insert on public.results_import_sources for insert to authenticated
  with check ((select app.is_platform_admin()));
create policy results_import_sources_update on public.results_import_sources for update to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));
create policy results_import_sources_delete on public.results_import_sources for delete to authenticated
  using ((select app.is_platform_admin()));

create policy results_imports_select on public.results_imports for select to authenticated
  using (
    athlete_id in (select app.managed_athlete_ids())
    and exists (
      select 1 from public.authorization_status s
      where s.athlete_id = results_imports.athlete_id
        and s.purpose = 'import_official_results' and s.is_granted
    )
  );

create policy results_import_confirmations_select on public.results_import_confirmations for select to authenticated
  using (
    athlete_id in (select app.managed_athlete_ids())
    and exists (
      select 1 from public.authorization_status s
      where s.athlete_id = results_import_confirmations.athlete_id
        and s.purpose = 'import_official_results' and s.is_granted
    )
  );

create policy imported_results_select on public.imported_results for select to authenticated
  using (
    athlete_id in (select app.managed_athlete_ids())
    and exists (
      select 1 from public.authorization_status s
      where s.athlete_id = imported_results.athlete_id
        and s.purpose = 'import_official_results' and s.is_granted
    )
  );

create policy imported_result_changes_select on public.imported_result_changes for select to authenticated
  using (
    athlete_id in (select app.managed_athlete_ids())
    and exists (
      select 1 from public.authorization_status s
      where s.athlete_id = imported_result_changes.athlete_id
        and s.purpose = 'import_official_results' and s.is_granted
    )
  );

-- Rate limit: one claim per athlete covers every query to the source (search
-- and refresh). Returns null when the claim was taken (the caller may query
-- the source now) or the instant when the next query is allowed. The upsert is
-- atomic, so two concurrent requests cannot both be allowed. Only service_role.
create function public.results_import_claim_query(athlete uuid, requested_by uuid, min_interval interval)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  retry_at timestamptz;
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
    where q.last_queried_at + results_import_claim_query.min_interval <= excluded.last_queried_at;
  if found then
    return null;
  end if;

  select q.last_queried_at + results_import_claim_query.min_interval into retry_at
  from public.results_import_queries q
  where q.athlete_id = results_import_claim_query.athlete;
  return retry_at;
end;
$$;

-- Records one import: its provenance row, the new results, and a pending
-- change for each result the source now reports with other values. Keys of a
-- result other than the six value columns and sourceResultKey are ignored and
-- never stored. An unchanged result counts as a duplicate, also when its
-- difference was already seen and is pending or was kept. Only service_role.
create function public.record_imported_results(
  athlete uuid, organization uuid, requested_by uuid, results jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  src_provider text;
  new_import_id uuid;
  item jsonb;
  v_key text;
  v_stroke text;
  v_distance text;
  v_pool text;
  v_hundredths int;
  v_swum_on date;
  v_competition text;
  cur public.imported_results;
  last_change public.imported_result_changes;
  affected int;
  inserted_count int := 0;
  duplicate_count int := 0;
  change_count int := 0;
begin
  if jsonb_typeof(record_imported_results.results) is distinct from 'array' then
    raise exception 'results must be an array' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(record_imported_results.athlete::text || ':results-import', 0));

  select s.provider into src_provider
  from public.results_import_sources s
  where s.organization_id = record_imported_results.organization;
  if not found then
    raise exception 'no results source for that organization' using errcode = '22023';
  end if;

  insert into public.results_imports (athlete_id, organization_id, provider, requested_by)
  values (
    record_imported_results.athlete, record_imported_results.organization,
    src_provider, record_imported_results.requested_by
  )
  returning id into new_import_id;

  for item in select value from jsonb_array_elements(record_imported_results.results) loop
    v_key := item ->> 'sourceResultKey';
    v_stroke := item ->> 'stroke';
    v_distance := item ->> 'distance';
    v_pool := item ->> 'pool';
    v_hundredths := (item ->> 'hundredths')::int;
    v_swum_on := (item ->> 'swumOn')::date;
    v_competition := item ->> 'competition';
    if coalesce(v_key, '') = '' or v_stroke is null or v_distance is null or v_pool is null or v_swum_on is null then
      raise exception 'an imported result needs a key, stroke, distance, pool and date' using errcode = '22023';
    end if;

    select * into cur
    from public.imported_results r
    where r.athlete_id = record_imported_results.athlete
      and r.provider = src_provider
      and r.source_result_key = v_key
    order by r.revision desc
    limit 1;

    if not found then
      insert into public.imported_results
        (import_id, athlete_id, provider, source_result_key, stroke, distance, pool, hundredths, swum_on, competition)
      values
        (new_import_id, record_imported_results.athlete, src_provider, v_key,
         v_stroke, v_distance, v_pool, v_hundredths, v_swum_on, v_competition)
      on conflict (athlete_id, provider, source_result_key, revision) do nothing;
      get diagnostics affected = row_count;
      if affected = 1 then
        inserted_count := inserted_count + 1;
      else
        duplicate_count := duplicate_count + 1;
      end if;
      continue;
    end if;

    if cur.stroke is not distinct from v_stroke
       and cur.distance is not distinct from v_distance
       and cur.pool is not distinct from v_pool
       and cur.hundredths is not distinct from v_hundredths
       and cur.swum_on is not distinct from v_swum_on
       and cur.competition is not distinct from v_competition then
      duplicate_count := duplicate_count + 1;
      continue;
    end if;

    -- Different from the current revision: the source's latest known difference
    -- decides whether this one is new.
    select * into last_change
    from public.imported_result_changes c
    where c.imported_result_id = cur.id
    order by c.created_at desc, c.id desc
    limit 1;

    if found
       and last_change.status in ('pending', 'kept_current')
       and last_change.stroke is not distinct from v_stroke
       and last_change.distance is not distinct from v_distance
       and last_change.pool is not distinct from v_pool
       and last_change.hundredths is not distinct from v_hundredths
       and last_change.swum_on is not distinct from v_swum_on
       and last_change.competition is not distinct from v_competition then
      duplicate_count := duplicate_count + 1;
      continue;
    end if;

    update public.imported_result_changes c
      set status = 'replaced', resolved_at = clock_timestamp()
      where c.imported_result_id = cur.id and c.status = 'pending';

    insert into public.imported_result_changes
      (imported_result_id, athlete_id, import_id, stroke, distance, pool, hundredths, swum_on, competition)
    values
      (cur.id, record_imported_results.athlete, new_import_id,
       v_stroke, v_distance, v_pool, v_hundredths, v_swum_on, v_competition);
    change_count := change_count + 1;
  end loop;

  return jsonb_build_object(
    'importId', new_import_id, 'inserted', inserted_count,
    'duplicates', duplicate_count, 'changes', change_count
  );
end;
$$;

-- Records the evidence of "is this the person?". The evidence is rebuilt from
-- name, affiliations ({club, league, years} each) and resultCount: any other
-- key, at any depth, is never stored. Malformed evidence raises one generic
-- 22023 before any insert or cast, so no value reaches an error or the log.
-- Only service_role.
create function public.record_results_import_confirmation(
  athlete uuid, organization uuid, confirmed_by uuid, evidence jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  src_provider text;
  new_id uuid;
  aff jsonb;
  clean_affiliations jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(record_results_import_confirmation.evidence) is distinct from 'object'
     or jsonb_typeof(record_results_import_confirmation.evidence -> 'name') is distinct from 'string'
     or (record_results_import_confirmation.evidence ->> 'name') = ''
     or jsonb_typeof(record_results_import_confirmation.evidence -> 'affiliations') is distinct from 'array'
     or jsonb_typeof(record_results_import_confirmation.evidence -> 'resultCount') is distinct from 'number'
     or (record_results_import_confirmation.evidence -> 'resultCount')::text !~ '^(0|[1-9][0-9]{0,8})$' then
    raise exception 'the evidence needs a name, affiliations and a result count' using errcode = '22023';
  end if;

  for aff in select value from jsonb_array_elements(record_results_import_confirmation.evidence -> 'affiliations') loop
    if jsonb_typeof(aff) is distinct from 'object'
       or coalesce(jsonb_typeof(aff -> 'club'), '') not in ('string', 'null')
       or coalesce(jsonb_typeof(aff -> 'league'), '') not in ('string', 'null')
       or jsonb_typeof(aff -> 'years') is distinct from 'array'
       or exists (
         select 1 from jsonb_array_elements(aff -> 'years') as y(v)
         where jsonb_typeof(y.v) is distinct from 'number' or y.v::text !~ '^-?[0-9]{1,9}$'
       ) then
      raise exception 'the evidence needs a name, affiliations and a result count' using errcode = '22023';
    end if;
    clean_affiliations := clean_affiliations || jsonb_build_array(
      jsonb_build_object('club', aff -> 'club', 'league', aff -> 'league', 'years', aff -> 'years')
    );
  end loop;

  select s.provider into src_provider
  from public.results_import_sources s
  where s.organization_id = record_results_import_confirmation.organization;
  if not found then
    raise exception 'no results source for that organization' using errcode = '22023';
  end if;

  insert into public.results_import_confirmations
    (athlete_id, organization_id, provider, confirmed_by, candidate_name, affiliations, result_count)
  values (
    record_results_import_confirmation.athlete,
    record_results_import_confirmation.organization,
    src_provider,
    record_results_import_confirmation.confirmed_by,
    record_results_import_confirmation.evidence ->> 'name',
    clean_affiliations,
    (record_results_import_confirmation.evidence ->> 'resultCount')::int
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- The guardian or adult athlete resolves a pending change: 'use_new' adds a
-- revision that supersedes the current one; 'keep_current' leaves everything and
-- only records the choice. Either way who chose and when are recorded. Returns
-- the id of the imported result that is current afterwards. A caller who is not
-- allowed gets the same 42501 whether the change exists or not.
create function public.resolve_imported_result_change(change uuid, choice text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  chg_athlete uuid;
  chg public.imported_result_changes;
  cur public.imported_results;
  new_id uuid;
begin
  if resolve_imported_result_change.choice is distinct from 'use_new'
     and resolve_imported_result_change.choice is distinct from 'keep_current' then
    raise exception 'choice must be use_new or keep_current' using errcode = '22023';
  end if;

  select c.athlete_id into chg_athlete from public.imported_result_changes c
  where c.id = resolve_imported_result_change.change;
  if uid is null
     or not found
     or not exists (
       select 1 from public.athlete_managers m
       where m.user_id = uid and m.athlete_id = chg_athlete
     ) then
    raise exception 'results import not allowed' using errcode = '42501';
  end if;

  -- The lock of record_imported_results (taken before any row lock, same order
  -- there): a concurrent refresh cannot attach a change to a revision that this
  -- call is superseding.
  perform pg_advisory_xact_lock(hashtextextended(chg_athlete::text || ':results-import', 0));

  select * into chg from public.imported_result_changes c
  where c.id = resolve_imported_result_change.change for update;
  if not found
     or not app.authorization_in_force_at(chg.athlete_id, 'import_official_results', 'infinity', 'infinity') then
    raise exception 'results import not allowed' using errcode = '42501';
  end if;
  if chg.status <> 'pending' then
    raise exception 'the change is already resolved' using errcode = '55000';
  end if;

  select * into cur from public.imported_results r where r.id = chg.imported_result_id;
  new_id := cur.id;

  if resolve_imported_result_change.choice = 'use_new' then
    insert into public.imported_results
      (import_id, athlete_id, provider, source_result_key, revision, supersedes_id,
       stroke, distance, pool, hundredths, swum_on, competition)
    values
      (chg.import_id, cur.athlete_id, cur.provider, cur.source_result_key, cur.revision + 1, cur.id,
       chg.stroke, chg.distance, chg.pool, chg.hundredths, chg.swum_on, chg.competition)
    returning id into new_id;
  end if;

  update public.imported_result_changes c
    set status = case when resolve_imported_result_change.choice = 'use_new' then 'used_new' else 'kept_current' end,
        resolved_by = uid,
        resolved_at = clock_timestamp()
    where c.id = chg.id;
  return new_id;
end;
$$;

revoke execute on function
  public.results_import_claim_query(uuid, uuid, interval),
  public.record_imported_results(uuid, uuid, uuid, jsonb),
  public.record_results_import_confirmation(uuid, uuid, uuid, jsonb),
  public.resolve_imported_result_change(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.results_import_claim_query(uuid, uuid, interval),
  public.record_imported_results(uuid, uuid, uuid, jsonb),
  public.record_results_import_confirmation(uuid, uuid, uuid, jsonb)
to service_role;

grant execute on function public.resolve_imported_result_change(uuid, text) to authenticated;
