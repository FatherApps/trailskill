#!/bin/sh
# Builds the results-import Edge Function bundle and puts it in the functions volume of the Supabase stack.
# Usage: sh deploy/scripts/functions-bundle.sh <functions-volume-dir>
#   <functions-volume-dir> is the host folder the stack's `functions` service mounts at /home/deno/functions.
# Only <functions-volume-dir>/results-import is replaced; `main` and every other function stay as they are.
#
# The function imports ../../../src/core/sport/catalogs.ts, a path outside its folder. The bundle carries that file as
# results-import/_vendor/catalogs.ts and a deno.json import map points the import at it, so the function code is
# deployed byte for byte as it is in the repository. The new bundle is checked (deno check) before it replaces the old one.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
FUNCTION=results-import
SRC=$ROOT/supabase/functions/$FUNCTION
CATALOGS=$ROOT/src/core/sport/catalogs.ts
CATALOGS_IMPORT=../../../src/core/sport/catalogs.ts
DENO_IMAGE=denoland/deno:2.1.4 # same Deno as the edge-runtime image the stack runs (v1.74.0)

fail() { echo "FAIL: $1" >&2; exit 1; }

[ $# -eq 1 ] && [ -d "$1" ] || fail "usage: sh deploy/scripts/functions-bundle.sh <functions-volume-dir> (the directory must exist)"
DEST=$(cd "$1" && pwd)
[ -f "$SRC/index.ts" ] || fail "$SRC/index.ts not found"
[ -f "$CATALOGS" ] || fail "$CATALOGS not found"
[ ! -e "$SRC/deno.json" ] || fail "$FUNCTION already has a deno.json; the bundle would overwrite it"

# catalogs.ts runs in Deno and in React Native, and only this file is shipped: it may not import anything.
# (The Jest test in src/core/sport/__tests__ parses the file; this is the same rule for the server.)
if grep -Eq "^[[:space:]]*import[[:space:]('\"{*]|^[[:space:]]*export[[:space:]].*[[:space:]]from[[:space:]]|require[[:space:]]*\(" "$CATALOGS"; then
  fail "src/core/sport/catalogs.ts has imports; the bundle ships only that file"
fi

# The bundle must contain everything the function imports from outside its folder.
outside=$(grep -rhE "from '[^']*src/" "$SRC" --include='*.ts' --exclude-dir=__tests__ | grep -v "/src/core/sport/catalogs.ts'" || true)
[ -z "$outside" ] || fail "the function imports from src/ something other than catalogs.ts, the bundle would miss it: $outside"

STAGE=$DEST/.$FUNCTION.staging
OLD=$DEST/.$FUNCTION.old
rm -rf "$STAGE" "$OLD"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/_vendor"
cp -R "$SRC/." "$STAGE/"
find "$STAGE" -type d -name __tests__ -prune -exec rm -rf {} +
cp "$CATALOGS" "$STAGE/_vendor/catalogs.ts"
printf '{\n  "imports": {\n    "%s": "./_vendor/catalogs.ts"\n  }\n}\n' "$CATALOGS_IMPORT" >"$STAGE/deno.json"

# deno check on the entry point (tsconfig excludes it, so `npm run typecheck` never sees it).
if command -v deno >/dev/null 2>&1; then
  deno check --no-lock --config "$STAGE/deno.json" "$STAGE/index.ts" || fail "deno check failed"
else
  command -v docker >/dev/null 2>&1 || fail "deno check needs deno or docker; neither is installed"
  docker run --rm -v "$STAGE:/bundle:ro" "$DENO_IMAGE" deno check --no-lock --config /bundle/deno.json /bundle/index.ts || fail "deno check failed"
fi
echo "PASS: deno check $FUNCTION/index.ts"

# Swap in the new bundle: the volume never holds a half-copied function.
[ ! -e "$DEST/$FUNCTION" ] || mv "$DEST/$FUNCTION" "$OLD"
mv "$STAGE" "$DEST/$FUNCTION"
rm -rf "$OLD"
echo "DONE: $DEST/$FUNCTION updated ($(find "$DEST/$FUNCTION" -type f | wc -l | tr -d ' ') files, includes _vendor/catalogs.ts)"
