-- Module school-console: guardians and adult athletes read the school, category
-- and groups linked to the athletes they manage (issue #126). Extra permissive
-- select policies next to the member and admin ones; they grant no writes.

create policy schools_select_managed on public.schools for select to authenticated
  using (id in (select app.managed_school_ids()));

create policy categories_select_managed on public.categories for select to authenticated
  using (id in (select app.managed_category_ids()));

create policy training_groups_select_managed on public.training_groups for select to authenticated
  using (id in (select app.managed_group_ids()));
