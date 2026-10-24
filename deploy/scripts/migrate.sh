#!/bin/sh
# Applies supabase/migrations to the Supabase Postgres and prepares the PowerSync role.
# Runs under busybox ash in postgres:17-alpine. Connection: libpq env vars
# (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE). Never prints a password.
#
# Env: POWERSYNC_DB_PASSWORD (required), APPLY_SEED (default false),
#      MIGRATIONS_DIR (default /repo/supabase/migrations), SEED_FILE (default /repo/supabase/seed.sql)
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

# d. migrations
if [ -d "$MIGRATIONS_DIR" ]; then
  # Validate every name first so a bad file stops the run before anything is applied.
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
    version=${base%%_*}
    name=${base#*_}
    name=${name%.sql}
    done_already=$($PSQL -Atq -v version="$version" <<'SQL'
select 1 from supabase_migrations.schema_migrations where version = :'version';
SQL
    )
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

# f. seed (development only)
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
