#!/bin/sh
# Checks that the Edge Functions runtime can reach the external sources its providers query over HTTPS.
# Usage: sh deploy/scripts/functions-egress.sh <docker-network>
#   <docker-network> is the network of the Supabase stack's `functions` service (`docker inspect` shows it).
# The edge-runtime image has no shell tools to fetch with, so a throwaway Deno container joins that network and sends
# a HEAD request to each provider URL: it leaves the host the same way the function's requests do.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DENO_IMAGE=denoland/deno:2.1.4

[ $# -eq 1 ] || { echo "usage: sh deploy/scripts/functions-egress.sh <docker-network>" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "FAIL: docker is required" >&2; exit 1; }

# Fixed https URLs written as plain string constants in the providers' source modules.
urls=$(grep -rhoE "= 'https://[^']+'" "$ROOT"/supabase/functions/results-import/providers/*/source.ts 2>/dev/null | sed "s/^= '//; s/'\$//" | sort -u)
[ -n "$urls" ] || { echo "FAIL: no provider URL found under supabase/functions/results-import/providers/*/source.ts" >&2; exit 1; }

status=0
for url in $urls; do
  if out=$(docker run --rm --network "$1" "$DENO_IMAGE" deno eval --no-lock \
    "const r = await fetch(Deno.args[0], { method: 'HEAD', signal: AbortSignal.timeout(15000) }); console.log(r.status)" "$url" 2>&1); then
    echo "PASS: $url answered HTTP $(echo "$out" | tail -1)"
  else
    echo "FAIL: $url is not reachable from network $1: $(echo "$out" | tail -1)"
    status=1
  fi
done
exit $status
