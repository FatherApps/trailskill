-- Module: accounts. Issue #44.
-- A guardian or an adult athlete accepts a school invitation for one of their own
-- athletes. Guardians cannot write athlete_schools or athlete_groups (their
-- policies are for school admins), so this function is the only way in. The
-- school and the group always come from the invitation, never from the caller.
-- Provisional (#44): the category is optional, and an existing school link is
-- never changed, so its category stays as the school set it.
create function public.accept_invitation(token text, athlete_id uuid, category_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := (select auth.uid());
  inv public.school_invitations;
begin
  if caller is null then
    raise exception 'accept_invitation needs a signed-in user' using errcode = '42501';
  end if;

  -- Before the token, so a stranger learns nothing about invitations.
  if not exists (
    select 1 from public.athlete_managers m
    where m.user_id = caller and m.athlete_id = accept_invitation.athlete_id
  ) then
    raise exception 'athlete is not managed by the caller' using errcode = '42501';
  end if;

  -- Unknown, expired and revoked look the same, like resolve_invitation.
  select * into inv from public.school_invitations i
  where i.token = accept_invitation.token
    and i.revoked_at is null
    and i.expires_at > now();
  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;

  if accept_invitation.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = accept_invitation.category_id and c.school_id = inv.school_id
  ) then
    raise exception 'category does not belong to the invitation school' using errcode = '22023';
  end if;

  -- An inactive category is rejected by the athlete_schools_guard_inactive_category trigger.
  insert into public.athlete_schools (athlete_id, school_id, category_id, created_by)
  values (accept_invitation.athlete_id, inv.school_id, accept_invitation.category_id, caller)
  on conflict (athlete_id, school_id) do nothing;

  insert into public.athlete_groups (athlete_id, group_id, created_by)
  values (accept_invitation.athlete_id, inv.group_id, caller)
  on conflict (athlete_id, group_id) do nothing;
end;
$$;

-- Supabase grants execute on new functions to anon by default: only signed-in users may accept.
revoke execute on function public.accept_invitation(text, uuid, uuid) from public, anon;
grant execute on function public.accept_invitation(text, uuid, uuid) to authenticated;
