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
   - Two services were added to the stack's compose in Dokploy:
     - `mailpit` (`axllent/mailpit:v1.22.3`): test SMTP on port 1025, for the test environment only. Until production email exists (#105), it is how demo accounts get their sign-in code. Its environment is set by the maintainer on the `mailpit` service of that compose in Dokploy; values never go in the repository:
       - `MP_SMTP_ALLOWED_RECIPIENTS` = `^demo-[a-z]+@example\.test$`: Mailpit accepts email only for `demo-*@example.test` and rejects every other recipient (`550`), so only demo accounts can get a code. Any other account gets `Error sending magic link email`.
       - `MP_UI_AUTH`: the basic authentication credential for the web UI and API.
       - Domain `trailskill-mail.tuls.app` on port `8025`, HTTPS off (see [Public and internal](#public-and-internal)). To sign in to a demo account, for example from a test APK, request the code in the app and read it there.
       - Alternative without publishing it: leave out `MP_UI_AUTH` and the domain. The maintainer reads the code in the internal Mailpit and passes it on, so every demo sign-in depends on the maintainer.
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

What a deploy does: it re-clones `main` and recreates the services. `migrate` runs first (pending migrations, grants, optional seed). `powersync` starts only if `migrate` exits 0, so a failing migration leaves PowerSync stopped until a fix is merged. `powersync` is built from the pinned image with `powersync/sync-config.yaml` copied in, so a deploy that changes only that file recreates `powersync`, which logs `Sync config updated` and applies the new Sync Streams without a manual restart. An unchanged file reuses the cached image and leaves `powersync` running.

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
| `APPLY_SEED` | `false` | `true` applies the demo data in `supabase/seed.sql` once (see [Demo data](#demo-data)) | Set by hand |
| `DOKPLOY_NETWORK` | `dokploy-network` | Traefik network, used only so `powersync` can be routed | Change only for tests |

Dokploy writes these variables to `deploy/.env` in the clone, so each service mounts only what it needs: `powersync` mounts `deploy/powersync` (`powersync/sync-config.yaml` is copied into its image; the build context is `powersync/` only), `migrate` gets `deploy/scripts` and `supabase/`. Never mount the repository root.

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
| `trailskill-mail.tuls.app` | Supabase stack `mailpit`, port 8025 | Test environment only. Mailpit basic authentication (`MP_UI_AUTH`). Holds only `demo-*@example.test` emails (see `MP_SMTP_ALLOWED_RECIPIENTS`). |
| `trailskill-deploy.tuls.app` | Dokploy panel | Only paths matching `^/api/deploy/` (the GitHub webhook). Everything else is 404. |

Internal only: Dokploy panel, Studio, Postgres, PowerSync storage. Mailpit is public only behind its basic authentication. Details in ADR 0002.

To add or change a public hostname: add a Dokploy domain (HTTPS off), then add a tunnel rule and a proxied CNAME to the tunnel. Insert the rule before the tunnel's final 404 rule. The same tunnel serves other sites, so never replace or reorder its existing rules. Use single-level names (`name.tuls.app`): Cloudflare's free certificate does not cover `a.b.tuls.app`.

## How migrations run

On every deploy of `main`, `migrate` runs once before PowerSync starts:

1. Creates `powersync_role` (`LOGIN REPLICATION BYPASSRLS`) with `POWERSYNC_DB_PASSWORD`. If it exists, only the attributes are updated; the password is set again only when logging in with `POWERSYNC_DB_PASSWORD` fails (so rotating the variable works, and the password is not sent on every deploy).
2. Applies `supabase/migrations/*.sql` in name order. Names must be `<digits>_<name>.sql`. Each file runs in one transaction together with its record in `supabase_migrations.schema_migrations`, so a failure leaves nothing partial. Applied versions are skipped.
3. Grants `powersync_role` read access (`SELECT`) on `public`, now and for future tables.
4. With `APPLY_SEED=true` only (the value must be exactly `true` or `false`), applies `supabase/seed.sql` once (recorded by path and hash in `supabase_migrations.seed_files`; see [Demo data](#demo-data)).

If anything fails, `migrate` exits non-zero and PowerSync does not start: the deploy fails and PowerSync stays stopped until a fix is merged (see [Rolling back](#rolling-back)).

PowerSync logs replication errors (`Publication 'powersync' does not exist`) until the foundations migration creates the `powersync` publication.

## Demo data

`supabase/seed.sql` is the demo for development and walkthroughs. Everything in it is invented: a school ("Demo Swim School") with two groups and ten athletes, six weeks of times in two events (so there is history and personal bests), one training plan, and the authorizations in force for two athletes. It has no platform admin account; if a walkthrough needs one, add it later.

| Account | Role | Sees |
| --- | --- | --- |
| `demo-coach@example.test` | Coach of Group A | The 5 athletes of Group A, their times, the school's plan |
| `demo-guardian@example.test` | Guardian of 2 athletes of Group A | Those 2 athletes, their times and authorizations |
| `demo-admin@example.test` | School administrator | The whole school, including the authorization evidence |

The accounts have no password. They sign in with the email code (Mailpit receives it). The seed creates them directly in `auth.users`, so no Auth admin API call is needed.

The seed is idempotent: every insert uses fixed ids and `on conflict do nothing`, so applying it again adds only what is missing.

**Apply it in Dokploy.** This needs the maintainer; agents do not touch Dokploy or the deployed Auth.

1. Set `APPLY_SEED=true` on the deploy compose and redeploy. `migrate` logs `seed applied supabase/seed.sql`.
2. Set `APPLY_SEED` back to `false`.

`migrate` records the seed by path and hash. A later change to `seed.sql` is not applied by itself: `migrate` only logs `seed ... changed since it was applied; not re-applied`. To update the demo, delete the row with path `supabase/seed.sql` from `supabase_migrations.seed_files` by hand and redeploy with `APPLY_SEED=true`; the seed only adds what is missing. To start over clean, remove the demo first (below).

**Remove it.** [`supabase/scripts/seed-remove.sql`](../supabase/scripts/seed-remove.sql) deletes the demo school, its athletes, times, plans and authorizations (also what people added to that school while trying it) and the three accounts. It also deletes the `seed_files` row, so `APPLY_SEED` can apply the demo again. It keeps the authorization texts. From a clone of the repository on the server:

```sh
docker exec -i <supabase db container> psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < supabase/scripts/seed-remove.sql
```

**Check it locally.** `supabase db reset` (it loads the seed), then `sh supabase/scripts/seed.test.sh`. The script applies the seed again and checks nothing changed, checks what each account sees, and checks that `seed-remove.sql` removes the demo (inside a rolled-back transaction).

## Security notes

- Migrations must not contain `BEGIN` or `COMMIT`: a `COMMIT` mid-file escapes the per-file transaction and breaks the all-or-nothing guarantee.
- `powersync_role` has `REPLICATION`, so it can read the changes of every table through its own slot. Treat `POWERSYNC_DB_PASSWORD` like an admin password and keep secret-bearing tables out of `public`.
- PowerSync holds the Supabase HS256 JWT secret, which can mint `service_role` tokens. Moving to Supabase asymmetric keys with `jwks_uri` is a later improvement.
- `sslmode: disable` is acceptable only while everything runs on one host.

## Sync config

PowerSync loads the Sync Streams in [`powersync/sync-config.yaml`](../powersync/sync-config.yaml), copied into the `powersync` image at `/sync`. Every deploy picks up the version on `main`; on start the `powersync` logs show `Loaded sync config`, plus `Sync config updated` when the file changed or `Sync config unchanged` when it did not. Leave `PS_SYNC_CONFIG_PATH` unset in Dokploy unless you need another file inside the container.

## Tests

Both need Docker and are safe to run locally (random names, synthetic data, cleaned up on exit):

```sh
sh deploy/scripts/migrate.test.sh   # migrate.sh against a temporary Postgres
sh deploy/scripts/smoke.test.sh     # compose up with a stand-in database; PowerSync liveness and Sync Streams load; a sync config change restarts PowerSync
```
