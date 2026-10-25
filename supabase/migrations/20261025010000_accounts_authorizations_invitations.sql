-- Module: accounts. Issue #40.
-- Versioned authorization texts, authorizations as append-only evidence, the
-- current status per athlete and purpose, and school invitations, all with
-- row level security. A function resolves an invitation token without a
-- session. The status rule is provisional pending legal review (#106): the
-- most recent event wins across all adults, judged by the device clock and
-- the server clock together.

-- Purposes are rows, not code: new ones need no deploy. The codes are
-- technical ids, not legal text.
create table public.authorization_purposes (
  code text primary key,
  created_at timestamptz not null default now()
);

insert into public.authorization_purposes (code) values
  ('record_times'),
  ('import_official_results'),
  ('share_results_with_school');

-- One row per version and language of a text. Rows never change (see trigger).
create table public.authorization_texts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  purpose text not null references public.authorization_purposes,
  version int not null check (version > 0),
  language text not null,
  body text not null,
  unique (purpose, version, language),
  unique (id, purpose)
);

-- One row per acceptance, with its evidence. Only the three withdrawal columns
-- ever change, once.
create table public.authorizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users,
  athlete_id uuid not null references public.athletes,
  purpose text not null,
  text_id uuid not null,
  -- Device time of the acceptance.
  accepted_at timestamptz not null,
  -- Server time of the reception; a trigger sets it.
  received_at timestamptz not null default clock_timestamp(),
  -- Device time of the withdrawal.
  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users,
  -- Server time of the withdrawal; a trigger sets it.
  withdrawal_received_at timestamptz,
  foreign key (text_id, purpose) references public.authorization_texts (id, purpose)
);

create index authorizations_athlete_purpose_idx on public.authorizations (athlete_id, purpose);

-- Current status per athlete and purpose, kept by a trigger because PowerSync
-- cannot replicate views. It holds no evidence and no adult identity, so
-- coaches can read it.
create table public.authorization_status (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes,
  purpose text not null references public.authorization_purposes,
  is_granted boolean not null,
  updated_at timestamptz not null default clock_timestamp(),
  unique (athlete_id, purpose)
);

create table public.school_invitations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users,
  school_id uuid not null references public.schools,
  group_id uuid not null references public.training_groups,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex')
    check (char_length(token) >= 32)
);

-- Texts never change, for anyone: a signed text must stay what was signed.
create function public.authorization_texts_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'authorization texts cannot change' using errcode = '42501';
end;
$$;

create trigger authorization_texts_immutable
  before update or delete on public.authorization_texts
  for each row execute function public.authorization_texts_immutable();

-- clock_timestamp, not now: events inside one transaction stay ordered. The
-- device cannot claim an acceptance later than its reception.
create function public.authorizations_set_received_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.received_at := clock_timestamp();
  new.accepted_at := least(new.accepted_at, new.received_at);
  return new;
end;
$$;

create trigger authorizations_set_received_at
  before insert on public.authorizations
  for each row execute function public.authorizations_set_received_at();

-- Only the withdrawal columns may change, and only once. A trigger, not column
-- grants, so the rule also binds the owner and the service role.
create function public.authorizations_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['withdrawn_at', 'withdrawn_by', 'withdrawal_received_at'])
     is distinct from (to_jsonb(old) - array['withdrawn_at', 'withdrawn_by', 'withdrawal_received_at']) then
    raise exception 'authorization evidence cannot change' using errcode = '42501';
  end if;

  if old.withdrawn_at is not null then
    -- A retried upload carries the original, possibly future, device time:
    -- it clamps to the stored one, so it is a no-op.
    if new.withdrawn_at is null
       or least(new.withdrawn_at, old.withdrawal_received_at) is distinct from old.withdrawn_at
       or new.withdrawn_by is distinct from old.withdrawn_by
       or new.withdrawal_received_at is distinct from old.withdrawal_received_at then
      raise exception 'authorization withdrawal cannot change' using errcode = '42501';
    end if;
    new.withdrawn_at := old.withdrawn_at;
  elsif new.withdrawn_at is null then
    if new.withdrawn_by is not null or new.withdrawal_received_at is not null then
      raise exception 'authorization withdrawal columns need a withdrawal' using errcode = '42501';
    end if;
  else
    new.withdrawn_by := auth.uid();
    new.withdrawal_received_at := clock_timestamp();
    new.withdrawn_at := least(new.withdrawn_at, new.withdrawal_received_at);
  end if;
  return new;
