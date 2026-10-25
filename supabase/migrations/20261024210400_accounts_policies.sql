-- Module accounts: row level security policies for athlete_managers and
-- platform_admins (issue #31). Only platform admins write platform_admins.
-- "for all" write policies also let the writer select, and every writer here
-- already sees those rows through the select policies.

create policy athlete_managers_select on public.athlete_managers for select to authenticated
  using ((select app.is_platform_admin()) or athlete_id in (select app.visible_athlete_ids()));
create policy athlete_managers_write on public.athlete_managers for all to authenticated
  using ((select app.is_platform_admin()) or athlete_id in (select app.admin_athlete_ids()))
  with check ((select app.is_platform_admin()) or athlete_id in (select app.admin_athlete_ids()));

create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_platform_admin()));
create policy platform_admins_write on public.platform_admins for all to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));
