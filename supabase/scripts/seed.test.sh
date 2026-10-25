#!/bin/sh
# Checks the demo seed (supabase/seed.sql) on a database where it is already
# applied, normally a fresh `supabase db reset`:
#   1. applying it again changes no row;
#   2. each demo account sees what its role allows;
#   3. supabase/scripts/seed-remove.sql removes it (inside a rolled-back
#      transaction, so the database is left as it was).
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

-- Guardian: the two athletes they manage, their times and authorizations; no plans.
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
  assert not exists (select 1 from public.training_plans), 'guardian sees no training plans';
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
end;
$$;
rollback;
SQL
echo "ok - each demo account sees what its role allows"

{
  echo 'begin;'
  cat "$dir/seed-remove.sql"
  cat <<'SQL'
do $$
begin
  assert not exists (select 1 from public.schools where id = '00000000-0000-4000-8000-0000000000a1'), 'school removed';
  assert not exists (select 1 from public.athletes where id::text like '00000000-0000-4000-8000-0000000000%'), 'athletes removed';
  assert not exists (select 1 from public.measurements where created_by::text like '00000000-0000-4000-8000-00000000000%'), 'times removed';
  assert not exists (select 1 from auth.users where email like 'demo-%@example.test'), 'accounts removed';
end;
$$;
rollback;
SQL
} | psql_run
echo "ok - seed-remove.sql removes the demo"
