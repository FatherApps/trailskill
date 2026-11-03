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
# Like the template's: bare specifiers only. It is shared by every function, so the bundle must not depend on it or change it.
echo '{ "imports": { "@supabase/functions-js": "jsr:@supabase/functions-js@2" } }' >"$V/deno.jsonc"
cp "$V/deno.jsonc" "$T/deno.jsonc.before"
echo keep >"$V/other/index.ts"
sh "$HERE/functions-bundle.sh" "$V" || exit 1
[ "$(cat "$V/other/index.ts")" = keep ] || fail "the bundle changed another function"
[ -f "$V/results-import/_vendor/catalogs.ts" ] && cmp -s "$V/results-import/_vendor/catalogs.ts" "$ROOT/src/core/sport/catalogs.ts" || fail "the bundle does not carry src/core/sport/catalogs.ts"
[ ! -e "$V/results-import/__tests__" ] || fail "the bundle carries tests"
sh "$HERE/functions-bundle.sh" "$V" >/dev/null || fail "running the bundle twice failed"
[ "$(ls -A "$V" | tr '\n' ' ')" = "deno.jsonc main other results-import " ] || fail "unexpected files in the volume: $(ls -A "$V")"
# Each module imports catalogs.ts through the relative path from its own folder to _vendor/catalogs.ts, at every depth, and the
# repository and the volume's shared import map are left as they were.
shallow=0; deep=0
for file in $(cd "$V/results-import" && find . -name '*.ts' -not -path './_vendor/*' | sed 's|^\./||'); do
  grep -q "_vendor/catalogs.ts" "$V/results-import/$file" || continue
  depth=$(echo "$file" | tr -cd / | wc -c | tr -d ' ')
  want=; n=0; while [ "$n" -lt "$depth" ]; do want="../$want"; n=$((n + 1)); done
  [ -n "$want" ] || want=./
  grep -qE "from '${want}_vendor/catalogs.ts'" "$V/results-import/$file" || fail "$file does not import ${want}_vendor/catalogs.ts"
  if [ "$depth" -eq 0 ]; then shallow=$((shallow + 1)); elif [ "$depth" -eq 2 ]; then deep=$((deep + 1)); fi
done
[ "$shallow" -gt 0 ] && [ "$deep" -gt 0 ] || fail "expected modules importing catalogs.ts at depth 0 and 2 (found $shallow and $deep)"
! grep -rqE "src/core/sport" "$V/results-import" --include='*.ts' --exclude-dir=_vendor || fail "an import into src/ remains in the bundle"
cmp -s "$V/deno.jsonc" "$T/deno.jsonc.before" || fail "the bundle changed the volume's root deno.jsonc"
[ -z "$(git -C "$ROOT" status --porcelain -- supabase src 2>/dev/null)" ] || fail "the bundle changed the repository"
echo "PASS: bundle built twice; other functions and deno.jsonc untouched; catalogs.ts inside, imports rewritten at $shallow + $deep modules"

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
# ...and a function that imports anything else from src/, which the bundle would not carry.
cp "$ROOT/src/core/sport/catalogs.ts" "$C/src/core/sport/catalogs.ts"
echo "import { other } from '../../../src/core/other.ts'; export { other };" >>"$C/supabase/functions/results-import/service.ts"
if sh "$C/deploy/scripts/functions-bundle.sh" "$V" >/dev/null 2>&1; then fail "the bundle accepted an import from src/ other than catalogs.ts"; fi
[ "$(find "$V" -type f | sort | xargs cksum)" = "$before" ] || fail "a refused bundle changed the volume"
echo "PASS: a catalogs.ts with imports, or another import from src/, is refused and the volume is untouched"
