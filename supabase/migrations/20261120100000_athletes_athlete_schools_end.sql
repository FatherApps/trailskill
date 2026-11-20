-- Module athletes: a school ends a swimmer's link with it (issue #1243).
-- A school is responsible for its swimmers and their data: it ends the link ("dar de baja"), which is the condition for a
-- family to delete their data later (#1244). The baja deletes nothing and has no reactivation here.
--
-- athlete_schools.ended_at and ended_by stay null while the link is active. Only public.end_athlete_school sets them: an
-- active school_admin of that school, with the time and the caller stamped by the server. A trigger blocks every direct
-- write by a client role, the platform admin included.
-- After the baja the coaches and admins of that school lose the swimmer, one (swimmer, school) pair at a time, as the
-- deactivated coach did in #1031: a coach or admin of another school where the link is active keeps reading there. The
-- guardian and the adult athlete read through athlete_managers and keep everything, the ended row included.
-- The helper functions below carry the cut: reads of athletes, athlete_schools, athlete_groups, athlete_managers,
-- authorization_status, athlete_photos, adult_profiles, results and fulfillments go through them, and so do the writes
-- of marks of that swimmer in that school. Three paths do not go through them and are closed at the end of this file: the
-- results of other schools (result_sharing_in_force), requesting a sharing (request_result_sharing) and assigning a plan
-- to the swimmer (can_assign_training_plan, athlete target). powersync/sync-config.yaml is kept in step.
-- Revert: recreate the seven functions and measurements_select / athlete_schools_write from 20261116120100, 20261116040000,
-- 20261115090000, 20261116060000, 20261116070000 and 20261024210200 (without the ended filter), drop function
-- public.end_athlete_school, drop trigger athlete_schools_ended_guard, drop the check and the two columns, and restore
-- powersync/sync-config.yaml. Nothing is lost: ended links read again as active.

alter table public.athlete_schools
  add column ended_at timestamptz,
  add column ended_by uuid,
  add constraint athlete_schools_ended_both_or_neither check ((ended_at is null) = (ended_by is null));

-- A client role (the app, the API, an Edge Function with the service key) never writes the columns: the baja goes
-- through end_athlete_school, which runs as its owner. current_user inside a security definer function is that owner.
create function public.athlete_schools_ended_guard()
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
    elsif new.ended_at is distinct from old.ended_at or new.ended_by is distinct from old.ended_by then
      raise exception 'a link is ended only with end_athlete_school' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger athlete_schools_ended_guard
  before insert or update on public.athlete_schools
  for each row execute function public.athlete_schools_ended_guard();

-- The baja. The caller must be an active admin of the school; the check runs before the row is looked up, so nobody else
-- learns whether the link exists. Repeating it keeps the first stamp (a device retrying the same call).
create function public.end_athlete_school(athlete uuid, school uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  stamp timestamptz;
begin
  if not exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.school_id = end_athlete_school.school
      and m.role = 'school_admin'
      and m.deactivated_at is null
  ) then
    raise exception 'only an active admin of the school can end a swimmer''s link' using errcode = '42501';
  end if;

  update public.athlete_schools s
  set ended_at = now(), ended_by = (select auth.uid())
  where s.athlete_id = end_athlete_school.athlete
    and s.school_id = end_athlete_school.school
    and s.ended_at is null
  returning s.ended_at into stamp;

  if stamp is null then
    select s.ended_at into stamp from public.athlete_schools s
    where s.athlete_id = end_athlete_school.athlete and s.school_id = end_athlete_school.school;
    if not found then
      raise exception 'the swimmer is not enrolled in that school' using errcode = 'P0002';
    end if;
  end if;
  return stamp;
end;
$$;

revoke execute on function public.end_athlete_school(uuid, uuid) from public, anon;
grant execute on function public.end_athlete_school(uuid, uuid) to authenticated;

-- Admin side: only the links not ended.
create or replace function app.admin_athlete_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_id from public.athlete_schools
  where school_id in (select app.admin_school_ids()) and ended_at is null;
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
  where s.school_id in (select app.admin_school_ids()) and s.ended_at is null;
$$;

create or replace function app.admin_athlete_schools()
returns table (athlete_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_id, school_id from public.athlete_schools
  where school_id in (select app.admin_school_ids()) and ended_at is null;
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
        and s.ended_at is null
    );
$$;

-- Coach side: a pair of the coach's assignments is dropped when the swimmer's link in that school is ended. "Not ended"
-- (and not "has an active link") keeps an assignment without an enrollment row exactly as it was.
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
      where s.athlete_id = ag.athlete_id and s.school_id = tg.school_id and s.ended_at is not null
    )
  union
  select ca.athlete_id from public.coach_athlete_assignments ca
  where ca.coach_user_id = (select auth.uid())
    and ca.school_id in (select app.staff_school_ids())
    and not exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = ca.athlete_id and s.school_id = ca.school_id and s.ended_at is not null
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
      where s.athlete_id = ca.athlete_id and s.school_id = ca.school_id and s.ended_at is not null
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
      where s.athlete_id = ag.athlete_id and s.school_id = tg.school_id and s.ended_at is not null
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
        and s.ended_at is not null
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

