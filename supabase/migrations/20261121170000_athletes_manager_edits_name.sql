-- Module athletes: whoever manages a swimmer (a guardian, or the adult athlete themself) can correct the
-- swimmer's first and last name (issue #1364). Additive: athletes_update keeps the platform admin as it was.
--
-- Design: a second permissive UPDATE policy for the rows of athlete_managers, plus a BEFORE UPDATE trigger that
-- (1) lets a signed-in non-admin change only first_name and last_name and (2) validates the names. A policy and
-- not a security definer function so the local-first PATCH of src/core/sync keeps working offline. The trigger,
-- not column grants, so a platform admin keeps the write access to every column it has today.
-- School staff (admin, coach) have no row in athlete_managers, so they stay unable to edit the profile.
-- The marked-account guard (app.guard_marked_account_writes) is already on public.athletes and refuses a marked account.

create policy athletes_manager_update on public.athletes for update to authenticated
  using (id in (select app.managed_athlete_ids()))
  with check (id in (select app.managed_athlete_ids()));

-- Like the marked-account guard, it looks at the signed-in user: with no user (service role, the deletion worker that calls
-- erase_account, the owner) nothing is restricted; a platform admin keeps every column.
create function app.athletes_limit_name_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and not app.is_platform_admin()
     and (to_jsonb(new) - 'first_name' - 'last_name') is distinct from (to_jsonb(old) - 'first_name' - 'last_name') then
    raise exception 'only the first and last name of an athlete can be edited' using errcode = '42501';
  end if;

  -- Names are validated only when they change, so rows stored before this rule are never rejected for another edit.
  -- shortcut: only ASCII/C1 control characters and the plain space are checked; upgrade if other invisible characters show up.
  if new.first_name is distinct from old.first_name then
    new.first_name := btrim(new.first_name);
    if new.first_name = '' or char_length(new.first_name) > 100 or new.first_name ~ '[\x01-\x1f\x7f-\x9f]' then
      raise exception 'the first name must have 1 to 100 characters and no control characters' using errcode = '23514';
    end if;
  end if;
  if new.last_name is distinct from old.last_name then
    new.last_name := btrim(new.last_name);
    if new.last_name = '' or char_length(new.last_name) > 100 or new.last_name ~ '[\x01-\x1f\x7f-\x9f]' then
      raise exception 'the last name must have 1 to 100 characters and no control characters' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function app.athletes_limit_name_edit() from public, anon, authenticated;

create trigger athletes_limit_name_edit before update on public.athletes
  for each row execute function app.athletes_limit_name_edit();
