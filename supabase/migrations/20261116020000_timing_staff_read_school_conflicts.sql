-- Module: timing. Issue #1109.
-- Active coaches read the edit conflicts of their school's measurements that they can already read, as school
-- admins have since #316, so the review screen (#1110) can list them. Reading only: resolving stays with the
-- platform admin (resolve_measurement_conflict, measurement_conflict_resolutions are unchanged).
--
-- The third branch moves from app.admin_school_ids() to app.staff_school_ids(): school admins plus coaches whose
-- membership is not deactivated (20261115090000), so a deactivated coach reads nothing new. The subquery still runs
-- under the reader's own measurements_select policy, so a coach sees only conflicts of measurements they can read
-- (their athletes, their own series), never a hidden one or one of another school. The other two branches are
-- unchanged. powersync/sync-config.yaml does not change: the review screen reads conflicts online; the stream
-- keeps carrying only the statuses it carried before.
-- Revert: recreate the policy from 20261026030000_timing_admin_measurement_conflicts.sql.
drop policy measurement_conflicts_select on public.measurement_conflicts;
create policy measurement_conflicts_select on public.measurement_conflicts for select to authenticated
  using (
    (select app.is_platform_admin())
    or (
      (current_by = (select auth.uid()) or incoming_by = (select auth.uid()))
      and measurement_id in (select id from public.measurements)
    )
    or measurement_id in (
      select id from public.measurements where school_id in (select app.staff_school_ids())
    )
  );
