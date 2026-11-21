#!/bin/sh
# Applies supabase/migrations to the Supabase Postgres, prepares the PowerSync role and schedules the pg_cron jobs.
# Runs under busybox ash in postgres:17-alpine. Connection: libpq env vars
# (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE). Never prints a password.
#
# Env: POWERSYNC_DB_PASSWORD (required), APPLY_SEED (default false),
#      MIGRATIONS_DIR (default /repo/supabase/migrations), SEED_FILE (default /repo/supabase/seed.sql)
#      BACKUP_BEFORE_MIGRATE  required: `required` or `off`, any other value is an error. With `required`, when at least
#                             one migration is pending AND supabase_migrations.schema_migrations already has rows, a
#                             verified backup (backup-prod.sh with BACKUP_REASON=pre-migration) must succeed before the
#                             first migration is applied; if it fails, or the lock is not obtained, this script exits 1
#                             before applying anything, so PowerSync does not start. `off` never makes a backup (local only).
#      BACKUP_SCRIPT          the backup command (default: backup-prod.sh next to this script; tests replace it)
#      BACKUP_LOCK_FILE       lock shared with the scheduled backup (default /backup-lock/lock, a named volume)
#      BACKUP_LOCK_WAIT_SECONDS  how long to wait for that lock (default 600); it never runs in parallel with another backup
#      BACKUP_PGUSER, BACKUP_PGPASSWORD  optional, both or none: the role the backup connects as (it must be able to dump
#                             every schema); by default the backup uses PGUSER and PGPASSWORD. The backup also reads
#                             BACKUP_AGE_RECIPIENT, BACKUP_RCLONE_REMOTE, RCLONE_CONFIG_R2_*, BACKUP_PUSH_CMD and
#                             BACKUP_MIN_COUNTS (see backup-prod.sh and backup-r2.sh). Values are never printed.
set -eu

: "${POWERSYNC_DB_PASSWORD:?POWERSYNC_DB_PASSWORD is required}"
export POWERSYNC_DB_PASSWORD
APPLY_SEED=${APPLY_SEED:-false}
MIGRATIONS_DIR=${MIGRATIONS_DIR:-/repo/supabase/migrations}
SEED_FILE=${SEED_FILE:-/repo/supabase/seed.sql}
LC_ALL=C
export LC_ALL
# Hide "already exists, skipping" notices; warnings and errors still show.
PGOPTIONS="-c client_min_messages=warning"
export PGOPTIONS

case $APPLY_SEED in
  true | false) ;;
  *) echo "error: APPLY_SEED must be 'true' or 'false', got '$APPLY_SEED'" >&2; exit 1 ;;
esac

case ${BACKUP_BEFORE_MIGRATE:-} in
  required | off) ;;
  *) echo "error: BACKUP_BEFORE_MIGRATE must be 'required' or 'off', got '${BACKUP_BEFORE_MIGRATE:-}'" >&2; exit 1 ;;
esac
BACKUP_SCRIPT=${BACKUP_SCRIPT:-$(dirname "$0")/backup-prod.sh}
BACKUP_LOCK_FILE=${BACKUP_LOCK_FILE:-/backup-lock/lock}
BACKUP_LOCK_WAIT_SECONDS=${BACKUP_LOCK_WAIT_SECONDS:-600}
if [ "$BACKUP_BEFORE_MIGRATE" = required ]; then
  case $BACKUP_LOCK_WAIT_SECONDS in
    '' | *[!0-9]* | ????????*) echo "error: BACKUP_LOCK_WAIT_SECONDS must be a whole number of seconds (at most 9999999), got '$BACKUP_LOCK_WAIT_SECONDS'" >&2; exit 1 ;;
  esac
  if [ -n "${BACKUP_PGUSER:-}" ] && [ -z "${BACKUP_PGPASSWORD:-}" ]; then
    echo "error: BACKUP_PGUSER is set but BACKUP_PGPASSWORD is not" >&2
    exit 1
  fi
