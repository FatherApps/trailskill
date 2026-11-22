-- Module: athletes. Issue #1370 (task 4.2 of the health and emergency design): the emergency reveal of a swimmer's health data to the
-- admin of their school, always with a record. Decided by the maintainer on 2026-11-21: the coach never sees the data; only the school
-- admin, in an emergency, and what is left is who looked, why and when. No record means no data: the record row and the data come out
-- of the same transaction, and a refusal leaves neither. The family reads that record (read only) through its own function.
--
-- The result of the reveal is never stored on the device: there is no stream and no cache. The reveal needs a connection, on purpose.
-- Provisional until the legal review (#106): how long the record is kept, and delete versus anonymize when the account is erased. This
-- migration deletes, as the approved design says. Nothing reaches Google Play before task 4.3 (#1371) passes that review.

-- Optional and separate from store_health_data: the family decides whether the school may consult the data in an emergency. It is not
-- part of the joint acceptance of the school (#1328). Withdrawing it deletes nothing: the family's row and the record stay, and the next
-- reveal is refused. The es-CO text and the screens that grant and withdraw it come with task 4.3.
insert into public.authorization_purposes (code) values ('share_health_with_school');

-- Append only. The reason is stored trimmed, 10 to 500 characters. viewer_user_id has no foreign key (like the other author columns): it
-- is emptied when the viewer's account is erased, and the family then sees the consultation without a name. viewed_at is the server's.
create table public.athlete_health_access_log (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes on delete cascade,
  school_id uuid not null references public.schools,
  viewer_user_id uuid,
  reason text not null,
  viewed_at timestamptz not null default now(),
  constraint athlete_health_access_log_reason_length check (char_length(reason) between 10 and 500)
);

create index athlete_health_access_log_athlete_idx on public.athlete_health_access_log (athlete_id, viewed_at desc);

-- Row level security with no policy and no grant: no client reads or writes the table. Only the two functions below touch it. It is not
-- in the powersync publication.
alter table public.athlete_health_access_log enable row level security;
revoke all on table public.athlete_health_access_log from anon, authenticated;

select app.guard_marked_account_writes('public.athlete_health_access_log');

-- The reveal. Refusals (nothing is returned and nothing is logged, because the exception rolls the statement back):
--   42501: the caller is not an active school_admin of school_id, or the athlete is not actively linked to it (ended_at is null).
--          One code for both, so a caller learns nothing about athletes of other schools. A marked account is refused the same way.
--   22023: the reason, trimmed, is not between 10 and 500 characters.
--   55000: share_health_with_school is not in force for the athlete.
-- It returns the athlete_health row, or nothing when the family stored no data (the consultation is logged all the same).
-- Neither the reason nor the values are written to the server log: there is no notice or message that carries them.
create function public.reveal_athlete_health(athlete_id uuid, school_id uuid, reason text)
returns setof public.athlete_health
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_reason text := btrim(reveal_athlete_health.reason, E' \t\r\n');
begin
  if v_caller is null or not exists (
    select 1
    from public.school_memberships m
    join public.athlete_schools l on l.school_id = m.school_id
    where m.user_id = v_caller
      and m.role = 'school_admin'
      and m.school_id = reveal_athlete_health.school_id
      and l.athlete_id = reveal_athlete_health.athlete_id
      and l.ended_at is null
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_reason is null or char_length(v_reason) not between 10 and 500 then
    raise exception 'the observation must have 10 to 500 characters' using errcode = '22023';
  end if;

  -- Same lock as authorizations_refresh_status (and as store_athlete_identity_number): a withdrawal that races this call either lands
  -- first (not in force, refused) or waits for this transaction.
  perform pg_advisory_xact_lock(hashtextextended(reveal_athlete_health.athlete_id::text || ':share_health_with_school', 0));

  if not exists (
    select 1 from public.authorization_status s
    where s.athlete_id = reveal_athlete_health.athlete_id and s.purpose = 'share_health_with_school' and s.is_granted
  ) then
    raise exception 'share_health_with_school is not in force for the athlete' using errcode = '55000';
  end if;

  -- The record first: if it cannot be written (a marked account, for one), nothing is returned.
  insert into public.athlete_health_access_log (athlete_id, school_id, viewer_user_id, reason)
  values (reveal_athlete_health.athlete_id, reveal_athlete_health.school_id, v_caller, v_reason);

  return query select h.* from public.athlete_health h where h.athlete_id = reveal_athlete_health.athlete_id;
end;
$$;

revoke execute on function public.reveal_athlete_health(uuid, uuid, text) from public, anon;
grant execute on function public.reveal_athlete_health(uuid, uuid, text) to authenticated;

-- The family's view of the record: who looked (visible name, null once that account was erased), which school, when and why. Newest
-- first. Only a manager of the athlete gets rows; for anyone else it is empty, the admin who looked included. Read only.
create function public.athlete_health_access_log_for_manager(athlete_id uuid)
returns table (id uuid, viewed_at timestamptz, viewer_name text, school_name text, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.viewed_at, nullif(btrim(p.first_name || ' ' || p.last_name), ''), s.name, l.reason
  from public.athlete_health_access_log l
  join public.schools s on s.id = l.school_id
  left join public.adult_profiles p on p.user_id = l.viewer_user_id
  where l.athlete_id = athlete_health_access_log_for_manager.athlete_id
    and l.athlete_id in (select app.managed_athlete_ids())
  order by l.viewed_at desc, l.id;
$$;

revoke execute on function public.athlete_health_access_log_for_manager(uuid) from public, anon;
grant execute on function public.athlete_health_access_log_for_manager(uuid) to authenticated;

-- erase_account again (issue #1244, then #1369 and #1366): the body is the one in main (20261121203000_athletes_birth_date_and_gender.sql)
-- plus two lines marked "#1370": the record of a swimmer who stays as a marker is deleted explicitly (the cascade of athletes does not
-- reach it), and the viewer column of the records of an erased admin is emptied.
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
    delete from public.athlete_health_access_log l where l.athlete_id = a; -- #1370
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
    'athletes.created_by', 'athlete_photos.created_by', 'athlete_health.updated_by', -- #1369
    'athlete_health_access_log.viewer_user_id', -- #1370
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
