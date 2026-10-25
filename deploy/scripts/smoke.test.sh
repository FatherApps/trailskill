#!/bin/sh
# Starts deploy/compose.yaml against a stand-in Supabase Postgres and waits for PowerSync.
# Usage: sh deploy/scripts/smoke.test.sh   (needs Docker and curl; all data is synthetic)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
ID="ts-smoke-$$-$(date +%s)"
NET=$ID
TNET=$ID-traefik
DB=$ID-db
T=$(mktemp -d)
rand() { od -An -N12 -tx1 /dev/urandom | tr -d ' \n'; }
SUPER_PW=$(rand)

POWERSYNC_DB_PASSWORD=$(rand)
POWERSYNC_STORAGE_PASSWORD=$(rand)
SUPABASE_JWT_SECRET="$(rand)$(rand)"
SUPABASE_DB_HOST=$DB
SUPABASE_DB_PASSWORD=$SUPER_PW
DOKPLOY_NETWORK=$TNET
SUPABASE_NETWORK=$NET
export POWERSYNC_DB_PASSWORD POWERSYNC_STORAGE_PASSWORD SUPABASE_JWT_SECRET SUPABASE_DB_HOST SUPABASE_DB_PASSWORD DOKPLOY_NETWORK SUPABASE_NETWORK
# Compose runs from a copy of the needed files in the temp dir: Docker creates missing bind
# sources as empty directories, and powersync/ and supabase/ must never appear in the worktree.
R=$T/repo
mkdir -p "$R/deploy" "$R/powersync" "$R/supabase/migrations" "$R/.git"
cp -R "$HERE/../compose.yaml" "$HERE/../powersync" "$HERE/../scripts" "$R/deploy/"
cp "$HERE/../../powersync/sync-config.yaml" "$R/powersync/"
echo "SECRET_MARKER=$SUPER_PW" >"$R/deploy/.env" # Dokploy writes the service environment here
echo ref >"$R/.git/HEAD"
COMPOSE=$R/deploy/compose.yaml
dc() { docker compose -p "$ID" -f "$COMPOSE" -f "$T/override.yaml" "$@"; }

cleanup() {
  dc down -v --remove-orphans >/dev/null 2>&1
  docker rm -f "$DB" >/dev/null 2>&1
  docker network rm "$NET" "$TNET" >/dev/null 2>&1
  rm -rf "$T"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Publish PowerSync's port on a random localhost port (the real file publishes nothing).
cat >"$T/override.yaml" <<'YAML'
services:
  powersync:
    ports:
      - "127.0.0.1::8080"
YAML

docker network create "$NET" >/dev/null && docker network create "$TNET" >/dev/null || exit 2
# Stand-in for the Supabase database: logical WAL plus the publication the foundations migration will create.
docker run -d --name "$DB" --network "$NET" -e POSTGRES_PASSWORD="$SUPER_PW" postgres:17-alpine \
  -c wal_level=logical >/dev/null || exit 2
i=0
until docker exec "$DB" pg_isready -q -h 127.0.0.1 -U postgres; do
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "FAIL: stand-in database did not start"; exit 1; }
  sleep 1
done
docker exec "$DB" psql -X -U postgres -v ON_ERROR_STOP=1 -q -c 'create publication powersync for all tables' || exit 1

dc config -q || { echo "FAIL: compose config invalid"; exit 1; }
dc up -d || { echo "FAIL: compose up"; dc logs; exit 1; }

fail() { echo "FAIL: $1"; dc logs; exit 1; }

# migrate must finish with exit code 0
i=0
while :; do
  mid=$(dc ps -a -q migrate)
  state=$(docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$mid" 2>/dev/null)
  [ "$state" = "exited 0" ] && break
  case $state in exited*) fail "migrate exited with '$state'" ;; esac
  i=$((i + 1)); [ "$i" -gt 60 ] && fail "migrate did not finish"
  sleep 2
done
echo "PASS: migrate exited 0"

port=$(dc port powersync 8080 | sed 's/.*://')
[ -n "$port" ] || fail "powersync port not published"
i=0
until [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/probes/liveness")" = 200 ]; do
  i=$((i + 1)); [ "$i" -gt 60 ] && fail "powersync liveness did not return 200"
  sleep 2
done
echo "PASS: powersync liveness 200"
# By default PowerSync must load the repository's Sync Streams file without config errors.
# shellcheck disable=SC2016 # expansion must happen inside the container
dc exec -T powersync sh -c '[ "$PS_SYNC_CONFIG_PATH" = /sync/sync-config.yaml ] && [ -s "$PS_SYNC_CONFIG_PATH" ]' \
  || fail "powersync does not default to powersync/sync-config.yaml"
i=0
until dc logs powersync 2>&1 | grep -q '"Loaded sync config"'; do
  i=$((i + 1)); [ "$i" -gt 30 ] && fail "powersync did not load the sync config"
  sleep 2
done
dc logs powersync 2>&1 | grep -qE 'PSYNC_S1141|PSYNC_S2302' && fail "powersync reported a sync config error"
echo "PASS: powersync loaded the Sync Streams config"
# Neither container may see .env, .git or the rest of the repository.
dc exec -T powersync sh -c '
  [ ! -e /repo ] && [ ! -e /config/.env ] && [ ! -e /sync/.env ] &&
  [ ! -e /config/.git ] && [ ! -e /sync/.git ] && [ ! -e /config/../deploy ]' \
  || fail "powersync can see files outside its mounts"
echo "PASS: powersync sees no .env, .git or repo root"
# shellcheck disable=SC2016 # expansion must happen inside the container
dc run --rm --no-deps -T --entrypoint sh migrate -c '
  [ "$(ls -A /repo)" = supabase ] && [ ! -e /scripts/.env ] && [ ! -e /scripts/../.env ] &&
  [ ! -e /repo/.git ] && [ ! -e /repo/deploy ]' \
  || fail "migrate can see files outside its mounts"
echo "PASS: migrate sees only scripts and supabase"
echo "ALL PASSED"