fi

PSQL="psql -X -v ON_ERROR_STOP=1 -q"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

log() { echo "$*"; }

# a. wait for the database
tries=0
until $PSQL -Atc 'select 1' >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -ge 30 ]; then
    log "error: database not reachable after $tries attempts" >&2
    exit 1
  fi
  sleep 2
done
log "database reachable"

# b. powersync_role. The password is sent only when the role is created or no longer works,
#    so it does not show up in server logs on every deploy. psql reads it with \getenv.
role_exists=$($PSQL -Atq -c "select 1 from pg_roles where rolname = 'powersync_role'")
if [ -z "$role_exists" ]; then
  $PSQL <<'SQL'
\getenv pw POWERSYNC_DB_PASSWORD
select format('create role powersync_role with login replication bypassrls password %L', :'pw') \gexec
SQL
  log "role powersync_role created"
else
  $PSQL -c 'alter role powersync_role with login replication bypassrls'
  if PGUSER=powersync_role PGPASSWORD=$POWERSYNC_DB_PASSWORD $PSQL -Atc 'select 1' >/dev/null 2>&1; then
    log "role powersync_role ready"
  else
    $PSQL <<'SQL'
\getenv pw POWERSYNC_DB_PASSWORD
select format('alter role powersync_role with password %L', :'pw') \gexec
SQL
    log "role powersync_role password updated"
  fi
fi

# c. migration bookkeeping (same table as the Supabase CLI)
$PSQL <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key, statements text[], name text);
create table if not exists supabase_migrations.seed_files (
  path text not null primary key, hash text not null);
SQL

cat >"$TMP/record_migration.sql" <<'SQL'
insert into supabase_migrations.schema_migrations (version, name) values (:'version', :'name');
SQL
cat >"$TMP/record_seed.sql" <<'SQL'
insert into supabase_migrations.seed_files (path, hash) values (:'path', :'hash');
SQL

# is_applied VERSION: prints 1 when the migration is already recorded
is_applied() {
  $PSQL -Atq -v version="$1" <<'SQL'
select 1 from supabase_migrations.schema_migrations where version = :'version';
SQL
}

# c2. backup before migrating. Validate every name first so a bad file stops the run before a backup is taken.
pending=0
if [ -d "$MIGRATIONS_DIR" ]; then
  for f in "$MIGRATIONS_DIR"/*.sql; do
    [ -e "$f" ] || continue
    if ! echo "${f##*/}" | grep -Eq '^[0-9]+_.+\.sql$'; then
      log "error: invalid migration filename '${f##*/}' (expected <digits>_<name>.sql)" >&2
      exit 1
    fi
  done
  for f in "$MIGRATIONS_DIR"/*.sql; do
    [ -e "$f" ] || continue
    base=${f##*/}
    seen=$(is_applied "${base%%_*}")
    [ -n "$seen" ] || pending=$((pending + 1))
  done
fi
recorded=$($PSQL -Atq -c 'select count(*) from supabase_migrations.schema_migrations')

# Runs with the lock on fd 9 (the caller opens it): busybox flock has no timeout, so poll without blocking.
# The lock is held while the backup runs and released when the caller's redirection ends.
run_backup() {
  waited=0
  until flock -n 9; do
    if [ "$waited" -ge "$BACKUP_LOCK_WAIT_SECONDS" ]; then
      echo "error: could not get the backup lock within $BACKUP_LOCK_WAIT_SECONDS s; nothing was applied" >&2
      return 1
    fi
    [ "$waited" -gt 0 ] || log "waiting for the backup lock (up to $BACKUP_LOCK_WAIT_SECONDS s)"
    sleep 1
    waited=$((waited + 1))
  done
  log "running the backup before migrating ($pending pending, $recorded recorded)"
  (
    if [ -n "${BACKUP_PGUSER:-}" ]; then
      PGUSER=$BACKUP_PGUSER
      PGPASSWORD=$BACKUP_PGPASSWORD
      export PGUSER PGPASSWORD
    fi
    BACKUP_REASON=pre-migration
    export BACKUP_REASON
    sh "$BACKUP_SCRIPT"
  )
}

