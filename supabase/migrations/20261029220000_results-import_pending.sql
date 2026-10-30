-- Module: results-import. Issue #81.
-- What a search or a query found at the source waits here, on the server, until
-- the guardian or adult athlete confirms it ("Is this person?") or it expires.
-- The device holds only the id of the row. Each row is good for 15 minutes and
-- is consumed by one atomic delete, so it can be used once.
--
-- This is a narrow exception to #79's rule that the source's key of an athlete
-- is stored nowhere: the key is kept here only encrypted (pgp_sym_encrypt with
-- the Vault secret athlete_identity_key, the same as athlete_identity_documents,
-- no new secret), for at most 15 minutes and never after it is confirmed or
-- the purpose is withdrawn. Nobody with a session can read the table: RLS on,
-- no policy, no grants, not in the powersync publication. Only service_role
-- executes the two functions. No error text below carries the key or the
-- payload: messages are constants.
--
-- `kind` says what the row holds: 'search' is a candidate of "Is this person?"
-- (#81); 'results' is for the official results chosen to import (#82).

create table public.results_import_pending (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('search', 'results')),
  requested_by uuid not null references auth.users (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider ~ '^[a-z]{2}-[a-z0-9]+(-[a-z0-9]+)*$'),
  -- The source's key (a person's reference, or a result's), encrypted.
  reference_encrypted bytea not null,
  -- Only what the app may later show or record: never a document or a birth date.
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index results_import_pending_athlete_id_idx on public.results_import_pending (athlete_id);
create index results_import_pending_expires_at_idx on public.results_import_pending (expires_at);

alter table public.results_import_pending enable row level security;
revoke all on table public.results_import_pending from public, anon, authenticated;

-- Stores one pending row and answers its id. Expired rows are purged here, so
-- no job is needed. Only for a manager of the athlete with import_official_results
-- in force (42501), under the same lock as a withdrawal. A row lives at most 15
-- minutes (22023 otherwise). `pending_id` is only for the results-import service
-- to put back a row that a confirmation consumed and then failed on (nothing was
-- recorded), with the time it had left, so the device's id keeps working. The
-- service never calls it after a success; only service_role can call it at all.
-- 22023: invalid input. TS001: the Vault secret is missing.
create function public.results_import_pending_put(
  kind text, requested_by uuid, athlete uuid, organization uuid, provider text,
  reference text, payload jsonb, ttl interval, pending_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_id uuid;
begin
  if results_import_pending_put.ttl is null
     or results_import_pending_put.ttl <= interval '0'
     or results_import_pending_put.ttl > interval '15 minutes'
     or coalesce(results_import_pending_put.reference, '') = ''
     or jsonb_typeof(results_import_pending_put.payload) is distinct from 'object' then
    raise exception 'the pending entry is not valid' using errcode = '22023';
  end if;

  -- Same lock as the authorization refresh: a withdrawal either lands first
  -- (not in force) or purges the row this call inserts afterwards.
  perform pg_advisory_xact_lock(
    hashtextextended(results_import_pending_put.athlete::text || ':' || 'import_official_results', 0)
  );
  if results_import_pending_put.requested_by is null
     or not exists (
       select 1 from public.athlete_managers m
       where m.user_id = results_import_pending_put.requested_by
         and m.athlete_id = results_import_pending_put.athlete
     )
     or not app.authorization_in_force_at(
       results_import_pending_put.athlete, 'import_official_results', 'infinity', 'infinity'
     ) then
    raise exception 'results import not allowed' using errcode = '42501';
  end if;

  select s.decrypted_secret into v_key
  from vault.decrypted_secrets s
  where s.name = 'athlete_identity_key';
  if v_key is null then
    raise exception 'athlete identity key is not configured' using errcode = 'TS001';
  end if;

  delete from public.results_import_pending p where p.expires_at <= clock_timestamp();

  insert into public.results_import_pending
    (id, kind, requested_by, athlete_id, organization_id, provider, reference_encrypted, payload, expires_at)
  values (
    coalesce(results_import_pending_put.pending_id, gen_random_uuid()),
    results_import_pending_put.kind,
    results_import_pending_put.requested_by,
    results_import_pending_put.athlete,
    results_import_pending_put.organization,
    results_import_pending_put.provider,
    extensions.pgp_sym_encrypt(results_import_pending_put.reference, v_key),
    results_import_pending_put.payload,
    clock_timestamp() + results_import_pending_put.ttl
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Consumes one pending row: the delete is the check, so a row that is expired,
-- of another kind, user or athlete, or already taken, answers nothing, and two
-- concurrent calls cannot both get it. Expired rows are purged here too.
-- TS001: the Vault secret is missing (checked before anything is deleted).
create function public.results_import_pending_take(pending uuid, kind text, requested_by uuid, athlete uuid)
returns table (organization_id uuid, provider text, reference text, payload jsonb, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_organization uuid;
  v_provider text;
  v_encrypted bytea;
  v_payload jsonb;
  v_expires_at timestamptz;
begin
  select s.decrypted_secret into v_key
  from vault.decrypted_secrets s
  where s.name = 'athlete_identity_key';
  if v_key is null then
    raise exception 'athlete identity key is not configured' using errcode = 'TS001';
  end if;

  delete from public.results_import_pending p where p.expires_at <= clock_timestamp();

  delete from public.results_import_pending p
  where p.id = results_import_pending_take.pending
    and p.kind = results_import_pending_take.kind
    and p.requested_by = results_import_pending_take.requested_by
    and p.athlete_id = results_import_pending_take.athlete
  returning p.organization_id, p.provider, p.reference_encrypted, p.payload, p.expires_at
  into v_organization, v_provider, v_encrypted, v_payload, v_expires_at;
  if not found then
    return;
  end if;

  return query select v_organization, v_provider, extensions.pgp_sym_decrypt(v_encrypted, v_key), v_payload, v_expires_at;
end;
$$;

revoke execute on function
  public.results_import_pending_put(text, uuid, uuid, uuid, text, text, jsonb, interval, uuid),
  public.results_import_pending_take(uuid, text, uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.results_import_pending_put(text, uuid, uuid, uuid, text, text, jsonb, interval, uuid),
  public.results_import_pending_take(uuid, text, uuid, uuid)
to service_role;

-- The pending rows exist only for import_official_results: when the status of
-- that purpose turns to not granted, the athlete's rows go, like the number.
create function public.results_import_pending_purge_on_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.results_import_pending p where p.athlete_id = new.athlete_id;
  return null;
end;
$$;

revoke execute on function public.results_import_pending_purge_on_withdrawal()
  from public, anon, authenticated;

create trigger results_import_pending_purge_on_withdrawal
  after insert or update of is_granted on public.authorization_status
  for each row
  when (new.purpose = 'import_official_results' and not new.is_granted)
  execute function public.results_import_pending_purge_on_withdrawal();
