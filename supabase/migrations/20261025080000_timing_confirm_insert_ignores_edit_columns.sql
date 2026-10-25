-- Module: timing. Issue #55 (client side).
-- A measurement can now be edited (issue #55), so a retried insert requeued from
-- the device carries the whole current row, including the version columns the
-- server owns: version, base_version, edited_by, edited_at, edited_device_id and
-- edit_reason. Like created_at and hidden, they are not compared, or a re-sent
-- insert of an edited row would be answered 'changed'. Same function as issue
-- #206 otherwise: signature, security definer, search_path and grants unchanged.
create or replace function public.confirm_measurement_insert(payload jsonb)
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
    from jsonb_object_keys(payload - array[
      'id', 'created_at', 'hidden',
      'version', 'base_version', 'edited_by', 'edited_at', 'edited_device_id', 'edit_reason'
    ]) as k
    where stored ? k and sent -> k is distinct from stored -> k
  ) then
    return 'changed';
  end if;
  return 'stored';
end;
$$;
