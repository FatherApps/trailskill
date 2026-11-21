#!/bin/sh
# Test of the 14-day retention and of fetching a chosen copy by sha (#1335): backup-r2.sh push|fetch and
# restore-check.sh <identity|--freshness> [sha]. The "bucket" is a throwaway S3 endpoint (`rclone serve s3` in a
# container on a private network, no host port), so no real R2, no real credentials and no real data are
# involved. The host needs only Docker and network (to build an alpine image with rclone). No Postgres, no age.
# Usage: sh deploy/scripts/backup-r2.test.sh
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
ID="ts-r2test-$$-$(date +%s)"
TOOLS=$ID-tools
NET=$ID
S3=$ID-s3
T=$(mktemp -d)
rand() { od -An -N12 -tx1 /dev/urandom | tr -d ' \n'; }
FAILS=0
mkdir -p "$T/bin" "$T/fakebin" "$T/fake" "$T/p" "$T/rc-tmp"

cleanup() {
  docker rm -f -v "$S3" >/dev/null 2>&1
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
printf 'FROM postgres:17-alpine\nRUN apk add --no-cache rclone\n' | docker build -q -t "$TOOLS" - >/dev/null || { echo "cannot build tools image"; exit 2; }
docker network create "$NET" >/dev/null || exit 2
S3AK=$(rand); S3SK=$(rand)
R2ENV="-e RCLONE_CONFIG_R2_TYPE=s3 -e RCLONE_CONFIG_R2_PROVIDER=Rclone -e RCLONE_CONFIG_R2_ACCESS_KEY_ID=$S3AK -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$S3SK -e RCLONE_CONFIG_R2_ENDPOINT=http://$S3:9000"
BUCKET=ts-bucket
# rclone in the container; $T is mounted at the same path so file arguments work unchanged.
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
# Test-only rclone in front of the real one: logs every call, and injects one failure per armed control file
# ($T/fake/fail: "<subcommand>:<substring of an argument>") or runs $T/fake/hook.sh before one call
# ($T/fake/before: same spec). With none armed it only passes the call through. Nothing in backup-r2.sh knows.
cat >"$T/fakebin/rclone" <<SH
#!/bin/sh
F=$T/fake
echo "\$*" >>$T/rclone.log
SH
cat >>"$T/fakebin/rclone" <<'SH'
hit() {
  c=$1; shift
  [ -s "$F/$c" ] || return 1
  spec=$(head -n 1 "$F/$c")
  [ "$1" = "${spec%%:*}" ] || return 1
  for a in "$@"; do case $a in *"${spec#*:}"*) rm -f "$F/$c"; return 0 ;; esac; done
  return 1
}
hit fail "$@" && { echo "fake rclone: injected failure: $*" >&2; exit 1; }
hit before "$@" && sh "$F/hook.sh"
SH
printf 'exec %s "$@"\n' "$T/bin/rclone" >>"$T/fakebin/rclone"
chmod +x "$T/fakebin/rclone"
PATH="$T/fakebin:$PATH"; export PATH
BACKUP_RCLONE_REMOTE=r2:$BUCKET; export BACKUP_RCLONE_REMOTE
R=$BACKUP_RCLONE_REMOTE
rcl() { "$T/bin/rclone" "$@"; }
unset BACKUP_KEEP_DAYS

arm() { printf '%s\n' "$2" >"$T/fake/$1"; }
disarm() { rm -f "$T/fake/fail" "$T/fake/before" "$T/fake/hook.sh"; }
rlog_reset() { : >"$T/rclone.log"; }
rlog_calls() { wc -l <"$T/rclone.log" | tr -d ' '; }

sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi | cut -d' ' -f1; }
# ago_touch FILE DAYS: set the file's mtime DAYS days back
ago_touch() {
  e=$(($(date +%s) - $2 * 86400))
  touch -t "$(date -r "$e" +%Y%m%d%H%M.%S 2>/dev/null || date -d "@$e" +%Y%m%d%H%M.%S)" "$1"
}
# iso_ago DAYS: created_at value DAYS days back
iso_ago() {
  e=$(($(date +%s) - $1 * 86400))
  date -u -r "$e" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "@$e" +%Y-%m-%dT%H:%M:%SZ
}
# mkpair NAME [DAYS]: synthetic encrypted file and manifest in $T/p, both dated DAYS days back (default now)
mkpair() {
  od -An -N48 -tx1 /dev/urandom | tr -d ' \n' >"$T/p/$1.d"
  s=$(sha256 <"$T/p/$1.d")
  printf 'created_at=%s\nencrypted_sha256=%s\ncount.public.athletes=3\n' "$(iso_ago "${2:-0}")" "$s" >"$T/p/$1.m"
  [ -z "${2:-}" ] || { ago_touch "$T/p/$1.d" "$2"; ago_touch "$T/p/$1.m" "$2"; }
}
sh_of() { sed -n 's/^encrypted_sha256=//p' "$T/p/$1.m"; }
# put NAME: the pair NAME exactly as a past push left it in the bucket (dump, its manifest copy), same dates
put() {
  s=$(sh_of "$1")
  rcl copyto "$T/p/$1.d" "$R/dumps/$s.dump.age" && rcl copyto "$T/p/$1.m" "$R/manifests/$s.manifest" || { echo "test setup failed: put $1"; exit 2; }
}
publish() { rcl copyto "$T/p/$1.m" "$R/trailskill-prod-latest.manifest"; } # the commit point names NAME
fresh_remote() { rcl delete "$R" >/dev/null 2>&1; disarm; }
ls_dir() { rcl lsf "$R/$1/" 2>/dev/null | sort | tr '\n' ' '; }
has_obj() { rcl lsf "$(dirname "$R/$1")/" 2>/dev/null | grep -Fxq "$(basename "$1")"; }
names() { for n in "$@"; do printf '%s ' "$(sh_of "$n")$EXT"; done | tr ' ' '\n' | sort | tr '\n' ' '; }
dumps_of() { EXT=.dump.age names "$@"; }
manifests_of() { EXT=.manifest names "$@"; }
push() { sh "$HERE/backup-r2.sh" push "$T/p/$1.d" "$T/p/$1.m" >"$T/out" 2>&1; }
# fetched DIR: the pair fetched into a fresh directory $T/f ($@ = extra fetch arguments)
fetch_into() { mkdir -p "$T/f"; find "$T/f" -type f -delete; sh "$HERE/backup-r2.sh" fetch "$T/f" "$@" >"$T/out" 2>&1; }
same() { cmp -s "$1" "$2"; }
same_remote() { rcl cat "$R/$2" 2>/dev/null | cmp -s - "$1"; } # same_remote LOCAL-FILE KEY

# --- 1. retention: the acceptance case -------------------------------------
# dumps of 1, 13, 15 and 30 days, 14 days kept: the new one, the 1-day and the 13-day stay with their manifests
mkpair d1 1; mkpair d13 13; mkpair d15 15; mkpair d30 30; mkpair n1
fresh_remote
put d1; put d13; put d15; put d30; publish d1
push n1; r=$?
eq "retention: push exits 0" 0 "$r"
eq "retention: the new, the 1-day and the 13-day dumps stay; 15 and 30 days are gone" "$(dumps_of d1 d13 n1)" "$(ls_dir dumps)"
eq "retention: their manifests stay in manifests/; those of the 15 and 30-day dumps are gone" "$(manifests_of d1 d13 n1)" "$(ls_dir manifests)"
same_remote "$T/p/n1.m" trailskill-prod-latest.manifest; r=$?
eq "retention: the commit point names the new copy" 0 "$r"
same_remote "$T/p/n1.m" "manifests/$(sh_of n1).manifest"; r=$?
eq "retention: the new manifest is also kept as manifests/<sha>.manifest" 0 "$r"
eq "retention: nothing else in the bucket" "dumps/ manifests/ trailskill-prod-latest.manifest " "$(rcl lsf "$R" | sort | tr '\n' ' ')"

# BACKUP_KEEP_DAYS changes the window
fresh_remote
put d1; put d13; put d15; publish d1
(export BACKUP_KEEP_DAYS=3; push n1); r=$?
eq "BACKUP_KEEP_DAYS=3: push exits 0" 0 "$r"
eq "BACKUP_KEEP_DAYS=3: only the 1-day and the new dump stay" "$(dumps_of d1 n1)" "$(ls_dir dumps)"
fresh_remote
put d1; put d13; put d15; put d30; publish d1
(export BACKUP_KEEP_DAYS=40; push n1); r=$?
eq "BACKUP_KEEP_DAYS=40: nothing is deleted" "$(dumps_of d1 d13 d15 d30 n1)" "$(ls_dir dumps)"

