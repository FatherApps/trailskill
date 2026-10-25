-- Module: school-console. Issues #257 and #300.
-- A direct coach-to-athlete assignment belongs to one school (school_id), set
-- on insert and fixed after it. The coach must be a coach of that school and
-- the athlete must be in it. A school admin reads and writes only the
-- assignments of their own schools, so the admin of A no longer receives the
-- assignments made in B for an athlete of both schools (#257). The coach still
-- reads all of their own assignments. Being "assigned in B" now means a direct
-- assignment of school B or a coach group of school B: other_school_results
-- (#68) and app.can_assign_training_plan use it (#300).
-- app.coach_athlete_ids() stays the union over every school on purpose: its
-- callers (measurements, training plans) add their own school filter.

alter table public.coach_athlete_assignments add column school_id uuid references public.schools;

-- Existing rows get the only possible school, never a guess: the schools where
-- the coach is a coach and the athlete is enrolled. Every row is checked
-- first; if any has no possible school or more than one, the migration fails
-- once, with the count and the first 10 ids of each type (ids and counts only),
-- and writes nothing. Kept as a function, not a DO block, so the pgTAP tests and
-- the deploy runbook can run the same check (same pattern as #291).
create function app.coach_assignment_backfill_school_ids()
returns void
language plpgsql
-- Security definer like every app function; only the owner may execute it.
security definer
set search_path = ''
as $$
declare
  none_count bigint;
  many_count bigint;
  none_ids text;
  many_ids text;
begin
  drop table if exists pg_temp.coach_assignment_backfill;
  create temporary table coach_assignment_backfill (id uuid, school uuid, candidates int) on commit drop;

  insert into pg_temp.coach_assignment_backfill (id, school, candidates)
  select ca.id,
         case when count(distinct sm.school_id) = 1 then (array_agg(sm.school_id))[1] end,
         count(distinct sm.school_id)
  from public.coach_athlete_assignments ca
  left join public.school_memberships sm
    on sm.user_id = ca.coach_user_id
   and sm.role = 'coach'
   and app.athlete_in_school(ca.athlete_id, sm.school_id)
  where ca.school_id is null
  group by ca.id;

  select count(*) filter (where candidates = 0), count(*) filter (where candidates > 1)
  into none_count, many_count
  from pg_temp.coach_assignment_backfill;

  if none_count > 0 or many_count > 0 then
    select coalesce(string_agg(id::text, ', ' order by id), 'none') into none_ids
    from (select id from pg_temp.coach_assignment_backfill where candidates = 0 order by id limit 10) f;
    select coalesce(string_agg(id::text, ', ' order by id), 'none') into many_ids
    from (select id from pg_temp.coach_assignment_backfill where candidates > 1 order by id limit 10) f;
    raise exception 'coach_assignment_school_id backfill: % coach_athlete_assignments without a possible school (first 10: %); % with more than one possible school (first 10: %)',
      none_count, none_ids, many_count, many_ids;
  end if;

  update public.coach_athlete_assignments ca set school_id = b.school
  from pg_temp.coach_assignment_backfill b where b.id = ca.id;
end;
$$;

-- New functions are executable by PUBLIC by default; this one rewrites every row.
revoke execute on function app.coach_assignment_backfill_school_ids() from public, anon, authenticated;

select app.coach_assignment_backfill_school_ids();

alter table public.coach_athlete_assignments alter column school_id set not null;

-- The same coach and athlete may be assigned once per school.
alter table public.coach_athlete_assignments drop constraint coach_athlete_assignments_coach_user_id_athlete_id_key;
alter table public.coach_athlete_assignments
  add constraint coach_athlete_assignments_coach_athlete_school_key unique (coach_user_id, athlete_id, school_id);

create index coach_athlete_assignments_school_id_idx on public.coach_athlete_assignments (school_id);

-- The checks hold for every writer, the owner and the platform admin included.
-- Security definer because app.athlete_in_school is not executable by clients.
-- On insert a missing school (a writer that does not send it yet) gets the only
-- possible school, as in the backfill; with none or several it stays null and
-- the not-null constraint rejects the row.
create function public.coach_athlete_assignments_check_school()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.school_id is distinct from old.school_id then
      raise exception 'the school of a coach assignment cannot change' using errcode = '42501';
    end if;
    if new.coach_user_id is not distinct from old.coach_user_id and new.athlete_id is not distinct from old.athlete_id then
      return new;
    end if;
  elsif new.school_id is null then
    select case when count(distinct sm.school_id) = 1 then (array_agg(sm.school_id))[1] end into new.school_id
    from public.school_memberships sm
    where sm.user_id = new.coach_user_id and sm.role = 'coach'
      and app.athlete_in_school(new.athlete_id, sm.school_id);
  end if;
  if new.school_id is null then
    return new;
  end if;
  -- This trigger runs before RLS: a client outside the school gets RLS's own error, so the
  -- detailed messages below do not reveal who coaches or is enrolled there.
  if (select auth.uid()) is not null
     and not (select app.is_platform_admin())
     and new.school_id not in (select app.admin_school_ids()) then
    raise exception 'new row violates row-level security policy for table "coach_athlete_assignments"' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.school_memberships
    where user_id = new.coach_user_id and school_id = new.school_id and role = 'coach'
  ) then
    raise exception 'the coach of an assignment must be a coach of its school' using errcode = '42501';
  end if;
  if not app.athlete_in_school(new.athlete_id, new.school_id) then
    raise exception 'the athlete of a coach assignment must be in its school' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.coach_athlete_assignments_check_school() from public;

create trigger coach_athlete_assignments_check_school
  before insert or update on public.coach_athlete_assignments
  for each row execute function public.coach_athlete_assignments_check_school();

-- The coach reads their own assignments; a school admin only those of their schools.
drop policy coach_athlete_assignments_select on public.coach_athlete_assignments;
create policy coach_athlete_assignments_select on public.coach_athlete_assignments for select to authenticated
  using (
    coach_user_id = (select auth.uid())
    or (select app.is_platform_admin())
    or school_id in (select app.admin_school_ids())
  );

-- The coach and athlete rules live in the trigger; the policies only pin the school.
drop policy coach_athlete_assignments_insert on public.coach_athlete_assignments;
create policy coach_athlete_assignments_insert on public.coach_athlete_assignments for insert to authenticated
  with check ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()));

