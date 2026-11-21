-- Module: accounts. Issue #1328.
-- Joining a school accepts, in one step, the three authorizations the school needs to record and see the swimmer's times:
-- record_times, import_official_results and share_results_with_school. Decision of the maintainer (2026-11-21): when a
-- school calls a swimmer, or a swimmer joins a school, the registration of their data and times must be authorized at
-- once, or schools and coaches cannot see or edit that information. This replaces "one acceptance never implies another"
-- for joining a school only; show_photo stays a separate, optional checkbox, and withdrawing stays one by one.
--
-- accept_invitation (issue #44) keeps what it did and also writes the three authorizations, with the text and version the
-- person was shown, in the same transaction. The old three-argument signature is dropped, so no client can join a school
-- without the evidence. The client generates the ids: a retry of the same call sends the same ids and does nothing twice.
drop function public.accept_invitation(text, uuid, uuid);

create function public.accept_invitation(token text, athlete_id uuid, category_id uuid, accepted_at timestamptz, authorizations jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := (select auth.uid());
  inv public.school_invitations;
  -- The three purposes that joining a school accepts, fixed here on purpose and sorted: a purpose added to the
  -- platform later is never accepted by this function without a new migration and a new decision of the maintainer.
  required constant text[] := array['import_official_results', 'record_times', 'share_results_with_school'];
  sent text[];
  incomplete boolean;
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

  if accept_invitation.accepted_at is null then
    raise exception 'the device time of the acceptance is required' using errcode = '22023';
  end if;

  -- Exactly one {id, purpose, text_id} object for each of the three purposes: a missing, repeated or other purpose,
  -- an object without a field, and a value that is not a uuid are all refused.
  begin
    select array_agg(a.purpose order by a.purpose), coalesce(bool_or(a.id is null or a.purpose is null or a.text_id is null), true)
    into sent, incomplete
    from jsonb_to_recordset(accept_invitation.authorizations) as a(id uuid, purpose text, text_id uuid);
  exception when invalid_text_representation or invalid_parameter_value then
    raise exception 'authorizations must be a list of {id, purpose, text_id} objects' using errcode = '22023';
  end;
  if incomplete or sent is distinct from required then
    raise exception 'authorizations must have exactly one object for each of the three purposes' using errcode = '22023';
  end if;

  -- Any version of the text is accepted, but it must be a text of that same purpose.
  if exists (
    select 1 from jsonb_to_recordset(accept_invitation.authorizations) as a(id uuid, purpose text, text_id uuid)
    where not exists (select 1 from public.authorization_texts t where t.id = a.text_id and t.purpose = a.purpose)
  ) then
    raise exception 'the text does not exist for that purpose' using errcode = '22023';
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

  -- A trigger clamps accepted_at to the reception time and sets received_at; another one keeps authorization_status.
  insert into public.authorizations (id, user_id, athlete_id, purpose, text_id, accepted_at)
  select a.id, caller, accept_invitation.athlete_id, a.purpose, a.text_id, accept_invitation.accepted_at
  from jsonb_to_recordset(accept_invitation.authorizations) as a(id uuid, purpose text, text_id uuid)
  on conflict (id) do nothing;

  -- A retry finds its own rows. An id that already exists for another user, athlete, purpose or text is never
  -- adopted: the whole call fails and nothing stays written.
  if exists (
    select 1 from jsonb_to_recordset(accept_invitation.authorizations) as a(id uuid, purpose text, text_id uuid)
    join public.authorizations x on x.id = a.id
    where x.user_id is distinct from caller
       or x.athlete_id is distinct from accept_invitation.athlete_id
       or x.purpose is distinct from a.purpose
       or x.text_id is distinct from a.text_id
  ) then
    raise exception 'an authorization id already belongs to another record' using errcode = '42501';
  end if;
end;
$$;

-- Supabase grants execute on new functions to anon by default: only signed-in users may accept.
revoke execute on function public.accept_invitation(text, uuid, uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.accept_invitation(text, uuid, uuid, timestamptz, jsonb) to authenticated;
