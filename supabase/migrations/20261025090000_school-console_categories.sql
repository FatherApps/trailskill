-- Module school-console: categories per school, seeded from the templates of
-- the school's organization and editable by the school admin (issue #67).

-- Security fix: an athlete's category must belong to the same school as the
-- athlete_schools row. The old single-column foreign key let a school admin
-- point the row at a category of another school. The composite key checks the
-- pair (category, school). MATCH SIMPLE (the default) skips the check when
-- category_id is null, so an athlete may have no category. The default
-- NO ACTION on delete keeps a category in use from being deleted.
alter table public.categories
  add constraint categories_id_school_id_key unique (id, school_id);

alter table public.athlete_schools
  drop constraint athlete_schools_category_id_fkey;

alter table public.athlete_schools
  add constraint athlete_schools_category_school_fkey
  foreign key (category_id, school_id) references public.categories (id, school_id);

-- A category in use is deactivated, never deleted: the foreign key above
-- blocks the delete.
alter table public.categories
  add column active boolean not null default true;
-- PowerSync replicates the new value only for rows that are updated.
update public.categories set active = true;

-- Organizations: federations, leagues, clubs and schools as generic rows
-- (ADR 0003). Only platform admins write them. Federations, leagues and clubs
-- are readable by any signed-in user; the organization of a school only by
-- whoever can see that school (the subquery applies the schools policies) and
-- by platform admins. They are not synced to devices, so there is no PowerSync stream.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  type text not null check (type in ('federation', 'league', 'club', 'school')),
  -- ISO 3166-1 alpha-2.
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  parent_organization_id uuid references public.organizations,
  name text not null
);

alter table public.organizations enable row level security;

grant select, insert, update, delete on table public.organizations to authenticated;

create policy organizations_insert on public.organizations for insert to authenticated
  with check ((select app.is_platform_admin()));
create policy organizations_update on public.organizations for update to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));
create policy organizations_delete on public.organizations for delete to authenticated
  using ((select app.is_platform_admin()));

-- Every school has one organization of type 'school'. Existing schools get
-- theirs here; the column becomes required afterwards.
alter table public.schools
  add column organization_id uuid references public.organizations unique;

do $$
declare
  s record;
  org_id uuid;
begin
  for s in select id, name from public.schools loop
    insert into public.organizations (type, name) values ('school', s.name)
    returning id into org_id;
    update public.schools set organization_id = org_id where id = s.id;
  end loop;
end;
$$;

alter table public.schools alter column organization_id set not null;

-- Created here because the policy reads schools.organization_id.
create policy organizations_select on public.organizations for select to authenticated
  using (
    type <> 'school'
    or id in (select organization_id from public.schools)
    or (select app.is_platform_admin())
  );

-- Security definer with an empty search_path, like every function in schema
-- app (a pgTAP test enforces it). A BEFORE trigger runs before the row-level
-- security check, so a rejected school insert rolls the organization back too.
-- Only platform admins may relink an existing school: the schools_update
-- policy also lets a school admin update the row.
create function app.set_school_organization()
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
  if tg_op = 'UPDATE' and not (select app.is_platform_admin()) then
    raise exception 'only a platform admin can change the organization of a school'
      using errcode = 'insufficient_privilege';
  end if;
  if new.organization_id is null then
    insert into public.organizations (type, name) values ('school', new.name)
    returning id into new.organization_id;
  else
    select type into org_type from public.organizations where id = new.organization_id;
    if org_type is distinct from 'school' then
      raise exception 'organization % is not of type school', new.organization_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function app.set_school_organization() from public;

create trigger schools_set_organization
  before insert or update of organization_id on public.schools
  for each row execute function app.set_school_organization();

-- Category templates: the categories a new school starts with, defined per
-- organization (readable wherever the organization is, written by platform
-- admins).
create table public.category_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  organization_id uuid not null references public.organizations,
  name text not null,
  sort_order int not null default 0
);

alter table public.category_templates enable row level security;

grant select, insert, update, delete on table public.category_templates to authenticated;

create policy category_templates_select on public.category_templates for select to authenticated
  using (organization_id in (select id from public.organizations));
create policy category_templates_insert on public.category_templates for insert to authenticated
  with check ((select app.is_platform_admin()));
create policy category_templates_update on public.category_templates for update to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));
create policy category_templates_delete on public.category_templates for delete to authenticated
  using ((select app.is_platform_admin()));

-- A new school copies the templates of the direct parent of its organization.
-- Copying only from the direct parent is provisional (issue #67): inheriting
-- through several levels is a separate issue. No parent or no templates means
-- the school starts with no categories. Security definer, like the trigger
-- above.
create function app.seed_school_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (school_id, name, sort_order)
  select new.id, t.name, t.sort_order
  from public.organizations o
  join public.category_templates t on t.organization_id = o.parent_organization_id
  where o.id = new.organization_id;
  return null;
end;
$$;

revoke execute on function app.seed_school_categories() from public;

create trigger schools_seed_categories
  after insert on public.schools
  for each row execute function app.seed_school_categories();

-- A deactivated category cannot be newly assigned to an athlete, but an
-- athlete who already has it keeps it (the check runs only when category_id
-- is new or changed). Security definer so the check sees the category whoever
-- writes the row.
create function app.guard_inactive_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category_id is not null
     and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and exists (select 1 from public.categories where id = new.category_id and not active) then
    raise exception 'category % is inactive and cannot be assigned', new.category_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function app.guard_inactive_category() from public;

create trigger athlete_schools_guard_inactive_category
  before insert or update of category_id on public.athlete_schools
  for each row execute function app.guard_inactive_category();

-- The invitation offers only active categories (issue #67). Same function as
-- in 20261025020000_accounts_invitation_token_expiry.sql plus the filter.
create or replace function public.resolve_invitation(token text)
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
      where c.school_id = s.id and c.active
    ), '[]'::jsonb)
  )
  from public.school_invitations i
  join public.schools s on s.id = i.school_id
  join public.training_groups g on g.id = i.group_id
  where i.token = resolve_invitation.token
    and i.revoked_at is null
    and i.expires_at > now();
$$;

revoke execute on function public.resolve_invitation(text) from public;
grant execute on function public.resolve_invitation(text) to anon, authenticated;
