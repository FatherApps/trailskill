-- Module training-plans: versioning when an assigned plan is edited (issue #74,
-- spec section 6.3).
--
-- The rule: editing an assigned plan creates a new version. Everything recorded
-- stays tied to the version it was recorded against. The new version applies to the
-- sessions (assignments) without marks; a session with marks keeps its version, so
-- one day never mixes the blocks of two versions. Each version keeps its author
-- and date. "Marks" are rows of training_plan_fulfillments, hidden ones included.
--
-- The mechanism, all of it on the server because a coach device only syncs its own
-- assignments and cannot see the rest:
--   1. training_plan_versions.complete: a client writes a version in several
--      uploads (the version, its blocks, then complete = true), so a version is
--      "latest" only once complete. It only goes from false to true. The latest
--      version of a plan is the complete one with the highest number (never by date).
--   2. training_plan_versions.assigned: computed by the server, true once an
--      assignment (withdrawn ones too) points at the version, never back to false.
--      It tells the client whether editing a plan must create a version.
--   3. A version with marks is frozen: its blocks cannot be inserted, changed or
--      deleted (training_plan_blocks_guard_marked_version).
--   4. When a version becomes complete, the sessions of the same plan that are not
--      withdrawn, point at a lower version and have no marks move to it
--      (training_plan_versions_move_sessions).
--   5. A device PATCH of an assignment's version_id never moves a session that has
--      marks or moves any session to an incomplete version
--      (training_plan_assignments_keep_version); and a mark that arrives for another
--      version than its session's either re-pins a session without marks or is
--      refused (training_plan_fulfillments_pin_version).
--   6. The dates of assignments and versions are the server's, also when the sync
--      connector replays an upload as INSERT ... ON CONFLICT DO UPDATE.
--
-- The connector uploads each row on its own and may replay a transaction, so every
-- trigger is idempotent: a replay has no effect and never fails.
--
-- Locking, for the triggers below. (a) READ COMMITTED: a statement that waited for a
-- lock keeps the snapshot it took before waiting, so a mark committed meanwhile is
-- invisible to it. That is why every marks check is its own statement, run AFTER
-- the statement that takes the lock (a new statement takes a new snapshot), and
-- never a subquery of the locking or updating statement. (b) Deadlocks: locks are
-- always taken in the same order, version first, then assignment. A mark takes its
-- version and then its assignment; completing a version holds that version (it was
-- just updated) and then locks the assignments it moves. The guard takes only a
-- version. Nothing takes an assignment and then a version, except the "assigned"
-- update, which touches only the version an assignment is moved to, only while it is
-- not yet assigned (see training_plan_assignments_mark_version_assigned).
--
-- Known limit, out of scope here (conflicts are section 7): two coaches who edit
-- the same plan offline both create version n+1 and collide on unique (plan_id,
-- version). The second upload gets a permanent 23505 and that edit stays in the
-- upload failures of its device.

alter table public.training_plan_versions
  -- Default true: every existing version, and a device of the previous app version
  -- that omits the column, writes a complete version. The new client inserts false.
  add column complete boolean not null default true,
  add column assigned boolean not null default false;

-- The flags and the date of a version belong to the server. This trigger is named so
-- that it runs before training_plan_versions_frozen (BEFORE triggers run in name
-- order: compute_flags, frozen, set_date): a replayed insert (ON CONFLICT DO UPDATE)
-- carries a new date, and the date has to be put back before frozen looks at it.
--   insert: a client cannot create an assigned version.
--   update: complete stays true once true (a replay of the original insert, which
--   says false, has no effect and does not fail); assigned is old.assigned or the
--   existence of an assignment, so a client can never set or clear it; created_at
--   stays. Security definer: it must see assignments hidden by row level security.
create function public.training_plan_versions_compute_flags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.assigned := false;
  else
    new.created_at := old.created_at;
    new.complete := old.complete or new.complete;
    new.assigned := old.assigned
      or exists (select 1 from public.training_plan_assignments a where a.version_id = new.id);
  end if;
  return new;
end;
$$;

revoke execute on function public.training_plan_versions_compute_flags() from public, anon, authenticated;

create trigger training_plan_versions_compute_flags
  before insert or update on public.training_plan_versions
  for each row execute function public.training_plan_versions_compute_flags();

