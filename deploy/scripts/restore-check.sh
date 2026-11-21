#!/bin/sh
# Restore test for the PROD backup (#1119). Run by the maintainer, who holds the private key.
# Fetches the latest copy, verifies it, decrypts it and restores it into a THROWAWAY Postgres container
# (never PROD), then compares row counts with the manifest. Exit 0 only if every check passes.
# Needs docker and age on this machine. Usage: sh deploy/scripts/restore-check.sh <age-identity-file> [sha]
#
# Earlier copy: the optional last argument `sha` (64 lowercase hex, the copy's encrypted_sha256) checks that
# copy instead of the latest one. It is passed to the fetch command as `fetch <dir> <sha>`; without it the
# fetch command is run as `fetch <dir>` exactly as before.
#
# Freshness mode: `sh deploy/scripts/restore-check.sh --freshness [sha]` fetches the copy and runs only the
# manifest checks (age of the copy, not empty, encrypted checksum). It needs no key, docker or age, so it
# can run on a scheduler with read-only access to the destination.
#
# Env: BACKUP_FETCH_CMD      shell command run as `sh -c "$BACKUP_FETCH_CMD" fetch <dir> [sha]`; it must write
#                            trailskill-prod-latest.dump.age and trailskill-prod-latest.manifest into <dir>.
#      BACKUP_MAX_AGE_HOURS  oldest accepted copy, in hours (digits only, at most 8760, default 26)
#      RESTORE_CHECK_CONTAINER_NAME  optional name of the temporary container (default restore-check-<pid>-<time>)
#      BACKUP_RESTORE_IMAGE  default public.ecr.aws/supabase/postgres:17.11.0.006 (Supabase roles exist).
#                            Use the same image major as PROD.
set -eu
set -f # no globbing: manifest keys are untrusted words
umask 077

