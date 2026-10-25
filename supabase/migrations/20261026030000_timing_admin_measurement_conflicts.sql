-- Module: timing. Issue #316.
-- School admins read the edit conflicts of their school's measurements, so the
-- school console can flag "Revisar". Until now only the platform admin and the
-- two authors of a conflict could read it. Provisional pending maintainer
-- confirmation; resolving a conflict is a later issue (#56).

-- A new branch is added to the policy; the other two are unchanged. Only the
-- school_admin role counts (app.admin_school_ids, never app.staff_school_ids),
-- and the school is the one of the measurement (measurements.school_id).
-- The subquery runs under the admin's own measurements policy, so a measurement
-- hidden after a withdrawal (issue #54) or one of an athlete outside the
-- school keeps its conflict hidden too.
--
-- No column grants: they would break the platform admin read of #56. Through
-- REST the admin can read current_values and incoming_values; they are versions
-- of a measurement of their own school, which they can already read. The sync
-- stream carries only the status.
drop policy measurement_conflicts_select on public.measurement_conflicts;
create policy measurement_conflicts_select on public.measurement_conflicts for select to authenticated
  using (
    (select app.is_platform_admin())
    or (
      (current_by = (select auth.uid()) or incoming_by = (select auth.uid()))
      and measurement_id in (select id from public.measurements)
    )
    or measurement_id in (
      select id from public.measurements where school_id in (select app.admin_school_ids())
    )
  );
