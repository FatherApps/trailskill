-- Module accounts: the deletion of a marked account on day 30 (issue #1244). public.erase_account(request) runs in ONE
-- transaction, once per due request, called by the Edge Function accounts-deletion-worker as service_role. It writes to tables of
-- other modules (athletes, timing, family-timing, training-plans, results-import, school-console): the inventory of every foreign key
-- to auth.users and to athletes is in the pull request and a database test fails when a new one appears that this function does not
-- know. Nothing here can be undone, so the rule of the schools is checked again first.
--
-- What it does for the user U of the request:
--   * a swimmer whose only manager is U is deleted with their data (photos go to storage_deletion_queue, #1232); if a school
--     recorded times of the swimmer, those times stay and the swimmer becomes a marker without identity (no name, document,
--     photo or links) with a random former_athlete_key, of which only the hash is kept;
--   * a swimmer another guardian also manages stays: only U's link goes;
--   * U's authorizations go (the status of a swimmer who stays is recomputed), U's own times, transfers and share codes go;
--   * every author column that points at U is emptied (some need NOT NULL or a CHECK relaxed, below), then U leaves auth.users;
--   * one audit row with a random id, the time, the roles and counts, and nothing else.
-- Evidence tables refuse changes and deletes through triggers (authorizations, school_result_sharing, results-import): the function
-- switches the user triggers of exactly the tables it needs off inside the transaction and back on before it ends. Foreign key
-- triggers stay on. A failure rolls everything back, the switches included.

-- Author columns that must be able to hold null once their user is gone (a deactivated coach's records keep no author).
alter table public.measurements alter column created_by drop not null;
alter table public.timing_series alter column created_by drop not null;
alter table public.training_plans alter column created_by drop not null;
alter table public.training_plan_versions alter column created_by drop not null;
alter table public.training_plan_blocks alter column created_by drop not null;
alter table public.training_plan_assignments alter column created_by drop not null;
alter table public.training_plan_fulfillments alter column created_by drop not null;
alter table public.training_plan_notices alter column created_by drop not null;
alter table public.timing_guardian_shared_measurements alter column shared_by drop not null;
alter table public.timing_guardian_sharing alter column updated_by drop not null;
alter table public.timing_guardian_sharing_defaults alter column updated_by drop not null;
alter table public.measurement_conflict_resolutions alter column resolved_by drop not null;
alter table public.results_imports alter column requested_by drop not null;
alter table public.results_import_confirmations alter column confirmed_by drop not null;

-- The pairs "who and when" lose the rule that a person must be there; the other direction (a person needs a time) stays.
alter table public.training_plan_assignments drop constraint training_plan_assignments_withdrawal_check;
alter table public.training_plan_assignments
  add constraint training_plan_assignments_withdrawal_check check (withdrawn_by is null or withdrawn_at is not null);
alter table public.imported_result_changes drop constraint imported_result_changes_check1;
alter table public.imported_result_changes
  add constraint imported_result_changes_check1 check (resolved_by is null or status in ('used_new', 'kept_current'));

-- Switches the user triggers of a table off for the rest of the transaction (the guards of the evidence tables). Remembered in a
-- transaction-local setting so erasure_guards_on() puts every one of them back. Needs the table owner: the function owner is.
create function app.erasure_guard_off(target regclass)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  listed text := coalesce(current_setting('app.erasure_touched', true), '');
begin
  if position(',' || target::text || ',' in ',' || listed || ',') = 0 then
    execute format('alter table %s disable trigger user', target);
    perform set_config('app.erasure_touched', case when listed = '' then target::text else listed || ',' || target::text end, true);
  end if;
end;
$$;

create function app.erasure_guards_on()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  listed text := coalesce(current_setting('app.erasure_touched', true), '');
  t text;
begin
  if listed <> '' then
    foreach t in array string_to_array(listed, ',') loop
      execute format('alter table %s enable trigger user', t::regclass);
    end loop;
  end if;
  perform set_config('app.erasure_touched', '', true);
end;
$$;

-- Empties an author column that points at the user. Returns how many rows changed.
create function app.erasure_null_author(target regclass, author_column text, account uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer := 0;
  present boolean;
begin
  execute format('select exists (select 1 from %s where %I = $1)', target, author_column) into present using account;
  if present then
    perform app.erasure_guard_off(target);
    execute format('update %s set %I = null where %I = $1', target, author_column, author_column) using account;
    get diagnostics changed = row_count;
  end if;
  return changed;
end;
$$;

revoke execute on function app.erasure_guard_off(regclass), app.erasure_guards_on(), app.erasure_null_author(regclass, text, uuid)
  from public, anon, authenticated;

-- The key given to a swimmer that stays as a marker: 80 random bits as five groups of four hex characters.
create function app.new_former_athlete_key()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select upper(regexp_replace(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), '(....)(?=.)', '\1-', 'g'));
$$;

revoke execute on function app.new_former_athlete_key() from public, anon, authenticated;

-- The requests that are due: ids only. The worker calls erase_account for each.
create function public.list_due_account_deletions(p_now timestamptz default now(), p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(d.id), '[]'::jsonb)
  from (
    select r.id from public.account_deletion_requests r
    where r.status = 'pending' and r.delete_after <= p_now
    order by r.delete_after, r.id
    limit greatest(p_limit, 0)
  ) d;
$$;

create function public.erase_account(p_request_id uuid, p_now timestamptz default now())
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
    'athletes.created_by', 'athlete_photos.created_by', 'coach_group_assignments.created_by', 'coach_athlete_assignments.created_by',
    'school_memberships.created_by'
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

-- The emails of the worker, as a lease: a claimed request is not offered again for 15 minutes, so two workers never send the
-- same email, and one that failed comes back later. kind is 'reminder' (day 23), 'deleted' or 'stopped' (the final emails).
create function public.claim_account_deletion_mail(p_now timestamptz default now(), p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed jsonb;
begin
  with due as (
    select r.id,
      case when r.status = 'pending' then 'reminder' else r.status end as kind
    from public.account_deletion_requests r
    where (
        (r.status = 'pending' and r.reminder_sent_at is null and r.delete_after - interval '7 days' <= p_now and r.delete_after > p_now)
        or r.status in ('deleted', 'stopped')
      )
      and (r.mail_claimed_at is null or r.mail_claimed_at < p_now - interval '15 minutes')
    order by r.requested_at, r.id
    limit greatest(p_limit, 0)
    for update skip locked
  ), marked as (
    update public.account_deletion_requests r set mail_claimed_at = p_now
    from due where r.id = due.id
    returning r.id, due.kind, r.email, r.delete_after, r.former_athlete_keys
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'request_id', m.id, 'kind', m.kind, 'email', m.email, 'delete_after', m.delete_after, 'former_athlete_keys', to_jsonb(m.former_athlete_keys)
  )), '[]'::jsonb) into claimed from marked m;
  return claimed;
end;
$$;

-- The email left: the reminder is recorded; after the final email the row goes, and with it the address and the keys.
create function public.finish_account_deletion_mail(p_request_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind = 'reminder' then
    update public.account_deletion_requests r set reminder_sent_at = now(), mail_claimed_at = null
    where r.id = p_request_id and r.status = 'pending';
  elsif p_kind in ('deleted', 'stopped') then
    delete from public.account_deletion_requests r where r.id = p_request_id and r.status = p_kind;
  else
    raise exception 'unknown email kind' using errcode = '22023';
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke execute on function public.list_due_account_deletions(timestamptz, integer), public.erase_account(uuid, timestamptz),
  public.claim_account_deletion_mail(timestamptz, integer), public.finish_account_deletion_mail(uuid, text)
  from public, anon, authenticated;
grant execute on function public.list_due_account_deletions(timestamptz, integer), public.erase_account(uuid, timestamptz),
  public.claim_account_deletion_mail(timestamptz, integer), public.finish_account_deletion_mail(uuid, text) to service_role;
