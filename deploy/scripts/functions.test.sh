#!/bin/sh
# Builds the results-import bundle and loads it in the same edge-runtime image the Supabase stack runs.
# Usage: sh deploy/scripts/functions.test.sh   (needs Docker, curl, openssl and git; the first run downloads images and npm packages)
# It publishes one port on 127.0.0.1 (random) and touches no other container, network or volume than the ones it creates
# (the runtime container, a throwaway network and a throwaway server on it), all removed on exit.
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "FAIL: $ROOT is not a git checkout; the 'repository unchanged' check needs git"; exit 1; }
RUNTIME_IMAGE=supabase/edge-runtime:v1.74.0 # the version the stack runs
DENO_IMAGE=denoland/deno:2.1.4
NAME=ts-functions-$$-$(date +%s)
NET=ts-egress-$$-$(date +%s)
BLOCKED=$NET-blocked
T=$(mktemp -d)

cleanup() {
  docker rm -f "$NAME" "$BLOCKED" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  rm -rf "$T"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

fail() { echo "FAIL: $1"; docker logs "$NAME" 2>&1 | tail -20; exit 1; }
call() { curl -s --connect-timeout 2 --max-time 10 -w '\n%{http_code}' -X POST "http://127.0.0.1:$PORT/results-import" -H 'content-type: application/json' -d '{"action":"search"}'; }

repo_before=$(git -C "$ROOT" status --porcelain -- supabase src 2>/dev/null)
# 1. A volume like the stack's: other functions already in it, which the bundle must not touch.
V=$T/functions
# The test router and a root deno.jsonc stand in for the template's `main/` and `deno.jsonc`; `other` is another function.
mkdir -p "$V/main" "$V/other"
cp "$HERE/functions-test/main/index.ts" "$V/main/index.ts"
# The production template's root import map (the public Supabase self-hosted one): bare specifiers only. It is shared by every
# function, so the bundle must not depend on it or change it.
cat >"$V/deno.jsonc" <<'EOF'
{
  "imports": {
    "@supabase/functions-js": "jsr:@supabase/functions-js@^2",
    "@supabase/server": "npm:@supabase/server@^1"
  }
}
EOF
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
[ "$(git -C "$ROOT" status --porcelain -- supabase src 2>/dev/null)" = "$repo_before" ] || fail "the bundle changed the repository"
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

# 4. The bundle refuses a catalogs.ts with imports, or another import from src/, and leaves the volume as it was.
C=$T/clone
mkdir -p "$C/deploy/scripts" "$C/supabase/functions" "$C/src/core/sport"
cp "$HERE/functions-bundle.sh" "$C/deploy/scripts/"
cp -R "$ROOT/supabase/functions/results-import" "$C/supabase/functions/"
before=$(find "$V" -type f | sort | xargs cksum)
# expect_refused <message> <what was given>: the clone's bundle must fail with <message> and leave the volume untouched.
expect_refused() {
  if out=$(sh "$C/deploy/scripts/functions-bundle.sh" "$V" 2>&1); then fail "the bundle accepted $2"; fi
  echo "$out" | grep -q "$1" || fail "the bundle refused $2 for another reason: $(echo "$out" | tail -1)"
  [ "$(find "$V" -type f | sort | xargs cksum)" = "$before" ] || fail "a refused bundle changed the volume"
}
{ echo "import { t } from '../i18n';"; cat "$ROOT/src/core/sport/catalogs.ts"; } >"$C/src/core/sport/catalogs.ts"
expect_refused "catalogs.ts has imports" "a catalogs.ts with imports"
{ printf "export {\n  x,\n} from './other.ts';\n"; cat "$ROOT/src/core/sport/catalogs.ts"; } >"$C/src/core/sport/catalogs.ts"
expect_refused "catalogs.ts has imports" "a catalogs.ts with a multi-line export from"
{ cat "$ROOT/src/core/sport/catalogs.ts"; echo 'export const lazy = () => import("./other.ts");'; } >"$C/src/core/sport/catalogs.ts"
expect_refused "catalogs.ts has imports" "a catalogs.ts with a dynamic import"
# ...and a function that imports anything else from src/, which the bundle would not carry (either quote style).
cp "$ROOT/src/core/sport/catalogs.ts" "$C/src/core/sport/catalogs.ts"
echo "import { other } from '../../../src/core/other.ts'; export { other };" >>"$C/supabase/functions/results-import/service.ts"
expect_refused "other than catalogs.ts" "an import from src/ other than catalogs.ts"
cp "$ROOT/supabase/functions/results-import/service.ts" "$C/supabase/functions/results-import/service.ts"
echo 'import { other } from "../../../src/core/other.ts"; export { other };' >>"$C/supabase/functions/results-import/service.ts"
expect_refused "other than catalogs.ts" "a double-quoted import from src/ other than catalogs.ts"
echo "PASS: a catalogs.ts with imports (also multi-line or dynamic), or another import from src/ (either quote style), is refused and the volume is untouched"

# 5. The egress script finds every host the providers query, without Docker. Each case is a scratch tree with its own providers.
egress_clone() { mkdir -p "$1/deploy/scripts" "$1/supabase/functions/results-import/providers"; cp "$HERE/functions-egress.sh" "$1/deploy/scripts/"; }
[ "$(sh "$HERE/functions-egress.sh" --list)" = "$(printf 'ecoapplet.co\nwww.colombiaacuatica.com')" ] || fail "--list on the repository is not exactly the two provider hosts: $(sh "$HERE/functions-egress.sh" --list 2>&1)"
E=$T/egress-ok
egress_clone "$E"
mkdir -p "$E/supabase/functions/results-import/providers/xx-a/__tests__" "$E/supabase/functions/results-import/providers/xx-b"
cat >"$E/supabase/functions/results-import/providers/xx-a/source.ts" <<'EOF'
export const eventUrl = (n: number) => `https://a.example.test/r/${n}/get`;
EOF
cat >"$E/supabase/functions/results-import/providers/xx-a/__tests__/source.test.ts" <<'EOF'
export const ignored = 'https://ignored.example.test/';
EOF
cat >"$E/supabase/functions/results-import/providers/xx-b/lookup.ts" <<'EOF'
const HOST = 'host.example.test';
export const zip = (d: string) => `https://${HOST}/files/${d}.zip`;
EOF
[ "$(sh "$E/deploy/scripts/functions-egress.sh" --list)" = "$(printf 'a.example.test\nhost.example.test')" ] || fail "--list missed a template-literal host or a host built from a constant: $(sh "$E/deploy/scripts/functions-egress.sh" --list 2>&1)"
E=$T/egress-none
egress_clone "$E"
mkdir -p "$E/supabase/functions/results-import/providers/xx-empty"
echo "export const nothing = 1;" >"$E/supabase/functions/results-import/providers/xx-empty/index.ts"
if out=$(sh "$E/deploy/scripts/functions-egress.sh" --list 2>&1); then fail "a provider with no host passed"; fi
echo "$out" | grep -q "^FAIL: .*xx-empty" || fail "the failure does not name the provider with no host: $out"
E=$T/egress-unresolved
egress_clone "$E"
mkdir -p "$E/supabase/functions/results-import/providers/xx-c"
cat >"$E/supabase/functions/results-import/providers/xx-c/source.ts" <<'EOF'
export const u = `https://${MISSING}/x`;
EOF
if out=$(sh "$E/deploy/scripts/functions-egress.sh" --list 2>&1); then fail "an unresolvable host passed"; fi
echo "$out" | grep -q "^FAIL: .*xx-c/source.ts.*MISSING" || fail "the failure does not name the file and the identifier: $out"
echo "PASS: egress hosts found in literals, template literals and constants (also the real two); a provider with no host, or an unresolvable one, fails"

# 6. The Deno version of the check: a local deno of another version is not used (the runtime's image is), the same version is.
mkdir -p "$T/fake-other" "$T/fake-same" "$T/vol-v1/main" "$T/vol-v2/main"
cat >"$T/fake-other/deno" <<'EOF'
#!/bin/sh
case "$1" in --version) echo "deno 9.9.9 (fake)" ;; *) exit 1 ;; esac
EOF
cat >"$T/fake-same/deno" <<EOF
#!/bin/sh
case "\$1" in --version) echo "deno 2.1.4 (fake)" ;; check) touch "$T/local-used" ;; *) exit 1 ;; esac
EOF
chmod +x "$T/fake-other/deno" "$T/fake-same/deno"
out=$(PATH="$T/fake-other:$PATH" sh "$HERE/functions-bundle.sh" "$T/vol-v1" 2>&1) || fail "the bundle failed with a local deno of another version: $out"
echo "$out" | grep -q "^NOTE: local deno 9.9.9 differs from the runtime's 2.1.4; checking with $DENO_IMAGE" || fail "no NOTE about the local deno version: $out"
echo "$out" | grep -q "^PASS: deno check" || fail "the check through the image did not pass: $out"
out=$(PATH="$T/fake-same:$PATH" sh "$HERE/functions-bundle.sh" "$T/vol-v2" 2>&1) || fail "the bundle failed with a local deno of the runtime's version: $out"
[ -f "$T/local-used" ] || fail "the local deno of the runtime's version was not used: $out"
! echo "$out" | grep -q "^NOTE" || fail "a NOTE about the version appeared with the runtime's version: $out"
echo "PASS: a local deno of another version is replaced by $DENO_IMAGE (with a NOTE); the runtime's version is used as is"

