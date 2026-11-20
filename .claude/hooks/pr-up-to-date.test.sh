#!/bin/sh
# Tests .claude/hooks/pr-up-to-date.sh by feeding PreToolUse JSON inside throwaway repositories.
# Usage: sh .claude/hooks/pr-up-to-date.test.sh   (from the repository root; no network, all data is synthetic)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
HOOK="$HERE/pr-up-to-date.sh"
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
git commit -q --allow-empty -m 'chore: base'
git push -q origin main
git checkout -q -b feat/work
git commit -q --allow-empty -m 'feat: work'

# run_hook: sends a PreToolUse payload for the command; sets OUT.
run_hook() {
  OUT=$(jq -n --arg c "$1" --arg d "$T/clone" '{tool_name: "Bash", cwd: $d, tool_input: {command: $c}}' | sh "$HOOK")
}
expect_allow() { # command label
  run_hook "$1"
  if [ -z "$OUT" ]; then pass "$2"; else fail "$2 (got: $OUT)"; fi
}
expect_deny() {
  run_hook "$1"
  if printf '%s' "$OUT" | jq -e --arg m "$UPDATED" '.hookSpecificOutput.permissionDecision == "deny" and (.hookSpecificOutput.permissionDecisionReason | startswith($m))' >/dev/null; then pass "$2"; else fail "$2 (got: $OUT)"; fi
}

# Up to date: every PR command passes.
expect_allow 'gh pr create --draft --title x' "gh pr create allowed when up to date"
expect_allow 'orch-pr ready --pr 12' "orch-pr ready allowed when up to date"
expect_allow 'git status' "non-PR command allowed"

# Another clone lands a commit on main, so the branch is behind.
git clone -q "$T/remote.git" "$T/other" 2>/dev/null
git -C "$T/other" -c user.name=tester -c user.email=tester@example.test -c commit.gpgsign=false commit -q --allow-empty -m 'chore: main moves'
git -C "$T/other" push -q origin main

before=$(git rev-parse origin/main)
expect_allow 'npm test' "non-PR command passes while behind"
expect_allow 'gh pr view 12' "other gh pr subcommand passes while behind"
if [ "$(git rev-parse origin/main)" = "$before" ]; then pass "non-PR commands do not fetch"; else fail "non-PR commands do not fetch"; fi

expect_deny 'gh pr create --draft --title x' "gh pr create denied when behind"
expect_deny 'gh pr ready 12' "gh pr ready denied when behind"
expect_deny 'orch-pr create --title x --head feat/work --body-file b.md' "orch-pr create denied when behind"
expect_deny 'orch-pr ready --pr 12' "orch-pr ready denied when behind"
expect_deny 'git push && gh pr create --fill' "PR command inside a chain denied when behind"

# After merging main the same command passes.
git merge -q --no-edit origin/main
expect_allow 'gh pr create --draft --title x' "gh pr create allowed after merging main"

printf "\n%s passed, %s failed\n" "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
