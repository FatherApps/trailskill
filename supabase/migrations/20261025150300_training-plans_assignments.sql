-- Module training-plans: plan assignments and their fulfillment (issue #70), with
-- row level security. An assignment links one version of a plan to a target (an
-- athlete, a group, a category or the whole school) and a date. Fulfillment is
-- one row per mark: a coach marks a block of an athlete as done, partial (with a
-- count), absent or not marked. It is append-only: every mark is a new row with
-- its author and device, so two coaches marking the same block from two devices
-- never overwrite each other. A block that records times does not copy them: the
-- row links the timing series and the times are that series' measurements.
-- Which version applies to a training session is decided in a later issue (#74).

-- Composite keys, so a child row can only point at a parent of its own school,
-- plan or version (MATCH SIMPLE skips the check of a null column).
alter table public.training_plans
  add constraint training_plans_id_school_id_key unique (id, school_id);
alter table public.training_plan_versions
  add constraint training_plan_versions_id_plan_id_key unique (id, plan_id);
alter table public.training_plan_blocks
  add constraint training_plan_blocks_id_version_id_key unique (id, version_id);

create table public.training_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  school_id uuid not null references public.schools,
  plan_id uuid not null,
  -- The version the assignment runs with. Marks pin it (see the fulfillment keys).
  version_id uuid not null,
  session_date date not null,
  target text not null check (target in ('athlete', 'group', 'category', 'school')),
  athlete_id uuid references public.athletes,
  group_id uuid,
  category_id uuid,
  -- One target column, the one the target names; the school target has none.
  check (
    (target = 'athlete') = (athlete_id is not null)
    and (target = 'group') = (group_id is not null)
    and (target = 'category') = (category_id is not null)
  ),
  unique (id, version_id),
  foreign key (plan_id, school_id) references public.training_plans (id, school_id),
  foreign key (version_id, plan_id) references public.training_plan_versions (id, plan_id),
  foreign key (group_id, school_id) references public.training_groups (id, school_id),
  foreign key (category_id, school_id) references public.categories (id, school_id)
);

-- Status "not marked" is the default. Without a count there is no count: null,
-- never zero. A time is never stored here, so it cannot be stored as zero.
create table public.training_plan_fulfillments (
  id uuid primary key default gen_random_uuid(),
  -- The server's reception time, set by the compute trigger on insert.
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  device_id text not null,
  assignment_id uuid not null,
  version_id uuid not null,
  block_id uuid not null,
  athlete_id uuid not null references public.athletes,
  status text not null default 'not_marked'
    check (status in ('done', 'partial', 'absent', 'not_marked')),
  completed_repetitions int check (completed_repetitions > 0),
  -- For a block that records times: the series whose measurements of this athlete are the times.
  series_id uuid references public.timing_series,
  -- Device time of the mark; a mark after a record_times withdrawal is hidden by it.
  captured_at timestamptz not null,
  -- Computed by the server, never by the client.
  hidden boolean not null default false,
  check ((status = 'partial') = (completed_repetitions is not null)),
  -- A version cannot change under marks, and a block with marks cannot be deleted.
  foreign key (assignment_id, version_id) references public.training_plan_assignments (id, version_id),
  foreign key (block_id, version_id) references public.training_plan_blocks (id, version_id)
);

create index training_plan_assignments_school_id_idx on public.training_plan_assignments (school_id);
create index training_plan_assignments_version_id_idx on public.training_plan_assignments (version_id);
create index training_plan_fulfillments_assignment_id_idx on public.training_plan_fulfillments (assignment_id);
create index training_plan_fulfillments_athlete_id_idx on public.training_plan_fulfillments (athlete_id);
create index training_plan_fulfillments_block_id_idx on public.training_plan_fulfillments (block_id);

alter table public.training_plan_assignments enable row level security;
alter table public.training_plan_fulfillments enable row level security;

-- Supabase grants anon and authenticated everything on new tables: take it back.
-- Fulfillment is append-only: clients insert, never update or delete. No delete on assignments either.
revoke all on table public.training_plan_assignments, public.training_plan_fulfillments from anon, authenticated;
grant select, insert, update on table public.training_plan_assignments to authenticated;
grant select, insert on table public.training_plan_fulfillments to authenticated;

alter publication powersync add table
  public.training_plan_assignments,
  public.training_plan_fulfillments;

-- An athlete target must belong to the school of the assignment. The composite
-- keys cover the group and the category; athlete_schools belongs to athletes,
-- so it is asked through its function (security definer, not executable by clients).
create function public.training_plan_assignments_check_athlete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.athlete_id is not null and not app.athlete_in_school(new.athlete_id, new.school_id) then
    raise exception 'the athlete does not belong to the school of the assignment' using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke execute on function public.training_plan_assignments_check_athlete() from public;

create trigger training_plan_assignments_check_athlete
  before insert or update on public.training_plan_assignments
  for each row execute function public.training_plan_assignments_check_athlete();

-- An assignment keeps its author and date. An update that changes neither
-- passes, as a sync upsert retry does.
create function public.training_plan_assignments_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'the author and date of an assignment cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger training_plan_assignments_frozen
  before update on public.training_plan_assignments
  for each row execute function public.training_plan_assignments_frozen();

-- A mark made after a record_times withdrawal reached the server is kept but
-- hidden, like a measurement (issue #54, see timing_hide_after_withdrawal): the
-- same device-time rule (app.recorded_after_withdrawal), the same advisory lock
-- as the authorization status trigger, so a withdrawal and an upload of the same
-- athlete cannot miss each other, and the same write-back setting, which lets the
-- author run INSERT ... RETURNING on a row that ends hidden (the select policy
-- is checked on it). Only ids this statement really writes go in the setting.
-- created_at is the server reception time, whatever the device sent.
create function public.training_plan_fulfillments_compute_hidden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.athlete_id::text || ':' || 'record_times', 0));
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
  end if;
  new.hidden := coalesce(
    app.recorded_after_withdrawal(new.athlete_id, new.captured_at),
    false
  );
  if new.hidden
     and (tg_op = 'UPDATE' or not exists (select 1 from public.training_plan_fulfillments where id = new.id)) then
    perform set_config(
      'app.hidden_fulfillments',
      coalesce(current_setting('app.hidden_fulfillments', true), '') || new.id::text || ',',
      true
    );
  end if;
  return new;