# 7. A swap cut between its two renames (function in .results-import.old, none in place) is recovered by the next run, even
# when that run fails: the function is back with the same content.
C2=$T/clone-recover
mkdir -p "$C2/deploy/scripts" "$C2/supabase/functions" "$C2/src/core/sport" "$T/vol-r/main"
cp "$HERE/functions-bundle.sh" "$C2/deploy/scripts/"
cp "$ROOT/src/core/sport/catalogs.ts" "$C2/src/core/sport/"
cp -R "$ROOT/supabase/functions/results-import" "$C2/supabase/functions/"
echo "export const broken: number = 'x';" >>"$C2/supabase/functions/results-import/service.ts"
cp -R "$V/results-import" "$T/vol-r/.results-import.old"
live=$(cd "$T/vol-r/.results-import.old" && find . -type f | sort | xargs cksum)
if out=$(sh "$C2/deploy/scripts/functions-bundle.sh" "$T/vol-r" 2>&1); then fail "the bundle passed with a module that fails deno check"; fi
echo "$out" | grep -q "deno check failed" || fail "the run did not fail at deno check: $(echo "$out" | tail -1)"
[ ! -e "$T/vol-r/.results-import.old" ] || fail ".results-import.old was left behind"
[ "$(cd "$T/vol-r/results-import" && find . -type f | sort | xargs cksum)" = "$live" ] || fail "the function did not come back with its content after the cut swap"
echo "PASS: a swap cut between its renames is recovered: the function is back, unchanged, and .results-import.old is gone"

