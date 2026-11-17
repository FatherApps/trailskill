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
  if [ "$(rclone cat "$obj" | sha256)" != "$sha" ]; then
    rclone deletefile "$obj" >/dev/null 2>&1 || true
    die "uploaded copy does not verify; previous copy untouched"
  fi

  # 3. commit point: publish the manifest, then read it back
  rclone copyto "$mf" "$R/$MANIFEST_KEY" || die "cannot publish the manifest; the previous copy is still the latest"
  rclone cat "$R/$MANIFEST_KEY" | cmp -s - "$mf" || die "the published manifest differs from the local one"

  # 4. cleanup: every older dump. A failure here is only a warning; the next run retries.
  if old=$(rclone lsf "$R/dumps/"); then
    echo "$old" | while IFS= read -r f; do
      [ -n "$f" ] && [ "$f" != "$sha.dump.age" ] || continue
      rclone deletefile "$R/dumps/$f" || warn "could not delete old object dumps/$f; the next run retries"
    done
  else
    warn "could not list dumps/ for cleanup; the next run retries"
  fi
  echo "pushed $sha.dump.age and the manifest to $R"
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
