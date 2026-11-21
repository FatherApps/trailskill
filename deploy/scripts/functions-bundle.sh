#!/bin/sh
# Builds the Edge Function bundles (results-import, school-console-invite-coach, accounts-delete-account and accounts-deletion-worker)
# and puts them in the functions volume of the Supabase stack.
# Usage: sh deploy/scripts/functions-bundle.sh <functions-volume-dir>
#   <functions-volume-dir> is the host folder the stack's `functions` service mounts at /home/deno/functions.
# Only <functions-volume-dir>/<each function listed in FUNCTIONS below> is replaced; `main` and every other function stay as they are.
# Every bundle is built and checked (deno check) before any of them is swapped in: if one fails, the volume stays as it was.
# A function whose staged copy is identical to the published one is not swapped (a line says so), so delivering the same code
# again changes nothing in the volume. The `functions` service of deploy/compose.yaml runs this script on every deploy.
#
# results-import imports src/core/sport/catalogs.ts through relative paths that point outside its folder (two depths: from the
# function root and from providers/<name>/). Outside the volume the runtime has nothing there, and it gives every function the
# ONE import map at the root of the volume (deno.jsonc, shared and not ours to change), so the paths are rewritten here: such a
# bundle carries the file as <function>/_vendor/catalogs.ts and, in the STAGED COPY only (never in the repository), each
# import of it becomes the relative path from that module to _vendor/catalogs.ts. A function that imports nothing from src/
# (the other three) gets no _vendor. The new bundles are checked (deno check, with the volume's own import map) before they
# replace the old ones.
#
# Some functions import modules of a sibling function through ../<sibling>/ (accounts-delete-account uses
# school-console-invite-coach/resendSender.ts; accounts-deletion-worker uses accounts-delete-account). All the staged copies
# live side by side in <volume>/.staging/<function>, so that ../<sibling>/ resolves to the new copy of this same delivery,
# never to what the volume already published. A function that imports from a sibling that is not in FUNCTIONS is refused
# before anything in the volume changes: the runtime would find that sibling only if it happened to be published already.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
FUNCTIONS="results-import school-console-invite-coach accounts-delete-account accounts-deletion-worker"
CATALOGS=$ROOT/src/core/sport/catalogs.ts
DENO_VERSION=2.1.4 # same Deno as the edge-runtime image the stack runs (v1.74.0)
DENO_IMAGE=denoland/deno:$DENO_VERSION

fail() { echo "FAIL: $1" >&2; exit 1; }

FUNCS_DIR=$(cd "$ROOT/supabase/functions" && pwd -P)
# siblings <function dir>: the other functions whose modules it imports through relative paths, one name per line.
siblings() {
  find "$1" -name '*.ts' -not -path '*/__tests__/*' | while IFS= read -r file; do
    sed -nE "s/.*(from|import)[[:space:]]*\(?[[:space:]]*['\"](\.\.\/[^'\"]*)['\"].*/\2/p" "$file" | while IFS= read -r spec; do
      dir=$(cd "$(dirname "$file")/$(dirname "$spec")" 2>/dev/null && pwd -P) || continue
      case "$dir/" in "$FUNCS_DIR/"?*) rest=${dir#"$FUNCS_DIR/"}; echo "${rest%%/*}" ;; esac
    done
  done | sort -u
}

[ $# -eq 1 ] && [ -d "$1" ] || fail "usage: sh deploy/scripts/functions-bundle.sh <functions-volume-dir> (the directory must exist)"
DEST=$(cd "$1" && pwd)
[ -d "$DEST/main" ] || fail "$DEST has no main/ folder: it is not the functions volume of the Supabase stack"
[ -f "$CATALOGS" ] || fail "$CATALOGS not found"

# catalogs.ts runs in Deno and in React Native, and only this file is shipped: it may not import anything.
# (The Jest test in src/core/sport/__tests__ parses the file; this is the same rule for the server.)
# Also the closing line of a multi-line `export { ... } from '...'` and a dynamic import(), with either quote style.
if grep -Eq "^[[:space:]]*import[[:space:]('\"{*]|^[[:space:]]*export[[:space:]].*[[:space:]]from[[:space:]]|^[[:space:]]*\}[[:space:]]*from[[:space:]]*['\"]|(^|[^[:alnum:]_.\$])import[[:space:]]*\(|require[[:space:]]*\(" "$CATALOGS"; then
  fail "src/core/sport/catalogs.ts has imports; the bundle ships only that file"
fi

trap 'rm -rf "$DEST/.staging"' EXIT
rm -rf "$DEST/.staging"

# 1. Validate every function and recover an interrupted swap, before anything is built.
for f in $FUNCTIONS; do
  SRC=$ROOT/supabase/functions/$f
  [ -f "$SRC/index.ts" ] || fail "$SRC/index.ts not found"
  # The bundle must contain everything the function imports from outside its folder.
  outside=$(grep -rhE "(from|import)[[:space:]]*\(?[[:space:]]*['\"][^'\"]*src/" "$SRC" --include='*.ts' --exclude-dir=__tests__ | grep -vE "/src/core/sport/catalogs\.ts['\"]" || true)
  [ -z "$outside" ] || fail "$f imports from src/ something other than catalogs.ts, the bundle would miss it: $outside"
  for sib in $(siblings "$SRC"); do
    [ "$sib" = "$f" ] && continue
    case " $FUNCTIONS " in *" $sib "*) ;; *) fail "$f imports from the sibling function $sib, which is not in FUNCTIONS: the bundle would not carry it" ;; esac
  done
  OLD=$DEST/.$f.old
  # A run interrupted between the two moves of the swap leaves the previous bundle in $OLD and no function: put it back first.
  if [ -d "$OLD" ]; then
    if [ -e "$DEST/$f" ]; then rm -rf "$OLD"; else mv "$OLD" "$DEST/$f"; fi
  fi
