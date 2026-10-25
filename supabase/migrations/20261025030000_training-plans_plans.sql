-- Module training-plans: plans, versions and blocks (issue #69), with their row
-- level security policies. A plan belongs to a school; a template is a plan
-- marked as a school template. A version keeps its author and date; its blocks
-- are the sets of the training, in order. Only staff of the school (coaches and
-- admins) read and write them; guardians and adult athletes read plans when
-- assignments arrive in a later issue.

create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  school_id uuid not null references public.schools,
  name text not null,
  is_template boolean not null default false
);

create table public.training_plan_versions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- The author of the version.
  created_by uuid not null default auth.uid(),
  plan_id uuid not null references public.training_plans,
  version int not null check (version > 0),
  unique (plan_id, version)
);

-- stroke and distance are codes validated in the app against src/core/sport
-- (same as timing). equipment and phase are checked here too; their codes match
-- the equipment and phases catalogs in src/core/sport.
create table public.training_plan_blocks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  version_id uuid not null references public.training_plan_versions,
  -- The order of the blocks belongs to the version. No unique (version_id,
  -- position): the sync connector uploads each row on its own, so swapping two
  -- positions would collide mid-upload.
  position int not null check (position > 0),
  repetitions int not null check (repetitions > 0),
  distance text not null,
  stroke text,
  -- Free text the coach writes.
  drill text check (btrim(drill) <> '' and char_length(drill) <= 120),
  equipment text[] not null default '{}'
    check (equipment <@ array['fins', 'paddles', 'snorkel', 'kickboard', 'pull_buoy']),
  send_off_seconds int check (send_off_seconds > 0),
  phase text not null check (phase in ('warm_up', 'main', 'technique', 'cool_down')),
  recording text not null check (recording in ('completion', 'per_repetition', 'series_total')),
  check (stroke is not null or drill is not null)
);

create index training_plans_school_id_idx on public.training_plans (school_id);
create index training_plan_versions_plan_id_idx on public.training_plan_versions (plan_id);
create index training_plan_blocks_version_id_idx on public.training_plan_blocks (version_id);

alter table public.training_plans enable row level security;
alter table public.training_plan_versions enable row level security;
alter table public.training_plan_blocks enable row level security;

grant select, insert, update on table
  public.training_plans,
  public.training_plan_versions
to authenticated;
grant select, insert, update, delete on table public.training_plan_blocks to authenticated;

alter publication powersync add table
  public.training_plans,
  public.training_plan_versions,
  public.training_plan_blocks;

-- A version keeps its author and date. An update that keeps them passes, as a
-- sync upsert retry does.
create function public.training_plan_versions_keep_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'the author and date of a version cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger training_plan_versions_keep_author
  before update on public.training_plan_versions
  for each row execute function public.training_plan_versions_keep_author();

-- Staff are the members of the plan's school, whatever their role.
create policy training_plans_select on public.training_plans for select to authenticated
  using (
    (select app.is_platform_admin())
    or school_id in (select school_id from public.school_memberships where user_id = (select auth.uid()))
  );

create policy training_plans_insert on public.training_plans for insert to authenticated
  with check (
    (select app.is_platform_admin())
    or school_id in (select school_id from public.school_memberships where user_id = (select auth.uid()))
  );

create policy training_plans_update on public.training_plans for update to authenticated
  using (
    (select app.is_platform_admin())
    or school_id in (select school_id from public.school_memberships where user_id = (select auth.uid()))
  )
  with check (
    (select app.is_platform_admin())
    or school_id in (select school_id from public.school_memberships where user_id = (select auth.uid()))
  );

-- The subqueries on training_plans and training_plan_versions run with their
-- own policies, so a version or block is visible only through a visible plan.
create policy training_plan_versions_select on public.training_plan_versions for select to authenticated
  using (plan_id in (select id from public.training_plans));

create policy training_plan_versions_insert on public.training_plan_versions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and plan_id in (select id from public.training_plans)
  );

create policy training_plan_versions_update on public.training_plan_versions for update to authenticated
  using (plan_id in (select id from public.training_plans))
  with check (plan_id in (select id from public.training_plans));

create policy training_plan_blocks_select on public.training_plan_blocks for select to authenticated
  using (version_id in (select id from public.training_plan_versions));

create policy training_plan_blocks_insert on public.training_plan_blocks for insert to authenticated
  with check (version_id in (select id from public.training_plan_versions));

create policy training_plan_blocks_update on public.training_plan_blocks for update to authenticated
  using (version_id in (select id from public.training_plan_versions))
  with check (version_id in (select id from public.training_plan_versions));

create policy training_plan_blocks_delete on public.training_plan_blocks for delete to authenticated
  using (version_id in (select id from public.training_plan_versions));
