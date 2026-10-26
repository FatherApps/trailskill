#!/bin/sh
# Checks the demo seed (supabase/seed.sql) on a database where it is already
# applied, normally a fresh `supabase db reset`:
#   1. applying it again changes no row;
#   2. each demo account sees what its role allows;
#   3. supabase/scripts/seed-remove.sql refuses to run outside a transaction and
#      removes the demo inside one (rolled back, so the database is left as it
#      was), keeping an athlete who also belongs to another school.
# Needs psql. DB_URL defaults to the local Supabase database.
set -eu

DB_URL=${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
dir=$(cd "$(dirname "$0")" && pwd)
psql_run() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

# One line per table: name, row count and a hash of every row.
snapshot() {
  psql_run -At <<'SQL'
select format(
  'select %L, count(*), md5(coalesce(string_agg(t::text, %L order by t::text), %L)) from %I.%I t',
  schemaname || '.' || tablename, '|', '', schemaname, tablename
)
from pg_tables
where schemaname = 'public' or (schemaname = 'auth' and tablename in ('users', 'identities'))
order by schemaname, tablename
\gexec
SQL
}

before=$(snapshot)
psql_run --single-transaction -f "$dir/../seed.sql" >/dev/null
after=$(snapshot)
if [ "$before" != "$after" ]; then
  echo "FAIL: applying the seed again changed data:" >&2
  printf '%s\n' "$before" >"${TMPDIR:-/tmp}/seed-before.$$"
  printf '%s\n' "$after" | diff "${TMPDIR:-/tmp}/seed-before.$$" - >&2 || true
  rm -f "${TMPDIR:-/tmp}/seed-before.$$"
  exit 1
fi
echo "ok - applying the seed again changes nothing"

psql_run <<'SQL'
begin;
set local role authenticated;

-- Guardian: the two athletes they manage, their times and authorizations, and
-- only the plan assigned to their group (that version and its blocks).
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
do $$
begin
  assert (select array_agg(id::text order by id) from public.athletes)
    = array['00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2'],
    'guardian sees exactly the two athletes they manage';
  assert (select count(distinct athlete_id) from public.measurements) = 2
    and (select count(*) from public.measurements where athlete_id not in (
      '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2')) = 0,
    'guardian sees the times of their athletes only';
  assert (select count(*) from public.authorization_status where is_granted) = 4,
    'guardian sees both purposes granted for both athletes';
  assert (select count(*) from public.authorizations where withdrawn_at is null) = 4,
    'guardian sees their four authorizations in force';
  assert (select array_agg(id::text) from public.training_plans)
    = array['00000000-0000-4000-8000-0000000000e1']
    and (select array_agg(id::text) from public.training_plan_versions)
    = array['00000000-0000-4000-8000-0000000000e2']
    and (select count(*) from public.training_plan_blocks) = 4,
    'guardian reads exactly the assigned demo plan, its assigned version and its blocks';
  assert (select array_agg(id::text) from public.training_plan_assignments)
    = array['00000000-0000-4000-8000-0000000000e3'],
    'the demo assignment of the plan to Group A exists and the guardian reads it';
  assert exists (select 1 from public.organizations where id = '00000000-0000-4000-8000-000000000101'),
    'guardian reads the parent organization';
end;
$$;

-- Coach: the five athletes of the group they coach, their times, the school's plan.
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
do $$
begin
  assert (select count(*) from public.athletes) = 5
    and (select count(*) from public.athlete_groups
         where group_id = '00000000-0000-4000-8000-0000000000b1') = 5,
    'coach sees the five athletes of their group';
  assert (select count(distinct athlete_id) from public.measurements) = 5,
    'coach sees the times of the five athletes of their group';
  assert (select count(*) from public.measurements m
          where not exists (select 1 from public.athletes a where a.id = m.athlete_id)) = 0,
    'coach sees no time of an athlete outside their group';
  assert (select array_agg(id::text) from public.training_plans)
    = array['00000000-0000-4000-8000-0000000000e1'],
    'coach sees the plan of the school';
  assert (select count(*) from public.training_plan_blocks) = 4, 'coach sees the four blocks of the plan';
  assert not exists (select 1 from public.authorizations), 'coach reads no authorization evidence';
  assert (select array_agg(id::text order by id) from public.organizations)
    = array['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102'],
    'coach reads the school organization and its parent';
  assert (select count(*) from public.categories) = 3, 'coach reads the three categories of the school';
end;
$$;

-- School admin: every athlete, time and plan of the school, and the evidence.
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}';
do $$
begin
  assert (select count(*) from public.athletes) = 10, 'school admin sees the ten athletes';
  assert (select count(distinct athlete_id) from public.measurements) = 10,
    'school admin sees the times of the ten athletes';
  assert (select count(*) from public.training_groups) = 2, 'school admin sees both groups';
  assert (select count(*) from public.training_plans) = 1, 'school admin sees the plan';
  assert (select count(*) from public.school_memberships) = 2, 'school admin sees the coach and the admin';
  assert (select count(*) from public.authorizations) = 4, 'school admin reads the authorization evidence';
  assert (select array_agg(id::text order by id) from public.organizations)
    = array['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102'],
    'school admin reads the school organization and its parent';
  assert (select parent_organization_id from public.organizations
          where id = '00000000-0000-4000-8000-000000000102') = '00000000-0000-4000-8000-000000000101',
    'the school organization hangs from the parent';
  assert (select array_agg(name order by sort_order) from public.categories)
    = array['Under 11', 'Under 14', 'Open'], 'school admin sees the three categories of the school';
  assert (select count(*) from public.category_templates
          where organization_id = '00000000-0000-4000-8000-000000000101') = 3,
    'school admin reads the three templates of the parent';
  assert (select count(*) from public.athlete_schools where category_id is not null) = 10,
    'every demo athlete has a category';
