#!/bin/bash
# Checks, read-only, that the EAS release workflow (.eas/workflows/release.yml) started for a release tag and how it ended.
# Called by .github/workflows/release-watch.yml. It never starts, re-runs or cancels anything on EAS.
# Tests: bash .github/scripts/check-eas-release.test.sh
#
# Input (environment):
#   TAG             the release tag, for messages (vX.Y.Z)
#   SHA             the commit the tag points to; the EAS run must have this gitCommitHash
#   EXPO_TOKEN      Expo access token (repository secret); required
#   EAS_CMD         command that runs eas-cli (default: pinned npx eas-cli)
#   START_TIMEOUT   seconds to wait for the run to appear (default 900)
#   FINISH_TIMEOUT  seconds to wait, in total, for the run to end (default 2700)
#   POLL            seconds between checks (default 60)
#   SLEEP_CMD       sleep command (tests replace it)
# Exit: 0 when the run succeeded, or started and is still running at FINISH_TIMEOUT (with a warning);
#       1 when no run appeared, the run failed or was canceled, the token is missing, or EAS could not be read.
set -u

TAG=${TAG:-}
SHA=${SHA:-}
EAS_CMD=${EAS_CMD:-npx --yes eas-cli@27.11.0}
START_TIMEOUT=${START_TIMEOUT:-900}
FINISH_TIMEOUT=${FINISH_TIMEOUT:-2700}
POLL=${POLL:-60}
SLEEP_CMD=${SLEEP_CMD:-sleep}
MAX_READ_ERRORS=3

summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '%s\n' "$1" >>"$GITHUB_STEP_SUMMARY"; fi
}
error() {
  echo "::error::$1"
  summary "❌ $1"
  exit 1
}

[ -n "$TAG" ] || error "Falta la etiqueta (TAG)."
[ -n "$SHA" ] || error "Falta el commit de la etiqueta (SHA)."
[ -n "${EXPO_TOKEN:-}" ] || error "Falta el secreto EXPO_TOKEN: sin él no se puede leer EAS. El maintainer lo crea una vez (docs/RELEASING.md, One-time setup)."

elapsed=0
read_errors=0
while :; do
  if out=$($EAS_CMD workflow:runs --json --limit 50 2>/dev/null) && printf '%s' "$out" | jq -e 'type == "array"' >/dev/null 2>&1; then
    read_errors=0
    # Most recent run first, as eas-cli lists them.
    run=$(printf '%s' "$out" | jq -c --arg sha "$SHA" \
      '[.[] | select(.gitCommitHash == $sha and ((.workflowFileName // "") | endswith("release.yml")))] | first // empty')
    if [ -n "$run" ]; then
      id=$(printf '%s' "$run" | jq -r '.id')
      status=$(printf '%s' "$run" | jq -r '.status')
      case "$status" in
        SUCCESS)
          echo "La entrega de $TAG terminó bien en EAS (ejecución $id)."
          summary "✅ La entrega de $TAG terminó bien en EAS (ejecución \`$id\`). Revisa en expo.dev qué ruta tomó: \`update\` (OTA) o \`build\` → \`submit\`."
          exit 0 ;;
        FAILURE | CANCELED)
          error "La entrega de $TAG en EAS terminó en $status (ejecución $id). Recupérala en expo.dev con Re-run workflow → Re-run from failed jobs (docs/RELEASING.md, Standard release, paso 6)." ;;
        *)
          if [ "$elapsed" -ge "$FINISH_TIMEOUT" ]; then
            echo "::warning::La entrega de $TAG arrancó en EAS y sigue en $status (ejecución $id); se dejó de esperar."
            summary "⏳ La entrega de $TAG arrancó en EAS y sigue en \`$status\` (ejecución \`$id\`). Sigue su final en expo.dev."
            exit 0
          fi ;;
      esac
    elif [ "$elapsed" -ge "$START_TIMEOUT" ]; then
      error "No apareció ninguna ejecución de release.yml en EAS para $TAG (commit $SHA) en $START_TIMEOUT s: la entrega no arrancó. Revisa la integración de GitHub con EAS y lánzala a mano (docs/RELEASING.md)."
    fi
  else
    read_errors=$((read_errors + 1))
    echo "::warning::No se pudo leer EAS (intento $read_errors de $MAX_READ_ERRORS)."
    [ "$read_errors" -lt "$MAX_READ_ERRORS" ] || error "No se pudo leer EAS $MAX_READ_ERRORS veces seguidas: revisa EXPO_TOKEN y su rol. No se sabe si la entrega de $TAG arrancó."
  fi
  $SLEEP_CMD "$POLL"
  elapsed=$((elapsed + POLL))
done
