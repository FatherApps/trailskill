#!/bin/sh
# Builds the results-import bundle and loads it in the same edge-runtime image the Supabase stack runs.
# Usage: sh deploy/scripts/functions.test.sh   (needs Docker and curl; the first run downloads images and npm packages)
# It publishes one port on 127.0.0.1 (random) and touches no other container, network or volume.
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
RUNTIME_IMAGE=supabase/edge-runtime:v1.74.0 # the version the stack runs
NAME=ts-functions-$$-$(date +%s)
T=$(mktemp -d)

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1
  rm -rf "$T"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

fail() { echo "FAIL: $1"; docker logs "$NAME" 2>&1 | tail -20; exit 1; }
call() { curl -s -w '\n%{http_code}' -X POST "http://127.0.0.1:$PORT/results-import" -H 'content-type: application/json' -d '{"action":"search"}'; }

# 1. A volume like the stack's: other functions already in it, which the bundle must not touch.
V=$T/functions
# The test router and a root deno.jsonc stand in for the template's `main/` and `deno.jsonc`; `other` is another function.
mkdir -p "$V/main" "$V/other"
cp "$HERE/functions-test/main/index.ts" "$V/main/index.ts"
echo '{ "imports": {} }' >"$V/deno.jsonc"
echo keep >"$V/other/index.ts"
sh "$HERE/functions-bundle.sh" "$V" || exit 1
[ "$(cat "$V/other/index.ts")" = keep ] || fail "the bundle changed another function"
[ -f "$V/results-import/_vendor/catalogs.ts" ] && cmp -s "$V/results-import/_vendor/catalogs.ts" "$ROOT/src/core/sport/catalogs.ts" || fail "the bundle does not carry src/core/sport/catalogs.ts"
[ ! -e "$V/results-import/__tests__" ] || fail "the bundle carries tests"
sh "$HERE/functions-bundle.sh" "$V" >/dev/null || fail "running the bundle twice failed"
[ "$(ls -A "$V" | tr '\n' ' ')" = "deno.jsonc main other results-import " ] || fail "unexpected files in the volume: $(ls -A "$V")"
echo "PASS: bundle built twice; other functions untouched; catalogs.ts inside"

# 2. The function loads and answers with the bundle in the runtime.
docker run -d --name "$NAME" -p 127.0.0.1::9000 \
  -v "$V:/home/deno/functions:ro" \
  -e SUPABASE_URL=http://127.0.0.1:1 -e SUPABASE_ANON_KEY=anon -e SUPABASE_SERVICE_ROLE_KEY=service \
  "$RUNTIME_IMAGE" start --main-service /home/deno/functions/main -p 9000 >/dev/null || exit 2
PORT=$(docker port "$NAME" 9000/tcp | head -1 | sed 's/.*://')
i=0
until out=$(call) && [ "$(echo "$out" | tail -1)" != 000 ]; do
  i=$((i + 1)); [ "$i" -gt 30 ] && fail "the runtime did not answer"
  sleep 1
done
[ "$(echo "$out" | tail -1)" = 401 ] && echo "$out" | grep -q '"unauthenticated"' \
  || fail "expected the function to answer 401 unauthenticated, got: $out"
echo "PASS: results-import loaded in $RUNTIME_IMAGE and answered 401 unauthenticated without a user token"

# 3. Without catalogs.ts in the bundle the function does not load: the check above really depends on it.
rm "$V/results-import/_vendor/catalogs.ts"
docker restart "$NAME" >/dev/null
PORT=$(docker port "$NAME" 9000/tcp | head -1 | sed 's/.*://') # the published port changes on restart
i=0
until out=$(call) && [ "$(echo "$out" | tail -1)" != 000 ]; do
  i=$((i + 1)); [ "$i" -gt 30 ] && fail "the runtime did not answer after the restart"
  sleep 1
done
[ "$(echo "$out" | tail -1)" = 500 ] && echo "$out" | grep -q 'Module not found' || fail "expected the function not to load without catalogs.ts, got: $out"
echo "PASS: without _vendor/catalogs.ts the function does not load"

# 4. The bundle refuses a catalogs.ts with imports and leaves the volume as it was.
C=$T/clone
mkdir -p "$C/deploy/scripts" "$C/supabase/functions" "$C/src/core/sport"
cp "$HERE/functions-bundle.sh" "$C/deploy/scripts/"
cp -R "$ROOT/supabase/functions/results-import" "$C/supabase/functions/"
{ echo "import { t } from '../i18n';"; cat "$ROOT/src/core/sport/catalogs.ts"; } >"$C/src/core/sport/catalogs.ts"
before=$(find "$V" -type f | sort | xargs cksum)
if sh "$C/deploy/scripts/functions-bundle.sh" "$V" >/dev/null 2>&1; then fail "the bundle accepted a catalogs.ts with imports"; fi
[ "$(find "$V" -type f | sort | xargs cksum)" = "$before" ] || fail "a refused bundle changed the volume"
echo "PASS: a catalogs.ts with imports is refused and the volume is untouched"
