-- The sender reads a request only until it is accepted (issue #1014): once accepted, the time and this copy of it are the
-- receiving family's. Rejected, withdrawn and expired requests stay readable: the time is still the sender's ("Sin asignar").
-- Who manages the receiving athlete keeps reading every request. powersync/sync-config.yaml (family_timing_transfers) says the same.
drop policy family_timing_transfers_select on public.family_timing_transfers;
create policy family_timing_transfers_select on public.family_timing_transfers for select to authenticated
  using ((from_user_id = (select auth.uid()) and status <> 'accepted') or app.family_timing_managed_athlete(athlete_id));
