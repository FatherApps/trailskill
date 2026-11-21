#!/bin/bash
# Tests .github/scripts/flag-stale-prs.sh with stub `gh` and `git` programs (no network, all data is synthetic).
# Usage: bash .github/scripts/flag-stale-prs.test.sh   (from the repository root)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$HERE/flag-stale-prs.sh"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
trap 'exit 130' INT TERM

PASSED=0
FAILED=0
pass() { PASSED=$((PASSED + 1)); printf "ok   %s\n" "$1"; }
fail() { FAILED=$((FAILED + 1)); printf "FAIL %s\n" "$1"; }

mkdir "$T/bin"
# Stub gh: answers `gh api ...` from FAKE_* variables and records every write in $T/writes.
cat >"$T/bin/gh" <<'EOF'
#!/bin/sh
args="$*"
n=$(printf '%s' "$args" | sed -En 's#.*repos/[^/]+/[^/]+/(pulls|issues)/([0-9]+).*#\2#p')
sha_n=$(printf '%s' "$args" | sed -En 's#.*compare/main\.\.\.sha([0-9]+).*#\1#p')
case "$args" in
  *"-X POST"*)
    case " $FAKE_FAIL " in *" post:$n "*) exit 1 ;; esac
    echo "$args" >>"$FAKE_WRITES"
    exit 0 ;;
  *"pulls?state=open"*)
    # Builds the JSON GitHub would return and applies the script's own --jq filter to it.
    filter=; prev=; for a in "$@"; do [ "$prev" = --jq ] && filter=$a; prev=$a; done
    json=; for p in $FAKE_PRS; do
      eval "h=\${FAKE_HEAD_$p:-fix/branch-$p}; b=\${FAKE_BOT_$p:-}"
      t=User; [ -n "$b" ] && t=Bot
      json="$json${json:+,}{\"number\":$p,\"head\":{\"ref\":\"$h\",\"repo\":{\"full_name\":\"owner/repo\"}},\"user\":{\"type\":\"$t\"}}"
    done
    printf '[%s]' "$json" | jq -r "$filter"; exit 0 ;;
  *"/compare/"*)
    case " $FAKE_FAIL " in *" compare:$sha_n "*) exit 1 ;; esac
    eval "echo \"\${FAKE_BEHIND_$sha_n:-0}\""; exit 0 ;;
  *"/comments"*)
    eval "m=\${FAKE_MARKER_$n:-}"; [ -n "$m" ] && echo 99; exit 0 ;;
  *"/pulls/"*)
    case " $FAKE_FAIL " in *" pull:$n "*) exit 1 ;; esac
    eval "s=\${FAKE_STATE_$n:-clean}"; printf '%s\tsha%s\n' "$s" "$n"; exit 0 ;;
esac
exit 1
EOF
# Stub git: fetch can fail per pull request; merge-tree answers for the pull request fetched last.
cat >"$T/bin/git" <<'EOF'
#!/bin/sh
case "$1" in
  fetch)
    n=$(printf '%s' "$*" | sed -En 's#.*refs/pull/([0-9]+)/head.*#\1#p')
    case " $FAKE_FAIL " in *" fetch:$n "*) exit 1 ;; esac
    echo "$n" >"$FAKE_LAST"; exit 0 ;;
  merge-tree)
    n=$(cat "$FAKE_LAST")
    eval "c=\${FAKE_CONFLICT_$n:-}"
    if [ -n "$c" ]; then printf 'treeoid\nfile-%s.txt\n\nCONFLICT (content): file-%s.txt\n' "$n" "$n"; exit 1; fi
    echo treeoid; exit 0 ;;
esac
exit 1
EOF
chmod +x "$T/bin/gh" "$T/bin/git"

# run_case: runs the script with the FAKE_* variables the caller exported; sets RC, OUT and WRITES.
run_case() {
  : >"$T/writes"
  OUT=$(PATH="$T/bin:$PATH" GH_TOKEN=x REPO=owner/repo RETRY_SLEEP=0 FAKE_WRITES="$T/writes" FAKE_LAST="$T/last" bash "$SCRIPT" 2>&1)
  RC=$?
  WRITES=$(cat "$T/writes")
}
reset() { unset FAKE_PRS FAKE_FAIL DRY_RUN; for v in $(env | sed -n 's/^\(FAKE_[A-Z]*_[0-9]*\)=.*/\1/p'); do unset "$v"; done; }
has() { printf '%s' "$1" | grep -Fq -- "$2"; }

# 1. Up to date: nothing is written, the job passes.
reset
export FAKE_PRS="1" FAKE_STATE_1=clean FAKE_BEHIND_1=0
run_case
if [ "$RC" -eq 0 ] && [ -z "$WRITES" ] && has "$OUT" "#1: up to date"; then pass "up to date: no writes, exit 0"; else fail "up to date: no writes, exit 0 (rc $RC)"; fi

# 2. Behind with a clean merge: label and one comment.
reset
export FAKE_PRS="2" FAKE_STATE_2=clean FAKE_BEHIND_2=3
run_case
if [ "$RC" -eq 0 ] && has "$WRITES" "issues/2/labels" && has "$WRITES" "issues/2/comments"; then pass "behind: label and comment"; else fail "behind: label and comment (rc $RC)"; fi

