# PROD deploy compose, domains and tag deploy (#1116)

- Date: 2026-11-16
- Issue: #1116, part of the PROD series (#1113 to #1120)
- Related: #951, #913, #1113, #1115, #1117, #1119, #1120, [ADR 0002](../decisions/0002-backend-hosting-on-dokploy.md), [`deploy/README.md`](../../deploy/README.md), [step 0 report (#1113)](prod-step0-readonly-checks.md), [PROD Supabase stack runbook (#1115)](prod-supabase-runbook.md)

> **Status: proposed procedure.** The maintainer approves it before anything is applied. Every remote action (GitHub branch and ruleset, Dokploy, Cloudflare) needs its own `orch-auth` authorization from Mario, per action. **Nothing in this document has been applied.**

This document contains no secrets, IP addresses, or account, zone, tunnel or container identifiers. Values are set only in the Dokploy and Cloudflare interfaces.

## Summary

| Question | Answer |
| --- | --- |
| Do two copies of `deploy/compose.yaml` collide on one server? | **No code change needed.** The only risk is configuration, covered by the [setup checklist](#c-one-time-setup). |
| Can Dokploy deploy by tag? | **No, not usable.** PROD deploys from a `production` branch that only the maintainer moves to a release tag. |
| Which hostnames? | `swimcro-api.tuls.app` and `swimcro-sync.tuls.app`. No Mailpit, no Studio. The webhook hostname is shared. |
| How to go back? | Move `production` back to the previous tag ([Rollback](#e-rollback-back-to-the-previous-tag)). Migrations stay: fix forward. |

## a) Collision report: two copies of `deploy/compose.yaml` on one server

Dokploy v0.31.4 (`packages/server/src/utils/builders/compose.ts`, `createCommand`) runs `docker compose -p <appName> ... -f deploy/compose.yaml up -d --build --remove-orphans`. The `-p` flag overrides the top-level `name: trailskill-deploy`, so each Dokploy compose uses its own app name as the Compose project, and Dokploy keeps app names unique.

| Name checked | How it is formed | Result |
| --- | --- | --- |
| Compose project | `-p <appName>`, not `trailskill-deploy` | No collision. |
| Containers | No `container_name` in the file, so `<appName>-<service>-1` | No collision. |
| Volume `powersync-storage-data` | `<appName>_powersync-storage-data` | No collision. |
| Default network | `<appName>_default`; `powersync-storage` is only on it, so each PowerSync reaches its own storage | No collision. |
| Published ports | None | No collision. |
| `supabase` external network | `SUPABASE_NETWORK`. PROD sets it to the PROD stack's `<PROD supabase app name>_default`, never QA's | Collision only by misconfiguration. Covered by the checklist. |
| `traefik` external network (`dokploy-network`) | Shared on purpose. Both PowerSync containers carry the alias `powersync` there, but Traefik routes by container labels (container IP), not by DNS, and no service resolves `powersync` over that network | No functional collision. |
| Database host | `SUPABASE_DB_HOST` has no default (`:?`), so it is set per deploy. The short name `db` is the real risk: PowerSync is also on `dokploy-network`, where another project's `db` once answered (incident in #913). The Dokploy Supabase template (Dokploy/templates, `blueprints/supabase/docker-compose.yml`) sets no `container_name`, so the PROD database container is `<PROD supabase app name>-db-1`, unique on the server | **PROD sets `SUPABASE_DB_HOST` to that container name, never `db`.** QA is unchanged (#913 owns QA). |
| Manual `docker compose` on the server | Without `-p` both copies use `trailskill-deploy` | **Never run the deploy compose by hand on the server.** |

**Result: no code change needed.** The only collision risk is configuration. It is covered by the [setup checklist](#c-one-time-setup) and by the [database host check](#h-checks-after-applying-read-only) after the deploy.

## b) Deploy by tag: why a `production` branch

Checked in Dokploy v0.31.4 source:

- Dokploy has a `tag` trigger type (`triggerType: tag`). But the GitHub webhook (`apps/dokploy/pages/api/deploy/github.ts`) fires it on **any** `refs/tags/*` push, for every tag-trigger compose of the repository. The deploy then runs `git clone --branch <configured branch> --depth 1` (`packages/server/src/utils/providers/github.ts`): the tag name is not used. A tag trigger would deploy the head of a branch, on any tag. **Not usable.**
- The branch field in the Dokploy UI lists only branches, so pointing the compose at a tag is not a UI option either.
- With `triggerType: push`, Dokploy deploys a compose only when the pushed branch equals its configured branch. A push to `main` cannot reach a compose configured on `production`. A tag push triggers no push-type compose.

**Design:** a PROD compose on branch `production`, trigger `push`, auto deploy on, empty watch paths. `production` only ever points at a release tag, and only the maintainer moves it. QA keeps deploying from `main`, unchanged.

A commit message with `[skip ci]` skips the Dokploy deploy too. Release commits must not carry it.

## c) One-time setup

Mario does each step by hand, each with its own `orch-auth`.

- [ ] **1. GitHub: create `production`** at the first PROD release tag:

  ```sh
  git push origin 'vX.Y.Z^{commit}:refs/heads/production'
  ```

- [ ] **2. GitHub ruleset on `production`.** The repository is a public organization repository, so rulesets are available. Restrict creations, updates and deletions, and block force pushes. The bypass list is the maintainer only.
  - The ruleset stops collaborators and bots. A session that uses the maintainer's own credentials can bypass it. For agents the rule is the [`AGENTS.md`](../../AGENTS.md) hard limit: agents never push `production`, the same as `main`.
- [ ] **3. Dokploy, project «Swimcro PROD»** (created in the [#1115 runbook](prod-supabase-runbook.md)). Create a compose named `deploy`:
  - Provider GitHub, this repository, branch `production`, compose path `deploy/compose.yaml`.
  - Trigger type `push`, auto deploy on, no watch paths.
  - Environment variable names only (values are Mario's, set in Dokploy):

    | Variable | Value |
    | --- | --- |
    | `SUPABASE_NETWORK` | `<PROD supabase app name>_default` |
    | `SUPABASE_DB_HOST` | `<PROD supabase app name>-db-1`, never `db` ([collision report](#a-collision-report-two-copies-of-deploycomposeyaml-on-one-server)) |
    | `SUPABASE_DB_PASSWORD` | Same value as the PROD stack ([#1115](prod-supabase-runbook.md)) |
    | `POWERSYNC_DB_PASSWORD` | PROD's own |
    | `POWERSYNC_STORAGE_PASSWORD` | PROD's own |
    | `SUPABASE_JWT_SECRET` | Same value as the PROD stack ([#1115](prod-supabase-runbook.md)) |
    | `APPLY_SEED` | `false`, for ever |

    Every value is PROD's own. None is copied from QA.
- [ ] **4. First deploy.** Either finish the [domains](#f-domains-and-tunnel) first to have a single check pass, or deploy now and read the `migrate` log (it must exit 0) and the `powersync` state.

Out of scope here: Edge Functions (#1117), backups (#1119), the cut to PROD (#1120).

## d) Each release

After the tag exists ([`docs/RELEASING.md`](../RELEASING.md#standard-release-from-main) or [Hotfixes](../RELEASING.md#hotfixes)):

1. `git fetch origin --tags`
2. `git push origin 'vX.Y.Z^{commit}:refs/heads/production'`
   - It is a plain push, so git rejects it unless it is a fast-forward.
   - A hotfix tag built on the previous release tag is a fast-forward too. A hotfix for an older line is not: stop and ask the maintainer.
3. Dokploy deploys the PROD compose. Read the `migrate` log (exit 0) and confirm `powersync` is running.

This is step 2 of [Order for each version](../RELEASING.md#order-for-each-version).

## e) Rollback (back to the previous tag)

**Code.** The maintainer moves `production` back:

```sh
git push --force-with-lease=production:vNEW origin 'vPREV^{commit}:refs/heads/production'
```

- The lease makes the push fail if `production` is not where the maintainer thinks it is.
- This is the only force push in the whole flow. Maintainer only, through the ruleset bypass.
- Dokploy deploys the previous tag on that push. The next release fast-forwards from there as usual.

**Database.** Migrations are forward-only ([Rolling back](../../deploy/README.md#rolling-back), [`docs/RELEASING.md`](../RELEASING.md#order-for-each-version)).

- `deploy/scripts/migrate.sh` applies only the migration files present in the checkout and skips versions already recorded. It does not fail when the database holds versions that have no file. So redeploying an older tag leaves the newer schema in place.
- This is safe only because [`docs/RELEASING.md`](../RELEASING.md#order-for-each-version) requires migrations to stay compatible with the previous app version (expand, then contract).
- If a migration broke that rule, **roll forward with a new migration** instead of rolling back.
- The older tag also brings its own `powersync/sync-config.yaml`. Read the `powersync` log after the rollback.

**Verify** after a rollback with the same checks as a release ([section d](#d-each-release), step 3).

## f) Domains and tunnel

Manual steps for Mario, each with its own `orch-auth`. Only two hostnames: no Mailpit, no Studio.

| Hostname | Dokploy service | Port | Tunnel rule |
| --- | --- | --- | --- |
| `swimcro-api.tuls.app` | PROD Supabase stack, service `api-gw` | 8000 | Path rule below. Same origin service as the `trailskill-api` route (the Dokploy proxy, HTTP, port 80). |
| `swimcro-sync.tuls.app` | PROD `deploy` compose, service `powersync` | 8080 | No path rule. Same origin service as `trailskill-sync`. |

Path rule for `swimcro-api.tuls.app`, the same as `trailskill-api`: `^/(auth|rest|storage|functions|realtime)/v1/`.

Steps:

- [ ] Add the two Dokploy domains with **HTTPS off** and no certificate. With HTTPS on, the Dokploy proxy redirects while `cloudflared` enters over HTTP, which loops ([#1113 report](prod-step0-readonly-checks.md#tls-contradiction-resolved)).
- [ ] Add the two public hostnames to the tunnel **before** the final `http_status:404` rule. Never reorder or replace existing rules: the tunnel serves other sites.
- [ ] Add a proxied CNAME to the tunnel for each hostname. It takes precedence over the `*.tuls.app` wildcard ([#1113 report](prod-step0-readonly-checks.md#hostnames)).
- [ ] Nothing to add for `trailskill-deploy.tuls.app`: the webhook hostname is shared.

Route A of #951 applies (the tunnel path), so there are no origin certificates and no change to the zone SSL mode (Full, not Full strict).

## g) `http://` to `https://`

"Always Use HTTPS" is zone-wide and off today. The zone is shared with other projects and with QA.

**Recommended:** a Cloudflare Single Redirect rule scoped to the two hostnames.

| Field | Value |
| --- | --- |
| Expression | `(http.host in {"swimcro-api.tuls.app" "swimcro-sync.tuls.app"} and not ssl)` |
| Target (dynamic) | `concat("https://", http.host, http.request.uri.path)` |
| Status code | 301 |
| Query string | Preserve |

**Alternative:** turn on Always Use HTTPS for the whole zone. It also changes QA and the other projects' hostnames, so it is Mario's decision.

## h) Checks after applying (read-only)

- [ ] `curl -sI https://swimcro-api.tuls.app/auth/v1/health` is answered by GoTrue (not a 522 or a 404 from Cloudflare), and `curl` without `-k` succeeds (valid certificate).
- [ ] `curl -sI https://swimcro-sync.tuls.app/` is answered by PowerSync (a JSON 404, like QA in the [#1113 report](prod-step0-readonly-checks.md#tls-contradiction-resolved)).
- [ ] `curl -sI http://swimcro-api.tuls.app/` and `curl -sI http://swimcro-sync.tuls.app/` return 301 to `https://`.
- [ ] A push to `main` creates a new deployment in the QA compose and none in the PROD compose (Dokploy deployment list, read only).
- [ ] The database host resolves to exactly one address, the PROD database container. From the PROD `powersync` container, read only: `getent hosts <SUPABASE_DB_HOST>`. Record no addresses in the repository.
- [ ] QA is unchanged: the current build signs in and syncs against QA.

## i) Optional: memory and CPU limits for QA (Q6)

Only if PROD needs room ([#1113 report](prod-step0-readonly-checks.md#capacity-d6)). Do not invent numbers.

1. Measure first: `docker stats --no-stream` for the QA stack (read only).
2. Set limits above the observed peak with margin: `deploy.resources.limits.memory` and `cpus` per heavy service (such as `db`, `realtime`, and `analytics` if present), in the QA Supabase stack's compose in Dokploy.
3. One service at a time. After each one, check QA sign-in and sync.

QA PowerSync already caps the Node heap with `NODE_OPTIONS=--max-old-space-size=1000`. `deploy/compose.yaml` is shared by QA and PROD, so no limits are added there in this issue. Each change is a remote action with its own `orch-auth`.
