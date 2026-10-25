-- Module school-console: coach-to-athlete assignments. Separate migration
-- because it needs athletes, which needs school-console tables first.
-- Row level security is on and no policies exist yet (issue #31).

create table public.coach_athlete_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  coach_user_id uuid not null references auth.users,
  athlete_id uuid not null references public.athletes,
  unique (coach_user_id, athlete_id)
);

alter table public.coach_athlete_assignments enable row level security;

grant select, insert, update, delete on table public.coach_athlete_assignments to authenticated;

alter publication powersync add table public.coach_athlete_assignments;
