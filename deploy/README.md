# deploy/

What Dokploy deploys from this repository on every push to `main`: migrations plus PowerSync. Design and exposure rules: [ADR 0002](../docs/decisions/0002-backend-hosting-on-dokploy.md).

## What is here and what is not

| In this folder | Purpose |
| --- | --- |
| `compose.yaml` | The Compose service Dokploy deploys: `migrate`, `powersync-storage`, `powersync`. |
| `scripts/migrate.sh` | Creates `powersync_role`, applies `supabase/migrations/*.sql`, optional seed. |
| `powersync/powersync.yaml` | PowerSync service config. |
| `powersync/empty-sync-config.yaml` | Sync config that syncs nothing, used until `powersync/sync-config.yaml` exists. |
| `scripts/*.test.sh` | Local tests, see [Tests](#tests). |

Not here: **Supabase** and **Mailpit** (development SMTP). Both are deployed from Dokploy's own templates and configured in the Dokploy UI.

## One-time setup in Dokploy

Organization `fatherApps`, project `TrailSkill`.

1. **Supabase**, from the Dokploy template.
   - The database is never attached to the shared Traefik network. `migrate` and `powersync` join the Supabase stack's own default network instead (in Dokploy: `<supabase app name>_default`); put that name in `SUPABASE_NETWORK` and use `db` as `SUPABASE_DB_HOST`.
   - Studio stays internal. Only the Kong API gateway gets a public domain (HTTPS).
2. **Mailpit**, from the template, as development SMTP. Point Supabase's SMTP settings (Auth service) at it.
   - Email sign-in uses a 6-digit one-time code, so the Auth email template must contain `{{ .Token }}`. GoTrue reads custom templates from `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK` / `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` (a URL) and the code length from `GOTRUE_MAILER_OTP_LENGTH` (default 6). Verify these names on the server; they were not confirmed against the template.
3. **This Compose service**: source GitHub, this repository, branch `main`, compose path `deploy/compose.yaml`, auto deploy **off**. Set the environment variables below. Add a domain for the `powersync` service on port `8080` (HTTPS).
   - `main` has no server-side protection on GitHub Free, so auto deploy would let any push to `main` run arbitrary Compose on a shared host. Keep it off until `main` has a GitHub branch ruleset; until then the maintainer deploys by hand after each merge (Deploy button in Dokploy). Turning auto deploy on is a maintainer decision tied to that ruleset, and CODEOWNERS for `deploy/**` and `supabase/**` should come with it.

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
| `POWERSYNC_DB_PASSWORD` | required | Password given to `powersync_role` (set on every deploy) | Generate; only used here |
| `POWERSYNC_STORAGE_PASSWORD` | required | Password of the PowerSync bucket storage Postgres | Generate; only used here |
| `SUPABASE_JWT_SECRET` | required | HS256 secret PowerSync uses to verify Supabase tokens | Supabase service (`JWT_SECRET`) |
| `PS_SYNC_CONFIG_PATH` | `/config/empty-sync-config.yaml` | Sync config file inside the container | See [Sync config](#sync-config) |
| `APPLY_SEED` | `false` | `true` applies `supabase/seed.sql` once (development only) | Set by hand |
| `DOKPLOY_NETWORK` | `dokploy-network` | Traefik network, used only so `powersync` can be routed | Change only for tests |

Dokploy writes these variables to `deploy/.env` in the clone, so each service mounts only what it needs: `powersync` gets `deploy/powersync` and `powersync/`, `migrate` gets `deploy/scripts` and `supabase/`. Never mount the repository root.

Passwords go inside connection URIs, so they must be URL-safe: letters and digits only (for example `openssl rand -hex 24`).

## Credentials

- Credentials live only in each service's environment in Dokploy. Never in the repo, never in `.env` files that are committed.
- The app receives only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_POWERSYNC_URL`.
- The `service_role` key and the database passwords never go to the app.

## Public and internal

Public over HTTPS: the Supabase Kong gateway, the PowerSync service, and Dokploy's deploy webhook path. Internal only: Dokploy panel, Studio, Postgres, Mailpit, PowerSync storage. Details in ADR 0002. This compose file publishes no ports; Traefik routes the domains.

## How migrations run

On every deploy of `main`, `migrate` runs once before PowerSync starts:

1. Creates `powersync_role` (`LOGIN REPLICATION BYPASSRLS`) with `POWERSYNC_DB_PASSWORD`. If it exists, only the attributes are updated; the password is set again only when logging in with `POWERSYNC_DB_PASSWORD` fails (so rotating the variable works, and the password is not sent on every deploy).
2. Applies `supabase/migrations/*.sql` in name order. Names must be `<digits>_<name>.sql`. Each file runs in one transaction together with its record in `supabase_migrations.schema_migrations`, so a failure leaves nothing partial. Applied versions are skipped.
3. Grants `powersync_role` read access (`SELECT`) on `public`, now and for future tables.
4. With `APPLY_SEED=true` only (the value must be exactly `true` or `false`), applies `supabase/seed.sql` once (recorded in `supabase_migrations.seed_files`).

If anything fails, `migrate` exits non-zero and PowerSync does not start: the deploy fails and the previous PowerSync keeps running.

PowerSync logs replication errors (`Publication 'powersync' does not exist`) until the foundations migration creates the `powersync` publication.

## Security notes

- Migrations must not contain `BEGIN` or `COMMIT`: a `COMMIT` mid-file escapes the per-file transaction and breaks the all-or-nothing guarantee.
- `powersync_role` has `REPLICATION`, so it can read the changes of every table through its own slot. Treat `POWERSYNC_DB_PASSWORD` like an admin password and keep secret-bearing tables out of `public`.
- PowerSync holds the Supabase HS256 JWT secret, which can mint `service_role` tokens. Moving to Supabase asymmetric keys with `jwks_uri` is a later improvement.
- `sslmode: disable` is acceptable only while everything runs on one host.

## Sync config

PowerSync starts with an empty sync config. When `powersync/sync-config.yaml` exists on `main`, set `PS_SYNC_CONFIG_PATH=/sync/sync-config.yaml` and redeploy.

## Tests

Both need Docker and are safe to run locally (random names, synthetic data, cleaned up on exit):

```sh
sh deploy/scripts/migrate.test.sh   # migrate.sh against a temporary Postgres
sh deploy/scripts/smoke.test.sh     # compose up with a stand-in database; PowerSync liveness
```
