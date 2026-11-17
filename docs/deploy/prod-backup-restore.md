# PROD backup and tested restore runbook (#1119)

- Issue: #1119, part of the PROD series (#1113 to #1120)
- Related: [PROD Supabase stack runbook](prod-supabase-runbook.md), [ADR 0002](../decisions/0002-backend-hosting-on-dokploy.md) and its 2026-11-16 amendment, [`deploy/README.md`](../../deploy/README.md)
- Scripts: [`deploy/scripts/backup-prod.sh`](../../deploy/scripts/backup-prod.sh), [`deploy/scripts/restore-check.sh`](../../deploy/scripts/restore-check.sh), tested by [`deploy/scripts/backup-prod.test.sh`](../../deploy/scripts/backup-prod.test.sh)

**Who runs this: Mario, by hand.** An agent only wrote the document and the scripts. It contains no secret values, addresses or account identifiers, and it must stay that way: put every value in the scheduler or the shell named in each step, never in the repository, a chat or a ticket.

**Rule (#1119): «no se invita a familias reales hasta que este issue cierre».** This issue closes only when a backup has left the server and a restore from it has been tested and recorded in the [results table](#restore-test-results). **Backups do NOT block building PROD**: the stack, the deploy and the cut (#1115 to #1118, #1120) can be built meanwhile; only inviting real families waits.

## What it does

1. `backup-prod.sh` runs `pg_dump -Fc` of the PROD database, checks it with `pg_restore --list`, records a manifest (size, sha256, date, row counts of key tables, no row content), encrypts the dump with a **public** key, checksums the encrypted file and only then calls one push command.
2. **Retention is only the latest copy.** The push command replaces the previous copy only after the new one is stored in full. Any failed step exits non-zero before the push, so a failed run never leaves zero copies.
3. `restore-check.sh` fetches the latest copy, verifies both checksums, decrypts it with the private key, restores it into a **throwaway** Postgres container (never PROD) and compares the row counts with the manifest.

No plaintext dump stays on disk after either script: both work in a private temp directory removed on exit. `backup-prod.sh` **refuses to run** (before dumping) when `BACKUP_AGE_RECIPIENT` is not set.

## Destination: pending Mario's choice

The off-server destination is **not decided**. The scripts do not know it: the backup calls one command and the restore calls one command, both set by environment variables. Everywhere below the destination is the literal placeholder `<DESTINO>`. Do not run the backup in PROD until Mario has chosen it and written both commands.

| Variable | What the command must guarantee |
| --- | --- |
| `BACKUP_PUSH_CMD` | Run as `sh -c "$BACKUP_PUSH_CMD" push <encrypted file> <manifest file>`, so `$1` and `$2` are the two paths. It copies both to `<DESTINO>` under the fixed names `trailskill-prod-latest.dump.age` and `trailskill-prod-latest.manifest` (the basenames it receives). It must store them under temporary names first and replace the previous pair only after both are stored, and it must exit non-zero on any failure leaving the previous pair untouched. |
| `BACKUP_FETCH_CMD` | Run as `sh -c "$BACKUP_FETCH_CMD" fetch <dir>`. It copies the two files from `<DESTINO>` into `<dir>` (same names) and exits non-zero on failure. |

Credentials for `<DESTINO>` live only in the environment of the scheduler that runs the backup, and in Mario's shell for the restore test. Never in the repository.

## Environment of the backup

| Variable | Value |
| --- | --- |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Connection to the PROD database (a role that can read every schema, such as `supabase_admin`). `PGPASSWORD` only in the scheduler's environment, never in a command line. |
| `BACKUP_AGE_RECIPIENT` | The age **public** key (`age1...`), see below. Required. |
| `BACKUP_PUSH_CMD` | The push command for `<DESTINO>`. Required. |
| `BACKUP_COUNT_TABLES` | Optional. Default: `auth.users public.organizations public.schools public.athletes public.school_memberships`. |
| `BACKUP_ALLOW_NO_KEY_FOR_TESTS` | **Never set in PROD.** It exists only so a test can skip encryption. |

The script needs `pg_dump` of at least the server's major version (17), `pg_restore` and `age` (row counts are read from the dump itself, so they match its snapshot). A simple way is a container such as `postgres:17-alpine` with `age` installed (`apk add age`), started on the network of the PROD database by the scheduler. The scheduler is Mario's choice.

## Schedule

Daily, at a quiet hour. The scheduler (Dokploy schedule, cron or other) is **Mario's choice**; its environment holds the variables above. Check each morning that the last run finished with exit code 0.

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
export BACKUP_FETCH_CMD='<command that copies the two files from <DESTINO> into "$1">'
sh deploy/scripts/restore-check.sh /path/to/trailskill-backup-key.txt
```

It starts `public.ecr.aws/supabase/postgres:17.11.0.006` (override with `BACKUP_RESTORE_IMAGE`, keep the same major as PROD) so the Supabase roles exist, restores, and prints the copy date, the size, expected against restored row counts and the elapsed time. It exits non-zero on any checksum or count mismatch. It removes the container and the decrypted files on exit.

Copy the output into the table below.

### Restore test results

| Date | Copy date | Size (encrypted) | auth.users | organizations | schools | athletes | school_memberships | Restore time | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _pending_ | | | | | | | | | |

### How often (proposal, Mario decides)

Not decided. Proposed: at first setup, after every major Postgres or Supabase upgrade of PROD, and monthly.

## When the backup fails

1. The previous copy at `<DESTINO>` is still the latest good one: do not delete it. Confirm it with a restore test if you doubt it.
2. Read the scheduler's log. Typical causes: PROD database unreachable, `BACKUP_AGE_RECIPIENT` missing or not `age1...` (the script refuses before dumping), `pg_restore --list` rejecting the dump, or the push command failing.
3. Fix the cause and run the same job once by hand. Repeat until it exits 0.
4. A failure that lasts more than one day while real families are on PROD is an incident: tell the maintainer.

## Checklist for closing #1119

- [ ] Mario chose `<DESTINO>` and wrote `BACKUP_PUSH_CMD` and `BACKUP_FETCH_CMD`.
- [ ] Key pair generated on Mario's machine; private key stored off the server.
- [ ] Daily job scheduled; first run exits 0 and the copy is at `<DESTINO>`.
- [ ] Restore test done and recorded in the results table.
- [ ] Mario confirmed the restore frequency.
