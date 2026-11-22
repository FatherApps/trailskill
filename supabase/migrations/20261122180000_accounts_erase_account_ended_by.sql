-- Module accounts: erase_account empties athlete_schools.ended_by (issue #1434).
-- When a school admin erases their account, their id stayed in the links they ended. ended_by has no foreign key, like the
-- other author columns, so erase_account lists it with them and the link stays ended (ended_at is kept).
-- The check athlete_schools_ended_both_or_neither forced ended_at and ended_by to be null together, which made that update
-- fail. It is replaced by one that only forbids ended_by without ended_at. The trigger athlete_schools_ended_guard needs no
-- change: it blocks client roles only (it checks current_user), and erase_account, a security definer function, runs as its owner.
-- The body of erase_account is the one in 20261122100000_athletes_relink_requests.sql; the only change is athlete_schools.ended_by
-- in the list of author columns.
-- Revert: recreate erase_account from 20261122100000, drop athlete_schools_ended_by_needs_ended_at and re-add
-- athlete_schools_ended_both_or_neither (it fails while a row has ended_at and no ended_by: set ended_by to a deleted
-- sentinel user first or accept losing the check).

alter table public.athlete_schools
  drop constraint athlete_schools_ended_both_or_neither,
  add constraint athlete_schools_ended_by_needs_ended_at check (ended_by is null or ended_at is not null);

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
    'athlete_schools.ended_by', 'athletes.created_by', 'athlete_photos.created_by',
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
