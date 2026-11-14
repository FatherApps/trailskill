-- Module accounts: school admins read the name and the contact of the
-- guardians of their school's athletes and of their school's coaches (issue
-- #220). Nothing else about those people is exposed: no identity numbers, no
-- birth dates. A coach still reads no guardian name.
--
-- What changes:
-- * adult_profiles gets contact_email, a server-side copy of the account email
--   (auth.users is not synced to devices). A BEFORE trigger always sets it, so a
--   client can never write a different contact, and an AFTER trigger on
--   auth.users keeps it current when the account email changes.
-- * app.school_admin_adult_ids() lists the guardians (relation = 'guardian', not
--   the adult athletes who manage themselves) and the coaches of the caller's
--   schools; the select policy adds it to the owner and platform admin rules.
-- * adult_profiles joins the powersync publication, superseding the "not synced"
--   note of 20261025110000_accounts_adult_profiles.sql. The stream is
--   accounts_adult_profiles in powersync/sync-config.yaml.
-- Insert and update policies are unchanged: admins never write a profile.
alter table public.adult_profiles add column contact_email text;

create function app.adult_profiles_set_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.contact_email := (select email from auth.users where id = new.user_id);
  return new;
end;
$$;

revoke execute on function app.adult_profiles_set_contact() from public;

create trigger adult_profiles_set_contact
  before insert or update on public.adult_profiles
  for each row execute function app.adult_profiles_set_contact();

-- Runs inside the auth transactions: keep it to one plain update.
create function app.adult_profiles_follow_account_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.adult_profiles set contact_email = new.email where user_id = new.id;
  return null;
end;
$$;

revoke execute on function app.adult_profiles_follow_account_email() from public;

create trigger adult_profiles_follow_account_email
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function app.adult_profiles_follow_account_email();

update public.adult_profiles as p set contact_email = u.email
from auth.users as u
where u.id = p.user_id;

create function app.school_admin_adult_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.athlete_managers
  where relation = 'guardian' and athlete_id in (select app.admin_athlete_ids())
  union
  select user_id from public.school_memberships
  where role = 'coach' and school_id in (select app.admin_school_ids());
$$;

revoke execute on function app.school_admin_adult_ids() from public;
grant execute on function app.school_admin_adult_ids() to authenticated;

drop policy adult_profiles_select on public.adult_profiles;
create policy adult_profiles_select on public.adult_profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.is_platform_admin())
    or user_id in (select app.school_admin_adult_ids())
  );

alter publication powersync add table public.adult_profiles;
