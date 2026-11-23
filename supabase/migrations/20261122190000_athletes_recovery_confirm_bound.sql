-- Issue #1417: the owner confirms the set they saved, and the confirmation names it. confirm_athlete_recovery_codes(athlete) marks
-- whatever set is current as confirmed, so a confirmation that arrives late (the phone was offline, or a second phone asked for the codes
-- in between) could confirm a set the person never saw while the one they saved was already replaced. The new overload takes the
-- permanent code the person saved and confirms only when it is still the current one; otherwise it raises 'recovery_set_superseded'.
-- The permanent code and the recovery codes are always replaced together, so the permanent code identifies the whole set. The server
-- only compares hashes (app.athlete_recovery_code_hash) and stores nothing new. The one-argument function stays for old app versions.
create function public.confirm_athlete_recovery_codes(athlete uuid, main_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_hash text;
begin
  perform app.athlete_recovery_caller_manages(athlete);
  perform pg_advisory_xact_lock(hashtextextended(athlete::text || ':athlete-recovery-codes', 0));
  select i.code_hash into current_hash from public.athlete_recovery_identities i where i.athlete_id = athlete;
  if not found then
    raise exception 'no_recovery_identity' using errcode = 'P0001';
  end if;
  if current_hash is distinct from app.athlete_recovery_code_hash(main_code) then
    raise exception 'recovery_set_superseded' using errcode = 'P0001';
  end if;
  update public.athlete_recovery_identities i set confirmed_at = coalesce(i.confirmed_at, now()) where i.athlete_id = athlete;
end;
$$;

revoke execute on function public.confirm_athlete_recovery_codes(uuid, text) from public, anon;
grant execute on function public.confirm_athlete_recovery_codes(uuid, text) to authenticated;
