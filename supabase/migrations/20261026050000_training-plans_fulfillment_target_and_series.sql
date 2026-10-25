-- Module training-plans: a mark must be inside the target of its assignment, a
-- series_id must be a valid link, and the checks answer like row level security
-- (issue #271).
--
-- Before: a mark was accepted for any athlete of the school of the assignment who
-- was in the coach's charge, even outside the target (the group, say), and
-- series_id could point at any timing_series. And the two "the athlete belongs to
-- the school" triggers answered 23503 with their own text, so school staff could
-- tell whether an athlete UUID belongs to the school.
--
-- Unified error. BEFORE triggers run before WITH CHECK, so a client the policy
-- would reject reached the trigger first and learned something the policy never
-- tells it (that the athlete or series exists, or in which school it is). Every
-- rejection below raises exactly what a failed WITH CHECK raises: 42501, the
-- text of Postgres with the real table name, and no detail, hint or fields.
-- Marks are rejected, not hidden: the withdrawal of an assignment is the only
-- reason a mark is kept without being valid, and it is not rejected (see the
-- assignment_scope_and_withdrawal migration).

-- The two functions below belong to the athletes module API (athlete_groups and
-- athlete_schools are its tables), like app.athlete_in_school. They live in this
-- migration only because it is the slot of training-plans, the first caller, as
-- 20261026040000 does for its training-plans part. Not executable by clients: the
-- triggers that call them run as their owner, and a client could otherwise probe
-- the groups and categories of any athlete.
create function app.athlete_in_group(athlete uuid, grp uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.athlete_groups
    where athlete_id = athlete_in_group.athlete and group_id = athlete_in_group.grp
  );
$$;

-- The category of an athlete is per school (athlete_schools), hence the school.
create function app.athlete_in_category(athlete uuid, category uuid, school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.athlete_schools
    where athlete_id = athlete_in_category.athlete
      and school_id = athlete_in_category.school
      and category_id = athlete_in_category.category
  );
$$;

revoke execute on function
  app.athlete_in_group(uuid, uuid),
  app.athlete_in_category(uuid, uuid, uuid)
from public, anon, authenticated;

-- Same check as before, with the unified error.
create or replace function public.training_plan_assignments_check_athlete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.athlete_id is not null and not app.athlete_in_school(new.athlete_id, new.school_id) then
    raise exception using
      errcode = '42501',
      message = format('new row violates row-level security policy for table "%s"', tg_table_name);
  end if;
  return new;
end;
$$;

-- The athlete of a mark must be in the school of its assignment and inside the
-- assignment's target: the athlete itself, a member of the group, an athlete of
-- the category in that school, or any athlete of the school. The coach policy
-- only checks the coach's athletes and schools separately. On insert only: the
-- withdrawal recompute rewrites athlete_id and must never fail on the current
-- membership of the athlete. A withdrawn assignment does not reject a mark. A
-- missing assignment gets the same error (the foreign key never answers first).
create or replace function public.training_plan_fulfillments_check_school()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.training_plan_assignments;
begin
  select * into a from public.training_plan_assignments where id = new.assignment_id;
  if not found
     or not app.athlete_in_school(new.athlete_id, a.school_id)
     or not coalesce(
       case a.target
         when 'athlete' then new.athlete_id = a.athlete_id
         when 'group' then app.athlete_in_group(new.athlete_id, a.group_id)
         when 'category' then app.athlete_in_category(new.athlete_id, a.category_id, a.school_id)
         else true
       end,
       false
     ) then
    raise exception using
      errcode = '42501',
      message = format('new row violates row-level security policy for table "%s"', tg_table_name);
  end if;
  return new;
end;
$$;

-- A series_id is a link to the series whose measurements are the times of the
-- athlete: null is always accepted; a value only on a block that records times
-- and for a series of the school of the assignment. A series that does not exist
-- gets the same error as one of another school (this trigger runs before the
-- foreign key), so the answer does not tell whether the series exists. The
-- athlete is not required to have measurements in it: the link is resolved when
-- reading, and without measurements it shows no time, never zero. Reads
-- timing_series (module timing) directly, as the other cross-module triggers of
-- this module do with their own accepted coupling; security definer so the
-- caller's access to the series does not matter.
create function public.training_plan_fulfillments_check_series()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.series_id is null then
    return new;
  end if;
  if (select b.recording from public.training_plan_blocks b where b.id = new.block_id) = 'completion'
     or (select s.school_id from public.timing_series s where s.id = new.series_id)
        is distinct from (select a.school_id from public.training_plan_assignments a where a.id = new.assignment_id) then
    raise exception using
      errcode = '42501',
      message = format('new row violates row-level security policy for table "%s"', tg_table_name);
  end if;
  return new;
end;
$$;

revoke execute on function public.training_plan_fulfillments_check_series() from public;

-- BEFORE triggers run in name order: check_school, check_series, compute_hidden.
create trigger training_plan_fulfillments_check_series
  before insert or update of series_id on public.training_plan_fulfillments
  for each row execute function public.training_plan_fulfillments_check_series();
