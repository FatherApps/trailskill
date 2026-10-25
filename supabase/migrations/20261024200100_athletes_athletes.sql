-- Module athletes: athlete profiles and their links to schools, categories
-- and training groups. Row level security is on and no policies exist yet
-- (issue #31).

create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  first_name text not null,
  last_name text not null
);

create table public.athlete_schools (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  athlete_id uuid not null references public.athletes,
  school_id uuid not null references public.schools,
  category_id uuid references public.categories,
  unique (athlete_id, school_id)
);

create table public.athlete_groups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  athlete_id uuid not null references public.athletes,
  group_id uuid not null references public.training_groups,
  unique (athlete_id, group_id)
);

alter table public.athletes enable row level security;
alter table public.athlete_schools enable row level security;
alter table public.athlete_groups enable row level security;

grant select, insert, update, delete on table
  public.athletes,
  public.athlete_schools,
  public.athlete_groups
to authenticated;

alter publication powersync add table
  public.athletes,
  public.athlete_schools,
  public.athlete_groups;