end;
$$;

create function public.training_plan_fulfillments_forget_hidden()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('app.hidden_fulfillments', '', true);
  return null;
end;
$$;

revoke execute on function
  public.training_plan_fulfillments_compute_hidden(),
  public.training_plan_fulfillments_forget_hidden()
from public;

create trigger training_plan_fulfillments_compute_hidden
  before insert or update on public.training_plan_fulfillments
  for each row execute function public.training_plan_fulfillments_compute_hidden();

create trigger training_plan_fulfillments_forget_hidden
  after insert or update on public.training_plan_fulfillments
  for each statement execute function public.training_plan_fulfillments_forget_hidden();

-- The athlete of a mark must belong to the school of its assignment: the
-- coach policy checks the coach's athletes and schools separately, so an
-- athlete of another school the coach is assigned to could otherwise be marked
-- against this school's assignment. Security definer because app.athlete_in_school
-- is not executable by clients.
create function public.training_plan_fulfillments_check_school()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.athlete_in_school(
    new.athlete_id,
    (select a.school_id from public.training_plan_assignments a where a.id = new.assignment_id)
  ) then
    raise exception 'the athlete does not belong to the school of the assignment' using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke execute on function public.training_plan_fulfillments_check_school() from public;

create trigger training_plan_fulfillments_check_school
  before insert on public.training_plan_fulfillments
  for each row execute function public.training_plan_fulfillments_check_school();

