#!/bin/sh
# Tests .github/scripts/check-commit-trailers.sh against throwaway git repositories.
# Usage: sh .github/scripts/check-commit-trailers.test.sh   (from the repository root; no network, all data is synthetic)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
CHECK=$HERE/check-commit-trailers.sh
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
trap 'exit 130' INT TERM

PASSED=0
FAILED=0
pass() { PASSED=$((PASSED + 1)); printf "ok   %s\n" "$1"; }
fail() { FAILED=$((FAILED + 1)); printf "FAIL %s\n" "$1"; [ -s "$T/err" ] && sed 's/^/       stderr: /' "$T/err"; }

git init -q "$T/repo"
cd "$T/repo" || exit 1
git config user.name tester
git config user.email tester@example.test
git config commit.gpgsign false
git commit -q --allow-empty -m 'chore: base'
BASE=$(git rev-parse HEAD)

# commit MESSAGE: adds one empty commit on top of BASE-relative history.
commit() { git commit -q --allow-empty -m "$1"; }
run() {
  COMMIT_RANGE="$BASE..HEAD" sh "$CHECK" >"$T/out" 2>"$T/err" </dev/null
  rc=$?
}
expect_pass() {
  run
  if [ "$rc" -eq 0 ] && [ ! -s "$T/err" ]; then pass "$1"; else fail "$1 (exit $rc)"; fi
}
# expect_fail DESC NEEDLE: exits 1 and NEEDLE appears in stderr.
expect_fail() {
  run
  if [ "$rc" -eq 1 ] && grep -Fq -- "$2" "$T/err"; then pass "$1"; else fail "$1 (exit $rc, wanted: $2)"; fi
}
reset() { git reset -q --hard "$BASE"; }

commit 'feat: clean commit'
expect_pass 'a clean commit passes'
reset

commit 'feat: add widget

Claude-Session: https://example.test/session/1'
expect_fail 'Claude-Session fails naming the trailer' 'trailer "Claude-Session:"'
expect_fail 'the failure names the commit subject' 'feat: add widget'
reset

commit 'feat: add widget

Co-Authored-By: Someone <someone@example.test>'
expect_fail 'Co-Authored-By fails naming the trailer' 'trailer "Co-Authored-By:"'
reset

commit 'feat: add widget

co-authored-by: Someone <someone@example.test>'
expect_fail 'lowercase co-authored-by fails' 'trailer "Co-Authored-By:"'
reset

commit 'feat: add widget

CLAUDE-SESSION: https://example.test/session/1'
expect_fail 'uppercase CLAUDE-SESSION fails' 'trailer "Claude-Session:"'
reset

commit 'feat: add widget

Claude-Session: https://example.test/session/1

Body text after the trailer.

Refs #12'
expect_fail 'a trailer in the middle of the body fails' 'trailer "Claude-Session:"'
reset

commit 'feat: add widget
Claude-Session: https://example.test/session/1'
expect_fail 'a trailer on the line right after the subject fails' 'trailer "Claude-Session:"'
reset

git commit -q --allow-empty -F - <<'MSG'
Co-Authored-By: Someone <someone@example.test>
MSG
expect_fail 'a trailer as the whole subject line fails' 'trailer "Co-Authored-By:"'
reset

commit 'feat: add widget

The Co-Authored-By: trailer is rejected here, and a Claude-Session: line too.'
expect_pass 'a sentence that mentions a trailer name mid-line passes'
reset

commit 'feat: clean one'
commit 'fix: dirty one

Co-Authored-By: Someone <someone@example.test>'
expect_fail 'one bad commit among clean ones fails' 'fix: dirty one'
if grep -Fq 'feat: clean one' "$T/err"; then fail 'the clean commit is not named'; else pass 'the clean commit is not named'; fi
reset

# A payload in the message must stay inert and still be detected.
P=$T/pwned
commit "feat: payload

\$(touch $P)
Claude-Session: \`touch $P\`"
expect_fail 'a shell payload in the message is inert and the trailer is found' 'trailer "Claude-Session:"'
if [ -e "$P" ]; then fail 'the payload created a file'; else pass 'the payload created no file'; fi
reset

COMMIT_RANGE= sh "$CHECK" >"$T/out" 2>"$T/err" </dev/null; rc=$?
if [ "$rc" -eq 2 ] && grep -Fq 'COMMIT_RANGE is required' "$T/err"; then pass 'a missing range exits 2'; else fail "a missing range exits 2 (exit $rc)"; fi
COMMIT_RANGE='nope..HEAD' sh "$CHECK" >"$T/out" 2>"$T/err" </dev/null; rc=$?
if [ "$rc" -eq 2 ]; then pass 'an unresolvable range exits 2'; else fail "an unresolvable range exits 2 (exit $rc)"; fi

echo
echo "$PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ]
