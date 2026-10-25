-- Module: timing. Issue #52.
-- Unticking "Completado" discards the completed measurement instead of deleting
-- it (the same logical discard as "Deshacer última", issue #50): the row stays
-- with who discarded it and when, and every client read leaves it out. Ticking
-- again writes a new completed measurement. Provisional pending maintainer
-- confirmation of the data model.
--
-- measurements_check_discard only let the author discard an unassigned arrival
-- of a series, so a completed measurement (it has its athlete and, as an
-- individual record, no series) was refused with 42501: a permanent upload
-- failure on the device. The rule now also lets the author discard, once, a
-- measurement of kind 'completed'. Everything else is unchanged: nobody else
-- discards, a discard is never cleared, repeated with another time or changed,
-- it changes no time and no athlete, a discarded measurement never changes
-- afterwards, an assigned time is still never discarded, and there is still no
-- delete policy. The update policy and the column rule are not touched.

create or replace function public.measurements_check_discard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.discarded_at is null and new.discarded_by is null then
      return new;
    end if;
  elsif old.discarded_at is not null
        and (new.hundredths is distinct from old.hundredths or new.athlete_id is distinct from old.athlete_id) then
    raise exception 'a discarded measurement cannot change' using errcode = '42501';
  elsif new.discarded_at is not distinct from old.discarded_at and new.discarded_by is not distinct from old.discarded_by then
    -- Not a discard, or the retry of one already stored.
    return new;
  elsif old.discarded_at is not null then
    raise exception 'a discarded measurement cannot be restored or discarded again' using errcode = '42501';
  elsif new.hundredths is distinct from old.hundredths or new.athlete_id is distinct from old.athlete_id then
    -- Kept apart from edits, so a discard never goes through the conflict check of #55.
    raise exception 'a discard cannot change anything else' using errcode = '42501';
  end if;
  -- The author discards an unassigned arrival of a series, or a completed measurement (#52).
  if new.discarded_by is distinct from auth.uid()
     or new.created_by is distinct from auth.uid()
     or not (new.kind = 'completed' or (new.athlete_id is null and new.series_id is not null)) then
    raise exception 'only the author can discard an unassigned arrival of a series' using errcode = '42501';
  end if;
  return new;
end;
$$;
