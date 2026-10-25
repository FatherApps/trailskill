-- Module accounts: only platform admins write athlete_managers (issue #117).
-- A guardian link is created by the registration and invitation flows, which
-- arrive as security definer functions (issues #42 and #44); school admins
-- neither create nor remove it.

alter policy athlete_managers_write on public.athlete_managers
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));
