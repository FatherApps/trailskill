#!/bin/sh
# End-to-end test of backup-prod.sh and restore-check.sh (#1119) with a throwaway source database
# (the Supabase Postgres image with the repo migrations and synthetic rows), a real age key and a local
# directory as the "destination". No host ports are published. Needs Docker and network (to build an
# alpine image with age). Usage: sh deploy/scripts/backup-prod.test.sh
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
PGIMG=public.ecr.aws/supabase/postgres:17.11.0.006
ID="ts-bktest-$$-$(date +%s)"
NET=$ID
DB=$ID-db
TOOLS=$ID-tools
T=$(mktemp -d)
rand() { od -An -N12 -tx1 /dev/urandom | tr -d ' \n'; }
PW=$(rand)
FAILS=0
DEST=$T/dest
BKTMP=$T/bk-tmp
mkdir -p "$DEST" "$BKTMP" "$T/rc-tmp" "$T/bin" "$T/shim"

cleanup() {
  docker rm -f "$DB" >/dev/null 2>&1
  docker ps -aq --filter "name=restore-check-" | xargs docker rm -f >/dev/null 2>&1
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
printf 'FROM postgres:17-alpine\nRUN apk add --no-cache age\n' | docker build -q -t "$TOOLS" - >/dev/null || { echo "cannot build tools image"; exit 2; }
docker network create "$NET" >/dev/null || exit 2
docker run -d --name "$DB" --network "$NET" -e POSTGRES_PASSWORD="$PW" "$PGIMG" >/dev/null || exit 2
sql() { docker exec -i "$DB" psql -X -U supabase_admin -d postgres -Atq -v ON_ERROR_STOP=1 "$@"; }
i=0; ok=0
while [ "$ok" -lt 2 ]; do
  if sql -c 'select 1' >/dev/null 2>&1; then ok=$((ok + 1)); else ok=0; fi
  i=$((i + 1)); [ "$i" -gt 90 ] && { echo "database did not start"; exit 2; }
  sleep 2
done
docker cp "$ROOT/supabase/migrations" "$DB:/m" >/dev/null
docker exec -e PGOPTIONS="-c client_min_messages=warning" "$DB" sh -c 'for f in /m/*.sql; do psql -X -U supabase_admin -d postgres -q -1 -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "migration failed: $f" >&2; exit 1; }; done' || exit 2
sql <<'SQL' || exit 2
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'synthetic-1@example.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'synthetic-2@example.test');
insert into public.organizations (type, name) values ('club', 'Synthetic Club');
insert into public.schools (id, name) values ('00000000-0000-4000-8000-0000000000b1', 'Synthetic School');
insert into public.athletes (first_name, last_name) values ('Ana', 'Synthetic'), ('Luis', 'Synthetic'), ('Eva', 'Synthetic');
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

# A pg_dump that writes garbage, for the failed-verification case.
cat >"$T/shim/pg_dump" <<'SH'
#!/bin/sh
while [ $# -gt 0 ]; do [ "$1" = "-f" ] && echo "not a dump" >"$2"; shift; done
SH
chmod +x "$T/shim/pg_dump"

PUSH='d='"$DEST"'; cp "$1" "$d/.new.age" && cp "$2" "$d/.new.mf" && mv "$d/.new.age" "$d/${1##*/}" && mv "$d/.new.mf" "$d/${2##*/}"'
FETCH='cp '"$DEST"'/trailskill-prod-latest.* "$1"/'

# bk [docker run options...]: backup-prod.sh in the tools container, on the source database's network.
bk() {
  docker run --rm --network "$NET" --user "$(id -u):$(id -g)" -v "$T:$T" -v "$HERE/backup-prod.sh:/backup-prod.sh:ro" \
    -e TMPDIR="$BKTMP" -e PGHOST="$DB" -e PGUSER=supabase_admin -e PGPASSWORD="$PW" -e PGDATABASE=postgres \
    -e BACKUP_PUSH_CMD="$PUSH" "$@" "$TOOLS" sh /backup-prod.sh >"$T/out" 2>&1
}
# rc KEYFILE: restore-check.sh on the host (Docker for the temporary database, age through the wrapper).
rc() { PATH="$T/bin:$PATH" TMPDIR="$T/rc-tmp" BACKUP_FETCH_CMD="$FETCH" sh "$HERE/restore-check.sh" "$1" >"$T/out" 2>&1; }
sums() { (cd "$DEST" && for f in trailskill-prod-latest.*; do echo "$f $(shasum -a 256 <"$f")"; done); }
leftovers() { ls -A "$BKTMP" | wc -l | tr -d ' '; }

# --- 1. refuses without an encryption key, before dumping -------------------
bk -e PGHOST=unreachable.invalid; r=$?
nonzero "no key: exit non-zero" "$r"
has "no key: clear message" "refusing to back up without an encryption public key"
eq "no key: nothing pushed" 0 "$(ls -A "$DEST" | wc -l | tr -d ' ')"
bk -e BACKUP_AGE_RECIPIENT=notakey; r=$?
nonzero "bad key: exit non-zero" "$r"

# --- 2. backup -> push ------------------------------------------------------
t0=$(date +%s)
bk -e BACKUP_AGE_RECIPIENT="$PUB"; r=$?
echo "backup elapsed: $(($(date +%s) - t0)) s"
eq "backup: exit 0" 0 "$r"
eq "backup: encrypted copy and manifest pushed" 2 "$(ls "$DEST" | wc -l | tr -d ' ')"
eq "backup: pushed file is age, not a plain dump" "age-encryption.org" "$(head -c 18 "$DEST/trailskill-prod-latest.dump.age")"
eq "backup: no plaintext dump left behind" 0 "$(leftovers)"
eq "backup: manifest has the synthetic user count" 2 "$(sed -n 's/^count\.auth\.users=//p' "$DEST/trailskill-prod-latest.manifest")"
eq "backup: manifest athletes count equals the synthetic rows" 3 "$(sed -n 's/^count\.public\.athletes=//p' "$DEST/trailskill-prod-latest.manifest")"
eq "backup: manifest holds counts only (no emails)" 0 "$(grep -c 'example.test' "$DEST/trailskill-prod-latest.manifest")"
eq "backup: password not printed" 0 "$(grep -c "$PW" "$T/out")"
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
eq "restore: temporary container removed" 0 "$(docker ps -aq --filter 'name=restore-check-' | wc -l | tr -d ' ')"

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
rc "$T/key2.txt"; r=$?
nonzero "wrong key: exit non-zero" "$r"
has "wrong key: says decryption failed" "decryption failed"
printf 'x' >>"$DEST/trailskill-prod-latest.dump.age"
rc "$T/key1.txt"; r=$?
nonzero "tampered copy: exit non-zero" "$r"
has "tampered copy: checksum mismatch" "checksum does not match"
eq "failures: temporary container removed" 0 "$(docker ps -aq --filter 'name=restore-check-' | wc -l | tr -d ' ')"
eq "failures: decrypted files removed" 0 "$(ls -A "$T/rc-tmp" | wc -l | tr -d ' ')"

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL PASSED"; else echo "$FAILS FAILED"; exit 1; fi
