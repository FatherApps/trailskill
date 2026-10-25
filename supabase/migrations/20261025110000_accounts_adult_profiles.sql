-- Module accounts: the profile of the adult who owns an account, a guardian or
-- an adult athlete (issue #41). Only the name lives here: the contact is the
-- verified email in auth.users. The owner reads, creates and edits their own
-- profile; platform admins read every profile. Nobody deletes a profile from
-- the app. It is not synced to devices, so there is no PowerSync stream.
create table public.adult_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  first_name text not null check (btrim(first_name) <> '' and char_length(first_name) <= 100),
  last_name text not null check (btrim(last_name) <> '' and char_length(last_name) <= 100)
);

alter table public.adult_profiles enable row level security;

-- Supabase grants every privilege on new public tables by default: take them
-- back, then grant only what the owner uses.
revoke all on table public.adult_profiles from anon, authenticated;
grant select, insert, update on table public.adult_profiles to authenticated;

create policy adult_profiles_select on public.adult_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_platform_admin()));
create policy adult_profiles_insert on public.adult_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy adult_profiles_update on public.adult_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
