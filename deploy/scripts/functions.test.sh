#!/bin/sh
# Builds the four function bundles (results-import, school-console-invite-coach, accounts-delete-account, accounts-deletion-worker)
# and loads them in the same edge-runtime image the Supabase stack runs.
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
# call <function>: a POST without a token to that function.
call() { curl -s --connect-timeout 2 --max-time 10 -w '\n%{http_code}' -X POST "http://127.0.0.1:$PORT/$1" -H 'content-type: application/json' -d '{"action":"search"}'; }

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
[ -f "$V/school-console-invite-coach/index.ts" ] || fail "the bundle does not carry school-console-invite-coach"
[ ! -e "$V/school-console-invite-coach/__tests__" ] && [ ! -e "$V/school-console-invite-coach/_vendor" ] || fail "school-console-invite-coach carries tests or a _vendor it does not need"
for f in accounts-delete-account accounts-deletion-worker; do
  [ -f "$V/$f/index.ts" ] || fail "the bundle does not carry $f"
  [ ! -e "$V/$f/__tests__" ] && [ ! -e "$V/$f/_vendor" ] || fail "$f carries tests or a _vendor it does not need"
done
sh "$HERE/functions-bundle.sh" "$V" >/dev/null || fail "running the bundle twice failed"
[ "$(ls -A "$V" | tr '\n' ' ')" = "accounts-delete-account accounts-deletion-worker deno.jsonc main other results-import school-console-invite-coach " ] || fail "unexpected files in the volume: $(ls -A "$V")"
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
echo "PASS: bundle built twice (the four functions); other functions and deno.jsonc untouched; catalogs.ts inside, imports rewritten at $shallow + $deep modules"

# 2. The function loads and answers with the bundle in the runtime.
docker run -d --name "$NAME" -p 127.0.0.1::9000 \
  -v "$V:/home/deno/functions:ro" \
  -e SUPABASE_URL=http://127.0.0.1:1 -e SUPABASE_ANON_KEY=anon -e SUPABASE_SERVICE_ROLE_KEY=service \
  "$RUNTIME_IMAGE" start --main-service /home/deno/functions/main -p 9000 >/dev/null || exit 2
PORT=$(docker port "$NAME" 9000/tcp | head -1 | sed 's/.*://')
i=0
until out=$(call results-import) && [ "$(echo "$out" | tail -1)" != 000 ]; do
  i=$((i + 1)); [ "$i" -gt 30 ] && fail "the runtime did not answer"
  sleep 1
done
[ "$(echo "$out" | tail -1)" = 401 ] && echo "$out" | grep -q '"unauthenticated"' \
  || fail "expected the function to answer 401 unauthenticated, got: $out"
out=$(call school-console-invite-coach)
[ "$(echo "$out" | tail -1)" = 401 ] && echo "$out" | grep -q '"unauthenticated"' \
  || fail "expected school-console-invite-coach to answer 401 unauthenticated, got: $out"
echo "PASS: results-import and school-console-invite-coach loaded in $RUNTIME_IMAGE and answered 401 unauthenticated without a user token"

# 3. Without catalogs.ts in the bundle the function does not load: the check above really depends on it.
rm "$V/results-import/_vendor/catalogs.ts"
docker restart "$NAME" >/dev/null
PORT=$(docker port "$NAME" 9000/tcp | head -1 | sed 's/.*://') # the published port changes on restart
i=0
until out=$(call results-import) && [ "$(echo "$out" | tail -1)" != 000 ]; do
  i=$((i + 1)); [ "$i" -gt 30 ] && fail "the runtime did not answer after the restart"
  sleep 1
done
[ "$(echo "$out" | tail -1)" = 500 ] && echo "$out" | grep -q 'Module not found' || fail "expected the function not to load without catalogs.ts, got: $out"
echo "PASS: without _vendor/catalogs.ts the function does not load"

# 4. The bundle refuses a catalogs.ts with imports, or another import from src/, and leaves the volume as it was.
C=$T/clone
mkdir -p "$C/deploy/scripts" "$C/supabase/functions" "$C/src/core/sport"
cp "$HERE/functions-bundle.sh" "$C/deploy/scripts/"
cp -R "$ROOT"/supabase/functions/results-import "$ROOT"/supabase/functions/school-console-invite-coach "$ROOT"/supabase/functions/accounts-delete-account "$ROOT"/supabase/functions/accounts-deletion-worker "$C/supabase/functions/"
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
[ "$(sh "$HERE/functions-egress.sh" --list)" = "$(printf 'api.resend.com\necoapplet.co\nwww.colombiaacuatica.com')" ] || fail "--list on the repository is not exactly the Resend host and the two provider hosts: $(sh "$HERE/functions-egress.sh" --list 2>&1)"
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
cp -R "$ROOT"/supabase/functions/results-import "$ROOT"/supabase/functions/school-console-invite-coach "$ROOT"/supabase/functions/accounts-delete-account "$ROOT"/supabase/functions/accounts-deletion-worker "$C2/supabase/functions/"
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

