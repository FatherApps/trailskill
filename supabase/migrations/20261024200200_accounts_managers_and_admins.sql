-- Module accounts: who manages each athlete and who administers the
-- platform. Row level security is on and no policies exist yet (issue #31).

create table public.athlete_managers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  user_id uuid not null references auth.users,
  athlete_id uuid not null references public.athletes,
  relation text not null check (relation in ('guardian', 'self')),
  unique (user_id, athlete_id)
);

create table public.platform_admins (
  user_id uuid primary key references auth.users,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

alter table public.athlete_managers enable row level security;
alter table public.platform_admins enable row level security;

grant select, insert, update, delete on table
  public.athlete_managers,
  public.platform_admins
to authenticated;

alter publication powersync add table
  public.athlete_managers,
  public.platform_admins;