end;
$$;

create trigger authorizations_guard_update
  before update on public.authorizations
  for each row execute function public.authorizations_guard_update();

create function public.authorizations_forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'authorization evidence cannot be deleted' using errcode = '42501';
end;
$$;

create trigger authorizations_forbid_delete
  before delete on public.authorizations
  for each row execute function public.authorizations_forbid_delete();

-- The most recent event wins: granted when some authorization in force is later
-- than the latest withdrawal of any adult for that athlete and purpose by both
-- the device clock and the server clock. Runs as its owner because clients cannot write the
-- status. The lock serializes concurrent events of one athlete and purpose.
create function public.authorizations_refresh_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.athlete_id::text || ':' || new.purpose, 0));

  insert into public.authorization_status (athlete_id, purpose, is_granted)
  select new.athlete_id, new.purpose, exists (
    select 1
    from public.authorizations a
    cross join lateral (
      select coalesce(max(w.withdrawn_at), '-infinity') as device_at,
             coalesce(max(w.withdrawal_received_at), '-infinity') as server_at
      from public.authorizations w
      where w.athlete_id = new.athlete_id and w.purpose = new.purpose
    ) latest
    where a.athlete_id = new.athlete_id
      and a.purpose = new.purpose
      and a.withdrawn_at is null
      and a.accepted_at > latest.device_at
      and a.received_at > latest.server_at
  )
  on conflict (athlete_id, purpose) do update
    set is_granted = excluded.is_granted, updated_at = clock_timestamp()
    -- No change, no write: it would only make every device sync the row again.
    where authorization_status.is_granted is distinct from excluded.is_granted;
  return null;
end;
$$;

revoke execute on function public.authorizations_refresh_status() from public;

create trigger authorizations_refresh_status
  after insert or update on public.authorizations
  for each row execute function public.authorizations_refresh_status();

-- Resolves an invitation token for someone who has no session yet, so
-- it is the only way in and it never lists schools. Unknown token: null.
-- It lives in public because PostgREST exposes only that schema.
create function public.resolve_invitation(token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'school_name', s.name,
    'group_name', g.name,
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order)
        order by c.sort_order, c.name
      )
      from public.categories c
      where c.school_id = s.id
    ), '[]'::jsonb)
  )
  from public.school_invitations i
  join public.schools s on s.id = i.school_id
  join public.training_groups g on g.id = i.group_id
  where i.token = resolve_invitation.token;
$$;

revoke execute on function public.resolve_invitation(text) from public;
grant execute on function public.resolve_invitation(text) to anon, authenticated;

alter table public.authorization_purposes enable row level security;
alter table public.authorization_texts enable row level security;
alter table public.authorizations enable row level security;
alter table public.authorization_status enable row level security;
alter table public.school_invitations enable row level security;

-- Supabase grants anon and authenticated everything on new tables: take it
-- back, then grant only what each table's clients use.
revoke all on table
  public.authorization_purposes,
  public.authorization_texts,
  public.authorizations,
  public.authorization_status,
  public.school_invitations
from anon, authenticated;

grant select on table
  public.authorization_purposes,
  public.authorization_texts,
  public.authorization_status
to authenticated;
grant select, insert, update on table public.authorizations to authenticated;
grant select, insert on table public.school_invitations to authenticated;

alter publication powersync add table
  public.authorization_texts,
  public.authorizations,
  public.authorization_status,
  public.school_invitations;

create policy authorization_purposes_select on public.authorization_purposes for select to authenticated
  using (true);

create policy authorization_texts_select on public.authorization_texts for select to authenticated
  using (true);

-- Evidence: its author, the admins of the athlete's school and platform admins.
create policy authorizations_select on public.authorizations for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.is_platform_admin())
    or athlete_id in (select app.admin_athlete_ids())
  );

create policy authorizations_insert on public.authorizations for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and athlete_id in (select app.managed_athlete_ids())
    and withdrawn_at is null
    and withdrawn_by is null
    and withdrawal_received_at is null
  );

-- The trigger limits an update to the withdrawal. No delete policy.
create policy authorizations_update on public.authorizations for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy authorization_status_select on public.authorization_status for select to authenticated
  using ((select app.is_platform_admin()) or athlete_id in (select app.visible_athlete_ids()));

create policy school_invitations_select on public.school_invitations for select to authenticated
  using ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()));

create policy school_invitations_insert on public.school_invitations for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()))
    and group_id in (
      select id from public.training_groups where school_id = school_invitations.school_id
    )
  );
