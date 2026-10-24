# 0003. Modular architecture and patterns

- Status: Accepted
- Date: 2026-10-24
- Decider: maintainer
- Issue: #17

## Context

- Several people and agents will work on TrailSkill at the same time. Each one should be able to own a part of the product without touching the others.
- The pilot runs in Colombia, but schools, leagues, federations and even sports change from country to country. The code must not be tied to one country or organization (for example FECNA, the Colombian swimming federation).
- ADR 0001 fixed one Expo app and one repository; the pilot design (section 12) splits delivery into independent steps.

## Decision

### Modules in one app and one repository

- The app is a **modular monolith**: `src/core/` holds the shared foundation and `src/modules/<module>/` holds one feature module per product area: `accounts`, `timing`, `training-plans`, `athletes`, `school-console`, `results-import`.
- `src/app/` holds only Expo Router routes; each route renders a screen exported by a module.
- A module is used by others only through its `index.ts`. `core` never imports a module. These rules are enforced by lint in CI.
- The backend follows the same modules: migration files are prefixed with their module (`<timestamp>_<module>_<change>.sql`), database tests live in `supabase/tests/database/<module>/`, server functions in `supabase/functions/<module>-<name>/`, and PowerSync streams are grouped and prefixed per module. Each table belongs to one module.

### Patterns

- **Repository:** screens and hooks never query the database. Each module exposes repository interfaces (for example `AthleteRepository`) with a PowerSync implementation in its `data/` folder; tests use in-memory fakes.
- **Ports and adapters with a registry:** each external system a module depends on is a port (an interface) owned by that module. Each concrete system is an adapter, and a registry (a factory keyed by data) returns the adapter to use. Official results import uses the `ResultsProvider` port; each federation is an adapter named `<country>-<organization>` (for example `co-fecna`) under `supabase/functions/results-import/providers/`, returning normalized results only. The external timing button follows the same pattern.
- **Generic organizations:** federations, leagues, clubs and schools are rows of one `organizations` table with a type, an ISO 3166 country code and a parent organization. No organization, federation, league or country name is written in code; screens show the organization's name from data.
- **Sport layer:** strokes, distances, pools and other sport vocabulary live in sport catalogs in `src/core/sport/`, never hard-coded in modules.

## Alternatives considered

- **Monorepo with one package per module** (workspaces). Real isolation, but more build and tooling cost for a single app; lint rules give the independence we need now, and a module can still be extracted later.
- **Folders by technical layer** (`screens/`, `services/`, `models/` for the whole app). Simple at first, but every feature touches every folder, so people collide.
- **Dependency injection container and generic factories everywhere.** More indirection than the variations we actually have (countries, federations, storage).

## Consequences

- Parallel work maps to modules: one issue usually touches one module, plus `src/app/` routes.
- Changes to `src/core/` affect everyone and need maintainer review.
- Adding a country or federation means adding an adapter and data, not changing modules.
- Cross-module features go through public module APIs, which takes some design effort up front.
- Any new pattern beyond these needs its own ADR.
