-- Module results-import: a pool length already saved for a tournament is kept (issue #1481).
-- The catalog now reads two pages of the platform: the calendar, whose title sometimes says the pool length, and the index, which never does.
-- A refresh that reads a day from the index alone would send `course` null and, with the plain upsert, erase a length an earlier read saved.
-- `results_import_save_tournaments` now keeps the stored length when it has one (`coalesce(t.course, excluded.course)`) and fills a missing one.
-- Every other column is updated exactly as before. Same signature, so the grants stay (only service_role runs it); no table or data changes.

create or replace function public.results_import_save_tournaments(organization uuid, rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved integer;
begin
  if results_import_save_tournaments.rows is null or jsonb_typeof(results_import_save_tournaments.rows) <> 'array' then
    raise exception 'the tournaments must be a list' using errcode = '22023';
  end if;

  insert into public.results_import_tournaments as t (organization_id, year, date_key, name, city, discipline, course, source_url, refreshed_at)
  select distinct on (r.date_key)
    results_import_save_tournaments.organization, r.year, r.date_key, r.name, r.city, r.discipline, r.course, r.source_url, clock_timestamp()
  from rows from (
    jsonb_to_recordset(results_import_save_tournaments.rows)
      as (year integer, date_key text, name text, city text, discipline text, course text, source_url text)
  ) with ordinality as r(year, date_key, name, city, discipline, course, source_url, position)
  order by r.date_key, r.position
  on conflict (organization_id, date_key) do update
    set year = excluded.year,
        name = excluded.name,
        city = excluded.city,
        discipline = excluded.discipline,
        course = coalesce(t.course, excluded.course),
        source_url = excluded.source_url,
        refreshed_at = excluded.refreshed_at;
  get diagnostics saved = row_count;
  return saved;
end;
$$;
