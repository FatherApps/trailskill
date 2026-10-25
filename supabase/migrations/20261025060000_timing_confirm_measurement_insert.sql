-- Module: timing. Issue #206.
-- A measurement can end hidden from its own author (#54), so after a re-send whose
-- insert returned no row (ON CONFLICT DO NOTHING) the sync connector cannot read it
-- back to tell a retry from a rejection. This function answers only a verdict:
-- 'stored' (the caller's row with these values exists), 'changed' (the caller's row
-- exists with other values) or 'absent'. It never returns row data, and anyone but
-- the author gets 'absent', the same answer as for an id that does not exist, so it
-- cannot be used to learn whether a row exists. Only the keys sent are compared, in
-- their column types; server-set columns (created_at, hidden) are ignored.
create function public.confirm_measurement_insert(payload jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  stored jsonb;
  sent jsonb;
begin
  select to_jsonb(m) into stored
  from public.measurements m
  where m.id = (payload ->> 'id')::uuid
    and m.created_by = (select auth.uid());
  if stored is null then
    return 'absent';
  end if;
  -- Casting through the row type compares values as Postgres types (timestamps, numbers), not as JSON text.
  sent := to_jsonb(jsonb_populate_record(null::public.measurements, payload));
  if exists (
    select 1
    from jsonb_object_keys(payload - array['id', 'created_at', 'hidden']) as k
    where stored ? k and sent -> k is distinct from stored -> k
  ) then
    return 'changed';
  end if;
  return 'stored';
end;
$$;

-- Supabase grants execute on new functions to anon by default: only signed-in authors may ask.
revoke execute on function public.confirm_measurement_insert(jsonb) from public, anon;
grant execute on function public.confirm_measurement_insert(jsonb) to authenticated;
