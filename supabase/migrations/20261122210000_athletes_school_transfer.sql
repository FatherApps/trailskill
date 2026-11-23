-- Module athletes: transfer to another school (issue #1419). Rule confirmed by the maintainer (2026-11-22): "if another school takes the
-- swimmer in, the first school stops seeing their data and the data goes to the other school". The acceptance of the family of the
-- new enrollment (public.accept_invitation, #1328) is what authorizes the transfer.
--
-- Decision of the maintainer (2026-11-22): "todo el historial siempre". What happens when the family accepts the invitation of a
-- school C (a NEW athlete_schools row for C, made by that call) for a swimmer that other schools had:
--   1. C reads the swimmer's marks of EVERY school the swimmer was linked to before, with no 30-day condition and along the whole chain
--      (A, then B, then C: C reads what A and B recorded). The acceptance is stored as one row per previous school in
--      public.athlete_history_grants (swimmer, source school, target school); C reads through public.other_school_results (the function
--      of #68, fixed result columns only: time, stroke, distance, pool, session type, date, never hidden, discarded or split marks, no
--      photos, authorizations, groups, plan fulfillments or health data). The history is read in place: nothing is copied or synced and C
--      cannot write it.
--   2. The school that ended the swimmer (#1243) stops reading them at that moment, without waiting for the day 30 of its window (#1418):
--      the stored column that the helpers and the sync streams of powersync/sync-config.yaml already read,
--      athlete_schools.read_window_closed_at, is stamped with now(), and athlete_schools.transferred_to_school_id keeps where the
--      swimmer went. Only ended links still inside their window move; the first school that accepts is the destination. No stream
--      changes: every staff stream already filters on athlete_schools.read_window_closed_at IS NULL.
-- A swimmer with an ACTIVE link in A and in C at once loses nothing in A. Without the family's acceptance (any other way of linking a
-- swimmer) C reads nothing of the other schools. The acceptance is recorded as today, with the evidence accept_invitation already stores
-- (the three authorizations written in the same transaction): the purpose school_transfer of T150 does not exist in the database yet, so it
-- is not used. C's read also needs the swimmer's share_results_with_school authorization in force, as the sharing of #68: withdrawing it,
-- or erasing the account of the family (erase_account deletes the authorizations), cuts what C reads, and C must still read the swimmer.
--
-- Revert: restore accept_invitation (20261121120000), other_school_results (20261026010000), athlete_schools_ended_guard and the seven read
-- helpers (20261122120000), drop app.transfer_athlete_school_history and app.school_transfer_in_force, drop the table
-- athlete_history_grants. Then, in this order (the recreated check of #1418 requires a stamp of at least ended_at + 30 days, so it fails
-- while a transfer stamp exists, and the check athlete_schools_transferred_closes_window fails if only the stamp is cleared):
--   1. as the table owner, in ONE statement: update public.athlete_schools set read_window_closed_at = null, transferred_to_school_id = null
--      where transferred_to_school_id is not null; then select app.close_athlete_school_read_windows(); (the schools that handed a swimmer
--      over read them again until their own day 30, and the job re-stamps at once the ones whose day 30 already passed, so no device
--      keeps a pair past its window);
--   2. drop the checks athlete_schools_transferred_closes_window and athlete_schools_read_window_closed_after_end, drop the column
--      transferred_to_school_id, recreate athlete_schools_read_window_closed_after_end as in 20261122120000;
--   3. drop the overload app.athlete_school_window_closed(timestamptz, timestamptz).
-- The one-argument app.athlete_school_window_closed(timestamptz) of #1418 stays as it is: other changes call it. Nothing is lost.

-- A window is closed when it was stamped (by the job at day 30 or by a transfer) or when its 30 days have passed. The one-argument
-- version of #1418 cannot see a stamp, so the read helpers below use this one; the one-argument version stays for its other callers.
create function app.athlete_school_window_closed(ended timestamptz, closed_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select ended is not null and (closed_at is not null or ended + app.athlete_school_read_window() <= now()) $$;

revoke execute on function app.athlete_school_window_closed(timestamptz, timestamptz) from public, anon, authenticated;

alter table public.athlete_schools
  add column transferred_to_school_id uuid references public.schools;

-- The stamp of a transfer may fall before day 30. Any other stamp keeps the rule of #1418.
alter table public.athlete_schools drop constraint athlete_schools_read_window_closed_after_end;
alter table public.athlete_schools
  add constraint athlete_schools_read_window_closed_after_end
    check (
      read_window_closed_at is null
      or (
        ended_at is not null
        and read_window_closed_at >= ended_at
        and (transferred_to_school_id is not null or read_window_closed_at >= ended_at + interval '30 days')
      )
    ),
  add constraint athlete_schools_transferred_closes_window
    check (transferred_to_school_id is null or (read_window_closed_at is not null and transferred_to_school_id <> school_id));

-- What the family accepted when they joined a school: it may read what each of these schools recorded for the swimmer. One row per
-- (swimmer, previous school, new school), written only by app.transfer_athlete_school_history. Clients have no privilege on it: RLS is on
-- without policies and the grants are revoked, so only the security definer functions of this module read it. Erasing the swimmer
-- deletes the rows (erase_account removes unmarked swimmers; a marker keeps them, but no authorization remains to read through).
create table public.athlete_history_grants (
  athlete_id uuid not null references public.athletes on delete cascade,
  source_school_id uuid not null references public.schools,
  target_school_id uuid not null references public.schools,
  granted_at timestamptz not null default now(),
  primary key (athlete_id, source_school_id, target_school_id),
  check (source_school_id <> target_school_id)
);
alter table public.athlete_history_grants enable row level security;
revoke all on table public.athlete_history_grants from public, anon, authenticated;
-- A new table of the public schema takes the write guard of a marked account (a database test fails otherwise, #1244).
select app.guard_marked_account_writes('public.athlete_history_grants'::regclass);

-- A client role never writes the new column either: only app.transfer_athlete_school_history (the owner) does.
create or replace function public.athlete_schools_ended_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated', 'service_role') then
    if tg_op = 'INSERT' then
      if new.ended_at is not null or new.ended_by is not null then
        raise exception 'a link is ended only with end_athlete_school' using errcode = '42501';
      end if;
      if new.read_window_closed_at is not null then
        raise exception 'the read window is closed only by the scheduled job' using errcode = '42501';
      end if;
      if new.transferred_to_school_id is not null then
        raise exception 'a transfer is made only by accepting an invitation' using errcode = '42501';
      end if;
    elsif new.ended_at is distinct from old.ended_at or new.ended_by is distinct from old.ended_by then
      raise exception 'a link is ended only with end_athlete_school' using errcode = '42501';
    elsif new.read_window_closed_at is distinct from old.read_window_closed_at then
      raise exception 'the read window is closed only by the scheduled job' using errcode = '42501';
    elsif new.transferred_to_school_id is distinct from old.transferred_to_school_id then
      raise exception 'a transfer is made only by accepting an invitation' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- The seven read helpers of #1418, the same bodies, now counting the stamp of the row besides the clock.
create or replace function app.admin_athlete_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_id from public.athlete_schools
  where school_id in (select app.admin_school_ids()) and not app.athlete_school_window_closed(ended_at, read_window_closed_at);
$$;

create or replace function app.admin_athlete_school_pairs()
returns table (athlete_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select s.athlete_id, s.school_id
  from public.athlete_schools s
  where s.school_id in (select app.admin_school_ids()) and not app.athlete_school_window_closed(s.ended_at, s.read_window_closed_at);
$$;

create or replace function app.admin_athlete_schools()
returns table (athlete_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_id, school_id from public.athlete_schools
  where school_id in (select app.admin_school_ids()) and not app.athlete_school_window_closed(ended_at, read_window_closed_at);
$$;

create or replace function app.admin_has_athlete_in_school(athlete uuid, school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select admin_has_athlete_in_school.school in (select app.admin_school_ids())
    and exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = admin_has_athlete_in_school.athlete
        and s.school_id = admin_has_athlete_in_school.school
        and not app.athlete_school_window_closed(s.ended_at, s.read_window_closed_at)
    );
$$;

create or replace function app.coach_athlete_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ag.athlete_id
  from public.athlete_groups ag
  join public.coach_group_assignments cga on cga.group_id = ag.group_id
  join public.training_groups tg on tg.id = cga.group_id
  where cga.coach_user_id = (select auth.uid())
    and tg.school_id in (select app.staff_school_ids())
    and not exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = ag.athlete_id and s.school_id = tg.school_id and app.athlete_school_window_closed(s.ended_at, s.read_window_closed_at)
    )
  union
  select ca.athlete_id from public.coach_athlete_assignments ca
  where ca.coach_user_id = (select auth.uid())
    and ca.school_id in (select app.staff_school_ids())
    and not exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = ca.athlete_id and s.school_id = ca.school_id and app.athlete_school_window_closed(s.ended_at, s.read_window_closed_at)
    );
$$;

create or replace function app.coach_athlete_school_pairs()
returns table (athlete_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select ca.athlete_id, ca.school_id
  from public.coach_athlete_assignments ca
  where ca.coach_user_id = (select auth.uid())
    and ca.school_id in (select app.staff_school_ids())
    and not exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = ca.athlete_id and s.school_id = ca.school_id and app.athlete_school_window_closed(s.ended_at, s.read_window_closed_at)
    )
  union
  select ag.athlete_id, tg.school_id
  from public.athlete_groups ag
  join public.coach_group_assignments cg on cg.group_id = ag.group_id
  join public.training_groups tg on tg.id = ag.group_id
  where cg.coach_user_id = (select auth.uid())
    and tg.school_id in (select app.staff_school_ids())
    and not exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = ag.athlete_id and s.school_id = tg.school_id and app.athlete_school_window_closed(s.ended_at, s.read_window_closed_at)
    );
$$;

create or replace function app.coach_has_athlete_in_school(athlete uuid, school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coach_has_athlete_in_school.school in (select app.staff_school_ids())
    and not exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = coach_has_athlete_in_school.athlete
        and s.school_id = coach_has_athlete_in_school.school
        and app.athlete_school_window_closed(s.ended_at, s.read_window_closed_at)
    )
    and (
      exists (
        select 1 from public.coach_athlete_assignments ca
        where ca.coach_user_id = (select auth.uid())
          and ca.athlete_id = coach_has_athlete_in_school.athlete
          and ca.school_id = coach_has_athlete_in_school.school
      )
      or exists (
        select 1 from public.athlete_groups ag
        join public.coach_group_assignments cg on cg.group_id = ag.group_id
        join public.training_groups tg on tg.id = ag.group_id
        where cg.coach_user_id = (select auth.uid())
          and ag.athlete_id = coach_has_athlete_in_school.athlete
          and tg.school_id = coach_has_athlete_in_school.school
      )
    );
$$;

-- The transfer, in two parts. 1. The new school may read what every school the swimmer is linked to (any state, any age) recorded: one
-- grant per previous school, so the chain A, B, C gives C the history of both. 2. The links of the swimmer that other schools ended and
-- whose window is still open close now and point to the new school. Rows already stamped (by the job, or by an earlier transfer) and
-- rows still active are left alone, and the grants ignore a repeat, so it is safe to repeat. A row the job or another transfer is
-- changing at this moment is re-read after its lock: the second writer finds the stamp and skips it. It returns the windows it closed.
create function app.transfer_athlete_school_history(athlete uuid, new_school uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved integer;
begin
  insert into public.athlete_history_grants (athlete_id, source_school_id, target_school_id)
  select s.athlete_id, s.school_id, transfer_athlete_school_history.new_school
  from public.athlete_schools s
  where s.athlete_id = transfer_athlete_school_history.athlete
    and s.school_id <> transfer_athlete_school_history.new_school
  on conflict do nothing;

  update public.athlete_schools s
  set read_window_closed_at = now(), transferred_to_school_id = transfer_athlete_school_history.new_school
  where s.athlete_id = transfer_athlete_school_history.athlete
    and s.school_id <> transfer_athlete_school_history.new_school
    and s.ended_at is not null
    and s.read_window_closed_at is null
    and s.transferred_to_school_id is null
    and s.ended_at + app.athlete_school_read_window() > now();
  get diagnostics moved = row_count;
  return moved;
end;
$$;

revoke execute on function app.transfer_athlete_school_history(uuid, uuid) from public, anon, authenticated;

-- Whether school C reads the marks school A recorded for the swimmer because the family accepted C's invitation (a grant from A to C).
-- C must still read the swimmer itself (active, or inside its own window) and the family's share_results_with_school authorization
-- must be in force, like the sharing of #68. No time condition on A's side: all the history, always.
create function app.school_transfer_in_force(source_school uuid, target_school uuid, athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.athlete_history_grants g
      where g.athlete_id = school_transfer_in_force.athlete
        and g.source_school_id = school_transfer_in_force.source_school
        and g.target_school_id = school_transfer_in_force.target_school
    )
    and exists (
      select 1 from public.athlete_schools b
      where b.athlete_id = school_transfer_in_force.athlete
        and b.school_id = school_transfer_in_force.target_school
        and not app.athlete_school_window_closed(b.ended_at, b.read_window_closed_at)
    )
    and app.authorization_in_force_at(school_transfer_in_force.athlete, 'share_results_with_school', 'infinity', 'infinity');
$$;

revoke execute on function app.school_transfer_in_force(uuid, uuid, uuid) from public, anon, authenticated;

-- Same as 20261026010000 (#68), except that the history a swimmer brings from their previous schools (a grant of the transfer) reads like
-- an approved sharing. Same columns, same filters: not hidden, not discarded, no splits.
create or replace function public.other_school_results(athlete uuid)
returns table (
  id uuid, kind text, hundredths int, stroke text, distance text, pool text,
  session_type text, captured_at timestamptz, arrival_position int
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.kind, m.hundredths, m.stroke, m.distance, m.pool,
         m.session_type, m.captured_at, m.arrival_position
  from public.measurements m
  where m.athlete_id = other_school_results.athlete
    and not m.hidden
    and m.discarded_at is null
    and m.kind <> 'split'
    and exists (
      select 1 from public.school_memberships sm
      where sm.user_id = (select auth.uid())
        and sm.school_id <> m.school_id
        and (sm.role = 'school_admin'
             or (sm.role = 'coach' and app.coach_has_athlete_in_school(other_school_results.athlete, sm.school_id)))
        and (
          app.result_sharing_in_force(m.school_id, sm.school_id, other_school_results.athlete)
          or app.school_transfer_in_force(m.school_id, sm.school_id, other_school_results.athlete)
        )
    )
  order by m.captured_at desc, m.id desc;
$$;

-- accept_invitation of 20261121120000, the same body, plus the transfer at the end (the variable linked and the lines that use it).
create or replace function public.accept_invitation(token text, athlete_id uuid, category_id uuid, accepted_at timestamptz, authorizations jsonb)
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
  linked integer;
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
  get diagnostics linked = row_count;

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

  -- Joining a new school takes the swimmer over from the schools that ended them inside their read window (issue #1419).
  -- The acceptance of the family is what authorizes it: this same call has just recorded its three authorizations. Only a link
  -- created by this call counts, so a retry or an already existing link changes nothing.
  if linked = 1 then
    perform app.transfer_athlete_school_history(accept_invitation.athlete_id, inv.school_id);
  end if;
end;
$$;
