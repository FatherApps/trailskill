# deploy/

What Dokploy deploys from this repository on every push to `main`: migrations plus PowerSync. Design and exposure rules: [ADR 0002](../docs/decisions/0002-backend-hosting-on-dokploy.md).

## What is here and what is not

| In this folder | Purpose |
| --- | --- |
| `compose.yaml` | The Compose service Dokploy deploys: `migrate`, `powersync-storage`, `powersync`. |
| `scripts/migrate.sh` | Creates `powersync_role`, applies `supabase/migrations/*.sql`, optional seed. |
| `powersync/powersync.yaml` | PowerSync service config. |
| `scripts/*.test.sh` | Local tests, see [Tests](#tests). |

Not here: the **Supabase** stack (including Mailpit and the email template). It is set up once in Dokploy and is not versioned in this repository. Changes to it are made in Dokploy and deployed by hand; continuous deployment covers only this compose.

## One-time setup in Dokploy

Organization `fatherApps`, project `TrailSkill`.

1. **Supabase**, from the Dokploy Supabase template. The template's default public `sslip.io` domain was removed: the stack has no public domain of its own (see [Public and internal](#public-and-internal)).
   - The database is only on the stack's default network (`<supabase app name>_default`). `migrate` and `powersync` join that network; put its name in `SUPABASE_NETWORK` and use `db` as `SUPABASE_DB_HOST`.
   - Two internal services were added to the stack's compose in Dokploy:
     - `mailpit` (`axllent/mailpit:v1.22.3`): development SMTP on port 1025.
     - `mail-templates` (`busybox:1.37` running `httpd -f -p 8080 -h /www`): serves `../files/mail-templates` read-only. The email template is a Dokploy file mount, `mail-templates/otp.html`, and it contains `{{ .Token }}`.
   - Environment added to the Auth service in that compose:
     - `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK` and `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` = `http://mail-templates:8080/otp.html`
     - `GOTRUE_MAILER_SUBJECTS_MAGIC_LINK` and `GOTRUE_MAILER_SUBJECTS_CONFIRMATION` = `Tu código de TrailSkill`
     - `GOTRUE_MAILER_OTP_LENGTH` is not set: GoTrue's default is 6, which is the code length we use.
   - Stack environment changed:
     - `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, empty SMTP user and password.
     - `ENABLE_EMAIL_AUTOCONFIRM=false`, `ENABLE_PHONE_SIGNUP=false`, `ENABLE_ANONYMOUS_USERS=false`.
     - `SUPABASE_HOST`, `SUPABASE_PUBLIC_URL` and `API_EXTERNAL_URL` = the public API hostname. `API_EXTERNAL_URL` is also the JWT issuer.
2. **This Compose service**: source GitHub, this repository, branch `main`, compose path `deploy/compose.yaml`. Set the environment variables below. Add a domain for the `powersync` service on port `8080` with HTTPS **off** (HTTPS ends at Cloudflare). Then turn on continuous deployment, see [Continuous deployment](#continuous-deployment).

## Continuous deployment

On. Dokploy's GitHub App sends push events to `https://trailskill-deploy.tuls.app/api/deploy/github`, and Dokploy verifies the GitHub signature. The `deploy` compose has auto deploy on for branch `main` with watch paths `deploy/**`, `supabase/**` and `powersync/**`, so app-only changes do not redeploy it.

What a deploy does: it re-clones `main` and recreates the services. `migrate` runs first (pending migrations, grants, optional seed). `powersync` starts only if `migrate` exits 0, so a failing migration leaves PowerSync stopped until a fix is merged.

Accepted risk (maintainer, 2026-10-25): `main` has no GitHub ruleset (Free plan), only the pre-push hook and the PR flow. Any push to `main` runs on the server. When the organization moves to GitHub Team, add the ruleset and CODEOWNERS for `deploy/**` and `supabase/**`.

Manual deploy is still available (Deploy button in Dokploy).

To turn it off: switch off Auto Deploy on the `deploy` compose in Dokploy, or remove the `trailskill-deploy.tuls.app` tunnel rule.

## Rolling back

- **Code or config regression:** revert the merge on `main` (a PR with `git revert`). Continuous deployment deploys the reverted state.
- **Migrations are forward-only.** Never edit or delete an applied migration; fix it with a new migration. Reverting a commit does not undo an applied migration.
- **Failed `migrate`:** PowerSync stays stopped. Read the `migrate` logs in Dokploy, merge a fix (or a revert), and it redeploys.
- **Data loss or corruption:** restore from a database backup. There is no automated backup yet; it is still an open item in ADR 0002.

## Environment variables of `compose.yaml`

Set them in the environment of this Compose service in Dokploy.

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
| `APPLY_SEED` | `false` | `true` applies `supabase/seed.sql` once (development only) | Set by hand |
| `DOKPLOY_NETWORK` | `dokploy-network` | Traefik network, used only so `powersync` can be routed | Change only for tests |

Dokploy writes these variables to `deploy/.env` in the clone, so each service mounts only what it needs: `powersync` gets `deploy/powersync` and `powersync/`, `migrate` gets `deploy/scripts` and `supabase/`. Never mount the repository root.

Passwords go inside connection URIs, so they must be URL-safe: letters and digits only (for example `openssl rand -hex 24`).

## Credentials

- Credentials live only in each service's environment in Dokploy. Never in the repo, never in `.env` files that are committed.
- The app receives only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_POWERSYNC_URL`.
- The `service_role` key and the database passwords never go to the app.

## Public and internal

The Dokploy server never publishes ports (0 published ports). Public traffic enters through a Cloudflare Tunnel (named "Dokploy Server", managed in the Cloudflare dashboard). Its rules send each hostname to the server's Traefik on `http://localhost`, or to the Dokploy panel on `http://localhost:3000`. HTTPS ends at Cloudflare's edge, so Dokploy domains are created with HTTPS off.

Public hostnames (zone `tuls.app`):

| Hostname | Goes to | Notes |
| --- | --- | --- |
| `trailskill-api.tuls.app` | Supabase `api-gw`, port 8000 | The tunnel rule only allows paths matching `^/(auth\|rest\|storage\|functions\|realtime)/v1/`. Studio (the gateway root) is not reachable (404). |
| `trailskill-sync.tuls.app` | `powersync`, port 8080 | |
| `trailskill-deploy.tuls.app` | Dokploy panel | Only paths matching `^/api/deploy/` (the GitHub webhook). Everything else is 404. |

Internal only: Dokploy panel, Studio, Postgres, Mailpit, PowerSync storage. Details in ADR 0002.

To add or change a public hostname: add a Dokploy domain (HTTPS off), then add a tunnel rule and a proxied CNAME to the tunnel. Insert the rule before the tunnel's final 404 rule. The same tunnel serves other sites, so never replace or reorder its existing rules. Use single-level names (`name.tuls.app`): Cloudflare's free certificate does not cover `a.b.tuls.app`.

## How migrations run

On every deploy of `main`, `migrate` runs once before PowerSync starts:

1. Creates `powersync_role` (`LOGIN REPLICATION BYPASSRLS`) with `POWERSYNC_DB_PASSWORD`. If it exists, only the attributes are updated; the password is set again only when logging in with `POWERSYNC_DB_PASSWORD` fails (so rotating the variable works, and the password is not sent on every deploy).
2. Applies `supabase/migrations/*.sql` in name order. Names must be `<digits>_<name>.sql`. Each file runs in one transaction together with its record in `supabase_migrations.schema_migrations`, so a failure leaves nothing partial. Applied versions are skipped.
3. Grants `powersync_role` read access (`SELECT`) on `public`, now and for future tables.
4. With `APPLY_SEED=true` only (the value must be exactly `true` or `false`), applies `supabase/seed.sql` once (recorded in `supabase_migrations.seed_files`).

If anything fails, `migrate` exits non-zero and PowerSync does not start: the deploy fails and PowerSync stays stopped until a fix is merged (see [Rolling back](#rolling-back)).

PowerSync logs replication errors (`Publication 'powersync' does not exist`) until the foundations migration creates the `powersync` publication.

## Security notes

- Migrations must not contain `BEGIN` or `COMMIT`: a `COMMIT` mid-file escapes the per-file transaction and breaks the all-or-nothing guarantee.
- `powersync_role` has `REPLICATION`, so it can read the changes of every table through its own slot. Treat `POWERSYNC_DB_PASSWORD` like an admin password and keep secret-bearing tables out of `public`.
- PowerSync holds the Supabase HS256 JWT secret, which can mint `service_role` tokens. Moving to Supabase asymmetric keys with `jwks_uri` is a later improvement.
- `sslmode: disable` is acceptable only while everything runs on one host.

## Sync config

PowerSync loads the Sync Streams in [`powersync/sync-config.yaml`](../powersync/sync-config.yaml), mounted read-only at `/sync`. Every deploy picks up the version on `main`; on start the `powersync` logs show `Loaded sync config`. Leave `PS_SYNC_CONFIG_PATH` unset in Dokploy unless you need another file inside the container.

## Tests

Both need Docker and are safe to run locally (random names, synthetic data, cleaned up on exit):

```sh
sh deploy/scripts/migrate.test.sh   # migrate.sh against a temporary Postgres
sh deploy/scripts/smoke.test.sh     # compose up with a stand-in database; PowerSync liveness and Sync Streams load
```
