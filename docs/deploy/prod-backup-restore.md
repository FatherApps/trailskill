# PROD backup and tested restore runbook (#1119)

- Issue: #1119, part of the PROD series (#1113 to #1120)
- Related: [PROD Supabase stack runbook](prod-supabase-runbook.md), [ADR 0002](../decisions/0002-backend-hosting-on-dokploy.md) and its 2026-11-16 amendment, [`deploy/README.md`](../../deploy/README.md)
- Scripts: [`deploy/scripts/backup-prod.sh`](../../deploy/scripts/backup-prod.sh), [`deploy/scripts/restore-check.sh`](../../deploy/scripts/restore-check.sh), [`deploy/scripts/backup-r2.sh`](../../deploy/scripts/backup-r2.sh), tested by [`deploy/scripts/backup-prod.test.sh`](../../deploy/scripts/backup-prod.test.sh)

**Who runs this: Mario, by hand.** An agent only wrote the document and the scripts. It contains no secret values, addresses or account identifiers, and it must stay that way: put every value in the scheduler or the shell named in each step, never in the repository, a chat or a ticket.

**Rule (#1119): «no se invita a familias reales hasta que este issue cierre».** This issue closes only when a backup has left the server and a restore from it has been tested and recorded in the [results table](#restore-test-results). **Backups do NOT block building PROD**: the stack, the deploy and the cut (#1115 to #1118, #1120) can be built meanwhile; only inviting real families waits.

## What it does

1. `backup-prod.sh` runs `pg_dump -Fc` of the PROD database, checks it with `pg_restore --list`, records a manifest (size, sha256, date, row counts of key tables, no row content), encrypts the dump with a **public** key, checksums the encrypted file and only then calls one push command.
2. **Retention is only the latest copy.** The push command replaces the previous copy only after the new one is stored in full. Any failed step exits non-zero before the push, so a failed run never leaves zero copies.
3. `restore-check.sh` fetches the latest copy, verifies both checksums, decrypts it with the private key, restores it into a **throwaway** Postgres container (never PROD) and compares the row counts with the manifest.

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

S3 has no rename, so `backup-r2.sh` replaces the previous copy in five steps. The remote holds only the manifest at a fixed key (`trailskill-prod-latest.manifest`, the **commit point**) and the encrypted copy at a content-addressed key (`dumps/<encrypted_sha256>.dump.age`):

1. Check locally that `encrypted_sha256` in the manifest is well formed and equals the sha256 of the encrypted file.
2. Upload the new copy to `dumps/<sha>.dump.age`. It never overwrites the previous copy, which has another name.
3. Read it back from the bucket and compare its sha256. If it does not verify, delete the new object and exit non-zero: the previous copy is untouched.
4. Publish the manifest (a single object put, atomic) and read it back.
5. Only now delete every other object under `dumps/`. A failure here is a warning with exit 0 (the new copy is already committed); the next run retries.

A crash at any point leaves a consistent pair: until step 4 the manifest still names the previous, complete copy (a new object is just an orphan, removed by the next successful push); after step 4 it names the new, verified one. `fetch` reads the manifest first and then the exact dump it names, and checks that dump against `encrypted_sha256`. Retention stays **the latest copy only**.

The generic requirements still apply to any other destination (and are what `backup-r2.sh` implements for R2): the push command must

1. upload the copy and the manifest under names that never overwrite the previous pair;
2. verify the stored copy by reading it back (size and sha256 against `encrypted_bytes` and `encrypted_sha256`);
3. only then make the new pair current, and exit non-zero leaving the previous pair untouched on any failure;
4. remove what it created on failure.

A destination that can only rename (a plain directory) has a residual window between renaming the dump and the manifest: a crash there leaves a pair whose checksums do not match, which `restore-check.sh --freshness` reports. The reference shape for a local directory is the `push.sh` that [`backup-prod.test.sh`](../../deploy/scripts/backup-prod.test.sh) writes and runs. The tests also run `backup-r2.sh` against a throwaway S3 endpoint, including the bucket states a crash leaves at each step. They cannot inject a failed verification into the script without a test hook, so that branch is covered by reading the code only; check the first real run by hand (see the checklist).

### Lifecycle rules

- Optional: a rule that **aborts incomplete multipart uploads** (for example after 1 day).
- **Do NOT add an age-based delete rule** on `dumps/` or on the manifest: if the backups ever stop, it would delete the only copy.
- If the bucket has versioning or object lock, it keeps extra copies. They are not needed; retention stays the latest copy.

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
- [ ] Daily job scheduled; first run exits 0 and the bucket holds the manifest plus exactly one object under `dumps/`.
- [ ] Second run checked by hand: still exactly one object under `dumps/`, and the manifest names it.
- [ ] Restore test done and recorded in the results table.
- [ ] Mario confirmed the restore frequency.
