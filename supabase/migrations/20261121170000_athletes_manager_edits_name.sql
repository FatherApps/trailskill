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

-- The stored form of a name: no whitespace or invisible formatting characters at either end (NBSP, zero-width, bidi marks and
-- overrides, BOM and the other Unicode whitespace that \s covers), and then 1 to 100 characters with no control character and no
-- invisible formatting character inside (a bidi override could make a name read reversed in the coach and school views).
-- A name that is NULL or empty after the cleanup is refused with 23514.
create function app.clean_athlete_name(p_name text, p_label text)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
declare
  cleaned text := regexp_replace(p_name, '^[\s\u00a0\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]+|[\s\u00a0\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]+$', '', 'g');
begin
  if cleaned is null
     or cleaned = ''
     or char_length(cleaned) > 100
     or cleaned ~ '[\x01-\x1f\x7f-\x9f]'
     or cleaned ~ '[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]' then
    raise exception 'the % must have 1 to 100 characters, with no control or invisible formatting characters', p_label using errcode = '23514';
  end if;
  return cleaned;
end;
$fn$;

revoke execute on function app.clean_athlete_name(text, text) from public, anon, authenticated;

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
  if new.first_name is distinct from old.first_name then
    new.first_name := app.clean_athlete_name(new.first_name, 'first name');
  end if;
  if new.last_name is distinct from old.last_name then
    new.last_name := app.clean_athlete_name(new.last_name, 'last name');
  end if;
  return new;
end;
$$;

revoke execute on function app.athletes_limit_name_edit() from public, anon, authenticated;

create trigger athletes_limit_name_edit before update on public.athletes
  for each row execute function app.athletes_limit_name_edit();
