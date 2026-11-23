-- Module athletes: the owner recovers the school's anonymous copy of their swimmer with a recovery code (issue #1421, T156).
-- Rule of the maintainer (2026-11-22): the permanent code (TR-) or a single-use recovery code (RC-) of #1416 lets the owner ask the
-- school for the anonymous copy of #1420 (public.athlete_anonymous_copies) and so «recover data in a school». The flow is the one of #1251:
-- the school's admin approves and the marks of the copy move to the swimmer the family manages now (resolve_athlete_relink, unchanged
-- except for the check that the marker is still valid).
--
-- Two kinds of key, never mixed. request_athlete_relink keeps its signature. A text that is five hex groups of four (the
-- former_athlete_key of #1244) takes the path of #1251 as before. A text shaped like a recovery code (TR/RC plus 16 letters or digits, any
-- case, any separators) takes the new path: app.redeem_athlete_recovery_code (#1416) resolves it to an identity, which resolves to the
-- copies that carry it. The two normalizations differ (hex hash with fixed hyphens vs. alphanumeric hash), so a text of one kind can
-- never match a hash of the other. The two lengths differ too (20 and 18 characters).
--
-- Nothing stores the text: a request names the copy it matched (former_athlete_id, the anonymous swimmer), as in #1251, and the copy
-- already holds the identity. Answers (a refusal is an answer, not an error, so the failed attempt stays recorded):
--   'requested' / 'already_requested' / 'nothing_to_relink'  as in #1251; for a code, nothing_to_relink means the code is right and no
--                       copy has marks left to move (none exists, it is the swimmer's own, or it was already relinked once). A code that
--                       is right but has no copy to relink is answered BEFORE it is redeemed, so a recovery code is not spent for nothing;
--   'invalid_key'       the text matches no code (or is not shaped like one). A wrong code answers the same whether or not a copy
--                       exists, and is recorded twice: by redeem (athlete_recovery_code_failures, 5 per 15 minutes per user) and in the
--                       attempts of #1251 (5 per swimmer in 24 hours);
--   'rate_limited'      one of those limits is reached: nothing is checked, ANY code, right or wrong, is refused. For a code the redeem
--                       limit is read first (the failures of the caller in the last 15 minutes, before the pre-check below), so a
--                       locked-out caller cannot tell valid codes from wrong ones.
-- app.redeem_athlete_recovery_code raises 'too_many_attempts' when its limit is reached, before it records anything, so catching it here
-- loses no failure row; the failures it records for a wrong code stay because this function RETURNS 'invalid_key' (it never raises after
-- a null result, the contract of #1416).
-- Only a code of a recovery identity whose swimmer is not this one counts: the owner's own live swimmer already has those marks.
-- PROVISIONAL (verifier, to confirm with the maintainer): a code relinks only when its identity belongs to an erased swimmer (athlete_id
-- null), to a swimmer nobody manages (an anonymous marker), or to a swimmer the caller already manages. A code of a live swimmer that
-- another family manages answers 'invalid_key', like a wrong code, and records the same failure, so it never reveals that the code is right.
--
-- public.school_anonymous_copies(p_school) lists the anonymous swimmers of a school for its active admins (the table is server-only).
-- It never returns the identity or any code; linkable only says whether a code is attached.
-- Revert: restore request_athlete_relink and resolve_athlete_relink from 20261122100000_athletes_relink_requests.sql, then drop function
-- public.school_anonymous_copies(uuid), app.relink_copies(uuid, uuid) and app.relink_identity_allowed(uuid, uuid). Requests already created stay valid as they are.

-- The copies an identity can still recover for a swimmer: carrying the identity, not the swimmer's own, with marks of their school left.
create function app.relink_copies(p_identity uuid, p_athlete uuid)
returns table (copy_id uuid, copy_school uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.athlete_id, c.school_id
  from public.athlete_anonymous_copies c
  join public.athlete_recovery_identities i on i.id = c.identity_id
  where c.identity_id = p_identity
    and i.athlete_id is distinct from p_athlete
    and c.source_athlete_id is distinct from p_athlete
    and exists (select 1 from public.measurements m where m.athlete_id = c.athlete_id and m.school_id = c.school_id)
  order by c.school_id;
$$;

-- PROVISIONAL: may the caller relink the copies of this identity? Its swimmer is erased (no athlete), nobody manages it, or the caller does.
create function app.relink_identity_allowed(p_identity uuid, p_caller uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.athlete_recovery_identities i
    where i.id = p_identity
      and (
        i.athlete_id is null
        or not exists (select 1 from public.athlete_managers m where m.athlete_id = i.athlete_id)
        or exists (select 1 from public.athlete_managers m where m.athlete_id = i.athlete_id and m.user_id = p_caller)
      )
  );
$$;

revoke execute on function app.relink_copies(uuid, uuid), app.relink_identity_allowed(uuid, uuid) from public, anon, authenticated;

create or replace function public.request_athlete_relink(p_athlete uuid, p_key text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- PROVISIONAL starting values, for the maintainer to confirm (issue #1251): wrong keys per signed-in user and per swimmer in the window.
  caller_limit constant integer := 10;
  athlete_limit constant integer := 5;
  attempt_window constant interval := '24 hours';
  -- The limit of app.redeem_athlete_recovery_code (#1416), read here before anything about a code is looked up.
  redeem_limit constant integer := 5;
  redeem_window constant interval := '15 minutes';
  v_caller uuid := (select auth.uid());
  v_hex text := upper(regexp_replace(coalesce(p_key, ''), '[\s-]', '', 'g'));
  v_code text := upper(regexp_replace(coalesce(p_key, ''), '[^A-Za-z0-9]', '', 'g'));
  v_hash text;
  v_marker uuid;
  v_identity uuid;
  v_school uuid;
  v_created integer := 0;
  v_schools integer := 0;
begin
  if v_caller is null or not exists (
    select 1 from public.athlete_managers m where m.user_id = v_caller and m.athlete_id = request_athlete_relink.p_athlete
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- The athletes row first, like erase_account, which locks the swimmers before anything else.
  perform 1 from public.athletes a where a.id = request_athlete_relink.p_athlete for key share;
  -- One attempt at a time per user and per swimmer, always in this order (the pattern of the coach invitation sends, #1141).
  perform pg_advisory_xact_lock(hashtextextended(v_caller::text || ':relink-attempts', 0));
  perform pg_advisory_xact_lock(hashtextextended(request_athlete_relink.p_athlete::text || ':relink-attempts', 0));

  delete from public.athlete_relink_attempts t where t.attempted_at < now() - attempt_window;
  if (select count(*) from public.athlete_relink_attempts t where t.user_id = v_caller) >= caller_limit
     or (select count(*) from public.athlete_relink_attempts t where t.athlete_id = request_athlete_relink.p_athlete) >= athlete_limit then
    return 'rate_limited';
  end if;

  if v_hex ~ '^[0-9A-F]{20}$' then
    -- The key of an erased swimmer (#1251). The same text and the same hash as erase_account: five groups of four hex characters
    -- joined by hyphens.
    v_hash := encode(sha256(convert_to(regexp_replace(v_hex, '(....)(?=.)', '\1-', 'g'), 'UTF8')), 'hex');
    select k.athlete_id into v_marker from public.former_athlete_keys k
    where k.key_hash = v_hash and k.athlete_id <> request_athlete_relink.p_athlete;
    if v_marker is null then
      insert into public.athlete_relink_attempts (user_id, athlete_id) values (v_caller, request_athlete_relink.p_athlete);
      return 'invalid_key';
    end if;

    for v_school in
      select distinct m.school_id from public.measurements m where m.athlete_id = v_marker and m.school_id is not null order by 1
    loop
      v_schools := v_schools + 1;
      insert into public.athlete_relink_requests (athlete_id, former_athlete_id, school_id, requested_by)
      values (request_athlete_relink.p_athlete, v_marker, v_school, v_caller)
      on conflict (athlete_id, former_athlete_id, school_id) where status = 'pending' do nothing;
      if found then
        v_created := v_created + 1;
      end if;
    end loop;
  elsif v_code ~ '^(TR|RC)[A-Z0-9]{16}$' then
    -- A recovery code (#1416). A caller that redeem would lock out gets 'rate_limited' for any code, before the code is looked up.
    if (
      select count(*) from public.athlete_recovery_code_failures f where f.user_id = v_caller and f.failed_at > now() - redeem_window
    ) >= redeem_limit then
      return 'rate_limited';
    end if;
    -- Then look, without spending it, whether the code is right, may be used by the caller and has anything to relink.
    v_hash := app.athlete_recovery_code_hash(p_key);
    select x.id into v_identity from (
      select i.id from public.athlete_recovery_identities i where i.code_hash = v_hash
      union all
      select c.identity_id from public.athlete_recovery_codes c where c.code_hash = v_hash and c.used_at is null
    ) x limit 1;
    if v_identity is not null and not app.relink_identity_allowed(v_identity, v_caller) then
      -- The same answer and the same failures as a wrong code; the code is not spent.
      insert into public.athlete_recovery_code_failures (user_id) values (v_caller);
      insert into public.athlete_relink_attempts (user_id, athlete_id) values (v_caller, request_athlete_relink.p_athlete);
      return 'invalid_key';
    end if;
    if v_identity is not null and not exists (select 1 from app.relink_copies(v_identity, request_athlete_relink.p_athlete)) then
      return 'nothing_to_relink';
    end if;

    -- The redeem proper: it consumes a recovery code (once) and records a wrong one. Its lockout raises before it records anything.
    begin
      v_identity := app.redeem_athlete_recovery_code(p_key);
    exception when raise_exception then
      if sqlerrm = 'too_many_attempts' then
        return 'rate_limited';
      end if;
      raise;
    end;
    if v_identity is null or not app.relink_identity_allowed(v_identity, v_caller) then
      insert into public.athlete_relink_attempts (user_id, athlete_id) values (v_caller, request_athlete_relink.p_athlete);
      return 'invalid_key';
    end if;

    for v_marker, v_school in select r.copy_id, r.copy_school from app.relink_copies(v_identity, request_athlete_relink.p_athlete) r loop
      v_schools := v_schools + 1;
      insert into public.athlete_relink_requests (athlete_id, former_athlete_id, school_id, requested_by)
      values (request_athlete_relink.p_athlete, v_marker, v_school, v_caller)
      on conflict (athlete_id, former_athlete_id, school_id) where status = 'pending' do nothing;
      if found then
        v_created := v_created + 1;
      end if;
    end loop;
  else
    insert into public.athlete_relink_attempts (user_id, athlete_id) values (v_caller, request_athlete_relink.p_athlete);
    return 'invalid_key';
  end if;

  if v_schools = 0 then
    return 'nothing_to_relink';
  end if;
  return case when v_created > 0 then 'requested' else 'already_requested' end;
end;
$$;

-- Same body as 20261122100000_athletes_relink_requests.sql; the only change is the validity check of an approval: the marker is still
-- there when it holds a former_athlete_key (#1251) or is the anonymous copy of a recovery identity (#1420).
create or replace function public.resolve_athlete_relink(p_request uuid, p_approve boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '10s'
as $$
declare
  v_caller uuid := (select auth.uid());
  r public.athlete_relink_requests;
  v_moved integer := 0;
  v_status text;
begin
  select * into r from public.athlete_relink_requests q where q.id = resolve_athlete_relink.p_request;
  if not found or v_caller is null or not exists (
    select 1 from public.school_memberships m
    where m.user_id = v_caller and m.school_id = r.school_id and m.role = 'school_admin' and m.deactivated_at is null
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- The swimmers first (erase_account locks them before anything else), then the request.
  perform 1 from public.athletes a where a.id in (r.athlete_id, r.former_athlete_id) order by a.id for key share;
  select * into r from public.athlete_relink_requests q where q.id = resolve_athlete_relink.p_request for update;
  if not found or r.status <> 'pending' then
    return jsonb_build_object('status', 'already_resolved');
  end if;

  if p_approve and not (
    exists (select 1 from public.athlete_managers m where m.user_id = r.requested_by and m.athlete_id = r.athlete_id)
    and (
      exists (select 1 from public.former_athlete_keys k where k.athlete_id = r.former_athlete_id)
      or exists (select 1 from public.athlete_anonymous_copies c where c.athlete_id = r.former_athlete_id and c.identity_id is not null)
    )
  ) then
    update public.athlete_relink_requests q
      set status = 'rejected', resolved_by = v_caller, resolved_at = now(), moved_count = 0 where q.id = r.id;
    return jsonb_build_object('status', 'no_longer_valid');
  end if;

  if p_approve then
    -- The triggers of measurements check that the editor is a coach of both swimmers and that the new swimmer is in the school; none
    -- of that is the rule here (the school's admin decided), so they are off for this statement, like erase_account does, and back on
    -- before the recomputes below, which rely on them. Only the times of this school move. The swimmer is not linked to the school by
    -- this: the school's staff read the moved times only while the swimmer has an active link with it (the family always reads them).
    perform app.erasure_guard_off('public.measurements'::regclass);
    update public.measurements t set athlete_id = r.athlete_id where t.athlete_id = r.former_athlete_id and t.school_id = r.school_id;
    get diagnostics v_moved = row_count;
    perform app.erasure_guards_on();
    -- hidden depends on the authorizations of the swimmer who now owns the times, and guardian_visible on the sharing switch of the new
    -- (swimmer, school) pair or the school's default: the triggers that set them were off, so the moved rows still carry the values of
    -- the marker's pair and are recomputed here (only the rows whose value changes are written).
    perform public.measurements_recompute_hidden(r.athlete_id);
    perform public.measurements_recompute_guardian_visible(r.athlete_id, r.school_id);
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;
  update public.athlete_relink_requests q
    set status = v_status, resolved_by = v_caller, resolved_at = now(), moved_count = v_moved where q.id = r.id;
  return jsonb_build_object('status', v_status, 'moved', v_moved);
end;
$$;

-- The anonymous swimmers of a school, newest first, for its active admins only (42501 for anyone else, with no hint).
create function public.school_anonymous_copies(p_school uuid)
returns table (athlete_id uuid, created_at timestamptz, linkable boolean, times_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid()) and m.school_id = school_anonymous_copies.p_school
      and m.role = 'school_admin' and m.deactivated_at is null
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select c.athlete_id, c.created_at, c.identity_id is not null,
      (select count(*)::integer from public.measurements m where m.athlete_id = c.athlete_id and m.school_id = c.school_id)
    from public.athlete_anonymous_copies c
    where c.school_id = school_anonymous_copies.p_school
    order by c.created_at desc, c.athlete_id;
end;
$$;

revoke execute on function public.school_anonymous_copies(uuid) from public, anon;
grant execute on function public.school_anonymous_copies(uuid) to authenticated;
