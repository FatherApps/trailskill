-- Module: timing (also covers training-plans marks). Issue #324. Since #272 an UPDATE that
-- reached an already hidden row registered a write-back. The author's UPDATE policy reaches
-- their hidden rows, so one statement could update them in a CTE and read them back in
-- another. The write-back is now registered on UPDATE only when the row was not hidden
-- before (it just became hidden); INSERT keeps the check for an id that is not stored yet.
-- Both functions are otherwise unchanged from 20261026040000.

create or replace function public.measurements_compute_hidden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  write_back boolean := false;
begin
  if new.athlete_id is not null then
    -- Same key as public.authorizations_refresh_status. Taken before hidden is computed,
    -- so the lookup below sees any withdrawal committed while this waited.
    perform pg_advisory_xact_lock(hashtextextended(new.athlete_id::text || ':' || 'record_times', 0));
  end if;
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
  end if;
  new.hidden := coalesce(
    app.recorded_after_withdrawal(new.athlete_id, new.captured_at),
    false
  );
  if new.hidden then
    if tg_op = 'INSERT' then
      write_back := not exists (select 1 from public.measurements where id = new.id);
    else
      write_back := not old.hidden;
    end if;
  end if;
  if write_back then
    insert into app.hidden_measurement_write_backs (record_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.training_plan_fulfillments_compute_hidden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  write_back boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.athlete_id::text || ':' || 'record_times', 0));
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
  end if;
  new.hidden := coalesce(
    app.recorded_after_withdrawal(new.athlete_id, new.captured_at),
    false
  );
  if new.hidden then
    if tg_op = 'INSERT' then
      write_back := not exists (select 1 from public.training_plan_fulfillments where id = new.id);
    else
      write_back := not old.hidden;
    end if;
  end if;
  if write_back then
    insert into app.hidden_fulfillment_write_backs (record_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
