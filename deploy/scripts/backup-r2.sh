#!/bin/sh
# Push and fetch the PROD backup pair to an S3-compatible bucket (Cloudflare R2) with rclone (#1158).
# Use it as both commands of the backup and the restore check:
#   BACKUP_PUSH_CMD='sh /path/backup-r2.sh "$0" "$@"'    (called as: push <encrypted file> <manifest>)
#   BACKUP_FETCH_CMD='sh /path/backup-r2.sh "$0" "$@"'   (called as: fetch <dir>)
#
# Env: BACKUP_RCLONE_REMOTE  required, the bucket as an rclone path, e.g. r2:<BUCKET>
#      RCLONE_CONFIG_R2_*    the rclone remote itself, from the environment only (type, provider, endpoint,
#                            access key id, secret access key), so no secret is ever in a command line.
#
# Layout (no other objects): <remote>/trailskill-prod-latest.manifest (fixed key, the commit point) and
# <remote>/dumps/<encrypted_sha256>.dump.age (content-addressed). S3 has no rename, so the replace is:
# upload the new dump, verify it by reading it back, publish the manifest, and only then delete older dumps.
# A crash at any point leaves the manifest naming a complete dump; stray dumps are removed by the next push.
# Run ONE backup at a time. The guards (only dumps strictly older than the new one are deleted, never the one
# the manifest names, and push fails when the manifest ends up naming a missing dump) turn an overlap into a
# loud failure; they do not make two simultaneous pushes safe.
set -eu
set -f
umask 077
LC_ALL=C
export LC_ALL

die() { echo "error: $*" >&2; exit 1; }
warn() { echo "warning: $*" >&2; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi | cut -d' ' -f1; }
mfval() { sed -n "s/^$2=//p" "$1" | head -n 1; }
valid_sha() { echo "$1" | grep -Eq '^[0-9a-f]{64}$'; }
USAGE="usage: backup-r2.sh push <encrypted file> <manifest> | fetch <dir>"

[ -n "${BACKUP_RCLONE_REMOTE:-}" ] || die "BACKUP_RCLONE_REMOTE is required (for example r2:<BUCKET>)"
R=${BACKUP_RCLONE_REMOTE%/}
MANIFEST_KEY=trailskill-prod-latest.manifest

# dumps/ as "<time>|<name>" lines; the time is the source mtime, which rclone stores with the object
dump_list() { rclone lsf --format tp --separator '|' "$R/dumps/" </dev/null; }
# tnum TIME: TIME ("YYYY-MM-DD hh:mm:ss") as digits, or failure when it is not that
tnum() { echo "$1" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$' && echo "$1" | tr -d ' :-'; }
# dump_time NAME: NAME's time as digits from $list; fails when NAME is not listed or its time is unreadable
dump_time() {
  while IFS='|' read -r t f; do
    [ "$f" = "$1" ] && tnum "$t" && return 0
  done <<LIST_END
$list
LIST_END
  return 1
}
# the dump the remote manifest names right now
remote_sha() {
  s=$(rclone cat "$R/$MANIFEST_KEY" </dev/null | sed -n 's/^encrypted_sha256=//p' | head -n 1) || return 1
  valid_sha "$s" && echo "$s"
}

push() {
  [ $# -eq 2 ] || die "$USAGE"
  enc=$1
  mf=$2
  [ -s "$enc" ] && [ -s "$mf" ] || die "the encrypted copy or the manifest is missing or empty"
  sha=$(mfval "$mf" encrypted_sha256)
  valid_sha "$sha" || die "manifest encrypted_sha256 is missing or malformed"
  [ "$(sha256 <"$enc")" = "$sha" ] || die "the manifest does not describe the encrypted file"
  obj=$R/dumps/$sha.dump.age

  # 1-2. new dump under its own key, then read it back and compare (a failed read hashes differently)
  rclone copyto "$enc" "$obj" || die "upload failed; previous copy untouched"
  # Never delete $obj here: the key is content-addressed, so on a re-push it may be the live copy. A stray
  # object is removed by the next successful push.
  [ "$(rclone cat "$obj" | sha256)" = "$sha" ] || die "uploaded copy does not verify; previous copy untouched"

  # 3. commit point: publish the manifest, then read it back
  rclone copyto "$mf" "$R/$MANIFEST_KEY" || die "cannot publish the manifest; the previous copy is still the latest"
  rclone cat "$R/$MANIFEST_KEY" | cmp -s - "$mf" || die "the published manifest differs from the local one"

  # 4. our dump must still be there: a concurrent push may have cleaned it up. Then do not clean up.
  name=$sha.dump.age
  list=$(dump_list) || die "cannot list dumps/ to check the new copy; the manifest is published: run one backup by hand"
  own=$(dump_time "$name") || die "the new dump dumps/$name is missing after its manifest was published (a second push running at the same time?); nothing was cleaned up: run one backup by hand, only one at a time"

  # 5. cleanup: dumps strictly older than ours, never the one the remote manifest names right now (a second
  # push may have published it since). A failure here is only a warning; the next run retries.
  nested=0
  while IFS='|' read -r t f; do
    [ -n "$f" ] && [ "$f" != "$name" ] || continue
    case $f in */) nested=1; continue ;; esac
    t=$(tnum "$t") && [ "$t" -lt "$own" ] || continue
    live=$(remote_sha) || { warn "cannot re-read the remote manifest; leaving the old dumps, the next run retries"; break; }
    [ "$f" != "$live.dump.age" ] || continue
    rclone deletefile "$R/dumps/$f" </dev/null || warn "could not delete old object dumps/$f; the next run retries"
  done <<LIST_END
$list
LIST_END
  [ "$nested" -eq 0 ] || warn "dumps/ holds folders; they are left alone"

  # 6. the published manifest must name a dump that exists, whatever ran at the same time
  live=$(remote_sha) || die "cannot re-read the remote manifest after the cleanup: run one backup by hand"
  list=$(dump_list) && dump_time "$live.dump.age" >/dev/null ||
    die "the published manifest names a missing dump (dumps/$live.dump.age); run one backup by hand, only one at a time"
  echo "pushed $name and the manifest to $R"
}

fetch() {
  [ $# -eq 1 ] || die "$USAGE"
  dir=$1
  [ -d "$dir" ] || die "$dir is not a directory"
  rclone copyto "$R/$MANIFEST_KEY" "$dir/$MANIFEST_KEY" || true
  [ -s "$dir/$MANIFEST_KEY" ] || die "cannot fetch the manifest from $R"
  sha=$(mfval "$dir/$MANIFEST_KEY" encrypted_sha256)
  valid_sha "$sha" || die "manifest encrypted_sha256 is missing or malformed"
  # copyto can exit 0 when the source object does not exist, so check the result itself.
  rclone copyto "$R/dumps/$sha.dump.age" "$dir/trailskill-prod-latest.dump.age" || true
  [ -s "$dir/trailskill-prod-latest.dump.age" ] && [ "$(sha256 <"$dir/trailskill-prod-latest.dump.age")" = "$sha" ] ||
    die "the copy named by the manifest is missing or does not match its checksum (dumps/$sha.dump.age)"
}

cmd=${1:-}
[ $# -eq 0 ] || shift
case $cmd in
  push) push "$@" ;;
  fetch) fetch "$@" ;;
  *) die "$USAGE" ;;
esac
