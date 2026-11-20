#!/bin/sh
# Tests .githooks/pre-push against throwaway git repositories (a bare remote and a clone).
# Usage: sh .githooks/pre-push.test.sh   (from the repository root; no network, all data is synthetic)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
trap 'exit 130' INT TERM

PASSED=0
FAILED=0
pass() { PASSED=$((PASSED + 1)); printf "ok   %s\n" "$1"; }
fail() { FAILED=$((FAILED + 1)); printf "FAIL %s\n" "$1"; }
UPDATED="rama actualizada con main: corre los checks y vuelve a hacer push"

git init -q --bare -b main "$T/remote.git"
git clone -q "$T/remote.git" "$T/clone" 2>/dev/null
cd "$T/clone" || exit 1
git config user.name tester
git config user.email tester@example.test
git config commit.gpgsign false
git config core.hooksPath "$HERE"
echo base >shared.txt
echo base >other.txt
git add . && git commit -q -m 'chore: base'
git push -q origin main --no-verify

# advance_main: a second clone lands a commit on main in the remote.
advance_main() { # file content
  rm -rf "$T/other"
  git clone -q "$T/remote.git" "$T/other" 2>/dev/null
  (
    cd "$T/other" || exit 1
    git config user.name tester
    git config user.email tester@example.test
    git config commit.gpgsign false
    printf '%s\n' "$2" >"$1"
    git commit -q -am "chore: main changes $1"
    git push -q origin main --no-verify
  )
}
push_out() { git push "$@" >"$T/out" 2>"$T/err"; rc=$?; }
clean_tree() { [ -z "$(git status --porcelain)" ] && [ ! -e "$(git rev-parse --git-dir)/MERGE_HEAD" ]; }

# 1. Branch up to date: the push goes through.
git checkout -q -b feat/up-to-date
echo a >a.txt && git add a.txt && git commit -q -m 'feat: a'
push_out origin feat/up-to-date
if [ "$rc" -eq 0 ]; then pass "up-to-date branch is pushed"; else fail "up-to-date branch is pushed (exit $rc: $(cat "$T/err"))"; fi

# 2. Behind main with a clean merge: blocked, message printed, merge commit created.
advance_main other.txt "main change"
echo b >b.txt && git add b.txt && git commit -q -m 'feat: b'
push_out origin feat/up-to-date
if [ "$rc" -ne 0 ] && grep -Fq "$UPDATED" "$T/err"; then pass "behind branch is blocked with the message"; else fail "behind branch is blocked with the message (exit $rc)"; fi
if git merge-base --is-ancestor origin/main HEAD && [ "$(git rev-list --merges --count origin/main..HEAD)" -ge 1 ]; then pass "merge commit of origin/main was created"; else fail "merge commit of origin/main was created"; fi
push_out origin feat/up-to-date
if [ "$rc" -eq 0 ]; then pass "second push after the merge goes through"; else fail "second push after the merge goes through (exit $rc)"; fi

# 3. Conflict: blocked, files listed, no half-done merge.
git checkout -q -b feat/conflict
echo mine >shared.txt && git commit -q -am 'feat: edit shared'
advance_main shared.txt "theirs"
before=$(git rev-parse HEAD)
push_out origin feat/conflict
if [ "$rc" -ne 0 ] && grep -Fq "shared.txt" "$T/err"; then pass "conflict blocks the push and lists the files"; else fail "conflict blocks the push and lists the files (exit $rc)"; fi
if clean_tree && [ "$(git rev-parse HEAD)" = "$before" ]; then pass "conflict leaves a clean tree without MERGE_HEAD"; else fail "conflict leaves a clean tree without MERGE_HEAD"; fi

# 4. Direct push to main stays blocked.
git checkout -q main
git merge -q --ff-only origin/main
echo c >c.txt && git add c.txt && git commit -q -m 'chore: c'
push_out origin main
if [ "$rc" -ne 0 ] && grep -Fq "Direct push to main is not allowed" "$T/err"; then pass "push to main is blocked"; else fail "push to main is blocked (exit $rc)"; fi
git reset -q --hard origin/main

# 5. Tag: pushed without fetching or merging.
git checkout -q feat/conflict
advance_main other.txt "newer main"
git tag v-test
tip=$(git rev-parse HEAD)
push_out origin v-test
if [ "$rc" -eq 0 ] && [ "$(git rev-parse HEAD)" = "$tip" ] && ! git merge-base --is-ancestor origin/main HEAD; then pass "tag push does not fetch or merge"; else fail "tag push does not fetch or merge (exit $rc)"; fi
if ! git rev-parse -q --verify origin/main >/dev/null || [ "$(git rev-parse origin/main)" != "$(git -C "$T/remote.git" rev-parse main)" ]; then pass "tag push leaves origin/main untouched"; else fail "tag push leaves origin/main untouched"; fi

# 6. Branch deletion: no merge.
git checkout -q main
push_out origin --delete feat/up-to-date
if [ "$rc" -eq 0 ]; then pass "branch deletion passes"; else fail "branch deletion passes (exit $rc: $(cat "$T/err"))"; fi

# 7. Offline: warns and lets the push through.
git checkout -q -b feat/offline
echo d >d.txt && git add d.txt && git commit -q -m 'feat: d'
git remote set-url origin "$T/missing.git"
git remote set-url --push origin "$T/remote.git"
push_out origin feat/offline
if [ "$rc" -eq 0 ] && grep -Fq "could not fetch" "$T/err" && ! grep -Fq "$UPDATED" "$T/err"; then pass "failed fetch warns and does not block"; else fail "failed fetch warns and does not block (exit $rc)"; fi

printf "\n%s passed, %s failed\n" "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
