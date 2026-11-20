#!/bin/sh
# Decides whether a release must be delivered as a Play build instead of an OTA update (#1289).
# A release that changes supabase/migrations/, supabase/functions/ or powersync/ changes how the app talks to the backend, so it needs a build even when the Expo fingerprint did not move (docs/RELEASING.md, "Runtime version: fingerprint").
# Tests: sh .github/scripts/check-backend-release.test.sh
#
# Usage: sh .github/scripts/check-backend-release.sh vX.Y.Z   (from a Git checkout that has the tag and its history)
# Prints one line on stdout: force_build=true or force_build=false. Always exits 0.
# Fails closed: when the answer cannot be computed (no tag, shallow checkout, no previous release tag, git error) it prints
# force_build=true, so the release builds and submits and never goes out as an OTA update. The reason goes to stderr.
set -u

PATHS='supabase/migrations supabase/functions powersync'
TAG=${1:-}

fail_closed() {
  echo "check-backend-release: $1; forcing a build" >&2
  echo "force_build=true"
  exit 0
}

[ -n "$TAG" ] || fail_closed "no release tag given"
git rev-parse --verify --quiet "$TAG^{commit}" >/dev/null 2>&1 || fail_closed "release tag $TAG not found in this checkout"
# eas/checkout makes a shallow clone (--depth 1): without history the previous release cannot be found.
[ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = false ] || fail_closed "the checkout is shallow, so the history is incomplete"

# The previous release reachable from the tag: no manual OTA tag (vX.Y.Z+ota.N), and never the tag itself (it starts at its parent).
PREV=$(git describe --tags --abbrev=0 --match 'v*' --exclude '*+ota*' "$TAG^" 2>/dev/null) && [ -n "$PREV" ] ||
  fail_closed "no previous release tag reachable from $TAG"

# shellcheck disable=SC2086 # PATHS is a fixed list of words
git diff --quiet "$PREV" "$TAG" -- $PATHS
case $? in
  0) echo "check-backend-release: no backend change between $PREV and $TAG" >&2; echo "force_build=false" ;;
  1) echo "check-backend-release: backend files changed between $PREV and $TAG" >&2; echo "force_build=true" ;;
  *) fail_closed "git diff failed between $PREV and $TAG" ;;
esac
