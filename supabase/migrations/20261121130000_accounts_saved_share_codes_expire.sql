-- Module accounts: a share code the family changed is kept, marked as expired, instead of deleted (issue #1320). Whoever kept
-- it and tries to send with it must see that it expired and ask for the new one: before, the code just vanished (#1302).
-- The row keeps the old code and the short name; only the owner reads it, as before (saved_athlete_share_codes_select is
-- the same). It goes when the owner removes it ("Quitar"), when the family removes the code or the swimmer, or when an
-- accepted send keeps the new code (expired_at goes back to null).

alter table public.saved_athlete_share_codes add column if not exists expired_at timestamptz;

-- Keeps for `owner` the current code of `athlete`, if it did not change since `since` (when the owner used it): a code
-- the owner was never given is never kept. Returns whether it was kept. For other modules' server functions only.
create or replace function app.save_athlete_share_code(owner uuid, athlete uuid, since timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_code public.athlete_share_codes;
begin
  select * into current_code from public.athlete_share_codes where athlete_id = athlete;
  if current_code.athlete_id is null or current_code.created_at > since then
    return false;
  end if;
  insert into public.saved_athlete_share_codes (user_id, athlete_id, code, athlete_short_name)
  values (owner, athlete, current_code.code, app.athlete_short_name(athlete))
  on conflict (user_id, athlete_id) do update
    set code = excluded.code, athlete_short_name = excluded.athlete_short_name, saved_at = now(), expired_at = null;
  return true;
end;
$$;

-- A changed code expires for everyone who kept it (the row keeps the code they had); a removed one goes with its rows.
create or replace function app.forget_saved_athlete_share_codes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.saved_athlete_share_codes where athlete_id = old.athlete_id;
  elsif new.code is distinct from old.code then
    -- An already expired row keeps the time it expired at.
    update public.saved_athlete_share_codes set expired_at = coalesce(expired_at, now()) where athlete_id = old.athlete_id;
  end if;
  return null;
end;
$$;

-- create or replace keeps the grants and the trigger: no execute for the app roles.
