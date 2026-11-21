-- Module family-timing: accepting a time keeps its share code for the sender (issue #1302), so their next send to that
-- swimmer can pick it instead of asking for it again. Only an accepted send keeps it, and only while the code is the one
-- the sender used (app.save_athlete_share_code, module accounts).

-- The swimmer's guardian takes the time: it is theirs now, for that swimmer, and leaves the sender. The sender keeps the code.
create or replace function public.accept_family_time(transfer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.family_timing_transfers := app.family_timing_open_transfer(transfer, false);
begin
  update public.family_timing_transfers set status = 'accepted', decided_at = now(), decided_by = (select auth.uid()) where id = t.id;
  update public.family_timing_measurements
  set owner_user_id = (select auth.uid()), athlete_id = t.athlete_id
  where id = t.measurement_id;
  perform app.save_athlete_share_code(t.from_user_id, t.athlete_id, t.created_at);
end;
$$;

-- create or replace keeps the grants: authenticated only, never anon.