-- An assignment gets its date from the server, and keeps it on update, replays
-- included. Named so that it runs before training_plan_assignments_frozen (order:
-- check_athlete, date_from_server, frozen, guard_withdrawal, keep_version).
create function public.training_plan_assignments_date_from_server()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.training_plan_assignments_date_from_server() from public, anon, authenticated;

create trigger training_plan_assignments_date_from_server
  before insert or update on public.training_plan_assignments
  for each row execute function public.training_plan_assignments_date_from_server();

-- assigned. An assignment that points at a version marks it assigned, withdrawn or
-- not (a withdrawn assignment is still the record of what was assigned). Only the
-- version the assignment points at NOW is touched, never the one it left, and only
-- with UPDATE ... WHERE NOT assigned, which takes no row lock on a version that is
-- already assigned. assigned never goes back to false, so the old version needs no
-- recompute, and touching it would invert the lock order: completing a version holds
-- the new version and then locks the assignment it moves, while a mark of the old
-- version holds that version and then the assignment (version first, then
-- assignment, always). An update of the old version after the assignment is locked
-- would wait for the mark's version lock while the mark waits for the assignment: a
-- deadlock (40P01). On update it fires only when the version changes. Security
-- definer: the caller may be unable to update versions through row level security.
create function public.training_plan_assignments_mark_version_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.training_plan_versions set assigned = true
  where id = new.version_id and not assigned;
  return null;
end;
$$;

revoke execute on function public.training_plan_assignments_mark_version_assigned() from public, anon, authenticated;

create trigger training_plan_assignments_mark_version_assigned_insert
  after insert on public.training_plan_assignments
  for each row execute function public.training_plan_assignments_mark_version_assigned();

create trigger training_plan_assignments_mark_version_assigned_update
  after update of version_id on public.training_plan_assignments
  for each row
  when (new.version_id is distinct from old.version_id)
  execute function public.training_plan_assignments_mark_version_assigned();

