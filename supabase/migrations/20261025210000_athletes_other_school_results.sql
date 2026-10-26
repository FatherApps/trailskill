-- Module: athletes. Issue #68.
-- public.other_school_results(athlete) returns the athlete's measurements whose
-- school_id is a school A different from a school B of the caller, when:
--   * the caller is B's school_admin, or a coach of B with the athlete in
--     app.coach_athlete_ids() (that function does not filter by school, #300);
--   * app.result_sharing_in_force(A, B, athlete) is true;
--   * the measurement is not hidden, not discarded and not a split.
-- Otherwise it returns no rows. It returns only the listed result columns.
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
