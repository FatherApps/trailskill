-- Module accounts: the share codes another family gave a guardian, kept for the next sends (issue #1302). Once a family
-- accepted a time sent with their swimmer's code, the sender keeps that code, so they do not have to ask for it again.
-- A code is kept only after an accepted send: a rejected first send keeps nothing. It is gone, for everyone who kept it,
-- as soon as the swimmer's family changes the code (rotate_athlete_share_code) or the swimmer is removed: an old code
-- never stays offered. The sender sees only what they already had: the code they typed and the short name ("Ana M.").
-- Nobody writes these rows directly: only the functions below. The owner reads their own rows (the swimmer is not synced).

create table public.saved_athlete_share_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  athlete_id uuid not null references public.athletes on delete cascade,
  code text not null,
  athlete_short_name text not null,
  saved_at timestamptz not null default now(),
  unique (user_id, athlete_id)
);

create index saved_athlete_share_codes_athlete_idx on public.saved_athlete_share_codes (athlete_id);

alter table public.saved_athlete_share_codes enable row level security;
-- The default privileges grant every new table to anon and authenticated: only reading stays, for the owner.
revoke all on table public.saved_athlete_share_codes from anon, authenticated;
grant select on table public.saved_athlete_share_codes to authenticated;

create policy saved_athlete_share_codes_select on public.saved_athlete_share_codes for select to authenticated
  using (user_id = (select auth.uid()));

alter publication powersync add table public.saved_athlete_share_codes;

-- A marked account writes nothing (#1244), like every table of the public schema.
select app.guard_marked_account_writes('public.saved_athlete_share_codes');

-- Keeps for `owner` the current code of `athlete`, if it did not change since `since` (when the owner used it): a code
-- the owner was never given is never kept. Returns whether it was kept. For other modules' server functions only.
create function app.save_athlete_share_code(owner uuid, athlete uuid, since timestamptz)
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
    set code = excluded.code, athlete_short_name = excluded.athlete_short_name, saved_at = now();
  return true;
end;
$$;

revoke execute on function app.save_athlete_share_code(uuid, uuid, timestamptz) from public, anon, authenticated;

-- A changed or removed code stops being offered to everyone who kept it.
create function app.forget_saved_athlete_share_codes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.code is distinct from old.code then
    delete from public.saved_athlete_share_codes where athlete_id = old.athlete_id;
  end if;
  return null;
end;
$$;

revoke execute on function app.forget_saved_athlete_share_codes() from public, anon, authenticated;

create trigger athlete_share_codes_forget_saved
  after update or delete on public.athlete_share_codes
  for each row execute function app.forget_saved_athlete_share_codes();

-- The owner removes one of their kept codes ("Quitar"). Removing one that is not theirs, or gone, does nothing.
create function public.forget_saved_athlete_share_code(saved uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.saved_athlete_share_codes where id = saved and user_id = (select auth.uid());
$$;

revoke execute on function public.forget_saved_athlete_share_code(uuid) from public, anon;
grant execute on function public.forget_saved_athlete_share_code(uuid) to authenticated;
