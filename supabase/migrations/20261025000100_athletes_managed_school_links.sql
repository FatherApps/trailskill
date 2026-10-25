-- Module athletes: the schools, categories and groups linked to the athletes a
-- user manages (issue #126). Guardians and adult athletes (athlete_managers)
-- see only what their own athletes are linked to, never other schools or the
-- school's other categories and groups. They live here so other modules'
-- policies do not read athlete_schools or athlete_groups directly.

create function app.managed_school_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select school_id from public.athlete_schools
  where athlete_id in (select app.managed_athlete_ids());
$$;

create function app.managed_category_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select category_id from public.athlete_schools
  where category_id is not null
    and athlete_id in (select app.managed_athlete_ids());
$$;

create function app.managed_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select group_id from public.athlete_groups
  where athlete_id in (select app.managed_athlete_ids());
$$;

revoke execute on function app.managed_school_ids(), app.managed_category_ids(), app.managed_group_ids() from public;
grant execute on function app.managed_school_ids(), app.managed_category_ids(), app.managed_group_ids() to authenticated;
