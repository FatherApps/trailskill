-- Module: athletes. Issue #1369 (follow-up of 20261121190000_athletes_health.sql, already in main). Three changes: the ranges, the
-- allergies check and the insert-versus-withdrawal race (below).
--
-- The maintainer chose stricter ranges made for swimmers (2026-11-21): weight 10 to 200 kg and height 80 to 230 cm, both with at most
-- one decimal. The first migration used numeric(5, 2) and numeric(4, 1) with wider ranges; a numeric(p, 1) column would round 10.05
-- silently instead of refusing it, so both columns become plain numeric and the one-decimal rule is a check (value = round(value, 1)).
--
-- Fail closed: if a row already holds a value outside the new rules, the migration stops with a clear message instead of changing or
-- deleting health data. Nothing in the app writes this table yet (the screens come with task 4.4), so no row is expected.

do $$
declare
  outside integer;
begin
  select count(*) into outside
  from public.athlete_health h
  where (h.weight_kg is not null and (h.weight_kg not between 10 and 200 or h.weight_kg <> round(h.weight_kg, 1)))
     or (h.height_cm is not null and (h.height_cm not between 80 and 230 or h.height_cm <> round(h.height_cm, 1)))
     or (h.allergies is not null and char_length(btrim(h.allergies)) not between 1 and 500);
  if outside > 0 then
    raise exception 'athlete_health has % row(s) outside the new rules (weight 10-200 kg, height 80-230 cm, one decimal, allergies not blank): review them before migrating', outside
      using errcode = '23514';
  end if;
end;
$$;

alter table public.athlete_health
  drop constraint athlete_health_weight_kg_range,
  drop constraint athlete_health_height_cm_range,
  alter column weight_kg type numeric,
  alter column height_cm type numeric,
  add constraint athlete_health_weight_kg_range check (weight_kg between 10 and 200 and weight_kg = round(weight_kg, 1)),
  add constraint athlete_health_height_cm_range check (height_cm between 80 and 230 and height_cm = round(height_cm, 1));

-- Allergies made only of spaces are not a value: the check looks at the trimmed text (the app stores null for no allergies).
alter table public.athlete_health
  drop constraint athlete_health_allergies_length,
  add constraint athlete_health_allergies_length check (char_length(btrim(allergies)) between 1 and 500);

-- Insert versus withdrawal: the insert policy reads store_health_data from its own snapshot, so an insert that starts while the
-- withdrawal is still open could commit after the purge and leave a row behind. A row lock FOR SHARE on the status row makes the insert
-- wait for the withdrawal (which updates that row) and look again: once the withdrawal commits, the status is no longer granted and the
-- insert is refused. A withdrawal that arrives after the insert waits for the share lock and then purges the new row. Only inserts need
-- it: an update of a row the purge already deleted changes nothing. The function runs as its owner to be able to lock the status row.
create or replace function public.athlete_health_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform 1 from public.authorization_status s
    where s.athlete_id = new.athlete_id and s.purpose = 'store_health_data' and s.is_granted
    for share;
    if not found then
      raise exception 'store_health_data is not in force for the athlete' using errcode = '42501';
    end if;
  elsif new.athlete_id is distinct from old.athlete_id then
    raise exception 'athlete health row keeps its athlete' using errcode = '42501';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
