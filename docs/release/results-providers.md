# Load the results providers per environment (runbook)

The `results-import` Edge Function only serves a provider when the database holds the rows that describe it. **No migration and no seed creates those rows**: writing the name of a federation, a results platform or a country in the repository goes against `AGENTS.md` (Generic organizations) and its limit on real data. The maintainer loads them once per environment with this runbook. The repository holds only the template; every value in angle brackets is filled in by the maintainer at run time and never committed.

- **Who:** the maintainer, as `postgres` (Supabase Studio SQL editor or `psql`). Nobody else can read the QA or PROD database, and agents never run this.
- **When:** after the migrations and the function are delivered (see [Edge Functions](../../deploy/README.md#edge-functions)), before the first import. PROD: step «load the results providers (runbook)» of the bootstrap issue #1118, next to the first `school_admin`; it stays on HOLD with the rest of the series #1113-#1120.
- **What it does not do:** it does not turn on tournament import (a maintainer decision, see `deploy/README.md`) and it does not change the schema or the function.

## What the function needs

Each provider adapter has a key, `<country>-<organization>`, and the function resolves it through two tables:

| Table | Constraint | What it means for the rows |
| --- | --- | --- |
| `organizations` | `organizations_type_check` | `type` is one of `federation`, `league`, `club`, `school`, `results_platform` (the last one added by `20261112120000_results-import_platform_per_provider.sql`). `country_code` is ISO 3166-1 alpha-2, **upper case** (`^[A-Z]{2}$`). `name` is required and not unique. |
| `results_import_sources` | primary key `organization_id` | One provider per organization. The table has no unique constraint on `provider`, so the runbook checks that each key appears **exactly once**. |
| `results_import_sources` | `provider ~ '^[a-z]{2}-[a-z0-9]+(-[a-z0-9]+)*$'` and the trigger function `results_import_sources_check` | The organization must be of type `federation` or `results_platform`, must have a `country_code`, and the key must start with that country in lower case. Otherwise `23514`. |

How the function reads them (`supabase/functions/results-import/registry.ts`):

- **Federation adapter** (first list of `createProviderRegistry` in `index.ts`): `resolve` walks from the athlete's organization up through `parent_organization_id` and takes the first `federation` whose source key is registered and starts with its own country. The parent link is how a club or league reaches its federation.
- **Platform adapter** (second list): `resolveUrl` needs **exactly one** `results_platform` organization holding that key, with the country matching the key. None or two means the address is refused (`null`), never guessed.

## Step 0. Read the keys the function registers

Do not copy keys from this document. Read them from the code of the version that is deployed:

```sh
rg -n "createProviderRegistry" supabase/functions/results-import/index.ts
rg -n "key:|PROVIDER_KEY" supabase/functions/results-import/providers
```

The first argument of `createProviderRegistry` lists federation adapters (organization type `federation`); the second lists platform adapters (organization type `results_platform`). Write down one pair per adapter: `<provider key>` and its organization type.

## Step 1. Verify (before loading)

Read-only. Run it as `postgres` with one row per pair from step 0. The `status` column must read `OK` for every row.

```sql
with expected(provider, org_type) as (
  values
    ('<provider key>', '<federation or results_platform>')
    -- one line per adapter of step 0: , ('<provider key>', '<federation or results_platform>')
)
select e.provider,
       count(s.organization_id) as source_rows,
       string_agg(o.type || ' / ' || coalesce(o.country_code, '-') || ' / ' || o.name, '; ') as organizations,
       case
         when count(s.organization_id) = 0 then 'MISSING'
         when count(s.organization_id) > 1 then 'DUPLICATED'
         when bool_and(o.type = e.org_type and o.country_code = upper(split_part(e.provider, '-', 1))) then 'OK'
         else 'WRONG TYPE OR COUNTRY'
       end as status
from expected e
left join public.results_import_sources s on s.provider = e.provider
left join public.organizations o on o.id = s.organization_id
group by e.provider, e.org_type
order by e.provider;
```

To also see every provider the database holds (a key that is not in step 0, for example):

```sql
select s.provider, o.type, o.country_code, o.name, o.parent_organization_id
from public.results_import_sources s
join public.organizations o on o.id = s.organization_id
order by s.provider;
```

- `MISSING`: load that provider (step 2).
- `DUPLICATED` or `WRONG TYPE OR COUNTRY`: **stop**. Do not load anything over it and do not delete rows; look at the rows with the second query and decide with the issue's owner. A duplicate key makes `resolveUrl` refuse every address of a platform.
- `OK` for every row: nothing to load. Finish here.

## Step 2. Load what is missing

One block per `MISSING` provider. Replace the five markers; leave `v_parent_name` as empty text `''` when the organization has no parent. It runs in one transaction (a `do` block), so it loads the organization and its source or neither.

```sql
do $$
declare
  v_name        text := '<organization name>';
  v_type        text := '<federation or results_platform>';
  v_country     text := '<ISO 3166-1 alpha-2, upper case>';
  v_provider    text := '<provider key>';
  v_parent_name text := '<parent federation name, or empty text>';
  v_parent_id   uuid;
  v_org_id      uuid;
begin
  -- Idempotent: a provider that is already registered is left as it is.
  if exists (select 1 from public.results_import_sources s where s.provider = v_provider) then
    raise notice 'provider % is already registered, nothing loaded', v_provider;
    return;
  end if;

  -- The parent must exist exactly once (strict raises on none or several).
  if v_parent_name <> '' then
    select o.id into strict v_parent_id
    from public.organizations o
    where o.type = 'federation' and o.name = v_parent_name;
  end if;

  -- Reuse the organization when an administrator already created it by hand; otherwise create it.
  -- Several matches raise and abort: pick the right one by hand instead of guessing.
  begin
    select o.id into strict v_org_id
    from public.organizations o
    where o.type = v_type
      and o.country_code = v_country
      and o.name = v_name
      and o.parent_organization_id is not distinct from v_parent_id;
  exception when no_data_found then
    insert into public.organizations (type, country_code, parent_organization_id, name)
    values (v_type, v_country, v_parent_id, v_name)
    returning id into v_org_id;
  end;

  -- The trigger refuses a type or a country that does not match the key (23514).
  -- An organization that already has another provider fails on the primary key: nothing is overwritten.
  insert into public.results_import_sources (organization_id, provider)
  values (v_org_id, v_provider);
end;
$$;
```

Running the same block twice is safe: the second run prints the notice and changes nothing.

## Step 3. Verify (after loading)

Run the step 1 query again. Every row must read `OK`. Save nothing from the output in the repository: names and identifiers of the environment stay in the environment.

## Per environment

- **QA:** the first action is the step 1 query. Load (step 2) only the providers that read `MISSING`, then verify again (step 3).
- **PROD:** same sequence, as a step of #1118, after its first `school_admin` step. PROD never receives QA data; the rows are loaded here from the template, not copied.
- **Local and demo:** the seed carries no provider rows on purpose. The function registers only its own adapters, so a made-up key would never be served. To exercise the flow locally, run the same template against the local database with local values.

## If a load is wrong

`results_imports` and `results_import_confirmations` reference `results_import_sources`, so a source row cannot be removed once an import used it. Before any import it is safe to delete the source row and then the organization it created, as `postgres`, in one transaction, and load again. After an import, ask the issue's owner first.
