-- Module training-plans: a note of a guardian or adult athlete on a session (issue
-- #75). It tells the coach something about the day ("arriving late"); it is not a
-- mark and does not freeze the session. Append-only: every note is a new row with
-- its author and date; clients never update or delete.
--
-- assignment_id and version_id are SIMPLE foreign keys, not a composite
-- (assignment_id, version_id) like marks have. A composite key would pin the
-- assignment to the version and make the move of #74
-- (training_plan_versions_move_sessions, training_plan_assignments_keep_version)
-- fail with 23503: a note would block the coach from editing the plan. A note
-- keeps the version it was written against; the insert trigger checks that the
-- version belongs to the plan of the assignment, but not that it is the current
-- one, so the note of a guardian who was offline and saw the old version is kept.
-- block_id is optional: a note about the whole plan has none, and deleting a block
-- without marks turns its notes into notes about the whole plan (on delete set null).
--
-- body is free text and can carry health data of a minor: it is never logged and
-- never shown in a notification. There is no coach policy nor stream yet.

create table public.training_plan_notices (
  id uuid primary key default gen_random_uuid(),
  -- Both set by the server on insert (see the trigger below).
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  athlete_id uuid not null references public.athletes,
  assignment_id uuid not null references public.training_plan_assignments (id),
  version_id uuid not null references public.training_plan_versions (id),
  block_id uuid references public.training_plan_blocks (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 500)
);

create index training_plan_notices_athlete_id_idx on public.training_plan_notices (athlete_id);
create index training_plan_notices_assignment_id_idx on public.training_plan_notices (assignment_id);

alter table public.training_plan_notices enable row level security;

-- Supabase grants anon and authenticated everything on new tables: take it back.
revoke all on table public.training_plan_notices from anon, authenticated;
grant select, insert on table public.training_plan_notices to authenticated;

alter publication powersync add table public.training_plan_notices;

-- The note must be consistent with its assignment: the assignment exists and is
-- not withdrawn, the athlete is in its school and inside its target (same rule as
-- a mark), the version is of the plan of the assignment, and the block, if any, is
-- of that version. The date and the author are the server's. On insert only: the
-- foreign key of block_id rewrites the row when a block is deleted and must pass.
-- Every rejection raises what a failed row level security check raises (42501,
-- same text, no detail or hint), because this trigger runs before WITH CHECK and
-- must not tell a client more than the policy does (issue #271). Security definer
-- to see assignments, versions and blocks whatever the caller can read.
create function public.training_plan_notices_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.training_plan_assignments;
begin
  new.created_at := now();
  new.created_by := auth.uid();
  select * into a from public.training_plan_assignments where id = new.assignment_id;
  if not found
     or a.withdrawn_at is not null
     or a.plan_id is distinct from (select v.plan_id from public.training_plan_versions v where v.id = new.version_id)
     or (new.block_id is not null and not exists (
       select 1 from public.training_plan_blocks b where b.id = new.block_id and b.version_id = new.version_id
     ))
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

revoke execute on function public.training_plan_notices_check() from public, anon, authenticated;

create trigger training_plan_notices_check
  before insert on public.training_plan_notices
  for each row execute function public.training_plan_notices_check();

-- Who writes: the guardian or adult athlete of the athlete (managed athletes).
-- Who reads: the same people and the platform admin.
create policy training_plan_notices_select on public.training_plan_notices for select to authenticated
  using ((select app.is_platform_admin()) or athlete_id in (select app.managed_athlete_ids()));

create policy training_plan_notices_insert on public.training_plan_notices for insert to authenticated
  with check (created_by = (select auth.uid()) and athlete_id in (select app.managed_athlete_ids()));
