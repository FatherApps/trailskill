-- The school renews or revokes the claim link of a swimmer nobody has claimed yet (issue #1423, maintainer decision of 2026-11-22).
-- Until now an expired link, or one sent to the wrong person, failed for everyone and the swimmer stayed unreachable.
--
--   public.renew_athlete_claim_link   an active school_admin of the enrolling school gets a NEW token that lasts 14 days; the old
--                                     token stops working at once (it no longer exists on the row).
--   public.revoke_athlete_claim_link  the token stops working (claim_athlete answers P0002, like for an unknown link); the school can renew later.
-- Both work only on an UNCLAIMED link whose enrollment is still active; a claimed link or an ended enrollment is refused with 55000.
-- Anyone who is not an active admin of that school, and an unknown swimmer, get the same 42501, so nobody learns whether a link exists.
-- A renew or a revoke racing a claim gives exactly one winner: the three lock the claim row (for update); the loser re-reads the row after
-- the winner committed and finds a different token, a revoked link or a claimed one.
--
-- PROVISIONAL (issue 1423; the maintainer confirms): the renewed link lasts 14 days, the same as the first one; revoking a revoked link is a
-- no-op (the first revocation stays); renewing a revoked or expired link is the way to issue a new one; the swimmer id of a re-sent registration
-- (register_athlete_in_school) still answers with the stored token, which can be a revoked or expired one: the school renews it.
-- Revert: drop both functions, restore claim_athlete from 20261122130000 (without the revoked_at filter) and drop the four columns and constraints.

alter table public.athlete_claims
  -- Who revoked the link and when, and who renewed it last. The people go with their account (account deletion, #1244: set null, so no
  -- id of an erased user stays here); the times stay as evidence.
  add column revoked_at timestamptz,
  add column revoked_by uuid references auth.users on delete set null,
  add column renewed_at timestamptz,
  add column renewed_by uuid references auth.users on delete set null,
  add constraint athlete_claims_revoked_by_needs_revoked_at check (revoked_by is null or revoked_at is not null),
  add constraint athlete_claims_renewed_by_needs_renewed_at check (renewed_by is null or renewed_at is not null),
  -- A claimed link is never revoked: it is already used.
  add constraint athlete_claims_claimed_is_not_revoked check (claimed_at is null or revoked_at is null);

-- claim_athlete: the same function as in 20261122130000 plus one filter, so a revoked link fails like an unknown one (P0002).
create or replace function public.claim_athlete(token text, relation text, accepted_at timestamptz, authorizations jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := (select auth.uid());
  -- The three purposes that joining a school accepts, as in accept_invitation (#1328): a purpose added to the platform later is
  -- never accepted here without a new migration and a new decision of the maintainer.
  required constant text[] := array['import_official_results', 'record_times', 'share_results_with_school'];
  sent text[];
  incomplete boolean;
  claim public.athlete_claims;
begin
  if caller is null then
    raise exception 'claim_athlete needs a signed-in user' using errcode = '42501';
  end if;

  if claim_athlete.relation is null or claim_athlete.relation not in ('guardian', 'self') then
    raise exception 'relation must be guardian or self' using errcode = '22023';
  end if;
  if claim_athlete.accepted_at is null then
    raise exception 'the device time of the acceptance is required' using errcode = '22023';
  end if;

  -- Exactly one {id, purpose, text_id} object for each of the three purposes (same checks as accept_invitation).
  begin
    select array_agg(a.purpose order by a.purpose), coalesce(bool_or(a.id is null or a.purpose is null or a.text_id is null), true)
    into sent, incomplete
    from jsonb_to_recordset(claim_athlete.authorizations) as a(id uuid, purpose text, text_id uuid);
  exception when invalid_text_representation or invalid_parameter_value or datatype_mismatch then
    raise exception 'authorizations must be a list of {id, purpose, text_id} objects' using errcode = '22023';
  end;
  if incomplete or sent is distinct from required then
    raise exception 'authorizations must have exactly one object for each of the three purposes' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(claim_athlete.authorizations) as a(id uuid, purpose text, text_id uuid)
    where not exists (select 1 from public.authorization_texts t where t.id = a.text_id and t.purpose = a.purpose)
  ) then
    raise exception 'the text does not exist for that purpose' using errcode = '22023';
  end if;

  -- Unknown, expired, revoked and used look the same, so a stranger learns nothing about links. The row is locked: two families
  -- opening the same link at once cannot both win. A link whose enrollment the school already ended fails too.
  select * into claim from public.athlete_claims c
  where c.token = claim_athlete.token
    and c.claimed_at is null
    and c.revoked_at is null
    and c.expires_at > now()
    and exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = c.athlete_id and s.school_id = c.school_id and s.ended_at is null
    )
  for update;
  if not found then
    raise exception 'claim link not found' using errcode = 'P0002';
  end if;

  -- The school cannot claim its own swimmer: an active member (admin or coach) of the enrolling school who holds the token is
  -- refused, so the family's consent is never recorded by the school. The call fails whole, so the link stays unused. PROVISIONAL:
  -- a deactivated former member (deactivated_at set) is not staff any more and may claim; staff of another school may claim too.
  if exists (
    select 1 from public.school_memberships m
    where m.user_id = caller and m.school_id = claim.school_id and m.deactivated_at is null
  ) then
    raise exception 'staff of the enrolling school cannot claim the swimmer' using errcode = '42501';
  end if;

  insert into public.athlete_managers (user_id, athlete_id, relation, created_by)
  values (caller, claim.athlete_id, claim_athlete.relation, caller);

  -- A trigger clamps accepted_at to the reception time and sets received_at; another one keeps authorization_status. A plain insert:
  -- an id that already exists (a retry or someone else's) fails the whole call and nothing stays written.
  insert into public.authorizations (id, user_id, athlete_id, purpose, text_id, accepted_at)
  select a.id, caller, claim.athlete_id, a.purpose, a.text_id, claim_athlete.accepted_at
  from jsonb_to_recordset(claim_athlete.authorizations) as a(id uuid, purpose text, text_id uuid);

  update public.athlete_claims c set claimed_by = caller, claimed_at = now() where c.id = claim.id;

  return claim.athlete_id;
end;
$$;

create function public.renew_athlete_claim_link(athlete_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := (select auth.uid());
  link_school uuid;
  claim public.athlete_claims;
begin
  -- First, without a lock, so a stranger can neither learn whether a link exists nor hold its row: an active admin of the school
  -- that enrolled the swimmer only (a coach, an admin of another school, a deactivated admin and a platform admin do not count).
  select c.school_id into link_school from public.athlete_claims c where c.athlete_id = renew_athlete_claim_link.athlete_id;
  if caller is null or link_school is null or not exists (
    select 1 from public.school_memberships m
    where m.user_id = caller and m.school_id = link_school and m.role = 'school_admin' and m.deactivated_at is null
  ) then
    raise exception 'only an active admin of the enrolling school can renew a claim link' using errcode = '42501';
  end if;

  -- The row is locked, as claim_athlete does: a claim running now finishes first and then this call finds the link used.
  select * into claim from public.athlete_claims c where c.athlete_id = renew_athlete_claim_link.athlete_id for update;
  if not found then
    raise exception 'only an active admin of the enrolling school can renew a claim link' using errcode = '42501';
  end if;
  if claim.claimed_at is not null or not exists (
    select 1 from public.athlete_schools s
    where s.athlete_id = claim.athlete_id and s.school_id = claim.school_id and s.ended_at is null
  ) then
    raise exception 'the link is already used or the swimmer left the school' using errcode = '55000';
  end if;

  update public.athlete_claims c
  set token = encode(extensions.gen_random_bytes(16), 'hex'), expires_at = now() + interval '14 days',
      revoked_at = null, revoked_by = null, renewed_at = now(), renewed_by = caller
  where c.id = claim.id
  returning * into claim;

  return jsonb_build_object('athlete_id', claim.athlete_id, 'token', claim.token, 'expires_at', claim.expires_at);
end;
$$;

create function public.revoke_athlete_claim_link(athlete_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := (select auth.uid());
  link_school uuid;
  claim public.athlete_claims;
begin
  select c.school_id into link_school from public.athlete_claims c where c.athlete_id = revoke_athlete_claim_link.athlete_id;
  if caller is null or link_school is null or not exists (
    select 1 from public.school_memberships m
    where m.user_id = caller and m.school_id = link_school and m.role = 'school_admin' and m.deactivated_at is null
  ) then
    raise exception 'only an active admin of the enrolling school can revoke a claim link' using errcode = '42501';
  end if;

  select * into claim from public.athlete_claims c where c.athlete_id = revoke_athlete_claim_link.athlete_id for update;
  if not found then
    raise exception 'only an active admin of the enrolling school can revoke a claim link' using errcode = '42501';
  end if;
  if claim.claimed_at is not null or not exists (
    select 1 from public.athlete_schools s
    where s.athlete_id = claim.athlete_id and s.school_id = claim.school_id and s.ended_at is null
  ) then
    raise exception 'the link is already used or the swimmer left the school' using errcode = '55000';
  end if;

  -- A second revocation keeps the first one: who revoked and when do not change.
  update public.athlete_claims c set revoked_at = now(), revoked_by = caller where c.id = claim.id and c.revoked_at is null;
end;
$$;

-- Supabase grants execute on new functions to anon by default: only signed-in users may renew or revoke.
revoke execute on function public.renew_athlete_claim_link(uuid) from public, anon;
grant execute on function public.renew_athlete_claim_link(uuid) to authenticated;
revoke execute on function public.revoke_athlete_claim_link(uuid) from public, anon;
grant execute on function public.revoke_athlete_claim_link(uuid) to authenticated;
