-- Module school-console: schools, categories, training groups, staff roles
-- and coach-to-group assignments. Row level security is on and no policies
-- exist yet (issue #31), so authenticated users read nothing.

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  name text not null
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  school_id uuid not null references public.schools,
  name text not null,
  sort_order int not null default 0
);

create table public.training_groups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  school_id uuid not null references public.schools,
  name text not null
);

create table public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  school_id uuid not null references public.schools,
  user_id uuid not null references auth.users,
  role text not null check (role in ('school_admin', 'coach')),
  unique (school_id, user_id, role)
);

create table public.coach_group_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  coach_user_id uuid not null references auth.users,
  group_id uuid not null references public.training_groups,
  unique (coach_user_id, group_id)
);

alter table public.schools enable row level security;
alter table public.categories enable row level security;
alter table public.training_groups enable row level security;
alter table public.school_memberships enable row level security;
alter table public.coach_group_assignments enable row level security;

grant select, insert, update, delete on table
  public.schools,
  public.categories,
  public.training_groups,
  public.school_memberships,
  public.coach_group_assignments
to authenticated;

create publication powersync for table
  public.schools,
  public.categories,
  public.training_groups,
  public.school_memberships,
  public.coach_group_assignments;
