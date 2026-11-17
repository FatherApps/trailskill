#!/bin/sh
# Daily PROD backup (#1119): pg_dump -Fc, verify, encrypt with a PUBLIC key, checksum, then hand the
# result to ONE parameterized push command. Needs pg_dump >= the server major, pg_restore, age.
# Connection: libpq env vars (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE). Never prints a password.
#
# Env: BACKUP_AGE_RECIPIENT  age public key (age1...). Required: the run REFUSES to start without it.
#      BACKUP_PUSH_CMD       shell command run last as `sh -c "$BACKUP_PUSH_CMD" push <encrypted> <manifest>`.
#                            It must replace the single previous copy only after storing the new one in full.
#      BACKUP_MIN_COUNTS     optional, space-separated schema.table=N: refuse to push when a key table has
#                            fewer than N rows. Each table must be in BACKUP_COUNT_TABLES.
#      BACKUP_COUNT_TABLES   tables whose row counts go in the manifest (default: see below)
# A copy where every key table has 0 rows is never pushed (no bypass), so it cannot replace a good one.
# Nothing is kept locally: the plaintext dump lives in a private temp dir that is always removed.
set -eu
set -f
umask 077

: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${BACKUP_PUSH_CMD:?BACKUP_PUSH_CMD is required}"
BACKUP_COUNT_TABLES=${BACKUP_COUNT_TABLES:-auth.users public.organizations public.schools public.athletes public.school_memberships}
LC_ALL=C
export LC_ALL

log() { echo "$*"; }
die() { echo "error: $*" >&2; exit 1; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }
bytes() { wc -c <"$1" | tr -d ' '; }

# Refuse before touching the database when there is no way to encrypt. There is no bypass.
[ -n "${BACKUP_AGE_RECIPIENT:-}" ] ||
  die "BACKUP_AGE_RECIPIENT is not set: refusing to back up without an encryption public key"
case $BACKUP_AGE_RECIPIENT in age1*) ;; *) die "BACKUP_AGE_RECIPIENT is not an age public key (age1...)" ;; esac
for t in $BACKUP_COUNT_TABLES; do
  echo "$t" | grep -Eq '^[a-z_]+\.[a-z_]+$' || die "invalid table name '$t' in BACKUP_COUNT_TABLES"
done

for m in ${BACKUP_MIN_COUNTS:-}; do
  echo "$m" | grep -Eq '^[a-z_]+\.[a-z_]+=[0-9]+$' || die "invalid entry '$m' in BACKUP_MIN_COUNTS (expected schema.table=N)"
  found=0
  for t in $BACKUP_COUNT_TABLES; do [ "$t" = "${m%%=*}" ] && found=1; done
  [ "$found" -eq 1 ] || die "table of '$m' in BACKUP_MIN_COUNTS is not in BACKUP_COUNT_TABLES"
done

WORK=$(mktemp -d "${TMPDIR:-/tmp}/backup-prod.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
trap 'exit 130' INT TERM
DUMP=$WORK/dump.plain
ENC=$WORK/trailskill-prod-latest.dump.age
MANIFEST=$WORK/trailskill-prod-latest.manifest

# 1. dump (custom format, one consistent snapshot)
pg_dump -Fc --no-password -f "$DUMP" || die "pg_dump failed"
log "dump written"

# 2. verify the plain dump before it is encrypted
[ -s "$DUMP" ] || die "dump is empty"
pg_restore --list "$DUMP" >/dev/null || die "pg_restore --list rejected the dump"
DUMP_SHA=$(sha256 "$DUMP")
DUMP_BYTES=$(bytes "$DUMP")
{
  echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "database=$PGDATABASE"
  echo "pg_dump=$(pg_dump --version | tr ' ' '_')"
  echo "dump_bytes=$DUMP_BYTES"
  echo "dump_sha256=$DUMP_SHA"
} >"$MANIFEST"
# Row counts come from the dump itself (same snapshot, exact): one line per row between COPY and \. .
TOTAL=0
for t in $BACKUP_COUNT_TABLES; do
  pg_restore --data-only --schema="${t%%.*}" --table="${t#*.}" -f "$WORK/copy.sql" "$DUMP" || die "cannot read $t from the dump"
  n=$(awk '!c&&/^COPY /{c=1;next} c&&/^\\\.$/{c=0} c{n++} END{print n+0}' "$WORK/copy.sql")
  rm -f "$WORK/copy.sql"
  echo "count.$t=$n" >>"$MANIFEST"
  TOTAL=$((TOTAL + n))
done
# Refuse before encrypting or pushing, so the previous copy stays untouched.
[ "$TOTAL" -gt 0 ] || die "every key table has 0 rows ($BACKUP_COUNT_TABLES): refusing to replace the previous copy with an empty one"
for m in ${BACKUP_MIN_COUNTS:-}; do
  t=${m%%=*}
  n=$(awk -F= -v k="count.$t" '$1==k{print $2; exit}' "$MANIFEST")
  [ "$n" -ge "${m#*=}" ] || die "$t has $n rows, below the minimum ${m#*=} (BACKUP_MIN_COUNTS): refusing to replace the previous copy"
done
log "dump verified (pg_restore --list ok, $DUMP_BYTES bytes)"

# 3. encrypt with the public key (the private key is never on this host), then checksum the result
age -r "$BACKUP_AGE_RECIPIENT" -o "$ENC" "$DUMP" || die "encryption failed"
head -c 22 "$ENC" | grep -q '^age-encryption.org' || die "encrypted file has no age header"
[ -s "$ENC" ] || die "encrypted file is empty"
{
  echo "encrypted_bytes=$(bytes "$ENC")"
  echo "encrypted_sha256=$(sha256 "$ENC")"
} >>"$MANIFEST"
rm -f "$DUMP"
log "encrypted and checksummed"

# 4. only now hand it over; the push command owns the atomic replace of the previous copy
sh -c "$BACKUP_PUSH_CMD" push "$ENC" "$MANIFEST" || die "push command failed; the previous copy must be untouched"
log "backup done"
