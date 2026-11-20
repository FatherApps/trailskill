#!/bin/bash
# Tests .github/scripts/check-eas-release.sh with a stub eas-cli (no network, all data is synthetic).
# Usage: bash .github/scripts/check-eas-release.test.sh   (from the repository root)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$HERE/check-eas-release.sh"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
trap 'exit 130' INT TERM

PASSED=0
FAILED=0
pass() { PASSED=$((PASSED + 1)); printf "ok   %s\n" "$1"; }
fail() { FAILED=$((FAILED + 1)); printf "FAIL %s\n" "$1"; }

SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
OTHER=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

# Stub eas-cli: the Nth call prints $T/answers/N (or the last answer); an answer "ERROR" exits 1.
cat >"$T/eas" <<'EOF'
#!/bin/sh
n=$(($(cat "$STUB_DIR/calls" 2>/dev/null || echo 0) + 1))
echo "$n" >"$STUB_DIR/calls"
f="$STUB_DIR/answers/$n"
[ -f "$f" ] || f=$(ls "$STUB_DIR/answers" | sort -n | tail -1 | sed "s#^#$STUB_DIR/answers/#")
[ "$(cat "$f")" = "ERROR" ] && exit 1
cat "$f"
EOF
chmod +x "$T/eas"

run_json() { # status sha file
  printf '[{"id":"run-%s","status":"%s","gitCommitHash":"%s","workflowFileName":"%s"}]' "$1" "$1" "$2" "$3"
}

# Runs the script with the given answers (one per poll). Sets OUT, CODE and CALLS.
check() {
  rm -rf "$T/stub" && mkdir -p "$T/stub/answers"
  i=1
  for a in "$@"; do printf '%s' "$a" >"$T/stub/answers/$i"; i=$((i + 1)); done
  : >"$T/summary"
  OUT=$(STUB_DIR="$T/stub" EAS_CMD="$T/eas" SLEEP_CMD=true POLL=60 START_TIMEOUT=180 FINISH_TIMEOUT=300 \
    TAG=v9.9.9 SHA=$SHA EXPO_TOKEN=${TOKEN-synthetic-token} GITHUB_STEP_SUMMARY="$T/summary" bash "$SCRIPT" 2>&1)
  CODE=$?
  CALLS=$(cat "$T/stub/calls" 2>/dev/null || echo 0)
}

expect() { # name expected_code text
  if [ "$CODE" -eq "$2" ] && printf '%s' "$OUT" | grep -q -- "$3"; then pass "$1"; else
    fail "$1 (code $CODE, calls $CALLS)"; printf '%s\n' "$OUT" | sed 's/^/     /'
  fi
}

check "$(run_json SUCCESS $SHA release.yml)"
expect "a finished run for the tag commit is green" 0 "terminó bien"

check "$(run_json SUCCESS $SHA .eas/workflows/release.yml)"
expect "the workflow file name may carry its folder" 0 "terminó bien"

check "$(run_json FAILURE $SHA release.yml)"
expect "a failed run is red" 1 "terminó en FAILURE"

check "$(run_json CANCELED $SHA release.yml)"
expect "a canceled run is red" 1 "terminó en CANCELED"

check '[]' '[]' "$(run_json IN_PROGRESS $SHA release.yml)" "$(run_json SUCCESS $SHA release.yml)"
expect "waits for the run to appear and to end" 0 "terminó bien"
[ "$CALLS" -eq 4 ] && pass "polls once per check until the end" || fail "polls once per check until the end (calls $CALLS)"

check '[]'
expect "no run for the commit by START_TIMEOUT is red" 1 "la entrega no arrancó"
[ "$CALLS" -eq 4 ] && pass "gives up right after START_TIMEOUT" || fail "gives up right after START_TIMEOUT (calls $CALLS)"

check "$(run_json SUCCESS $OTHER release.yml)"
expect "a run for another commit does not count" 1 "la entrega no arrancó"

check "$(run_json SUCCESS $SHA ci.yml)"
expect "a run of another workflow does not count" 1 "la entrega no arrancó"

check "$(run_json IN_PROGRESS $SHA release.yml)"
expect "a run still going at FINISH_TIMEOUT is green with a warning" 0 "::warning::.*sigue en IN_PROGRESS"

check ERROR ERROR ERROR
expect "EAS unreadable three times in a row is red" 1 "No se pudo leer EAS 3 veces"

check ERROR "$(run_json SUCCESS $SHA release.yml)"
expect "one read error is retried" 0 "terminó bien"

check 'not json'
expect "an answer that is not a list is a read error" 1 "No se pudo leer EAS"

TOKEN='' check "$(run_json SUCCESS $SHA release.yml)"
expect "a missing EXPO_TOKEN is red and says so" 1 "Falta el secreto EXPO_TOKEN"
[ "$CALLS" -eq 0 ] && pass "a missing token never calls EAS" || fail "a missing token never calls EAS (calls $CALLS)"

check "$(run_json FAILURE $SHA release.yml)"
grep -q "terminó en FAILURE" "$T/summary" && pass "the reason goes to the job summary" || fail "the reason goes to the job summary"

# Most recent run first: a newer success after an older failure counts as success.
check "[$(run_json SUCCESS $SHA release.yml | tr -d '[]'),$(run_json FAILURE $SHA release.yml | tr -d '[]')]"
expect "only the most recent run for the commit counts" 0 "terminó bien"

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
