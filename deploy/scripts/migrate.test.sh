#!/bin/sh
# Runs deploy/scripts/migrate.sh against a throwaway Postgres in Docker.
# Usage: sh deploy/scripts/migrate.test.sh   (needs Docker; all data is synthetic)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
IMG=postgres:17-alpine
ID="ts-migtest-$$-$(date +%s)"
NET=$ID
DB=$ID-db
LOCKVOL=$ID-lock
HOLDER=$ID-holder
T=$(mktemp -d)
rand() { od -An -N12 -tx1 /dev/urandom | tr -d ' \n'; }
SUPER_PW=$(rand)
PS_PW=$(rand)
PS_PW2=$(rand)
FAILS=0

cleanup() {
  docker rm -f -v "$HOLDER" >/dev/null 2>&1
  docker rm -f "$DB" >/dev/null 2>&1
  docker volume rm "$LOCKVOL" >/dev/null 2>&1
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
    -e BACKUP_BEFORE_MIGRATE=off \
    "$@" "$IMG" sh /migrate.sh >"$T/out" 2>&1
}

# mig_bk DBNAME MIGRATIONS_SUBDIR STUB [docker run options...]: the gate on, the backup replaced by a stub from
# $T/bk (the real script needs age and an R2 bucket; its own tests are in backup-prod.test.sh), the lock on a
# named volume shared with the holder container.
mig_bk() {
  d=$1; m=$2; stub=$3; shift 3
  migrate "$d" "$m" --mount "type=bind,src=$T/bk,dst=/bk,readonly" -v "$LOCKVOL:/backup-lock" \
    -e BACKUP_BEFORE_MIGRATE=required -e BACKUP_SCRIPT="/bk/$stub" -e BACKUP_LOCK_FILE=/backup-lock/lock "$@"
}

# mig_real DBNAME MIGRATIONS_SUBDIR [docker run options...]: the gate on with the real backup-prod.sh.
mig_real() {
  d=$1; m=$2; shift 2
  mig_bk "$d" "$m" real.sh -e PATH=/bk/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    -e BACKUP_AGE_RECIPIENT=age1synthetic -e BACKUP_PUSH_CMD='sh /bk/push.sh "$0" "$@"' \
    -e BACKUP_COUNT_TABLES="public.a public.b" "$@"
}

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1 ($2)"; FAILS=$((FAILS + 1)); }
eq() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "expected '$2', got '$3'"; sed 's/^/    | /' "$T/out" 2>/dev/null; fi; }
nonzero() { if [ "$2" -ne 0 ]; then pass "$1"; else fail "$1" "exit code was 0"; fi; }
newdb() { sql postgres "create database $1" >/dev/null; }

# --- fixtures (synthetic) ---------------------------------------------------
mkdir -p "$T/fx/ok" "$T/fx/okplus" "$T/fx/failing" "$T/fx/badname" "$T/fx/sched" "$T/fx/schedfail" "$T/fx/schedwarn"
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
cp "$T/fx/ok/"*.sql "$T/fx/sched/"
cat >"$T/fx/sched/20260101000002_core_app_schema.sql" <<'SQL'
-- the Supabase roles the real migration revokes from
select format('create role %I', r) from unnest(array['anon', 'authenticated']) r where not exists (select 1 from pg_roles where rolname = r) \gexec
create schema if not exists app;
create function app.purge_family_timing_measurements() returns integer language sql as 'select 0';
create function app.expire_family_timing_transfers() returns integer language sql as 'select 0';
SQL
cp "$HERE/../../supabase/migrations/20261115080000_family-timing_schedule_jobs.sql" "$T/fx/sched/20260101000003_family-timing_schedule_jobs.sql"
# Stubs that replace the function after the real migration, standing in for pg_cron refusing to schedule.
cp "$T/fx/sched/"*.sql "$T/fx/schedfail/"
cp "$T/fx/sched/"*.sql "$T/fx/schedwarn/"
cat >"$T/fx/schedfail/20260101000004_stub_fail.sql" <<'SQL'
create or replace function app.schedule_family_timing_jobs() returns integer language plpgsql as $$
begin raise exception 'boom' using errcode = '42501'; end;
$$;
SQL
cat >"$T/fx/schedwarn/20260101000004_stub_warn.sql" <<'SQL'
create or replace function app.schedule_family_timing_jobs() returns integer language plpgsql as $$
begin raise warning 'scheduled jobs failed: SQLSTATE 42501'; return 0; end;
$$;
SQL
echo 'create table public.nope (id int);' >"$T/fx/badname/notanumber.sql"
cat >"$T/fx/seed.sql" <<'SQL'
insert into public.a values (100), (101);
SQL

