#!/bin/sh
# End-to-end test of backup-prod.sh and restore-check.sh (#1119) with a throwaway source database
# (the Supabase Postgres image with the repo migrations and synthetic rows), a real age key and a local
# directory as the "destination". No host ports are published. Needs Docker and network (to build an
# alpine image with age and rclone). Usage: sh deploy/scripts/backup-prod.test.sh
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
PGIMG=public.ecr.aws/supabase/postgres:17.11.0.006
ID="ts-bktest-$$-$(date +%s)"
NET=$ID
DB=$ID-db
TOOLS=$ID-tools
S3=$ID-s3
LOCKVOL=$ID-lock
HOLDER=$ID-holder
T=$(mktemp -d)
rand() { od -An -N12 -tx1 /dev/urandom | tr -d ' \n'; }
PW=$(rand)
FAILS=0
RCNAME=$ID-rc
DEST=$T/dest
BKTMP=$T/bk-tmp
mkdir -p "$DEST" "$BKTMP" "$T/rc-tmp" "$T/bin" "$T/shim"

cleanup() {
  docker rm -f -v "$DB" >/dev/null 2>&1
  docker rm -f -v "$S3" >/dev/null 2>&1
  docker rm -f -v "$HOLDER" >/dev/null 2>&1
  docker volume rm "$LOCKVOL" >/dev/null 2>&1
  docker rm -f -v "$RCNAME" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  docker rmi "$TOOLS" >/dev/null 2>&1
  rm -rf "$T"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1 ($2)"; FAILS=$((FAILS + 1)); sed 's/^/    | /' "$T/out" 2>/dev/null | tail -15; }
eq() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "expected '$2', got '$3'"; fi; }
nonzero() { if [ "$2" -ne 0 ]; then pass "$1"; else fail "$1" "exit code was 0"; fi; }
has() { if grep -q -e "$2" "$T/out"; then pass "$1"; else fail "$1" "output lacks '$2'"; fi; }

# --- infrastructure ---------------------------------------------------------
printf 'FROM postgres:17-alpine\nRUN apk add --no-cache age rclone\n' | docker build -q -t "$TOOLS" - >/dev/null || { echo "cannot build tools image"; exit 2; }
docker network create "$NET" >/dev/null || exit 2
docker run -d --name "$DB" --network "$NET" -e POSTGRES_PASSWORD="$PW" "$PGIMG" >/dev/null || exit 2
sql() { docker exec -i "$DB" psql -X -U supabase_admin -d postgres -Atq -v ON_ERROR_STOP=1 "$@"; }
i=0; ok=0
while [ "$ok" -lt 2 ]; do
  if sql -c 'select 1' >/dev/null 2>&1; then ok=$((ok + 1)); else ok=0; fi
  i=$((i + 1)); [ "$i" -gt 90 ] && { echo "database did not start"; exit 2; }
  sleep 2
done
# The image has the storage schema but not the Storage API tables the photo migrations use (the Storage service
# creates them in a real stack): stand-ins with only the columns the migrations touch.
sql <<'SQL' || exit 2
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, created_at timestamptz not null default now());
alter table storage.objects enable row level security;
SQL
docker cp "$ROOT/supabase/migrations" "$DB:/m" >/dev/null
docker exec -e PGOPTIONS="-c client_min_messages=warning" "$DB" sh -c 'for f in /m/*.sql; do psql -X -U supabase_admin -d postgres -q -1 -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "migration failed: $f" >&2; exit 1; }; done' || exit 2
sql <<'SQL' || exit 2
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'synthetic-1@example.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'synthetic-2@example.test');
insert into public.organizations (type, name) values ('club', 'Synthetic Club');
insert into public.schools (id, name) values ('00000000-0000-4000-8000-0000000000b1', 'Synthetic School');
insert into public.athletes (first_name, last_name) values ('Ana', 'Synthetic'), ('Luis', 'Synthetic'), ('Eva', 'Synthetic');
create table public.copy_probe (label text);
create table public.empty_probe (label text);
insert into public.copy_probe values ('COPY looks like a header'), ('plain');
insert into public.school_memberships (school_id, user_id, role)
  values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'coach');
SQL

# age runs in the tools image; $T is mounted at the same path so file arguments work unchanged.
cat >"$T/bin/age" <<SH
#!/bin/sh
exec docker run --rm -i -v "$T:$T" -w "$T" "$TOOLS" age "\$@"
SH
chmod +x "$T/bin/age"
agek() { docker run --rm -v "$T:$T" "$TOOLS" age-keygen "$@" 2>&1; }
agek -o "$T/key1.txt" >/dev/null; agek -o "$T/key2.txt" >/dev/null
PUB=$(sed -n 's/^# public key: //p' "$T/key1.txt")

# Throwaway S3 endpoint for the R2 destination: `rclone serve s3` on the test network, no host port, no
# real bucket and no real credentials. (MinIO images are no longer pullable, rclone is already in the image.)
S3AK=$(rand); S3SK=$(rand)
R2ENV="-e RCLONE_CONFIG_R2_TYPE=s3 -e RCLONE_CONFIG_R2_PROVIDER=Rclone -e RCLONE_CONFIG_R2_ACCESS_KEY_ID=$S3AK -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$S3SK -e RCLONE_CONFIG_R2_ENDPOINT=http://$S3:9000"
BUCKET=ts-bucket
cat >"$T/bin/rclone" <<SH
#!/bin/sh
exec docker run --rm -i --network "$NET" --user "$(id -u):$(id -g)" -e HOME=/tmp $R2ENV -v "$T:$T" -w "$T" "$TOOLS" rclone "\$@"
SH
chmod +x "$T/bin/rclone"
docker run -d --name "$S3" --network "$NET" "$TOOLS" rclone serve s3 /data --addr :9000 --auth-key "$S3AK,$S3SK" >/dev/null || exit 2
i=0
until "$T/bin/rclone" mkdir "r2:$BUCKET" >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 30 ] && { echo "s3 endpoint did not start"; exit 2; }
  sleep 1
done

