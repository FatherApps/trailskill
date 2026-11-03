# deploy/

What Dokploy deploys from this repository on every push to `main`: migrations plus PowerSync. Design and exposure rules: [ADR 0002](../docs/decisions/0002-backend-hosting-on-dokploy.md).

## What is here and what is not

| In this folder | Purpose |
| --- | --- |
| `compose.yaml` | The Compose service Dokploy deploys: `migrate`, `powersync-storage`, `powersync`. |
| `scripts/migrate.sh` | Creates `powersync_role`, applies `supabase/migrations/*.sql`, optional seed. |
| `powersync/powersync.yaml` | PowerSync service config. |
| `scripts/functions-bundle.sh` | Builds the `results-import` Edge Function bundle and puts it in the Supabase stack's functions volume, see [Edge Functions](#edge-functions-results-import). |
| `scripts/functions-egress.sh` | Checks that the Edge Functions runtime's network can reach the providers' external sources over HTTPS. |
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

### Identity number key (Vault)

**Do this first, before the migration of issue #799 is applied** (on a server where it is already applied, before the first official results import). The identity number of an athlete (issue #799) is stored encrypted with a key kept in Supabase Vault under the name `athlete_identity_key`. The migration does not create it and the key is never committed: create it once on the server, as a privileged role (Supabase Studio SQL editor, or `psql` as `postgres`):

```sql
select vault.create_secret('<output of: openssl rand -base64 32>', 'athlete_identity_key');
```

- Generate the key with `openssl rand -base64 32` and keep a copy in the team's password manager; losing it makes the stored numbers unreadable.
- Without the secret, saving a number fails with `athlete identity key is not configured` (SQLSTATE `TS001`) and registration goes on without the number.
- Rotating the key means decrypting every row with the old key and encrypting it again with the new one in a single transaction, then updating the secret. Do not just replace the secret: the rows already stored could no longer be decrypted.

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

## Edge Functions (results-import)

The Supabase stack from the Dokploy template already runs the Edge Functions runtime (the `functions` service, `edge-runtime`), and the API gateway routes `/functions/v1/` to it. **This compose adds no second runtime.** What this repository provides is the way the code of `supabase/functions/results-import` gets into the folder that runtime reads. It is a manual step, run on the server after the migrations (continuous deployment does not touch the stack).

### What goes into the bundle

`sh deploy/scripts/functions-bundle.sh <functions-volume-dir>` builds `<functions-volume-dir>/results-import` with:

