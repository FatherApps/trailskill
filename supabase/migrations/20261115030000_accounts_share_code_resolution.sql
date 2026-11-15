-- Module accounts: the swimmer behind a share code, for other modules' server functions (issue #973). Family-timing sends
-- a time with a code: it needs the swimmer itself, which the app never gets (find_athlete_by_share_code returns only the
-- short name). Both go through the same lookup, so the limit of failed attempts (#972) counts them together.

-- The swimmer with that code, or null, counting the lookup for the caller. Raises too_many_attempts after 5 failed
-- lookups in 15 minutes. Not callable by the app roles: only other security definer functions use it.
create function app.athlete_by_share_code(share_code text)
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

-- The short name ("Ana M.") of a swimmer, the only thing another family sees of them.
create function app.athlete_short_name(athlete uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(btrim(a.first_name), ' ', 1) || ' ' || upper(left(btrim(a.last_name), 1)) || '.'
  from public.athletes a where a.id = athlete;
$$;

revoke execute on function app.athlete_short_name(uuid) from public, anon, authenticated;

-- Same behavior as in #972, now on the shared lookup.
create or replace function public.find_athlete_by_share_code(share_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  athlete uuid := app.athlete_by_share_code(share_code);
begin
  return case when athlete is null then null else app.athlete_short_name(athlete) end;
end;
$$;
