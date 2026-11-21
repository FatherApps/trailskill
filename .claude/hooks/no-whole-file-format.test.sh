#!/bin/sh
# Tests .claude/hooks/no-whole-file-format.sh by feeding it synthetic PreToolUse JSON.
# Usage: sh .claude/hooks/no-whole-file-format.test.sh   (from the repository root; no network, all data is synthetic)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
HOOK="$HERE/no-whole-file-format.sh"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
trap 'exit 130' INT TERM
mkdir -p "$T/src"

PASSED=0
FAILED=0
pass() { PASSED=$((PASSED + 1)); printf "ok   %s\n" "$1"; }
fail() { FAILED=$((FAILED + 1)); printf "FAIL %s\n" "$1"; }
MESSAGE="no formatear archivos enteros: resolvé conflictos a mano"

run_hook() {
  OUT=$(jq -n --arg c "$1" --arg d "$T" '{tool_name: "Bash", cwd: $d, tool_input: {command: $c}}' | sh "$HOOK")
}
expect_allow() { # command
  run_hook "$1"
  if [ -z "$OUT" ]; then pass "allow: $1"; else fail "allow: $1 (got: $OUT)"; fi
}
expect_deny() {
  run_hook "$1"
  if printf '%s' "$OUT" | jq -e --arg m "$MESSAGE" '.hookSpecificOutput.permissionDecision == "deny" and .hookSpecificOutput.permissionDecisionReason == $m' >/dev/null; then pass "deny:  $1"; else fail "deny:  $1 (got: $OUT)"; fi
}

# Denied: whole-file formatters.
expect_deny 'npx prettier --write .'
expect_deny 'prettier -w src'
expect_deny 'npx prettier --write'
expect_deny 'npx prettier --write "src/**/*.ts"'
expect_deny 'npx prettier --write src/a.ts src'
expect_deny 'npx eslint --fix'
expect_deny 'npx eslint --fix .'
expect_deny 'npx expo lint --fix'
expect_deny 'npm run lint -- --fix'
expect_deny 'npm run format'
expect_deny 'git status && npx prettier --write . | tail -1'

# Allowed: explicit files, checks and unrelated commands.
expect_allow 'npx prettier --write src/a.ts'
expect_allow 'npx prettier -w src/a.ts src/b.tsx'
expect_allow 'npx eslint --fix src/a.ts'
expect_allow 'npx expo lint --fix src/a.ts'
expect_allow 'npx prettier --check .'
expect_allow 'npm run format:check'
expect_allow 'npm run lint'
expect_allow 'npx eslint src/a.ts'
expect_allow 'npm test'
expect_allow 'git status'

printf "\n%s passed, %s failed\n" "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
