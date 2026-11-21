#!/bin/sh
# Push and fetch the PROD backup pair to an S3-compatible bucket (Cloudflare R2) with rclone (#1158, #1335).
# Use it as both commands of the backup and the restore check:
#   BACKUP_PUSH_CMD='sh /path/backup-r2.sh "$0" "$@"'    (called as: push <encrypted file> <manifest>)
#   BACKUP_FETCH_CMD='sh /path/backup-r2.sh "$0" "$@"'   (called as: fetch <dir> [sha])
#
# Env: BACKUP_RCLONE_REMOTE  required, the bucket as an rclone path, e.g. r2:<BUCKET>
#      RCLONE_CONFIG_R2_*    the rclone remote itself, from the environment only (type, provider, endpoint,
#                            access key id, secret access key), so no secret is ever in a command line.
#      BACKUP_KEEP_DAYS      push only: how many days of copies to keep (digits, 1 to 9999, default 14).
#
# Layout (no other objects):
#   <remote>/trailskill-prod-latest.manifest   fixed key, the commit point: names the latest copy
#   <remote>/dumps/<encrypted_sha256>.dump.age content-addressed dumps, one per push
#   <remote>/manifests/<encrypted_sha256>.manifest  the manifest of each dump, to restore an earlier copy
# S3 has no rename, so a push is: upload the new dump and its manifest copy, verify the dump by reading it back,
# publish the commit-point manifest, and only then delete what is older than BACKUP_KEEP_DAYS days.
# A crash at any point leaves the manifest naming a complete dump; the next push finishes the cleanup.
# Retention deletes only objects directly under dumps/ named exactly <64 hex>.dump.age (and the manifests/ copy
# of the same sha) whose time is older than BACKUP_KEEP_DAYS days. It never deletes the dump just pushed nor the
# one the remote manifest names right now (even when older), it deletes nothing when a listing fails, and any
# other name, folder or object outside dumps/ is left alone. There is no bucket lifecycle rule: this is the only
# thing that deletes.
# `fetch <dir>` brings the latest copy; `fetch <dir> <sha>` brings that earlier copy (sha: 64 lowercase hex).
# Both write trailskill-prod-latest.dump.age and trailskill-prod-latest.manifest into <dir>.
# Run ONE backup at a time: nothing here makes two simultaneous pushes safe. The guards turn an overlap into a
# loud failure (push fails when the manifest ends up naming a missing dump), but the manifest is re-read just
# before each delete, so a second push publishing in that gap can still lose its dump. #1336 adds the lock that
# closes this race; until it runs, never start two backups at once. A listing or manifest read that
# merely fails after the commit point is a warning, not an error (see cleanup).
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
USAGE="usage: backup-r2.sh push <encrypted file> <manifest> | fetch <dir> [sha]"

[ -n "${BACKUP_RCLONE_REMOTE:-}" ] || die "BACKUP_RCLONE_REMOTE is required (for example r2:<BUCKET>)"
R=${BACKUP_RCLONE_REMOTE%/}
MANIFEST_KEY=trailskill-prod-latest.manifest

# dumps/ as "<time>|<name>" lines; the time is the source mtime, which rclone stores with the object
dump_list() { rclone lsf --format tp --separator '|' "$R/dumps/" </dev/null; }
# dump_time NAME: succeeds when NAME is in $list (the time is not used any more)
dump_time() {
  while IFS='|' read -r t f; do
    [ "$f" = "$1" ] && return 0
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

# After the manifest is published (the commit point) the new dump was already verified by read-back, nothing is
# deleted without a successful listing, and the daily restore-check.sh --freshness job independently checks the
# published pair. So a failure to LIST or to re-read the manifest here is a warning (exit 0) and cleanup is skipped;
# only a CONFIRMED problem (the listing works and a dump is absent) is an error.
# 4-5. our dump must still be there (a concurrent push may have cleaned it up; then upload it again, verify it and
# fail without cleaning up), then delete the dumps older than BACKUP_KEEP_DAYS days (the age filter is rclone's,
# on the time stored with the object), never ours and never the one the remote manifest names right now (a second
# push may have published it since), and each one's manifests/ copy with it.
cleanup() {
  list=$(dump_list) || { warn "could not list dumps/ to clean up; nothing was deleted, the next run retries"; return 0; }
  dump_time "$name" >/dev/null || {
    # Repair: only adds an object (same content-addressed key), never deletes; the push still fails.
    if rclone copyto "$enc" "$obj" && [ "$(rclone cat "$obj" | sha256)" = "$sha" ]; then
      die "the new dump dumps/$name was missing after its manifest was published (a second push at the same time?); it was uploaded again and verified, nothing was cleaned up: check that only one backup runs at a time"
    fi
    die "the new dump dumps/$name is missing after its manifest was published (a second push running at the same time?); nothing was cleaned up: run one backup by hand, only one at a time"
  }
  old=$(rclone lsf --min-age "${KEEP}d" "$R/dumps/" </dev/null) || { warn "could not list the old dumps in dumps/; nothing was deleted, the next run retries"; return 0; }
  nested=0
  odd=0
  while IFS= read -r f; do
    [ -n "$f" ] && [ "$f" != "$name" ] || continue
    case $f in */) nested=1; continue ;; esac
    s=${f%.dump.age}
    { [ "$s.dump.age" = "$f" ] && valid_sha "$s"; } || { odd=1; continue; }
    live=$(remote_sha) || { warn "cannot re-read the remote manifest; leaving the old dumps, the next run retries"; break; }
    [ "$f" != "$live.dump.age" ] || continue
    rclone deletefile "$R/dumps/$f" </dev/null || { warn "could not delete old object dumps/$f; the next run retries"; continue; }
    rclone delete --include "/$s.manifest" "$R/manifests/" </dev/null || warn "deleted dumps/$f but could not delete manifests/$s.manifest; delete it by hand"
  done <<LIST_END
$old
LIST_END
  [ "$nested" -eq 0 ] || warn "dumps/ holds folders; they are left alone"
  [ "$odd" -eq 0 ] || warn "dumps/ holds objects with other names; they are left alone"
}

