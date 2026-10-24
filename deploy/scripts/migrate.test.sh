#!/bin/sh
# Runs deploy/scripts/migrate.sh against a throwaway Postgres in Docker.
# Usage: sh deploy/scripts/migrate.test.sh   (needs Docker; all data is synthetic)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
IMG=postgres:17-alpine
ID="ts-migtest-$$-$(date +%s)"
NET=$ID
DB=$ID-db
T=$(mktemp -d)
rand() { od -An -N12 -tx1 /dev/urandom | tr -d ' \n'; }
SUPER_PW=$(rand)
PS_PW=$(rand)
PS_PW2=$(rand)
FAILS=0

cleanup() {
  docker rm -f "$DB" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  rm -rf "$T"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Superuser query on database $1, tuples only.
sql() { docker exec "$DB" psql -X -U postgres -d "$1" -Atq -v ON_ERROR_STOP=1 -c "$2" 2>&1; }

# Query as powersync_role over the network, password $1.
as_ps() {
  docker run --rm --network "$NET" -e PGPASSWORD="$1" "$IMG" \
    psql -X -h "$DB" -U powersync_role -d "$2" -Atq -v ON_ERROR_STOP=1 -c "$3" 2>&1
}

# migrate DBNAME MIGRATIONS_SUBDIR [docker run options...]; output goes to $T/out.
migrate() {
  d=$1; m=$2; shift 2
  docker run --rm --network "$NET" \
    --mount "type=bind,src=$HERE/migrate.sh,dst=/migrate.sh,readonly" \
    --mount "type=bind,src=$T/fx,dst=/fx,readonly" \
    -e PGHOST="$DB" -e PGUSER=postgres -e PGPASSWORD="$SUPER_PW" -e PGDATABASE="$d" \
    -e POWERSYNC_DB_PASSWORD="$PS_PW" -e MIGRATIONS_DIR="/fx/$m" -e SEED_FILE=/fx/seed.sql \
    "$@" "$IMG" sh /migrate.sh >"$T/out" 2>&1
}

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1 ($2)"; FAILS=$((FAILS + 1)); }
eq() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "expected '$2', got '$3'"; sed 's/^/    | /' "$T/out" 2>/dev/null; fi; }
nonzero() { if [ "$2" -ne 0 ]; then pass "$1"; else fail "$1" "exit code was 0"; fi; }
newdb() { sql postgres "create database $1" >/dev/null; }

# --- fixtures (synthetic) ---------------------------------------------------
mkdir -p "$T/fx/ok" "$T/fx/okplus" "$T/fx/failing" "$T/fx/badname"
cat >"$T/fx/ok/20260101000000_core_create_a.sql" <<'SQL'
create table public.a (id int primary key);
insert into public.a values (1);
SQL
cat >"$T/fx/ok/20260101000001_core_create_b.sql" <<'SQL'
create table public.b (a_id int references public.a (id));
insert into public.b values (1);
SQL
cp "$T/fx/ok/"*.sql "$T/fx/okplus/"
cp "$T/fx/ok/"*.sql "$T/fx/failing/"
cat >"$T/fx/okplus/20260101000002_core_late.sql" <<'SQL'
create table public.late_mig (id int);
SQL
cat >"$T/fx/failing/20260101000002_core_fail.sql" <<'SQL'
create table public.c (id int);
insert into public.c values (1);
select 1 / 0;
SQL
cat >"$T/fx/failing/20260101000003_core_later.sql" <<'SQL'
create table public.d (id int);
SQL
echo 'create table public.nope (id int);' >"$T/fx/badname/notanumber.sql"
cat >"$T/fx/seed.sql" <<'SQL'
insert into public.a values (100), (101);
SQL

# --- infrastructure ---------------------------------------------------------
docker network create "$NET" >/dev/null || { echo "cannot create docker network"; exit 2; }
docker run -d --name "$DB" --network "$NET" -e POSTGRES_PASSWORD="$SUPER_PW" "$IMG" >/dev/null || exit 2
i=0
until docker exec "$DB" pg_isready -q -h 127.0.0.1 -U postgres; do
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "postgres did not start"; exit 2; }
  sleep 1
done

versions() { sql "$1" "select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations"; }