- everything in `supabase/functions/results-import/` except the `__tests__` folders;
- `_vendor/catalogs.ts`: a copy of `src/core/sport/catalogs.ts`. The function imports that file through relative paths (`../../../src/core/sport/catalogs.ts` from the function root, `../../../../../src/core/sport/catalogs.ts` from `providers/<name>/`) that point outside its folder, where the runtime has nothing;
- the imports of `catalogs.ts` rewritten **in the staged copy only**, never in the repository: each one becomes the relative path from that module to `_vendor/catalogs.ts` (`./_vendor/catalogs.ts` or `../../_vendor/catalogs.ts`, whichever the module's depth needs).

No import map is added. The runtime's `main` service gives every function the single import map at the root of the volume (`deno.jsonc`), which belongs to the template and is shared with other functions, so the script never reads it for anything but the check and never changes it.

The script refuses to build when:

- `src/core/sport/catalogs.ts` has imports. That file runs in Deno and in React Native and is the only file shipped from `src/`, so it must stay free of imports. A Jest test (`src/core/sport/__tests__/catalogs-standalone.test.ts`) enforces the same rule in CI;
- the function imports anything else from `src/` (the bundle would miss it), or an import into `src/` is left after the rewrite;
- `deno check` fails on the delivered tree. It checks every module (not only `index.ts`, so a provider that is not loaded yet cannot hide a broken import) with the volume's root import map. `tsconfig.json` excludes the Deno entry points, so `npm run typecheck` never checks them. The script uses the local `deno`, or the `denoland/deno:2.1.4` image through Docker when `deno` is not installed (it needs access to npm to fetch `@supabase/supabase-js`).

The new bundle is built beside the old one and swapped in only after the check passes, so a failed run leaves the volume as it was. Other folders in the volume (`main`, other functions) are never touched. Running it again is safe.

### Steps (maintainer)

The migrations and the function go together, neither without the other: the claim migrations change the shape of the claim responses and the function reads the new shape. Do steps 3 to 5 right after the deploy of step 2.

1. **Vault secret.** `athlete_identity_key` must exist, see [Identity number key (Vault)](#identity-number-key-vault).
2. **Migrations.** Merge to `main`; Dokploy deploys and `migrate` applies the pending migrations (`20261102210000_results-import_shared_claim.sql`, `20261103090000_results-import_claim_release.sql`). Read the `migrate` logs and confirm it exited 0.
3. **Bundle.** On the server, in a clone of this repository at the merged `main` commit (Dokploy's own clone of the `deploy` compose works), run:

   ```sh
   sh deploy/scripts/functions-bundle.sh <functions-volume-dir>
   ```

   `<functions-volume-dir>` is the host folder that the `functions` service of the Supabase stack mounts at `/home/deno/functions` (see the `volumes` of that service in the stack's compose in Dokploy). It must contain the stack's `main` folder. The script first runs `deno check` on the `index.ts` of the tree it is about to deliver (with `catalogs.ts` inside). That is the dry run: a single import that does not resolve would take the whole function down, not just one provider. It prints `PASS: deno check results-import/index.ts` and only then swaps the bundle in and prints `DONE: ... updated`. If it prints `FAIL`, nothing was delivered: do not touch the runtime.
4. **Egress.** The providers fetch external sources over HTTPS from the runtime. From the server, with the Docker network of the Supabase stack's `functions` service (`docker inspect <functions container>` lists it):

   ```sh
   sh deploy/scripts/functions-egress.sh <docker-network>
   ```

   It reads the base URLs of the providers from `supabase/functions/results-import/providers/*/source.ts` and sends a `HEAD` request to each from a throwaway Deno container on that network. It prints `PASS: <url> answered HTTP <status>` for each (any status means the host was reached) and exits non-zero on `FAIL`. The runtime image has no `deno` or `curl` to run the check inside it, so this uses the same network instead.
5. **Runtime.** Only after steps 3 and 4 passed. The `functions` service loads the new code on the next request. If an old response persists, restart the `functions` service in Dokploy.
6. **JWT verification (recommended).** Look at `FUNCTIONS_VERIFY_JWT` in the stack's environment (the `functions` service reads it as `VERIFY_JWT`): it may be `false`. Set it to `true` and redeploy the stack so the runtime rejects requests without a valid JWT before they reach any function. `verify_jwt` in `supabase/config.toml` only applies to local development. Even with it `false`, `results-import` does not act for an anonymous caller: its handler resolves the user from the request's `Authorization` header (`supabase/functions/results-import/index.ts:64`) and answers `401 unauthenticated` when there is none (`handler.ts:81-82`). The runtime check is defense in depth, not the only gate.
7. **Check.** With the app's public anon key (`EXPO_PUBLIC_SUPABASE_ANON_KEY`, the value the app already uses):

   ```sh
   curl -s -X POST https://<api hostname>/functions/v1/results-import \
     -H "Authorization: Bearer <anon key>" -H 'content-type: application/json' -d '{"action":"search"}'
   ```

   Expected: `{"ok":false,"error":{"code":"unauthenticated"}}` with HTTP 401 (the function is loaded and refuses a request that has no signed-in user). With JWT verification on (step 6), a request without an `Authorization` header is answered 401 by the runtime before the function runs. A 404 or 500 means the function is not loaded: read the logs of the `functions` service.

To go back to an earlier bundle, run the script again from a clone at that commit. Migrations are forward-only (see [Rolling back](#rolling-back)): do not roll the function back behind a migration it needs; fix forward.

### Check it locally

```sh
sh deploy/scripts/functions.test.sh
```

It builds the bundle in a temporary folder next to a stand-in volume (a `main` router like the template's, which gives every function the root `deno.jsonc` import map, plus another function), runs `deno check` on the delivered tree, loads it in the same `supabase/edge-runtime` image the stack runs on one random port of `127.0.0.1` (no other container, network or volume is touched), and checks that every module imports `catalogs.ts` through the right relative path at both depths, that the root `deno.jsonc` and the repository are unchanged, that `results-import` answers `401 unauthenticated`, that it does not load without `_vendor/catalogs.ts`, and that a `catalogs.ts` with imports, or any other import from `src/`, is refused. To only check the code, run the bundle script against an empty folder: `sh deploy/scripts/functions-bundle.sh "$(mktemp -d)"`.

## Demo data

`supabase/seed.sql` is the demo for development and walkthroughs. Everything in it is invented: a school ("Demo Swim School") with its own organization, hanging from a parent league organization ("Demo Swim League") whose three category templates (`Under 11`, `Under 14`, `Open`) become the school's categories, two groups and ten athletes (each with a category), six weeks of times in two events (so there is history and personal bests), one training plan, and the authorizations in force for two athletes. It has no platform admin account; if a walkthrough needs one, add it later.

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
sh deploy/scripts/migrate.test.sh   # migrate.sh against a temporary Postgres
sh deploy/scripts/smoke.test.sh     # compose up with a stand-in database; PowerSync liveness and Sync Streams load; a sync config change restarts PowerSync
sh deploy/scripts/functions.test.sh # results-import bundle loaded in the Edge Functions runtime image; see Edge Functions above
```
