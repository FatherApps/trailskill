-- Module: timing. Issue #129.
-- Tightens measurement writes: an update may only complete an unassigned
-- arrival (athlete_id), and a measurement goes only into the author's own series.

-- Supabase default privileges grant every table privilege, so the table-level
-- update must be revoked before a column grant narrows it.
revoke update on table public.measurements from authenticated;
-- Update only completes an unassigned arrival; editing other columns arrives with issue scope 3.9a.
grant update (athlete_id) on table public.measurements to authenticated;

drop policy measurements_insert on public.measurements;
create policy measurements_insert on public.measurements for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (
        athlete_id in (select app.coach_athlete_ids())
        and (
          series_id is null
          or series_id in (select id from public.timing_series where created_by = (select auth.uid()))
        )
      )
      or (
        athlete_id is null
        and series_id in (select id from public.timing_series where created_by = (select auth.uid()))
      )
    )
  );
