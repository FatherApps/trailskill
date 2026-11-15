-- Module: accounts. Issue #964.
-- A signed-in user accepts the coach invitations sent to the verified email of
-- their own account (the table belongs to school-console, #961). The function is
-- security definer because the caller can neither read the invitations (only the
-- admins of the school can) nor create a membership. The email always comes from
-- auth.users, never from an argument or a token claim, and an unverified email
-- accepts nothing. A coach deactivated in a school (#963) is never reactivated:
-- that invitation stays pending.

-- Existing rows get the lifetime of a new invitation; the trigger below is the
-- only place that sets it from now on, so the default goes away.
alter table public.coach_invitations
  add column expires_at timestamptz not null default now() + interval '14 days',
  add column accepted_at timestamptz,
  add column accepted_by uuid references auth.users (id);
alter table public.coach_invitations alter column expires_at drop default;

alter table public.coach_invitations drop constraint coach_invitations_status_check;
alter table public.coach_invitations
  add constraint coach_invitations_status_check check (status in ('pending', 'accepted', 'expired'));

-- The device never chooses the expiry (14 days, like the athletes' invitations).
-- A pending invitation past its expiry is closed here so inviting the same email
-- again works despite the unique pending index. Security definer: authenticated
-- has no update grant.
create function public.coach_invitations_set_server_values()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.coach_invitations i
  set status = 'expired'
  where i.school_id = new.school_id
    and i.email = new.email
    and i.status = 'pending'
    and i.expires_at <= now();
  new.expires_at := now() + interval '14 days';
  return new;
end;
$$;

create trigger coach_invitations_set_server_values
  before insert on public.coach_invitations
  for each row execute function public.coach_invitations_set_server_values();

-- Returns how many invitations became a coach membership. Safe to repeat.
create function public.accept_coach_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_email text;
  inv public.coach_invitations;
  accepted integer := 0;
begin
  if caller is null then
    raise exception 'accept_coach_invitations needs a signed-in user' using errcode = '42501';
  end if;

  select lower(btrim(u.email)) into caller_email
  from auth.users u
  where u.id = caller and u.email_confirmed_at is not null;
  if caller_email is null then
    return 0;
  end if;

  -- for update: two simultaneous calls accept each invitation once.
  for inv in
    select * from public.coach_invitations i
    where i.email = caller_email and i.status = 'pending' and i.expires_at > now()
    for update
  loop
    if exists (
      select 1 from public.school_memberships m
      where m.school_id = inv.school_id and m.user_id = caller and m.role = 'coach' and m.deactivated_at is not null
    ) then
      continue;
    end if;

    insert into public.school_memberships (school_id, user_id, role, created_by)
    values (inv.school_id, caller, 'coach', caller)
    on conflict (school_id, user_id, role) do nothing;

    update public.coach_invitations
    set status = 'accepted', accepted_at = now(), accepted_by = caller
    where id = inv.id;
    accepted := accepted + 1;
  end loop;

  return accepted;
end;
$$;

revoke execute on function public.accept_coach_invitations() from public, anon;
grant execute on function public.accept_coach_invitations() to authenticated;
