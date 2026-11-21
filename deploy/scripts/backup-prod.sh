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
#      BACKUP_REASON         why this copy was taken, written to the manifest as backup_reason=. Lowercase letters,
#                            digits and hyphens, at most 32 characters. Default `daily` (the scheduled copy); the
#                            copy before a migration (migrate.sh) uses `pre-migration`.
#      BACKUP_PGUSER,        optional, both or none: the role to connect as (it must be able to dump every schema),
#      BACKUP_PGPASSWORD     replacing PGUSER and PGPASSWORD. Never printed.
#      BACKUP_LOCK_FILE      lock file (default /backup-lock/lock, a named volume shared by every caller). The run takes
#                            it with flock before it dumps and holds it until it ends, so two backups never overlap
#                            (backup-r2.sh has no lock of its own). THIS is the only place the lock is taken: callers
#                            (migrate.sh, the cron job, a run by hand) must not lock the same file themselves, because
#                            a second open of it by a child deadlocks against the parent.
#      BACKUP_LOCK_WAIT_SECONDS  how long to wait for the lock (digits, default 600); then exit 1 with nothing done.
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
BACKUP_REASON=${BACKUP_REASON:-daily}
BACKUP_LOCK_FILE=${BACKUP_LOCK_FILE:-/backup-lock/lock}
BACKUP_LOCK_WAIT_SECONDS=${BACKUP_LOCK_WAIT_SECONDS:-600}
LC_ALL=C
export LC_ALL

log() { echo "$*"; }
die() { echo "error: $*" >&2; exit 1; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }
bytes() { wc -c <"$1" | tr -d ' '; }

# The backup role replaces the connection login: both variables or none, never a mix with another password.
if [ -n "${BACKUP_PGUSER:-}" ] || [ -n "${BACKUP_PGPASSWORD:-}" ]; then
  [ -n "${BACKUP_PGUSER:-}" ] || die "BACKUP_PGPASSWORD is set but BACKUP_PGUSER is not"
  [ -n "${BACKUP_PGPASSWORD:-}" ] || die "BACKUP_PGUSER is set but BACKUP_PGPASSWORD is not"
  PGUSER=$BACKUP_PGUSER
  PGPASSWORD=$BACKUP_PGPASSWORD
  export PGUSER PGPASSWORD
fi

# Refuse before touching the database when there is no way to encrypt. There is no bypass.
[ -n "${BACKUP_AGE_RECIPIENT:-}" ] ||
  die "BACKUP_AGE_RECIPIENT is not set: refusing to back up without an encryption public key"
case $BACKUP_AGE_RECIPIENT in age1*) ;; *) die "BACKUP_AGE_RECIPIENT is not an age public key (age1...)" ;; esac
case $BACKUP_REASON in
  '' | -* | *[!a-z0-9-]*) die "invalid BACKUP_REASON (lowercase letters, digits and hyphens, at most 32 characters)" ;;
esac
[ "${#BACKUP_REASON}" -le 32 ] || die "invalid BACKUP_REASON (lowercase letters, digits and hyphens, at most 32 characters)"
for t in $BACKUP_COUNT_TABLES; do
  echo "$t" | grep -Eq '^[a-z_]+\.[a-z_]+$' || die "invalid table name '$t' in BACKUP_COUNT_TABLES"
done

for m in ${BACKUP_MIN_COUNTS:-}; do
  echo "$m" | grep -Eq '^[a-z_]+\.[a-z_]+=[0-9]+$' || die "invalid entry '$m' in BACKUP_MIN_COUNTS (expected schema.table=N)"
  found=0
  for t in $BACKUP_COUNT_TABLES; do [ "$t" = "${m%%=*}" ] && found=1; done
  [ "$found" -eq 1 ] || die "table of '$m' in BACKUP_MIN_COUNTS is not in BACKUP_COUNT_TABLES"
done

# One backup at a time. busybox flock has no timeout, so poll without blocking. Held on fd 9 until the process ends.
case $BACKUP_LOCK_WAIT_SECONDS in
  '' | *[!0-9]* | ????????*) die "BACKUP_LOCK_WAIT_SECONDS must be a whole number of seconds (at most 9999999)" ;;
esac
[ -d "$(dirname "$BACKUP_LOCK_FILE")" ] || die "BACKUP_LOCK_FILE ($BACKUP_LOCK_FILE): its directory does not exist (mount the backup-lock volume)"
exec 9>"$BACKUP_LOCK_FILE"
waited=0
until flock -n 9; do
  [ "$waited" -lt "$BACKUP_LOCK_WAIT_SECONDS" ] || die "could not get the backup lock within $BACKUP_LOCK_WAIT_SECONDS s; no backup was taken"
  [ "$waited" -gt 0 ] || log "waiting for the backup lock (up to $BACKUP_LOCK_WAIT_SECONDS s)"
  sleep 1
  waited=$((waited + 1))
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
  echo "backup_reason=$BACKUP_REASON"
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
