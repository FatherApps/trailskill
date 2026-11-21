# deploy/

What Dokploy deploys from this repository: migrations plus PowerSync. Design and exposure rules: [ADR 0002](../docs/decisions/0002-backend-hosting-on-dokploy.md), including its [2026-11-16 amendment](../docs/decisions/0002-backend-hosting-on-dokploy.md#amendment-2026-11-16-qa-and-prod-environments-email-provider-and-backups).

## Environments

There are two backend environments on the same Dokploy server. They run the same `compose.yaml` and scripts, and they share no data and no secrets.

| | QA | PROD |
| --- | --- | --- |
| Status | Exists today (the deployment this document describes). | **Not built yet.** Runbooks and compose: issues #1115 to #1118. |
| Dokploy project | `TrailSkill` | A separate project, «Swimcro PROD». |
| Deploys from | Every push to `main` (see [Continuous deployment](#continuous-deployment)). | A release tag `vX.Y.Z` that the maintainer starts. A push to `main` never changes PROD. The mechanism is settled in #1116. |
| App hostnames | `trailskill-api`, `trailskill-sync` | `swimcro-api`, `swimcro-sync` |
| Mailpit (`trailskill-mail`) and Studio | Mailpit stays in the stack, behind basic authentication; Studio is internal only. | Neither is deployed or published. |
| Email | Resend over SMTP, sender `Swimcro <no-reply@send.tuls.app>` | The same provider and sender; the maintainer first confirms which sending domain is verified in Resend (ADR 0002). |
| Demo seed (`APPLY_SEED`) | May be applied by the maintainer, see [Demo data](#demo-data). The data is not only demo: testers of the pilot may have registered real accounts. | Never: `APPLY_SEED` stays `false`. |
| Secrets | Its own | Its own, never the same value as QA's. |
| Backups | Must be backed up: it may hold real data from pilot testers (ADR 0002, amendment 2026-11-21, #1335). `backup-r2.sh` keeps 14 days of copies in R2. `migrate` takes a verified copy before applying any pending migration and the `backup` service takes one daily at 08:30 UTC (#1336, see [Backups](#backups)); the [runbook](../docs/deploy/prod-backup-restore.md) covers restoring. | The same rule, and also a gate before inviting real families: #1119. |
| TLS to the origin | Cloudflare Tunnel ends TLS at the edge, then plain HTTP to the Dokploy proxy on port 80. Dokploy domains keep HTTPS off ([Public and internal](#public-and-internal)). | The same route. The hostnames are free and the tunnel can route them ([#1113 report](../docs/deploy/prod-step0-readonly-checks.md)). |

The Dokploy deploy webhook hostname (`trailskill-deploy`) is shared by both. Capacity of the server for two stacks: it fits at the ADR 0002 minimum, with little margin. Mario decided (Q6) that PROD goes on the same server, in its own project «Swimcro PROD»; if room is needed, QA gets memory and CPU limits (step planned in #1116), and capacity is watched with thresholds (#1115). See the [#1113 report](../docs/deploy/prod-step0-readonly-checks.md).

Unless a section says otherwise, everything below describes QA, the deployment that exists. A push to `main` runs on it, and it may hold real data of pilot testers, so every change that touches the data is backed up first. PROD differs only as this table says; the Supabase stack of PROD is set up by hand following the [PROD Supabase stack runbook](../docs/deploy/prod-supabase-runbook.md) (#1115); the compose, domains and deploy by tag are #1116 to #1118 and are not written here yet. Secret values are set only by the maintainer in the Dokploy and EAS interfaces, never in this repository.

## What is here and what is not

| In this folder | Purpose |
| --- | --- |
| `compose.yaml` | The Compose service Dokploy deploys: `migrate`, `functions` (delivers the Edge Functions), `functions-ok`, `backup`, `powersync-storage`, `powersync`. |
| `compose.local.yaml`, `local.env`, `powersync/powersync.local.yaml` | Run PowerSync on a developer's machine next to `supabase start`. Dokploy does not use them. See [Local development](../docs/local-development.md). |
| `scripts/migrate.sh` | Takes a verified backup when migrations are pending, creates `powersync_role`, applies `supabase/migrations/*.sql`, schedules the `pg_cron` jobs, optional seed. |
| `backup/crontab` | The daily backup schedule of the `backup` service (08:30 UTC). |
| `scripts/backup-prod.sh`, `scripts/backup-r2.sh`, `scripts/restore-check.sh` | The backup, its upload to R2 and the restore check, see [Backups](#backups). |
| `powersync/powersync.yaml` | PowerSync service config. |
| `scripts/functions-bundle.sh` | Builds the `results-import`, `school-console-invite-coach`, `accounts-delete-account` and `accounts-deletion-worker` Edge Function bundles and puts them in the Supabase stack's functions volume. The `functions` service runs it on every deploy, see [Edge Functions](#edge-functions). |
| `scripts/functions-egress.sh` | Checks that the Edge Functions runtime's network can reach the providers' external sources over HTTPS. |
| `scripts/*.test.sh` | Local tests, see [Tests](#tests). |

Not here: the **Supabase** stack (including Mailpit and the email template) of each environment. It is set up once in Dokploy and is not versioned in this repository. Changes to it are made in Dokploy and deployed by hand; continuous deployment covers only this compose, which also delivers the Edge Functions code into the functions folder of that stack (the `functions` service).

## One-time setup in Dokploy

QA: organization `fatherApps`, project `TrailSkill`. (PROD gets its own project, see [Environments](#environments).)

1. **Supabase**, from the Dokploy Supabase template. The template's default public `sslip.io` domain was removed: the stack has no public domain of its own (see [Public and internal](#public-and-internal)).
   - The database is only on the stack's default network (`<supabase app name>_default`). `migrate` and `powersync` join that network; put its name in `SUPABASE_NETWORK` and use `db` as `SUPABASE_DB_HOST`.
   - Two services were added to the stack's compose in Dokploy:
     - `mailpit` (`axllent/mailpit:v1.22.3`): test SMTP on port 1025. **QA only.** Since 2026-11-15 Auth sends the sign-in code through Resend (confirmed by the maintainer; the SMTP host is a redacted Dokploy variable this repository does not show), so sign-in codes no longer reach Mailpit. It stays in the QA stack, not used by Auth, and PROD does not have it. Its environment is set by the maintainer on the `mailpit` service of that compose in Dokploy; values never go in the repository:
       - `MP_SMTP_ALLOWED_RECIPIENTS` = `^demo-[a-z]+@example\.test$`: Mailpit accepts email only for `demo-*@example.test` and rejects every other recipient (`550`). This restriction does not limit who can sign in, because Auth no longer sends through Mailpit.
       - `MP_UI_AUTH`: the basic authentication credential for the web UI and API.
       - Domain `trailskill-mail.tuls.app` on port `8025`, HTTPS off (TLS mode: see [Public and internal](#public-and-internal)).
       - Alternative without publishing it: leave out `MP_UI_AUTH` and the domain. The maintainer reads the code in the internal Mailpit and passes it on, so every demo sign-in depends on the maintainer.
     - `mail-templates` (`busybox:1.37` running `httpd -f -p 8080 -h /www`): serves `../files/mail-templates` read-only. The email template is a Dokploy file mount, `mail-templates/otp.html`, and it contains `{{ .Token }}`.
   - Environment added to the Auth service in that compose:
     - `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK` and `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` = `http://mail-templates:8080/otp.html`
     - `GOTRUE_MAILER_SUBJECTS_MAGIC_LINK` and `GOTRUE_MAILER_SUBJECTS_CONFIRMATION` = `Tu código de Swimcro`
     - `GOTRUE_MAILER_OTP_LENGTH` is not set: GoTrue's default is 6, which is the code length we use.
   - Stack environment changed:
     - SMTP variables (host, port, user, password): they point to Resend. The maintainer sets them in the Dokploy interface and this repository shows none of them. The sender is `Swimcro <no-reply@send.tuls.app>`. They replaced the earlier test values (`mailpit`, port 1025, empty user and password).
     - `ENABLE_EMAIL_AUTOCONFIRM=false`, `ENABLE_PHONE_SIGNUP=false`, `ENABLE_ANONYMOUS_USERS=false`.
     - `SUPABASE_HOST`, `SUPABASE_PUBLIC_URL` and `API_EXTERNAL_URL` = the public API hostname. `API_EXTERNAL_URL` is also the JWT issuer.
2. **This Compose service**: source GitHub, this repository, branch `main`, compose path `deploy/compose.yaml`. Set the environment variables below. Add a domain for the `powersync` service on port `8080` with HTTPS **off** (see [Public and internal](#public-and-internal)). Then turn on continuous deployment, see [Continuous deployment](#continuous-deployment).

## Continuous deployment

**QA:** on. Dokploy's GitHub App sends push events to `https://trailskill-deploy.tuls.app/api/deploy/github`, and Dokploy verifies the GitHub signature. The `deploy` compose has auto deploy on for branch `main` with watch paths `deploy/**`, `supabase/**`, `powersync/**` and `src/core/sport/catalogs.ts` (the one file from `src/` that `results-import` ships), so app-only changes do not redeploy it.

What a deploy does: it re-clones `main` and recreates the services. `migrate` runs first (pending migrations, grants, optional seed). `powersync` starts only if `migrate` exits 0, so a failing migration leaves PowerSync stopped until a fix is merged. `powersync` is built from the pinned image with `powersync/sync-config.yaml` copied in, so a deploy that changes only that file recreates `powersync`, which logs `Sync config updated` and applies the new Sync Streams without a manual restart. An unchanged file reuses the cached image and leaves `powersync` running.

Then `functions` runs, after `migrate` (so it never delivers code for a migration that failed), and delivers the Edge Functions into the functions folder of the Supabase stack, see [Edge Functions](#edge-functions). `functions-ok` runs after it, so a failed delivery makes `docker compose up` exit non-zero and the Dokploy deployment shows red. `powersync` depends on neither, so a failed delivery never stops PowerSync.

**PROD:** not on `main`. It deploys only from a release tag that the maintainer starts, so a push to `main` never changes PROD. The mechanism and its rollback (go back to the previous tag) are settled in #1116.

Accepted risk (maintainer, 2026-10-25): `main` has no GitHub ruleset (Free plan), only the pre-push hook and the PR flow. Any push to `main` runs on the QA server. When the organization moves to GitHub Team, add the ruleset and CODEOWNERS for `deploy/**` and `supabase/**`.

Manual deploy is still available (Deploy button in Dokploy).

To turn it off: switch off Auto Deploy on the `deploy` compose in Dokploy, or block the `trailskill-deploy.tuls.app` route in Cloudflare.

## Rolling back

- **Code or config regression:** revert the merge on `main` (a PR with `git revert`). Continuous deployment deploys the reverted state.
- **Migrations are forward-only.** Never edit or delete an applied migration; fix it with a new migration. Reverting a commit does not undo an applied migration.
- **Failed `migrate`:** PowerSync stays stopped. Read the `migrate` logs in Dokploy, merge a fix (or a revert), and it redeploys.
- **Data loss or corruption:** restore from a database backup. Every deployment that holds real data is backed up, QA included (ADR 0002, amendment 2026-11-21): copies are kept for 14 days and an earlier copy is restored by its `sha` (see the [runbook](../docs/deploy/prod-backup-restore.md)). `migrate` takes a verified copy before every migration and the `backup` service one every day (see [Backups](#backups)); take one by hand before any other change to the data. For PROD, an off-server backup and a tested restore are a gate before real families are invited (#1119).
- **PROD:** go back to the previous release tag (procedure in #1116). Migrations already applied stay: fix forward.

## Environment variables of `compose.yaml`

Set them in the environment of this Compose service in Dokploy, once per environment. Every secret value is its own in each environment and is never copied from QA to PROD.

| Variable | Required / default | Purpose | Value comes from |
| --- | --- | --- | --- |
| `SUPABASE_NETWORK` | required | Name of the Supabase stack's default Docker network (external) | Supabase app in Dokploy (`<app name>_default`) |
| `SUPABASE_DB_HOST` | required | Supabase database host on that network (`db`) | Supabase service in Dokploy |
| `SUPABASE_DB_PORT` | `5432` | Database port | Supabase service |
| `SUPABASE_DB_USER` | `postgres` | User that applies migrations (must be able to create roles) | Supabase service |
| `SUPABASE_DB_PASSWORD` | required | Password of that user | Supabase service environment |
| `SUPABASE_DB_NAME` | `postgres` | Database name | Supabase service |
| `POWERSYNC_DB_PASSWORD` | required | Password given to `powersync_role` (sent only when the role is created or the password changes) | Generate; only used here |
| `POWERSYNC_STORAGE_PASSWORD` | required | Password of the PowerSync bucket storage Postgres | Generate; only used here |
| `SUPABASE_JWT_SECRET` | required | HS256 secret PowerSync uses to verify Supabase tokens | Supabase service (`JWT_SECRET`) |
| `PS_SYNC_CONFIG_PATH` | `/sync/sync-config.yaml` | Sync config file inside the container | See [Sync config](#sync-config) |
| `SUPABASE_FUNCTIONS_DIR` | required | Host folder that the Supabase stack's `functions` service mounts at `/home/deno/functions` (the `functions` service of this compose mounts the same folder and writes the four functions into it). Local mode sets a placeholder in `local.env`, because it does not run the delivery | `volumes` of the Supabase `functions` service in Dokploy (`docker inspect`); the real path is set only in Dokploy, never in the repository |
| `APPLY_SEED` | `false` | `true` applies the demo data in `supabase/seed.sql` once (see [Demo data](#demo-data)) | Set by hand |
| `BACKUP_BEFORE_MIGRATE` | **required**, `required` or `off` | `required`: `migrate` must take a verified backup before it applies a pending migration (see [Backups](#backups)). `off` skips it and exists only for a database without real data (`local.env` sets it). Any other value, or a missing one, fails before anything runs. | Set by hand |
| `BACKUP_AGE_RECIPIENT` | needed by every real backup | Public age key (`age1...`) the copy is encrypted with | Maintainer, see the [runbook](../docs/deploy/prod-backup-restore.md#encryption-key) |
| `BACKUP_RCLONE_REMOTE`, `RCLONE_CONFIG_R2_TYPE`, `RCLONE_CONFIG_R2_PROVIDER`, `RCLONE_CONFIG_R2_ENDPOINT`, `RCLONE_CONFIG_R2_ACCESS_KEY_ID`, `RCLONE_CONFIG_R2_SECRET_ACCESS_KEY` | needed by every real backup | The R2 bucket (`r2:<BUCKET>`) and its rclone remote; the token needs Object Read & Write on that bucket only | Cloudflare R2, see the [runbook](../docs/deploy/prod-backup-restore.md#destination-cloudflare-r2) |
| `RCLONE_CONFIG_R2_NO_CHECK_BUCKET` | `true` | A bucket-scoped token cannot create buckets | Leave the default |
| `BACKUP_PGUSER`, `BACKUP_PGPASSWORD` | the `SUPABASE_DB_*` user and password | Role the backup connects as; it must be able to dump every schema. Set both or neither | Supabase service |
| `BACKUP_MIN_COUNTS` | empty | Space-separated `schema.table=N`: a backup with fewer rows in a key table is refused | Maintainer, for example `auth.users=1 public.schools=1` |
| `BACKUP_KEEP_DAYS` | `14` | Days of copies kept in R2 | Leave the default |
| `BACKUP_LOCK_WAIT_SECONDS` | `600` | How long `migrate` waits for the lock the daily backup may hold before it exits 1 without applying anything | Leave the default |
| `DOKPLOY_NETWORK` | `dokploy-network` | Traefik network, used only so `powersync` can be routed | Change only for tests |

Dokploy writes these variables to `deploy/.env` in the clone, so each service mounts only what it needs: `powersync` mounts `deploy/powersync` (`powersync/sync-config.yaml` is copied into its image; the build context is `powersync/` only), `migrate` gets `deploy/scripts` and `supabase/`, `backup` gets `deploy/scripts` and `deploy/backup/crontab`, and `functions` gets `deploy/scripts`, `supabase/` and `src/core/sport/catalogs.ts`, all read-only, plus the functions folder, writable. Never mount the repository root.

Passwords go inside connection URIs, so they must be URL-safe: letters and digits only (for example `openssl rand -hex 24`).

## Credentials

- Each environment has its own credentials, never shared. They are set only by the maintainer, in the Dokploy interface (backend) and the EAS interface (the app's public values); agents never see them.
- Credentials live only in each service's environment in Dokploy. Never in the repo, never in `.env` files that are committed.
- The app receives only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_POWERSYNC_URL`.
- The `service_role` key and the database passwords never go to the app.

### Identity number key (Vault)

**Do this first, in each environment with its own key, before the migration of issue #799 is applied** (on a server where it is already applied, before the first official results import). The identity number of an athlete (issue #799) is stored encrypted with a key kept in Supabase Vault under the name `athlete_identity_key`. The migration does not create it and the key is never committed: create it once on the server, as a privileged role (Supabase Studio SQL editor, or `psql` as `postgres`):

```sql
select vault.create_secret('<output of: openssl rand -base64 32>', 'athlete_identity_key');
```

- Generate the key with `openssl rand -base64 32` and keep a copy in the team's password manager; losing it makes the stored numbers unreadable.
- Without the secret, saving a number fails with `athlete identity key is not configured` (SQLSTATE `TS001`) and registration goes on without the number.
- Rotating the key means decrypting every row with the old key and encrypting it again with the new one in a single transaction, then updating the secret. Do not just replace the secret: the rows already stored could no longer be decrypted.

## Public and internal

**How public traffic reaches the origin** (read-only checks of #1113, 2026-11-16, [#1113 report](../docs/deploy/prod-step0-readonly-checks.md)). Every public hostname enters through a Cloudflare Tunnel with no published origin ports. Cloudflare ends TLS at its edge, and `cloudflared` then talks plain HTTP to the Dokploy proxy on port 80. The zone SSL mode is Full, not Flexible, and it takes no part in the tunnel hop. With HTTPS **on** in a Dokploy domain, the Dokploy proxy redirects to HTTPS while `cloudflared` enters over HTTP, which makes a redirect loop: that is why the Dokploy domains below keep HTTPS **off**.

Public hostnames (zone `tuls.app`):

| Hostname | Goes to | Notes |
| --- | --- | --- |
| `trailskill-api.tuls.app` | Supabase `api-gw`, port 8000 | The tunnel rule only allows paths matching `^/(auth\|rest\|storage\|functions\|realtime)/v1/`. Studio (the gateway root) is not reachable (404). |
| `trailskill-sync.tuls.app` | `powersync`, port 8080 | |
| `trailskill-mail.tuls.app` | Supabase stack `mailpit`, port 8025 | QA only. Mailpit basic authentication (`MP_UI_AUTH`). Auth no longer sends through it (Resend), so it receives no sign-in code. |
| `trailskill-deploy.tuls.app` | Dokploy panel | Only paths matching `^/api/deploy/` (the GitHub webhook). Everything else is 404. Shared by QA and PROD. |
| `swimcro-api.tuls.app` | PROD Supabase `api-gw`, port 8000 | **PROD, planned (#1116), not live.** Same path restriction as `trailskill-api`. Route and TLS: as for QA; the hostname is free and the tunnel can route it. |
| `swimcro-sync.tuls.app` | PROD `powersync`, port 8080 | **PROD, planned (#1116), not live.** Route and TLS: as for QA; the hostname is free and the tunnel can route it. |

Internal only: Dokploy panel, Studio, Postgres, PowerSync storage. In QA, Mailpit is public only behind its basic authentication; PROD publishes no Mailpit and no Studio. Details in ADR 0002.

To add or change a public hostname (as done for QA; the new PROD hostnames follow the same route): add a Dokploy domain (HTTPS off), then add a tunnel rule and a proxied CNAME to the tunnel. Insert the rule before the tunnel's final 404 rule. The same tunnel serves other sites, so never replace or reorder its existing rules. Use single-level names (`name.tuls.app`): Cloudflare's free certificate does not cover `a.b.tuls.app`.

## How migrations run

On every deploy of `main`, `migrate` runs once before PowerSync starts:

1. Creates `powersync_role` (`LOGIN REPLICATION BYPASSRLS`) with `POWERSYNC_DB_PASSWORD`. If it exists, only the attributes are updated; the password is set again only when logging in with `POWERSYNC_DB_PASSWORD` fails (so rotating the variable works, and the password is not sent on every deploy).
2. **Backup first.** When `BACKUP_BEFORE_MIGRATE=required`, at least one migration is pending and `supabase_migrations.schema_migrations` already has rows, it runs `backup-prod.sh` (reason `pre-migration`) and applies nothing until that exits 0. See [Backups](#backups).
3. Applies `supabase/migrations/*.sql` in name order. Names must be `<digits>_<name>.sql`. Each file runs in one transaction together with its record in `supabase_migrations.schema_migrations`, so a failure leaves nothing partial. Applied versions are skipped.

   **Migration versions must be unique.** `migrate` records and checks only the version (the digits before the first `_`), not the full name. A second file with a version that is already applied is skipped without an error, so its SQL never runs. Before merging a migration, check that no file in `supabase/migrations/` and no open pull request uses its timestamp (this happened once and the file had to be renamed).
4. Grants `powersync_role` read access (`SELECT`) on `public`, now and for future tables.
5. Schedules the daily family-timing jobs by calling `app.schedule_family_timing_jobs()`. It does nothing (and logs `scheduled jobs: 0`) while `pg_cron` is not installed. A scheduling failure never fails the deploy: it logs `WARN scheduled jobs failed: SQLSTATE ...` and the deploy and PowerSync continue. See [Scheduled jobs (pg_cron)](#scheduled-jobs-pg_cron).
6. With `APPLY_SEED=true` only (the value must be exactly `true` or `false`), applies `supabase/seed.sql` once (recorded by path and hash in `supabase_migrations.seed_files`; see [Demo data](#demo-data)).

If anything fails, `migrate` exits non-zero and PowerSync does not start: the deploy fails and PowerSync stays stopped until a fix is merged (see [Rolling back](#rolling-back)).

## Backups

Every deployment that holds real data is backed up (ADR 0002, amendment 2026-11-21). The scripts and the restore are in the [runbook](../docs/deploy/prod-backup-restore.md); this is how the deploy uses them.

- **Before migrating.** `migrate` runs `backup-prod.sh` with `BACKUP_REASON=pre-migration` only when `BACKUP_BEFORE_MIGRATE=required`, a migration is pending and `schema_migrations` already has rows (a first deploy has nothing to lose). «Verified» means the script's own checks: `pg_restore --list`, the row counts of the dump, the guard against 0 rows and `BACKUP_MIN_COUNTS`, and the sha read back from R2. **If any of that fails, `migrate` exits 1 before applying the first migration, PowerSync does not start and the deploy fails in Dokploy.** Nothing was changed in the database: fix the cause (the `migrate` log says which check failed) and redeploy. The failed-deploy notification in Dokploy is what tells the maintainer.
- **Daily.** The `backup` service runs `busybox crond -f` with [`backup/crontab`](backup/crontab): `backup-prod.sh` (reason `daily`) at 08:30 UTC (03:30 Bogotá). A failure is logged as `error: ...` in the service logs; Dokploy does not notify on it, so the daily freshness check (`restore-check.sh --freshness`, next issue of the series) is what catches a backup that stopped.
- **One at a time.** Both use the lock file on the named volume `backup-lock`, mounted in both services (`flock`). `migrate` waits up to `BACKUP_LOCK_WAIT_SECONDS` (600) for it and, if it cannot get it, exits 1 without applying anything. The daily job waits up to 30 minutes and then gives up until the next day. This closes the race between two pushes described in the runbook.
- **No plaintext on disk.** `TMPDIR` is a `tmpfs` with mode 700 in both services, so the plain dump lives in memory only and goes with the container.
- **Local.** `local.env` sets `BACKUP_BEFORE_MIGRATE=off` and `compose.local.yaml` leaves `backup` out unless the `backup` profile is enabled, so nothing needs R2 locally.
- **Before merging a change to `deploy/**`.** The merge deploys by itself and `BACKUP_BEFORE_MIGRATE` is required: set `BACKUP_BEFORE_MIGRATE=required` and the copy variables above in Dokploy, and turn on the failed-deploy notification, first. Without them the deploy fails on purpose.

PowerSync logs replication errors (`Publication 'powersync' does not exist`) until the foundations migration creates the `powersync` publication.

## Scheduled jobs (pg_cron)

Two daily jobs run inside the database, through `pg_cron`:

| Job | Schedule (UTC) | Runs | If it does not run |
| --- | --- | --- | --- |
| `family-timing-purge-deleted` | `17 4 * * *` | `select app.purge_family_timing_measurements()` | Times a family deleted are not removed after 30 days, which [`docs/release/data-safety.md`](../docs/release/data-safety.md) promises. |
| `family-timing-expire-transfers` | `27 4 * * *` | `select app.expire_family_timing_transfers()` | Unanswered "send to another family" requests stay `pending`, although `expires_at` already closes them functionally. |

The first migrations scheduled them only if `pg_cron` already existed when they ran, and applied migrations are never run again, so enabling `pg_cron` later scheduled nothing. Now every deploy calls `app.schedule_family_timing_jobs()` (step 4 of [How migrations run](#how-migrations-run)). It schedules both jobs when `pg_cron` is installed and does nothing otherwise. If `cron.schedule` is refused, it logs `WARN scheduled jobs failed: SQLSTATE ...` (the code only, never the message), schedules nothing and returns 0: the deploy and PowerSync continue, and the jobs stay unscheduled until the cause is fixed and a deploy runs again. `cron.schedule` replaces a job with the same name, so repeated deploys keep one job per name.

**Observed locally** with `supabase start` (Postgres 17): `pg_cron` 1.6.4 is available but not installed, it is in `shared_preload_libraries`, and `cron.database_name` is `postgres`. Do not assume the production image matches: check it with the maintainer checklist below.

**Check it locally.** With `supabase start` running (the database tests do this inside a rolled-back transaction):

```sh
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "create extension if not exists pg_cron"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select app.schedule_family_timing_jobs();"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select jobname, schedule, active from cron.job order by jobname;"
```

Undo it locally:

```sh
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select cron.unschedule(jobname) from cron.job where jobname like 'family-timing-%'; drop extension pg_cron;"
```

**Maintainer checklist.** Every step is a **Maintainer action** on production: it needs explicit authorization, and this repository never runs it.

1. **Maintainer action.** On the production database: `select name, installed_version from pg_available_extensions where name = 'pg_cron';`, `show shared_preload_libraries;` and `show cron.database_name;`.
2. **Maintainer action.** If `pg_cron` is not in `shared_preload_libraries` or `cron.database_name` points to another database, change the Supabase stack configuration in Dokploy and restart the database (short outage, do it outside hours).
3. **Maintainer action.** With a role that can, in the app database: `create extension if not exists pg_cron;`.
4. **Maintainer action.** Run the next deploy of `main`, or run `select app.schedule_family_timing_jobs();` once. The `migrate` log must say `scheduled jobs: 2`. If it shows `WARN scheduled jobs failed`, check that the migrate role can use `cron.schedule` (for example `select has_function_privilege(current_user, 'cron.schedule(text,text,text)', 'execute');`) and repeat this step.
5. **Maintainer action.** Check `select jobname, schedule, active, username from cron.job order by jobname;`: both jobs are there and `username` is a role that can execute the functions.
6. **Maintainer action.** The next day, `select jobname, status, return_message from cron.job_run_details order by start_time desc limit 5;` shows `succeeded`.
7. **Maintainer action (optional backlog).** `select app.expire_family_timing_transfers();` and `select app.purge_family_timing_measurements();`. The latter irreversibly deletes the times deleted more than 30 days ago: confirm first.

Rollback: `select cron.unschedule('family-timing-purge-deleted'); select cron.unschedule('family-timing-expire-transfers');`. The next deploy schedules them again while `pg_cron` stays installed; to stop for good, `drop extension pg_cron;`.

## Edge Functions

The Supabase stack from the Dokploy template already runs the Edge Functions runtime (the `functions` service, `edge-runtime`), and the API gateway routes `/functions/v1/` to it. **This compose adds no second runtime.** What this repository provides is the way the code of its four functions, `supabase/functions/results-import`, `supabase/functions/school-console-invite-coach`, `supabase/functions/accounts-delete-account` and `supabase/functions/accounts-deletion-worker`, gets into the folder that runtime reads. The `functions` service of this compose does it on every deploy, after `migrate` (see [What the `functions` service does](#what-the-functions-service-does)); the rest of the stack is still not touched by continuous deployment.

**Four functions, one delivery.** `functions-bundle.sh` delivers the functions in its explicit `FUNCTIONS` list: `results-import`, `school-console-invite-coach` (coach invitations, `verify_jwt = true` in `supabase/config.toml`), `accounts-delete-account` (an account deletion request, `verify_jwt = true`) and `accounts-deletion-worker` (the daily deletion worker, #1244). `accounts-deletion-worker` has `verify_jwt = false` in `supabase/config.toml`: `pg_cron` calls it through `pg_net`, which has no user token, and the handler authenticates the call with a shared secret. Validation and every `deno check` run for all the functions before anything is swapped in, so a failure there, in any function, delivers nothing. The final swap is then done per function (see below), so it is not all-or-nothing. Only `results-import` imports from `src/`, so only it gets a `_vendor`. The invitation function and the two account functions send email through Resend (`https://api.resend.com/emails`), so the egress check below includes `api.resend.com`, which `functions-egress.sh` already detects.

**Storage deletion queue (#1233).** `accounts-deletion-worker` also drains `public.storage_deletion_queue` and sweeps orphan photos in the same daily run, so there is no new function, job or secret: the schedule is the `accounts-deletion-worker` job (`pg_cron` → `pg_net`, 04:37 UTC) and the Vault secrets of [Account deletion](../docs/deploy/prod-supabase-runbook.md#account-deletion-worker-1244); the function deletes through the Storage API with the service role it already has. Optional env vars of the functions service: `STORAGE_ORPHAN_GRACE_HOURS` (default 24) and `STORAGE_ORPHAN_SWEEP` (`report`, the default, only counts and logs the orphan photos; `delete` deletes them: the first production run stays in `report` until the maintainer has checked the count). To check it ran: the worker's response (read it in `net._http_response`; it is not logged) has a `storage` object, `select count(*) from public.storage_deletion_queue;` goes to zero and `select max(attempts) from public.storage_deletion_queue;` stays 0. Details and the first-run checks: [runbook](../docs/deploy/prod-supabase-runbook.md#storage-deletion-queue-drain-and-orphan-photo-sweep-1233).

**Imports between functions.** `accounts-delete-account` imports `../school-console-invite-coach/resendSender.ts`, and `accounts-deletion-worker` imports `../accounts-delete-account/{adapters,emailTexts,mailer,port}.ts`. The script stages all the copies side by side in `<functions-volume-dir>/.staging/<function>`, so `deno check` resolves those imports to the new copies of the same delivery, never to what the volume already holds (a first delivery, or an older or broken sibling, changes nothing in the result). A function that imports from a sibling that is not in `FUNCTIONS` is refused with `FAIL` before anything in the volume changes: at runtime that sibling would exist only if it was already published.

### What the `functions` service does

On every deploy of this compose (a push to `main` that touches a watched path, or the Deploy button) the one-shot `functions` service runs `sh /repo/deploy/scripts/functions-bundle.sh /functions` in the `denoland/deno:2.1.4` image, the same Deno as the Edge Functions runtime (`edge-runtime` v1.74.0). So no Docker socket is mounted and `deno check` runs inside the container, which needs access to npm and jsr through the `default` network, the only one it joins.

- **Mounts:** `deploy/scripts`, `supabase/` and `src/core/sport/catalogs.ts` read-only, so the script finds its `ROOT` as on a developer's machine, and `${SUPABASE_FUNCTIONS_DIR}` mounted at `/functions`, the only writable one.
- **No database, no secret:** it receives no `PG*`, `SUPABASE_DB_*`, JWT or key variable. It reads the repository and writes the four function folders, nothing else.
- **Order:** it starts after `migrate` exits 0 (`depends_on: service_completed_successfully`), so a failed migration never gets code that needs it. `functions-ok` (a `busybox` that runs `true`) depends on `functions` completing successfully: when the delivery fails, `docker compose up` exits non-zero and Dokploy marks the deployment as failed. `powersync` depends on neither, so it keeps running (or starting) whatever happens to the delivery.
- **All or nothing per check:** the script checks every function (`deno check`) before it replaces any, so a failure leaves the folder as it was and the old bundles keep serving. The swap itself is per function (two renames) and an interrupted run recovers its `.old` on the next one, as before. A function whose copy is identical to the published one is not replaced: the log says `SKIP: <function> unchanged, not replaced`, and a deploy that changes nothing in `supabase/functions/` or `catalogs.ts` changes no file of the folder.
- **What to read in the log of `functions`** (Dokploy, the `deploy` compose): `PASS: deno check <function> (<n> modules, index.ts included)` for each function, then `DONE: <dir>/<function> updated (...)` or `SKIP: <function> unchanged, not replaced`. A `FAIL:` line means nothing was delivered.
- **No restart:** the edge-runtime workers load the new files when the next worker starts, in about a minute. A worker with constant traffic keeps serving the old code until its timeout. If you need it right away, restart the `functions` service of the **Supabase** stack in Dokploy (not this compose's).
- **Local mode** does not run it: `compose.local.yaml` gives `functions` and `functions-ok` the profile `dokploy-only`, which nobody turns on, and `local.env` has a placeholder for `SUPABASE_FUNCTIONS_DIR` because Compose reads required variables of every service, also of those that do not run.

**Why not GitHub Actions over SSH or the Dokploy webhook.** The first needs a GitHub secret that can enter a shared server and has no order with `migrate`; the second needs a Dokploy API token that reaches every project, and still needs this service to do the work. This one needs no new secret, SSH, Docker socket or CI.

**First setup and first deploy.** The change touches `deploy/**`, so it deploys itself on merge and fails without these, done by the maintainer in Dokploy before the merge: (1) set `SUPABASE_FUNCTIONS_DIR` in the environment of the `deploy` compose; (2) add `src/core/sport/catalogs.ts` to its watch paths; (3) take a `tar` copy of the functions folder before the first automatic run. After the first deploy, read the `functions` log (`PASS` and `DONE` for each function) and run the `curl` of step 7. Things to confirm on that first deploy: Dokploy shows the deployment red when `compose up` exits non-zero while other services stay up; the owner of the files and SELinux on the bind mount (the container writes in the folder the runtime reads); an npm or jsr outage fails the delivery and the old bundles keep serving; and an `edge-runtime` upgrade means raising the pinned Deno in the script and in the service image.

### What goes into the bundle

`sh deploy/scripts/functions-bundle.sh <functions-volume-dir>` builds `<functions-volume-dir>/results-import`, `<functions-volume-dir>/school-console-invite-coach`, `<functions-volume-dir>/accounts-delete-account` and `<functions-volume-dir>/accounts-deletion-worker`, each with:

- everything in `supabase/functions/<function>/` except the `__tests__` folders;
- for `results-import` only (the one function that imports it), `_vendor/catalogs.ts`: a copy of `src/core/sport/catalogs.ts`. The function imports that file through relative paths (`../../../src/core/sport/catalogs.ts` from the function root, `../../../../../src/core/sport/catalogs.ts` from `providers/<name>/`) that point outside its folder, where the runtime has nothing;
- for `results-import` only, the imports of `catalogs.ts` rewritten **in the staged copy only**, never in the repository: each one becomes the relative path from that module to `_vendor/catalogs.ts` (`./_vendor/catalogs.ts` or `../../_vendor/catalogs.ts`, whichever the module's depth needs).

No import map is added. The runtime's `main` service gives every function the single import map at the root of the volume (`deno.jsonc`), which belongs to the template and is shared with other functions, so the script never reads it for anything but the check and never changes it.

The script refuses to build when:

- `src/core/sport/catalogs.ts` has imports. That file runs in Deno and in React Native and is the only file shipped from `src/`, so it must stay free of imports. A Jest test (`src/core/sport/__tests__/catalogs-standalone.test.ts`) enforces the same rule in CI;
- a function imports anything else from `src/` (the bundle would miss it), or an import into `src/` is left after the rewrite;
- a function imports from a sibling function that is not in `FUNCTIONS` (the bundle would not carry it);
- `deno check` fails on the delivered tree of any function. It checks every module (not only `index.ts`, so a provider that is not loaded yet cannot hide a broken import) with the volume's root import map. `tsconfig.json` excludes the Deno entry points, so `npm run typecheck` never checks them. It runs with `--no-lock`: no lockfile is kept, so it validates the versions the specifiers (`npm:`, `jsr:`) resolve to at check time, the same specifiers the runtime resolves when it loads the function. That needs network access to the npm and jsr registries. The script uses the local `deno` only when it is exactly the runtime's version (2.1.4); with another version, or none, it uses the `denoland/deno:2.1.4` image through Docker (and prints `NOTE: local deno <x> differs from the runtime's 2.1.4; ...` when a local one was skipped). With neither, it fails.

Each new bundle is built beside the old ones (`.staging/<function>`) and they are swapped in only after validation and every `deno check` have passed for all functions, so a failure there, in either function, leaves the volume as it was. The swap itself is done per function, two renames each (the old `<function>` to `.<function>.old`, then the new one into place), not one atomic step for the whole delivery: for an instant between the two renames of a function a request finds no such function, and a run interrupted during the swaps can leave one function new and the other old. A run interrupted between the two renames of a function leaves its `.<function>.old` and no function; the next run recovers each function on its own, putting its `.<function>.old` back first (or discarding it when the function is already there). Other folders in the volume (`main`, other functions) are never touched. Running it again is safe.

**Environment of `results-import`.** The function reads three variables, by name only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`. The stack's `functions` service must provide them (the Supabase template does); the bundle sets none of them.

**Environment of `school-console-invite-coach`.** Besides `SUPABASE_URL` and `SUPABASE_ANON_KEY` (it acts as the caller and never reads the service role key), it reads two variables, by name only:

- `RESEND_API_KEY`: the Resend API key. When it is unset the function uses the test sender, which sends nothing (development and tests).
- `RESEND_FROM`: the sender verified in Resend, as `Name <address@domain>`. Required when the key is set: without it every delivery fails as `unavailable`.

The maintainer sets both only in the environment of the Supabase stack's `functions` service in Dokploy, per environment; their values never go in this repository. The function answers 200 `{ ok: true, value: { invitationId, emailSent } }`, where `emailSent` is `false` when no `RESEND_API_KEY` is set (the test sender sends nothing). When Resend fails (HTTP error or no network) it answers 502 `{ ok: false, error: { code: 'unavailable', invitationId } }` and the invitation stays pending: inviting the same email again reuses it and sends the email again. `emailSent` is an optional field of the 200 value and `invitationId` an optional field of the 502 error, both additions that older clients ignore; in both cases the console shows «La invitación quedó creada pero el correo no salió».

A call to Resend times out after 10 seconds and counts as `unavailable`. Each email carries `Idempotency-Key: coach-invitation/<invitation id>`, which Resend keeps for 24 hours: inviting the same email again within 24 hours of a delivered send does not send a second email (Resend answers the original result), and after a lost response the retry does not duplicate it. After 24 hours, inviting again sends a new email. If the school is renamed within those 24 hours the payload differs and Resend answers 409, which the function reports as `unavailable` until the 24 hours pass.

### Steps (maintainer)

The migrations and the function go together, neither without the other: the claim migrations change the shape of the claim responses and the function reads the new shape. Since #1351 both are delivered by the same deploy, migrations first (steps 2 and 4); step 3 (egress) and the check of step 7 stay manual.

**Expand/contract (issue #896).** Migrations deploy on merge and the function is delivered right after them, by the same deploy, but not at the same instant (and a failed delivery leaves the old function serving), so `20261112120000_results-import_platform_per_provider.sql` only *expands*: it adds the per-provider signatures (`results_import_claim_query`, `results_import_claim_results_query` and `results_import_release_claim` with a `provider` argument, `results_import_latest_confirmation(athlete, organization)`) and keeps the four old signatures working (the old claim and release signatures as thin wrappers; the one-argument `results_import_latest_confirmation(athlete)` unchanged), so the function running before step 4 keeps working. A *contract* migration goes in a later pull request than the function that stops using the old signatures, never in the same one. The old claim and release wrappers take the provider from the single federation row of `results_import_sources` (`app.results_import_legacy_provider()`); they raise `22023` when that registry does not hold exactly one federation source. The *contract* is follow-up #931: a later migration drops the four old signatures and that helper. Do not merge #931 until the new function is delivered to production (steps 3 and 4) and works. The migration also changes the query window and its lock from per athlete to per (athlete, provider), and adds the organization type `results_platform` to the registry check.

**Nothing activates the platform.** Delivering the function does not turn on tournament import. The platform adapter exists (a folder of `supabase/functions/results-import/providers/`), and the function registers it in `supabase/functions/results-import/index.ts`, but it only resolves an address when the database holds its `organizations` row (type `results_platform`) and its `results_import_sources` row. No migration and no seed creates them: the maintainer loads them in each environment with the runbook [Load the results providers per environment](../docs/release/results-providers.md), a separate step the maintainer decides.

1. **Vault secret.** `athlete_identity_key` must exist, see [Identity number key (Vault)](#identity-number-key-vault).
2. **Migrations.** Merge to `main`; Dokploy deploys and `migrate` applies every pending migration, among them the `results-import` claim migrations (`supabase/migrations/*results-import*`), which the function needs. Read the `migrate` logs and confirm it exited 0.
3. **Egress.** The providers fetch external sources over HTTPS from the runtime. This step goes before the bundle because the bundle swap is live from the next request, and the egress check only needs the repository. From the server, with the Docker network of the Supabase stack's `functions` service (`docker inspect <functions container>` lists it):

   ```sh
   sh deploy/scripts/functions-egress.sh <docker-network>
   ```

   It scans every non-test module under `supabase/functions/*/` for `https://` URLs (literal hosts, also inside template literals, and `https://${NAME}` with `const NAME = '<host>'` in the same file), which today gives the host of the provider that has a `source.ts`, the `HOST` constant of `co-colombiaacuatica`, and `api.resend.com` from the invitation function. `sh deploy/scripts/functions-egress.sh --list` prints them without Docker. A `results-import` provider folder with no host found, or a host it cannot resolve, fails the check: a provider left out never passes (another function with no host is fine). It then sends a `HEAD` request to `https://<host>/` from a throwaway Deno container on that network and prints `PASS: <host> reached over TLS (valid certificate), HTTP <status>` (or `FAIL`, with a non-zero exit). A PASS covers DNS, the route out, a TLS handshake with a certificate the container trusts for that host name, and an HTTP answer from whatever answered. A block page served with a certificate the container does not trust (a captive portal, or a proxy whose CA is not installed) fails. A block page served with a trusted certificate (for example an intercepting proxy whose CA is installed) is not told apart and passes; the test covers only the untrusted-certificate case. It does not check the HTTP status, method, path or body (the providers use `GET` and `POST` on specific paths, and a 4xx or 5xx from the real host still counts as reached). The runtime image has no `deno` or `curl` to run the check inside it, so this uses the same network instead.
4. **Bundle.** Delivered by the `functions` service of this compose on every deploy, right after `migrate` (see [What the `functions` service does](#what-the-functions-service-does)). Read its log in Dokploy: `PASS: deno check <function> (...)` and `DONE` (or `SKIP: ... unchanged`) for each function. If it prints `FAIL` before the first `DONE`, nothing was delivered and the deployment shows red; the old bundles keep serving, so fix the code and merge. Egress (step 3) goes before the merge that adds a provider host, because the swap is live from the next worker. As a fallback, run the script by hand on the server, in a clone at the merged `main` commit (Dokploy's own clone of the `deploy` compose works):

   ```sh
   sh deploy/scripts/functions-bundle.sh <functions-volume-dir>
   ```

   `<functions-volume-dir>` is the same host folder as `SUPABASE_FUNCTIONS_DIR`. The script refuses a folder without `main/`. It first runs `deno check` on every module of the tree it is about to deliver (with `catalogs.ts` inside). That is the dry run: a single import that does not resolve would take the whole function down, not just one provider. The same `PASS`, `DONE` and `SKIP` lines are printed.
5. **Runtime.** No restart is needed: the runtime loads the new files when its next worker starts, in about a minute. If an old response persists, restart the `functions` service of the Supabase stack in Dokploy (not the `functions` service of this compose); that is the manual fallback.
6. **JWT verification (recommended).** Look at `FUNCTIONS_VERIFY_JWT` in the stack's environment (the `functions` service reads it as `VERIFY_JWT`): it may be `false`. Set it to `true` and redeploy the stack so the runtime rejects requests without a valid JWT before they reach any function. The runtime check depends on `verify_jwt` in `supabase/config.toml` locally and on `FUNCTIONS_VERIFY_JWT`/`VERIFY_JWT` in the stack. Independently of it, `authenticate` in `supabase/functions/results-import/index.ts` asks the auth server (`auth.getUser()`) who the token belongs to, and the `unauthenticated` refusal in `createHandler` (`handler.ts`) answers `401 unauthenticated` when it cannot say: no token, an invalid one, or the anon key alone. The runtime check is defense in depth, not the only gate.
7. **Check.** With the app's public anon key (`EXPO_PUBLIC_SUPABASE_ANON_KEY`, the value the app already uses):

   ```sh
   curl -s -X POST https://<api hostname>/functions/v1/results-import \
     -H "Authorization: Bearer <anon key>" -H 'content-type: application/json' -d '{"action":"search"}'
   ```

   Expected: `{"ok":false,"error":{"code":"unauthenticated"}}` with HTTP 401 (the function is loaded and refuses a request that has no signed-in user). With JWT verification on (step 6), a request without an `Authorization` header is answered 401 by the runtime before the function runs. A 404 or 500 means the function is not loaded: read the logs of the `functions` service.

To go back to an earlier bundle, revert the change on `main` and deploy again (the `functions` service delivers the reverted code); the manual way is to run the script again from a clone at that commit. Migrations are forward-only (see [Rolling back](#rolling-back)): do not roll the function back behind a migration it needs; fix forward.

### Check it locally

```sh
sh deploy/scripts/functions.test.sh
```

It builds the bundle in a temporary folder next to a stand-in volume (a `main` router like the template's, which gives every function the root `deno.jsonc` import map, plus another function), runs `deno check` on the delivered tree, loads it in the same `supabase/edge-runtime` image the stack runs on one random port of `127.0.0.1` (no other container, network or volume is touched), and checks that every module imports `catalogs.ts` through the right relative path at both depths, that the root `deno.jsonc` and the repository are unchanged, that `results-import` and `school-console-invite-coach` answer `401 unauthenticated`, that a volume with only `main` receives the four functions and they pass `deno check` (with an older or broken published sibling in the volume the result does not change), that a function importing from a sibling outside `FUNCTIONS` is refused, that `results-import` does not load without `_vendor/catalogs.ts`, and that a `catalogs.ts` with imports (also a multi-line `export ... from` or a dynamic `import()`), or any other import from `src/` (either quote style), is refused. It also checks that delivering the same code twice changes no file of the volume (`SKIP`) and that a change in one function replaces only that one, that the egress script finds every provider host (literal, template literal and constant) and fails for a provider with none, that a host answering with an untrusted certificate (a block page) fails the egress check (it creates and removes its own Docker network and a throwaway server on it), that a local `deno` of another version is replaced by the runtime's image, that a `deno check` failure in any function leaves the whole volume unchanged, and that an interrupted swap (`.results-import.old` without a function) is recovered. To only check the code, run the bundle script against a scratch folder that has a `main/` folder: `d=$(mktemp -d) && mkdir "$d/main" && sh deploy/scripts/functions-bundle.sh "$d"`.

## Demo data

`supabase/seed.sql` is the demo for development and walkthroughs. It is for QA and local use only: PROD never applies it (`APPLY_SEED=false`). Everything in it is invented: a school ("Demo Swim School") with its own organization, hanging from a parent league organization ("Demo Swim League") whose three category templates (`Under 11`, `Under 14`, `Open`) become the school's categories, two groups and ten athletes (each with a category), six weeks of times in two events (so there is history and personal bests), one training plan, and the authorizations in force for two athletes. It has no platform admin account; if a walkthrough needs one, add it later.

| Account | Role | Sees |
| --- | --- | --- |
| `demo-coach@example.test` | Coach of Group A | The 5 athletes of Group A, their times, the school's plan |
| `demo-guardian@example.test` | Guardian of 2 athletes of Group A | Those 2 athletes, their times and authorizations |
| `demo-admin@example.test` | School administrator | The whole school, including the authorization evidence |

The accounts have no password. They sign in with the email code, and that works only in the **local** stack, where the code reaches the local Mailpit (`http://127.0.0.1:54324`). In QA the demo accounts cannot sign in: Auth sends through Resend, `example.test` cannot receive email, and nothing reaches QA's Mailpit. In QA, sign in with a real email of your own or with Google. The seed creates them directly in `auth.users`, so no Auth admin API call is needed.

The seed is idempotent: every insert uses fixed ids and `on conflict do nothing`, so applying it again adds only what is missing.

**Apply it in Dokploy.** This needs the maintainer; agents do not touch Dokploy or the deployed Auth.

1. Set `APPLY_SEED=true` on the deploy compose and redeploy. `migrate` logs `seed applied supabase/seed.sql`.
2. Set `APPLY_SEED` back to `false`.

`migrate` records the seed by path and hash. A later change to `seed.sql` is not applied by itself: `migrate` only logs `seed ... changed since it was applied; not re-applied`. To update the demo, delete the row with path `supabase/seed.sql` from `supabase_migrations.seed_files` by hand and redeploy with `APPLY_SEED=true`; the seed only adds what is missing. To start over clean, remove the demo first (below).

**Remove it.** [`supabase/scripts/seed-remove.sql`](../supabase/scripts/seed-remove.sql) deletes the demo school, its organization and the parent league with its category templates, the athletes, times, plans and authorizations (also what people added to that school while trying it) and the three accounts. An athlete who also belongs to another school stays, only unlinked from the demo school. It also deletes the `seed_files` row, so `APPLY_SEED` can apply the demo again. It keeps the authorization texts. It lifts the authorizations delete trigger for one statement, so it must run in one transaction (`psql --single-transaction`) and refuses to run otherwise. From a clone of the repository on the server:

```sh
docker exec -i <supabase db container> psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < supabase/scripts/seed-remove.sql
```

**Check it locally.** `supabase db reset` (it loads the seed), then `sh supabase/scripts/seed.test.sh`. The script applies the seed again and checks nothing changed, checks what each account sees, checks that `seed-remove.sql` refuses to run outside a transaction, and checks that it removes the demo (inside a rolled-back transaction).

## Security notes

- Migrations must not contain `BEGIN` or `COMMIT`: a `COMMIT` mid-file escapes the per-file transaction and breaks the all-or-nothing guarantee.
- `powersync_role` has `REPLICATION`, so it can read the changes of every table through its own slot. Treat `POWERSYNC_DB_PASSWORD` like an admin password and keep secret-bearing tables out of `public`.
- PowerSync holds the Supabase HS256 JWT secret, which can mint `service_role` tokens. Moving to Supabase asymmetric keys with `jwks_uri` is a later improvement.
- `sslmode: disable` is acceptable only while everything runs on one host.

## Sync config

PowerSync loads the Sync Streams in [`powersync/sync-config.yaml`](../powersync/sync-config.yaml), copied into the `powersync` image at `/sync`. Every deploy picks up the version on `main`; on start the `powersync` logs show `Loaded sync config`, plus `Sync config updated` when the file changed or `Sync config unchanged` when it did not. Leave `PS_SYNC_CONFIG_PATH` unset in Dokploy unless you need another file inside the container.

## Tests

All of them need Docker and are safe to run locally (random names, synthetic data, cleaned up on exit):

```sh
sh deploy/scripts/migrate.test.sh   # migrate.sh against a temporary Postgres, including the backup gate, the lock and the compose checks
sh deploy/scripts/backup-prod.test.sh # backup-prod.sh, backup-r2.sh and restore-check.sh against a throwaway Postgres and S3 endpoint
sh deploy/scripts/smoke.test.sh     # compose up with a stand-in database; PowerSync liveness and Sync Streams load; a sync config change restarts PowerSync; the functions delivery (after migrate, a broken function fails compose up and leaves the folder and PowerSync as they were)
sh deploy/scripts/functions.test.sh # the four function bundles loaded in the Edge Functions runtime image; see Edge Functions above
```
