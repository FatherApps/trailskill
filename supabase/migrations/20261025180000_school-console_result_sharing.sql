-- Module: school-console. Issue #268.
-- One school (A) lets another school (B) see its results, per school pair.
-- Decision (a), provisional pending the maintainer (recorded on #268):
--   * B's admin asks without seeing any school list: only from an athlete that
--     B already shares with A. The request goes to every other school of that
--     athlete, never twice while a pending or approved row of the pair is live,
--     and B learns only how many requests it created, never school names.
--   * Only an admin of B asks; only an admin of A approves or withdraws (a
--     pending request is declined by withdrawing it). No platform admin.
--     After a withdrawal B may ask again with a new row. Rows are never deleted
--     and their evidence never changes; nothing is approved by default.
--   * What B may see (#68, not here) is only A's results of athletes in both
--     schools whose 'share_results_with_school' authorization is in force:
--     app.result_sharing_in_force encodes that condition.
--   * Not synced by PowerSync: read online only.

create table public.school_result_sharing (
  id uuid primary key default gen_random_uuid(),
  -- A: shares its results.
  school_id uuid not null references public.schools,
  -- B: may see them.
  target_school_id uuid not null references public.schools,
  -- The athlete B asked from (evidence).
  athlete_id uuid not null references public.athletes,
  requested_by uuid not null references auth.users,
  requested_at timestamptz not null,
  approved_by uuid references auth.users,
  approved_at timestamptz,
  withdrawn_by uuid references auth.users,
  withdrawn_at timestamptz,
  check (school_id <> target_school_id),
  check ((approved_by is null) = (approved_at is null)),
  check ((withdrawn_by is null) = (withdrawn_at is null))
);

-- One live (pending or approved) row per pair.
create unique index school_result_sharing_live_pair_idx
  on public.school_result_sharing (school_id, target_school_id)
  where withdrawn_at is null;

-- Triggers, not grants, so the rules also bind the owner and the service role.
create function public.school_result_sharing_guard_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.approved_by is not null or new.approved_at is not null
     or new.withdrawn_by is not null or new.withdrawn_at is not null then
    raise exception 'result sharing is born pending' using errcode = '42501';
  end if;
  new.requested_by := auth.uid();
  new.requested_at := clock_timestamp();
  return new;
end;
$$;

create trigger school_result_sharing_guard_insert
  before insert on public.school_result_sharing
  for each row execute function public.school_result_sharing_guard_insert();

-- Only the approval and the withdrawal may be set, each once; the server
-- records who and when.
create function public.school_result_sharing_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  decision_columns text[] := array['approved_by', 'approved_at', 'withdrawn_by', 'withdrawn_at'];
begin
  if (to_jsonb(new) - decision_columns) is distinct from (to_jsonb(old) - decision_columns) then
    raise exception 'result sharing evidence cannot change' using errcode = '42501';
  end if;

  if old.approved_at is not null then
    if (new.approved_by, new.approved_at) is distinct from (old.approved_by, old.approved_at) then
      raise exception 'result sharing approval cannot change' using errcode = '42501';
    end if;
  elsif new.approved_at is not null then
    if old.withdrawn_at is not null then
      raise exception 'withdrawn result sharing cannot be approved' using errcode = '55000';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := clock_timestamp();
  elsif new.approved_by is not null then
    raise exception 'result sharing approval needs a time' using errcode = '42501';
  end if;

  if old.withdrawn_at is not null then
    if (new.withdrawn_by, new.withdrawn_at) is distinct from (old.withdrawn_by, old.withdrawn_at) then
      raise exception 'result sharing withdrawal cannot change' using errcode = '42501';
    end if;
  elsif new.withdrawn_at is not null then
    new.withdrawn_by := auth.uid();
    new.withdrawn_at := clock_timestamp();
  elsif new.withdrawn_by is not null then
    raise exception 'result sharing withdrawal needs a time' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger school_result_sharing_guard_update
  before update on public.school_result_sharing
  for each row execute function public.school_result_sharing_guard_update();

create function public.school_result_sharing_forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'result sharing evidence cannot be deleted' using errcode = '42501';
end;
$$;

create trigger school_result_sharing_forbid_delete
  before delete on public.school_result_sharing
  for each row execute function public.school_result_sharing_forbid_delete();

alter table public.school_result_sharing enable row level security;

-- Supabase grants anon and authenticated everything on new tables: take it
-- back. Clients only read; they write through the functions below.
revoke all on table public.school_result_sharing from anon, authenticated;
grant select on table public.school_result_sharing to authenticated;

create policy school_result_sharing_select on public.school_result_sharing for select to authenticated
  using (
    school_id in (select app.admin_school_ids())
    or target_school_id in (select app.admin_school_ids())
  );

-- B's admin asks, from an athlete of B, every other school of that athlete.
-- Returns how many requests it created, never which schools.
create function public.request_result_sharing(athlete uuid, school uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  created int;
begin
  if not coalesce(
    school in (select app.admin_school_ids()) and app.athlete_in_school(athlete, school),
    false
  ) then
    raise exception 'only an admin of a school of this athlete can request' using errcode = '42501';
  end if;

  insert into public.school_result_sharing (school_id, target_school_id, athlete_id)
  select s.school_id, request_result_sharing.school, request_result_sharing.athlete
  from public.athlete_schools s
  where s.athlete_id = request_result_sharing.athlete
    and s.school_id <> request_result_sharing.school
  on conflict (school_id, target_school_id) where withdrawn_at is null do nothing;

  get diagnostics created = row_count;
  return created;
end;
$$;

-- A's admin approves. Approving an approved request is a no-op.
create function public.approve_result_sharing(sharing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.school_result_sharing;
begin
  select * into r from public.school_result_sharing where id = sharing for update;
  if not found or not (r.school_id in (select app.admin_school_ids())) then
    raise exception 'only an admin of the sharing school can approve' using errcode = '42501';
  end if;
  if r.withdrawn_at is not null then
    raise exception 'withdrawn result sharing cannot be approved' using errcode = '55000';
  end if;
  if r.approved_at is null then
    update public.school_result_sharing set approved_at = clock_timestamp() where id = sharing;
  end if;
end;
$$;

-- A's admin withdraws an approval or declines a pending request. Withdrawing a
-- withdrawn request is a no-op.
create function public.withdraw_result_sharing(sharing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.school_result_sharing;
begin
  select * into r from public.school_result_sharing where id = sharing for update;
  if not found or not (r.school_id in (select app.admin_school_ids())) then
    raise exception 'only an admin of the sharing school can withdraw' using errcode = '42501';
  end if;
  if r.withdrawn_at is null then
    update public.school_result_sharing set withdrawn_at = clock_timestamp() where id = sharing;
  end if;
end;
$$;

-- Live requests to A, for A's admin (empty for anyone else). It returns the
-- asking school's name because A's admin cannot read other schools (#239).
create function public.result_sharing_requests(school uuid)
returns table (id uuid, target_school_name text, requested_at timestamptz, approved_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, s.name, r.requested_at, r.approved_at
  from public.school_result_sharing r
  join public.schools s on s.id = r.target_school_id
  where r.school_id = result_sharing_requests.school
    and r.withdrawn_at is null
    and result_sharing_requests.school in (select app.admin_school_ids())
  order by r.requested_at;
$$;

revoke execute on function
  public.request_result_sharing(uuid, uuid),
  public.approve_result_sharing(uuid),
  public.withdraw_result_sharing(uuid),
  public.result_sharing_requests(uuid)
from public, anon;
grant execute on function
  public.request_result_sharing(uuid, uuid),
  public.approve_result_sharing(uuid),
  public.withdraw_result_sharing(uuid),
  public.result_sharing_requests(uuid)
to authenticated;

-- The condition #68 must use before showing target_school any result of
-- source_school: an approved, not withdrawn sharing of that pair, the athlete
-- in both schools, and its 'share_results_with_school' authorization in force
-- now. Not executable by clients: only #68's server code calls it.
create function app.result_sharing_in_force(source_school uuid, target_school uuid, athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.school_result_sharing r
      where r.school_id = result_sharing_in_force.source_school
        and r.target_school_id = result_sharing_in_force.target_school
        and r.approved_at is not null
        and r.withdrawn_at is null
    )
    and app.athlete_in_school(result_sharing_in_force.athlete, result_sharing_in_force.source_school)
    and app.athlete_in_school(result_sharing_in_force.athlete, result_sharing_in_force.target_school)
    and app.authorization_in_force_at(
      result_sharing_in_force.athlete, 'share_results_with_school', 'infinity', 'infinity'
    );
$$;

revoke execute on function app.result_sharing_in_force(uuid, uuid, uuid) from public, anon, authenticated;
