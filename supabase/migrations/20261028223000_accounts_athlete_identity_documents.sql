-- Module: accounts. Issue #799.
-- The identity number of an athlete, which the official results import (#79)
-- needs to find them. It is stored encrypted (pgp_sym_encrypt) with a key that
-- lives in Supabase Vault under the name athlete_identity_key. This migration
-- neither creates nor contains the key: creating the secret is a deployment
-- step (deploy/README.md). Nobody with a session can read the table: clients
-- write through a guardian function, read back only a hint (does it exist,
-- last three characters), and the full number comes out only through a
-- function that service_role alone executes. No error text below ever carries
-- the number: messages are constants and the number is validated before it is
-- used in any statement that could echo it.

create table public.athlete_identity_documents (
  athlete_id uuid primary key references public.athletes (id) on delete cascade,
  identity_number_encrypted bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS on and no policy for anyone, and no grants either: the functions below
-- run as the owner. Not in the powersync publication on purpose.
alter table public.athlete_identity_documents enable row level security;
revoke all on table public.athlete_identity_documents from public, anon, authenticated;

-- Shared by both write functions: in force check, validation, encryption and
-- upsert. Not executable by clients; the callers decide who may write.
-- 42501: no guardian link. 55000: import_official_results not in force.
-- 22023: invalid number. TS001: the Vault secret is missing.
create function app.store_athlete_identity_number(athlete uuid, identity_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
  v_key text;
begin
  -- Same lock as authorizations_refresh_status: a withdrawal that races this
  -- write either lands first (not in force) or deletes the row afterwards.
  perform pg_advisory_xact_lock(hashtextextended(store_athlete_identity_number.athlete::text || ':import_official_results', 0));

  if not coalesce(app.authorization_in_force_at(
    store_athlete_identity_number.athlete, 'import_official_results', 'infinity', 'infinity'
  ), false) then
    raise exception 'import_official_results is not in force for the athlete' using errcode = '55000';
  end if;

  -- Spaces, dots and hyphens are formatting; the rest must be 1 to 20 letters or digits.
  v_number := regexp_replace(coalesce(store_athlete_identity_number.identity_number, ''), '[ .-]', '', 'g');
  if v_number !~ '^[A-Za-z0-9]{1,20}$' then
    raise exception 'identity number is not valid' using errcode = '22023';
  end if;

  select s.decrypted_secret into v_key
  from vault.decrypted_secrets s
  where s.name = 'athlete_identity_key';
  if v_key is null then
    raise exception 'athlete identity key is not configured' using errcode = 'TS001';
  end if;

  insert into public.athlete_identity_documents (athlete_id, identity_number_encrypted)
  values (store_athlete_identity_number.athlete, extensions.pgp_sym_encrypt(v_number, v_key))
  on conflict on constraint athlete_identity_documents_pkey
  do update set identity_number_encrypted = excluded.identity_number_encrypted, updated_at = now();
end;
$$;

-- Decrypts the number, or null when there is none. Helper of the two readers.
create function app.read_athlete_identity_number(athlete uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_encrypted bytea;
  v_key text;
begin
  select d.identity_number_encrypted into v_encrypted
  from public.athlete_identity_documents d
  where d.athlete_id = read_athlete_identity_number.athlete;
  if not found then
    return null;
  end if;

  select s.decrypted_secret into v_key
  from vault.decrypted_secrets s
  where s.name = 'athlete_identity_key';
  if v_key is null then
    raise exception 'athlete identity key is not configured' using errcode = 'TS001';
  end if;

  return extensions.pgp_sym_decrypt(v_encrypted, v_key);
end;
$$;

revoke execute on function
  app.store_athlete_identity_number(uuid, text),
  app.read_athlete_identity_number(uuid)
from public, anon, authenticated;

-- Guardian write (called while registering). Only a manager of the athlete.
create function public.save_athlete_identity_number(athlete_id uuid, identity_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.managed_athlete_ids() as m(id)
    where m.id = save_athlete_identity_number.athlete_id
  ) then
    raise exception 'only a manager of the athlete can save the identity number' using errcode = '42501';
  end if;

  perform app.store_athlete_identity_number(
    save_athlete_identity_number.athlete_id, save_athlete_identity_number.identity_number
  );
end;
$$;

revoke execute on function public.save_athlete_identity_number(uuid, text) from public, anon;
grant execute on function public.save_athlete_identity_number(uuid, text) to authenticated;

-- Server write (service_role has no auth.uid(), so no guardian link): the same
-- rules and the same key.
create function public.save_athlete_identity_number_as_service(athlete_id uuid, identity_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.store_athlete_identity_number(
    save_athlete_identity_number_as_service.athlete_id,
    save_athlete_identity_number_as_service.identity_number
  );
end;
$$;

revoke execute on function public.save_athlete_identity_number_as_service(uuid, text)
  from public, anon, authenticated;
grant execute on function public.save_athlete_identity_number_as_service(uuid, text) to service_role;

-- The number in clear, for results-import (#79). service_role only.
create function public.athlete_identity_number(athlete_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select app.read_athlete_identity_number(athlete_identity_number.athlete_id);
$$;

revoke execute on function public.athlete_identity_number(uuid) from public, anon, authenticated;
grant execute on function public.athlete_identity_number(uuid) to service_role;

-- What a guardian may see: whether there is a number and its last three
-- characters, decrypted here so nothing readable is stored. A number of three
-- characters or fewer shows no characters: they would be the whole number.
create function public.athlete_identity_number_hint(athlete_id uuid)
returns table (present boolean, last_three text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  if not exists (
    select 1 from app.managed_athlete_ids() as m(id)
    where m.id = athlete_identity_number_hint.athlete_id
  ) then
    raise exception 'only a manager of the athlete can read the identity number hint' using errcode = '42501';
  end if;

  v_number := app.read_athlete_identity_number(athlete_identity_number_hint.athlete_id);
  return query select
    v_number is not null,
    case when length(v_number) > 3 then right(v_number, 3) end;
end;
$$;

revoke execute on function public.athlete_identity_number_hint(uuid) from public, anon;
grant execute on function public.athlete_identity_number_hint(uuid) to authenticated;

-- The number exists only for import_official_results: when the status of that
-- purpose turns to not granted, the number goes. authorization_status is kept
-- by the same trigger that handles every authorization and withdrawal.
create function public.athlete_identity_documents_purge_on_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.athlete_identity_documents d where d.athlete_id = new.athlete_id;
  return null;
end;
$$;

revoke execute on function public.athlete_identity_documents_purge_on_withdrawal()
  from public, anon, authenticated;

create trigger athlete_identity_documents_purge_on_withdrawal
  after insert or update of is_granted on public.authorization_status
  for each row
  when (new.purpose = 'import_official_results' and not new.is_granted)
  execute function public.athlete_identity_documents_purge_on_withdrawal();
