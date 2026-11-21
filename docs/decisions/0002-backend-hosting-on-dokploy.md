# 0002. Backend hosting: self-hosted on Dokploy

- Status: Accepted; amended 2026-11-16 (environments, email provider, backups) and 2026-11-21 (every deployment that holds real data is backed up)
- Date: 2026-10-24
- Decider: maintainer
- Issue: #15
- Amends: [0001](0001-app-and-backend-stack.md) (hosting and region)

## Context

ADR 0001 chose Supabase and PowerSync but left their hosting open, and its consequences assumed Supabase Cloud in São Paulo (`sa-east-1`), which keeps the pilot's data in Brazil. The team already runs a Dokploy server, and the maintainer decided to host the whole backend there.

Phones and tablets reach the backend over mobile data and school Wi-Fi, so the services they call must be reachable from the internet. Continuous deployment from GitHub also needs a way in.

## Decision

### Where

All backend services run on the Dokploy server at `balerion.internal:3000`, organization `fatherApps`, project `TrailSkill`:

- **Supabase**, self-hosted with its Docker stack: Postgres, Auth, the REST API, Edge Functions, Storage and Studio ([self-hosting](https://supabase.com/docs/guides/self-hosting/docker)). Edge Functions run in the self-hosted stack without extra setup ([self-hosted functions](https://supabase.com/docs/guides/self-hosting/self-hosted-functions)).
- **PowerSync Open Edition**, the self-hosted sync service (`journeyapps/powersync-service`), with Postgres as its bucket storage so no MongoDB is needed ([installation](https://docs.powersync.com/self-hosting/installation)). The app's Postgres runs with `wal_level = logical`, a `powersync` publication and a replication role, as PowerSync requires.

### What is exposed to the internet

Only over HTTPS on a public domain, with certificates managed by Dokploy's Traefik.

| Service | Public | Why |
| --- | --- | --- |
| Supabase API gateway (Auth, REST, Edge Functions, Storage) | Yes | The app calls it. |
| PowerSync service | Yes | Devices sync through it. |
| Dokploy deploy webhook (`/api/deploy/...`) | Yes, only that path | GitHub triggers continuous deployment on push ([auto deploy](https://docs.dokploy.com/docs/core/auto-deploy)). |
| Dokploy panel | No | Administration; internal network only. |
| Supabase Studio | No | Administration; internal network only. |
| Postgres port | No | Migrations and functions are applied from inside the server, never by opening the database. |

## Alternatives considered

- **Supabase Cloud (`sa-east-1`) and PowerSync Cloud.** Least to operate, with managed backups, but the data lives in Brazil and both services are paid monthly.
- **Supabase Cloud with PowerSync on Dokploy.** Halves the operating work, but keeps the data in Brazil, which was the main concern of ADR 0001.

## Consequences

- We operate everything: updates, backups, monitoring and uptime. Self-hosting loses Supabase Cloud's managed backups and point-in-time recovery, so database backups must go off the server and restores must be tested.
- The pilot depends on one server and its internet link. When it is down, devices keep working offline (local-first) and sync when it returns.
- Supabase documents 4 GB of RAM and 2 CPU cores as the minimum for the full self-hosted stack, and 8 GB and 4 cores for small production workloads; PowerSync runs on top of that.
- The data stays where the server is. If the server is in Colombia, the international transfer to Brazil noted in ADR 0001 no longer applies.
- PowerSync Open Edition has no dashboard, and its docs still call it a beta while describing it as production-ready for stability ([self-hosting](https://docs.powersync.com/intro/self-hosting)).
- Exposing the deploy webhook needs a proxy rule so that only that path of the Dokploy host is public.

## Open

As of 2026-11-16, three of the points below are closed by the [amendment](#amendment-2026-11-16-qa-and-prod-environments-email-provider-and-backups): the environments, the email provider and the backups (destination, schedule and restore test stay open there until their issues close). The list is kept as written on 2026-10-24.

- Public domain and DNS, and how the server is exposed (port forwarding with a fixed IP, or a tunnel).
- Physical location of the server, to confirm data residency under Colombian Law 1581 of 2012.
- Backup destination, schedule and restore test.
- Environments inside the Dokploy project (one shared environment, or separate staging and production).
- How migrations and Edge Functions from `supabase/` are applied on each deployment.
- PowerSync Open Edition license terms for this use.
- Still open from ADR 0001: the email provider, now only for the fallback sign-in code and invitations ([ADR 0004](0004-sign-in-with-google-microsoft-and-email-code.md)), and the hosting budget.

## Amendment 2026-11-16: QA and PROD environments, email provider and backups

Tracking issue: #1114. This amendment closes three points of the Open list above. It does not change the decisions above: the services, the exposure table and the consequences apply to each environment. It contains no values, secrets or account identifiers: those live only in the Dokploy and EAS interfaces, where the maintainer sets them.

### Environments

There are two backend environments, not one.

| | QA | PROD |
| --- | --- | --- |
| What it is | The deployment that exists today, renamed. | A new deployment that starts empty. |
| Data | Demo data and test accounts. | Real data only. Nothing is copied from QA, and QA accounts are registered again. |
| Deployed from | Every push to `main`, as before. | A release tag `vX.Y.Z` that the maintainer starts. A push to `main` never changes PROD. The mechanism (a `production` branch that only the maintainer advances to the tag, or a direct deploy by tag if Dokploy supports it) is settled in #1116. |
| Hostnames | `trailskill-api`, `trailskill-sync`, `trailskill-mail` (unchanged). | `swimcro-api`, `swimcro-sync`. No Mailpit and no Studio. |
| Secrets | Its own. | Its own, never shared with QA: JWT secret and anon key, database and PowerSync passwords, the Vault `athlete_identity_key`, and its own Google OAuth client. |
| Demo seed | May be applied (`APPLY_SEED`). | Never: `APPLY_SEED` stays `false`. |
| Email | Resend (see below). | Resend (see below). |

Both environments run the same `deploy/compose.yaml` on the same Dokploy server, PROD in its own Dokploy project. The Dokploy deploy webhook hostname is shared. The internal build that is on Google Play today and the EAS `production` environment point to QA until the cut to PROD (#1120); `preview` and test builds stay on QA.

Not decided here, and pending the read-only checks of #1113: whether one server has the capacity for two Supabase stacks (see the sizing in Consequences), and how Cloudflare reaches the origin for the new hostnames (the TLS mode). The runbooks must not state either as a fact until #1113 reports.

Order of change: the backend always goes first. A release moves PROD's migrations forward before any build from the same tag reaches users, and migrations are forward-only (expand, then contract). The steps are in [`docs/RELEASING.md`](../RELEASING.md#backend-environments-and-release-order).

### Email provider

Auth sends the sign-in code and invitations through Resend over SMTP, with the sender `Swimcro <no-reply@send.tuls.app>`. QA already sends this way: Mailpit no longer receives the codes. Before any new DNS record is created for PROD, the maintainer confirms which sending domain is already verified in Resend. The SMTP credentials are set only in the Dokploy interface.

### Backups

A database backup that leaves the server, and a restore that was tested, are a gate: real families are not invited to PROD until both exist (#1119). The destination is chosen by the maintainer. ~~QA is not backed up.~~ (Replaced by the [2026-11-21 amendment](#amendment-2026-11-21-every-deployment-with-real-data-is-backed-up) below.)

### Series issues

#1113 (read-only checks before building PROD), #1115 (Supabase PROD stack runbook), #1116 (PROD compose, domains and deploy by tag), #1117 (Edge Functions and `pg_cron` in PROD), #1118 (first school administrator and school rows in PROD), #1119 (backups and a tested restore), #1120 (cut to PROD: EAS `production`, internal build and smoke test).

## Amendment 2026-11-21: every deployment with real data is backed up

Tracking issue: #1335 (part of the series #1335 to #1337). The maintainer's directive, verbatim: «a partir de ahora todo en la base de datos debe respaldarse para evitar que no se pierdan los datos de la prueba y de los usuarios.»

This replaces «QA is not backed up» (2026-11-16 amendment, Backups). Today there is one backend, the Dokploy project `TrailSkill` that the documents call QA, and it probably serves the Google Play build the pilot testers use, so it can hold real data from testers and users. The rule is therefore about the data, not the name of the environment:

- **Every deployment whose `migrate.sh` runs against real data is backed up**: today the `deploy` compose of the Dokploy project `TrailSkill`; PROD too, when it exists.
- Backups go off the server (Cloudflare R2, see the [runbook](../deploy/prod-backup-restore.md)) and keep **14 days** of copies (`BACKUP_KEEP_DAYS`), so one bad copy cannot replace the only good one and an earlier copy can be restored.
- The gate of 2026-11-16 does not change: real families are not invited to PROD until a backup has left the server and a restore from it was tested (#1119).

Not decided here: the schedule and the copy before each migration (#1336) and the daily freshness alert (#1337).