# a bad BACKUP_KEEP_DAYS fails before any call to the remote
for bad in abc 0 007 1.5 -1 ' 5' 99999; do
  fresh_remote; put d30; publish d30; rlog_reset
  (export BACKUP_KEEP_DAYS="$bad"; push n1); r=$?
  nonzero "BACKUP_KEEP_DAYS='$bad' is rejected" "$r"
  has "BACKUP_KEEP_DAYS='$bad': says why" "BACKUP_KEEP_DAYS"
  eq "BACKUP_KEEP_DAYS='$bad': the remote was not touched" 0 "$(rlog_calls)"
  eq "BACKUP_KEEP_DAYS='$bad': the old dump is still there" "$(dumps_of d30)" "$(ls_dir dumps)"
done

# --- 2. retention fail-safes ------------------------------------------------
# the dump the manifest names right now is never deleted, even when old: a second push publishes one of the two
# old copies after this cleanup started. The list is sorted by name, so L (the smaller sha) is deleted first;
# the hook runs just before that delete and publishes the manifest of H, the other one.
fresh_remote
put d15; put d30; publish d15
L=$(printf '%s\n%s\n' "$(sh_of d15)" "$(sh_of d30)" | sort | head -n 1)
if [ "$L" = "$(sh_of d15)" ]; then H=d30; LN=d15; else H=d15; LN=d30; fi
cat >"$T/fake/hook.sh" <<SH
$T/bin/rclone copyto "$T/p/$H.m" "$R/trailskill-prod-latest.manifest"
SH
arm before "deletefile:dumps/$L.dump.age"
push n1; r=$?
eq "live manifest: push exits 0" 0 "$r"
eq "live manifest: the old dump named by the manifest now is kept, the other old one is deleted" "$(dumps_of $H n1)" "$(ls_dir dumps)"
eq "live manifest: its manifest copy is kept too, the other is deleted" "$(manifests_of $H n1)" "$(ls_dir manifests)"
same_remote "$T/p/$H.m" trailskill-prod-latest.manifest; r=$?
eq "live manifest: the commit point is the one the second push published" 0 "$r"

# the new dump is never deleted, even when its own time is old (an old file pushed again)
mkpair o30 30
fresh_remote
put d15; publish d15
push o30; r=$?
eq "own dump older than the window: push exits 0" 0 "$r"
eq "own dump older than the window: it is kept, the other old dump is deleted" "$(dumps_of o30)" "$(ls_dir dumps)"
eq "own dump older than the window: its manifest copy is kept" "$(manifests_of o30)" "$(ls_dir manifests)"

# only the exact object names under dumps/ are touched: other names, folders and anything outside it are left alone
fresh_remote
put d1; put d30; publish d1
SAFE="dumps/notes.txt dumps/short.dump.age dumps/$(sh_of d30)x.dump.age dumps/$(printf '%064d' 0).DUMP.AGE manifests/readme.txt other/$(sh_of d30).dump.age trailskill-prod-old.manifest dumps/sub/$(sh_of d30).dump.age"
for f in $SAFE; do
  printf x >"$T/safe.x"; ago_touch "$T/safe.x" 40; rcl copyto "$T/safe.x" "$R/$f"
done
push n1; r=$?
eq "other names: push exits 0" 0 "$r"
has_obj "dumps/$(sh_of d30).dump.age" && fail "other names: the old dump with an exact name is deleted" "still there" || pass "other names: the old dump with an exact name is deleted"
for f in $SAFE; do
  has_obj "$f" && pass "other names: $f is left alone" || fail "other names: $f is left alone" "deleted"
done
has "other names: one warning that folders are left alone" "holds folders"

# a listing that fails is never taken as "nothing is old" nor as "everything is": nothing is deleted
for spec in "lsf:--min-age" "lsf:dumps/"; do
  fresh_remote
  put d1; put d30; publish d1
  arm fail "$spec"
  push n1; r=$?
  eq "listing fails ($spec): the push already committed, exit 0" 0 "$r"
  has "listing fails ($spec): warns that it cannot clean up" "could not list"
  eq "listing fails ($spec): nothing was deleted" "$(dumps_of d1 d30 n1)" "$(ls_dir dumps)"
  eq "listing fails ($spec): manifests were not deleted" "$(manifests_of d1 d30 n1)" "$(ls_dir manifests)"
  same_remote "$T/p/n1.m" trailskill-prod-latest.manifest; r=$?
  eq "listing fails ($spec): the new copy is published" 0 "$r"
done