# 9. A deno check failure in EITHER function leaves the whole volume as it was: the other function is not replaced either.
C3=$T/clone-either
mkdir -p "$C3/deploy/scripts" "$C3/supabase/functions" "$C3/src/core/sport"
cp "$HERE/functions-bundle.sh" "$C3/deploy/scripts/"
cp "$ROOT/src/core/sport/catalogs.ts" "$C3/src/core/sport/"
cp -R "$ROOT"/supabase/functions/results-import "$ROOT"/supabase/functions/school-console-invite-coach "$ROOT"/supabase/functions/accounts-delete-account "$ROOT"/supabase/functions/accounts-deletion-worker "$C3/supabase/functions/"
echo "export const broken: number = 'x';" >>"$C3/supabase/functions/school-console-invite-coach/service.ts"
before=$(find "$V" -type f | sort | xargs cksum)
if out=$(sh "$C3/deploy/scripts/functions-bundle.sh" "$V" 2>&1); then fail "the bundle passed with a module that fails deno check"; fi
echo "$out" | grep -q "deno check failed" || fail "the run did not fail at deno check: $(echo "$out" | tail -1)"
[ "$(find "$V" -type f | sort | xargs cksum)" = "$before" ] || fail "a failed deno check changed the volume"
[ ! -e "$V/.staging" ] || fail "the staging folder was left in the volume"
echo "PASS: a deno check failure in school-console-invite-coach leaves the whole volume as it was (results-import not replaced, no staging folder left)"

# 10. First delivery, and siblings resolved against the new copies: a volume with only main receives the four functions and each
# one passes deno check, also accounts-delete-account (imports school-console-invite-coach/resendSender.ts) and
# accounts-deletion-worker (imports accounts-delete-account/*). Then a volume that already holds an old, broken
# school-console-invite-coach and accounts-delete-account: the result depends only on the repository, and both are replaced.
mkdir -p "$T/vol-first/main" "$T/vol-stale/main" "$T/vol-stale/school-console-invite-coach" "$T/vol-stale/accounts-delete-account"
out=$(sh "$HERE/functions-bundle.sh" "$T/vol-first" 2>&1) || fail "the first delivery failed: $out"
for f in results-import school-console-invite-coach accounts-delete-account accounts-deletion-worker; do
  echo "$out" | grep -q "^PASS: deno check $f " || fail "no PASS: deno check for $f in the first delivery: $out"
  echo "$out" | grep -q "^DONE: .*/$f updated" || fail "no DONE for $f in the first delivery: $out"
done
for f in accounts-delete-account accounts-deletion-worker; do
  [ -f "$T/vol-first/$f/index.ts" ] && [ ! -e "$T/vol-first/$f/__tests__" ] && [ ! -e "$T/vol-first/$f/_vendor" ] || fail "$f in the first delivery is missing index.ts or carries tests or _vendor"
done
cmp -s "$T/vol-first/school-console-invite-coach/resendSender.ts" "$ROOT/supabase/functions/school-console-invite-coach/resendSender.ts" || fail "the first delivery does not carry resendSender.ts"
echo "export const sendResendEmail: number = 'old';" >"$T/vol-stale/school-console-invite-coach/resendSender.ts"
echo "export const formatDate = 1 +;" >"$T/vol-stale/accounts-delete-account/emailTexts.ts"
out=$(sh "$HERE/functions-bundle.sh" "$T/vol-stale" 2>&1) || fail "a stale or broken published sibling changed the result of the check: $out"
cmp -s "$T/vol-stale/school-console-invite-coach/resendSender.ts" "$ROOT/supabase/functions/school-console-invite-coach/resendSender.ts" || fail "the stale sibling was not replaced"
cmp -s "$T/vol-stale/accounts-delete-account/emailTexts.ts" "$ROOT/supabase/functions/accounts-delete-account/emailTexts.ts" || fail "the stale accounts-delete-account was not replaced"
[ ! -e "$T/vol-stale/.staging" ] || fail "the staging folder was left in the volume"
echo "PASS: a volume with only main receives the four functions and they pass deno check; old or broken published siblings do not change the result"

# 11. A function that imports from a sibling that the bundle does not deliver is refused before anything changes in the volume.
C4=$T/clone-sibling
mkdir -p "$C4/deploy/scripts" "$C4/supabase/functions" "$C4/src/core/sport" "$T/vol-sib/main" "$T/vol-sib/results-import"
sed 's/^FUNCTIONS=.*/FUNCTIONS="results-import accounts-delete-account"/' "$HERE/functions-bundle.sh" >"$C4/deploy/scripts/functions-bundle.sh"
cp "$ROOT/src/core/sport/catalogs.ts" "$C4/src/core/sport/"
cp -R "$ROOT/supabase/functions/results-import" "$ROOT/supabase/functions/accounts-delete-account" "$ROOT/supabase/functions/school-console-invite-coach" "$C4/supabase/functions/"
echo keep >"$T/vol-sib/results-import/index.ts"
before=$(find "$T/vol-sib" -type f | sort | xargs cksum)
if out=$(sh "$C4/deploy/scripts/functions-bundle.sh" "$T/vol-sib" 2>&1); then fail "the bundle accepted an import from a sibling it does not deliver: $out"; fi
echo "$out" | grep -q "^FAIL: accounts-delete-account imports from the sibling function school-console-invite-coach" || fail "the failure does not name the function and the sibling: $out"
[ "$(find "$T/vol-sib" -type f | sort | xargs cksum)" = "$before" ] || fail "a refused bundle changed the volume"
[ ! -e "$T/vol-sib/.staging" ] || fail "the staging folder was left in the volume"
echo "PASS: a function importing from a sibling outside FUNCTIONS is refused and the volume is untouched"
