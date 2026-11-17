# PROD backend: read-only checks report (#1113)

- Date: 2026-11-16
- Issue: #1113, the gate of the PROD series (#1114 to #1120)
- Related: #951, [ADR 0002](../decisions/0002-backend-hosting-on-dokploy.md), [`deploy/README.md`](../../deploy/README.md)

This report contains no secrets, IP addresses, or account, zone or tunnel identifiers. Every measurement was a read.

## Why this exists

The plan is to bring up a new Swimcro PROD backend on Dokploy and keep the current deployment as QA. Three assumptions had to hold before anything is built, because if one fails the design changes:

1. The PROD hostnames are free and the tunnel can route them.
2. `deploy/README.md` and the diagnosis in #951 disagree about how public traffic reaches the origin.
3. The Dokploy server has room for a second Supabase stack.

## Summary

| Check | Result |
| --- | --- |
| `swimcro-api.tuls.app` and `swimcro-sync.tuls.app` free | **Yes.** No DNS record of their own and no tunnel route. |
| Tunnel can route them | **Yes.** A one-level rule plus a proxied CNAME to the tunnel, inserted before the final 404 rule. |
| TLS covers them | **Yes.** The universal certificate covers `tuls.app` and `*.tuls.app`. |
| TLS contradiction | **Resolved.** Both documents were partly right, see [below](#tls-contradiction-resolved). |
| Capacity for two stacks | **Fits at the ADR 0002 minimum, with little margin. Q6 answered by Mario: PROD goes on the same server.** |

## Authorization

Every remote query was a read made under authorization `a6`, which Mario gave for this step through `orch-auth`, per action. Nothing was created, changed or deleted. The queries were:

- Cloudflare API, `GET` only: zones, DNS records, the `ssl` and `always_use_https` settings, certificate packs, universal SSL settings, the tunnel list and its ingress configuration.
- Dokploy: server health, home statistics and the container list. No environment variables and no secrets were read.
- `curl` HEAD over `http` and `https` against the four `trailskill-*` hostnames and the two `swimcro-*` hostnames.

## Hostnames

- `swimcro-api.tuls.app` and `swimcro-sync.tuls.app`: no DNS record of their own and no tunnel route. Free.
- `trailskill-api`, `trailskill-sync`, `trailskill-deploy` and `trailskill-mail` are proxied CNAMEs to a tunnel.
- **Side finding for Mario.** A wildcard `*.tuls.app` (type A, proxied) exists and resolves every unregistered name to a dead origin: HTTPS and HTTP both answer 522 after about 15 seconds. An explicit proxied CNAME to the tunnel takes precedence over the wildcard, so the PROD hostnames work once their CNAMEs exist. Whether to delete the wildcard is Mario's call and is not part of this issue.

## Tunnel routes

The tunnel uses a remote configuration and is healthy.

- `trailskill-api`: path rule `^/(auth|rest|storage|functions|realtime)/v1/`, service `http://` to the Dokploy proxy on port 80.
- `trailskill-sync` and `trailskill-mail`: service `http://` to the Dokploy proxy on port 80.
- `trailskill-deploy`: HTTP, port 3000.
- Final rule: `http_status:404`.
- There is no `swimcro` route. A one-level rule and a proxied CNAME to the tunnel can be added before the final 404.

## Zone TLS

- SSL/TLS mode: **Full** (not Flexible). *Always Use HTTPS*: off.
- The universal certificate is active and covers `tuls.app` and `*.tuls.app`. Single-level names are covered; `a.b.tuls.app` is not. A Let's Encrypt backup certificate exists.

## TLS contradiction resolved

`deploy/README.md` said that every hostname enters through a Cloudflare Tunnel with no published ports and that HTTPS ends at Cloudflare's edge. #951 said Cloudflare reaches the origin over plain HTTP on port 80 (Flexible mode). Both are partly right:

- **`deploy/README.md` is right about the path.** The tunnel ends TLS at Cloudflare's edge and no origin port is published for these hostnames.
- **#951 is right about the last hop.** `cloudflared` reaches the Dokploy proxy over plain HTTP on port 80.
- **The zone is not in Flexible mode.** For tunnel hostnames the zone mode does not take part in the origin hop.
- **Why Dokploy domains keep HTTPS off.** With `https: true` the Dokploy proxy redirects to HTTPS, but `cloudflared` enters over HTTP, so the request loops. That is the redirect loop seen in #951. Route A of #951 stays recommended.

Evidence, `curl` HEAD, status codes only:

| Hostname | `https://` | `http://` |
| --- | --- | --- |
| `trailskill-api` | 404 (served by Cloudflare) | 404, no redirect |
| `trailskill-sync` | 404 (JSON body) | 404, no redirect |
| `swimcro-api`, `swimcro-sync` | 522 | 522 |

The 404 on `trailskill-api` is expected: `/` does not match the path rule. The absence of a redirect on `http://` is consistent with Dokploy HTTPS being off. This report does not change `https: false`; that stays with #951.

## Capacity (D6)

The server is shared: 47 containers and about 16 services of other projects besides TrailSkill. The QA Supabase stack is 14 containers plus the QA PowerSync.

| Resource | Total | Used | Free |
| --- | --- | --- | --- |
| RAM | about 25.2 GB | about 15.5 GB (61 %) | about 9.7 GB |
| CPU | 8 cores | not measured | not measured |
| Disk | about 208 GB | about 143 GB (69 %) | about 65 GB |

[ADR 0002](../decisions/0002-backend-hosting-on-dokploy.md) asks for 4 to 8 GB of RAM and 2 to 4 cores per Supabase stack. QA already counts in the used figures, so only the PROD stack has to fit in the free space:

| PROD stack size | Free RAM left |
| --- | --- |
| 4 GB (ADR minimum) | about 5.7 GB. It fits, barely. |
| 8 GB (ADR small production) | about 1.7 GB. Almost no margin. |

**Technical verdict.** It fits at the minimum, but with little margin: a spike in any neighbour or in QA can take PROD down.

**Decision (Q6, answered by Mario on 2026-11-16, relayed by the maintainer).** The question was whether PROD needs a bigger or a separate server. Mario decided that PROD goes on the **same Dokploy server**, in its own project, «Swimcro PROD». His reasoning: current use is minimal, and if space is needed the QA resources can be cut.

What follows from that:

- If room is needed, QA gets memory and CPU limits. That step is planned in #1116.
- Capacity is watched with thresholds, planned in #1115.
- The technical verdict above does not change: the measured figures stand.

## Not measured

- Memory and CPU use per stack.
- Ports published by the Dokploy proxy.
