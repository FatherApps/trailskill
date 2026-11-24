-- Module results-import: the pool length a guardian chose for a tournament is kept for it (issue #1482).
-- A tournament read from its PDF may not say its pool length anywhere. The guardian picks 25 m or 50 m when confirming "Is this person?",
-- and `results_import_set_tournament_course` writes that choice into the catalog row, but only where the length is still unknown:
-- a length the platform's title (or an earlier choice) already gave is never replaced, and the same RPC never touches any other column.
-- Returns whether it set a length. Same grants as the rest of the catalog functions: only service_role (the Edge Function) runs it.

create function public.results_import_set_tournament_course(platform uuid, date_key text, course text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if results_import_set_tournament_course.course is null or results_import_set_tournament_course.course not in ('SCM', 'LCM') then
    raise exception 'the pool length must be SCM or LCM' using errcode = '22023';
  end if;

  update public.results_import_tournaments t
    set course = results_import_set_tournament_course.course
    where t.organization_id = results_import_set_tournament_course.platform
      and t.date_key = results_import_set_tournament_course.date_key
      and t.course is null;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

revoke execute on function public.results_import_set_tournament_course(uuid, text, text) from public, anon, authenticated;
grant execute on function public.results_import_set_tournament_course(uuid, text, text) to service_role;
