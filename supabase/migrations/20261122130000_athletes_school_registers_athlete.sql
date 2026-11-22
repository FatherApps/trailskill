-- Module athletes: a school registers a swimmer who has no account and the family claims it later (issue #1422).
-- Rule of the maintainer (2026-11-22): the school can register a swimmer even if the swimmer never signed up in the app.
-- Until now only a platform admin created swimmers (athletes_insert), so a school could not start a swimmer's profile.
--
-- Two functions, the only way in (the new table has no write grant):
--   public.register_athlete_in_school  an active school_admin creates the swimmer, its (active) link with the school and a claim
--                                      link in one transaction. The school attests that it holds the guardian's signed authorization
--                                      from enrollment (the school is the one responsible); who and when are stored.
--   public.claim_athlete               the family opens the link: the caller becomes a manager of the swimmer (guardian or the adult
--                                      swimmer themself) and records the three authorizations of joining a school, as accept_invitation does.
-- Until a family claims it the profile stays under the school: no athlete_managers row exists, so no family reads it.
--
-- PROVISIONAL (maintainer confirmed the two defaults on #1422, the rest is ours to confirm):
--   * the link lasts 14 days, like school invitations (#157);
--   * a used link fails for everyone, the same family included: a lost answer is solved by reading whether the family now manages the swimmer;
--   * a link whose enrollment the school already ended (the baja, #1243) fails: the school gave up the swimmer, so nobody claims it through that link;
--   * there is no way yet to renew an expired link (the console, T158, asks for it);
--   * the table is not in the PowerSync publication: the app gets the token from the answer of register_athlete_in_school and reads the table online.
-- Revert: drop both functions and the table. Nothing else changes; swimmers already claimed keep their manager rows.

create table public.athlete_claims (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- A swimmer deleted with its account deletion (#1244) takes its claim link with it.
  athlete_id uuid not null unique references public.athletes on delete cascade,
  school_id uuid not null references public.schools,
  token text not null unique check (char_length(token) >= 32),
  expires_at timestamptz not null,
  -- Who attested, and when, that the school holds the guardian's signed authorization. No foreign key to auth.users, like
  -- athlete_schools.ended_by: the record outlives the account.
  declared_by uuid not null,
  declared_at timestamptz not null default now(),
  claimed_by uuid,
  claimed_at timestamptz,
  constraint athlete_claims_claimed_both_or_neither check ((claimed_by is null) = (claimed_at is null))
);

alter table public.athlete_claims enable row level security;

-- Clients only read: the school sees its links (to hand the link to the family), the platform admin all of them. A family never
-- reads this table: it knows the token from the link it was given and uses it through claim_athlete.
revoke all on table public.athlete_claims from anon;
revoke all on table public.athlete_claims from authenticated;
grant select on table public.athlete_claims to authenticated;

create policy athlete_claims_select on public.athlete_claims for select to authenticated
  using ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()));

-- A user marked for deletion writes nothing (#1244).
select app.guard_marked_account_writes('public.athlete_claims');

create function public.register_athlete_in_school(
  athlete_id uuid,
  school_id uuid,
  first_name text,
  last_name text,
  guardian_authorization_collected boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := (select auth.uid());
  inserted bigint;
  claim public.athlete_claims;
begin
  -- First, so nobody else learns whether a swimmer or a school exists. An active admin of that school only: the membership of a
  -- coach, of an admin of another school and of a deactivated admin do not count, nor does being a platform admin.
  if caller is null or not exists (
    select 1 from public.school_memberships m
    where m.user_id = caller
      and m.school_id = register_athlete_in_school.school_id
      and m.role = 'school_admin'
      and m.deactivated_at is null
  ) then
    raise exception 'only an active admin of the school can register a swimmer' using errcode = '42501';
  end if;

  if register_athlete_in_school.athlete_id is null
     or btrim(coalesce(register_athlete_in_school.first_name, '')) = '' or btrim(coalesce(register_athlete_in_school.last_name, '')) = ''
     or char_length(register_athlete_in_school.first_name) > 100 or char_length(register_athlete_in_school.last_name) > 100 then
    raise exception 'invalid swimmer' using errcode = '22023';
  end if;
  -- The school is the one responsible: it registers only with the guardian's signed authorization in hand.
  if register_athlete_in_school.guardian_authorization_collected is distinct from true then
    raise exception 'the school must attest that it holds the guardian''s authorization' using errcode = '22023';
  end if;

  -- ON CONFLICT DO NOTHING: an identical re-send, even a concurrent one, falls into the comparison below instead of failing.
  insert into public.athletes (id, first_name, last_name, created_by)
  values (register_athlete_in_school.athlete_id, register_athlete_in_school.first_name, register_athlete_in_school.last_name, caller)
  on conflict (id) do nothing;
  get diagnostics inserted = row_count;

  if inserted = 1 then
    insert into public.athlete_schools (athlete_id, school_id, created_by)
    values (register_athlete_in_school.athlete_id, register_athlete_in_school.school_id, caller);

    insert into public.athlete_claims (athlete_id, school_id, token, expires_at, declared_by)
    values (register_athlete_in_school.athlete_id, register_athlete_in_school.school_id,
            encode(extensions.gen_random_bytes(16), 'hex'), now() + interval '14 days', caller)
    returning * into claim;
  else
    -- A re-send is only the same admin's own registration for the same school; any other swimmer id is not theirs to touch.
    select * into claim from public.athlete_claims c
    where c.athlete_id = register_athlete_in_school.athlete_id
      and c.school_id = register_athlete_in_school.school_id
      and c.declared_by = caller;
    if not found then
      raise exception 'swimmer already exists' using errcode = '42501';
    end if;
  end if;

  return jsonb_build_object('athlete_id', claim.athlete_id, 'token', claim.token, 'expires_at', claim.expires_at);
end;
$$;

revoke execute on function public.register_athlete_in_school(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.register_athlete_in_school(uuid, uuid, text, text, boolean) to authenticated;

create function public.claim_athlete(token text, relation text, accepted_at timestamptz, authorizations jsonb)
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

  -- Unknown, expired and used look the same, so a stranger learns nothing about links. The row is locked: two families
  -- opening the same link at once cannot both win. A link whose enrollment the school already ended fails too.
  select * into claim from public.athlete_claims c
  where c.token = claim_athlete.token
    and c.claimed_at is null
    and c.expires_at > now()
    and exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = c.athlete_id and s.school_id = c.school_id and s.ended_at is null
    )
  for update;
  if not found then
    raise exception 'claim link not found' using errcode = 'P0002';
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

-- Supabase grants execute on new functions to anon by default: only signed-in users may claim.
revoke execute on function public.claim_athlete(text, text, timestamptz, jsonb) from public, anon;
grant execute on function public.claim_athlete(text, text, timestamptz, jsonb) to authenticated;
