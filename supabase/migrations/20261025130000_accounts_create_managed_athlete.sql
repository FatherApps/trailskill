-- Module: accounts. Issue #42.
-- A guardian or an adult athlete creates an athlete profile and its manager link in
-- one step. The tables stay closed to them (only platform admins insert), so the app
-- sends both rows it wrote locally to this function, which stores them in one
-- transaction. It never trusts a user id from the payload: the link always belongs to
-- the caller. It is idempotent like confirm_measurement_insert: a re-send of the same
-- values answers 'stored', the same ids with other values answer 'changed' (nothing is
-- overwritten), and anything else on an existing id is refused with 42501.
create unique index athlete_managers_one_self_per_user on public.athlete_managers (user_id) where relation = 'self';

create function public.create_managed_athlete(payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  a jsonb := payload -> 'athlete';
  m jsonb := payload -> 'manager';
  v_athlete uuid;
  v_manager uuid;
  v_first text;
  v_last text;
  v_relation text;
  inserted bigint;
begin
  if caller is null then
    raise exception 'create_managed_athlete needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(m) is distinct from 'object' then
    raise exception 'athlete and manager are required' using errcode = '22023';
  end if;
  if m ->> 'user_id' is not null and (m ->> 'user_id')::uuid <> caller then
    raise exception 'a manager link can only be created for the caller' using errcode = '42501';
  end if;
  v_athlete := (a ->> 'id')::uuid;
  v_manager := (m ->> 'id')::uuid;
  v_first := a ->> 'first_name';
  v_last := a ->> 'last_name';
  v_relation := m ->> 'relation';
  if v_athlete is null or v_manager is null or (m ->> 'athlete_id')::uuid is distinct from v_athlete
     or v_relation is null or v_relation not in ('guardian', 'self')
     or btrim(coalesce(v_first, '')) = '' or btrim(coalesce(v_last, '')) = ''
     or char_length(v_first) > 100 or char_length(v_last) > 100 then
    raise exception 'invalid athlete or manager' using errcode = '22023';
  end if;

  -- ON CONFLICT DO NOTHING: identical re-sends, even concurrent ones, fall into the comparison below instead of failing.
  insert into public.athletes (id, first_name, last_name, created_by)
  values (v_athlete, v_first, v_last, caller)
  on conflict (id) do nothing;
  get diagnostics inserted = row_count;

  if inserted = 1 then
    -- The athlete is new, so a manager id that already exists belongs to another athlete: refuse and roll the athlete back.
    if exists (select 1 from public.athlete_managers where id = v_manager) then
      raise exception 'manager id already in use' using errcode = '42501';
    end if;
    insert into public.athlete_managers (id, user_id, athlete_id, relation, created_by)
    values (v_manager, caller, v_athlete, v_relation, caller);
    return 'stored';
  end if;

  -- A re-send is only the caller's own pair; an athlete of anyone else, or any other manager id, is not theirs to touch.
  perform 1 from public.athlete_managers where id = v_manager and user_id = caller and athlete_id = v_athlete;
  if not found then
    raise exception 'athlete already exists' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.athletes ath
    join public.athlete_managers am on am.athlete_id = ath.id
    where ath.id = v_athlete and am.id = v_manager
      and ath.first_name = v_first and ath.last_name = v_last and am.relation = v_relation
  ) then
    return 'stored';
  end if;
  return 'changed';
end;
$$;

-- Supabase grants execute on new functions to anon by default: only signed-in users may create.
revoke execute on function public.create_managed_athlete(jsonb) from public, anon;
grant execute on function public.create_managed_athlete(jsonb) to authenticated;