-- A withdrawal can arrive after the marks it covers were uploaded, and a new
-- authorization can re-grant: recompute them retroactively. Rewriting through
-- athlete_id makes the compute trigger recalculate hidden; only rows whose
-- value changes are written, so the others are not synced again.
create function public.training_plan_fulfillments_recompute_hidden(athlete uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Same lock as the compute trigger.
  perform pg_advisory_xact_lock(hashtextextended(training_plan_fulfillments_recompute_hidden.athlete::text || ':' || 'record_times', 0));
  update public.training_plan_fulfillments f
    set athlete_id = f.athlete_id
    where f.athlete_id = training_plan_fulfillments_recompute_hidden.athlete
      and f.hidden is distinct from coalesce(
        app.recorded_after_withdrawal(f.athlete_id, f.captured_at), false);
end;
$$;

-- Takes an athlete id, so it must not be callable through the API.
revoke execute on function public.training_plan_fulfillments_recompute_hidden(uuid)
  from public, anon, authenticated, service_role;

create function public.training_plan_fulfillments_refresh_hidden_after_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.training_plan_fulfillments_recompute_hidden(new.athlete_id);
  return null;
end;
$$;

revoke execute on function public.training_plan_fulfillments_refresh_hidden_after_withdrawal() from public;

-- The WHEN clause is the only direct reference to an accounts table here, the
-- same accepted coupling as timing (issue #54): accounts must not call this module.
create trigger training_plan_fulfillments_refresh_hidden_after_withdrawal
  after insert or update of withdrawn_at on public.authorizations
  for each row
  when (new.purpose = 'record_times')
  execute function public.training_plan_fulfillments_refresh_hidden_after_withdrawal();

-- A mark can end hidden from its own author, so after a re-send whose insert
-- returned no row (ON CONFLICT DO NOTHING) the sync connector cannot read it back
-- to tell a retry from a rejection. Same verdict function as
-- confirm_measurement_insert (issue #206): 'stored', 'changed' or 'absent', never
-- row data, and anyone but the author gets 'absent'. Server-set columns are not compared.
create function public.confirm_training_plan_fulfillment_insert(payload jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  stored jsonb;
  sent jsonb;
begin
  select to_jsonb(f) into stored
  from public.training_plan_fulfillments f
  where f.id = (payload ->> 'id')::uuid
    and f.created_by = (select auth.uid());
  if stored is null then
    return 'absent';
  end if;
  -- Casting through the row type compares values as Postgres types (timestamps, numbers), not as JSON text.
  sent := to_jsonb(jsonb_populate_record(null::public.training_plan_fulfillments, payload));
  if exists (
    select 1
    from jsonb_object_keys(payload - array['id', 'created_at', 'hidden']) as k
    where stored ? k and sent -> k is distinct from stored -> k
  ) then
    return 'changed';
  end if;
  return 'stored';
end;
$$;

-- Supabase grants execute on new functions to anon by default: only signed-in authors may ask.
revoke execute on function public.confirm_training_plan_fulfillment_insert(jsonb) from public, anon;
grant execute on function public.confirm_training_plan_fulfillment_insert(jsonb) to authenticated;

-- Assignments. Staff are the members of the school, as for plans. A guardian or
-- adult athlete reads the assignments that concern their athletes: the athlete
-- itself, its group, its category and the school-wide ones.
create policy training_plan_assignments_select on public.training_plan_assignments for select to authenticated
  using (
    (select app.is_platform_admin())
    or school_id in (select school_id from public.school_memberships where user_id = (select auth.uid()))
    or athlete_id in (select app.managed_athlete_ids())
    or group_id in (select app.managed_group_ids())
    or category_id in (select app.managed_category_ids())
    or (target = 'school' and school_id in (select app.managed_school_ids()))
  );

create policy training_plan_assignments_insert on public.training_plan_assignments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select app.is_platform_admin())
      or school_id in (select school_id from public.school_memberships where user_id = (select auth.uid()))
    )
  );

create policy training_plan_assignments_update on public.training_plan_assignments for update to authenticated
  using (
    (select app.is_platform_admin())
    or school_id in (select school_id from public.school_memberships where user_id = (select auth.uid()))
  )
  with check (
    (select app.is_platform_admin())
    or school_id in (select school_id from public.school_memberships where user_id = (select auth.uid()))
  );

-- Guardians and adult athletes also read the assigned plan, the assigned version
-- (only that one) and its blocks. The subqueries run with the assignment policy,
-- so each is visible only through an assignment the user can read. The blocks
-- policy already follows the visible versions.
create policy training_plans_select_assigned on public.training_plans for select to authenticated
  using (id in (select plan_id from public.training_plan_assignments));

drop policy training_plan_versions_select on public.training_plan_versions;
create policy training_plan_versions_select on public.training_plan_versions for select to authenticated
  using (
    (select app.is_platform_admin())
    or plan_id in (
      select p.id from public.training_plans p
      join public.school_memberships m on m.school_id = p.school_id
      where m.user_id = (select auth.uid())
    )
    or id in (select version_id from public.training_plan_assignments)
  );

-- Fulfillment. The guardian or adult athlete (managed athletes) and the platform
-- admin read everything, hidden marks included. Staff of the athlete (its
-- coaches and its school's admins) read what is not hidden, except that an
-- author can write a row that ends hidden (see the compute trigger). Reading
-- does not depend on the authorization: a withdrawal hides, it deletes nothing.
create policy training_plan_fulfillments_select on public.training_plan_fulfillments for select to authenticated
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or (athlete_id in (select app.visible_athlete_ids()) and not hidden)
    or (
      created_by = (select auth.uid())
      and id::text = any (string_to_array(coalesce(current_setting('app.hidden_fulfillments', true), ''), ','))
    )
  );

-- Only a coach writes marks: of an athlete assigned to them (directly or by
-- group), who has a record_times authorization on the server (an honest device
-- never had a valid state without one; a later withdrawal hides, see above),
-- against an assignment of a school they coach in. School admins and managers
-- read but do not mark.
create policy training_plan_fulfillments_insert on public.training_plan_fulfillments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and athlete_id in (select app.coach_athlete_ids())
    and athlete_id in (select app.athletes_with_authorization('record_times'))
    and assignment_id in (
      select a.id from public.training_plan_assignments a
      join public.school_memberships m on m.school_id = a.school_id
      where m.user_id = (select auth.uid()) and m.role = 'coach'
    )
  );
