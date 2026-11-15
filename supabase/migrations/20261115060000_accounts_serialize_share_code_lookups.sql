-- Module accounts: one share code lookup at a time per user (issue #1027). The lookup counted the user's failed attempts of
-- the last 15 minutes and recorded the new one afterwards, without a lock, so lookups of the same user that overlapped all
-- saw the same count and all passed: the limit of 5 failed lookups in 15 minutes could be bypassed in parallel. The
-- advisory lock makes counting and recording one critical section per user, released at the end of the transaction;
-- another user takes another key and is not blocked. Nothing else changes.

create or replace function app.athlete_by_share_code(share_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  body text := upper(regexp_replace(coalesce(share_code, ''), '[^A-Za-z0-9]', '', 'g'));
  athlete uuid;
begin
  if caller is null then
    raise exception 'a share code lookup needs a signed-in user' using errcode = '42501';
  end if;

  -- One lookup at a time per user: counting and recording the attempt must not interleave with another lookup of theirs.
  perform pg_advisory_xact_lock(hashtextextended(caller::text || ':share-code-lookups', 0));

  delete from public.athlete_share_code_lookups where user_id = caller and looked_up_at < now() - interval '1 day';
  if (
    select count(*) from public.athlete_share_code_lookups
    where user_id = caller and not matched and looked_up_at > now() - interval '15 minutes'
  ) >= 5 then
    raise exception 'too_many_attempts' using errcode = 'P0001', hint = 'Try again in 15 minutes.';
  end if;

  if length(body) = 8 and left(body, 2) = 'TS' then
    body := substr(body, 3);
  end if;
  select c.athlete_id into athlete from public.athlete_share_codes c where c.code = 'TS-' || body;

  insert into public.athlete_share_code_lookups (user_id, matched) values (caller, athlete is not null);
  return athlete;
end;
$$;

revoke execute on function app.athlete_by_share_code(text) from public, anon, authenticated;
