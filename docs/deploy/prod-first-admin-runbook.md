# PROD first school administrator runbook (#1118)

- Issue: #1118, part of the PROD series (#1113 to #1120)
- Related: [PROD Supabase stack runbook (#1115)](prod-supabase-runbook.md), [PROD deploy compose (#1116)](prod-deploy-compose.md), [`deploy/README.md`](../../deploy/README.md), [ADR 0004](../decisions/0004-sign-in-with-google-microsoft-and-email-code.md)

**Who runs this: Mario, by hand, as the `postgres` role, on the PROD database.** Open the session the same way as the `pg_cron` step of the [PROD Supabase stack runbook](prod-supabase-runbook.md#3-pg_cron): `psql` as `postgres` inside the PROD server, authorized with `orch-auth`. An agent only writes this document and never runs it against PROD.

**No real data in the repository.** The school name, the administrator's email and the optional parent organization are real values that live only in Mario's terminal. This document has markers (`<ESCUELA>`, `<CORREO_ADMIN>` and the parent markers) in their place. Do not paste a real value into the repository, a chat or a ticket, and do not save the edited SQL in a file that is committed.

## Why this is a manual SQL step

A school administrator is a row in `public.school_memberships` with `role = 'school_admin'`. Since migration `20261116010000` there is no insert policy on that table: the only ways to create a membership are `accept_coach_invitations()` (a security definer function that creates **coach** memberships from an invitation) and the database owner. So the very first administrator, and the school row they administer, cannot come from the app. This runbook creates them once, with the owner role.

Out of scope, and never done here:

- Changes to migrations or row-level security policies.
- `public.platform_admins`: a different role (platform administration), not needed for the school console.
- The demo data. **`APPLY_SEED=false` always** (see the [PROD Supabase stack runbook](prod-supabase-runbook.md#7-apply_seedfalse-for-ever)). PROD never has QA or seed data, and the demo accounts never exist there.
- Families, athletes and measurements. Real families are invited only after the backup gate (#1119).

## What the SQL does

In **one transaction** (`begin; ... commit;`) around one `do` block, so any `raise exception` aborts everything:

1. Refuses to run if a marker was left unreplaced (a value that starts with `<`), or a value is empty.
2. Looks up the administrator in `auth.users` by `lower(email)` and refuses, with a clear message, if the row does not exist yet. The email is never printed.
3. Refuses if two schools already have the same name (`schools.name` is not unique, so a name is not enough to pick one).
4. Optional parent organization (default: none). If you set one, it is found by (type, name) or created, so a re-run reuses it.
5. Creates the school if no school has that name, together with its organization row (type `school`). Without a parent, the trigger `app.sync_school_organization` creates the organization. With a parent, the script creates the `school` organization first with `parent_organization_id` and hangs the school from it (the same order `supabase/seed.sql` uses with fictional ids).
6. Creates the `school_admin` membership with `on conflict do nothing`.

Re-running it with the same values changes nothing. A new school starts with **no categories**: the trigger `schools_seed_categories` copies the category templates of the school organization's direct parent, and PROD has none. The administrator creates the categories in the console. Do not insert templates here.

## Steps

Mark each box when it is done. Do the steps in order.

### 0. Before anything

- [ ] #1115 and #1116 are done: the PROD stack is up, the migrations ran, and the app database has the `public.schools` and `public.school_memberships` tables.
- [ ] For the coach invitation at the end (step 6), #1117 is deployed (the Edge Function `school-console-invite-coach`) and Resend is configured: see [step 6](#6-invite-the-first-coach-from-the-console). The administrator can already use the console without them; only the invitation needs them.
- [ ] You have the three real values at hand, outside the repository: the school name, the administrator's email, and (only if wanted) the parent organization. A parent is optional. The default is no parent.

### 1. The future administrator signs in once

The membership points to a row in `auth.users`, and that row exists only after the person has signed in once. Google sign-in and the 6-digit email code both create it.

- [ ] The person opens the app and signs in (Google or the email code). They will see an empty screen with no school: this is expected.
- [ ] Do not ask them to register anything else. The SQL below finds them by email.

If you run the SQL before this step, it refuses with `no auth.users row for the administrator email` and leaves nothing behind.

### 2. Check what exists (read only, before)

Replace the markers, then run in the PROD database as `postgres`. Nothing here changes data.

```sql
select 'schools' as what, count(*) as total from public.schools
union all select 'organizations', count(*) from public.organizations
union all select 'school_memberships', count(*) from public.school_memberships
union all select 'schools with this name', count(*) from public.schools where name = '<ESCUELA>'
union all select 'auth users with this email', count(*) from auth.users where lower(email) = lower('<CORREO_ADMIN>');
```

Expected on an empty PROD: `schools` 0, `organizations` 0, `school_memberships` 0, `schools with this name` 0, and `auth users with this email` **1** (the person signed in in step 1). If the last one is 0, go back to step 1. If `schools with this name` is 2 or more, stop: the SQL refuses on purpose, and the maintainer decides which school is the right one.

### 3. Run the SQL

Replace the markers inside the single quotes, keeping the quotes. Leave the three parent values empty (`''`) for no parent. Do not use a single quote inside a value; if the name has one, write it twice (`''`).

Save the edited SQL only in your terminal session or a scratch file outside the repository, and run it with `ON_ERROR_STOP`:

```sh
psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f first-admin.sql
```

or paste it into an open `psql` session started with `psql -U postgres -d postgres -v ON_ERROR_STOP=1`. Without `ON_ERROR_STOP`, `psql` would go on after an error and its `commit` would just end the aborted transaction; keep the flag so the failure is loud.

```sql
begin;

do $$
declare
  -- Replace the markers inside the quotes. No marker may be left.
  v_school_name    text := '<ESCUELA>';
  v_admin_email    text := '<CORREO_ADMIN>';
  -- Optional parent organization. Empty means no parent.
  -- With a parent, set all of: type (federation, league or club), name and, optionally, the ISO 3166-1 alpha-2 country code.
  v_parent_type    text := '';   -- e.g. replace '' with '<TIPO_PADRE>'
  v_parent_name    text := '';   -- e.g. replace '' with '<NOMBRE_PADRE>'
  v_parent_country text := '';   -- e.g. replace '' with '<PAIS_ISO2>'; '' leaves it empty
  v_user_id    uuid;
  v_parent_id  uuid;
  v_org_id     uuid;
  v_school_id  uuid;
  v_count      int;
begin
  v_school_name := btrim(v_school_name);
  v_admin_email := lower(btrim(v_admin_email));
  v_parent_type := btrim(v_parent_type);
  v_parent_name := btrim(v_parent_name);
  v_parent_country := btrim(v_parent_country);

  if v_school_name = '' or v_admin_email = '' then
    raise exception 'the school name and the administrator email are required';
  end if;
  if left(v_school_name, 1) = '<' or left(v_admin_email, 1) = '<'
     or left(v_parent_type, 1) = '<' or left(v_parent_name, 1) = '<' or left(v_parent_country, 1) = '<' then
    raise exception 'a marker was left unreplaced: fix the values and run again';
  end if;
  if v_parent_type <> '' and (v_parent_name = '' or v_parent_type not in ('federation', 'league', 'club')) then
    raise exception 'a parent organization needs a type (federation, league or club) and a name';
  end if;
  if v_parent_type = '' and (v_parent_name <> '' or v_parent_country <> '') then
    raise exception 'a parent name or country was given without a parent type';
  end if;

  -- The administrator must have signed in once.
  select count(*), (array_agg(id))[1] into v_count, v_user_id from auth.users where lower(email) = v_admin_email;
  if v_count = 0 then
    raise exception 'no auth.users row for the administrator email: the person must sign in once first';
  elsif v_count > 1 then
    raise exception 'more than one auth.users row for the administrator email: stop and ask the maintainer';
  end if;

  -- The name is not unique: refuse to guess between two schools.
  select count(*), (array_agg(id))[1] into v_count, v_school_id from public.schools where name = v_school_name;
  if v_count > 1 then
    raise exception 'two or more schools already have this name: stop and ask the maintainer';
  end if;

  -- Optional parent, found or created by (type, name).
  if v_parent_type <> '' then
    select count(*), (array_agg(id))[1] into v_count, v_parent_id
    from public.organizations where type = v_parent_type and name = v_parent_name;
    if v_count > 1 then
      raise exception 'two or more organizations already have this parent type and name: stop and ask the maintainer';
    elsif v_count = 0 then
      insert into public.organizations (type, name, country_code)
      values (v_parent_type, v_parent_name, nullif(v_parent_country, ''))
      returning id into v_parent_id;
    end if;
  end if;

  if v_school_id is null then
    if v_parent_id is null then
      -- The trigger creates the organization of the school.
      insert into public.schools (name) values (v_school_name) returning id into v_school_id;
    else
      insert into public.organizations (type, name, parent_organization_id)
      values ('school', v_school_name, v_parent_id)
      returning id into v_org_id;
      insert into public.schools (name, organization_id) values (v_school_name, v_org_id)
      returning id into v_school_id;
    end if;
  elsif v_parent_id is not null then
    -- The school already exists: it must hang from the same parent, or the values are wrong.
    if not exists (
      select 1 from public.schools s
      join public.organizations o on o.id = s.organization_id
      where s.id = v_school_id and o.parent_organization_id = v_parent_id
    ) then
      raise exception 'the school already exists with a different parent organization: stop and ask the maintainer';
    end if;
  end if;

  insert into public.school_memberships (school_id, user_id, role)
  values (v_school_id, v_user_id, 'school_admin')
  on conflict (school_id, user_id, role) do nothing;
end
$$;

commit;
```

- [ ] The run printed `BEGIN`, `DO`, `COMMIT` and no error. An error means nothing was written: read the message, fix the value, run again.

### 4. Check the result (read only, after)

Replace the markers, then run:

```sql
select s.id as school_id, s.name as school_name, o.type as org_type, o.parent_organization_id is not null as has_parent
from public.schools s
join public.organizations o on o.id = s.organization_id
where s.name = '<ESCUELA>';

select count(*) as active_school_admins
from public.school_memberships m
join public.schools s on s.id = m.school_id
join auth.users u on u.id = m.user_id
where s.name = '<ESCUELA>'
  and lower(u.email) = lower('<CORREO_ADMIN>')
  and m.role = 'school_admin'
  and m.deactivated_at is null;
```

- [ ] The first query returns **one row**, with `org_type` = `school` and `has_parent` = `false` (or `true` if you chose a parent).
- [ ] `active_school_admins` is **1**. Not 0 (the membership is missing) and not 2 (impossible with the unique constraint; if you see it, stop and tell the maintainer).
- [ ] Running the SQL of step 3 a second time prints no error and the counts of step 2 do not change (the first two queries of step 2 give the same totals).

### 5. The administrator opens the console

- [ ] Ask the person to reopen the app, or pull to refresh, so the sync brings the new membership to the device. The first sync after the SQL can take a few seconds.
- [ ] Expected: the app lands on the **school console**. The landing (`src/app/(app)/index.tsx`, `resolveLanding` in `src/modules/accounts/data/landing.ts`) sends an account with a `school_admin` membership to `/console`, on a phone and on a tablet alike (the width only matters for guardians and adult athletes). On a **tablet** (width at or above the `bp-medium` breakpoint) the console shows its navigation beside the content; on a **phone** it uses the compact layout (`ConsoleLayout.tsx`), one screen at a time. The school name is the one set in step 3, and the Categories section is empty.
- [ ] If the person still sees the home screen after a sync, check the membership with the step 4 query and that the person signed in with the same email. The landing waits up to 5 seconds for the first sync and then falls back to the home screen: reopen the app once more.

### 6. Invite the first coach from the console

The invitation calls the Edge Function `school-console-invite-coach`, which needs:

- #1117 deployed (`deploy/scripts/functions-bundle.sh`, see [Edge Functions](../../deploy/README.md#edge-functions)),
- `RESEND_API_KEY` and `RESEND_FROM` set in the environment of the PROD stack's `functions` service ([deploy/README.md](../../deploy/README.md#edge-functions)), and
- `FUNCTIONS_VERIFY_JWT=true`, already required by the [PROD Supabase stack runbook](prod-supabase-runbook.md#6-secrets-of-the-stack-keys-passwords-and-vault).

Without the Resend variables the function sends nothing.

- [ ] In the console, open **Coaches** and invite an address you control (a test mailbox, not a real coach yet).
- [ ] Expected: the console shows a **pending invitation** for that address, and the email arrives from the Resend sender. The invitation is not an account: the coach accepts it after signing in with that email.
- [ ] If the console reports the invitation as unavailable, the invitation stays pending (inviting the same address again reuses it and sends the email again). Check the `functions` service logs and the two Resend variables. Sending is limited per recipient (3 emails in 24 hours) and per administrator (30 in 24 hours), so repeated tests soon stop sending.

### 7. Post-check list

- [ ] `select count(*) from public.schools;` returns **1**.
- [ ] `select count(*) from public.school_memberships where role = 'school_admin' and deactivated_at is null;` returns **1**.
- [ ] No demo account exists: `select count(*) from auth.users where email like 'demo-%';` returns **0**.
- [ ] `APPLY_SEED` is still `false` in the PROD `deploy` compose.
- [ ] No real value was written in the repository, a chat or a ticket.
- [ ] Families are not invited yet: that waits for the backup gate (#1119).

## Rollback / undo

**While running:** the transaction rolls back by itself on any error. A failed `do` block, a `raise exception` or a closed session before `commit` leaves the database exactly as it was.

**After `commit`:** the undo below deletes the administrator's membership, the school, its organization row and, optionally, a parent organization that this run created. It is only valid **while nothing else references the school**. If a coach, category, athlete or any other row already points to the school, the delete fails on a foreign key, nothing is deleted, and the maintainer decides what to do. It also fails if the school already has categories, on purpose: it never deletes data an administrator typed. Do not delete by hand around the failure.

Replace the markers and run with `psql -v ON_ERROR_STOP=1`. Set `v_delete_parent` to `true` only if the parent organization was created by this run and nothing else uses it.

```sql
begin;

do $$
declare
  v_school_name   text := '<ESCUELA>';
  v_admin_email   text := '<CORREO_ADMIN>';
  v_delete_parent boolean := false;
  v_user_id   uuid;
  v_school_id uuid;
  v_org_id    uuid;
  v_parent_id uuid;
  v_count     int;
begin
  v_school_name := btrim(v_school_name);
  v_admin_email := lower(btrim(v_admin_email));
  if left(v_school_name, 1) = '<' or left(v_admin_email, 1) = '<' then
    raise exception 'a marker was left unreplaced: fix the values and run again';
  end if;

  select count(*), (array_agg(id))[1] into v_count, v_school_id from public.schools where name = v_school_name;
  if v_count = 0 then
    raise notice 'no school with this name: nothing to undo';
    return;
  elsif v_count > 1 then
    raise exception 'two or more schools have this name: stop and ask the maintainer';
  end if;
  select organization_id into v_org_id from public.schools where id = v_school_id;
  select parent_organization_id into v_parent_id from public.organizations where id = v_org_id;
  select (array_agg(id))[1] into v_user_id from auth.users where lower(email) = v_admin_email;

  delete from public.school_memberships
  where school_id = v_school_id and user_id = v_user_id and role = 'school_admin';
  -- Fails on a foreign key if anything else still points to the school.
  delete from public.schools where id = v_school_id;
  delete from public.organizations where id = v_org_id;
  if v_delete_parent and v_parent_id is not null then
    delete from public.organizations where id = v_parent_id;
  end if;
end
$$;

commit;
```

The `auth.users` row of the administrator is never touched: the person can sign in again and the SQL of step 3 can be run again.