if [ "$pending" -eq 0 ]; then
  log "backup before migrating: not needed (no pending migrations)"
elif [ "$recorded" -eq 0 ]; then
  log "backup before migrating: not needed (nothing recorded yet, first deploy)"
elif [ "$BACKUP_BEFORE_MIGRATE" = off ]; then
  log "backup before migrating: skipped (BACKUP_BEFORE_MIGRATE=off)"
else
  if ! run_backup 9>"$BACKUP_LOCK_FILE"; then
    echo "error: the backup before migrating failed; no migration was applied" >&2
    exit 1
  fi
fi

# d. migrations
if [ -d "$MIGRATIONS_DIR" ]; then
  for f in "$MIGRATIONS_DIR"/*.sql; do
    [ -e "$f" ] || continue
    base=${f##*/}
    version=${base%%_*}
    name=${base#*_}
    name=${name%.sql}
    done_already=$(is_applied "$version")
    if [ -n "$done_already" ]; then
      log "skipped $version $name"
      continue
    fi
    $PSQL --single-transaction -v version="$version" -v name="$name" \
      -f "$f" -f "$TMP/record_migration.sql" >/dev/null
    log "applied $version $name"
  done
else
  log "no migrations directory at $MIGRATIONS_DIR, skipping"
fi

# e. PowerSync read access to public (now and for future tables)
$PSQL <<'SQL'
grant usage on schema public to powersync_role;
grant select on all tables in schema public to powersync_role;
alter default privileges in schema public grant select on tables to powersync_role;
SQL
log "grants for powersync_role applied"

# f. scheduled jobs (pg_cron). Never fails the run: the function returns 0 without pg_cron and, when
#    cron.schedule is refused, warns with the SQLSTATE and returns 0; a failed call only logs a warning.
#    Skipped when no migration defines the function yet. stderr holds only the SQLSTATE or a psql error.
if [ "$($PSQL -Atq -c "select to_regprocedure('app.schedule_family_timing_jobs()') is not null")" = "t" ]; then
  if scheduled=$($PSQL -Atq -c 'select app.schedule_family_timing_jobs()' 2>"$TMP/sched.err") &&
     ! grep -q 'scheduled jobs failed' "$TMP/sched.err"; then
    if [ "$scheduled" = "0" ]; then
      log "scheduled jobs: 0 (pg_cron not installed, nothing scheduled)"
    else
      log "scheduled jobs: $scheduled"
    fi
  else
    reason=$(grep -m1 'scheduled jobs failed' "$TMP/sched.err" | sed 's/.*scheduled jobs failed: *//')
    log "WARN scheduled jobs failed: ${reason:-call failed}"
  fi
else
  log "no scheduled jobs function, skipping"
fi

# g. seed (development only)
if [ "$APPLY_SEED" = "true" ]; then
  if [ -f "$SEED_FILE" ]; then
    seed_path="supabase/${SEED_FILE##*/}"
    seed_hash=$(sha256sum "$SEED_FILE" | cut -d' ' -f1)
    recorded=$($PSQL -Atq -v path="$seed_path" <<'SQL'
select hash from supabase_migrations.seed_files where path = :'path';
SQL
    )
    if [ -z "$recorded" ]; then
      $PSQL --single-transaction -v path="$seed_path" -v hash="$seed_hash" \
        -f "$SEED_FILE" -f "$TMP/record_seed.sql" >/dev/null
      log "seed applied $seed_path"
    elif [ "$recorded" = "$seed_hash" ]; then
      log "seed skipped $seed_path (already applied)"
    else
      log "warning: seed $seed_path changed since it was applied; not re-applied"
    fi
  else
    log "APPLY_SEED=true but $SEED_FILE not found, skipping"
  fi
else
  log "seed not requested"
fi
log "migrate done"
