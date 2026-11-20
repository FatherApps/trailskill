#!/bin/sh
# Tests .github/scripts/check-backend-release.sh with a throwaway Git repository and synthetic files.
# Usage: sh .github/scripts/check-backend-release.test.sh   (from the repository root; no network)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
CHECK=$HERE/check-backend-release.sh
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
trap 'exit 130' INT TERM

PASSED=0
FAILED=0

pass() { PASSED=$((PASSED + 1)); printf "ok   %s\n" "$1"; }
fail() {
  FAILED=$((FAILED + 1)); printf "FAIL %s\n" "$1"
  [ -s "$T/err" ] && sed 's/^/       stderr: /' "$T/err"
  [ -s "$T/out" ] && sed 's/^/       stdout: /' "$T/out"
}

# A throwaway repository with a first release v1.0.0 that holds one file of each kind.
new_repo() {
  R=$T/$1
  git init -q "$R"
  git -C "$R" config user.email test@example.test
  git -C "$R" config user.name Test
  git -C "$R" config commit.gpgsign false
  mkdir -p "$R/src" "$R/supabase/migrations" "$R/supabase/functions" "$R/powersync"
  echo 'a' >"$R/src/a.ts"
  echo 'select 1;' >"$R/supabase/migrations/1_a.sql"
  echo 'a' >"$R/supabase/functions/a.ts"
  echo 'a' >"$R/powersync/sync-config.yaml"
  git -C "$R" add -A
  git -C "$R" commit -qm base
  git -C "$R" tag v1.0.0
}

# touch_commit REPO PATH: appends a line to PATH and commits it.
touch_commit() {
  mkdir -p "$1/$(dirname "$2")"
  echo "// synthetic change" >>"$1/$2"
  git -C "$1" add -A
  git -C "$1" commit -qm "change $2"
}

# run DIR TAG: runs the script in DIR; sets rc.
run() {
  (cd "$1" && sh "$CHECK" "$2") >"$T/out" 2>"$T/err" </dev/null
  rc=$?
}

# expect DESC DIR TAG VALUE [NEEDLE]: prints force_build=VALUE, exits 0, and NEEDLE (if any) is in stderr.
expect() {
  run "$2" "$3"
  if [ "$rc" -eq 0 ] && [ "$(cat "$T/out")" = "force_build=$4" ] && { [ $# -lt 5 ] || grep -Fq -- "$5" "$T/err"; }; then
    pass "$1"
  else
    fail "$1 (exit $rc, wanted force_build=$4${5:+ with: $5})"
  fi
}

# --- A path that needs a build between two releases ---
for path in supabase/migrations/2_b.sql supabase/functions/b.ts powersync/sync-config.yaml; do
  new_repo "r$$"
  touch_commit "$R" "$path"
  git -C "$R" tag v1.1.0
  expect "a change in $path forces a build" "$R" v1.1.0 true
  rm -rf "$R"
done

new_repo r_src
touch_commit "$R" src/a.ts
git -C "$R" tag v1.1.0
expect 'a change only in src/ does not force a build' "$R" v1.1.0 false
SRC=$R

# --- The previous release ---
new_repo r_ota
touch_commit "$R" supabase/migrations/2_b.sql
git -C "$R" tag v1.0.1+ota.1
touch_commit "$R" src/a.ts
git -C "$R" tag v1.1.0
expect 'an +ota tag in between is not the previous release' "$R" v1.1.0 true
git -C "$R" describe --tags --abbrev=0 --match 'v*' --exclude '*+ota*' v1.1.0^ >"$T/prev" 2>/dev/null
[ "$(cat "$T/prev")" = v1.0.0 ] && pass 'fixture: the previous release is v1.0.0, not the +ota tag' || fail 'fixture: previous release'

# A hotfix on a branch: the previous release is the one it descends from.
new_repo r_hotfix
touch_commit "$R" supabase/migrations/2_b.sql
git -C "$R" tag v1.1.0
git -C "$R" checkout -q -b release/1.0 v1.0.0
touch_commit "$R" src/a.ts
git -C "$R" tag v1.0.1
expect 'a hotfix is compared with the release it descends from' "$R" v1.0.1 false

# --- Fail closed: every case builds, never OTA, and says why ---
new_repo r_first
git -C "$R" tag -d v1.0.0 >/dev/null
git -C "$R" tag v1.0.1
expect 'no previous release tag builds' "$R" v1.0.1 true 'no previous release tag'

expect 'a tag that does not exist builds' "$SRC" v9.9.9 true 'not found'
expect 'no tag argument builds' "$SRC" '' true 'no release tag'

mkdir "$T/nogit"
expect 'a directory that is not a Git repository builds' "$T/nogit" v1.1.0 true 'not found'

git clone -q --depth 1 --no-local "file://$SRC" "$T/shallow" 2>/dev/null
git -C "$T/shallow" fetch -q --depth 1 --tags origin 2>/dev/null
expect 'a shallow checkout builds' "$T/shallow" v1.1.0 true 'shallow'

# A git that fails on "diff" while everything before it works.
mkdir "$T/shim"
REAL=$(command -v git)
printf '#!/bin/sh\n[ "$1" = diff ] && exit 128\nexec "%s" "$@"\n' "$REAL" >"$T/shim/git"
chmod +x "$T/shim/git"
(cd "$SRC" && PATH=$T/shim:$PATH sh "$CHECK" v1.1.0) >"$T/out" 2>"$T/err" </dev/null
rc=$?
if [ "$rc" -eq 0 ] && [ "$(cat "$T/out")" = force_build=true ] && grep -Fq 'git diff failed' "$T/err"; then
  pass 'a failing git diff builds'
else
  fail "a failing git diff builds (exit $rc)"
fi

printf '\n%d passed, %d failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
