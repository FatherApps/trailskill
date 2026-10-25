-- Module accounts: visibility functions for row level security (issue #31).
-- They run as their owner (security definer) so policies can read the
-- relationship tables without recursing into those tables' own policies; the
-- empty search_path forces every object to be schema-qualified. anon cannot
-- execute them.

create schema app;
grant usage on schema app to authenticated;

create function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins where user_id = (select auth.uid())
  );
$$;

create function app.managed_athlete_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_id from public.athlete_managers where user_id = (select auth.uid());
$$;

revoke execute on function app.is_platform_admin(), app.managed_athlete_ids() from public;
grant execute on function app.is_platform_admin(), app.managed_athlete_ids() to authenticated;