# a failed delete is a warning; the manifest copy of that dump is then kept (the next run retries both)
fresh_remote
put d1; put d30; publish d1
arm fail "deletefile:dumps/"
push n1; r=$?
eq "delete fails: push exits 0" 0 "$r"
has "delete fails: warns" "could not delete old object"
eq "delete fails: the dump and its manifest copy are both kept" "$(dumps_of d1 d30 n1)|$(manifests_of d1 d30 n1)" "$(ls_dir dumps)|$(ls_dir manifests)"
disarm
mkpair n2
push n2; r=$?
eq "next push retries the delete" "$(dumps_of d1 n1 n2)|$(manifests_of d1 n1 n2)" "$(ls_dir dumps)|$(ls_dir manifests)"

# the manifest copy is part of the upload: if it fails nothing is published and the previous copy is untouched
fresh_remote
put d1; publish d1
arm fail "copyto:manifests/"
push n1; r=$?
nonzero "manifest copy upload fails: push fails" "$r"
has "manifest copy upload fails: says so" "upload failed"
same_remote "$T/p/d1.m" trailskill-prod-latest.manifest; r=$?
eq "manifest copy upload fails: the commit point is still the previous copy" 0 "$r"

# --- 3. fetch: latest as before, or a chosen copy by sha --------------------
fresh_remote
put d1; put d13; put n1; publish n1
fetch_into; r=$?
eq "fetch without sha: exit 0" 0 "$r"
same "$T/p/n1.m" "$T/f/trailskill-prod-latest.manifest"; r=$?
eq "fetch without sha: the latest manifest" 0 "$r"
same "$T/p/n1.d" "$T/f/trailskill-prod-latest.dump.age"; r=$?
eq "fetch without sha: the latest dump" 0 "$r"
eq "fetch without sha: only the two usual files" "trailskill-prod-latest.dump.age trailskill-prod-latest.manifest " "$(ls -A "$T/f" | sort | tr '\n' ' ')"
fetch_into "$(sh_of d13)"; r=$?
eq "fetch with sha: exit 0" 0 "$r"
same "$T/p/d13.m" "$T/f/trailskill-prod-latest.manifest"; r=$?
eq "fetch with sha: that copy's manifest, same file name as before" 0 "$r"
same "$T/p/d13.d" "$T/f/trailskill-prod-latest.dump.age"; r=$?
eq "fetch with sha: that copy's dump, same file name as before" 0 "$r"
eq "fetch with sha: only the two usual files" "trailskill-prod-latest.dump.age trailskill-prod-latest.manifest " "$(ls -A "$T/f" | sort | tr '\n' ' ')"
# a sha that is not 64 lowercase hex is refused before the remote is touched
for bad in abc "$(printf '%063d' 0)" "$(printf '%065d' 0)" "$(printf 'A%063d' 0)" ../../x "$(sh_of d13);rm" ""; do
  rlog_reset
  fetch_into "$bad"; r=$?
  nonzero "fetch with sha '$bad' is refused" "$r"
  eq "fetch with sha '$bad': the remote was not touched" 0 "$(rlog_calls)"
done
# a sha with no copy: clear failure, nothing left behind that looks like a copy
fetch_into "$(printf '%064d' 7)"; r=$?
nonzero "fetch with an unknown sha fails" "$r"
has "fetch with an unknown sha says so" "manifests/$(printf '%064d' 7).manifest"
# a dump kept without its manifest copy (as before this change) cannot be fetched by sha
rcl deletefile "$R/manifests/$(sh_of d13).manifest"
fetch_into "$(sh_of d13)"; r=$?
nonzero "fetch with a sha whose manifest copy is missing fails" "$r"
has "fetch with a sha whose manifest copy is missing says so" "manifests/$(sh_of d13).manifest"
# a corrupted dump is detected
put d13; cp "$T/p/d13.d" "$T/p/bad.d"; printf x >>"$T/p/bad.d"; rcl copyto "$T/p/bad.d" "$R/dumps/$(sh_of d13).dump.age"
fetch_into "$(sh_of d13)"; r=$?
nonzero "fetch with a sha whose dump does not match its checksum fails" "$r"
has "fetch with a sha whose dump does not match its checksum says so" "does not match"
# a manifest copy that names another dump is refused
put d13; rcl copyto "$T/p/d1.m" "$R/manifests/$(sh_of d13).manifest"
fetch_into "$(sh_of d13)"; r=$?
nonzero "fetch with a manifest copy that names another dump fails" "$r"
fetch_into a b; r=$?
nonzero "fetch with too many arguments fails" "$r"
has "fetch with too many arguments prints usage" "usage: backup-r2.sh"

