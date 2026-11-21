# PROD backup and tested restore runbook (#1119)

- Issue: #1119, part of the PROD series (#1113 to #1120)
- Related: [PROD Supabase stack runbook](prod-supabase-runbook.md), [ADR 0002](../decisions/0002-backend-hosting-on-dokploy.md) and its 2026-11-16 and 2026-11-21 amendments, [`deploy/README.md`](../../deploy/README.md)
- Scripts: [`deploy/scripts/backup-prod.sh`](../../deploy/scripts/backup-prod.sh), [`deploy/scripts/restore-check.sh`](../../deploy/scripts/restore-check.sh), [`deploy/scripts/backup-r2.sh`](../../deploy/scripts/backup-r2.sh), tested by [`deploy/scripts/backup-prod.test.sh`](../../deploy/scripts/backup-prod.test.sh) and [`deploy/scripts/backup-r2.test.sh`](../../deploy/scripts/backup-r2.test.sh)

**Who runs this: Mario, by hand.** An agent only wrote the document and the scripts. It contains no secret values, addresses or account identifiers, and it must stay that way: put every value in the scheduler or the shell named in each step, never in the repository, a chat or a ticket.

**Scope (#1335, ADR 0002 amendment 2026-11-21).** The maintainer's rule is «a partir de ahora todo en la base de datos debe respaldarse para evitar que no se pierdan los datos de la prueba y de los usuarios». It covers every deployment whose `migrate.sh` runs against real data: today the `deploy` compose of the Dokploy project `TrailSkill` (the one the other documents call QA, which can hold real data of pilot testers), and PROD when it exists. Where this runbook says PROD, read «the deployment being backed up». QA is no longer excluded.

**Rule (#1119): «no se invita a familias reales hasta que este issue cierre».** This issue closes only when a backup has left the server and a restore from it has been tested and recorded in the [results table](#restore-test-results). **Backups do NOT block building PROD**: the stack, the deploy and the cut (#1115 to #1118, #1120) can be built meanwhile; only inviting real families waits.

## What it does

1. `backup-prod.sh` runs `pg_dump -Fc` of the PROD database, checks it with `pg_restore --list`, records a manifest (size, sha256, date, row counts of key tables, no row content), encrypts the dump with a **public** key, checksums the encrypted file and only then calls one push command.
2. **Retention is 14 days.** The push command keeps every copy of the last `BACKUP_KEEP_DAYS` days (default 14) and replaces nothing: the new copy is stored in full and published before anything older than the window is deleted. Any failed step exits non-zero before the push, so a failed run never leaves zero copies.
3. `restore-check.sh` fetches the latest copy (or an earlier one by its `sha`), verifies both checksums, decrypts it with the private key, restores it into a **throwaway** Postgres container (never PROD) and compares the row counts with the manifest.

Both scripts write the plain dump (`backup-prod.sh`) or the decrypted dump (`restore-check.sh`) into a private temp directory that a trap removes on exit, success or failure. **That does not survive `kill -9` or a power loss**: the file stays on disk. So:

- Point `TMPDIR` to a dedicated directory with mode 700, on an encrypted volume or on tmpfs (RAM), for the scheduler job and for Mario's shell.
- After a crash or a killed run, delete the leftovers by hand. On the backup host: `rm -rf "${TMPDIR:-/tmp}"/backup-prod.*`. On Mario's machine: `rm -rf "${TMPDIR:-/tmp}"/restore-check.*`.

`backup-prod.sh` has no bypass: it **refuses to run** (before dumping) when `BACKUP_AGE_RECIPIENT` is not set, whatever else is in the environment.

## Destination: Cloudflare R2

Decided by Mario on 2026-11-16: the off-server copy goes to a private [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket (S3 compatible), through [`deploy/scripts/backup-r2.sh`](../../deploy/scripts/backup-r2.sh). The two scripts stay destination-agnostic: the backup calls one command and the restore calls one command, both set by environment variables, and `backup-r2.sh` is the one used for both. The scheduler is still Mario's choice. Placeholders below: `<BUCKET>` and `<ACCOUNT_ENDPOINT>` (the S3 API endpoint of the R2 account, `https://<account id>.r2.cloudflarestorage.com`); never write real values in the repository.

### What Mario creates

1. A **private** R2 bucket (`<BUCKET>`). No public access, no custom domain.
2. An R2 API token limited to **that bucket only**, with **Object Read & Write** and no admin permissions. Its Access Key ID and Secret Access Key live only in the environment of the backup scheduler.
3. Optional: a second token with **Object Read only** on the same bucket, for the freshness job and for Mario's own shell during the restore test.

### Environment and commands

rclone reads the whole remote from the environment, so no secret is ever in a command line or in `ps`:

```sh
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT='<ACCOUNT_ENDPOINT>'
export RCLONE_CONFIG_R2_ACCESS_KEY_ID='<set in the scheduler, never in a file in the repository>'
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY='<set in the scheduler, never in a file in the repository>'
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true   # a bucket-scoped token cannot create buckets
export BACKUP_RCLONE_REMOTE='r2:<BUCKET>'
export BACKUP_PUSH_CMD='sh /path/to/deploy/scripts/backup-r2.sh "$0" "$@"'    # called as: push <encrypted> <manifest>
export BACKUP_FETCH_CMD='sh /path/to/deploy/scripts/backup-r2.sh "$0" "$@"'   # called as: fetch <dir>
```

Anything other than `push` or `fetch` is a usage error with a non-zero exit. Install rclone in the backup container (`apk add rclone`) and on Mario's machine (the restore test and the freshness job need it too).

Why rclone and not the aws CLI: one small binary available in alpine; the Cloudflare provider and a custom endpoint are built in; credentials come from the environment only, so nothing secret shows in `ps`.

### Atomic replace on S3 (no rename)

S3 has no rename, so `backup-r2.sh` replaces the previous copy in six steps. The remote holds the manifest at a fixed key (`trailskill-prod-latest.manifest`, the **commit point**), the encrypted copies at content-addressed keys (`dumps/<encrypted_sha256>.dump.age`) and a copy of each manifest (`manifests/<encrypted_sha256>.manifest`), so an earlier copy can be fetched by its `sha`:

1. Check locally that `encrypted_sha256` in the manifest is well formed and equals the sha256 of the encrypted file.
2. Upload the new copy to `dumps/<sha>.dump.age`. It never overwrites the previous copy, which has another name.
3. Read it back from the bucket and compare its sha256. If it does not verify, exit non-zero: the manifest is untouched. The object is not deleted (a re-push of the same pair has the same key as the live copy); the next successful push removes any stray object.
   Then upload the manifest to `manifests/<sha>.manifest` and read it back: any failure here exits non-zero before the commit point.
4. Publish the manifest (a single object put, atomic) and read it back.
5. List `dumps/` and check that the new dump is there. A second push running at the same time could have removed it: then upload the local encrypted file to the same key again and verify it by reading it back, and exit non-zero either way without deleting anything ("the new dump dumps/<name> was missing after its manifest was published ... it was uploaded again and verified, nothing was cleaned up: check that only one backup runs at a time"; if the upload again or its read-back fails, the message says the dump "is missing" instead). The repair only adds an object and never deletes one; if the manifest still names that dump, the pair is whole again, and the next successful push cleans up. Then delete the dumps older than `BACKUP_KEEP_DAYS` days (default 14; by the modification time rclone keeps with each object, which is the time the backup was made), each followed by its `manifests/<sha>.manifest`. It never deletes the dump just pushed nor the one the remote manifest names at that moment (read again before each delete), even when older. It deletes only objects directly under `dumps/` named exactly `<64 hex>.dump.age`; folders and any other name are left alone with one warning, and nothing is deleted when a listing fails. A failed delete is a warning with exit 0 (the new copy is already committed); the next run retries.
6. Read the remote manifest again, list `dumps/` and check that the dump the manifest names exists. If the listing works and the dump is absent, exit non-zero ("the published manifest names a missing dump"): run one backup by hand.

**Warning or error after the commit point.** From step 4 on the new dump was already verified by read-back and the manifest is published. A failure to *list* `dumps/` (step 5 or 6) or to *re-read* the manifest (step 6) cannot confirm or rule out a problem, so it is a warning with exit 0 (`could not list dumps/ to clean up`, `could not list dumps/ to confirm the published copy`, `could not re-read the remote manifest to confirm the published copy`): nothing is deleted without a successful listing, and the daily freshness job (`restore-check.sh --freshness`) independently checks the published pair. A **confirmed** problem stays an error with a non-zero exit: the listing works but the new dump is absent (step 5, after the repair described there), or the listing works and the dump the manifest names is absent (step 6).

**If the listing fails on every run, cleanup is skipped every time** and old dumps accumulate in the bucket, one warning per run (`could not list dumps/ to clean up`). Backups still succeed and the manifest still names a complete dump, so nothing alerts on the exit code. Watch for that warning repeating in the scheduler's log, and fix the access (for example a token without permission to list the bucket). One successful run then removes every dump past the retention.

A crash at any point leaves a consistent pair: until step 4 the manifest still names the previous, complete copy (a new object is just an orphan, removed by the next successful push); after step 4 it names the new, verified one. `fetch` reads the manifest first and then the exact dump it names, and checks that dump against `encrypted_sha256`. Retention is **14 days of copies** (see [Retention and earlier copies](#retention-and-earlier-copies)).

The generic requirements still apply to any other destination (and are what `backup-r2.sh` implements for R2): the push command must

1. upload the copy and the manifest under names that never overwrite the previous pair;
2. verify the stored copy by reading it back (size and sha256 against `encrypted_bytes` and `encrypted_sha256`);
3. only then make the new pair current, and exit non-zero leaving the previous pair untouched on any failure;
4. remove what it created on failure, except what may be the live copy: `backup-r2.sh` does not delete a dump that failed its read-back, because its key is content-addressed and a re-push of the same pair has the same key as the live copy. The next successful push removes any stray object.

A destination that can only rename (a plain directory) has a residual window between renaming the dump and the manifest: a crash there leaves a pair whose checksums do not match, which `restore-check.sh --freshness` reports. The reference shape for a local directory is the `push.sh` that [`backup-prod.test.sh`](../../deploy/scripts/backup-prod.test.sh) writes and runs. The tests also run `backup-r2.sh` against a throwaway S3 endpoint (`backup-prod.test.sh`, with a real backup) and run its retention, `fetch` by `sha` and `restore-check.sh <sha>` against another one without Postgres ([`backup-r2.test.sh`](../../deploy/scripts/backup-r2.test.sh)), including the bucket states a crash leaves at each step. A fake `rclone` placed in front of the real one in the test (no hook in the script) forces a failure at each step of the replace (upload, read-back failing or returning garbage, manifest publish, a cleanup delete) and runs an action between the publish and the cleanup, or between two deletes, to simulate a second push (including one that publishes a manifest naming a dump cleanup was about to delete); the suite checks that the previous pair stays intact and that the order cannot change unnoticed. Check the first real run by hand all the same (see the checklist).

### Lifecycle rules

- Optional: a rule that **aborts incomplete multipart uploads** (for example after 1 day).
- **Do NOT add an age-based delete rule** on `dumps/`, `manifests/` or the manifest: `backup-r2.sh` deletes old copies only after a new copy was stored, verified and published, so if the backups ever stop the last copies stay. A bucket rule would delete them anyway.
- If the bucket has versioning or object lock, it keeps extra copies. They are not needed; retention is the 14 days that `backup-r2.sh` keeps.

Credentials for the bucket live only in the environment of the scheduler that runs the backup (read and write) and in Mario's shell and the freshness job (read-only is enough). Never in the repository.

## Environment of the backup

| Variable | Value |
| --- | --- |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Connection to the PROD database (a role that can read every schema, such as `supabase_admin`). `PGPASSWORD` only in the scheduler's environment, never in a command line. |
| `BACKUP_AGE_RECIPIENT` | The age **public** key (`age1...`), see below. Required. |
| `BACKUP_PUSH_CMD` | The push command: the `backup-r2.sh` line above. Required. |
| `BACKUP_RCLONE_REMOTE`, `RCLONE_CONFIG_R2_*` | The bucket and the rclone remote, see [Destination](#environment-and-commands). Required. |
| `BACKUP_COUNT_TABLES` | Optional. Default: `auth.users public.organizations public.schools public.athletes public.school_memberships`. |
| `BACKUP_MIN_COUNTS` | Optional, space-separated `schema.table=N` (each table must be in `BACKUP_COUNT_TABLES`). The run fails, before pushing, if a table has fewer than N rows. Suggested once PROD has its first administrator: `auth.users=1 public.schools=1`. Mario sets the values. |

**All-zero guard (no bypass):** whatever the variables say, the run fails before encrypting or pushing when every key table has 0 rows, so an empty copy never replaces a good one. A comparison with the previous manifest is deliberately not done: the backup host would need to read the destination, and a legitimate shrink would block every later backup. `BACKUP_MIN_COUNTS` is the fixed floor instead.

The script needs `pg_dump` of at least the server's major version (17), `pg_restore` and `age` (row counts are read from the dump itself, so they match its snapshot). A simple way is a container such as `postgres:17-alpine` with `age` installed (`apk add age`), started on the network of the PROD database by the scheduler. The scheduler is Mario's choice.

## Schedule

Daily, at a quiet hour. The scheduler (Dokploy schedule, cron or other) is **Mario's choice**; its environment holds the variables above.

## Alerts

Both scripts fail loudly: a non-zero exit code and one `error: ...` line on stderr. The scheduler must turn a non-zero exit into a notification Mario actually sees; nobody should have to remember to read a log. Generic options, none chosen here: cron with `MAILTO`, the scheduler's own failure notification, or `<job> || <notify command>`. Connect this before the first real run and test it once with a deliberately failing job.

Schedule a **second daily job**, some hours after the backup, that runs:

```sh
sh deploy/scripts/restore-check.sh --freshness
```

with `BACKUP_FETCH_CMD` set (the `backup-r2.sh` line and the read-only token) and optionally `BACKUP_MAX_AGE_HOURS` (default 26). It needs no private key, no Docker and no `age`. It fails when the copy is older than the limit (the backup failed or stopped running, including a scheduler that never fired), when every key table in the manifest has 0 rows, when the manifest is unreadable, or when the stored file does not match its manifest checksum (for example a half-replaced pair). Route its failure to the same notification.

Schedule the freshness job **hours apart** from the backup. `fetch` reads the manifest and then the dump it names in two requests; if a push publishes a new manifest and deletes the old dump in between, the fetch fails with "the copy named by the manifest is missing" although the stored pair is healthy. That can only happen when the two jobs overlap, and a single rerun resolves it (there is no retry code).

### One backup at a time

Run **one** backup job: exactly one scheduled job, and if the host can run two (a manual run while the schedule fires), wrap the command in `flock` (for example `flock -n /var/lock/trailskill-backup.lock <backup command>`) so a second one exits instead of overlapping. The manual first-run check in the checklist must not overlap the scheduled run either. A push against another push is the one case the replace cannot make safe by itself: the guards in `backup-r2.sh` only turn it into a loud failure. They are:

- cleanup deletes only dumps older than `BACKUP_KEEP_DAYS` days (a newer dump, such as another push's not yet published upload, is kept), never the dump just pushed and never the dump the remote manifest names, which is read again before each delete;
- before cleaning up, push checks that its own dump still exists (if not, it uploads the dump again, verifies it and exits non-zero without cleaning up) and, at the end, that the dump the manifest names exists; when a listing succeeds and the dump is absent, it exits non-zero with "run one backup by hand". A listing or manifest read that merely fails after the manifest is published is a warning with exit 0, because the new dump was verified before the publish and the freshness job checks the pair;
- the cleanup also leaves alone, with one warning, anything under `dumps/` that is not exactly `<64 hex>.dump.age` or is a folder, so an object it does not recognise is never deleted; the next run retries what a failed delete left.

What remains: in a bad interleaving the bucket can be left with a manifest that names a missing dump. That is never silent: the push exits non-zero (or, if it could not list `dumps/` to check, warns), and the freshness job fails with "the copy named by the manifest is missing" until one backup is run by hand, alone.

### Retention and earlier copies

`backup-r2.sh push` keeps **14 days** of copies. Set `BACKUP_KEEP_DAYS` (digits, 1 to 9999) in the environment of the backup job to change it; leave it unset for 14. Anything older is deleted by the next successful push, except the copy the manifest names. An invalid value fails the push before anything is uploaded. Nothing else deletes copies: do not add a bucket lifecycle rule.

List the copies (read access is enough; the `RCLONE_CONFIG_R2_*` variables and `BACKUP_RCLONE_REMOTE` as above, the name of each file is its `sha`, the time is when the backup was made):

```sh
rclone lsf --format tp --separator ' ' "$BACKUP_RCLONE_REMOTE/manifests/"
```

To check or restore an earlier copy, pass its `sha` (the file name without `.manifest`, 64 lowercase hex) as the last argument. `restore-check.sh` passes it to the fetch command as `fetch <dir> <sha>`:

```sh
sh deploy/scripts/restore-check.sh /path/to/trailskill-backup-key.txt <sha>
BACKUP_MAX_AGE_HOURS=400 sh deploy/scripts/restore-check.sh --freshness <sha>   # manifest checks only; raise the age limit for an older copy
```

Without `sha` both behave as before (the latest copy). A `sha` with no copy, a manifest that names another dump, or a dump that does not match its checksum exits non-zero. Copies pushed before #1335 have no `manifests/<sha>.manifest` and cannot be fetched by `sha`; the latest copy always can.

## Encryption key

The copy is encrypted with [age](https://age-encryption.org). Reason: the key is one line, there is no keyring to manage, and the CLI is small. GPG is preinstalled almost everywhere but needs keyring handling that is easy to get wrong in an unattended job. With a **public** key the server can write backups but can never read them.

On Mario's own machine, not on the server:

```sh
age-keygen -o trailskill-backup-key.txt
```

It prints the public key (`age1...`): that is `BACKUP_AGE_RECIPIENT`. The file `trailskill-backup-key.txt` is the **private key**: keep it in the team's password manager and a second offline place, never on the server and never in the repository. **If it is lost, every backup is unreadable.**

## Restore test procedure

On Mario's machine (needs Docker and `age`), with the private key file and the fetch variable set:

```sh
# the RCLONE_CONFIG_R2_* variables (read-only token is enough), BACKUP_RCLONE_REMOTE and BACKUP_FETCH_CMD from above
sh deploy/scripts/restore-check.sh /path/to/trailskill-backup-key.txt
```

It starts `public.ecr.aws/supabase/postgres:17.11.0.006` (override with `BACKUP_RESTORE_IMAGE`, keep the same major as PROD) so the Supabase roles exist, restores, and prints the copy date, the size, expected against restored row counts and the elapsed time. It exits non-zero on any checksum or count mismatch. It removes the container and the decrypted files on exit.

Notes:

- `restore-check.sh` fails before decrypting if the copy is older than `BACKUP_MAX_AGE_HOURS` (default 26) or has 0 rows in every key table. Review the expected counts anyway.
- `DOCKER_HOST` must not point to another server: `restore-check.sh` runs the throwaway container, with the decrypted data, wherever `DOCKER_HOST` points.

Copy the output into the table below.

### Restore test results

| Date | Copy date | Size (encrypted) | auth.users | organizations | schools | athletes | school_memberships | Restore time | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _pending_ | | | | | | | | | |

### How often (proposal, Mario decides)

Not decided. Proposed: at first setup, after every major Postgres or Supabase upgrade of PROD, and monthly.

## When the backup fails

1. The previous copy in the bucket is still the latest good one: do not delete it. Confirm it with a restore test if you doubt it.
2. Read the scheduler's log. Typical causes: PROD database unreachable, `BACKUP_AGE_RECIPIENT` missing or not `age1...` (the script refuses before dumping), `pg_restore --list` rejecting the dump, or the push command failing. The new guards add: `every key table has 0 rows` and `below the minimum (BACKUP_MIN_COUNTS)` (the database looks empty or shrank: check it before anything else), and from the freshness job `older than 26 h` (the backup stopped running) or `checksum does not match` (the stored pair is half-replaced: run the backup again).
3. Fix the cause and run the same job once by hand. Repeat until it exits 0.
4. A failure that lasts more than one day while real families are on PROD is an incident: tell the maintainer.

## Checklist for closing #1119

- [ ] Private R2 bucket and the bucket-scoped API token (Object Read & Write) created; the variables above set in the scheduler (and a read-only token for the freshness job and the restore test).
- [ ] Key pair generated on Mario's machine; private key stored off the server.
- [ ] Daily job scheduled with a single runner (one job, or `flock`); first run exits 0 and the bucket holds the manifest, one object under `dumps/` and its copy under `manifests/`.
- [ ] Second run checked by hand, not while the scheduled job runs: both dumps are in `dumps/` (each with its `manifests/<sha>.manifest`), and the manifest names the newer one.
- [ ] Restore test done and recorded in the results table.
- [ ] Mario confirmed the restore frequency.