# --- 1. ordered apply -------------------------------------------------------
newdb t1
migrate t1 ok; rc=$?
eq "apply: exit 0" 0 "$rc"
eq "apply: both versions recorded" "20260101000000,20260101000001" "$(versions t1)"
eq "apply: dependent migration ran after its dependency" "1" "$(sql t1 'select count(*) from public.b')"
eq "apply: name recorded" "core_create_a" "$(sql t1 "select name from supabase_migrations.schema_migrations where version = '20260101000000'")"

# --- 2. idempotent rerun ----------------------------------------------------
migrate t1 ok; rc=$?
eq "rerun: exit 0" 0 "$rc"
eq "rerun: nothing applied" 0 "$(grep -c '^applied' "$T/out")"
eq "rerun: no notice noise" 0 "$(grep -c NOTICE "$T/out")"
eq "rerun: no duplicate rows" 1 "$(sql t1 'select count(*) from public.a')"

# --- 3. failing migration ---------------------------------------------------
migrate t1 failing; rc=$?
nonzero "failure: exit code non-zero" "$rc"
eq "failure: no partial objects from the failing file" "f" "$(sql t1 "select to_regclass('public.c') is not null")"
eq "failure: failing version not recorded" "20260101000000,20260101000001" "$(versions t1)"
eq "failure: later migration not applied" "f" "$(sql t1 "select to_regclass('public.d') is not null")"

# --- 4. invalid filename ----------------------------------------------------
newdb t2
migrate t2 badname; rc=$?
nonzero "filename: invalid name fails" "$rc"
eq "filename: nothing applied" "f" "$(sql t2 "select to_regclass('public.nope') is not null")"

# --- 5. seed ----------------------------------------------------------------
newdb t3
migrate t3 ok; rc=$?
eq "seed off: exit 0" 0 "$rc"
eq "seed off: not applied" 1 "$(sql t3 'select count(*) from public.a')"
migrate t3 ok -e APPLY_SEED=true; rc=$?
eq "seed on: exit 0" 0 "$rc"
eq "seed on: applied" 3 "$(sql t3 'select count(*) from public.a')"
migrate t3 ok -e APPLY_SEED=true; rc=$?
eq "seed rerun: exit 0" 0 "$rc"
eq "seed rerun: no duplicate rows" 3 "$(sql t3 'select count(*) from public.a')"

# --- 5b. APPLY_SEED validation ---------------------------------------------
migrate t3 ok -e APPLY_SEED=yes; rc=$?
nonzero "seed flag: invalid value fails" "$rc"
eq "seed flag: message names APPLY_SEED" 1 "$(grep -c 'APPLY_SEED must be' "$T/out")"

# --- 6. powersync_role ------------------------------------------------------
newdb t4
migrate t4 ok; rc=$?
eq "role: first run exit 0" 0 "$rc"
eq "role: login, replication, bypassrls" "t|t|t" \
  "$(sql t4 "select rolcanlogin, rolreplication, rolbypassrls from pg_roles where rolname = 'powersync_role'" | tr -d ' ')"
sql t4 "create table public.late_direct (id int)" >/dev/null
eq "role: reads a table created afterwards (default privileges)" 0 "$(as_ps "$PS_PW" t4 'select count(*) from public.late_direct')"
migrate t4 okplus; rc=$?
eq "role: run with new migration exit 0" 0 "$rc"
eq "role: reads a table created by a later migration" 0 "$(as_ps "$PS_PW" t4 'select count(*) from public.late_mig')"
migrate t4 okplus -e POWERSYNC_DB_PASSWORD="$PS_PW2"; rc=$?
eq "role: password change exit 0" 0 "$rc"
as_ps "$PS_PW" t4 'select 1' >/dev/null; rc=$?
nonzero "role: old password rejected" "$rc"
eq "role: new password works" 0 "$(as_ps "$PS_PW2" t4 'select count(*) from public.late_mig')"

# --- no secrets in output ---------------------------------------------------
migrate t4 okplus -e POWERSYNC_DB_PASSWORD="$PS_PW2"
eq "output: passwords not printed" 0 "$(grep -c -e "$PS_PW2" -e "$SUPER_PW" "$T/out")"

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL PASSED"; else echo "$FAILS FAILED"; exit 1; fi
