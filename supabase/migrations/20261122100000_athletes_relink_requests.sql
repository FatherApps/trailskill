-- Module: athletes. Issue #1251: a family that comes back asks the school to give the school's times of the swimmer back to them. When an
-- account is erased (#1244) the times the school recorded stay on a marker without identity that has a random former_athlete_key, of which
-- only the hash is kept (public.former_athlete_keys). Approved by the maintainer on 2026-11-20: the family asks with that key, the server
-- compares it with the stored hash, and only an active school_admin of the school that owns the times approves.
--
-- Nothing here stores the key: the request names the marker it matched (former_athlete_id) and the failed attempts store no text at all.
-- A wrong key creates no request and answers 'invalid_key' whether or not a marker exists. The tables are read and written only by the
-- functions below (row level security with no policy, no grant, not in the powersync publication): the screens need a connection.
--
-- One request per school that owns times of the marker, because a school may only decide on its own times; approving moves only the times
-- of that school. A request of a marker whose times were already moved (by an earlier approval) moves none and says so (moved_count 0).

create table public.athlete_relink_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- The swimmer the family manages today, and the marker that holds the times.
  athlete_id uuid not null references public.athletes on delete cascade,
  former_athlete_id uuid not null references public.athletes on delete cascade,
  school_id uuid not null references public.schools,
  requested_by uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- No foreign key, like the other author columns; erase_account empties it when the admin who decided erases their account.
  resolved_by uuid,
  resolved_at timestamptz,
  moved_count integer check (moved_count >= 0),
  constraint athlete_relink_requests_resolved check ((status = 'pending') = (resolved_at is null)),
  constraint athlete_relink_requests_distinct check (athlete_id <> former_athlete_id)
);

-- A second request of the same family for the same marker and school while one is open is the same request.
create unique index athlete_relink_requests_open_idx
  on public.athlete_relink_requests (athlete_id, former_athlete_id, school_id) where status = 'pending';
create index athlete_relink_requests_school_idx on public.athlete_relink_requests (school_id, status, created_at);
create index athlete_relink_requests_athlete_idx on public.athlete_relink_requests (athlete_id, created_at);

-- The wrong keys, to limit them. The key itself is never stored.
create table public.athlete_relink_attempts (
  id bigint generated always as identity primary key,
  attempted_at timestamptz not null default now(),
  user_id uuid not null references auth.users on delete cascade,
  athlete_id uuid not null references public.athletes on delete cascade
);

create index athlete_relink_attempts_user_idx on public.athlete_relink_attempts (user_id, attempted_at);
create index athlete_relink_attempts_athlete_idx on public.athlete_relink_attempts (athlete_id, attempted_at);

alter table public.athlete_relink_requests enable row level security;
alter table public.athlete_relink_attempts enable row level security;
revoke all on table public.athlete_relink_requests, public.athlete_relink_attempts from anon, authenticated;

select app.guard_marked_account_writes('public.athlete_relink_requests');
select app.guard_marked_account_writes('public.athlete_relink_attempts');

-- The family asks. p_key is what they typed; spaces, hyphens and case do not matter. Answers (a refusal is an answer, not an error, so the
-- failed attempt stays recorded):
--   'requested'          one request per school that owns times was created;
--   'already_requested'  every one of them was already open;
--   'nothing_to_relink'  the key is right but the marker has no times left to move (they were already moved);
--   'invalid_key'        the key matches nothing (or is not shaped like a key): the attempt is recorded;
--   'rate_limited'       too many wrong keys: nothing is checked and nothing is recorded.
-- 42501: the caller does not manage p_athlete. A marked account is refused by its guard.
create function public.request_athlete_relink(p_athlete uuid, p_key text)
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
  v_caller uuid := (select auth.uid());
  v_hex text := upper(regexp_replace(coalesce(p_key, ''), '[\s-]', '', 'g'));
  v_hash text;
  v_marker uuid;
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

  -- The same text and the same hash as erase_account: five groups of four hex characters joined by hyphens.
  if v_hex ~ '^[0-9A-F]{20}$' then
    v_hash := encode(sha256(convert_to(regexp_replace(v_hex, '(....)(?=.)', '\1-', 'g'), 'UTF8')), 'hex');
    select k.athlete_id into v_marker from public.former_athlete_keys k
    where k.key_hash = v_hash and k.athlete_id <> request_athlete_relink.p_athlete;
  end if;
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

  if v_schools = 0 then
    return 'nothing_to_relink';
  end if;
  return case when v_created > 0 then 'requested' else 'already_requested' end;
end;
$$;

