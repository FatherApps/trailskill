-- Module school-console: close the write access to school_memberships (issue #1092).
-- The old school_memberships_write policy (for all) let a school admin insert a
-- coach or school_admin membership for any user, delete any membership of the
-- school (another admin's included) and change role, user_id or school_id.
-- Now there is no insert or delete policy, so a membership is created only by the
-- security definer function public.accept_coach_invitations().
-- school_memberships_deactivate lets an admin of the school (or the platform
-- admin) update only coach memberships, which is how a coach is deactivated; the
-- deactivation guard also keeps every column except deactivated_at unchanged for
-- signed-in users.
-- This supersedes the comment in 20261115000100 that names school_memberships_write
-- as the policy limiting deactivation to admins.

drop policy if exists school_memberships_write on public.school_memberships;

create policy school_memberships_deactivate on public.school_memberships for update to authenticated
  using (((select app.is_platform_admin()) or school_id in (select app.admin_school_ids())) and role = 'coach')
  with check (((select app.is_platform_admin()) or school_id in (select app.admin_school_ids())) and role = 'coach');

create or replace function public.school_memberships_deactivation_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only deactivated_at may change for a signed-in user (issue #1092). auth.uid()
  -- is null for the database owner (migrations, seed, maintenance), which keeps
  -- fixing rows by hand, as with the reactivation below.
  if tg_op = 'UPDATE' and auth.uid() is not null
    and (to_jsonb(new) - 'deactivated_at') is distinct from (to_jsonb(old) - 'deactivated_at') then
    raise exception 'only deactivated_at can change in a school membership' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.deactivated_at is not null then
    -- auth.uid() is null for the database owner (migrations, maintenance).
    if new.deactivated_at is null and auth.uid() is not null then
      raise exception 'a deactivated coach cannot be reactivated' using errcode = '42501';
    end if;
    -- Idempotent: a device retrying the same PATCH keeps the first stamp.
    new.deactivated_at := old.deactivated_at;
  elsif new.deactivated_at is not null then
    -- The server stamps the time: the admin device clock is not trusted.
    new.deactivated_at := now();
  end if;
  return new;
end;
$$;
