# Authorizations when joining a school

- Status: **confirmed** by Mario on 2026-11-21.
- Issue: #1328.
- This describes product behavior. The server is `accept_invitation` (`20261121120000_accounts_accept_invitation_authorizations.sql`); the screen is the authorizations step of the registration (`src/modules/accounts`).

## 1. The rule

Status: **confirmed** (Mario, 2026-11-21). His words:

> «si una escuela llama a un usuario o nadador por decirlo asi o un nadador decide incorporarse a una escuela el registro de sus datos o tiempos debe quedar autorizado automaticamente porque si no habra problemas para que las escuelas y entrenadores pueda ver o editar esta informacion.»

He chose the option «Todo de una vez»: joining a school accepts `record_times`, `import_official_results` and `share_results_with_school` in one acceptance, and the text and version shown are kept as evidence.

## 2. What it means

- Joining a school with an invitation link accepts the three purposes together, for each swimmer who joins. The screen shows each purpose with its full text and version, without checkboxes, and names the swimmers who join. One «Aceptar» covers all of them.
- «Continuar sin unirme» joins nothing and calls no server: the swimmer is registered without a school and the authorizations stay as they were.
- `show_photo` is not part of joining. It stays an optional box, separate, on the same screen.
- The evidence is the same as for any authorization: one row per purpose with the accepted text and version, the adult who accepted, the swimmer, and the device time of the acceptance. It is written in the same transaction as the school and group link, so one cannot exist without the other.
- The scope is per swimmer, as before: the authorization has no school. It stays in force if the swimmer leaves the school.
- Withdrawing does not change: one purpose at a time, from Ajustes › Autorizaciones.
- This replaces, for joining a school only, the rule «one acceptance never implies another» (`docs/superpowers/specs/2026-10-24-pilot-design.md`, sections 6.1 point 4 and 8). Registering without an invitation, adding a swimmer without a school, and managing authorizations later still ask for each purpose separately and never pre-check.

## 3. Consequences accepted by the maintainer

- No change of schema and no backfill: swimmers who joined a school before this change keep the authorizations they had.
- Older app versions, and invitations queued before the update, cannot join: the old three-argument `accept_invitation` no longer exists, and a queued invitation without the acceptance is never sent (it expires with the registration draft).
- A purpose withdrawn earlier is granted again when the family joins another school, because the screen shows it explicitly.
- Out of scope: a new way to join a school, what the school shares with the guardian (`timing_guardian_sharing`), and rewriting the legal texts.
- Legal review of the texts is still pending (#106).
