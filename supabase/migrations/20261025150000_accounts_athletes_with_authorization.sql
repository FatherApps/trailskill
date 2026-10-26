-- Module accounts: which athletes have any authorization of a purpose on the
-- server, withdrawn or not (issue #70). Other modules ask it instead of reading
-- authorizations. A coach's device records only with an authorization state it
-- synced, so an athlete with no authorization at all on the server was never
-- recordable; a withdrawal is handled later by hiding (app.recorded_after_withdrawal).
-- Only athletes the caller can already see are answered, so it cannot be used
-- to probe other athletes.
create function app.athletes_with_authorization(purpose text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct a.athlete_id
  from public.authorizations a
  where a.purpose = athletes_with_authorization.purpose
    and a.athlete_id in (select app.visible_athlete_ids());
$$;

revoke execute on function app.athletes_with_authorization(text) from public, anon;
grant execute on function app.athletes_with_authorization(text) to authenticated;