mkdir -p "$T/bk"
cat >"$T/bk/ok.sh" <<'SH'
#!/bin/sh
echo "STUB backup reason=$BACKUP_REASON user=$PGUSER versions=$(psql -X -Atc 'select count(*) from supabase_migrations.schema_migrations')"
SH
cat >"$T/bk/fail.sh" <<'SH'
#!/bin/sh
echo "STUB backup failing" >&2
exit 1
SH

# The real backup-prod.sh with only its outside tools replaced: an `age` that writes the header the script checks for
# and a push command that prints the reason the manifest recorded. pg_dump, pg_restore and psql are the image's own.
cp "$HERE/backup-prod.sh" "$T/bk/real.sh"
mkdir -p "$T/bk/bin"
cat >"$T/bk/bin/age" <<'SH'
#!/bin/sh
while [ $# -gt 0 ]; do case $1 in -o) out=$2; shift ;; -r) shift ;; *) in=$1 ;; esac; shift; done
{ echo age-encryption.org/v1; cat "$in"; } >"$out"
SH
cat >"$T/bk/push.sh" <<'SH'
#!/bin/sh
[ "$1" = push ] || exit 9
echo "PUSHED reason=$(sed -n 's/^backup_reason=//p' "$3")"
SH
chmod +x "$T/bk/bin/age"

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
eq "apply: scheduled jobs step skipped without the function" 1 "$(grep -c 'no scheduled jobs function, skipping' "$T/out")"
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

# --- 7. scheduled jobs without pg_cron (the image has none) -----------------
newdb t5
migrate t5 sched; rc=$?
eq "schedule: exit 0 without pg_cron" 0 "$rc"
eq "schedule: reports nothing scheduled" 1 "$(grep -c 'scheduled jobs: 0' "$T/out")"
eq "schedule: no cron schema created" "t" "$(sql t5 "select to_regnamespace('cron') is null")"
migrate t5 sched; rc=$?
eq "schedule rerun: exit 0" 0 "$rc"
eq "schedule rerun: nothing applied" 0 "$(grep -c '^applied' "$T/out")"
eq "schedule rerun: reports nothing scheduled" 1 "$(grep -c 'scheduled jobs: 0' "$T/out")"

# --- 7b. a scheduling failure never fails the deploy ---------------------------
# The image has no pg_cron, so these stubs stand in for it; the real "pg_cron present" paths are in
# supabase/tests/database/family-timing/scheduled_jobs.test.sql.
newdb t6
migrate t6 schedfail; rc=$?
eq "schedule error: exit 0" 0 "$rc"
eq "schedule error: warns" 1 "$(grep -c '^WARN scheduled jobs failed' "$T/out")"
eq "schedule error: later steps still run" 1 "$(grep -c '^migrate done' "$T/out")"
newdb t7
migrate t7 schedwarn; rc=$?
eq "schedule warning: exit 0" 0 "$rc"
eq "schedule warning: warns with the SQLSTATE" 1 "$(grep -c '^WARN scheduled jobs failed: SQLSTATE 42501' "$T/out")"
eq "schedule warning: not reported as nothing to schedule" 0 "$(grep -c 'scheduled jobs: 0 (pg_cron not installed' "$T/out")"
eq "schedule warning: later steps still run" 1 "$(grep -c '^migrate done' "$T/out")"

# --- 8. backup before migrating (#1336) ----------------------------------------
docker volume create "$LOCKVOL" >/dev/null || exit 2
stub_runs() { grep -c '^STUB backup' "$T/out"; }

# 8a. empty schema_migrations (first deploy): no backup, migrations apply as today
newdb t10
mig_bk t10 ok ok.sh; rc=$?
eq "gate: first deploy exit 0" 0 "$rc"
eq "gate: first deploy (no rows in schema_migrations) makes no backup" 0 "$(stub_runs)"
eq "gate: first deploy applies the migrations" "20260101000000,20260101000001" "$(versions t10)"

# 8b. nothing pending: no backup
mig_bk t10 ok ok.sh; rc=$?
eq "gate: nothing pending exit 0" 0 "$rc"
eq "gate: nothing pending makes no backup" 0 "$(stub_runs)"
eq "gate: nothing pending still finishes" 1 "$(grep -c '^migrate done' "$T/out")"

# 8c. one pending migration and rows already recorded: backup first, with reason pre-migration
mig_bk t10 okplus ok.sh; rc=$?
eq "gate: pending migration exit 0" 0 "$rc"
eq "gate: backup ran once" 1 "$(stub_runs)"
eq "gate: backup ran before the pending migration was applied, with the reason" "STUB backup reason=pre-migration user=postgres versions=2" "$(grep '^STUB backup' "$T/out")"
eq "gate: the pending migration was then applied" "20260101000000,20260101000001,20260101000002" "$(versions t10)"
eq "gate: backup output comes before the applied line" 1 "$(awk '/^STUB backup/{s=NR} /^applied 20260101000002/{a=NR} END{print (s && a && s<a) ? 1 : 0}' "$T/out")"

# 8d. the backup fails: exit 1, nothing applied, PowerSync steps not reached
newdb t11
migrate t11 ok; rc=$?
eq "failed backup: setup exit 0" 0 "$rc"
mig_bk t11 okplus fail.sh; rc=$?
eq "failed backup: exit code 1" 1 "$rc"
eq "failed backup: no new row in schema_migrations" "20260101000000,20260101000001" "$(versions t11)"
eq "failed backup: the pending migration did not run" "f" "$(sql t11 "select to_regclass('public.late_mig') is not null")"
eq "failed backup: says so" 1 "$(grep -c 'the backup before migrating failed; no migration was applied' "$T/out")"
eq "failed backup: nothing applied" 0 "$(grep -c '^applied' "$T/out")"
eq "failed backup: later steps not reached" 0 "$(grep -c -e 'grants for powersync_role applied' -e '^migrate done' "$T/out")"

# 8e. BACKUP_BEFORE_MIGRATE=off: no backup even with a pending migration and a failing backup script
mig_bk t11 okplus fail.sh -e BACKUP_BEFORE_MIGRATE=off; rc=$?
eq "off: exit 0" 0 "$rc"
eq "off: no backup attempted" 0 "$(grep -c 'STUB backup' "$T/out")"
eq "off: the pending migration was applied" "20260101000000,20260101000001,20260101000002" "$(versions t11)"

# 8f. other values and an empty value are errors before the migrations step
newdb t12
for v in yes true REQUIRED Off ""; do
  mig_bk t12 ok ok.sh -e BACKUP_BEFORE_MIGRATE="$v"; rc=$?
  eq "value '$v': exit 1" 1 "$rc"
  eq "value '$v': names the variable" 1 "$(grep -c 'BACKUP_BEFORE_MIGRATE' "$T/out")"
  eq "value '$v': nothing applied, no bookkeeping table" "f" "$(sql t12 "select to_regclass('supabase_migrations.schema_migrations') is not null")"
done

# 8g. the real script end to end: the reason reaches the manifest and the backup runs before the migration
newdb t13
migrate t13 ok >/dev/null
mig_real t13 okplus; rc=$?
eq "real backup: exit 0" 0 "$rc"
eq "real backup: the manifest says pre-migration" 1 "$(grep -c '^PUSHED reason=pre-migration$' "$T/out")"
eq "real backup: pushed before the migration was applied" 1 "$(awk '/^PUSHED/{s=NR} /^applied 20260101000002/{a=NR} END{print (s && a && s<a) ? 1 : 0}' "$T/out")"
eq "real backup: the pending migration was then applied" "20260101000000,20260101000001,20260101000002" "$(versions t13)"

# 8h. a dedicated backup role, used by the backup only (the pair is handled in backup-prod.sh)
newdb t14
migrate t14 ok >/dev/null
sql t14 "create role bk_role login superuser password 'bk-synthetic'" >/dev/null
mig_real t14 okplus -e BACKUP_PGUSER=bk_role -e BACKUP_PGPASSWORD=bk-synthetic; rc=$?
eq "backup role: exit 0" 0 "$rc"
eq "backup role: the backup ran" 1 "$(grep -c '^PUSHED reason=pre-migration$' "$T/out")"
newdb t15
migrate t15 ok >/dev/null
sql t15 "create role bk_role login superuser password 'bk-synthetic'" >/dev/null
mig_real t15 okplus -e BACKUP_PGUSER=bk_role -e BACKUP_PGPASSWORD=wrong; rc=$?
eq "backup role with a wrong password: exit 1 (the pair really replaces the migrate login)" 1 "$rc"
eq "backup role with a wrong password: nothing applied" "20260101000000,20260101000001" "$(versions t15)"
mig_real t15 okplus -e BACKUP_PGUSER=bk_role; rc=$?
eq "backup role without password: exit 1" 1 "$rc"
eq "backup role without password: names BACKUP_PGPASSWORD" 1 "$(grep -c 'BACKUP_PGPASSWORD' "$T/out")"
eq "backup role without password: nothing applied" "20260101000000,20260101000001" "$(versions t15)"

# 8i. the lock lives in backup-prod.sh only: held by another container, the backup waits, then fails, and migrate
#     exits 1 without applying anything
newdb t16
migrate t16 ok >/dev/null
hold() { # hold SECONDS: another container takes the lock file on the named volume for SECONDS
  docker run -d --name "$HOLDER" -v "$LOCKVOL:/backup-lock" "$IMG" \
    sh -c "exec 9>/backup-lock/lock; flock -n 9 || exit 1; echo held; sleep $1" >/dev/null || exit 2
  i=0
  until docker logs "$HOLDER" 2>&1 | grep -q '^held'; do
    i=$((i + 1)); [ "$i" -gt 30 ] && { echo "lock holder did not start"; exit 2; }
    sleep 1
  done
}
hold 300
t0=$(date +%s)
mig_real t16 okplus -e BACKUP_LOCK_WAIT_SECONDS=3; rc=$?
waited=$(($(date +%s) - t0))
eq "lock held: exit code 1" 1 "$rc"
eq "lock held: it waited for the bound" 1 "$([ "$waited" -ge 3 ] && echo 1 || echo 0)"
eq "lock held: says it gave up" 1 "$(grep -c 'could not get the backup lock within 3 s' "$T/out")"
eq "lock held: migrate says no migration was applied" 1 "$(grep -c 'the backup before migrating failed; no migration was applied' "$T/out")"
eq "lock held: no backup was pushed" 0 "$(grep -c '^PUSHED' "$T/out")"
eq "lock held: nothing applied" "20260101000000,20260101000001" "$(versions t16)"
docker rm -f -v "$HOLDER" >/dev/null 2>&1
mig_real t16 okplus -e BACKUP_LOCK_WAIT_SECONDS=3; rc=$?
eq "lock released: exit 0" 0 "$rc"
eq "lock released: backup ran and the migration was applied" "20260101000000,20260101000001,20260101000002" "$(versions t16)"

# 8i-2. the lock is released after a few seconds: the backup waits for it and goes on
newdb t17
migrate t17 ok >/dev/null
hold 4
mig_real t17 okplus -e BACKUP_LOCK_WAIT_SECONDS=60; rc=$?
eq "lock freed during the wait: exit 0" 0 "$rc"
eq "lock freed during the wait: it said it was waiting" 1 "$(grep -c 'waiting for the backup lock' "$T/out")"
eq "lock freed during the wait: backup ran, migration applied" "20260101000000,20260101000001,20260101000002" "$(versions t17)"
docker rm -f -v "$HOLDER" >/dev/null 2>&1

# 8j. invalid wait value (checked by backup-prod.sh, before it touches the database)
newdb t18
migrate t18 ok >/dev/null
mig_real t18 okplus -e BACKUP_LOCK_WAIT_SECONDS=abc; rc=$?
eq "lock wait: invalid value exit 1" 1 "$rc"
eq "lock wait: names the variable" 1 "$(grep -c 'BACKUP_LOCK_WAIT_SECONDS' "$T/out")"
eq "lock wait: nothing applied" "20260101000000,20260101000001" "$(versions t18)"

# --- no secrets in output ---------------------------------------------------
migrate t4 okplus -e POWERSYNC_DB_PASSWORD="$PS_PW2"
eq "output: passwords not printed" 0 "$(grep -c -e "$PS_PW2" -e "$SUPER_PW" "$T/out")"
newdb t19
migrate t19 ok >/dev/null
sql t19 "create role bk_role login superuser password 'bk-synthetic'" >/dev/null
mig_real t19 okplus -e BACKUP_PGUSER=bk_role -e BACKUP_PGPASSWORD=bk-synthetic
eq "output: backup password not printed" 0 "$(grep -c -e bk-synthetic -e "$SUPER_PW" "$T/out")"

# --- 9. compose (#1336) -----------------------------------------------------
ROOT=$(cd "$HERE/../.." && pwd)
cfg() { env -u BACKUP_BEFORE_MIGRATE docker compose -f "$ROOT/deploy/compose.yaml" --env-file "$1" config >"$T/out" 2>&1; }
cfg "$ROOT/deploy/local.env"; rc=$?
eq "compose: config works with local.env" 0 "$rc"
eq "compose: local.env turns the gate off" 1 "$(grep -c '^BACKUP_BEFORE_MIGRATE=off$' "$ROOT/deploy/local.env")"
eq "compose: migrate and backup use the same image" 2 "$(grep -c -x '    image: trailskill-deploy-backup-tools' "$T/out")"
eq "compose: backup runs busybox crond in the foreground" 1 "$(grep -c -x -e '      - crond' "$T/out")"
eq "compose: both services share the backup-lock volume" 2 "$(grep -c 'target: /backup-lock' "$T/out")"
eq "compose: TMPDIR is a tmpfs with mode 700 in both services" 2 "$(grep -c -x -e '      - /backup-tmp:mode=700' "$T/out")"
eq "compose: the crontab is copied into the image" 1 "$([ "$(grep -c 'COPY crontab /etc/crontabs/root' "$T/out")" -ge 1 ] && echo 1 || echo 0)"
eq "compose: the crontab is not bind-mounted" 0 "$(grep -c 'target: /etc/crontabs' "$T/out")"
eq "compose: the crontab takes no lock itself (backup-prod.sh does)" 0 "$(grep -c 'flock' "$ROOT/deploy/backup/crontab")"
grep -v '^BACKUP_BEFORE_MIGRATE=' "$ROOT/deploy/local.env" >"$T/no-gate.env"
cfg "$T/no-gate.env"; rc=$?
nonzero "compose: config fails without BACKUP_BEFORE_MIGRATE" "$rc"
eq "compose: the error names BACKUP_BEFORE_MIGRATE" 1 "$(grep -c 'BACKUP_BEFORE_MIGRATE' "$T/out")"
eq "compose: the crontab runs the daily backup at 08:30 UTC" 1 "$(grep -c '^30 8 \* \* \* ' "$ROOT/deploy/backup/crontab")"
eq "compose: no real values in the repository files" 0 "$(grep -c -E 'age1[a-z0-9]{20,}|AKIA' "$ROOT/deploy/compose.yaml" "$ROOT/deploy/local.env" "$ROOT/deploy/backup/crontab" | awk -F: '{s+=$2} END{print s+0}')"

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL PASSED"; else echo "$FAILS FAILED"; exit 1; fi
