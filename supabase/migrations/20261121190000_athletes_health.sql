-- Module: athletes. Issue #1369 (task 4.1 of the health and emergency design): the health data of a swimmer, for the family only.
-- Blood type, weight, height and the allergies the family reports, to complement medical checks and to have at hand in an emergency.
-- They are sensitive personal data (Ley 1581) and optional: the family decides whether to keep them. This migration is the server side
-- only; the app screens, the authorization texts, the audited reveal for a school admin in an emergency (#1370) and the legal review
-- (#106) come in later issues.
--
-- The table is its own (never columns of athletes), so athletes_visible and every staff SELECT * never carry it. Only a manager of the
-- swimmer (a guardian or the adult athlete, app.managed_athlete_ids()) reads or writes it. There is no policy and no stream for staff:
-- not a coach, not a school admin, not anon. Platform admins read through support online and are not included on purpose.
-- Null means a missing value, never zero. Only the current values are kept, no history.

-- Optional: it is not part of the joint acceptance of the school (#1328, accounts_accept_invitation_authorizations stays as is). The
-- es-CO text and the screens that grant and withdraw it come with task 4.3 (#1371), after the legal review.
insert into public.authorization_purposes (code) values ('store_health_data');

-- The ranges are wide on purpose (they refuse typing mistakes, not unusual swimmers): 1 to 300 kg and 30 to 250 cm. The maintainer
-- confirms them in the pull request review. An empty text is not a value: the app stores null instead.
create table public.athlete_health (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null unique references public.athletes on delete cascade,
  blood_type text,
  weight_kg numeric(5, 2),
  height_cm numeric(4, 1),
  measured_on date,
  allergies text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint athlete_health_blood_type_valid check (blood_type in ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-')),
  constraint athlete_health_weight_kg_range check (weight_kg between 1 and 300),
  constraint athlete_health_height_cm_range check (height_cm between 30 and 250),
  constraint athlete_health_allergies_length check (char_length(allergies) between 1 and 500)
);

alter table public.athlete_health enable row level security;

grant select, insert, update, delete on table public.athlete_health to authenticated;
revoke all on table public.athlete_health from anon;

select app.guard_marked_account_writes('public.athlete_health');

alter publication powersync add table public.athlete_health;

-- store_health_data is in force for the athlete: the status table, kept by the authorization triggers. A missing row is not granted.
-- The policy calls this function and nothing else calls it directly (it runs as its owner), so a caller cannot ask about an athlete
-- it does not manage.
create function app.athlete_health_writable(athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_health_writable.athlete in (select app.managed_athlete_ids())
    and exists (
      select 1 from public.authorization_status s
      where s.athlete_id = athlete_health_writable.athlete
        and s.purpose = 'store_health_data'
        and s.is_granted
    );
$$;

revoke execute on function app.athlete_health_writable(uuid) from public, anon;
grant execute on function app.athlete_health_writable(uuid) to authenticated;

-- The row keeps its athlete, and the server stamps who changed it and when (the device clock is not trusted for this).
create function public.athlete_health_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.athlete_id is distinct from old.athlete_id then
    raise exception 'athlete health row keeps its athlete' using errcode = '42501';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger athlete_health_stamp
  before insert or update on public.athlete_health
  for each row execute function public.athlete_health_stamp();

-- Read and delete: a manager of the athlete, whether or not the authorization is in force (the owner of the data can always see it and
-- remove it). Insert and update: a manager, only while store_health_data is in force.
create policy athlete_health_select on public.athlete_health for select to authenticated
  using (athlete_id in (select app.managed_athlete_ids()));

create policy athlete_health_insert on public.athlete_health for insert to authenticated
  with check ((select app.athlete_health_writable(athlete_id)));

create policy athlete_health_update on public.athlete_health for update to authenticated
  using ((select app.athlete_health_writable(athlete_id)))
  with check ((select app.athlete_health_writable(athlete_id)));

create policy athlete_health_delete on public.athlete_health for delete to authenticated
  using (athlete_id in (select app.managed_athlete_ids()));

-- The data exists only while store_health_data is in force: when the status of that purpose turns to not granted, the row goes in the
-- same transaction (same pattern as athlete_identity_documents_purge_on_withdrawal).
create function public.athlete_health_purge_on_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.athlete_health h where h.athlete_id = new.athlete_id;
  return null;
end;
$$;

revoke execute on function public.athlete_health_purge_on_withdrawal() from public, anon, authenticated;

create trigger athlete_health_purge_on_withdrawal
  after insert or update of is_granted on public.authorization_status
  for each row
  when (new.purpose = 'store_health_data' and not new.is_granted)
  execute function public.athlete_health_purge_on_withdrawal();

-- erase_account (issue #1244) again, identical to its first version except for two lines marked "#1369": a swimmer with times stays as a
-- marker, so the cascade of athletes does not reach the health row; it is deleted explicitly, and its author column is emptied.
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
    delete from public.athlete_health h where h.athlete_id = a; -- #1369
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
    'athletes.created_by', 'athlete_photos.created_by', 'athlete_health.updated_by', -- #1369
     'coach_group_assignments.created_by', 'coach_athlete_assignments.created_by',
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