# A pg_dump that writes garbage, for the failed-verification case.
cat >"$T/shim/pg_dump" <<'SH'
#!/bin/sh
while [ $# -gt 0 ]; do [ "$1" = "-f" ] && echo "not a dump" >"$2"; shift; done
SH
chmod +x "$T/shim/pg_dump"

# Reference push command: the shape the runbook requires of BACKUP_PUSH_CMD for a local directory.
# It runs inside the tools container (busybox sh); $T is mounted at the same path.
printf 'DEST=%s\nLOG=%s\n' "$DEST" "$T/push.log" >"$T/push.sh"
cat >>"$T/push.sh" <<'SH'
[ "${1:-}" = push ] && [ $# -eq 3 ] || { echo "push contract: bad arguments" >&2; exit 9; }
echo "$1 $(basename "$2") $(basename "$3")" >>"$LOG"
h() { sha256sum <"$1" | cut -d' ' -f1; }
want() { sed -n 's/^encrypted_sha256=//p' "$1"; }
[ "$(h "$2")" = "$(want "$3")" ] || { echo "push contract: the manifest does not describe the encrypted file" >&2; exit 9; }
cp "$2" "$DEST/.new.age" && cp "$3" "$DEST/.new.mf" || { rm -f "$DEST/.new.age" "$DEST/.new.mf"; exit 1; }
[ -z "${PUSH_CORRUPT_TEMP:-}" ] || printf x >>"$DEST/.new.age"
if [ "$(h "$DEST/.new.age")" != "$(want "$DEST/.new.mf")" ]; then
  rm -f "$DEST/.new.age" "$DEST/.new.mf"
  echo "push: the stored copy failed verification" >&2
  exit 1
fi
mv "$DEST/.new.age" "$DEST/$(basename "$2")" && mv "$DEST/.new.mf" "$DEST/$(basename "$3")"
SH
PUSH='sh '"$T"'/push.sh "$0" "$@"'
FETCH='cp '"$DEST"'/trailskill-prod-latest.* "$1"/'

# bk [docker run options...]: backup-prod.sh in the tools container, on the source database's network.
bk() {
  docker run --rm --network "$NET" --user "$(id -u):$(id -g)" -v "$T:$T" -v "$HERE/backup-prod.sh:/backup-prod.sh:ro" -v "$HERE:/scripts:ro" \
    -e TMPDIR="$BKTMP" -e PGHOST="$DB" -e PGUSER=supabase_admin -e PGPASSWORD="$PW" -e PGDATABASE=postgres \
    -e BACKUP_PUSH_CMD="$PUSH" -e BACKUP_LOCK_FILE=/tmp/backup.lock "$@" "$TOOLS" sh /backup-prod.sh >"$T/out" 2>&1
}
# rc KEYFILE: restore-check.sh on the host (Docker for the temporary database, age through the wrapper).
rc() { PATH="$T/bin:$PATH" TMPDIR="$T/rc-tmp" BACKUP_FETCH_CMD="$FETCH" RESTORE_CHECK_CONTAINER_NAME="$RCNAME" sh "$HERE/restore-check.sh" "$1" >"$T/out" 2>&1; }
# rcf [hours]: restore-check.sh --freshness (no key, no docker, no age); optional BACKUP_MAX_AGE_HOURS.
rcf() { env ${1:+"BACKUP_MAX_AGE_HOURS=$1"} PATH="$T/bin:$PATH" TMPDIR="$T/rc-tmp" BACKUP_FETCH_CMD="$FETCH" sh "$HERE/restore-check.sh" --freshness >"$T/out" 2>&1; }
sums() { (cd "$DEST" && for f in trailskill-prod-latest.*; do echo "$f $(shasum -a 256 <"$f")"; done); }
leftovers() { ls -A "$BKTMP" | wc -l | tr -d ' '; }

# --- 1. refuses without an encryption key, before dumping -------------------
bk -e PGHOST=unreachable.invalid; r=$?
nonzero "no key: exit non-zero" "$r"
has "no key: clear message" "refusing to back up without an encryption public key"
eq "no key: nothing pushed" 0 "$(ls -A "$DEST" | wc -l | tr -d ' ')"
bk -e PGHOST=unreachable.invalid -e BACKUP_ALLOW_NO_KEY_FOR_TESTS=1; r=$?
nonzero "no key + old test bypass variable: still exits non-zero" "$r"
has "no key + old test bypass variable: still refuses" "refusing to back up without an encryption public key"
eq "no key + old test bypass variable: nothing pushed" 0 "$(ls -A "$DEST" | wc -l | tr -d ' ')"
bk -e BACKUP_AGE_RECIPIENT=notakey; r=$?
nonzero "bad key: exit non-zero" "$r"

# --- 2. backup -> push ------------------------------------------------------
t0=$(date +%s)
docker volume create "$LOCKVOL" >/dev/null || exit 2
docker volume ls -q | sort >"$T/vols.before"
bk -e BACKUP_AGE_RECIPIENT="$PUB" -e BACKUP_COUNT_TABLES="auth.users public.organizations public.schools public.athletes public.school_memberships public.copy_probe" -e BACKUP_MIN_COUNTS="auth.users=2 public.athletes=3"; r=$?
echo "backup elapsed: $(($(date +%s) - t0)) s"
eq "backup: exit 0" 0 "$r"
eq "backup: encrypted copy and manifest pushed" 2 "$(ls "$DEST" | wc -l | tr -d ' ')"
eq "backup: pushed file is age, not a plain dump" "age-encryption.org" "$(head -c 18 "$DEST/trailskill-prod-latest.dump.age")"
eq "backup: no plaintext dump left behind" 0 "$(leftovers)"
eq "backup: manifest has the synthetic user count" 2 "$(sed -n 's/^count\.auth\.users=//p' "$DEST/trailskill-prod-latest.manifest")"
eq "backup: manifest athletes count equals the synthetic rows" 3 "$(sed -n 's/^count\.public\.athletes=//p' "$DEST/trailskill-prod-latest.manifest")"
eq "backup: a row starting with COPY is counted" 2 "$(sed -n 's/^count\.public\.copy_probe=//p' "$DEST/trailskill-prod-latest.manifest")"
eq "backup: manifest holds counts only (no emails)" 0 "$(grep -c 'example.test' "$DEST/trailskill-prod-latest.manifest")"
eq "backup: password not printed" 0 "$(grep -c "$PW" "$T/out")"
eq "push contract: called once as 'push <encrypted> <manifest>'" "push trailskill-prod-latest.dump.age trailskill-prod-latest.manifest" "$(cat "$T/push.log")"
eq "push contract: one call only" 1 "$(wc -l <"$T/push.log" | tr -d ' ')"
eq "push contract: no temporary files left at the destination" 2 "$(ls -A "$DEST" | wc -l | tr -d ' ')"
eq "reason: the default is daily" "daily" "$(sed -n 's/^backup_reason=//p' "$DEST/trailskill-prod-latest.manifest")"
bk -e BACKUP_AGE_RECIPIENT="$PUB" -e BACKUP_REASON=pre-migration; r=$?
eq "reason: pre-migration backup exit 0" 0 "$r"
eq "reason: BACKUP_REASON goes into the manifest" "pre-migration" "$(sed -n 's/^backup_reason=//p' "$DEST/trailskill-prod-latest.manifest")"
eq "reason: exactly one reason line" 1 "$(grep -c '^backup_reason=' "$DEST/trailskill-prod-latest.manifest")"
for v in "two words" "UPPER" "-lead" "$(printf 'a\nb=c')" "$(printf 'x%.0s' $(seq 1 40))"; do
  bk -e BACKUP_AGE_RECIPIENT="$PUB" -e BACKUP_REASON="$v" -e PGHOST=unreachable.invalid; r=$?
  nonzero "reason: invalid value rejected" "$r"
  has "reason: invalid value says why, before dumping" "invalid BACKUP_REASON"
done
# the credential pair: BACKUP_PGUSER and BACKUP_PGPASSWORD replace the connection login, both or none
bk -e BACKUP_AGE_RECIPIENT="$PUB" -e PGUSER=nobody -e PGPASSWORD=wrong -e BACKUP_PGUSER=supabase_admin -e BACKUP_PGPASSWORD="$PW"; r=$?
eq "backup role: the pair replaces PGUSER and PGPASSWORD" 0 "$r"
bk -e BACKUP_AGE_RECIPIENT="$PUB" -e BACKUP_PGUSER=supabase_admin -e PGHOST=unreachable.invalid; r=$?
nonzero "backup role without password: exit non-zero" "$r"
has "backup role without password: says why, before dumping" "BACKUP_PGPASSWORD"
bk -e BACKUP_AGE_RECIPIENT="$PUB" -e BACKUP_PGPASSWORD=x -e PGHOST=unreachable.invalid; r=$?
nonzero "backup role password without user: exit non-zero" "$r"
has "backup role password without user: says why" "BACKUP_PGUSER"
eq "backup role: password not printed" 0 "$(grep -c "$PW" "$T/out")"

# the lock lives in backup-prod.sh: a direct run waits while another container holds it
hold() { # hold SECONDS: a container takes the lock file on the named volume
  docker run -d --name "$HOLDER" -v "$LOCKVOL:/backup-lock" "$TOOLS" \
    sh -c "touch /backup-lock/lock; chmod 666 /backup-lock/lock; exec 9>/backup-lock/lock; flock -n 9 || exit 1; echo held; sleep $1" >/dev/null || exit 2
  i=0
  until docker logs "$HOLDER" 2>&1 | grep -q '^held'; do
    i=$((i + 1)); [ "$i" -gt 30 ] && { echo "lock holder did not start"; exit 2; }
    sleep 1
  done
}
lk() { bk -v "$LOCKVOL:/backup-lock" -e BACKUP_LOCK_FILE=/backup-lock/lock -e BACKUP_AGE_RECIPIENT="$PUB" "$@"; }
before=$(wc -l <"$T/push.log" | tr -d ' ')
hold 300
t0=$(date +%s)
lk -e BACKUP_LOCK_WAIT_SECONDS=3; r=$?
waited=$(($(date +%s) - t0))
nonzero "lock held: a direct run exits non-zero" "$r"
eq "lock held: it waited for the bound" 1 "$([ "$waited" -ge 3 ] && echo 1 || echo 0)"
has "lock held: says it gave up" "could not get the backup lock within 3 s"
eq "lock held: nothing was pushed" "$before" "$(wc -l <"$T/push.log" | tr -d ' ')"
eq "lock held: no plaintext dump left behind" 0 "$(leftovers)"
docker rm -f -v "$HOLDER" >/dev/null 2>&1
lk -e BACKUP_LOCK_WAIT_SECONDS=3; r=$?
eq "lock released: the run goes through" 0 "$r"
hold 4
lk -e BACKUP_LOCK_WAIT_SECONDS=60; r=$?
eq "lock freed during the wait: exit 0" 0 "$r"
has "lock freed during the wait: it said it was waiting" "waiting for the backup lock"
docker rm -f -v "$HOLDER" >/dev/null 2>&1
lk -e BACKUP_LOCK_WAIT_SECONDS=abc; r=$?
nonzero "lock wait: invalid value exit non-zero" "$r"
has "lock wait: names the variable" "BACKUP_LOCK_WAIT_SECONDS"
lk -e BACKUP_LOCK_FILE=/nonexistent-dir/lock; r=$?
nonzero "lock file in a missing directory: exit non-zero" "$r"
has "lock file in a missing directory: clear message" "BACKUP_LOCK_FILE"
GOOD=$(sums)

# --- 3. restore check passes ------------------------------------------------
rc "$T/key1.txt"; r=$?
eq "restore: exit 0" 0 "$r"
has "restore: prints OK" "restore check OK"
has "restore: prints the copy date" "copy created at: 20"
has "restore: prints timing" "elapsed: [0-9]* s"
has "restore: compares athletes (3 expected, 3 restored)" "public.athletes  *3  *3"
cat "$T/out"
eq "restore: decrypted files removed" 0 "$(ls -A "$T/rc-tmp" | wc -l | tr -d ' ')"
eq "restore: temporary container removed" 0 "$(docker ps -aq --filter "name=$RCNAME" | wc -l | tr -d ' ')"

mkdir "$T/good" && cp "$DEST"/trailskill-prod-latest.* "$T/good/"

# --- 4. failed verification keeps the previous copy -------------------------
sql -c "insert into public.athletes (first_name, last_name) values ('Extra', 'Synthetic')"
bk -e BACKUP_AGE_RECIPIENT="$PUB" -v "$T/shim:/shim:ro" -e PATH=/shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; r=$?
nonzero "bad dump: exit non-zero" "$r"
has "bad dump: rejected by pg_restore --list" "rejected the dump"
eq "bad dump: previous copy byte-identical" "$GOOD" "$(sums)"
eq "bad dump: no plaintext left behind" 0 "$(leftovers)"
bk -e BACKUP_AGE_RECIPIENT="$PUB" -e BACKUP_PUSH_CMD=false; r=$?
nonzero "push failure: exit non-zero" "$r"
eq "push failure: no plaintext left behind" 0 "$(leftovers)"

# --- 4b. hardening: failed verify at the destination, empty copy, minimums -----
bk -e BACKUP_AGE_RECIPIENT="$PUB" -e PUSH_CORRUPT_TEMP=1; r=$?
nonzero "destination verify fails: exit non-zero" "$r"
has "destination verify fails: push command reports it" "failed verification"
eq "destination verify fails: previous copy byte-identical" "$GOOD" "$(sums)"
eq "destination verify fails: no temporary files left" 2 "$(ls -A "$DEST" | wc -l | tr -d ' ')"
eq "destination verify fails: no plaintext left behind" 0 "$(leftovers)"
bk -e BACKUP_AGE_RECIPIENT="$PUB" -e BACKUP_COUNT_TABLES=public.empty_probe; r=$?
nonzero "empty copy: exit non-zero" "$r"
has "empty copy: clear message" "every key table has 0 rows"
eq "empty copy: previous copy byte-identical" "$GOOD" "$(sums)"
eq "empty copy: no plaintext left behind" 0 "$(leftovers)"
bk -e BACKUP_AGE_RECIPIENT="$PUB" -e BACKUP_MIN_COUNTS=public.athletes=100; r=$?
nonzero "below minimum: exit non-zero" "$r"
has "below minimum: clear message" "below the minimum"
eq "below minimum: previous copy byte-identical" "$GOOD" "$(sums)"
eq "below minimum: no plaintext left behind" 0 "$(leftovers)"
for m in public.nope=1 public.athletes=x; do
  bk -e PGHOST=unreachable.invalid -e BACKUP_AGE_RECIPIENT="$PUB" -e BACKUP_MIN_COUNTS="$m"; r=$?
  nonzero "invalid minimum $m: exit non-zero" "$r"
  has "invalid minimum $m: rejected before dumping" "BACKUP_MIN_COUNTS"
done
eq "invalid minimum: previous copy byte-identical" "$GOOD" "$(sums)"

# --- 5. restore check catches problems --------------------------------------
cp "$DEST/trailskill-prod-latest.manifest" "$T/manifest.orig"
sed 's/^count\.public\.athletes=.*/count.public.athletes=99/' "$T/manifest.orig" >"$DEST/trailskill-prod-latest.manifest"
rc "$T/key1.txt"; r=$?
nonzero "wrong counts: exit non-zero" "$r"
has "wrong counts: mismatch shown" "MISMATCH"
echo 'count.public.athletes;drop=1' >>"$T/manifest.orig"
cp "$T/manifest.orig" "$DEST/trailskill-prod-latest.manifest"
rc "$T/key1.txt"; r=$?
nonzero "tampered table name: exit non-zero" "$r"
has "tampered table name: rejected" "invalid table name"
sed '$d' "$T/manifest.orig" >"$DEST/trailskill-prod-latest.manifest"
echo 'count.*=1' >>"$DEST/trailskill-prod-latest.manifest"
rc "$T/key1.txt"; r=$?
nonzero "glob key in manifest: exit non-zero" "$r"
has "glob key in manifest: rejected, not expanded" "invalid table name"
sed '$d' "$DEST/trailskill-prod-latest.manifest" >"$T/m.tmp" && cp "$T/m.tmp" "$DEST/trailskill-prod-latest.manifest"
rc "$T/key2.txt"; r=$?
nonzero "wrong key: exit non-zero" "$r"
has "wrong key: says decryption failed" "decryption failed"
printf 'x' >>"$DEST/trailskill-prod-latest.dump.age"
rc "$T/key1.txt"; r=$?
nonzero "tampered copy: exit non-zero" "$r"
has "tampered copy: checksum mismatch" "checksum does not match"
eq "no volume left by the restore containers" "" "$(docker volume ls -q | sort | comm -13 "$T/vols.before" -)"
eq "failures: temporary container removed" 0 "$(docker ps -aq --filter "name=$RCNAME" | wc -l | tr -d ' ')"
eq "failures: decrypted files removed" 0 "$(ls -A "$T/rc-tmp" | wc -l | tr -d ' ')"

# --- 6. freshness and emptiness of the fetched copy -------------------------
cp "$T/good/"* "$DEST/"
ago() { docker run --rm "$TOOLS" date -u -d "@$(( $(date +%s) - $1 * 3600 ))" +%Y-%m-%dT%H:%M:%SZ; }
setmf() { sed "$1" "$T/good/trailskill-prod-latest.manifest" >"$DEST/trailskill-prod-latest.manifest"; }
rcf; r=$?
eq "freshness: fresh copy exits 0" 0 "$r"
has "freshness: prints OK" "freshness OK"
rcf 8760; r=$?
eq "freshness: BACKUP_MAX_AGE_HOURS=8760 is accepted" 0 "$r"
setmf "s/^created_at=.*/created_at=$(ago 25)/"
rcf; r=$?
eq "freshness: 25 h old passes" 0 "$r"
setmf "s/^created_at=.*/created_at=$(ago 27)/"
rcf; r=$?
nonzero "freshness: 27 h old fails" "$r"
has "freshness: 27 h old says why" "older than 26 h"
rcf 48; r=$?
eq "freshness: 27 h old passes with BACKUP_MAX_AGE_HOURS=48" 0 "$r"
rc "$T/key1.txt"; r=$?
nonzero "restore: 27 h old copy fails" "$r"
has "restore: 27 h old copy says why" "older than 26 h"
eq "restore: stale copy never reached docker" 0 "$(docker ps -aq --filter "name=$RCNAME" | wc -l | tr -d ' ')"
setmf "s/^created_at=.*/created_at=$(ago -48)/"
rcf; r=$?
nonzero "freshness: date in the future fails" "$r"
has "freshness: future date says why" "in the future"
setmf 's/^created_at=.*/created_at=yesterday/'
rcf; r=$?
nonzero "freshness: malformed date fails" "$r"
has "freshness: malformed date says why" "malformed"
rcf x; r=$?
nonzero "freshness: non-numeric BACKUP_MAX_AGE_HOURS fails" "$r"
rcf 08; r=$?
nonzero "freshness: zero-padded BACKUP_MAX_AGE_HOURS fails" "$r"
has "freshness: zero-padded BACKUP_MAX_AGE_HOURS says why" "must be a whole number of hours"
for h in 8761 99999999999999999999; do
  rcf "$h"; r=$?
  nonzero "freshness: BACKUP_MAX_AGE_HOURS=$h fails" "$r"
  has "freshness: BACKUP_MAX_AGE_HOURS=$h says the bound" "BACKUP_MAX_AGE_HOURS must be at most 8760"
done
setmf 's/^\(count\..*\)=.*/\1=0/'
rcf; r=$?
nonzero "freshness: all counts 0 fails" "$r"
has "freshness: all counts 0 says why" "0 rows"
rc "$T/key1.txt"; r=$?
nonzero "restore: all counts 0 fails" "$r"
has "restore: all counts 0 says why" "0 rows"
cp "$T/good/"* "$DEST/"
printf 'x' >>"$DEST/trailskill-prod-latest.dump.age"
rcf; r=$?
nonzero "freshness: tampered copy fails" "$r"
has "freshness: tampered copy says why" "checksum does not match"
eq "freshness: no files left in TMPDIR" 0 "$(ls -A "$T/rc-tmp" | wc -l | tr -d ' ')"

# --- 7. Cloudflare R2 destination (backup-r2.sh) against the throwaway S3 endpoint ---------------------
R2P='sh /scripts/backup-r2.sh "$0" "$@"'
FETCH='sh '"$HERE"'/backup-r2.sh "$0" "$@"'
PATH="$T/bin:$PATH"; export PATH
BACKUP_RCLONE_REMOTE=r2:$BUCKET
export BACKUP_RCLONE_REMOTE
rcl() { "$T/bin/rclone" "$@"; }
# bkr: a real backup pushed to the bucket by backup-r2.sh.
bkr() { bk $R2ENV -e BACKUP_RCLONE_REMOTE="$BACKUP_RCLONE_REMOTE" -e BACKUP_PUSH_CMD="$R2P" -e BACKUP_AGE_RECIPIENT="$PUB" "$@"; }
remote_sha() { rcl cat "$BACKUP_RCLONE_REMOTE/trailskill-prod-latest.manifest" | sed -n 's/^encrypted_sha256=//p'; }
dumps() { rcl lsf "$BACKUP_RCLONE_REMOTE/dumps/" | sort | tr '\n' ' '; }
# fetched DIR EXPECTED-MANIFEST: fetch through backup-r2.sh and check the pair is the expected, consistent one.
fetched() {
  rm -rf "$T/f" && mkdir "$T/f" && sh "$HERE/backup-r2.sh" fetch "$T/f" >"$T/out" 2>&1 || return 1
  cmp -s "$T/f/trailskill-prod-latest.manifest" "$1" &&
    [ "$(shasum -a 256 <"$T/f/trailskill-prod-latest.dump.age" | cut -d' ' -f1)" = "$(sed -n 's/^encrypted_sha256=//p' "$T/f/trailskill-prod-latest.manifest")" ]
}

# (a) first backup
bkr; r=$?
eq "r2: backup exit 0" 0 "$r"
SHA_A=$(remote_sha)
eq "r2: exactly the manifest, dumps/ and manifests/ at the remote" "dumps/ manifests/ trailskill-prod-latest.manifest " "$(rcl lsf "$BACKUP_RCLONE_REMOTE" | sort | tr '\n' ' ')"
eq "r2: one dump, named by the manifest's encrypted_sha256" "$SHA_A.dump.age " "$(dumps)"
# (b) restore through the R2 fetch
rc "$T/key1.txt"; r=$?
eq "r2: full restore check passes through fetch" 0 "$r"
has "r2: restore prints OK" "restore check OK"
rcf; r=$?
eq "r2: freshness passes through fetch" 0 "$r"
# (c) second backup replaces the first
sql -c "insert into public.athletes (first_name, last_name) values ('Second', 'Synthetic')"
bkr; r=$?
eq "r2: second backup exit 0" 0 "$r"
SHA_C=$(remote_sha)
eq "r2: second backup: both dumps are kept (14-day retention), the manifest names the new one" "$(printf '%s\n%s\n' "$SHA_A.dump.age" "$SHA_C.dump.age" | sort | tr '\n' ' ')" "$(dumps)"
eq "r2: second backup: the manifest names the new dump" "$SHA_C" "$(remote_sha)"
[ "$SHA_C" != "$SHA_A" ] && pass "r2: second backup: the name changed" || fail "r2: second backup: the name changed" "same sha"

# (d) crash at every step boundary. State A is the committed pair now at the remote; B is a second real backup
# made into the local directory. Each case puts the bucket in the exact state a crash would leave.
mkdir "$T/A" "$T/B"
rcl copyto "$BACKUP_RCLONE_REMOTE/trailskill-prod-latest.manifest" "$T/A/m" && rcl copyto "$BACKUP_RCLONE_REMOTE/dumps/$SHA_C.dump.age" "$T/A/d"
sql -c "insert into public.athletes (first_name, last_name) values ('Third', 'Synthetic')"
bk -e BACKUP_AGE_RECIPIENT="$PUB"; r=$?
eq "r2 crash setup: second real backup (B) made locally" 0 "$r"
cp "$DEST/trailskill-prod-latest.manifest" "$T/B/m"; cp "$DEST/trailskill-prod-latest.dump.age" "$T/B/d"
SHA_B=$(sed -n 's/^encrypted_sha256=//p' "$T/B/m")
RR=$BACKUP_RCLONE_REMOTE
state() { # state MANIFEST-FILE DUMP-SPEC...: wipe the bucket, then put the named objects (name=file)
  rcl delete "$RR" >/dev/null 2>&1; m=$1; shift
  rcl copyto "$m" "$RR/trailskill-prod-latest.manifest" || return 1
  for o in "$@"; do rcl copyto "${o#*=}" "$RR/dumps/${o%%=*}.dump.age" || return 1; done
}
# 1. crash after uploading the new dump (B dump present, manifest still A). The verify step (2) leaves the
# very same bucket state, so one assertion set covers both.
state "$T/A/m" "$SHA_C=$T/A/d" "$SHA_B=$T/B/d"
rcf; r=$?
eq "r2 crash after upload/verify: freshness passes" 0 "$r"
fetched "$T/A/m"; r=$?
eq "r2 crash after upload/verify: fetch returns the consistent old pair A" 0 "$r"
# 3. crash after publishing the manifest (manifest B, dumps A and B)
state "$T/B/m" "$SHA_C=$T/A/d" "$SHA_B=$T/B/d"
rcf; r=$?
eq "r2 crash after publish: freshness passes" 0 "$r"
fetched "$T/B/m"; r=$?
eq "r2 crash after publish: fetch returns the consistent new pair B" 0 "$r"
rc "$T/key1.txt"; r=$?
eq "r2 crash after publish: full restore (decrypt + restore) passes" 0 "$r"
has "r2 crash after publish: restores the athletes of B (6 rows)" "public.athletes  *6  *6"
# Freshness reads created_at of the PUBLISHED manifest, never object timestamps: re-uploading dumps (new
# mtime) changes nothing, and a fresh upload of an old manifest still fails.
rcl copyto "$T/A/d" "$RR/dumps/$SHA_C.dump.age"
rcf; r=$?
eq "r2 freshness ignores a re-uploaded old dump" 0 "$r"
sed "s/^created_at=.*/created_at=$(ago 27)/" "$T/B/m" >"$T/B/m.old"
rcl copyto "$T/B/m.old" "$RR/trailskill-prod-latest.manifest"
rcf; r=$?
nonzero "r2 freshness: a just-uploaded manifest with an old created_at fails" "$r"
has "r2 freshness: judged by created_at, not by object age" "older than 26 h"
# 4. crash mid-cleanup (manifest B, B dump, one stray old dump left)
printf 'orphan' >"$T/orphan"
touch -t 202001010000.00 "$T/orphan" # old, so the cleanup reaches it and must leave it alone
state "$T/B/m" "$SHA_B=$T/B/d" "orphan=$T/orphan"
rcf; r=$?
eq "r2 crash mid-cleanup: freshness passes" 0 "$r"
fetched "$T/B/m"; r=$?
eq "r2 crash mid-cleanup: fetch returns the consistent new pair B" 0 "$r"
# next normal backup from that state: B and the new D are inside the 14 days, the object with another name is left alone
bkr; r=$?
eq "r2: backup after a crash exits 0" 0 "$r"
SHA_D=$(remote_sha)
eq "r2: backup after a crash keeps B and D and leaves the object with another name alone" "$(printf '%s\n%s\n%s\n' "$SHA_B.dump.age" "$SHA_D.dump.age" orphan.dump.age | sort | tr '\n' ' ')" "$(dumps)"
has "r2: backup after a crash warns about the object with another name" "other names"

# (e) manifest naming a missing dump, (f) malformed sha, (g) usage
rcl deletefile "$RR/dumps/$SHA_D.dump.age"
rcf; r=$?
nonzero "r2: missing dump: freshness fails" "$r"
has "r2: missing dump: clear message" "the copy named by the manifest is missing"
sed 's/^encrypted_sha256=.*/encrypted_sha256=..\/..\/x/' "$T/B/m" | rcl rcat "$RR/trailskill-prod-latest.manifest"
rcf; r=$?
nonzero "r2: malformed encrypted_sha256: fetch fails" "$r"
has "r2: malformed encrypted_sha256: clear message" "encrypted_sha256 is missing or malformed"
sh "$HERE/backup-r2.sh" bogus >"$T/out" 2>&1; r=$?
nonzero "r2: wrong subcommand fails" "$r"
has "r2: wrong subcommand prints usage" "usage: backup-r2.sh"
env -u BACKUP_RCLONE_REMOTE sh "$HERE/backup-r2.sh" fetch "$T/f" >"$T/out" 2>&1; r=$?
nonzero "r2: missing BACKUP_RCLONE_REMOTE fails" "$r"
has "r2: missing BACKUP_RCLONE_REMOTE says so" "BACKUP_RCLONE_REMOTE is required"

# --- 8. the replace order and overlapping pushes (R2) ------------------------------------------------------
# A real backup (B) is pushed with backup-prod.sh while a test-only rclone in front of the real one (the same
# trick as the pg_dump shim) injects one failure, or runs one action before one call. Control files in
# $T/fake are one-shot; with none present the shim only passes the call through. Nothing in backup-r2.sh knows.
mkdir "$T/fake" "$T/fakebin"
printf '#!/bin/sh\nF=%s\n' "$T/fake" >"$T/fakebin/rclone"
cat >>"$T/fakebin/rclone" <<'SH'
# First line of a control file: "<subcommand>:<substring of an argument>".
#   fail     exit 1 without doing anything       garbage  for `cat`, print garbage instead of the object
#   before   run $F/before.sh, then the real call
hit() {
  c=$1; shift
  [ -s "$F/$c" ] || return 1
  spec=$(head -n 1 "$F/$c")
  [ "$1" = "${spec%%:*}" ] || return 1
  for a in "$@"; do case $a in *"${spec#*:}"*) rm -f "$F/$c"; return 0 ;; esac; done
  return 1
}
hit fail "$@" && { echo "fake rclone: injected failure: $*" >&2; exit 1; }
hit garbage "$@" && { echo "not the dump"; exit 0; }
hit before "$@" && sh "$F/before.sh"
exec /usr/bin/rclone "$@"
SH
chmod +x "$T/fakebin/rclone"
bkx() { bkr -e PATH="$T/fakebin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"; }
arm() { printf '%s\n' "$2" >"$T/fake/$1"; }
disarm() { rm -f "$T/fake/"*; }
mk_pair() { mkdir "$1" && bk -e BACKUP_AGE_RECIPIENT="$PUB" && cp "$DEST/trailskill-prod-latest.manifest" "$1/m" && cp "$DEST/trailskill-prod-latest.dump.age" "$1/d"; }
has_dump() { rcl lsf "$RR/dumps/" | grep -Fxq "$1.dump.age"; }
same_manifest() { rcl cat "$RR/trailskill-prod-latest.manifest" | cmp -s - "$1"; }
mfsha() { sed -n 's/^encrypted_sha256=//p' "$1/m"; }

mk_pair "$T/XA"; r=$?
eq "r2 order setup: pair A made" 0 "$r"
# A is an old copy (past the 14 days): its dump time is what makes the cleanup delete it. Dates are kept by rclone.
touch -t 202001010000.00 "$T/XA/d"
mk_pair "$T/XC"; r=$?
eq "r2 order setup: pair C made" 0 "$r"
SHA_XA=$(mfsha "$T/XA"); SHA_XC=$(mfsha "$T/XC")
# a_kept: the failed push of B left the committed pair A exactly as it was
a_kept() {
  same_manifest "$T/XA/m"; r=$?; eq "$1: the remote manifest is byte-identical to A's" 0 "$r"
  has_dump "$SHA_XA"; r=$?; eq "$1: dump A still exists" 0 "$r"
  rcf; r=$?; eq "$1: freshness passes" 0 "$r"
  fetched "$T/XA/m"; r=$?; eq "$1: fetch returns pair A" 0 "$r"
}
# push_fails NAME ARM-KIND SPEC MESSAGE: B's push fails at that step and A is untouched
push_fails() {
  disarm; state "$T/XA/m" "$SHA_XA=$T/XA/d"
  arm "$2" "$3"
  bkx; r=$?
  nonzero "$1: backup exits non-zero" "$r"
  has "$1: says why" "$4"
  a_kept "$1"
}
push_fails "r2 step 1, dump upload fails" fail "copyto:.dump.age" "upload failed"
push_fails "r2 step 2, read-back fails" fail "cat:dumps/" "does not verify"
push_fails "r2 step 2, read-back returns garbage (manifest must not be published)" garbage "cat:dumps/" "does not verify"
push_fails "r2 step 2b, manifest copy upload fails" fail "copyto:manifests/" "upload failed"
push_fails "r2 step 3, manifest publish fails" fail "copyto:r2:$BUCKET/trailskill-prod-latest.manifest" "cannot publish the manifest"
# step 4: a failed delete is only a warning; the new pair is already committed
disarm; state "$T/XA/m" "$SHA_XA=$T/XA/d"
arm fail "deletefile:dumps/"
bkx; r=$?
eq "r2 step 4, cleanup delete fails: backup exits 0" 0 "$r"
has "r2 step 4, cleanup delete fails: warns" "could not delete old object"
SHA_XB=$(remote_sha)
[ "$SHA_XB" != "$SHA_XA" ] && pass "r2 step 4, cleanup delete fails: the manifest is B's" || fail "r2 step 4, cleanup delete fails: the manifest is B's" "still A"
has_dump "$SHA_XB"; r=$?; eq "r2 step 4, cleanup delete fails: dump B exists" 0 "$r"
rcl cat "$RR/trailskill-prod-latest.manifest" >"$T/Bm"
fetched "$T/Bm"; r=$?; eq "r2 step 4, cleanup delete fails: fetch returns B" 0 "$r"

# overlapping pushes: another push acts between B's publish and B's cleanup (the hook runs before B's first lsf)
disarm; state "$T/XA/m" "$SHA_XA=$T/XA/d"
cat >"$T/fake/before.sh" <<SH
touch -t 203001010000.00 "$T/XC/d"
/usr/bin/rclone copyto "$T/XC/d" "$RR/dumps/$SHA_XC.dump.age"
SH
arm before "lsf:dumps/"
bkx; r=$?
eq "r2 overlap (a), newer unpublished dump C: backup exits 0" 0 "$r"
has_dump "$SHA_XC"; r=$?; eq "r2 overlap (a): the newer dump C is not deleted" 0 "$r"
has_dump "$SHA_XA"; r=$?; nonzero "r2 overlap (a): the older dump A is deleted" "$r"
SHA_XB=$(remote_sha)
has_dump "$SHA_XB"; r=$?; eq "r2 overlap (a): the manifest names an existing dump (B)" 0 "$r"

disarm; state "$T/XA/m" "$SHA_XA=$T/XA/d"
cat >"$T/fake/before.sh" <<SH
touch -t 202001010000.00 "$T/XC/d"
/usr/bin/rclone copyto "$T/XC/d" "$RR/dumps/$SHA_XC.dump.age" && /usr/bin/rclone copyto "$T/XC/m" "$RR/trailskill-prod-latest.manifest"
SH
arm before "lsf:dumps/"
bkx; r=$?
eq "r2 overlap (b1), C published before B lists dumps/: backup exits 0" 0 "$r"
has_dump "$SHA_XC"; r=$?; eq "r2 overlap (b1): C is older than B but named by the manifest, so it is not deleted" 0 "$r"
fetched "$T/XC/m"; r=$?; eq "r2 overlap (b1): fetch returns pair C" 0 "$r"

disarm; state "$T/XA/m" "$SHA_XA=$T/XA/d"
arm before "deletefile:dumps/"
cat >"$T/fake/before.sh" <<SH
touch -t 202001010000.00 "$T/XC/d"
/usr/bin/rclone copyto "$T/XC/d" "$RR/dumps/$SHA_XC.dump.age" && /usr/bin/rclone copyto "$T/XC/m" "$RR/trailskill-prod-latest.manifest"
SH
bkx; r=$?
eq "r2 overlap (b2), C published before B's first delete: backup exits 0" 0 "$r"
has_dump "$SHA_XC"; r=$?; eq "r2 overlap (b2): C's dump is not deleted" 0 "$r"
fetched "$T/XC/m"; r=$?; eq "r2 overlap (b2): fetch returns pair C" 0 "$r"

disarm; state "$T/XA/m" "$SHA_XA=$T/XA/d"
cat >"$T/fake/before.sh" <<SH
/usr/bin/rclone delete "$RR/dumps/" --exclude "$SHA_XA.dump.age"
SH
arm before "lsf:dumps/"
bkx; r=$?
nonzero "r2 overlap (c), own dump deleted after the publish: backup exits non-zero" "$r"
has "r2 overlap (c): says the new dump was missing" "was missing after its manifest was published"
has "r2 overlap (c): says it was uploaded again and verified" "uploaded again and verified, nothing was cleaned up"
SHA_XB=$(remote_sha)
eq "r2 overlap (c): nothing else was deleted, the own dump is back" "$(printf '%s\n%s\n' "$SHA_XA.dump.age" "$SHA_XB.dump.age" | sort | tr '\n' ' ')" "$(dumps)"
rcl cat "$RR/trailskill-prod-latest.manifest" >"$T/Bm"
fetched "$T/Bm"; r=$?; eq "r2 overlap (c): fetch returns the pair whose dump was uploaded again" 0 "$r"
rcf; r=$?; eq "r2 overlap (c): freshness passes" 0 "$r"

# (c2) the same, but the upload again fails: the existing error stays and the bucket is not touched further
disarm; state "$T/XA/m" "$SHA_XA=$T/XA/d"
printf 'copyto:dumps/\n' >"$T/fake/hookfail"
cat >"$T/fake/before.sh" <<SH
/usr/bin/rclone delete "$RR/dumps/" --exclude "$SHA_XA.dump.age"
cp "$T/fake/hookfail" "$T/fake/fail"
SH
arm before "lsf:dumps/"
bkx; r=$?
nonzero "r2 overlap (c2), own dump deleted and the upload again fails: backup exits non-zero" "$r"
has "r2 overlap (c2): keeps the error that the new dump is missing" "is missing after its manifest was published"
eq "r2 overlap (c2): nothing else was deleted" "$SHA_XA.dump.age " "$(dumps)"

# (S7) cleanup re-reads the remote manifest before EACH delete: a second push publishes a manifest naming one of two
# old dumps (H) after the delete of the other (L) was reached. Both are strictly older than the new dump. The
# listing is sorted by name, so L (the smaller sha) is deleted first; the hook runs just before that delete.
touch -t 202001010000.00 "$T/XA/d" "$T/XC/d"
L=$(printf '%s\n%s\n' "$SHA_XA" "$SHA_XC" | sort | head -n 1)
if [ "$L" = "$SHA_XA" ]; then H=$SHA_XC; HD=$T/XC; else H=$SHA_XA; HD=$T/XA; fi
disarm; state "$T/XA/m" "$SHA_XA=$T/XA/d" "$SHA_XC=$T/XC/d"
cat >"$T/fake/before.sh" <<SH
/usr/bin/rclone copyto "$HD/m" "$RR/trailskill-prod-latest.manifest"
SH
arm before "deletefile:dumps/$L.dump.age"
bkx; r=$?
eq "r2 overlap (S7), manifest names an old dump between two deletes: backup exits 0" 0 "$r"
has_dump "$H"; r=$?; eq "r2 overlap (S7): the dump the manifest names now is not deleted" 0 "$r"
has_dump "$L"; r=$?; nonzero "r2 overlap (S7): the other old dump is deleted" "$r"
same_manifest "$HD/m"; r=$?; eq "r2 overlap (S7): the remote manifest is the one the second push published" 0 "$r"
fetched "$HD/m"; r=$?; eq "r2 overlap (S7): fetch returns a consistent pair" 0 "$r"
rcf; r=$?; eq "r2 overlap (S7): freshness passes" 0 "$r"

# a listing or a manifest read that fails AFTER the manifest is published is a warning, not an error: nothing is
# deleted without a listing and the freshness job checks the pair. A confirmed problem stays an error.
# step 4 (before the cleanup): the listing fails once; B is committed, A is left in place
disarm; state "$T/XA/m" "$SHA_XA=$T/XA/d"
arm fail "lsf:dumps/"
bkx; r=$?
eq "r2 step 4 listing fails: backup exits 0" 0 "$r"
has "r2 step 4 listing fails: warns that it cannot clean up" "could not list dumps/ to clean up"
SHA_XB=$(remote_sha)
[ "$SHA_XB" != "$SHA_XA" ] && pass "r2 step 4 listing fails: the manifest is the new one" || fail "r2 step 4 listing fails: the manifest is the new one" "still A"
has_dump "$SHA_XA"; r=$?; eq "r2 step 4 listing fails: nothing deleted, old dump A still there" 0 "$r"
has_dump "$SHA_XB"; r=$?; eq "r2 step 4 listing fails: dump B exists" 0 "$r"
# step 6: the first delete is reached, then the hook breaks what step 6 reads, or the manifest it names
disarm; state "$T/XA/m" "$SHA_XA=$T/XA/d"
printf 'lsf:dumps/\n' >"$T/fake/hookfail"
cat >"$T/fake/before.sh" <<SH
cp "$T/fake/hookfail" "$T/fake/fail"
SH
arm before "deletefile:dumps/"
bkx; r=$?
eq "r2 step 6 listing fails: backup exits 0" 0 "$r"
has "r2 step 6 listing fails: warns it could not confirm" "could not list dumps/ to confirm the published copy"
has_dump "$(remote_sha)"; r=$?; eq "r2 step 6 listing fails: the manifest names an existing dump" 0 "$r"
disarm; state "$T/XA/m" "$SHA_XA=$T/XA/d"
printf 'cat:trailskill-prod-latest.manifest\n' >"$T/fake/hookfail"
cat >"$T/fake/before.sh" <<SH
cp "$T/fake/hookfail" "$T/fake/fail"
SH
arm before "deletefile:dumps/"
bkx; r=$?
eq "r2 step 6 manifest re-read fails: backup exits 0" 0 "$r"
has "r2 step 6 manifest re-read fails: warns it could not confirm" "could not re-read the remote manifest to confirm"
# step 6 confirmed problem: the listing works and the manifest names a dump that does not exist
FAKESHA=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef
disarm; state "$T/XA/m" "$SHA_XA=$T/XA/d"
cat >"$T/fake/before.sh" <<SH
sed 's/^encrypted_sha256=.*/encrypted_sha256=$FAKESHA/' "$T/XA/m" | /usr/bin/rclone rcat "$RR/trailskill-prod-latest.manifest"
SH
arm before "deletefile:dumps/"
bkx; r=$?
nonzero "r2 step 6 manifest names a missing dump: backup exits non-zero" "$r"
has "r2 step 6 manifest names a missing dump: says so" "the published manifest names a missing dump (dumps/$FAKESHA.dump.age)"

# the 14-day boundary (13, 15 and 30 days, BACKUP_KEEP_DAYS) and every other fail-safe of the cleanup are tested
# without Postgres in backup-r2.test.sh

# nested folders under dumps/ are left alone with one warning in total
disarm; state "$T/XA/m" "$SHA_XA=$T/XA/d"
rcl copyto "$T/XA/m" "$RR/dumps/n1/x" && rcl copyto "$T/XA/m" "$RR/dumps/n2/x"
bkr; r=$?
eq "r2 nested folders: backup exits 0" 0 "$r"
eq "r2 nested folders: one warning in total" 1 "$(grep -c 'holds folders' "$T/out")"
eq "r2 nested folders: the folders are left alone, the old dump is gone" "$(remote_sha).dump.age n1/ n2/ " "$(dumps)"
disarm

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL PASSED"; else echo "$FAILS FAILED"; exit 1; fi