-- Same grants as before; create or replace keeps them, restated so the file reads on its own.
revoke execute on function
  app.admin_athlete_ids(), app.admin_athlete_school_pairs(), app.admin_athlete_schools(),
  app.admin_has_athlete_in_school(uuid, uuid), app.coach_athlete_ids(), app.coach_athlete_school_pairs(),
  app.coach_has_athlete_in_school(uuid, uuid)
from public, anon;
grant execute on function
  app.admin_athlete_ids(), app.admin_athlete_school_pairs(), app.admin_athlete_schools(),
  app.admin_has_athlete_in_school(uuid, uuid), app.coach_athlete_ids(), app.coach_athlete_school_pairs(),
  app.coach_has_athlete_in_school(uuid, uuid)
to authenticated;

-- measurements_select (20261116040000): an admin read a mark when the swimmer was in any school they administer and the
-- mark in one of them. After a baja in A that left an admin of A and B reading A's marks of a swimmer still active in B.
-- The admin branch now matches the (swimmer, school) pair, as the coach branch does. Nothing else changes.
alter policy measurements_select on public.measurements
  using (
    (select app.is_platform_admin())
    or (
      athlete_id in (select app.managed_athlete_ids())
      and (guardian_visible or hidden)
    )
    or athlete_id in (
      select am.athlete_id from public.athlete_managers am
      where am.user_id = (select auth.uid()) and am.relation = 'self'
    )
    or (
      not hidden
      and (
        (athlete_id in (select app.managed_athlete_ids()) and school_id in (select app.staff_school_ids()))
        or (athlete_id, school_id) in (select p.athlete_id, p.school_id from app.admin_athlete_school_pairs() p)
        or (athlete_id, school_id) in (select p.athlete_id, p.school_id from app.coach_athlete_school_pairs() p)
      )
    )
    or (
      created_by = (select auth.uid())
      and hidden
      and app.hidden_measurement_written_back(id)
      and school_id in (select app.staff_school_ids())
    )
    or (
      athlete_id is null
      and series_id in (select ts.id from public.timing_series ts where ts.created_by = (select auth.uid()))
      and school_id in (select app.staff_school_ids())
    )
  );

-- An admin changes or deletes only a link that is not ended: an ended row stays as the baja left it.
alter policy athlete_schools_write on public.athlete_schools
  using (
    (select app.is_platform_admin())
    or (
      school_id in (select app.admin_school_ids())
      and athlete_id in (select app.admin_athlete_ids())
      and ended_at is null
    )
  )
  with check (
    (select app.is_platform_admin())
    or (
      school_id in (select app.admin_school_ids())
      and athlete_id in (select app.admin_athlete_ids())
      and ended_at is null
    )
  );

