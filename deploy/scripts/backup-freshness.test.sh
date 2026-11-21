#!/bin/sh
# Test of backup-freshness.sh (#1337): the daily freshness check and its backup-failed issue. No R2, no network,
# no Docker: BACKUP_FETCH_CMD writes fake copies and a fake `gh` in front of PATH logs what would be sent to GitHub.
# Usage: sh deploy/scripts/backup-freshness.test.sh
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
trap 'exit 130' INT TERM
FAILS=0
mkdir -p "$T/bin"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1 ($2)"; FAILS=$((FAILS + 1)); sed 's/^/    | /' "$T/out" 2>/dev/null | tail -15; }
eq() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "expected '$2', got '$3'"; fi; }
nonzero() { if [ "$2" -ne 0 ]; then pass "$1"; else fail "$1" "exit code was 0"; fi; }
has() { if grep -q -e "$2" "$T/out"; then pass "$1"; else fail "$1" "output lacks '$2'"; fi; }
hasgh() { if grep -q -e "$2" "$T/gh.log"; then pass "$1"; else fail "$1" "gh calls lack '$2'"; fi; }
hasnt() { if grep -q -e "$2" "$T/out" "$T/gh.log" 2>/dev/null; then fail "$1" "found '$2'"; else pass "$1"; fi; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }
iso_ago() { # ISO time N hours ago, GNU or BSD date
  date -u -d "@$(($(date +%s) - $1 * 3600))" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null ||
    date -u -r "$(($(date +%s) - $1 * 3600))" +%Y-%m-%dT%H:%M:%SZ
}

# Fake fetch: MODE (env) picks what the "bucket" holds. Called as `fetch <dir>`.
cat >"$T/fetch.sh" <<'SH'
#!/bin/sh
dir=$2
case $MODE in
  fresh | old | empty)
    printf 'encrypted bytes' >"$dir/trailskill-prod-latest.dump.age"
    if command -v sha256sum >/dev/null 2>&1; then s=$(sha256sum "$dir/trailskill-prod-latest.dump.age" | cut -d' ' -f1); else s=$(shasum -a 256 "$dir/trailskill-prod-latest.dump.age" | cut -d' ' -f1); fi
    case $MODE in old) at=$OLD_AT ;; *) at=$FRESH_AT ;; esac
    rows=12; [ "$MODE" = empty ] && rows=0
    printf 'created_at=%s\nencrypted_sha256=%s\ncount.public.athletes=%s\n' "$at" "$s" "$rows" >"$dir/trailskill-prod-latest.manifest"
    ;;
  nomanifest) echo "error: manifest trailskill-prod-latest.manifest not found" >&2; exit 1 ;;
  garbage)
    printf 'x' >"$dir/trailskill-prod-latest.dump.age"
    printf 'not a manifest\n' >"$dir/trailskill-prod-latest.manifest"
    ;;
esac
SH

# Fake gh: logs every call; `issue list` answers $T/open (an issue number, or empty for none).
cat >"$T/bin/gh" <<SH
#!/bin/sh
echo "\$*" >>$T/gh.log
case "\$1 \$2" in
  "issue list") cat $T/open ;;
  "label create") exit \${LABEL_EXIT:-0} ;;
  "issue create") echo "https://github.com/o/r/issues/99" ;;
  "issue comment") : ;;
esac
SH
chmod +x "$T/bin/gh"

FRESH_AT=$(iso_ago 3)
OLD_AT=$(iso_ago 60)
run() { # run <mode> [open issue number]
  : >"$T/gh.log"
  printf '%s' "${2:-}" >"$T/open"
  MODE=$1 FRESH_AT=$FRESH_AT OLD_AT=$OLD_AT PATH="$T/bin:$PATH" BACKUP_FETCH_CMD="sh $T/fetch.sh \"\$0\" \"\$@\"" \
    RUN_URL=https://github.com/o/r/actions/runs/1 GH_REPO=o/r BACKUP_ISSUE_ASSIGNEE=assignee1 TMPDIR="$T" \
    sh "$HERE/backup-freshness.sh" >"$T/out" 2>&1
}
calls() { grep -c "^$1" "$T/gh.log"; }

run fresh; r=$?
eq "fresh copy: exit 0" 0 "$r"
eq "fresh copy: no GitHub call at all" 0 "$(wc -l <"$T/gh.log" | tr -d ' ')"

run old; r=$?
nonzero "old copy: exit non-zero (the run turns red)" "$r"
eq "old copy, no open issue: one issue is created" 1 "$(calls 'issue create')"
eq "old copy, no open issue: no comment" 0 "$(calls 'issue comment')"
hasgh "old copy: the issue create call has the label" "issue create.*--label backup-failed"
hasgh "old copy: the issue create call assigns the assignee" "--assignee assignee1"
hasgh "old copy: the run link is in the issue" "actions/runs/1"
has "old copy: the reason is in the issue" "older than 26 h"

run old 42; r=$?
nonzero "old copy with an open issue: exit non-zero" "$r"
eq "old copy with an open issue: no new issue" 0 "$(calls 'issue create')"
eq "old copy with an open issue: one comment on it" 1 "$(calls 'issue comment 42')"
hasgh "old copy with an open issue: the comment has the run link" "actions/runs/1"
hasgh "the open issue lookup only asks for open backup-failed issues" "issue list --label backup-failed --state open"

run empty; r=$?
nonzero "empty copy (0 rows): exit non-zero" "$r"
eq "empty copy: an issue is created" 1 "$(calls 'issue create')"

run nomanifest; r=$?
nonzero "manifest missing: exit non-zero" "$r"
eq "manifest missing: an issue is created" 1 "$(calls 'issue create')"

run garbage; r=$?
nonzero "manifest unreadable: exit non-zero" "$r"
eq "manifest unreadable: an issue is created" 1 "$(calls 'issue create')"

# the label already exists (label create fails): the issue is still created
LABEL_EXIT=1 run old; r=$?
nonzero "label already exists: still exit non-zero" "$r"
eq "label already exists: the issue is still created" 1 "$(calls 'issue create')"

# gh missing or failing is itself a failure, never a silent pass
mkdir -p "$T/nogh"
: >"$T/gh.log"
MODE=old FRESH_AT=$FRESH_AT OLD_AT=$OLD_AT PATH="$T/nogh:/usr/bin:/bin" BACKUP_FETCH_CMD="sh $T/fetch.sh \"\$0\" \"\$@\"" \
  TMPDIR="$T" sh "$HERE/backup-freshness.sh" >"$T/out" 2>&1; r=$?
nonzero "old copy and no gh: exit non-zero" "$r"

# secrets in the environment never reach the log or the issue
SECRET=s3cr3t-value-123
MODE=old FRESH_AT=$FRESH_AT OLD_AT=$OLD_AT PATH="$T/bin:$PATH" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$SECRET \
  BACKUP_FETCH_CMD="sh $T/fetch.sh \"\$0\" \"\$@\"" RUN_URL=u TMPDIR="$T" sh "$HERE/backup-freshness.sh" >"$T/out" 2>&1
hasnt "secrets are never printed nor sent to gh" "$SECRET"

# the fetch command is required
env -u BACKUP_FETCH_CMD PATH="$T/bin:$PATH" sh "$HERE/backup-freshness.sh" >"$T/out" 2>&1; r=$?
nonzero "no BACKUP_FETCH_CMD: exit non-zero" "$r"

if [ "$FAILS" -eq 0 ]; then echo "ALL PASS"; else echo "$FAILS FAILED"; exit 1; fi
