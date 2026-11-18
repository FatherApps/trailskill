#!/bin/sh
# Tests .githooks/post-commit against throwaway git repositories.
# Usage: sh .githooks/post-commit.test.sh   (from the repository root; no network, all data is synthetic)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
trap 'exit 130' INT TERM

PASSED=0
FAILED=0
pass() { PASSED=$((PASSED + 1)); printf "ok   %s\n" "$1"; }
fail() { FAILED=$((FAILED + 1)); printf "FAIL %s\n" "$1"; }

git init -q -b main "$T/repo"
cd "$T/repo" || exit 1
git config user.name tester
git config user.email tester@example.test
git config commit.gpgsign false
git config core.hooksPath "$HERE"
git commit -q --allow-empty -m 'chore: base'

# commit_out: makes a commit with the real hook installed and captures what it prints.
commit_out() {
  unset ORCH_ROLE
  env "$@" git commit -q --allow-empty -m 'chore: step' >"$T/out" 2>"$T/err"
  rc=$?
}
expect_reminder() {
  if [ "$rc" -eq 0 ] && grep -Fq "gh pr create --draft" "$T/err"; then pass "$1"; else fail "$1 (exit $rc)"; fi
}
expect_silent() {
  if [ "$rc" -eq 0 ] && [ ! -s "$T/err" ] && [ ! -s "$T/out" ]; then pass "$1"; else fail "$1 (exit $rc)"; fi
}

git checkout -q -b chore/1-work
commit_out FOO=1
expect_reminder "reminds after a commit on a work branch"

commit_out ORCH_ROLE=planner
expect_reminder "reminds when ORCH_ROLE is not worker"

commit_out ORCH_ROLE=worker
expect_silent "silent for an orch worker"

git_dir=$(git rev-parse --git-dir)
mkdir "$git_dir/rebase-merge"
commit_out FOO=1
expect_silent "silent during a rebase"
rmdir "$git_dir/rebase-merge"

git checkout -q --detach
commit_out FOO=1
expect_silent "silent with a detached HEAD"

git checkout -q main
commit_out FOO=1
expect_silent "silent on main"

printf "\n%s passed, %s failed\n" "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
