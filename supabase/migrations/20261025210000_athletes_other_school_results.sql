-- Module: athletes. Issue #68.
-- School B reads, online only, the results school A recorded for an athlete of
-- both schools. Nothing of it is synced: no stream in powersync/sync-config.yaml.
-- A result is "of A" when measurements.school_id = A (#291). A row reaches the
-- caller only when:
--   * the caller is staff of a school B other than A, and that same membership
--     of B is the one A approved: B's school_admin, or a coach of B whom
--     app.coach_athlete_ids assigns to the athlete. app.coach_athlete_ids does
--     not filter by school (coach_athlete_assignments has no school), so a coach
--     of B assigned to the athlete through another school still counts as
--     assigned. An admin role in another school never counts;
--   * app.result_sharing_in_force(A, B, athlete) holds (#268): A's admin approved
--     B and did not withdraw, the athlete is in both schools and its
--     'share_results_with_school' authorization is in force now;
--   * the measurement is not hidden (record_times withdrawn, #54), not
--     discarded (discarded_at, #50/#52, as every local read) and not a split.
-- Any other caller gets no rows, never an error, so the answer reveals nothing
-- about other schools. Only result columns are returned: no names, school ids,
-- authors, devices, birth dates or documents.
create function public.other_school_results(athlete uuid)
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
             or (sm.role = 'coach' and other_school_results.athlete in (select app.coach_athlete_ids())))
        and app.result_sharing_in_force(m.school_id, sm.school_id, other_school_results.athlete)
    )
  order by m.captured_at desc, m.id desc;
$$;

revoke execute on function public.other_school_results(uuid) from public, anon;
grant execute on function public.other_school_results(uuid) to authenticated;