# 3. Conflict: the comment lists the conflicting file of that pull request.
reset
export FAKE_PRS="3" FAKE_STATE_3=dirty FAKE_CONFLICT_3=1
run_case
if [ "$RC" -eq 0 ] && has "$WRITES" "file-3.txt"; then pass "conflict: comment lists the files"; else fail "conflict: comment lists the files (rc $RC)"; fi

# 4. A comment with the marker already exists: label only, no duplicate.
reset
export FAKE_PRS="4" FAKE_STATE_4=dirty FAKE_CONFLICT_4=1 FAKE_MARKER_4=1
run_case
if [ "$RC" -eq 0 ] && has "$WRITES" "issues/4/labels" && ! has "$WRITES" "issues/4/comments"; then pass "existing marker: no duplicate comment"; else fail "existing marker: no duplicate comment (rc $RC)"; fi

# 5. Dry run: nothing is written.
reset
export FAKE_PRS="5" FAKE_STATE_5=dirty FAKE_CONFLICT_5=1 DRY_RUN=true
run_case
if [ "$RC" -eq 0 ] && [ -z "$WRITES" ] && has "$OUT" "dry run"; then pass "dry run: no writes"; else fail "dry run: no writes (rc $RC)"; fi

# 6-9. Failures are never read as "up to date": ::error::, that pull request is skipped, the others still run, exit 1.
expect_failure() { # label failing-pr failure-text
  if [ "$RC" -eq 1 ] && has "$OUT" "::error::#$2: $3" && ! has "$WRITES" "issues/$2/" && has "$WRITES" "issues/9/labels"; then
    pass "$1"
  else
    fail "$1 (rc $RC: $OUT)"
  fi
}
failing_setup() { reset; export FAKE_PRS="$1 9" FAKE_STATE_9=dirty FAKE_CONFLICT_9=1 FAKE_FAIL="$2"; }

failing_setup 6 "compare:6"; export FAKE_STATE_6=clean
run_case; expect_failure "compare failure: error, skipped, others continue, exit 1" 6 "could not compare with main"

failing_setup 7 "pull:7"
run_case; expect_failure "pull request read failure: error, skipped, exit 1" 7 "could not read the pull request"

failing_setup 8 ""; export FAKE_STATE_8=unknown FAKE_BEHIND_8=2
run_case
if [ "$RC" -eq 0 ] && has "$OUT" "::warning::#8: mergeable_state still unknown" && ! has "$OUT" "::error::" && ! has "$WRITES" "issues/8/" && has "$WRITES" "issues/9/labels"; then
  pass "mergeable_state stays unknown: warning, skipped, others continue, exit 0"
else
  fail "mergeable_state stays unknown: warning, skipped, others continue, exit 0 (rc $RC: $OUT)"
fi

failing_setup 10 "fetch:10"; export FAKE_STATE_10=dirty FAKE_CONFLICT_10=1
run_case; expect_failure "fetch failure: error, skipped, no files of another pull request" 10 "could not fetch the pull request head"
if ! has "$WRITES" "file-9.txt" || ! has "$WRITES" "issues/10/"; then pass "fetch failure never reuses another pull request's FETCH_HEAD"; else fail "fetch failure never reuses another pull request's FETCH_HEAD"; fi

# 10. A failed write is reported too.
failing_setup 11 "post:11"; export FAKE_STATE_11=dirty FAKE_CONFLICT_11=1
run_case
if [ "$RC" -eq 1 ] && has "$OUT" "::error::#11: could not add the label"; then pass "label failure: error and exit 1"; else fail "label failure: error and exit 1 (rc $RC)"; fi

# 11. Bot-managed branches are skipped (no label, no comment, a log line) while a normal stale PR in the same run is flagged.
reset
export FAKE_PRS="12 13 14" FAKE_STATE_12=dirty FAKE_CONFLICT_12=1 FAKE_HEAD_12=release-please--branches--main--components--x \
  FAKE_STATE_13=dirty FAKE_CONFLICT_13=1 FAKE_BOT_13=1 FAKE_STATE_14=dirty FAKE_CONFLICT_14=1
run_case
if [ "$RC" -eq 0 ] && ! has "$WRITES" "issues/12/" && ! has "$WRITES" "issues/13/" \
  && has "$OUT" "#12: skipped (bot-managed branch)" && has "$OUT" "#13: skipped (bot-managed branch)"; then
  pass "release-please branch and bot author: skipped, no label, no comment"
else fail "release-please branch and bot author: skipped (rc $RC: $OUT)"; fi
if [ "$(printf '%s\n' "$WRITES" | grep -c 'issues/14/labels')" -eq 1 ] && [ "$(printf '%s\n' "$WRITES" | grep -c 'issues/14/comments')" -eq 1 ]; then
  pass "normal stale PR in the same run: one label and one comment"
else fail "normal stale PR in the same run: one label and one comment"; fi

printf "\n%s passed, %s failed\n" "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
