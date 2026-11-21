#!/bin/sh
# Daily freshness check of the PROD backup, run by .github/workflows/backup-freshness.yml (#1337).
# Runs `restore-check.sh --freshness` (needs no key, docker or age). When it fails, opens an issue labeled
# `backup-failed` assigned to the maintainer, or comments on the one already open, then exits non-zero so the
# run turns red. When it passes it touches nothing on GitHub.
# Env: BACKUP_FETCH_CMD       required, as for restore-check.sh (the read-only R2 variables come from the environment)
#      RUN_URL                link to the failing run, put in the issue (optional)
#      BACKUP_ISSUE_ASSIGNEE  GitHub login to assign (default marioser)
#      GH_TOKEN / GH_REPO     used by `gh` (the workflow sets both)
# Only the last `error:` line of the check reaches the issue; no object keys, no data, no environment values.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
: "${BACKUP_FETCH_CMD:?BACKUP_FETCH_CMD is required}"
ASSIGNEE=${BACKUP_ISSUE_ASSIGNEE:-marioser}
LABEL=backup-failed

OUT=$(mktemp "${TMPDIR:-/tmp}/backup-freshness.XXXXXX")
trap 'rm -f "$OUT"' EXIT
sh "$HERE/restore-check.sh" --freshness >"$OUT" 2>&1
RC=$?
cat "$OUT"
[ "$RC" -ne 0 ] || exit 0

REASON=$(sed -n 's/^error: //p' "$OUT" | tail -n 1 | cut -c1-300)
[ -n "$REASON" ] || REASON="the freshness check exited with code $RC without a message"
BODY="La comprobación diaria de frescura de la copia de PROD falló.

- Motivo: \`$REASON\`
- Ejecución: ${RUN_URL:-sin enlace}

Qué hacer: runbook «When the backup fails» en docs/deploy/prod-backup-restore.md. La copia anterior sigue en el bucket; no la borres."

command -v gh >/dev/null 2>&1 || { echo "error: gh is not available, cannot open the backup-failed issue" >&2; exit 1; }
OPEN=$(gh issue list --label "$LABEL" --state open --json number --jq '.[0].number // empty') ||
  { echo "error: cannot list the open backup-failed issues" >&2; exit 1; }
if [ -n "$OPEN" ]; then
  gh issue comment "$OPEN" --body "$BODY" >/dev/null || { echo "error: cannot comment on issue #$OPEN" >&2; exit 1; }
  gh issue edit "$OPEN" --add-assignee "$ASSIGNEE" >/dev/null || { echo "error: cannot assign issue #$OPEN to $ASSIGNEE" >&2; exit 1; }
  echo "commented on the open issue #$OPEN"
else
  gh label create "$LABEL" --description "La copia de PROD no está fresca o no se pudo leer" --color B60205 >/dev/null 2>&1 || true
  gh issue create --title "backup: la copia de PROD no está fresca o no se puede leer" --label "$LABEL" \
    --assignee "$ASSIGNEE" --body "$BODY" || { echo "error: cannot create the backup-failed issue" >&2; exit 1; }
fi
exit 1
