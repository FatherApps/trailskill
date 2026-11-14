-- Module school-console: pending invitations of coaches to a school (issue #961).
-- A separate table on purpose: school_invitations is the athletes' registration
-- link (accounts module) and has another shape and lifecycle. Only an admin of
-- the school creates and reads its invitations; accepting one is issue #964.
-- Not in the powersync publication: the console reads them online.

create table public.coach_invitations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id),
  school_id uuid not null references public.schools (id),
  email text not null check (
    email = lower(btrim(email))
    and char_length(email) <= 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  status text not null default 'pending' check (status in ('pending'))
);

-- One pending invitation per school and email: inviting again reuses it.
create unique index coach_invitations_pending_email_key
  on public.coach_invitations (school_id, email) where status = 'pending';

alter table public.coach_invitations enable row level security;

-- Supabase grants everything on new tables: take it back. No update, no delete.
revoke all on table public.coach_invitations from anon, authenticated;
grant select, insert on table public.coach_invitations to authenticated;

-- Only school admins, not platform admins: the invitation is the school's own.
create policy coach_invitations_select on public.coach_invitations for select to authenticated
  using (school_id in (select app.admin_school_ids()));
create policy coach_invitations_insert on public.coach_invitations for insert to authenticated
  with check (school_id in (select app.admin_school_ids()) and created_by = (select auth.uid()));