-- The requests of a swimmer the caller manages, newest first. Only the school's name and the state: nothing about the marker.
create function public.athlete_relink_requests_for_manager(p_athlete uuid)
returns table (id uuid, created_at timestamptz, status text, school_name text, resolved_at timestamptz, moved_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.created_at, r.status, s.name, r.resolved_at, r.moved_count
  from public.athlete_relink_requests r
  join public.schools s on s.id = r.school_id
  where r.athlete_id = athlete_relink_requests_for_manager.p_athlete
    and r.athlete_id in (select app.managed_athlete_ids())
  order by r.created_at desc, r.id;
$$;

-- The inbox of a school: only an active school_admin of it reads it (42501 for anyone else, with no hint). The swimmer is named because
-- the admin must know whom the family asks for; the swimmer may not be in the school (that is the case of a family that comes back).
-- times_count is what the approval would move now: the times of that school still on the marker. Pending first, then the newest.
create function public.school_relink_requests(p_school uuid)
returns table (
  id uuid, created_at timestamptz, status text, athlete_first_name text, athlete_last_name text,
  times_count integer, resolved_at timestamptz, moved_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid()) and m.school_id = school_relink_requests.p_school
      and m.role = 'school_admin' and m.deactivated_at is null
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select r.id, r.created_at, r.status, a.first_name, a.last_name,
      case when r.status = 'pending' then (
        select count(*)::integer from public.measurements t where t.athlete_id = r.former_athlete_id and t.school_id = r.school_id
      ) else 0 end,
      r.resolved_at, r.moved_count
    from public.athlete_relink_requests r
    join public.athletes a on a.id = r.athlete_id
    where r.school_id = school_relink_requests.p_school
    order by (r.status = 'pending') desc, r.created_at desc, r.id;
end;
$$;

-- The school decides. Answers 'approved', 'rejected' or 'already_resolved' (someone decided first: nothing changes) and, for an approval,
-- how many times moved. 42501: the caller is not an active school_admin of the school of the request (the same answer when the request
-- does not exist). 'no_longer_valid': the family no longer manages the swimmer or the marker is gone; the request is closed as rejected.
-- The row of the request is locked, so two approvals at once move the times once: the second waits and finds it resolved.
create function public.resolve_athlete_relink(p_request uuid, p_approve boolean)
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
    and exists (select 1 from public.former_athlete_keys k where k.athlete_id = r.former_athlete_id)
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

revoke execute on function public.request_athlete_relink(uuid, text), public.athlete_relink_requests_for_manager(uuid),
  public.school_relink_requests(uuid), public.resolve_athlete_relink(uuid, boolean) from public, anon;
grant execute on function public.request_athlete_relink(uuid, text), public.athlete_relink_requests_for_manager(uuid),
  public.school_relink_requests(uuid), public.resolve_athlete_relink(uuid, boolean) to authenticated;

-- erase_account clears the author column of this table too: the admin who decided a request is a person whose erasure must not leave
-- their identifier behind, and the request stays (#1251). The body is the one in 20261122000000_athletes_remove_health.sql; the only
-- change is athlete_relink_requests.resolved_by in the list of author columns.
create or replace function public.erase_account(p_request_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '10s'
as $$
declare
  r public.account_deletion_requests;
  u uuid;
  blockers jsonb;
  managed uuid[];
  sole uuid[];
  shared uuid[];
  a uuid;
  has_school_times boolean;
  new_key text;
  keys text[] := '{}';
  roles text[];
  n integer;
  auth_removed integer := 0;
  photos_queued integer := 0;
  athletes_deleted integer := 0;
  athletes_anonymized integer := 0;
  athletes_unlinked integer := 0;
  authored_emptied integer := 0;
  affected record;
  kept_status jsonb;
  authored text;
begin
  -- One worker per request: a locked row is somebody else's, a settled one is not ours.
  select * into r from public.account_deletion_requests q
  where q.id = p_request_id and q.status = 'pending' and q.delete_after <= p_now
  for update skip locked;
  if not found then
    return jsonb_build_object('status', 'skipped');
  end if;
  u := r.user_id;

  -- Lock the swimmers and memberships the rule reads, so a school cannot link one between the check below and the deletes
  -- (the foreign key of that insert waits for this lock, then fails once the swimmer is gone).
  perform a.id from public.athletes a where a.id in (select m.athlete_id from public.athlete_managers m where m.user_id = u) order by a.id for update;
  perform 1 from public.school_memberships sm where sm.user_id = u for update;

  -- The rule again, on the day: a school may have linked the swimmer (or the user) again during the grace period.
  blockers := app.account_deletion_blockers(u);
  if blockers is not null then
    update public.account_deletion_requests q set status = 'stopped', mail_claimed_at = null where q.id = r.id;
    return jsonb_build_object('status', 'stopped');
  end if;

  select coalesce(array_agg(m.athlete_id), '{}') into managed from public.athlete_managers m where m.user_id = u;
  select coalesce(array_agg(m.athlete_id), '{}') into sole
  from public.athlete_managers m
  where m.user_id = u and not exists (select 1 from public.athlete_managers o where o.athlete_id = m.athlete_id and o.user_id <> u);
  shared := array(select unnest(managed) except select unnest(sole));
  select array_remove(array[
    case when exists (select 1 from public.athlete_managers m where m.user_id = u and m.relation = 'guardian') then 'guardian' end,
    case when exists (select 1 from public.athlete_managers m where m.user_id = u and m.relation = 'self') then 'adult_athlete' end,
    case when exists (select 1 from public.school_memberships s where s.user_id = u and s.role = 'coach') then 'deactivated_coach' end
  ], null) into roles;

  -- 1. The authorizations U gave, of every swimmer (the evidence guard is off just for this statement and the next).
  perform app.erasure_guard_off('public.authorizations'::regclass);
  with removed as (
    delete from public.authorizations a2 where a2.user_id = u returning a2.athlete_id, a2.purpose
  )
  select count(*), coalesce(jsonb_agg(distinct jsonb_build_object('a', x.athlete_id, 'p', x.purpose)) filter (where x.athlete_id = any(shared)), '[]'::jsonb)
  into auth_removed, kept_status
  from removed x;
  update public.authorizations a2 set withdrawn_by = null where a2.withdrawn_by = u;
  -- Back on before the recomputation below, which relies on the triggers of the table.
  perform app.erasure_guards_on();

  -- 2. The swimmers another guardian also manages stay; only U's link goes. Their status is recomputed without U's authorizations.
  delete from public.athlete_managers m where m.user_id = u and m.athlete_id = any(shared);
  get diagnostics athletes_unlinked = row_count;
  for affected in select (e ->> 'a')::uuid as athlete_id, e ->> 'p' as purpose from jsonb_array_elements(kept_status) e loop
    if exists (select 1 from public.authorizations x where x.athlete_id = affected.athlete_id and x.purpose = affected.purpose) then
      -- A no-op update of the withdrawal column: the triggers that recompute the status and the hidden times run again.
      update public.authorizations x set withdrawn_at = x.withdrawn_at
      where x.id = (
        select y.id from public.authorizations y where y.athlete_id = affected.athlete_id and y.purpose = affected.purpose
        order by y.received_at desc, y.id limit 1
      );
    else
      update public.authorization_status s set is_granted = false, updated_at = clock_timestamp()
      where s.athlete_id = affected.athlete_id and s.purpose = affected.purpose and s.is_granted;
      if affected.purpose = 'record_times' then
        perform public.measurements_recompute_hidden(affected.athlete_id);
        perform public.training_plan_fulfillments_recompute_hidden(affected.athlete_id);
      end if;
    end if;
  end loop;

  -- 3. A time that came to another family through a transfer must not go with U (the foreign keys cascade): it stays with its
  --    owner, who becomes its author.
  if exists (select 1 from public.family_timing_measurements f where (f.captured_by = u and f.owner_user_id <> u)
                or (f.athlete_id = any(sole) and f.owner_user_id <> u)) then
    perform app.erasure_guard_off('public.family_timing_measurements'::regclass);
    update public.family_timing_measurements f set captured_by = f.owner_user_id where f.captured_by = u and f.owner_user_id <> u;
    update public.family_timing_measurements f set athlete_id = null where f.athlete_id = any(sole) and f.owner_user_id <> u;
  end if;

  -- 4. The swimmers U alone is responsible for.
  foreach a in array sole loop
    select exists (select 1 from public.measurements m where m.athlete_id = a) into has_school_times;

    delete from public.athlete_photos p where p.athlete_id = a;
    get diagnostics n = row_count;
    photos_queued := photos_queued + n;
    delete from public.athlete_identity_documents d where d.athlete_id = a;
    delete from public.athlete_private_details d where d.athlete_id = a; -- #1366
    delete from public.athlete_share_codes c where c.athlete_id = a;
    delete from public.imported_result_changes c where c.athlete_id = a;
    delete from public.imported_results c where c.athlete_id = a;
    delete from public.results_import_confirmations c where c.athlete_id = a;
    delete from public.results_imports c where c.athlete_id = a;
    delete from public.results_import_queries c where c.athlete_id = a;
    delete from public.results_import_pending c where c.athlete_id = a;
    delete from public.timing_guardian_sharing c where c.athlete_id = a;
    delete from public.family_timing_transfers c where c.athlete_id = a;
    delete from public.family_timing_measurements c where c.athlete_id = a;
    delete from public.training_plan_notices c where c.athlete_id = a;
    delete from public.training_plan_fulfillments c where c.athlete_id = a;
    delete from public.training_plan_assignments c where c.athlete_id = a;
    delete from public.coach_athlete_assignments c where c.athlete_id = a;
    delete from public.athlete_groups c where c.athlete_id = a;
    perform app.erasure_guard_off('public.authorizations'::regclass);
    perform app.erasure_guard_off('public.school_result_sharing'::regclass);
    delete from public.authorizations c where c.athlete_id = a;
    delete from public.authorization_status c where c.athlete_id = a;
    delete from public.school_result_sharing c where c.athlete_id = a;
    delete from public.athlete_managers c where c.athlete_id = a;

    if has_school_times then
      -- The school keeps its times; the swimmer stays as a marker without identity and its (ended) link with the school.
      new_key := app.new_former_athlete_key();
      update public.athletes x set first_name = 'Nadador', last_name = 'anterior', created_by = null where x.id = a;
      insert into public.former_athlete_keys (athlete_id, key_hash)
      values (a, encode(sha256(convert_to(new_key, 'UTF8')), 'hex'));
      keys := keys || new_key;
      athletes_anonymized := athletes_anonymized + 1;
    else
      delete from public.athlete_schools c where c.athlete_id = a;
      delete from public.athletes x where x.id = a;
      athletes_deleted := athletes_deleted + 1;
    end if;
  end loop;

  -- 5. What U wrote or signed and is not theirs to take away: the authors go, the records stay.
  delete from public.school_memberships s where s.user_id = u;
  delete from public.coach_group_assignments c where c.coach_user_id = u;
  delete from public.coach_athlete_assignments c where c.coach_user_id = u;
  delete from public.school_invitations i where i.created_by = u;
  -- A coach invitation keeps the address it was sent to: the ones the user created or accepted (or sent to their address) go.
  delete from public.coach_invitations i where i.created_by = u or i.accepted_by = u or lower(i.email) = lower(r.email);
  perform app.erasure_guard_off('public.school_result_sharing'::regclass);
  delete from public.school_result_sharing s where s.requested_by = u or s.approved_by = u or s.withdrawn_by = u;
  delete from public.athlete_managers m where m.user_id = u;
  foreach authored in array array[
    'coach_invitations.accepted_by', 'results_import_queries.last_queried_by', 'results_imports.requested_by',
    'results_import_confirmations.confirmed_by', 'imported_result_changes.resolved_by', 'training_plan_assignments.withdrawn_by',
    'measurement_conflict_resolutions.resolved_by', 'measurement_conflicts.current_by', 'measurement_conflicts.incoming_by',
    'measurements.created_by', 'measurements.edited_by', 'measurements.discarded_by', 'timing_series.created_by',
    'training_plans.created_by', 'training_plan_versions.created_by', 'training_plan_blocks.created_by',
    'training_plan_assignments.created_by', 'training_plan_fulfillments.created_by', 'training_plan_notices.created_by',
    'timing_guardian_shared_measurements.shared_by', 'timing_guardian_sharing.updated_by',
    'timing_guardian_sharing_defaults.updated_by', 'athlete_groups.created_by', 'athlete_schools.created_by',
    'athletes.created_by', 'athlete_photos.created_by',
     'coach_group_assignments.created_by', 'coach_athlete_assignments.created_by',
    'school_memberships.created_by', 'athlete_relink_requests.resolved_by'
  ] loop
    authored_emptied := authored_emptied + app.erasure_null_author(
      ('public.' || split_part(authored, '.', 1))::regclass, split_part(authored, '.', 2), u);
  end loop;

  perform app.erasure_guards_on();

  -- 6. The account itself: the rest of its rows (profile, share code lookups, family timing, sessions) follows by cascade.
  delete from auth.users x where x.id = u;
  delete from public.account_deletion_codes c where c.user_id = u;
  delete from public.account_deletion_code_sends c where c.user_id = u;

  insert into public.account_deletion_audit (roles, counts)
  values (roles, jsonb_build_object(
    'athletes_deleted', athletes_deleted, 'athletes_anonymized', athletes_anonymized, 'athletes_unlinked', athletes_unlinked,
    'photos_queued', photos_queued, 'authorizations_deleted', auth_removed, 'authors_emptied', authored_emptied));

  update public.account_deletion_requests q
  set status = 'deleted', former_athlete_keys = keys, mail_claimed_at = null
  where q.id = r.id;
  return jsonb_build_object('status', 'deleted');
end;
$$;
