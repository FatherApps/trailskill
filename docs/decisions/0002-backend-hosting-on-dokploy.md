# 0002. Backend hosting: self-hosted on Dokploy

- Status: Accepted
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

- Public domain and DNS, and how the server is exposed (port forwarding with a fixed IP, or a tunnel).
- Physical location of the server, to confirm data residency under Colombian Law 1581 of 2012.
- Backup destination, schedule and restore test.
- Environments inside the Dokploy project (one shared environment, or separate staging and production).
- How migrations and Edge Functions from `supabase/` are applied on each deployment.
- PowerSync Open Edition license terms for this use.
- Still open from ADR 0001: the email provider, now only for the fallback sign-in code and invitations ([ADR 0004](0004-sign-in-with-google-microsoft-and-email-code.md)), and the hosting budget.
