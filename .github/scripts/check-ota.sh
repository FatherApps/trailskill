#!/bin/sh
# Decides whether a change can ship as an OTA update or needs a new Google Play build.
# Usage:
#   sh .github/scripts/check-ota.sh classify [BASE [HEAD]]
#       Prints, one per line, every path changed since the merge base of BASE and HEAD
#       (defaults: origin/main and HEAD) that needs a Play build.
#       Exit 0: none (OTA-eligible). Exit 1: at least one. Exit 2: error (message on stderr).
#   PR_BODY="..." BASE_SHA=... HEAD_SHA=... sh .github/scripts/check-ota.sh
#       CI check: the "## Entrega" box of the pull request description must match the diff.
# The description comes only from the environment. It is parsed by one awk program that
# reads it from ENVIRON, so the shell never expands it.

tmp=$(mktemp -d) || exit 2
trap 'rm -rf "$tmp"' EXIT
trap 'exit 130' INT TERM

# needs_build_file PATH: exit 0 when PATH needs a Play build, 1 when not, 2 when it cannot
# tell (node failed). This is the only place that
# lists the build paths. Native code, app config, dependencies, migrations and sync rules
# count because an OTA must not change the native binary or the app's contract with the backend.
# shortcut: a path list instead of comparing @expo/fingerprint hashes, because the fingerprint needs npm ci (and autolinking) for both base and head; upgrade when expo-updates lands (#1188).
needs_build_file() {
  case "$1" in
    modules/* | plugins/* | android/* | ios/* | supabase/migrations/*) return 0 ;;
    app.config.ts | app.json | eas.json | powersync/sync-config.yaml) return 0 ;;
    package.json) json_changed "$1" deps ;;
    package-lock.json) json_changed "$1" lock ;;
    *) return 1 ;;
  esac
}

# json_changed PATH KIND: exit 0 when the JSON file differs between $mb and $head in what
# matters for KIND (deps: dependency fields; lock: anything but the project version), 1 when
# it does not, 2 when node itself failed (its status is left in $node_rc).
# A file missing on one side, or not valid JSON, counts as a change. The two versions go to
# node as file paths through the environment: a lockfile is too big for one variable and
# nothing is interpolated into the code.
json_changed() {
  git show "$mb:$1" >"$tmp/old" 2>/dev/null || return 0
  git show "$head:$1" >"$tmp/new" 2>/dev/null || return 0
  # node exits 1 for "same" and 0 for "changed" (inverted on purpose, so the caller can use it as a test).
  OLD="$tmp/old" NEW="$tmp/new" KIND=$2 node -e '
    const fs = require("fs");
    const sorted = (k, v) => v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v;
    const same = (a, b) => JSON.stringify(a, sorted) === JSON.stringify(b, sorted);
    const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
    const strip = (l) => { delete l.version; if (l.packages && l.packages[""]) delete l.packages[""].version; return l; };
    try {
      const a = read(process.env.OLD), b = read(process.env.NEW);
      if (process.env.KIND === "deps") {
        const f = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "overrides", "resolutions"];
        process.exit(f.every((k) => same(a[k], b[k])) ? 1 : 0);
      }
      process.exit(same(strip(a), strip(b)) ? 1 : 0);
    } catch (e) { process.exit(0); }
  '
  node_rc=$?
  [ "$node_rc" -le 1 ] || return 2
  return "$node_rc"
}

# classify BASE HEAD: prints the build paths; returns 0, 1 or 2 as described above.
classify() {
  base=$1
  head=$2
  mb=$(git merge-base "$base" "$head" 2>/dev/null) || {
    echo "check-ota: no merge base between \"$base\" and \"$head\"" >&2
    return 2
  }
  git -c core.quotepath=off diff --name-only --no-renames "$mb" "$head" >"$tmp/files" 2>/dev/null || {
    echo "check-ota: cannot list the files changed between \"$mb\" and \"$head\"" >&2
    return 2
  }
  found=0
  while IFS= read -r file; do
    needs_build_file "$file"
    case $? in
      0) printf '%s\n' "$file"; found=1 ;;
      1) ;;
      *)
        echo "check-ota: cannot compare $file: node failed (exit $node_rc)" >&2
        return 2
        ;;
    esac
  done <"$tmp/files"
  return "$found"
}

if [ "${1:-}" = classify ]; then
  classify "${2:-origin/main}" "${3:-HEAD}"
  exit $?
fi

if [ -z "${BASE_SHA:-}" ] || [ -z "${HEAD_SHA:-}" ]; then
  echo "check-ota: BASE_SHA and HEAD_SHA must be set" >&2
  exit 1
fi

# Prints O when "Apto para OTA" is ticked and B when "Requiere build de Play" is ticked,
# looking only inside the "## Entrega" section and ignoring HTML comments.
ticked=$(awk '
BEGIN {
  body = ENVIRON["PR_BODY"]
  gsub(/\r/, "", body)

  # Remove HTML comments, also multi-line ones. An unclosed one hides the rest, as on GitHub.
  kept = ""
  while ((i = index(body, "<!--")) > 0) {
    kept = kept substr(body, 1, i - 1)
    body = substr(body, i + 4)
    j = index(body, "-->")
    if (j == 0) { body = ""; break }
    body = substr(body, j + 3)
  }
  body = kept body

  n = split(body, line, "\n")
  for (k = 1; k <= n; k++) {
    if (line[k] ~ /^##[ \t]/) {
      cur = substr(line[k], 4)
      gsub(/^[ \t]+|[ \t]+$/, "", cur)
    } else if (cur == "Entrega") {
      if (line[k] ~ /^[ \t]*[-*][ \t]+\[[xX]\][ \t]+Apto para OTA[ \t]*$/) ota = 1
      if (line[k] ~ /^[ \t]*[-*][ \t]+\[[xX]\][ \t]+Requiere build de Play[ \t]*$/) build = 1
    }
  }
  printf "%s%s\n", (ota ? "O" : ""), (build ? "B" : "")
}' </dev/null)

case "$ticked" in
  OB)
    echo 'Mark only one box in "## Entrega", not both' >&2
    exit 1
    ;;
  B) exit 0 ;;
  O) ;;
  *)
    echo 'Mark one box in "## Entrega": "Apto para OTA" or "Requiere build de Play"' >&2
    exit 1
    ;;
esac

paths=$(classify "$BASE_SHA" "$HEAD_SHA")
case $? in
  0) exit 0 ;;
  1)
    echo 'This PR is marked "Apto para OTA" but changes files that need a Play build; mark "Requiere build de Play":' >&2
    printf '%s\n' "$paths" | sed 's/^/  - /' >&2
    exit 1
    ;;
  *) exit 1 ;;
esac
