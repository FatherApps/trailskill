-- Module athletes: the school's anonymous copy of a swimmer (issue #1420, T155).
-- Rule of the maintainer (2026-11-22): the school may keep a copy of its data, but as an anonymous swimmer that carries the code of the
-- swimmer. The key is the permanent recovery code of #1416: the school never sees it and the server does not know its text, only the
-- identity (public.athlete_recovery_identities) it hashes to.
--
-- Shape. The copy is an ordinary swimmer row with no identity, the same shape erase_account (#1244) leaves for a swimmer that kept school
-- times: first_name 'Nadador', last_name 'anónimo', no manager, no photo, no private details, an active link with the school and a copy
-- of the school's marks. The school's staff therefore read it through the policies and the streams that already exist for the swimmers
-- of a school; powersync/sync-config.yaml needs no change.
-- The marker table of #1244 (public.former_athlete_keys) is not reused: its hash is of a key the family holds and request_athlete_relink
-- (#1251) matches it with another normalization than a recovery code, so one table would let one kind of text match the other. The link
-- to the identity lives in the new server-only table below, which is not in the PowerSync publication or in the sync config.
--
-- public.create_anonymous_school_copy(p_athlete, p_school) is the only way in. An active school_admin of p_school calls it while the
-- school still reads the swimmer: an active link, or one ended less than 30 days ago (the window of #1418; PROVISIONAL, the constant is
-- here until that issue lands). It copies the marks of that school that the school reads now (not hidden by a withdrawn authorization,
-- not discarded), with their splits, and nothing else: no name, photo, family or other school's data. The copy has no author.
-- Answers (jsonb): status 'created' or 'already_copied', athlete_id (the anonymous swimmer), linkable (it has a key) and copied (marks).
-- A swimmer whose owner never got a recovery code is copied without a key (linkable false). Decided by the maintainer on #1420: the key
-- is attached later only on the server, when the OWNER issues the code (the trigger at the end of this file, on the identity that
-- issue_athlete_recovery_code creates), never by a school action: calling again for the same swimmer copies nothing more and attaches
-- nothing. The key attaches only while the owner's swimmer exists: when the account is erased before any code exists, nobody can issue
-- one any more and the copy stays unlinkable for good (the maintainer's rule: a lost code is lost).
-- Errors: 42501 (the caller is not an active admin of the school, the same answer for any swimmer), P0001 'no_school_access' (the school
-- does not read the swimmer, or the window ended), P0001 'already_anonymous' (the swimmer is an anonymous copy).
-- Revert: drop trigger athlete_recovery_identities_attach_copies and function app.attach_identity_to_anonymous_copies, then function
-- public.create_anonymous_school_copy and table public.athlete_anonymous_copies. The anonymous swimmers already
-- created stay as plain swimmers of their school.

create table public.athlete_anonymous_copies (
  -- The anonymous swimmer. Deleting it removes this row.
  athlete_id uuid primary key references public.athletes on delete cascade,
  school_id uuid not null references public.schools,
  created_at timestamptz not null default now(),
  -- The swimmer it was copied from, only to copy once per school; null once that swimmer is deleted (#1244). No author column: the
  -- admin who asked is not recorded.
  source_athlete_id uuid references public.athletes on delete set null,
  -- The recovery identity of the swimmer, null when the owner had no code. Never a text: the identity is what T156 matches a code to.
  identity_id uuid references public.athlete_recovery_identities on delete set null,
  unique (school_id, source_athlete_id)
);

create index athlete_anonymous_copies_identity_idx on public.athlete_anonymous_copies (identity_id) where identity_id is not null;

alter table public.athlete_anonymous_copies enable row level security;
-- Nobody reads it, the staff of the school included: the identity is not for them. The default privileges grant every new table to
-- anon, authenticated and service_role; here nobody keeps any. No policy, and the table is not in the PowerSync publication.
revoke all on table public.athlete_anonymous_copies from anon, authenticated, service_role;

select app.guard_marked_account_writes('public.athlete_anonymous_copies');

create function public.create_anonymous_school_copy(p_athlete uuid, p_school uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '10s'
as $$
declare
  -- PROVISIONAL, as in #1418: how long the school keeps reading a swimmer after the baja.
  read_window constant interval := '30 days';
  v_caller uuid := (select auth.uid());
  v_identity uuid;
  v_copy public.athlete_anonymous_copies;
  v_anonymous uuid := gen_random_uuid();
  v_copied integer;
begin
  -- First, so nobody else learns whether a swimmer exists: an active admin of that school only (a coach, an admin of another school,
  -- a deactivated admin and a platform admin do not count).
  if v_caller is null or not exists (
    select 1 from public.school_memberships m
    where m.user_id = v_caller and m.school_id = create_anonymous_school_copy.p_school
      and m.role = 'school_admin' and m.deactivated_at is null
  ) then
    raise exception 'only an active admin of the school can copy a swimmer' using errcode = '42501';
  end if;

  -- The swimmer first, like erase_account, then one call at a time per (swimmer, school).
  perform 1 from public.athletes a where a.id = create_anonymous_school_copy.p_athlete for key share;
  perform pg_advisory_xact_lock(hashtextextended(
    create_anonymous_school_copy.p_athlete::text || ':' || create_anonymous_school_copy.p_school::text || ':anonymous-copy', 0));

  if not exists (
    select 1 from public.athlete_schools s
    where s.athlete_id = create_anonymous_school_copy.p_athlete and s.school_id = create_anonymous_school_copy.p_school
      and (s.ended_at is null or s.ended_at > now() - read_window)
  ) then
    raise exception 'no_school_access' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.athlete_anonymous_copies c where c.athlete_id = create_anonymous_school_copy.p_athlete) then
    raise exception 'already_anonymous' using errcode = 'P0001';
  end if;

  select i.id into v_identity from public.athlete_recovery_identities i where i.athlete_id = create_anonymous_school_copy.p_athlete;

  select * into v_copy from public.athlete_anonymous_copies c
  where c.school_id = create_anonymous_school_copy.p_school and c.source_athlete_id = create_anonymous_school_copy.p_athlete;
  if found then
    -- A school action never attaches a key to an existing copy: only the owner's issue of the code does (trigger below).
    return jsonb_build_object('status', 'already_copied', 'athlete_id', v_copy.athlete_id,
      'linkable', v_copy.identity_id is not null, 'copied', 0);
  end if;

  -- No author on any of the rows: the defaults that stamp auth.uid() are overridden with null.
  insert into public.athletes (id, first_name, last_name, created_by) values (v_anonymous, 'Nadador', 'anónimo', null);
  insert into public.athlete_schools (athlete_id, school_id, created_by)
  values (v_anonymous, create_anonymous_school_copy.p_school, null);

  -- The marks, the way resolve_athlete_relink moves them: the triggers of measurements check an editor and recompute hidden for an
  -- authorization the copy does not have, none of which is the rule here, so they are off for this statement and back on after it.
  -- Only marks the school reads (not hidden, not discarded); a split goes only with its parent.
  perform app.erasure_guard_off('public.measurements'::regclass);
  with src as (
    select m.*, gen_random_uuid() as new_id from public.measurements m
    where m.athlete_id = create_anonymous_school_copy.p_athlete and m.school_id = create_anonymous_school_copy.p_school
      and not m.hidden and m.discarded_at is null
  )
  insert into public.measurements
    (id, created_by, device_id, kind, athlete_id, hundredths, stroke, distance, pool, session_type, source, captured_at, parent_id, school_id)
  select s.new_id, null, 'anonymous-copy', s.kind, v_anonymous, s.hundredths, s.stroke, s.distance, s.pool, s.session_type, s.source,
    s.captured_at, p.new_id, s.school_id
  from src s left join src p on p.id = s.parent_id
  where s.parent_id is null or p.id is not null;
  get diagnostics v_copied = row_count;
  perform app.erasure_guards_on();

  insert into public.athlete_anonymous_copies (athlete_id, school_id, source_athlete_id, identity_id)
  values (v_anonymous, create_anonymous_school_copy.p_school, create_anonymous_school_copy.p_athlete, v_identity);

  return jsonb_build_object('status', 'created', 'athlete_id', v_anonymous, 'linkable', v_identity is not null, 'copied', v_copied);
end;
$$;

revoke execute on function public.create_anonymous_school_copy(uuid, uuid) from public, anon;
grant execute on function public.create_anonymous_school_copy(uuid, uuid) to authenticated;

-- The owner issues the code: the identity of #1416 is born in issue_athlete_recovery_code (nowhere else creates one), and the copies of
-- that swimmer that were made before it get their key. Only copies without a key, only of the swimmer the identity belongs to. A
-- swimmer that no longer exists has no copy pointing at it (source_athlete_id is null), so nothing attaches.
create function app.attach_identity_to_anonymous_copies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.athlete_anonymous_copies c set identity_id = new.id
  where c.source_athlete_id = new.athlete_id and c.identity_id is null;
  return null;
end;
$$;

revoke execute on function app.attach_identity_to_anonymous_copies() from public, anon, authenticated;

create trigger athlete_recovery_identities_attach_copies
  after insert on public.athlete_recovery_identities
  for each row execute function app.attach_identity_to_anonymous_copies();