drop policy coach_athlete_assignments_update on public.coach_athlete_assignments;
create policy coach_athlete_assignments_update on public.coach_athlete_assignments for update to authenticated
  using ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()))
  with check ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()));

drop policy coach_athlete_assignments_delete on public.coach_athlete_assignments;
create policy coach_athlete_assignments_delete on public.coach_athlete_assignments for delete to authenticated
  using ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()));

-- Whether the athlete is in the signed-in coach's charge in this school: a
-- direct assignment of the school or a coach group of the school. Only called
-- from security definer functions, so clients cannot execute it.
create function app.coach_has_athlete_in_school(athlete uuid, school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
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
  );
$$;

revoke execute on function app.coach_has_athlete_in_school(uuid, uuid) from public, anon, authenticated;

-- Same as #68, except that a coach of B must have the athlete assigned in B.
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
        and app.result_sharing_in_force(m.school_id, sm.school_id, other_school_results.athlete)
    )
  order by m.captured_at desc, m.id desc;
$$;

-- Same as issue #274's scope rule, except that a direct assignment counts only
-- in its own school, like a coach group already did.
create or replace function app.can_assign_training_plan(school uuid, target text, athlete uuid, grp uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select app.is_platform_admin())
    or school in (select app.admin_school_ids())
    or (
      school in (
        select m.school_id from public.school_memberships m
        where m.user_id = (select auth.uid()) and m.role = 'coach'
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