# --- 4. restore-check.sh <identity|--freshness> [sha] -----------------------
FETCH='sh '"$HERE"'/backup-r2.sh "$0" "$@"'
rcf() { BACKUP_FETCH_CMD="$FETCH" TMPDIR="$T/rc-tmp" sh "$HERE/restore-check.sh" --freshness "$@" >"$T/out" 2>&1; }
fresh_remote
mkpair old5 5; mkpair cur
put old5; put cur; publish cur
rcf; r=$?
eq "freshness without sha: the latest copy passes as before" 0 "$r"
rcf "$(sh_of old5)"; r=$?
nonzero "freshness with sha: judges that copy (5 days old, over the 26 h limit)" "$r"
has "freshness with sha: says the copy is too old" "older than 26 h"
(export BACKUP_MAX_AGE_HOURS=200; rcf "$(sh_of old5)"); r=$?
eq "freshness with sha: passes when the limit allows that age" 0 "$r"
has "freshness with sha: reports the copy's creation time" "freshness OK: copy created at $(sed -n 's/^created_at=//p' "$T/p/old5.m")"
rcf "$(sh_of cur)"; r=$?
eq "freshness with the sha of the latest copy passes" 0 "$r"
for bad in abc "$(printf 'A%063d' 0)" ../x "$(printf '%065d' 0)"; do
  rlog_reset
  rcf "$bad"; r=$?
  nonzero "freshness with sha '$bad' is refused" "$r"
  has "freshness with sha '$bad': says the sha is invalid" "sha"
  eq "freshness with sha '$bad': the fetch command did not run" 0 "$(rlog_calls)"
done
rcf "$(printf '%064d' 7)"; r=$?
nonzero "freshness with an unknown sha fails" "$r"
# the contract with the fetch command: `fetch <dir>` without sha, `fetch <dir> <sha>` with it
cat >"$T/argv.sh" <<SH
echo "\$# \$1 \${3:-}" >$T/argv
exit 1
SH
SPY='sh '"$T"'/argv.sh "$0" "$@"'
printf 'key' >"$T/id.txt"
S=$(sh_of cur)
BACKUP_FETCH_CMD="$SPY" sh "$HERE/restore-check.sh" --freshness >"$T/out" 2>&1
eq "freshness without sha: the fetch command gets exactly: fetch <dir>" "2 fetch " "$(cat "$T/argv")"
BACKUP_FETCH_CMD="$SPY" sh "$HERE/restore-check.sh" --freshness "$S" >"$T/out" 2>&1
eq "freshness with sha: the fetch command gets fetch <dir> <sha>" "3 fetch $S" "$(cat "$T/argv")"
BACKUP_FETCH_CMD="$SPY" sh "$HERE/restore-check.sh" "$T/id.txt" "$S" >"$T/out" 2>&1
eq "identity mode with sha: the fetch command gets fetch <dir> <sha>" "3 fetch $S" "$(cat "$T/argv")"
BACKUP_FETCH_CMD="$SPY" sh "$HERE/restore-check.sh" "$T/id.txt" >"$T/out" 2>&1
eq "identity mode without sha: the fetch command gets exactly: fetch <dir>" "2 fetch " "$(cat "$T/argv")"
rm -f "$T/argv"
BACKUP_FETCH_CMD="$SPY" sh "$HERE/restore-check.sh" "$T/id.txt" "xyz" >"$T/out" 2>&1; r=$?
nonzero "identity mode with an invalid sha is refused" "$r"
eq "identity mode with an invalid sha: the fetch command did not run" "no" "$([ -e "$T/argv" ] && echo yes || echo no)"
# a fetch command that returns another copy than the one asked for is not accepted
FETCHWRONG='mkdir -p '"$T"'/w && cp '"$T"'/p/cur.d "$1"/trailskill-prod-latest.dump.age && cp '"$T"'/p/cur.m "$1"/trailskill-prod-latest.manifest'
BACKUP_FETCH_CMD="$FETCHWRONG" TMPDIR="$T/rc-tmp" sh "$HERE/restore-check.sh" --freshness "$(sh_of old5)" >"$T/out" 2>&1; r=$?
nonzero "freshness with sha: a fetch that returns another copy is refused" "$r"
has "freshness with sha: says it is not the requested copy" "not the requested copy"
eq "freshness: no files left in TMPDIR" 0 "$(ls -A "$T/rc-tmp" | wc -l | tr -d ' ')"

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL PASSED"; else echo "$FAILS FAILED"; exit 1; fi
