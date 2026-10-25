-- Removes the demo data of supabase/seed.sql (issue #226), and whatever people
-- created in the demo school while trying it: the demo school and its groups,
-- categories, plans and invitations, every athlete linked to it with their
-- times and authorizations, and the three demo accounts.
--
-- Run it as the database owner, in one transaction, so it removes everything or
-- nothing (no BEGIN or COMMIT inside):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/scripts/seed-remove.sql
--
-- Kept on purpose: the authorization texts (shared, immutable placeholders).
-- Anything else in the database is untouched. Not safe to run on a database
-- where the demo school holds real data.

create temp table seed_remove_athletes as
select athlete_id as id from public.athlete_schools
where school_id = '00000000-0000-4000-8000-0000000000a1';

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
delete from public.athlete_schools where athlete_id in (select id from seed_remove_athletes);
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
