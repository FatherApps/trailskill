-- Module athletes: the owner opens a swimmer's marks of other schools to one school (issue #1446). Rule confirmed by the maintainer
-- (2026-11-22): "Puede estar en las dos pero los datos de A los ve A y B los ve B y el usuario puede ver los dos.", "pero tambien el
-- nadador puede aprobar compartir los datos a la escuela", "osea si el nadador quiere puede abrir sus datos a las dos escuelas".
--
-- Until now school C read the marks school A recorded only through the pair of #68 (public.school_result_sharing, approved by the ADMIN
-- of A) or through the history of a transfer (#1419). This adds the owner's way: the guardian or the adult swimmer (a row of
-- athlete_managers) opens the swimmer's marks to ONE target school with public.grant_athlete_result_sharing and withdraws it with
-- public.revoke_athlete_result_sharing. The path is one more OR in public.other_school_results; the pair of #68 and the history of #1419
-- work as they did. Reading through it needs, all at once:
--   * a row of athlete_result_sharing in force (revoked_at is null) for (swimmer, the school of the reader): the owner's choice of school;
--   * the swimmer ACTIVE (ended_at is null) in the school that recorded the marks and in the school of the reader;
--   * the family's share_results_with_school authorization in force (v1 text: "Permite que otra escuela en la que también esté inscrito
--     el deportista vea sus tiempos y resultados. Si no la activas, solo los ve tu escuela."), the same one the pair of #68 needs: no
--     new purpose, no new text version;
--   * the reader is an admin of the target school, or a coach of it with the swimmer (app.coach_has_athlete_in_school);
--   * the mark is not hidden, not discarded and not a split; read only, the same fixed columns as before.
-- Without a row nothing opens: two schools of an active swimmer keep reading only their own marks (#1419).
--
-- The table is written only by the two functions (no client privilege on it; RLS lets the owner read the rows of their swimmers). A
-- withdrawal keeps the row with revoked_at/revoked_by, and a new grant after a withdrawal makes a new row, so the history stays. The
-- user columns (granted_by, revoked_by) have a foreign key to auth.users with on delete set null: erase_account removes the user and the
-- columns empty themselves; that is why the check forbids revoked_by without revoked_at but allows revoked_at without revoked_by (the
-- trap of #1434). Erasing the family deletes the authorization, so nothing is read through a row that is left behind, and a swimmer that
-- is deleted takes the rows with it (on delete cascade).
--
-- If a flow that reopens an ended link is ever added, it must close the owner's open grants for that school (no flow reopens a link today:
-- athlete_schools has one row per (swimmer, school) and the baja has no reactivation), or the old row would give C access again.
--
-- Revert: recreate public.other_school_results as in 20261122210000, drop app.owner_result_sharing_in_force, the two functions
-- public.grant_athlete_result_sharing and public.revoke_athlete_result_sharing, then alter publication powersync drop table
-- public.athlete_result_sharing and drop the table. Nothing else depends on them.

create table public.athlete_result_sharing (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes on delete cascade,
  target_school_id uuid not null references public.schools,
  granted_by uuid references auth.users on delete set null,
  granted_at timestamptz not null default now(),
  revoked_by uuid references auth.users on delete set null,
  revoked_at timestamptz,
  constraint athlete_result_sharing_revoked_by_needs_revoked_at check (revoked_by is null or revoked_at is not null)
);

-- One row in force per (swimmer, school): a repeated grant finds it, a grant after a withdrawal makes a new row.
create unique index athlete_result_sharing_in_force_key
  on public.athlete_result_sharing (athlete_id, target_school_id) where revoked_at is null;

alter table public.athlete_result_sharing enable row level security;
revoke all on table public.athlete_result_sharing from public, anon, authenticated;
grant select on table public.athlete_result_sharing to authenticated;

-- The owner (a row of athlete_managers: guardian or the adult swimmer) reads the rows of their swimmers, nobody else. No write policy.
create policy athlete_result_sharing_select on public.athlete_result_sharing for select to authenticated
  using (athlete_id in (select app.managed_athlete_ids()));

-- A new table of the public schema takes the write guard of a marked account (a database test fails otherwise, #1244).
select app.guard_marked_account_writes('public.athlete_result_sharing'::regclass);

-- Only the rows in force reach the owner's device: a withdrawn row leaves the stream and the device drops it.
alter publication powersync add table public.athlete_result_sharing;

-- The owner's path of other_school_results: the row of the owner for the reader's school, the swimmer active in both schools and the
-- family's authorization in force. Not executable by clients: only other_school_results (security definer) calls it.
create function app.owner_result_sharing_in_force(source_school uuid, target_school uuid, athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.athlete_result_sharing r
      where r.athlete_id = owner_result_sharing_in_force.athlete
        and r.target_school_id = owner_result_sharing_in_force.target_school
        and r.revoked_at is null
    )
    and exists (
      select 1 from public.athlete_schools a
      where a.athlete_id = owner_result_sharing_in_force.athlete
        and a.school_id = owner_result_sharing_in_force.source_school
        and a.ended_at is null
    )
    and exists (
      select 1 from public.athlete_schools b
      where b.athlete_id = owner_result_sharing_in_force.athlete
        and b.school_id = owner_result_sharing_in_force.target_school
        and b.ended_at is null
    )
    and app.authorization_in_force_at(owner_result_sharing_in_force.athlete, 'share_results_with_school', 'infinity', 'infinity');
$$;

revoke execute on function app.owner_result_sharing_in_force(uuid, uuid, uuid) from public, anon, authenticated;

-- The owner opens the swimmer's marks to a school where the swimmer is active. It returns the id of the row in force: a repeated call
-- finds it and creates nothing.
create function public.grant_athlete_result_sharing(athlete uuid, school uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid;
begin
  if not exists (select 1 from app.managed_athlete_ids() m where m = grant_athlete_result_sharing.athlete) then
    raise exception 'only the guardian or the adult swimmer can share the results' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.athlete_schools s
    where s.athlete_id = grant_athlete_result_sharing.athlete
      and s.school_id = grant_athlete_result_sharing.school
      and s.ended_at is null
  ) then
    raise exception 'the swimmer is not active in that school' using errcode = '22023';
  end if;

  insert into public.athlete_result_sharing (athlete_id, target_school_id, granted_by)
  values (grant_athlete_result_sharing.athlete, grant_athlete_result_sharing.school, (select auth.uid()))
  on conflict (athlete_id, target_school_id) where revoked_at is null do nothing
  returning id into row_id;

  if row_id is null then
    select r.id into row_id from public.athlete_result_sharing r
    where r.athlete_id = grant_athlete_result_sharing.athlete
      and r.target_school_id = grant_athlete_result_sharing.school
      and r.revoked_at is null;
  end if;
  return row_id;
end;
$$;

-- The owner withdraws it. It returns how many rows it closed (0 when nothing was in force); the row stays with who and when.
create function public.revoke_athlete_result_sharing(athlete uuid, school uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
begin
  if not exists (select 1 from app.managed_athlete_ids() m where m = revoke_athlete_result_sharing.athlete) then
    raise exception 'only the guardian or the adult swimmer can withdraw the sharing' using errcode = '42501';
  end if;

  update public.athlete_result_sharing r
  set revoked_at = now(), revoked_by = (select auth.uid())
  where r.athlete_id = revoke_athlete_result_sharing.athlete
    and r.target_school_id = revoke_athlete_result_sharing.school
    and r.revoked_at is null;
  get diagnostics closed = row_count;
  return closed;
end;
$$;

revoke execute on function public.grant_athlete_result_sharing(uuid, uuid), public.revoke_athlete_result_sharing(uuid, uuid)
  from public, anon;
grant execute on function public.grant_athlete_result_sharing(uuid, uuid), public.revoke_athlete_result_sharing(uuid, uuid)
  to authenticated;

-- Same body as 20261122210000 (#1419), plus one OR: the owner's path.
create or replace function public.other_school_results(athlete uuid)
returns table (
  id uuid, kind text, hundredths int, stroke text, distance text, pool text,
  session_type text, captured_at timestamptz, arrival_position int
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.kind, m.hundredths, m.stroke, m.distance, m.pool,
         m.session_type, m.captured_at, m.arrival_position
  from public.measurements m
  where m.athlete_id = other_school_results.athlete
    and not m.hidden
    and m.discarded_at is null
    and m.kind <> 'split'
    and exists (
      select 1 from public.school_memberships sm
      where sm.user_id = (select auth.uid())
        and sm.school_id <> m.school_id
        and (sm.role = 'school_admin'
             or (sm.role = 'coach' and app.coach_has_athlete_in_school(other_school_results.athlete, sm.school_id)))
        and (
          app.result_sharing_in_force(m.school_id, sm.school_id, other_school_results.athlete)
          or app.school_transfer_in_force(m.school_id, sm.school_id, other_school_results.athlete)
          or app.owner_result_sharing_in_force(m.school_id, sm.school_id, other_school_results.athlete)
        )
    )
  order by m.captured_at desc, m.id desc;
$$;