FRESHNESS=0
IDENTITY=${1:?usage: restore-check.sh <age-identity-file> | --freshness [sha]}
if [ "$IDENTITY" = "--freshness" ]; then FRESHNESS=1; fi
SHA=${2:-}
[ $# -le 2 ] || { echo "usage: restore-check.sh <age-identity-file> | --freshness [sha]" >&2; exit 1; }
{ [ $# -lt 2 ] || echo "$SHA" | grep -Eq '^[0-9a-f]{64}$'; } || { echo "error: sha must be 64 lowercase hex characters" >&2; exit 1; }
: "${BACKUP_FETCH_CMD:?BACKUP_FETCH_CMD is required}"
IMAGE=${BACKUP_RESTORE_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.006}
[ "$FRESHNESS" -eq 1 ] || [ -r "$IDENTITY" ] || { echo "error: cannot read identity file $IDENTITY" >&2; exit 1; }
LC_ALL=C
export LC_ALL

die() { echo "error: $*" >&2; exit 1; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }
bytes() { wc -c <"$1" | tr -d ' '; }
epoch() { echo "$1" | awk -F'[-T:Z]' '{y=$1;m=$2;if(m<=2){y--;m+=12} print (365*y+int(y/4)-int(y/100)+int(y/400)+int((153*(m-3)+2)/5)+$3-719469)*86400+$4*3600+$5*60+$6}'; }
mf() { sed -n "s/^$1=//p" "$MANIFEST" | head -n 1; }

WORK=$(mktemp -d "${TMPDIR:-/tmp}/restore-check.XXXXXX")
CT=${RESTORE_CHECK_CONTAINER_NAME:-restore-check-$$-$(date +%s)}
cleanup() {
  docker rm -f -v "$CT" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
START=$(date +%s)
ENC=$WORK/trailskill-prod-latest.dump.age
MANIFEST=$WORK/trailskill-prod-latest.manifest
PLAIN=$WORK/dump.plain

sh -c "$BACKUP_FETCH_CMD" fetch "$WORK" ${SHA:+"$SHA"} || die "fetch command failed"
[ -s "$ENC" ] && [ -s "$MANIFEST" ] || die "fetch did not produce the encrypted copy and the manifest"
[ -z "$SHA" ] || [ "$(mf encrypted_sha256)" = "$SHA" ] || die "the fetched copy is not the requested copy ($SHA)"
[ "$(sha256 "$ENC")" = "$(mf encrypted_sha256)" ] || die "encrypted file checksum does not match the manifest"
# Manifest checks, before anything is decrypted.
MAX_AGE=${BACKUP_MAX_AGE_HOURS:-26}
case $MAX_AGE in '' | *[!0-9]* | 0[0-9]*) die "BACKUP_MAX_AGE_HOURS must be a whole number of hours" ;; esac
[ "${#MAX_AGE}" -le 4 ] && [ "$MAX_AGE" -le 8760 ] || die "BACKUP_MAX_AGE_HOURS must be at most 8760"
CREATED=$(mf created_at)
echo "$CREATED" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' ||
  die "manifest created_at is missing or malformed"
AGE_S=$(($(date +%s) - $(epoch "$CREATED")))
[ "$AGE_S" -ge -3600 ] || die "manifest created_at ($CREATED) is in the future"
AGE_H=$((AGE_S / 3600))
[ "$AGE_S" -le $((MAX_AGE * 3600)) ] ||
  die "copy is $AGE_H h old (created $CREATED), older than $MAX_AGE h: the daily backup failed or stopped running"
grep -q '^count\.' "$MANIFEST" || die "manifest has no row counts"
TOTAL=$(sed -n 's/^count\.[^=]*=//p' "$MANIFEST" | awk '{s+=$1} END{print s+0}')
[ "$TOTAL" -gt 0 ] || die "every key table in the manifest has 0 rows: this copy is empty"
if [ "$FRESHNESS" -eq 1 ]; then
  echo "freshness OK: copy created at $CREATED ($AGE_H h old)"
  exit 0
fi
age -d -i "$IDENTITY" -o "$PLAIN" "$ENC" || die "decryption failed (wrong key?)"
[ "$(sha256 "$PLAIN")" = "$(mf dump_sha256)" ] || die "decrypted dump checksum does not match the manifest"

docker run -d --name "$CT" -e POSTGRES_PASSWORD="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')" "$IMAGE" >/dev/null ||
  die "cannot start the temporary database container"
PSQL="docker exec $CT psql -X -U supabase_admin -d postgres -Atq -v ON_ERROR_STOP=1"
tries=0
ok=0
while [ "$ok" -lt 2 ]; do # the image restarts Postgres once while it initializes
  if $PSQL -c 'select 1' >/dev/null 2>&1; then ok=$((ok + 1)); else ok=0; fi
  tries=$((tries + 1)); [ "$tries" -le 90 ] || die "temporary database did not start"
  sleep 2
done
$PSQL -c 'create database restore_check' >/dev/null
docker exec -i "$CT" pg_restore -U supabase_admin -d restore_check --no-owner --exit-on-error <"$PLAIN" ||
  die "pg_restore failed"

FAILS=0
echo "copy created at: $(mf created_at)"
echo "size: $(bytes "$ENC") bytes encrypted, $(mf dump_bytes) bytes dump"
printf '%-34s %10s %10s\n' table expected restored
for key in $(sed -n 's/^count\.\([^=]*\)=.*/\1/p' "$MANIFEST"); do
  echo "$key" | grep -Eq '^[a-z_]+\.[a-z_]+$' || die "invalid table name in the manifest"
  want=$(mf "count.$key")
  got=$(docker exec "$CT" psql -X -U supabase_admin -d restore_check -Atq -c "select count(*) from $key") || got=error
  mark=""
  [ "$got" = "$want" ] || { mark="  MISMATCH"; FAILS=$((FAILS + 1)); }
  printf '%-34s %10s %10s%s\n' "$key" "$want" "$got" "$mark"
done
echo "elapsed: $(($(date +%s) - START)) s"
[ "$FAILS" -eq 0 ] || die "$FAILS table(s) do not match the manifest"
echo "restore check OK"
