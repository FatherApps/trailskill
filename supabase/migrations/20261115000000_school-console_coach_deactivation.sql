-- Module school-console: deactivate a coach in a school (issue #963).
-- school_memberships.deactivated_at marks a coach as deactivated in that school.
-- Only a school admin sets it: the existing school_memberships_write policy
-- already limits writes to admins of that school. A deactivated coach keeps the
-- author of earlier measurements and cannot record new ones in that school.
-- There is no reactivation here: once set, the column never goes back to null.

alter table public.school_memberships add column deactivated_at timestamptz;

-- Only coach memberships can be deactivated (admins and others cannot).
alter table public.school_memberships
  add constraint school_memberships_deactivated_coach_only
  check (deactivated_at is null or role = 'coach');

create function public.school_memberships_deactivation_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.deactivated_at is not null then
    -- auth.uid() is null for the database owner (migrations, maintenance).
    if new.deactivated_at is null and auth.uid() is not null then
      raise exception 'a deactivated coach cannot be reactivated' using errcode = '42501';
    end if;
    -- Idempotent: a device retrying the same PATCH keeps the first stamp.
    new.deactivated_at := old.deactivated_at;
  elsif new.deactivated_at is not null then
    -- The server stamps the time: the admin device clock is not trusted.
    new.deactivated_at := now();
  end if;
  return new;
end;
$$;

create trigger school_memberships_deactivation_guard
  before insert or update on public.school_memberships
  for each row execute function public.school_memberships_deactivation_guard();

-- True when the signed-in user is a deactivated coach of the school. Security
-- definer so the check does not depend on what the caller can read; it only
-- looks at the caller's own membership.
create function app.coach_deactivated_in_school(school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.school_id = school
      and m.role = 'coach'
      and m.deactivated_at is not null
  );
$$;

revoke execute on function app.coach_deactivated_in_school(uuid) from public, anon;
grant execute on function app.coach_deactivated_in_school(uuid) to authenticated;

-- Restrictive: it is ANDed with the permissive measurements_insert policy, which
-- stays as it is. Earlier measurements and updates are untouched.
-- Offline devices: a deactivated coach's device may record offline and upload
-- later. The insert fails with 42501 (RLS), which the app connector treats as a
-- permanent rejection: it stores the payload in the local upload_failures table
-- (not lost, shown as rejected) instead of retrying forever and blocking the
-- upload queue. Do not change the error code.
create policy measurements_insert_active_coach on public.measurements
  as restrictive
  for insert
  to authenticated
  with check (not app.coach_deactivated_in_school(school_id));