# 8. A block page does not pass the egress check: a host that answers HTTP 200 with a certificate the runtime does not trust
# (what a proxy or captive page presents) is a FAIL.
mkdir -p "$T/certs"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=blocked.example.test -addext subjectAltName=DNS:blocked.example.test -addext basicConstraints=critical,CA:FALSE \
  -keyout "$T/certs/key.pem" -out "$T/certs/cert.pem" >/dev/null 2>&1 || exit 2
docker network create "$NET" >/dev/null || exit 2
docker run -d --name "$BLOCKED" --network "$NET" --network-alias blocked.example.test -v "$T/certs:/certs:ro" "$DENO_IMAGE" \
  deno eval --no-lock 'Deno.serve({ port: 443, cert: Deno.readTextFileSync("/certs/cert.pem"), key: Deno.readTextFileSync("/certs/key.pem") }, () => new Response("<html>blocked</html>", { headers: { "content-type": "text/html" } }))' >/dev/null || exit 2
# Control: a client that trusts that certificate gets the 200, so the server is really up and the FAIL below is about trust.
i=0
until docker run --rm --network "$NET" -v "$T/certs:/certs:ro" "$DENO_IMAGE" deno eval --no-lock \
  "const r = await fetch('https://blocked.example.test/', { client: Deno.createHttpClient({ caCerts: [Deno.readTextFileSync('/certs/cert.pem')] }) }); if (r.status !== 200) Deno.exit(1)" >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 20 ] && fail "the block page server did not answer"
  sleep 1
done
E=$T/egress-blocked
egress_clone "$E"
mkdir -p "$E/supabase/functions/results-import/providers/xx-blocked"
echo "const URL = 'https://blocked.example.test/path';" >"$E/supabase/functions/results-import/providers/xx-blocked/source.ts"
if out=$(sh "$E/deploy/scripts/functions-egress.sh" "$NET" 2>&1); then fail "the egress check passed a block page: $out"; fi
echo "$out" | grep -q "^FAIL: blocked.example.test" || fail "no FAIL for the block page host: $out"
echo "PASS: a host with an untrusted certificate (a block page answering 200) fails the egress check"
