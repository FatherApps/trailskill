#!/bin/sh
# Checks that the Edge Functions runtime can reach the external sources its providers query over HTTPS.
# Usage: sh deploy/scripts/functions-egress.sh <docker-network> | --list
#   <docker-network> is the network of the Supabase stack's `functions` service (`docker inspect` shows it).
#   --list only prints the hosts found (one per line) and needs no Docker.
# Hosts: every non-test .ts module under supabase/functions/results-import/providers/<name>/ is scanned for `https://` URLs:
# a literal host (also inside template literals) or `https://${NAME}` with `const NAME = '<host>'` in the same file. A host
# that cannot be resolved, or a provider folder with no host at all, is a FAIL: a provider left out of the check never passes.
# The edge-runtime image has no shell tools to fetch with, so a throwaway Deno container joins that network and sends a
# HEAD request to https://<host>/ for each host: it leaves the host the same way the function's requests do.
# A PASS covers: DNS, the route out, a TLS handshake with a certificate the container trusts for that host name, and an HTTP
# answer. A block page with an untrusted certificate (captive portal, proxy whose CA is not installed) FAILs; one served with
# a trusted certificate (an intercepting proxy whose CA is installed) is not told apart and passes. A PASS does NOT cover the
# HTTP status, method, path or body: providers use GET and POST on specific paths, and a 4xx/5xx from the real host still
# counts as reached.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DENO_IMAGE=denoland/deno:2.1.4
PROVIDERS=$ROOT/supabase/functions/results-import/providers

[ $# -eq 1 ] || { echo "usage: sh deploy/scripts/functions-egress.sh <docker-network> | --list" >&2; exit 1; }

T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

# Prints "HOST <host>" for every host found and "FAIL: ..." for every provider or identifier it cannot account for.
scan() {
  [ -d "$PROVIDERS" ] || { echo "FAIL: $PROVIDERS not found"; return; }
  for dir in "$PROVIDERS"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    find "$dir" -name '*.ts' -not -path '*/__tests__/*' -not -name '*.test.ts' | sort >"$T/files"
    found=0
    while IFS= read -r file; do
      hosts=$(grep -oE 'https://[A-Za-z0-9][A-Za-z0-9.-]*' "$file" | sed 's#^https://##' || true)
      for id in $(grep -oE 'https://\$\{[A-Za-z_][A-Za-z0-9_]*' "$file" | sed 's#.*{##' | sort -u || true); do
        value=$(sed -nE "s/^[[:space:]]*(export[[:space:]]+)?const[[:space:]]+${id}[[:space:]]*=[[:space:]]*'([^']+)'.*/\2/p" "$file" | head -1)
        if [ -n "$value" ]; then hosts="$hosts
$value"; else echo "FAIL: ${file#"$ROOT"/}: cannot resolve the host of https://\${$id}; write it as const $id = '<host>' in that file"; fi
      done
      for host in $hosts; do echo "HOST $host"; found=1; done
    done <"$T/files"
    [ "$found" -eq 1 ] || echo "FAIL: every provider queries an external source; none found in providers/$name"
  done
}

out=$(scan)
if echo "$out" | grep -q '^FAIL'; then echo "$out" | grep '^FAIL'; exit 1; fi
hosts=$(echo "$out" | sed -n 's/^HOST //p' | sort -u)
[ -n "$hosts" ] || { echo "FAIL: no provider found under supabase/functions/results-import/providers/" >&2; exit 1; }
if [ "$1" = --list ]; then echo "$hosts"; exit 0; fi

command -v docker >/dev/null 2>&1 || { echo "FAIL: docker is required" >&2; exit 1; }
status=0
for host in $hosts; do
  if out=$(docker run --rm --network "$1" "$DENO_IMAGE" deno eval --no-lock \
    "const r = await fetch(Deno.args[0], { method: 'HEAD', signal: AbortSignal.timeout(15000) }); console.log(r.status)" "https://$host/" 2>&1); then
    echo "PASS: $host reached over TLS (valid certificate), HTTP $(echo "$out" | tail -1)"
  else
    echo "FAIL: $host is not reachable from network $1: $(echo "$out" | tail -1)"
    status=1
  fi
done
exit $status
