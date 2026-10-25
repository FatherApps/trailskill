-- Removes the demo data of supabase/seed.sql (issue #226), and whatever people
-- created in the demo school while trying it: the demo school and its groups,
-- categories, plans and invitations, its organization and the parent with the
-- category templates, every athlete linked only to it with their times and
-- authorizations, and the three demo accounts. An athlete who also belongs to
-- another school stays, with their other data: only the links to the demo school
-- and what the demo accounts created are removed.
--
-- It must run in one transaction (no BEGIN or COMMIT inside), so it removes
-- everything or nothing. It lifts the authorizations delete trigger for one
-- statement; a failure outside a transaction would leave that trigger off, so
-- the first statement refuses to run without one:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/scripts/seed-remove.sql
-- or inside your own BEGIN ... COMMIT (or ROLLBACK) block.
--
-- Run it as the database owner. Kept on purpose: the authorization texts
-- (shared, immutable placeholders). Anything else in the database is untouched.
-- Not safe to run on a database where the demo school holds real data.

-- psql must stop at the guard below; without ON_ERROR_STOP it would carry on.
\set ON_ERROR_STOP on

-- Outside a transaction block every statement starts its own transaction, so both timestamps are equal.
do $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'seed-remove.sql must run in one transaction: psql --single-transaction';
  end if;
end;
$$;

-- Athletes of the demo school only are deleted; the others only leave it.
create temp table seed_remove_athletes as
select athlete_id as id from public.athlete_schools
where school_id = '00000000-0000-4000-8000-0000000000a1'
  and not exists (
    select 1 from public.athlete_schools o
    where o.athlete_id = athlete_schools.athlete_id
      and o.school_id <> '00000000-0000-4000-8000-0000000000a1'
  );

create temp table seed_remove_users as
select id from auth.users
where id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
);

-- Times.
delete from public.measurement_conflicts
where measurement_id in (
  select id from public.measurements
  where athlete_id in (select id from seed_remove_athletes)
     or created_by in (select id from seed_remove_users)
);
delete from public.measurements
where athlete_id in (select id from seed_remove_athletes)
   or created_by in (select id from seed_remove_users);
delete from public.timing_series where created_by in (select id from seed_remove_users);

-- Authorizations are append-only evidence: the delete trigger is lifted for
-- this one statement and put back.
alter table public.authorizations disable trigger authorizations_forbid_delete;
delete from public.authorizations
where athlete_id in (select id from seed_remove_athletes)
   or user_id in (select id from seed_remove_users)
   or withdrawn_by in (select id from seed_remove_users);
alter table public.authorizations enable trigger authorizations_forbid_delete;
delete from public.authorization_status where athlete_id in (select id from seed_remove_athletes);

-- Athletes and who looks after them.
delete from public.athlete_managers
where athlete_id in (select id from seed_remove_athletes)
   or user_id in (select id from seed_remove_users);
delete from public.coach_athlete_assignments
where athlete_id in (select id from seed_remove_athletes)
   or coach_user_id in (select id from seed_remove_users);
delete from public.athlete_groups
where athlete_id in (select id from seed_remove_athletes)
   or group_id in (select id from public.training_groups where school_id = '00000000-0000-4000-8000-0000000000a1');
delete from public.athlete_schools where school_id = '00000000-0000-4000-8000-0000000000a1';
delete from public.athletes where id in (select id from seed_remove_athletes);

-- Plans.
delete from public.training_plan_blocks
where version_id in (
  select v.id from public.training_plan_versions v
  join public.training_plans p on p.id = v.plan_id
  where p.school_id = '00000000-0000-4000-8000-0000000000a1'
);
delete from public.training_plan_versions
where plan_id in (select id from public.training_plans where school_id = '00000000-0000-4000-8000-0000000000a1');
delete from public.training_plans where school_id = '00000000-0000-4000-8000-0000000000a1';

-- School, staff and groups.
delete from public.school_invitations
where school_id = '00000000-0000-4000-8000-0000000000a1'
   or created_by in (select id from seed_remove_users);
delete from public.coach_group_assignments
where coach_user_id in (select id from seed_remove_users)
   or group_id in (select id from public.training_groups where school_id = '00000000-0000-4000-8000-0000000000a1');
delete from public.school_memberships
where school_id = '00000000-0000-4000-8000-0000000000a1'
   or user_id in (select id from seed_remove_users);
delete from public.categories where school_id = '00000000-0000-4000-8000-0000000000a1';
delete from public.training_groups where school_id = '00000000-0000-4000-8000-0000000000a1';
delete from public.schools where id = '00000000-0000-4000-8000-0000000000a1';

-- Organizations: the school's, then its parent with the category templates.
delete from public.category_templates where organization_id = '00000000-0000-4000-8000-000000000101';
delete from public.organizations where id = '00000000-0000-4000-8000-000000000102';
delete from public.organizations where id = '00000000-0000-4000-8000-000000000101';

-- Accounts (their identities and sessions go with them).
delete from public.platform_admins where user_id in (select id from seed_remove_users);
delete from auth.users where id in (select id from seed_remove_users);

drop table seed_remove_athletes, seed_remove_users;

-- The deploy runner records the seed it applied. Forget it, so APPLY_SEED can
-- apply the demo again. The table exists only on the deployed database.
do $$
begin
  if to_regclass('supabase_migrations.seed_files') is not null then
    delete from supabase_migrations.seed_files where path = 'supabase/seed.sql';
  end if;
end;
$$;