# 6. the published manifest must name a dump that exists, whatever ran at the same time. If the manifest or the
# listing cannot be read the problem is neither confirmed nor ruled out: warn, the freshness job checks the pair.
confirm() {
  if live=$(remote_sha); then
    if list=$(dump_list); then
      dump_time "$live.dump.age" >/dev/null ||
        die "the published manifest names a missing dump (dumps/$live.dump.age); run one backup by hand, only one at a time"
    else
      warn "could not list dumps/ to confirm the published copy; the freshness job will check the pair"
    fi
  else
    warn "could not re-read the remote manifest to confirm the published copy; the freshness job will check the pair"
  fi
}

push() {
  [ $# -eq 2 ] || die "$USAGE"
  enc=$1
  mf=$2
  [ -s "$enc" ] && [ -s "$mf" ] || die "the encrypted copy or the manifest is missing or empty"
  sha=$(mfval "$mf" encrypted_sha256)
  valid_sha "$sha" || die "manifest encrypted_sha256 is missing or malformed"
  [ "$(sha256 <"$enc")" = "$sha" ] || die "the manifest does not describe the encrypted file"
  KEEP=${BACKUP_KEEP_DAYS:-14}
  case $KEEP in '' | 0* | *[!0-9]*) die "BACKUP_KEEP_DAYS must be a whole number of days, 1 or more (no leading zero)" ;; esac
  [ "${#KEEP}" -le 4 ] || die "BACKUP_KEEP_DAYS must be at most 9999"
  name=$sha.dump.age
  obj=$R/dumps/$name

  # 1-2. new dump under its own key, then read it back and compare (a failed read hashes differently)
  rclone copyto "$enc" "$obj" || die "upload failed; previous copy untouched"
  # Never delete $obj here: the key is content-addressed, so on a re-push it may be the live copy. A stray
  # object is removed by a later push only once it is older than BACKUP_KEEP_DAYS days (like any other dump).
  [ "$(rclone cat "$obj" | sha256)" = "$sha" ] || die "uploaded copy does not verify; previous copy untouched"
  # its manifest under its own key too, before the commit point, so a published copy can always be fetched by sha
  rclone copyto "$mf" "$R/manifests/$sha.manifest" || die "upload failed (manifest copy); previous copy untouched"
  rclone cat "$R/manifests/$sha.manifest" | cmp -s - "$mf" || die "the manifest copy does not verify; previous copy untouched"

  # 3. commit point: publish the manifest, then read it back
  rclone copyto "$mf" "$R/$MANIFEST_KEY" || die "cannot publish the manifest; the previous copy is still the latest"
  rclone cat "$R/$MANIFEST_KEY" | cmp -s - "$mf" || die "the published manifest differs from the local one"

  cleanup
  confirm
  echo "pushed $name and the manifest to $R"
}

fetch() {
  [ $# -ge 1 ] && [ $# -le 2 ] || die "$USAGE"
  dir=$1
  want=${2:-}
  [ -z "$want" ] && [ $# -eq 1 ] || valid_sha "$want" || die "sha must be 64 lowercase hex characters"
  [ -d "$dir" ] || die "$dir is not a directory"
  if [ -n "$want" ]; then
    mkey=manifests/$want.manifest
  else
    mkey=$MANIFEST_KEY
  fi
  rclone copyto "$R/$mkey" "$dir/$MANIFEST_KEY" || true
  [ -s "$dir/$MANIFEST_KEY" ] || die "cannot fetch the manifest from $R ($mkey)"
  sha=$(mfval "$dir/$MANIFEST_KEY" encrypted_sha256)
  valid_sha "$sha" || die "manifest encrypted_sha256 is missing or malformed"
  [ -z "$want" ] || [ "$sha" = "$want" ] || die "the manifest $mkey names another copy ($sha)"
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
