-- Module training-plans: who may assign a plan, and withdrawing an assignment
-- (issue #274). A coach assigns only to the athletes in their charge (directly or
-- by group) and to their own groups; a category or the whole school, only the
-- school admin; the platform admin has no limit. The same rule as the client
-- (src/modules/training-plans/data/assignable.ts).
-- An assignment is never deleted: it is withdrawn once (withdrawn_at, withdrawn_by).
-- A withdrawn assignment stops reaching guardians, adult athletes and the Sync
-- Streams; staff still read it as a record. Its marks are all kept, and a mark is
-- never rejected because its assignment was withdrawn: a coach who marked offline
-- without knowing would get a permanent upload failure. Such a mark shows nowhere
-- (the assignment is out of the streams) but stays for the audit trail.

alter table public.training_plan_assignments
  add column withdrawn_at timestamptz,
  add column withdrawn_by uuid references auth.users,
  add constraint training_plan_assignments_withdrawal_check
    check ((withdrawn_at is null) = (withdrawn_by is null));

-- Whether the caller may write an assignment with these values. Only the school,
-- the target kind and the athlete or group matter: the school of the target is
-- already pinned by training_plan_assignments_check_athlete (athlete) and by the
-- composite keys (group, category), so it is not checked again here. It answers
-- only about the caller's own role and charge. An athlete is in a coach's charge
-- in this school when assigned to the coach directly (direct assignments have no
-- school) or through a coach's group of this school, never through a group of
-- another school, as in the client (checkTarget).
create function app.can_assign_training_plan(school uuid, target text, athlete uuid, grp uuid)
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
        (target = 'athlete' and (
          athlete in (
            select ca.athlete_id from public.coach_athlete_assignments ca
            where ca.coach_user_id = (select auth.uid())
          )
          or athlete in (
            select ag.athlete_id from public.athlete_groups ag
            join public.coach_group_assignments cg on cg.group_id = ag.group_id
            join public.training_groups tg on tg.id = ag.group_id
            where cg.coach_user_id = (select auth.uid()) and tg.school_id = school
          )
        ))
        or (target = 'group' and grp in (
          select g.group_id from public.coach_group_assignments g
          where g.coach_user_id = (select auth.uid())
        ))
      )
    );
$$;

revoke execute on function app.can_assign_training_plan(uuid, text, uuid, uuid) from public, anon;
grant execute on function app.can_assign_training_plan(uuid, text, uuid, uuid) to authenticated;

drop policy training_plan_assignments_insert on public.training_plan_assignments;
create policy training_plan_assignments_insert on public.training_plan_assignments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and app.can_assign_training_plan(school_id, target, athlete_id, group_id)
  );

-- Both the stored row and the new one must be in the caller's scope, so a coach
-- cannot move an assignment out of or into their charge. This also decides who
-- may withdraw.
drop policy training_plan_assignments_update on public.training_plan_assignments;
create policy training_plan_assignments_update on public.training_plan_assignments for update to authenticated
  using (app.can_assign_training_plan(school_id, target, athlete_id, group_id))
  with check (app.can_assign_training_plan(school_id, target, athlete_id, group_id));

-- Staff still read withdrawn assignments: they are the record, and the user who
-- withdraws must read the row back (UPDATE ... RETURNING). Guardians and adult
-- athletes stop reading them, and with them the plans and versions they reached.
drop policy training_plan_assignments_select on public.training_plan_assignments;
create policy training_plan_assignments_select on public.training_plan_assignments for select to authenticated
  using (
    (select app.is_platform_admin())
    or school_id in (select school_id from public.school_memberships where user_id = (select auth.uid()))
    or (
      withdrawn_at is null
      and (
        athlete_id in (select app.managed_athlete_ids())
        or group_id in (select app.managed_group_ids())
        or category_id in (select app.managed_category_ids())
        or (target = 'school' and school_id in (select app.managed_school_ids()))
      )
    )
  );

-- A withdrawal happens once and freezes the assignment. The server records who
-- withdrew; the device time is kept, clamped to the reception time, like an
-- authorization withdrawal. A retry or a second withdrawal is a no-op: the first
-- stands. An insert may already be withdrawn (an offline create and withdraw sent
-- as one row). withdrawn_by without withdrawn_at falls to the check constraint.
-- BEFORE triggers run in name order (check_athlete, frozen, guard_withdrawal);
-- none reads what another writes, so the order does not matter.
create function public.training_plan_assignments_guard_withdrawal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.withdrawn_at is not null then
    if new.withdrawn_at is null
       or (to_jsonb(new) - array['withdrawn_at', 'withdrawn_by'])
          is distinct from (to_jsonb(old) - array['withdrawn_at', 'withdrawn_by']) then
      raise exception 'a withdrawn assignment cannot change' using errcode = '42501';
    end if;
    new.withdrawn_at := old.withdrawn_at;
    new.withdrawn_by := old.withdrawn_by;
  elsif new.withdrawn_at is not null then
    new.withdrawn_by := coalesce(auth.uid(), new.withdrawn_by);
    new.withdrawn_at := least(new.withdrawn_at, clock_timestamp());
  end if;
  return new;
end;
$$;

revoke execute on function public.training_plan_assignments_guard_withdrawal() from public;

create trigger training_plan_assignments_guard_withdrawal
  before insert or update on public.training_plan_assignments
  for each row execute function public.training_plan_assignments_guard_withdrawal();
