-- Module school-console: the organization of a school no longer leaves
-- orphans on an upsert, can be relinked by the service role and migrations,
-- and follows the school's name (issue #242).

-- The organization is now created after the school row (see below), so the
-- foreign key is checked at commit. Without this, the check would run before
-- the AFTER trigger and reject the school.
alter table public.schools
  alter constraint schools_organization_id_fkey deferrable initially deferred;

-- A BEFORE INSERT trigger runs before ON CONFLICT is resolved, so creating the
-- organization there left an orphan whenever the upsert ended in an update or
-- did nothing. The trigger now only picks the id; the organization is created
-- by the AFTER trigger below, which fires only for a row that was inserted.
-- Relinking is limited to platform admins among signed-in users: the
-- schools_update policy also lets a school admin update the row. Without a
-- signed-in user (the owner, the service role) it is allowed, as in
-- measurements_check_update. An UPDATE that clears the id creates the
-- organization here, since the AFTER INSERT trigger will not fire for it.
create or replace function app.set_school_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_type text;
begin
  if tg_op = 'UPDATE' and new.organization_id is not distinct from old.organization_id then
    return new;
  end if;
  if tg_op = 'UPDATE' and (select auth.uid()) is not null and not (select app.is_platform_admin()) then
    raise exception 'only a platform admin can change the organization of a school'
      using errcode = 'insufficient_privilege';
  end if;
  if new.organization_id is null then
    if tg_op = 'INSERT' then
      new.organization_id := gen_random_uuid();
    else
      insert into public.organizations (type, name) values ('school', new.name)
      returning id into new.organization_id;
    end if;
    return new;
  end if;
  select type into org_type from public.organizations where id = new.organization_id;
  if org_type is distinct from 'school' then
    raise exception 'organization % is not of type school', new.organization_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Creates the organization of a new school (a given one is left as is) and
-- renames the organization the school points at when the school is renamed.
-- Triggers fire in alphabetical order: this one must sort before
-- schools_seed_categories, which reads the new organization. A relink followed
-- by a rename renames the newly linked organization, as intended.
create function app.sync_school_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.organizations (id, type, name)
    values (new.organization_id, 'school', new.name)
    on conflict (id) do nothing;
  else
    update public.organizations set name = new.name where id = new.organization_id;
  end if;
  return null;
end;
$$;

revoke execute on function app.sync_school_organization() from public;

create trigger schools_create_organization
  after insert or update of name on public.schools
  for each row execute function app.sync_school_organization();
