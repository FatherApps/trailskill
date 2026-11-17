#!/bin/sh
# Restore test for the PROD backup (#1119). Run by the maintainer, who holds the private key.
# Fetches the latest copy, verifies it, decrypts it and restores it into a THROWAWAY Postgres container
# (never PROD), then compares row counts with the manifest. Exit 0 only if every check passes.
# Needs docker and age on this machine. Usage: sh deploy/scripts/restore-check.sh <age-identity-file>
#
# Env: BACKUP_FETCH_CMD      shell command run as `sh -c "$BACKUP_FETCH_CMD" fetch <dir>`; it must write
#                            trailskill-prod-latest.dump.age and trailskill-prod-latest.manifest into <dir>.
#      BACKUP_RESTORE_IMAGE  default public.ecr.aws/supabase/postgres:17.11.0.006 (Supabase roles exist).
#                            Use the same image major as PROD.
set -eu
umask 077

IDENTITY=${1:?usage: restore-check.sh <age-identity-file>}
: "${BACKUP_FETCH_CMD:?BACKUP_FETCH_CMD is required}"
IMAGE=${BACKUP_RESTORE_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.006}
[ -r "$IDENTITY" ] || { echo "error: cannot read identity file $IDENTITY" >&2; exit 1; }
LC_ALL=C
export LC_ALL

die() { echo "error: $*" >&2; exit 1; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }
bytes() { wc -c <"$1" | tr -d ' '; }
mf() { sed -n "s/^$1=//p" "$MANIFEST" | head -n 1; }

WORK=$(mktemp -d "${TMPDIR:-/tmp}/restore-check.XXXXXX")
CT=restore-check-$$-$(date +%s)
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

sh -c "$BACKUP_FETCH_CMD" fetch "$WORK" || die "fetch command failed"
[ -s "$ENC" ] && [ -s "$MANIFEST" ] || die "fetch did not produce the encrypted copy and the manifest"
[ "$(sha256 "$ENC")" = "$(mf encrypted_sha256)" ] || die "encrypted file checksum does not match the manifest"
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
grep -q '^count\.' "$MANIFEST" || die "manifest has no row counts"
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
