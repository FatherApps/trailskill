#!/bin/sh
# Tests .github/scripts/check-ota.sh with synthetic PR descriptions and a throwaway Git repository.
# Usage: sh .github/scripts/check-ota.test.sh   (from the repository root; no network, all data is synthetic)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
CHECK=$HERE/check-ota.sh
FX=$HERE/check-ota-fixtures
TEMPLATE=$HERE/../pull_request_template.md
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
trap 'exit 130' INT TERM

PASSED=0
FAILED=0
TITLE='feat(timing): synthetic'
REF=
RELEASE_REF=release-please--branches--main--components--trailskill
RELEASE_TITLE='chore(release): v1.2.3'

pass() { PASSED=$((PASSED + 1)); printf "ok   %s\n" "$1"; }
fail() {
  FAILED=$((FAILED + 1)); printf "FAIL %s\n" "$1"
  [ -s "$T/err" ] && sed 's/^/       stderr: /' "$T/err"
  [ -s "$T/out" ] && sed 's/^/       stdout: /' "$T/out"
}

# A throwaway repository: "base" holds the synthetic package files and one source file.
R=$T/repo
git init -q "$R"
git -C "$R" config user.email test@example.test
git -C "$R" config user.name Test
git -C "$R" config commit.gpgsign false
mkdir -p "$R/src"
cp "$FX/package-base.json" "$R/package.json"
cp "$FX/package-lock-base.json" "$R/package-lock.json"
echo 'export const a = 1;' >"$R/src/a.ts"
git -C "$R" add -A
git -C "$R" commit -qm base
git -C "$R" tag base