-- athlete_groups_write is "for all", so it also lets an admin read: it checked the swimmer in any school they administer
-- and the group in one of them. After a baja in A an admin of A and B kept reading the A group rows of a swimmer still
-- active in B. It now matches the (swimmer, group) pairs of the schools where the link is active, as
-- athlete_groups_select does for admins.
alter policy athlete_groups_write on public.athlete_groups
  using (
    (select app.is_platform_admin())
    or (athlete_id, group_id) in (
      select p.athlete_id, tg.id
      from app.admin_athlete_school_pairs() p
      join public.training_groups tg on tg.school_id = p.school_id
    )
  )
  with check (
    (select app.is_platform_admin())
    or (athlete_id, group_id) in (
      select p.athlete_id, tg.id
      from app.admin_athlete_school_pairs() p
      join public.training_groups tg on tg.school_id = p.school_id
    )
  );

-- The three paths that still treated an ended link as active (found by the independent verifier). create or replace keeps
-- the grants each function already had.
-- 1. other_school_results lets an admin or coach of a school read the swimmer's results of another school while the two
--    schools share them: the reader school is target_school, and it must not have ended the link. The source school keeps
--    its own data and its sharing as it was.
create or replace function app.result_sharing_in_force(source_school uuid, target_school uuid, athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.school_result_sharing r
      where r.school_id = result_sharing_in_force.source_school
        and r.target_school_id = result_sharing_in_force.target_school
        and r.approved_at is not null
        and r.withdrawn_at is null
    )
    and app.athlete_in_school(result_sharing_in_force.athlete, result_sharing_in_force.source_school)
    and app.athlete_in_school(result_sharing_in_force.athlete, result_sharing_in_force.target_school)
    and not exists (
      select 1 from public.athlete_schools s
      where s.athlete_id = result_sharing_in_force.athlete
        and s.school_id = result_sharing_in_force.target_school
        and s.ended_at is not null
    )
    and app.authorization_in_force_at(
      result_sharing_in_force.athlete, 'share_results_with_school', 'infinity', 'infinity'
    );
$$;

-- 2. An admin asks another school for a swimmer's results only while the swimmer is active in their school.
create or replace function public.request_result_sharing(athlete uuid, school uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  created int;
begin
  if not coalesce(app.admin_has_athlete_in_school(athlete, school), false) then
    raise exception 'only an admin of a school of this athlete can request' using errcode = '42501';
  end if;

  insert into public.school_result_sharing (school_id, target_school_id, athlete_id)
  select s.school_id, request_result_sharing.school, request_result_sharing.athlete
  from public.athlete_schools s
  where s.athlete_id = request_result_sharing.athlete
    and s.school_id <> request_result_sharing.school
  on conflict (school_id, target_school_id) where withdrawn_at is null do nothing;

  get diagnostics created = row_count;
  return created;
end;
$$;

-- 3. Nobody assigns a plan to a swimmer whose link with the school is ended: the coach branch already follows
--    coach_has_athlete_in_school; the admin branch checked only the school.
create or replace function app.can_assign_training_plan(school uuid, target text, athlete uuid, grp uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select app.is_platform_admin())
    or (
      school in (select app.admin_school_ids())
      and (
        target <> 'athlete'
        or not exists (
          select 1 from public.athlete_schools s
          where s.athlete_id = can_assign_training_plan.athlete
            and s.school_id = can_assign_training_plan.school
            and s.ended_at is not null
        )
      )
    )
    or (
      school in (
        select m.school_id from public.school_memberships m
        where m.user_id = (select auth.uid()) and m.role = 'coach'
          and m.deactivated_at is null
      )
      and (
        (target = 'athlete' and app.coach_has_athlete_in_school(athlete, school))
        or (target = 'group' and grp in (
          select g.group_id from public.coach_group_assignments g
          where g.coach_user_id = (select auth.uid())
        ))
      )
    );
$$;