done

# deno check on the trees about to be delivered, with the volume's own root import map (deno.jsonc): the one the runtime gives
# every function. tsconfig excludes the Deno entry points, so `npm run typecheck` never checks them. Every module is checked,
# not only index.ts, so a provider that is not loaded yet cannot hide a broken import either.
CONFIG=
for name in deno.jsonc deno.json; do [ -f "$DEST/$name" ] && { CONFIG=$name; break; }; done
# The local deno is used only when it is the runtime's version; otherwise the same version through Docker.
LOCAL_DENO=
if command -v deno >/dev/null 2>&1; then
  have=$(deno --version 2>/dev/null | sed -n '1s/^deno \([^ ]*\).*/\1/p')
  if [ "$have" = "$DENO_VERSION" ]; then
    LOCAL_DENO=1
  elif command -v docker >/dev/null 2>&1; then
    echo "NOTE: local deno ${have:-unknown} differs from the runtime's $DENO_VERSION; checking with $DENO_IMAGE"
  else
    fail "local deno ${have:-unknown} differs from the runtime's $DENO_VERSION and docker is not installed to run $DENO_IMAGE"
  fi
fi

# 2. Build every staged copy, then check them. Nothing in the volume changes except .staging, which is removed on exit.
for f in $FUNCTIONS; do
  SRC=$ROOT/supabase/functions/$f
  STAGE=$DEST/.staging/$f
  mkdir -p "$STAGE"
  cp -R "$SRC/." "$STAGE/"
  find "$STAGE" -type d -name __tests__ -prune -exec rm -rf {} +

  # Vendor catalogs.ts only for a function that imports it; rewrite every import of it in the staged copy to the relative path
  # to _vendor/catalogs.ts from the importing module.
  if grep -rqE "['\"](\.\./)+src/core/sport/catalogs\.ts['\"]" "$STAGE" --include='*.ts'; then
    mkdir -p "$STAGE/_vendor"
    cp "$CATALOGS" "$STAGE/_vendor/catalogs.ts"
    find "$STAGE" -name '*.ts' -not -path "$STAGE/_vendor/*" | while IFS= read -r file; do
      grep -Eq "['\"](\.\./)+src/core/sport/catalogs\.ts['\"]" "$file" || continue
      rel=${file%/*}
      rel=${rel#"$STAGE"}
      up=
      while [ -n "$rel" ]; do up="../$up"; rel=${rel%/*}; done
      sed -E "s#(\.\./)+src/core/sport/catalogs\.ts#${up:-./}_vendor/catalogs.ts#g" "$file" >"$file.rewritten" && mv "$file.rewritten" "$file"
    done
  fi
  # Nothing may still point into src/: the runtime could not resolve it.
  left=$(grep -rnE "(from|import)[[:space:]]*\(?[[:space:]]*['\"][^'\"]*src/" "$STAGE" --include='*.ts' || true)
  [ -z "$left" ] || fail "imports into src/ remain in the bundle of $f: $left"
done

# The check starts only when every copy is staged, so a ../<sibling>/ import finds the sibling's new copy.
for f in $FUNCTIONS; do
  STAGE=$DEST/.staging/$f
  FILES=$(cd "$STAGE" && find . -name '*.ts' | sed 's|^\./||' | sort)
  if [ -n "$LOCAL_DENO" ]; then
    # shellcheck disable=SC2086 # $FILES holds plain relative paths without spaces
    (cd "$STAGE" && deno check --no-lock ${CONFIG:+--config "$DEST/$CONFIG"} $FILES) || fail "deno check failed for $f"
  else
    command -v docker >/dev/null 2>&1 || fail "deno check needs deno $DENO_VERSION or docker; neither is installed"
    # shellcheck disable=SC2086
    docker run --rm -v "$DEST:/functions:ro" -w "/functions/.staging/$f" "$DENO_IMAGE" deno check --no-lock ${CONFIG:+--config "/functions/$CONFIG"} $FILES || fail "deno check failed for $f"
  fi
  echo "PASS: deno check $f ($(echo "$FILES" | wc -l | tr -d ' ') modules, index.ts included)"
done

# 3. Swap in the new bundles, only now that every one passed: the volume never holds a half-copied function. Each swap is two
# renames, not atomic: between them a request finds no $f for an instant. A run interrupted between them leaves .$f.old; the
# next run puts it back first (above).
for f in $FUNCTIONS; do
  if [ -d "$DEST/$f" ] && diff -r "$DEST/.staging/$f" "$DEST/$f" >/dev/null 2>&1; then
    echo "SKIP: $f unchanged, not replaced"
    continue
  fi
  OLD=$DEST/.$f.old
  [ ! -e "$DEST/$f" ] || mv "$DEST/$f" "$OLD"
  mv "$DEST/.staging/$f" "$DEST/$f"
  rm -rf "$OLD"
  echo "DONE: $DEST/$f updated ($(find "$DEST/$f" -type f | wc -l | tr -d ' ') files$([ -f "$DEST/$f/_vendor/catalogs.ts" ] && echo ', includes _vendor/catalogs.ts'))"
done
