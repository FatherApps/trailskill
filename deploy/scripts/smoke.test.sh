#!/bin/sh
# Starts deploy/compose.yaml against a stand-in Supabase Postgres and waits for PowerSync, then checks a sync config change restarts it.
# Also checks that the Edge Functions are delivered after migrate into a stand-in functions folder, that a function that fails
# deno check leaves that folder as it was and fails `compose up` without stopping PowerSync, and that local mode skips the delivery.
# Usage: sh deploy/scripts/smoke.test.sh   (needs Docker and curl; the first run downloads npm packages; all data is synthetic)
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
BACKUP_BEFORE_MIGRATE=off
export BACKUP_BEFORE_MIGRATE POWERSYNC_DB_PASSWORD POWERSYNC_STORAGE_PASSWORD SUPABASE_JWT_SECRET SUPABASE_DB_HOST SUPABASE_DB_PASSWORD DOKPLOY_NETWORK SUPABASE_NETWORK
# Compose runs from a copy of the needed files in the temp dir: Docker creates missing bind
# sources as empty directories, and powersync/ and supabase/ must never appear in the worktree.
R=$T/repo
mkdir -p "$R/deploy" "$R/powersync" "$R/supabase/migrations" "$R/supabase/functions" "$R/src/core/sport" "$R/.git"
cp -R "$HERE/../compose.yaml" "$HERE/../compose.local.yaml" "$HERE/../local.env" "$HERE/../powersync" "$HERE/../scripts" "$HERE/../backup" "$R/deploy/"
cp "$HERE/../../powersync/sync-config.yaml" "$R/powersync/"
# What the functions service delivers: the four functions of the repository and the one file they import from src/.
cp -R "$HERE/../../supabase/functions/results-import" "$HERE/../../supabase/functions/school-console-invite-coach" \
  "$HERE/../../supabase/functions/accounts-delete-account" "$HERE/../../supabase/functions/accounts-deletion-worker" "$R/supabase/functions/"
cp "$HERE/../../src/core/sport/catalogs.ts" "$R/src/core/sport/"
# Stand-in for the Supabase stack's functions folder, with the template's main/ and deno.jsonc (never ours to change).
F=$T/functions
mkdir -p "$F/main"
cp "$HERE/functions-test/main/index.ts" "$F/main/index.ts"
cat >"$F/deno.jsonc" <<'JSON'
{
  "imports": {
    "@supabase/functions-js": "jsr:@supabase/functions-js@^2",
    "@supabase/server": "npm:@supabase/server@^1"
  }
}
JSON
cp "$F/main/index.ts" "$T/main-index.before" && cp "$F/deno.jsonc" "$T/deno.jsonc.before"
SUPABASE_FUNCTIONS_DIR=$F
export SUPABASE_FUNCTIONS_DIR
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
# SUPABASE_FUNCTIONS_DIR is required: without it the config fails and the message names the variable.
if env -u SUPABASE_FUNCTIONS_DIR docker compose -p "$ID" -f "$COMPOSE" -f "$T/override.yaml" config -q 2>"$T/config.err"; then
  echo "FAIL: compose config passed without SUPABASE_FUNCTIONS_DIR"; exit 1
fi
grep -q SUPABASE_FUNCTIONS_DIR "$T/config.err" || { echo "FAIL: the config error does not name SUPABASE_FUNCTIONS_DIR: $(cat "$T/config.err")"; exit 1; }
echo "PASS: compose config requires SUPABASE_FUNCTIONS_DIR"
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

# The delivery: functions starts only after migrate exited 0, and functions-ok (which turns a failed delivery into a failed
# `compose up`) is what Dokploy waits for. PowerSync depends on neither.
# deps <service>: the services it depends_on, from the resolved config.
deps() { dc config 2>/dev/null | awk -v s="$1" '$0 == "  " s ":" { in_s = 1; next } in_s && /^  [^ ]/ { in_s = 0 } in_s && /^    depends_on:/ { d = 1; next } in_s && d && /^      [a-z-]+:$/ { gsub(/[ :]/, ""); print; next } in_s && d && /^    [^ ]/ { d = 0 }'; }
[ "$(deps functions)" = migrate ] || fail "functions must depend only on migrate, got: $(deps functions)"
[ "$(deps functions-ok)" = functions ] || fail "functions-ok must depend only on functions, got: $(deps functions-ok)"
[ "$(deps powersync | sort | tr '\n' ' ')" = "migrate powersync-storage " ] || fail "powersync must not depend on functions or functions-ok, got: $(deps powersync)"
fid=$(dc ps -a -q functions)
i=0
until [ "$(docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$fid" 2>/dev/null)" = "exited 0" ]; do
  i=$((i + 1)); [ "$i" -gt 90 ] && fail "functions did not finish with exit 0"
  sleep 2
