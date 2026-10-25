-- Module: accounts. Issue #157.
-- School invitations: the server always generates the token and the expiry,
-- an invitation can be revoked by an admin of its school or a platform admin,
-- and resolve_invitation returns null for an expired or revoked invitation.

-- Existing rows get the lifetime of a new invitation; the trigger below is the
-- only place that sets it from now on, so the default goes away.
alter table public.school_invitations
  add column expires_at timestamptz not null default now() + interval '14 days',
  add column revoked_at timestamptz;
alter table public.school_invitations alter column expires_at drop default;

-- The client never chooses the token, the expiry or the revocation: whatever it
-- sends is replaced. The 14 days are provisional: the maintainer confirms them
-- (#157). Change the interval here to change the lifetime.
create function public.school_invitations_set_server_values()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.token := encode(extensions.gen_random_bytes(16), 'hex');
  new.expires_at := now() + interval '14 days';
  new.revoked_at := null;
  return new;
end;
$$;

create trigger school_invitations_set_server_values
  before insert on public.school_invitations
  for each row execute function public.school_invitations_set_server_values();

-- Only the revocation may change, and only once. A trigger, not only column
-- grants, so the rule also binds the owner and the service role.
create function public.school_invitations_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'revoked_at') is distinct from (to_jsonb(old) - 'revoked_at') then
    raise exception 'an invitation can only be revoked' using errcode = '42501';
  end if;

  if old.revoked_at is not null then
    if new.revoked_at is null then
      raise exception 'an invitation revocation cannot be undone' using errcode = '42501';
    end if;
    -- A retried upload carries the device time: keep the stored one, a no-op.
    new.revoked_at := old.revoked_at;
  elsif new.revoked_at is not null then
    -- Server time, never the device's.
    new.revoked_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger school_invitations_guard_update
  before update on public.school_invitations
  for each row execute function public.school_invitations_guard_update();

grant update (revoked_at) on table public.school_invitations to authenticated;

-- Same people as the insert policy: an admin of the school or a platform admin.
-- The trigger limits an update to the revocation. No delete policy.
create policy school_invitations_update on public.school_invitations for update to authenticated
  using ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()))
  with check ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()));

create or replace function public.resolve_invitation(token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'school_name', s.name,
    'group_name', g.name,
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order)
        order by c.sort_order, c.name
      )
      from public.categories c
      where c.school_id = s.id
    ), '[]'::jsonb)
  )
  from public.school_invitations i
  join public.schools s on s.id = i.school_id
  join public.training_groups g on g.id = i.group_id
  where i.token = resolve_invitation.token
    and i.revoked_at is null
    and i.expires_at > now();
$$;

revoke execute on function public.resolve_invitation(text) from public;
grant execute on function public.resolve_invitation(text) to anon, authenticated;
