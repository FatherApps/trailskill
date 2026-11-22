-- Module athletes: a permanent recovery code per swimmer plus 8 single-use recovery codes (issue #1416). The permanent code is the key of
-- the school's anonymous copy (T155) and of data recovery (T156). Nobody, not even us, knows the text: the server stores only one-way
-- hashes (sha256 of the normalized code, like former_athlete_key_hash of #1244) and the text is returned to the owner once, when it is
-- issued. Nothing is backfilled: the text is born in front of the owner, when their app calls issue_athlete_recovery_code (T152).
-- The tables are not in powersync/sync-config.yaml. Nobody reads them directly: row level security without policies, and no grants
-- for anon, authenticated or service_role.

create table public.athlete_recovery_identities (
  id uuid primary key default gen_random_uuid(),
  -- Deleting the swimmer (or their account) detaches the identity instead of deleting it (maintainer decision, #1416): only hashes stay,
  -- no personal data. A swimmer that kept school times stays as an anonymous marker, so the identity keeps pointing at it and still
  -- resolves to the school's anonymous copy (public.former_athlete_keys). PROVISIONAL: a swimmer without school times is deleted,
  -- the identity keeps athlete_id null and resolves to nothing.
  athlete_id uuid unique references public.athletes (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  -- When the owner confirmed they saved the codes; until then issue_athlete_recovery_code may issue them again.
  confirmed_at timestamptz,
  -- sha256 (hex) of the normalized permanent code; two swimmers can never share it.
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$')
);

create table public.athlete_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.athlete_recovery_identities (id) on delete cascade,
  -- The set (1, 2, ...) the code was issued in: regenerating starts a new set.
  code_set integer not null check (code_set > 0),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$')
);

create index athlete_recovery_codes_identity_idx on public.athlete_recovery_codes (identity_id, code_set);

-- One row per failed attempt to redeem a code, to limit them; kept for a day.
create table public.athlete_recovery_code_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  failed_at timestamptz not null default now()
);

create index athlete_recovery_code_failures_user_idx on public.athlete_recovery_code_failures (user_id, failed_at);

alter table public.athlete_recovery_identities enable row level security;
alter table public.athlete_recovery_codes enable row level security;
alter table public.athlete_recovery_code_failures enable row level security;
-- The default privileges grant every new table to anon, authenticated and service_role: here nobody keeps any.
revoke all on table public.athlete_recovery_identities, public.athlete_recovery_codes, public.athlete_recovery_code_failures
  from anon, authenticated, service_role;

-- A marked account (deletion requested) writes nothing here either (the guard every table of the public schema has).
select app.guard_marked_account_writes('public.athlete_recovery_identities');
select app.guard_marked_account_writes('public.athlete_recovery_codes');
select app.guard_marked_account_writes('public.athlete_recovery_code_failures');

-- A new random code: PROVISIONAL format, for Mario to confirm in the PR. 'TR-' (permanent) or 'RC-' (recovery), then 16 characters
-- in 4 groups of 4 (TR-XXXX-XXXX-XXXX-XXXX) without the ones that read alike (0 O 1 I L), as app.new_athlete_share_code() but longer
-- (about 79 bits) and with another prefix, so it is not mistaken for the share code. The bytes come from pgcrypto, random in every bit.
create function app.new_athlete_recovery_code(prefix text)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select prefix || '-' || string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', get_byte(bytes, i) % 31 + 1, 1) || case when i % 4 = 3 and i < 15 then '-' else '' end,
    '' order by i)
  from (select extensions.gen_random_bytes(16) as bytes) b, generate_series(0, 15) i;
$$;

-- The hash of a code as the user may type it: any case, with or without the group dashes, spaces or dashes in between (everything but
-- letters and digits is dropped, so TR-ABCD-EFGH-JKMN-PQRS and trabcdefghjkmnpqrs hash the same). Plain sha256: no pepper, no secret.
create function app.athlete_recovery_code_hash(code text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex');
$$;

-- Only who manages the swimmer (a guardian, or the adult athlete themself) may issue or regenerate their codes.
create function app.athlete_recovery_caller_manages(athlete uuid)
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
    raise exception 'only who manages the athlete can issue their recovery codes' using errcode = '42501';
  end if;
end;
$$;

-- Inserts one new recovery code of the set and returns its text; tries again if the random code is taken (unique hash).
create function app.add_athlete_recovery_code(identity uuid, in_set integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_code text;
begin
  loop
    new_code := app.new_athlete_recovery_code('RC');
    begin
      insert into public.athlete_recovery_codes (identity_id, code_set, code_hash)
      values (identity, in_set, app.athlete_recovery_code_hash(new_code));
      return new_code;
    exception when unique_violation then
      null;
    end;
  end loop;
end;
$$;

revoke execute on function app.new_athlete_recovery_code(text), app.athlete_recovery_code_hash(text),
  app.athlete_recovery_caller_manages(uuid), app.add_athlete_recovery_code(uuid, integer)
  from public, anon, authenticated;

-- First call for a swimmer: creates their identity, the permanent code and the first 8 recovery codes, stores only their hashes and
-- returns the texts. While the owner has not confirmed they saved them (confirm_athlete_recovery_codes), calling it again replaces the
-- whole unconfirmed set with new texts (the old ones stop working). Once confirmed it returns no rows and changes nothing.
create function public.issue_athlete_recovery_code(athlete uuid)
returns table (main_code text, recovery_codes text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_main text;
  new_identity uuid;
  is_confirmed boolean;
  taken text;
  codes text[] := '{}';
begin
  perform app.athlete_recovery_caller_manages(athlete);
  -- One call at a time per swimmer: two overlapping first calls cannot both create the identity.
  perform pg_advisory_xact_lock(hashtextextended(athlete::text || ':athlete-recovery-codes', 0));

  select i.id, i.confirmed_at is not null into new_identity, is_confirmed
  from public.athlete_recovery_identities i where i.athlete_id = athlete;
  if is_confirmed then
    return;
  end if;

  loop
    new_main := app.new_athlete_recovery_code('TR');
    begin
      if new_identity is null then
        insert into public.athlete_recovery_identities (athlete_id, code_hash)
        values (athlete, app.athlete_recovery_code_hash(new_main))
        returning id into new_identity;
      else
        update public.athlete_recovery_identities i set code_hash = app.athlete_recovery_code_hash(new_main) where i.id = new_identity;
      end if;
      exit;
    exception when unique_violation then
      -- Only a taken hash is tried again with another code. Another unique key (one identity per swimmer) means a concurrent call
      -- created the identity first (possible under repeatable read, where the lock does not show its row): answer as when it exists.
      get stacked diagnostics taken = constraint_name;
      if taken is distinct from 'athlete_recovery_identities_code_hash_key' then
        return;
      end if;
    end;
  end loop;

  -- Unconfirmed: nothing of the previous set was ever safely in the owner's hands.
  delete from public.athlete_recovery_codes c where c.identity_id = new_identity;
  for n in 1..8 loop
    codes := codes || app.add_athlete_recovery_code(new_identity, 1);
  end loop;
  return query select new_main, codes;
end;
$$;

-- The owner confirms they saved the texts: from now on they cannot be issued again. Idempotent. Raises 'no_recovery_identity' (P0001)
-- when the swimmer has no codes yet.
create function public.confirm_athlete_recovery_codes(athlete uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.athlete_recovery_caller_manages(athlete);
  perform pg_advisory_xact_lock(hashtextextended(athlete::text || ':athlete-recovery-codes', 0));
  update public.athlete_recovery_identities i set confirmed_at = coalesce(i.confirmed_at, now()) where i.athlete_id = athlete;
  if not found then
    raise exception 'no_recovery_identity' using errcode = 'P0001';
  end if;
end;
$$;

-- A new set of 8 recovery codes, only after at least one code of the current set was used: the unused ones of the previous set stop
-- working, the permanent code and the identity do not change. Returns the texts, this one time. Raises 'no_recovery_code_used' (P0001)
-- when none was used, and 'no_recovery_identity' (P0001) when the swimmer has no codes yet.
create function public.regenerate_athlete_recovery_codes(athlete uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  ident uuid;
  current_set integer;
  codes text[] := '{}';
begin
  perform app.athlete_recovery_caller_manages(athlete);
  perform pg_advisory_xact_lock(hashtextextended(athlete::text || ':athlete-recovery-codes', 0));

  select i.id into ident from public.athlete_recovery_identities i where i.athlete_id = athlete;
  if ident is null then
    raise exception 'no_recovery_identity' using errcode = 'P0001';
  end if;
  select max(c.code_set) into current_set from public.athlete_recovery_codes c where c.identity_id = ident;
  if not exists (
    select 1 from public.athlete_recovery_codes c where c.identity_id = ident and c.code_set = current_set and c.used_at is not null
  ) then
    raise exception 'no_recovery_code_used' using errcode = 'P0001';
  end if;

  delete from public.athlete_recovery_codes c where c.identity_id = ident and c.used_at is null;
  for n in 1..8 loop
    codes := codes || app.add_athlete_recovery_code(ident, current_set + 1);
  end loop;
  return codes;
end;
$$;

-- For the functions of T156, never for a client: the identity (not the swimmer) of the code, or null when it matches nothing. The
-- permanent code and an unused recovery code both resolve the same identity; a recovery code is consumed (used_at) under a row lock,
-- so it works once. After 5 failed attempts in 15 minutes the caller is refused with 'too_many_attempts' (P0001), a correct code too.
-- The failed attempt is recorded, not raised, so a null answer does not roll it back. Contract for the caller (T156): the failure row
-- lives in the caller's own transaction, so a caller that raises after a null result rolls the counter back and the limit never
-- trips: report an invalid code to the client by return value, never by raising.
create function app.redeem_athlete_recovery_code(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- PROVISIONAL starting values, for the maintainer to confirm (issue #1416): failed attempts per user in the window.
  attempt_limit constant integer := 5;
  attempt_window constant interval := '15 minutes';
  caller uuid := (select auth.uid());
  hashed text := app.athlete_recovery_code_hash(code);
  ident uuid;
  code_id uuid;
begin
  if caller is null then
    raise exception 'redeeming a recovery code needs a signed-in user' using errcode = '42501';
  end if;

  -- One attempt at a time per user, so overlapping requests cannot all see the same count.
  perform pg_advisory_xact_lock(hashtextextended(caller::text || ':athlete-recovery-attempts', 0));
  delete from public.athlete_recovery_code_failures f where f.user_id = caller and f.failed_at < now() - interval '1 day';
  if (
    select count(*) from public.athlete_recovery_code_failures f where f.user_id = caller and f.failed_at > now() - attempt_window
  ) >= attempt_limit then
    raise exception 'too_many_attempts' using errcode = 'P0001', hint = 'Try again in 15 minutes.';
  end if;

  select i.id into ident from public.athlete_recovery_identities i where i.code_hash = hashed;
  if ident is not null then
    return ident;
  end if;

  select c.id, c.identity_id into code_id, ident
  from public.athlete_recovery_codes c
  where c.code_hash = hashed and c.used_at is null
  for update;
  if code_id is not null then
    update public.athlete_recovery_codes set used_at = now() where id = code_id;
    return ident;
  end if;

  insert into public.athlete_recovery_code_failures (user_id) values (caller);
  return null;
end;
$$;

revoke execute on function app.redeem_athlete_recovery_code(text) from public, anon, authenticated;
revoke execute on function public.issue_athlete_recovery_code(uuid), public.regenerate_athlete_recovery_codes(uuid),
  public.confirm_athlete_recovery_codes(uuid) from public, anon;
grant execute on function public.issue_athlete_recovery_code(uuid), public.regenerate_athlete_recovery_codes(uuid),
  public.confirm_athlete_recovery_codes(uuid) to authenticated;