end;
$$;
rollback;
SQL
echo "ok - each demo account sees what its role allows"

# Runs seed-remove.sql in a transaction that is rolled back: $1 is SQL to run
# before it, $2 the assertions to run after it.
remove_check() {
  {
    echo 'begin;'
    printf '%s\n' "$1"
    cat "$dir/seed-remove.sql"
    printf '%s\n' "$2"
    echo 'rollback;'
  } | psql_run
}

# Outside a transaction it must stop on its guard before deleting anything.
if psql_run -f "$dir/seed-remove.sql" 2>/dev/null; then
  echo "FAIL: seed-remove.sql ran outside a transaction" >&2
  exit 1
fi
psql_run <<'SQL'
do $$
begin
  assert exists (select 1 from public.schools where id = '00000000-0000-4000-8000-0000000000a1'),
    'the guard stopped it before deleting';
  assert (select tgenabled from pg_trigger where tgname = 'authorizations_forbid_delete') = 'O',
    'the authorizations delete trigger is still enabled';
end;
$$;
SQL
echo "ok - seed-remove.sql refuses to run outside a transaction"

remove_check '' "$(cat <<'SQL'
do $$
begin
  assert not exists (select 1 from public.schools where id = '00000000-0000-4000-8000-0000000000a1'), 'school removed';
  assert not exists (select 1 from public.athletes where id::text like '00000000-0000-4000-8000-0000000000%'), 'athletes removed';
  assert not exists (select 1 from public.measurements where created_by::text like '00000000-0000-4000-8000-00000000000%'), 'times removed';
  assert not exists (select 1 from auth.users where email like 'demo-%@example.test'), 'accounts removed';
  assert not exists (select 1 from public.organizations
                     where id in ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102')),
    'organizations removed';
  assert not exists (select 1 from public.category_templates
                     where organization_id = '00000000-0000-4000-8000-000000000101'), 'templates removed';
  assert not exists (select 1 from public.categories where school_id = '00000000-0000-4000-8000-0000000000a1'),
    'categories removed';
  assert not exists (select 1 from public.training_plans where school_id = '00000000-0000-4000-8000-0000000000a1'),
    'plans removed';
  assert not exists (select 1 from public.training_plan_assignments
                     where school_id = '00000000-0000-4000-8000-0000000000a1'), 'assignments removed';
  assert not exists (select 1 from public.school_memberships where school_id = '00000000-0000-4000-8000-0000000000a1'),
    'memberships removed';
  assert not exists (select 1 from public.authorizations
                     where athlete_id::text like '00000000-0000-4000-8000-0000000000%'), 'authorizations removed';
  assert (select tgenabled from pg_trigger where tgname = 'authorizations_forbid_delete') = 'O',
    'the authorizations delete trigger is enabled again';
end;
$$;
SQL
)"
echo "ok - seed-remove.sql removes the demo"

# An athlete who also belongs to another school stays, linked to that school only.
remove_check "$(cat <<'SQL'
insert into public.schools (id, name) values ('11111111-1111-4111-8111-111111111111', 'Other Test School');
insert into public.athlete_schools (athlete_id, school_id)
values ('00000000-0000-4000-8000-0000000000c1', '11111111-1111-4111-8111-111111111111');
SQL
)" "$(cat <<'SQL'
do $$
begin
  assert exists (select 1 from public.athletes where id = '00000000-0000-4000-8000-0000000000c1'),
    'the shared athlete stays';
  assert (select array_agg(school_id::text) from public.athlete_schools
          where athlete_id = '00000000-0000-4000-8000-0000000000c1') = array['11111111-1111-4111-8111-111111111111'],
    'the shared athlete keeps only the other school';
  assert not exists (select 1 from public.athlete_groups where athlete_id = '00000000-0000-4000-8000-0000000000c1'),
    'the shared athlete leaves the demo groups';
  assert not exists (select 1 from public.athlete_managers where athlete_id = '00000000-0000-4000-8000-0000000000c1'),
    'the demo guardian no longer manages the shared athlete';
  assert not exists (select 1 from public.athletes where id = '00000000-0000-4000-8000-0000000000c2'),
    'an athlete of the demo school only is removed';
end;
$$;
SQL
)"
echo "ok - seed-remove.sql keeps an athlete of another school"
