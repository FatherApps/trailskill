# 0001. App and backend stack: Expo with Supabase and PowerSync

- Status: Accepted
- Date: 2026-10-24
- Decider: maintainer
- Issue: #11

## Context

The pilot design (`docs/superpowers/specs/2026-10-24-pilot-design.md`, section 7) requires local-first behavior:

- the local database on the device is the app's read source, and every write is saved locally first;
- writes go into an outbox with client-generated IDs and are sent when there is signal;
- several coaches record from different devices, every record keeps author, device and history, and conflicting edits are resolved by a platform administrator with an audit record;
- permissions are enforced on the server, and a coach's device holds only their assigned athletes;
- the app is React Native with Expo, Android first, iOS from the same code (`AGENTS.md`, Project organization).

Building offline sync by hand is the riskiest part of the pilot, so the backend must provide it.

## Decision

### Backend and sync

- **Supabase** as the backend: Postgres as the source of truth, Supabase Auth with verification codes, Row Level Security for server-side permissions, and Edge Functions for server logic (conflict resolution, FECNA import).
- **PowerSync** for sync: an SQLite database on each device, kept in sync with Postgres, with an upload queue that is processed when the device reconnects ([PowerSync + Supabase](https://docs.powersync.com/integration-guides/supabase-+-powersync)). Sync rules decide which rows each user's device receives.
- Database migrations, policies and functions are versioned in the repository under `supabase/`.

### App

| Concern | Choice |
| --- | --- |
| Framework | Expo SDK 58 (React Native 0.88; [changelog](https://expo.dev/changelog/sdk-58)) with TypeScript in strict mode. Re-check the latest stable SDK when the project is scaffolded. |
| Navigation | Expo Router |
| Local data and state | PowerSync React Native SDK and its reactive queries. No extra state library unless a concrete need appears. |
| Validation | Zod, with schemas shared between the app and the Edge Functions |
| Design-system dependencies | i18next with react-i18next and expo-localization, `@expo-google-fonts/*`, react-native-svg, expo-keep-awake, expo-haptics, `@react-native-community/netinfo` (from the design system's React Native handoff) |
| Tests | Jest with React Native Testing Library; Maestro for end-to-end flows |
| Builds and release | EAS Build, Submit and Update (`docs/RELEASING.md`). Play builds are AAB; internal test builds may be APK. |

## Alternatives considered

- **Firebase (Firestore).** Built-in offline cache and a single provider, but a document model that fits poorly with plan versions, audit trails and conflict history, and strong vendor lock-in.
- **Custom backend (Node and Postgres) with hand-written sync.** Full control, but writing and hardening offline sync would take months and is exactly the riskiest part.
- **Supabase with a hand-written sync layer** (for example WatermelonDB plus custom endpoints). Same backend, but we would own the sync protocol, retries and conflict detection.

## Consequences

- The local-first model, idempotent uploads and per-user sync scopes come from PowerSync instead of custom code.
- Two external services to operate and pay for: Supabase and PowerSync. PowerSync's pricing and hosting option (cloud or self-hosted) were not evaluated in this decision.
- Permissions live in two places that must agree: Row Level Security in Postgres (what a user may read and write) and PowerSync sync rules (what reaches each device). Both are versioned and reviewed together.
- Conflict detection needs explicit modeling (record versions and edit history in Postgres); PowerSync uploads writes but does not decide business conflicts.
- Supabase's only South American region is São Paulo (`sa-east-1`) ([regions](https://supabase.com/docs/guides/platform/regions)). Choosing it keeps primary data, backups and Auth in Brazil, not Colombia, and Supabase processes some account, support and CDN data outside the region ([data residency FAQ](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq)). A project's region cannot be changed in place.

## Open

- Legal validation under Colombian Law 1581 of 2012 for storing minors' data in Brazil (international transfer).
- PowerSync plan, cost and hosting option.
- SMS or email provider for verification codes, and its cost.
- Hosting budget for the pilot.
