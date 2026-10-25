-- Module: timing. Issue #129.
-- Tightens measurement writes: an update may only complete an unassigned
-- arrival (athlete_id), and a measurement goes only into the author's own series.
-- A trigger enforces the update rule, not a column grant: the sync connector
-- uploads with upsert, which needs UPDATE on every column even for a new row.

-- Update only completes an unassigned arrival, so only athlete_id may change.
-- Editing other columns arrives with issue scope 3.9a.
create function public.measurements_only_athlete_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'athlete_id') is distinct from (to_jsonb(old) - 'athlete_id') then
    raise exception 'only athlete_id can change on a measurement' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger measurements_only_athlete_changes
  before update on public.measurements
  for each row execute function public.measurements_only_athlete_changes();

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