done
# nano <RFC 3339 time>: digits only, fraction padded to nine places, so two times compare as strings.
nano() { t=${1%Z}; b=${t%%.*}; f=${t#*.}; [ "$f" = "$t" ] && f=0; printf '%s%s' "$(printf '%s' "$b" | tr -d ':-')" "$(printf '%s000000000' "$f" | cut -c1-9)"; }
mid=$(dc ps -a -q migrate)
m_end=$(nano "$(docker inspect -f '{{.State.FinishedAt}}' "$mid")")
f_start=$(nano "$(docker inspect -f '{{.State.StartedAt}}' "$fid")")
[ "$(printf '%s\n%s\n' "$f_start" "$m_end" | sort | head -1)" = "$m_end" ] || fail "functions started ($f_start) before migrate finished ($m_end)"
okid=$(dc ps -a -q functions-ok)
[ "$(docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$okid")" = "exited 0" ] || fail "functions-ok did not exit 0"
[ -f "$F/results-import/index.ts" ] && [ -f "$F/school-console-invite-coach/index.ts" ] && [ -f "$F/results-import/_vendor/catalogs.ts" ] \
  || fail "functions did not deliver results-import and school-console-invite-coach into the replacement folder"
cmp -s "$F/main/index.ts" "$T/main-index.before" && cmp -s "$F/deno.jsonc" "$T/deno.jsonc.before" || fail "functions changed main/ or deno.jsonc"
dc logs functions 2>&1 | grep -q "PASS: deno check results-import" || fail "the functions log has no PASS line"
dc logs functions 2>&1 | grep -q "DONE: " || fail "the functions log has no DONE line"
echo "PASS: functions ran after migrate and delivered results-import and school-console-invite-coach; main/ and deno.jsonc unchanged"
# What functions can see and do: one writable mount, no database or secret variable, the default network only.
rw=$(docker inspect -f '{{range .Mounts}}{{if and (eq .Type "bind") .RW}}{{println .Destination}}{{end}}{{end}}' "$fid")
[ "$rw" = /functions ] || fail "the only writable bind mount of functions must be /functions, got: $rw"
envs=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$fid")
! echo "$envs" | grep -qE '^(PG|SUPABASE_|POWERSYNC|PS_|APPLY_SEED)|JWT|PASSWORD|SECRET|KEY' || fail "functions receives a database or secret variable"
nets=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$fid")
[ "$nets" = "${ID}_default" ] || fail "functions must be only on the default network, got: $nets"
# shellcheck disable=SC2016 # expansion must happen inside the container
dc run --rm --no-deps -T --entrypoint sh functions -c '
  [ "$(ls -A /repo | tr "\n" " ")" = "deploy src supabase " ] && [ "$(ls -A /repo/deploy)" = scripts ] &&
  [ ! -e /repo/deploy/.env ] && [ ! -e /repo/.git ] && [ ! -e /repo/src/core/sport/../../../.git ]' \
  || fail "functions can see files outside its mounts"
echo "PASS: functions has one writable mount, no database or secret variable, only the default network, and sees no .env or .git"
# Local mode (compose.local.yaml, no SUPABASE_FUNCTIONS_DIR in the environment) leaves the delivery out.
svc=$(env -u SUPABASE_FUNCTIONS_DIR docker compose -f "$R/deploy/compose.yaml" -f "$R/deploy/compose.local.yaml" --env-file "$R/deploy/local.env" config --services 2>&1 | sort | tr '\n' ' ')
[ "$svc" = "migrate powersync powersync-storage " ] || fail "local mode must run migrate, powersync and powersync-storage only, got: $svc"
echo "PASS: local mode does not run the delivery"

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
# A deploy where only the Sync Streams file changed must restart PowerSync with the new file.
# Like Dokploy, replace the file and run compose up again.
old=$(dc ps -q powersync)
marker="# smoke-change-$(rand)"
cfg=$R/powersync/sync-config.yaml
{ cat "$cfg"; echo "$marker"; } >"$cfg.new" && rm "$cfg" && mv "$cfg.new" "$cfg"
dc up -d || fail "compose up after the sync config change"
new=$(dc ps -q powersync)
[ -n "$new" ] && [ "$new" != "$old" ] || fail "powersync was not recreated after the sync config changed"
dc exec -T powersync grep -qxF "$marker" /sync/sync-config.yaml || fail "powersync does not see the new sync config"
i=0
until docker logs "$new" 2>&1 | grep -q '"Sync config updated"'; do
  i=$((i + 1)); [ "$i" -gt 30 ] && fail "powersync did not apply the new sync config"
  sleep 2
done
echo "PASS: a sync config change restarts powersync with the new config"
# A function that fails deno check: the folder stays as it was, `compose up` fails (so the Dokploy deploy shows red) and
# PowerSync keeps running. Like Dokploy, change the repository and run compose up again.
before=$(find "$F" -type f | sort | xargs cksum)
ps_id=$(dc ps -q powersync)
echo "export const broken: number = 'x';" >>"$R/supabase/functions/school-console-invite-coach/service.ts"
if dc up -d >"$T/up.log" 2>&1; then fail "compose up succeeded with a function that fails deno check"; fi
dc logs functions 2>&1 | grep -q "FAIL: deno check failed for school-console-invite-coach" || fail "the functions log does not name the function that failed"
[ "$(find "$F" -type f | sort | xargs cksum)" = "$before" ] || fail "a failed delivery changed the replacement folder"
[ "$(docker inspect -f '{{.State.Running}}' "$ps_id")" = true ] && [ "$(dc ps -q powersync)" = "$ps_id" ] || fail "powersync stopped or was recreated by a failed delivery"
echo "PASS: a function that fails deno check leaves the folder unchanged, fails compose up and leaves powersync running"
echo "ALL PASSED"
