-- Module accounts: a short code per swimmer, so another guardian can share their times with them (issue #972).
-- The code (for example TS-7K4Q2M) is shown on the swimmer's profile to who manages them, and can be changed: the old one
-- then stops working (decision 1). Looking a code up gives only the swimmer's short name, "Ana M.", and is limited to a few
-- failed attempts in a while (decision 2). Sharing the code and accepting the request is the consent (decision 4; the
-- request is #973). Nobody reads these tables directly: only the functions below, which check who calls.

create table public.athlete_share_codes (
  athlete_id uuid primary key references public.athletes on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users on delete set null,
  -- "TS-" and 6 characters without the ones that read alike (0 O 1 I L).
  code text not null unique check (code ~ '^TS-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$')
);

-- One row per lookup, to limit the failed ones; kept for a day.
create table public.athlete_share_code_lookups (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  looked_up_at timestamptz not null default now(),
  matched boolean not null
);

create index athlete_share_code_lookups_user_idx on public.athlete_share_code_lookups (user_id, looked_up_at);

alter table public.athlete_share_codes enable row level security;
alter table public.athlete_share_code_lookups enable row level security;
-- The default privileges grant every new table to anon and authenticated: here nobody keeps any.
revoke all on table public.athlete_share_codes, public.athlete_share_code_lookups from anon, authenticated;

-- A new random code. gen_random_uuid() is random in every byte the code uses (version 4).
create function app.new_athlete_share_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'TS-' || string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', get_byte(bytes, i) % 31 + 1, 1), '' order by i)
  from (select uuid_send(gen_random_uuid()) as bytes) b, generate_series(0, 5) i;
$$;

revoke execute on function app.new_athlete_share_code() from public, anon, authenticated;

create function app.athlete_share_code_caller_manages(athlete uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.athlete_managers where user_id = (select auth.uid()) and athlete_id = athlete
  ) then
    raise exception 'only who manages the athlete can see or change their share code' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function app.athlete_share_code_caller_manages(uuid) from public, anon, authenticated;

-- The swimmer's code, created the first time it is asked for. Only who manages the swimmer gets it.
create function public.athlete_share_code(athlete uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result text;
begin
  perform app.athlete_share_code_caller_manages(athlete);
  select code into result from public.athlete_share_codes where athlete_id = athlete;
  while result is null loop
    begin
      insert into public.athlete_share_codes (athlete_id, code, created_by)
      values (athlete, app.new_athlete_share_code(), (select auth.uid()))
      on conflict (athlete_id) do nothing
      returning code into result;
      -- Another call created it at the same time: read that one.
      if result is null then
        select code into result from public.athlete_share_codes where athlete_id = athlete;
      end if;
    exception when unique_violation then
      -- The random code was taken by another swimmer: try another one.
      result := null;
    end;
  end loop;
  return result;
end;
$$;

-- Changes the swimmer's code: the old one stops working at once. Returns the new one.
create function public.rotate_athlete_share_code(athlete uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result text;
begin
  perform app.athlete_share_code_caller_manages(athlete);
  loop
    begin
      insert into public.athlete_share_codes (athlete_id, code, created_by)
      values (athlete, app.new_athlete_share_code(), (select auth.uid()))
      on conflict (athlete_id) do update set code = excluded.code, created_at = now(), created_by = excluded.created_by
      returning code into result;
      return result;
    exception when unique_violation then
      null;
    end;
  end loop;
end;
$$;

-- The short name ("Ana M.") of the swimmer with that code, or null when no swimmer has it; nothing else about them.
-- Accepts the code in any case, with or without "TS-", spaces or dashes. After 5 failed lookups in 15 minutes it refuses
-- every lookup of the caller until the oldest of them is 15 minutes old.
create function public.find_athlete_by_share_code(share_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  body text := upper(regexp_replace(coalesce(share_code, ''), '[^A-Za-z0-9]', '', 'g'));
  athlete public.athletes;
  found_athlete boolean;
begin
  if caller is null then
    raise exception 'find_athlete_by_share_code needs a signed-in user' using errcode = '42501';
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
  select a.* into athlete
  from public.athlete_share_codes c
  join public.athletes a on a.id = c.athlete_id
  where c.code = 'TS-' || body;
  found_athlete := athlete.id is not null;

  insert into public.athlete_share_code_lookups (user_id, matched) values (caller, found_athlete);
  if not found_athlete then
    return null;
  end if;
  return split_part(btrim(athlete.first_name), ' ', 1) || ' ' || upper(left(btrim(athlete.last_name), 1)) || '.';
end;
$$;

revoke execute on function public.athlete_share_code(uuid), public.rotate_athlete_share_code(uuid), public.find_athlete_by_share_code(text)
  from public, anon;
grant execute on function public.athlete_share_code(uuid), public.rotate_athlete_share_code(uuid), public.find_athlete_by_share_code(text)
  to authenticated;