# change PATH [SOURCE]: starts a branch from base and writes PATH (from SOURCE, or a synthetic line).
change() {
  git -C "$R" checkout -q -B topic base
  mkdir -p "$R/$(dirname "$1")"
  if [ $# -ge 2 ]; then cp "$2" "$R/$1"; else echo "// synthetic change" >>"$R/$1"; fi
  git -C "$R" add -A
  git -C "$R" commit -qm change
}

# run BODYFILE: runs the PR check inside the repository with base..head; sets rc.
run() {
  (cd "$R" && PR_BODY=$(cat "$1") PR_TITLE=$TITLE PR_HEAD_REF=$REF BASE_SHA=base HEAD_SHA=topic sh "$CHECK") >"$T/out" 2>"$T/err" </dev/null
  rc=$?
}

# expect_pass DESC BODYFILE
expect_pass() {
  run "$2"
  if [ "$rc" -eq 0 ] && [ ! -s "$T/err" ]; then pass "$1"; else fail "$1 (exit $rc)"; fi
}

# expect_fail DESC BODYFILE NEEDLE: exits non-zero and NEEDLE appears in stderr.
expect_fail() {
  run "$2"
  if [ "$rc" -ne 0 ] && grep -Fq -- "$3" "$T/err"; then pass "$1"; else fail "$1 (exit $rc, wanted: $3)"; fi
}

NONE_MSG='Mark one box in "## Entrega"'
BOTH_MSG='Mark only one box in "## Entrega"'
OTA_MSG='is marked "Apto para OTA" but changes files that need a Play build'

# --- The boxes ---
change src/a.ts
expect_fail 'no box fails' "$FX/none.md" "$NONE_MSG"
expect_fail 'both boxes fail' "$FX/both.md" "$BOTH_MSG"
expect_pass 'OTA with a clean diff passes' "$FX/ota.md"
expect_pass 'Play build with a clean diff passes' "$FX/build.md"
expect_fail 'the unedited template fails' "$TEMPLATE" "$NONE_MSG"
sed 's/\[x\] Apto/[X] Apto/' "$FX/ota.md" >"$T/upper.md"
expect_pass 'an uppercase X counts' "$T/upper.md"
awk '{printf "%s\r\n", $0}' "$FX/ota.md" >"$T/crlf.md"
expect_pass 'a CRLF description passes' "$T/crlf.md"
sed 's/^- \[x\] Apto para OTA$/<!-- - [x] Apto para OTA -->/' "$FX/ota.md" >"$T/commented.md"
expect_fail 'a box ticked inside a comment does not count' "$T/commented.md" "$NONE_MSG"
grep -v '^## Entrega$' "$FX/ota.md" >"$T/nosection.md"
expect_fail 'boxes outside "## Entrega" do not count' "$T/nosection.md" "$NONE_MSG"

# --- The release-please pull request counts as "Requiere build de Play", only with its branch AND its title ---
change app.config.ts
: >"$T/empty-body.md"
TITLE=$RELEASE_TITLE REF=$RELEASE_REF
expect_pass 'release PR: its branch and title pass without a box' "$T/empty-body.md"
expect_pass 'release PR: passes even with the OTA box ticked' "$FX/ota.md"
TITLE=$RELEASE_TITLE REF=feat/1202-release-please
expect_fail 'release title on another branch still needs a box' "$T/empty-body.md" "$NONE_MSG"
expect_fail 'release title on another branch fails OTA with a build path' "$FX/ota.md" "$OTA_MSG"
TITLE=$RELEASE_TITLE REF=
expect_fail 'release title with no branch given still needs a box' "$T/empty-body.md" "$NONE_MSG"
TITLE=$RELEASE_TITLE REF=${RELEASE_REF}-x
expect_fail 'release title on a look-alike branch still needs a box' "$T/empty-body.md" "$NONE_MSG"
TITLE=$RELEASE_TITLE REF=release-please--branches--main
expect_fail 'release title on the old branch without the component still needs a box' "$T/empty-body.md" "$NONE_MSG"
TITLE=$RELEASE_TITLE REF=x-$RELEASE_REF
expect_fail 'release title on a prefixed branch still needs a box' "$T/empty-body.md" "$NONE_MSG"
TITLE=$RELEASE_TITLE REF=release-please--branches--main--components--other
expect_fail 'release title on another component branch still needs a box' "$T/empty-body.md" "$NONE_MSG"
TITLE=$RELEASE_TITLE REF=Release-Please--Branches--Main--Components--Trailskill
expect_fail 'release title on an upper-case branch still needs a box' "$T/empty-body.md" "$NONE_MSG"
TITLE='feat(timing): synthetic' REF=$RELEASE_REF
expect_fail 'release branch with another title still needs a box' "$T/empty-body.md" "$NONE_MSG"
expect_fail 'release branch with another title fails OTA with a build path' "$FX/ota.md" "$OTA_MSG"
NL='
'
TITLE="chore: anything${NL}$RELEASE_TITLE" REF=$RELEASE_REF
expect_fail 'release branch with a multi-line title hiding the release line still needs a box' "$T/empty-body.md" "$NONE_MSG"
TITLE="$RELEASE_TITLE${NL}more" REF=$RELEASE_REF
expect_fail 'release branch with a release line first and more lines still needs a box' "$T/empty-body.md" "$NONE_MSG"
TITLE='chore(release): v1.2.3-rc.1' REF=$RELEASE_REF
expect_fail 'release branch with a pre-release title still needs a box' "$T/empty-body.md" "$NONE_MSG"
TITLE='feat(timing): synthetic' REF=

# --- Every build path family fails with OTA, names the path, and passes with Play build ---
for path in modules/timing-button/index.ts plugins/synthetic-plugin.js android/app/build.gradle \
  ios/Podfile app.config.ts app.json eas.json supabase/migrations/20260101000000_timing_synthetic.sql \
  powersync/sync-config.yaml; do
  change "$path"
  expect_fail "OTA with $path fails" "$FX/ota.md" "$OTA_MSG"
  expect_fail "OTA with $path names it" "$FX/ota.md" "  - $path"
  expect_pass "Play build with $path passes" "$FX/build.md"
done

# --- Dependencies: only a dependency change in package.json or package-lock.json needs a build ---
change package.json "$FX/package-deps.json"
expect_fail 'OTA with a package.json dependency change fails' "$FX/ota.md" '  - package.json'
expect_pass 'Play build with a package.json dependency change passes' "$FX/build.md"
change package.json "$FX/package-scripts.json"
expect_pass 'OTA with a package.json scripts and version change passes' "$FX/ota.md"
change package-lock.json "$FX/package-lock-deps.json"
expect_fail 'OTA with a package-lock.json dependency change fails' "$FX/ota.md" '  - package-lock.json'
expect_pass 'Play build with a package-lock.json dependency change passes' "$FX/build.md"
change package-lock.json "$FX/package-lock-version.json"
expect_pass 'OTA with a package-lock.json version-only change passes' "$FX/ota.md"

# --- Look-alike paths are not build paths ---
for path in src/modules/accounts/index.ts supabase/tests/database/timing/synthetic.sql docs/app.json.md; do
  change "$path"
  expect_pass "OTA with $path passes" "$FX/ota.md"
done

# --- A deleted or renamed build file still counts ---
git -C "$R" checkout -q -B topic base
mkdir -p "$R/plugins" && echo x >"$R/plugins/old.js" && git -C "$R" add -A && git -C "$R" commit -qm add-plugin
git -C "$R" tag with-plugin
git -C "$R" rm -q "$R/plugins/old.js" && git -C "$R" commit -qm remove-plugin
(cd "$R" && PR_BODY=$(cat "$FX/ota.md") BASE_SHA=with-plugin HEAD_SHA=topic sh "$CHECK") >"$T/out" 2>"$T/err" </dev/null
rc=$?
if [ "$rc" -ne 0 ] && grep -Fq '  - plugins/old.js' "$T/err"; then pass 'a deleted build file fails with OTA'; else fail 'a deleted build file fails with OTA'; fi

# --- The classifier runs without a PR ---
change app.json
(cd "$R" && sh "$CHECK" classify base topic) >"$T/out" 2>"$T/err" </dev/null
rc=$?
if [ "$rc" -eq 1 ] && [ "$(cat "$T/out")" = app.json ]; then pass 'classify prints the build path and exits 1'; else fail "classify with a build path (exit $rc)"; fi
change src/a.ts
(cd "$R" && sh "$CHECK" classify base topic) >"$T/out" 2>"$T/err" </dev/null
rc=$?
if [ "$rc" -eq 0 ] && [ ! -s "$T/out" ]; then pass 'classify prints nothing and exits 0 for an OTA diff'; else fail "classify with a clean diff (exit $rc)"; fi
(cd "$R" && sh "$CHECK" classify base no-such-ref) >"$T/out" 2>"$T/err" </dev/null
rc=$?
if [ "$rc" -eq 2 ]; then pass 'classify exits 2 on a bad ref'; else fail "classify with a bad ref (exit $rc)"; fi

# --- A node that cannot run must not make a dependency change look OTA-safe ---
mkdir "$T/fakebin" && printf '#!/bin/sh\nexit 127\n' >"$T/fakebin/node" && chmod +x "$T/fakebin/node"
change package.json "$FX/package-deps.json"
(cd "$R" && PATH="$T/fakebin:$PATH" sh "$CHECK" classify base topic) >"$T/out" 2>"$T/err" </dev/null
rc=$?
if [ "$rc" -eq 2 ] && grep -Fxq 'check-ota: cannot compare package.json: node failed (exit 127)' "$T/err"; then pass 'classify exits 2 when node cannot run'; else fail "classify with a broken node (exit $rc)"; fi
(cd "$R" && PATH="$T/fakebin:$PATH" PR_BODY=$(cat "$FX/ota.md") BASE_SHA=base HEAD_SHA=topic sh "$CHECK") >"$T/out" 2>"$T/err" </dev/null
rc=$?
if [ "$rc" -eq 1 ] && grep -Fq 'node failed (exit 127)' "$T/err"; then pass 'OTA with a broken node fails'; else fail "OTA with a broken node (exit $rc)"; fi

# --- Injection: the description only travels through the environment ---
P=$T/pwned
change src/a.ts
# shellcheck disable=SC2016  # the single quotes keep the injection payloads literal on purpose
for payload in '$(touch '"$P"'1)' '`touch '"$P"'2`' "'; touch $P"'3; '"'" '%s%n $HOME ${HOME} $((1+1))'; do
  INJ=$payload awk '{print} /^## Resumen/{print ""; print ENVIRON["INJ"]}' "$FX/ota.md" >"$T/inj.md"
  expect_pass "injection in the body stays inert: $payload" "$T/inj.md"
done
if ls "$T"/pwned* >/dev/null 2>&1; then fail 'injection created a file'; else pass 'injection created no file'; fi

echo
echo "$PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ]