-- A version with marks cannot change under them: the guard refuses to insert, change
-- or delete a block whose version (the old and the new one, when a block moves) has a
-- mark, hidden ones included (so security definer). It raises what a failed row
-- level security check raises (42501, same text, nothing else), as the target and
-- series checks do (issue #271). An update that changes nothing passes, as a sync
-- upsert retry does. The version row is locked FOR SHARE in one statement, and only
-- then are the marks looked for in another (see the header, point a): a first mark
-- being inserted holds the version FOR NO KEY UPDATE (training_plan_fulfillments_
-- pin_version), which conflicts with FOR SHARE, so a block edit and a first mark of
-- the same version serialize and one of them sees the other. Named so that it runs
-- after training_plan_blocks_default_equipment, which normalizes equipment: a retry
-- that sends no equipment is then a no-op.
create function public.training_plan_blocks_guard_marked_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  versions uuid[];
  v uuid;
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return new;
  end if;
  if tg_op = 'INSERT' then
    versions := array[new.version_id];
  elsif tg_op = 'DELETE' then
    versions := array[old.version_id];
  else
    -- Lowest id first, so two blocks moving the other way cannot deadlock.
    versions := array[least(old.version_id, new.version_id), greatest(old.version_id, new.version_id)];
  end if;
  foreach v in array versions loop
    perform 1 from public.training_plan_versions where id = v for share;
    perform 1 from public.training_plan_fulfillments where version_id = v limit 1;
    if found then
      raise exception using
        errcode = '42501',
        message = format('new row violates row-level security policy for table "%s"', tg_table_name);
    end if;
  end loop;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.training_plan_blocks_guard_marked_version() from public, anon, authenticated;

create trigger training_plan_blocks_guard_marked_version
  before insert or update or delete on public.training_plan_blocks
  for each row execute function public.training_plan_blocks_guard_marked_version();

-- The new version applies to the sessions without marks. It fires on every
-- transition to complete = true: the update that completes a version, and an insert
-- that arrives complete (a device of the previous app version, or a new plan). For
-- each session of the plan that is not withdrawn and points at a lower version:
-- lock it FOR UPDATE and only then, in another statement, look for marks (header,
-- point a: one UPDATE ... WHERE NOT EXISTS would use the snapshot from before the
-- wait for the lock and miss a mark committed meanwhile, and the foreign key
-- (assignment_id, version_id) of that mark would then fail the whole upload with a
-- permanent 23503). The lock statement repeats the conditions, because once the lock
-- is obtained the row may have changed. This transaction holds the new version, so
-- the order is version, then assignment. Security definer: it sees every
-- assignment of the plan and every mark, whatever the caller can read.
create function public.training_plan_versions_move_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate uuid;
begin
  for candidate in
    select a.id
    from public.training_plan_assignments a
    join public.training_plan_versions v on v.id = a.version_id
    where a.plan_id = new.plan_id and a.withdrawn_at is null and v.version < new.version
    order by a.id
  loop
    perform 1
    from public.training_plan_assignments a
    where a.id = candidate
      and a.withdrawn_at is null
      and a.version_id in (
        select v.id from public.training_plan_versions v
        where v.plan_id = new.plan_id and v.version < new.version
      )
    for update;
    if found then
      perform 1 from public.training_plan_fulfillments f where f.assignment_id = candidate limit 1;
      if not found then
        update public.training_plan_assignments set version_id = new.id where id = candidate;
      end if;
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.training_plan_versions_move_sessions() from public, anon, authenticated;

create trigger training_plan_versions_move_sessions_insert
  after insert on public.training_plan_versions
  for each row
  when (new.complete)
  execute function public.training_plan_versions_move_sessions();

create trigger training_plan_versions_move_sessions_update
  after update of complete on public.training_plan_versions
  for each row
  when (old.complete is false and new.complete)
  execute function public.training_plan_versions_move_sessions();

-- A device PATCH of version_id on an assignment is a request: the version stays when
-- the assignment has marks (it must not mix versions) or when the target version is
-- not complete yet (its blocks may still be arriving). Every other column of the
-- PATCH applies. The assignment row is already locked by the update when this runs;
-- the marks are looked for in a statement of their own (header, point a). Security
-- definer to see hidden marks and versions.
create function public.training_plan_assignments_keep_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  incomplete boolean;
begin
  if new.version_id is distinct from old.version_id then
    select not v.complete into incomplete
    from public.training_plan_versions v where v.id = new.version_id;
    if coalesce(incomplete, false) then
      new.version_id := old.version_id;
    else
      perform 1 from public.training_plan_fulfillments f where f.assignment_id = old.id limit 1;
      if found then
        new.version_id := old.version_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.training_plan_assignments_keep_version() from public, anon, authenticated;

create trigger training_plan_assignments_keep_version
  before update on public.training_plan_assignments
  for each row execute function public.training_plan_assignments_keep_version();

-- A mark names the version it was recorded against. If its session points at
-- another version (the session moved while the device was offline) and has no marks,
-- the session goes back to the mark's version: the stale mark is not lost. If the
-- session already has marks, the mark is refused for good, with the text of a failed
-- row level security check: the day must not mix versions. (A withdrawn session
-- cannot be pinned back, and its mark falls to the foreign key or to the frozen
-- assignment; sessions are withdrawn after they move, so this is a rare limit.)
-- Locks, in the fixed order: the mark's version FOR NO KEY UPDATE (it pairs with the
-- FOR SHARE of the block guard), then the assignment FOR UPDATE, which also reads
-- its version; the marks are looked for in a third statement (header, point a).
-- Marks of one version therefore serialize for the length of their transaction.
-- BEFORE INSERT triggers run in name order: check_school, check_series,
-- compute_hidden, pin_version. This one is last on purpose: it changes an assignment,
-- so it runs only for a mark that already passed the target and series checks (the
-- row level security check that follows can still reject it, and then the whole
-- statement, the re-pin included, is rolled back). Security definer: a coach who may
-- mark may not be allowed to update the assignment.
create function public.training_plan_fulfillments_pin_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_version uuid;
begin
  perform 1 from public.training_plan_versions v where v.id = new.version_id for no key update;
  select a.version_id into session_version
  from public.training_plan_assignments a where a.id = new.assignment_id for update;
  if not found or session_version = new.version_id then
    return new;
  end if;
  perform 1 from public.training_plan_fulfillments f where f.assignment_id = new.assignment_id limit 1;
  if found then
    raise exception using
      errcode = '42501',
      message = format('new row violates row-level security policy for table "%s"', tg_table_name);
  end if;
  update public.training_plan_assignments set version_id = new.version_id where id = new.assignment_id;
  return new;
end;
$$;

revoke execute on function public.training_plan_fulfillments_pin_version() from public, anon, authenticated;

create trigger training_plan_fulfillments_pin_version
  before insert on public.training_plan_fulfillments
  for each row execute function public.training_plan_fulfillments_pin_version();
