#!/bin/sh
# Builds the results-import Edge Function bundle and puts it in the functions volume of the Supabase stack.
# Usage: sh deploy/scripts/functions-bundle.sh <functions-volume-dir>
#   <functions-volume-dir> is the host folder the stack's `functions` service mounts at /home/deno/functions.
# Only <functions-volume-dir>/results-import is replaced; `main` and every other function stay as they are.
#
# The function imports src/core/sport/catalogs.ts through relative paths that point outside its folder (two depths: from the
# function root and from providers/<name>/). Outside the volume the runtime has nothing there, and it gives every function the
# ONE import map at the root of the volume (deno.jsonc, shared and not ours to change), so the paths are rewritten here: the
# bundle carries the file as results-import/_vendor/catalogs.ts and, in the STAGED COPY only (never in the repository), each
# import of it becomes the relative path from that module to _vendor/catalogs.ts. The new bundle is checked (deno check, with
# the volume's own import map) before it replaces the old one.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
FUNCTION=results-import
SRC=$ROOT/supabase/functions/$FUNCTION
CATALOGS=$ROOT/src/core/sport/catalogs.ts
DENO_IMAGE=denoland/deno:2.1.4 # same Deno as the edge-runtime image the stack runs (v1.74.0)

fail() { echo "FAIL: $1" >&2; exit 1; }

[ $# -eq 1 ] && [ -d "$1" ] || fail "usage: sh deploy/scripts/functions-bundle.sh <functions-volume-dir> (the directory must exist)"
DEST=$(cd "$1" && pwd)
[ -f "$SRC/index.ts" ] || fail "$SRC/index.ts not found"
[ -f "$CATALOGS" ] || fail "$CATALOGS not found"

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

# Rewrite every import of catalogs.ts in the staged copy to the relative path to _vendor/catalogs.ts from the importing module.
find "$STAGE" -name '*.ts' -not -path "$STAGE/_vendor/*" | while IFS= read -r file; do
  grep -Eq "['\"](\.\./)+src/core/sport/catalogs\.ts['\"]" "$file" || continue
  rel=${file%/*}
  rel=${rel#"$STAGE"}
  up=
  while [ -n "$rel" ]; do up="../$up"; rel=${rel%/*}; done
  sed -E "s#(\.\./)+src/core/sport/catalogs\.ts#${up:-./}_vendor/catalogs.ts#g" "$file" >"$file.rewritten" && mv "$file.rewritten" "$file"
done
# Nothing may still point into src/: the runtime could not resolve it.
left=$(grep -rnE "(from|import)[[:space:]]*\(?[[:space:]]*['\"][^'\"]*src/" "$STAGE" --include='*.ts' || true)
[ -z "$left" ] || fail "imports into src/ remain in the bundle: $left"

# deno check on the tree about to be delivered, with the volume's own root import map (deno.jsonc): the one the runtime gives
# every function. tsconfig excludes the Deno entry points, so `npm run typecheck` never checks them. Every module is checked,
# not only index.ts, so a provider that is not loaded yet cannot hide a broken import either.
CONFIG=
for name in deno.jsonc deno.json; do [ -f "$DEST/$name" ] && { CONFIG=$name; break; }; done
FILES=$(cd "$STAGE" && find . -name '*.ts' | sed 's|^\./||' | sort)
if command -v deno >/dev/null 2>&1; then
  # shellcheck disable=SC2086 # $FILES holds plain relative paths without spaces
  (cd "$STAGE" && deno check --no-lock ${CONFIG:+--config "$DEST/$CONFIG"} $FILES) || fail "deno check failed"
else
  command -v docker >/dev/null 2>&1 || fail "deno check needs deno or docker; neither is installed"
  # shellcheck disable=SC2086
  docker run --rm -v "$DEST:/functions:ro" -w "/functions/.$FUNCTION.staging" "$DENO_IMAGE" deno check --no-lock ${CONFIG:+--config "/functions/$CONFIG"} $FILES || fail "deno check failed"
fi
echo "PASS: deno check $FUNCTION ($(echo "$FILES" | wc -l | tr -d ' ') modules, index.ts included)"

# Swap in the new bundle: the volume never holds a half-copied function.
[ ! -e "$DEST/$FUNCTION" ] || mv "$DEST/$FUNCTION" "$OLD"
mv "$STAGE" "$DEST/$FUNCTION"
rm -rf "$OLD"
echo "DONE: $DEST/$FUNCTION updated ($(find "$DEST/$FUNCTION" -type f | wc -l | tr -d ' ') files, includes _vendor/catalogs.ts)"
