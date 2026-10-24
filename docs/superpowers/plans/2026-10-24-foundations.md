# Foundations (delivery step 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A runnable TrailSkill app shell on Android that signs a user in, stores data locally first, syncs it to Supabase through PowerSync with server-side permissions, and shows a truthful sync state, so later delivery steps only add features.

**Architecture:** One Expo app at the repository root (`src/` by feature). Postgres in Supabase is the source of truth; Row Level Security enforces who reads and writes what. PowerSync keeps an SQLite copy on each device scoped by Sync Streams that mirror RLS, and an upload queue that the app's connector sends to Supabase. Per-record sync state comes from a local-only `pending_writes` table written in the same transaction as each change.

**Tech Stack:** Expo SDK 58 (React Native 0.88), TypeScript strict, Expo Router, `@powersync/react-native` + `@op-engineering/op-sqlite` (≥ 1.17.0) + `@powersync/react`, `@supabase/supabase-js`, Zod, Jest (`jest-expo`) + React Native Testing Library, Supabase CLI with pgTAP, EAS Build.

**Spec:** `docs/superpowers/specs/2026-10-24-pilot-design.md` (sections 4, 5, 7, 12 step 1) and `docs/decisions/0001-app-and-backend-stack.md`.

## Global Constraints

- Android first; every Play build targets Android 16 (API level 36) or higher (`AGENTS.md`, Google Play requirements).
- `@op-engineering/op-sqlite` does not run in Expo Go: development uses an EAS development build.
- Visual values come only from the design system (`design/README.md`); components never contain literal hex colors.
- Missing time is null, never 0 (spec section 6.2).
- The local database is the app's read source; the screen never waits for the network (spec section 7).
- Local data is never lost: no write is dropped silently, including writes the server rejects (spec section 7).
- Permissions are enforced by the backend; hiding a screen is never the only protection (spec section 5.2).
- Only synthetic data in tests, seeds and fixtures (`CONTRIBUTING.md`).
- Secrets never in the repository: `.env` stays ignored, `.env.example` lists names only.
- Android application ID `com.fatherapps.trailskill` is **provisional**: it must be confirmed by the maintainer before the first Google Play upload (`docs/RELEASING.md`, Open decisions).
- Code, identifiers and commits in English; UI strings as translation keys with `es-CO` as the working locale.
- Each task below is one GitHub issue and one pull request, following `CONTRIBUTING.md` and the `trailskill-repo-flow` skill.

## Review Focus

1. **App killed with pending writes.** A force-quit or dead battery between a write and its upload must lose nothing; the record is still "En el teléfono" after restart. Pinned in Task 6.
2. **Server rejects an upload** (RLS denial `42501` or a constraint error). The write must not block the queue and must not vanish: it is kept and shown as "No enviado". Pinned in Task 5.
3. **Session token expires while offline for days.** On reconnect the connector must refresh the session and resume uploads without user action. Pinned in Task 5.
4. **Another person signs in on the same device.** The previous user's local data must never be visible to the next user, and signing out with pending writes must warn first. Pinned in Task 7.
5. **A coach loses an assignment.** After the change syncs, that athlete disappears from the coach's device and the server refuses the coach's new writes for that athlete. Pinned in Tasks 4 and 5.

---

## File structure

```
app.config.ts                 Expo config (name, android.package, plugins)
eas.json                      Build profiles (development, preview APK, production AAB)
tsconfig.json                 strict
jest.config.js                jest-expo preset
.env.example                  EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_POWERSYNC_URL
src/app/_layout.tsx           Root providers: fonts, theme, i18n, session, PowerSync
src/app/(auth)/sign-in.tsx    Email code sign-in
src/app/(app)/index.tsx       Home placeholder with global sync status
src/core/theme/tokens.ts           Design-system tokens as typed constants
src/core/theme/contrast.ts         WCAG contrast ratio
src/core/theme/ThemeProvider.tsx   useTheme()
src/core/i18n/index.ts             i18next setup; src/core/i18n/es-CO.json
src/core/time/time.ts            Time values and formatting
src/core/sync/schema.ts            PowerSync client schema
src/core/sync/db.ts                PowerSyncDatabase instance
src/core/sync/supabase.ts          Supabase client
src/core/sync/connector.ts         SupabaseConnector (fetchCredentials, uploadData)
src/core/sync/writes.ts            writeRecord / deleteRecord with pending_writes
src/core/sync/syncState.ts         Per-record and global sync state
src/core/session/SessionProvider.tsx  Session, sign-in, guarded sign-out
supabase/config.toml
supabase/migrations/20261025000000_foundations.sql
supabase/seed.sql             Synthetic data only
supabase/tests/database/foundations_rls.test.sql
powersync/sync-config.yaml    Sync Streams (edition 3)
.github/workflows/app-checks.yml
```

---

### Task 1: App scaffold, build profiles and CI

**Files:**
- Create: `package.json`, `app.config.ts`, `eas.json`, `tsconfig.json`, `jest.config.js`, `.eslintrc.js`, `.env.example`, `src/app/_layout.tsx`, `src/app/(app)/index.tsx`, `src/app/__tests__/home.test.tsx`, `.github/workflows/app-checks.yml`
- Modify: `AGENTS.md` (section Commands), `.gitignore` (add `node_modules/`, `.expo/`, `android/`, `ios/`, `dist/`)

**Interfaces:**
- Produces: npm scripts `typecheck` (`tsc --noEmit`), `lint` (`expo lint`), `test` (`jest`); Expo Router root at `src/app`.

- [ ] **Step 1: Scaffold** an Expo SDK 58 TypeScript app with Expo Router at the repository root (keep existing files). Verify: `npx expo --version` and `package.json` show `expo` 58.x; `npx expo-doctor` reports no errors.
- [ ] **Step 2: Configure** `app.config.ts`: `name: "TrailSkill"`, `slug: "trailskill"`, `android.package: "com.fatherapps.trailskill"` (provisional, see Global Constraints), `userInterfaceStyle: "automatic"`, plugin `expo-router`. `eas.json`: `cli.appVersionSource: "remote"`; profiles `development` (`developmentClient: true`, `distribution: "internal"`), `preview` (`distribution: "internal"`, `android.buildType: "apk"`, `channel: "preview"`), `production` (`autoIncrement: true`, `channel: "production"`). `tsconfig.json`: `"strict": true`.
- [ ] **Step 3: Write the failing test** `src/app/__tests__/home.test.tsx`: renders `src/app/(app)/index.tsx` and asserts the text from key `home.title` (`"TrailSkill"`) is on screen.
- [ ] **Step 4: Run** `npm test -- home` → FAIL (screen missing).
- [ ] **Step 5: Implement** the home screen showing `t('home.title')`.
- [ ] **Step 6: Module boundaries.** Create `src/core/` and `src/modules/` as described in `AGENTS.md` → Architecture (each module starts with only an `index.ts` exporting nothing). Add an ESLint `no-restricted-imports` configuration that fails when code outside a module imports `src/modules/<module>/` internals instead of its `index.ts`, and when `src/core/` imports anything from `src/modules/`. Add `src/core/__tests__/boundaries.lint-fixture.ts` importing `../../modules/timing/screens/x` and prove with `npx eslint --no-ignore src/core/__tests__/boundaries.lint-fixture.ts` that lint reports the violation; then exclude that fixture from the normal `lint` run.
- [ ] **Step 6b: Run** `npm run typecheck && npm run lint && npm test` → all pass.
- [ ] **Step 7: CI.** `.github/workflows/app-checks.yml` on `pull_request`: checkout pinned by SHA (`actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, v7.0.1), `actions/setup-node` pinned by SHA (look up the latest release's commit), Node LTS, `npm ci`, then `npm run typecheck`, `npm run lint`, `npm test`. `permissions: contents: read`. Validate with `actionlint`.
- [ ] **Step 8: Docs.** Replace "Pending" in `AGENTS.md` → Commands with: install `npm ci`; run `npx expo start --dev-client`; `npm run typecheck`; `npm run lint`; `npm test`; development build `eas build --profile development --platform android`.
- [ ] **Step 9: Commit** `build: scaffold Expo app with CI checks`.

### Task 2: Theme, fonts and i18n from the design system

**Files:**
- Create: `src/core/theme/tokens.ts`, `src/core/theme/contrast.ts`, `src/core/theme/ThemeProvider.tsx`, `src/core/theme/__tests__/tokens.test.ts`, `src/core/theme/__tests__/ThemeProvider.test.tsx`, `src/core/i18n/index.ts`, `src/core/i18n/es-CO.json`
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Produces: `type ThemeName = 'light' | 'dark'`; `colors: Record<ThemeName, Record<ColorToken, string>>` where `ColorToken` is the union of every color token name in the design system's `tokens.json`; `space`, `radius`, `size`, `typography` constants; `contrastRatio(foreground: string, background: string): number`; `useTheme(): { name: ThemeName; colors: Record<ColorToken, string>; space; radius; size; typography }`; `i18n` initialized with `es-CO`.

- [ ] **Step 1: Write the failing tests** in `tokens.test.ts`:
  - `colors.light.action === '#C8EF55'`, `colors.light['surface-0'] === '#F4F2EC'`, `colors.dark['surface-0'] === '#121210'`, `colors.light.ink === '#141414'`.
  - For both themes: `contrastRatio(ink, surface-0) >= 4.5`, `contrastRatio(ink-muted, surface-1) >= 4.5`, `contrastRatio(on-action, action) >= 4.5`.
  - `contrastRatio('#000000', '#FFFFFF')` is `21` (to 2 decimals).
- [ ] **Step 2: Run** `npm test -- tokens` → FAIL.
- [ ] **Step 3: Implement** `contrastRatio` (WCAG 2.x relative luminance) and `tokens.ts`, transcribing every color, spacing, radius, size and type token from the design system's `tokens.json` (version `1792879026-78a3`, linked in `design/README.md`). Resolve aliases (`{coral}`) to hex at transcription time. The file header names the design-system version it was transcribed from.
- [ ] **Step 4: Write the failing test** `ThemeProvider.test.tsx`: with the color scheme mocked to `dark`, `useTheme().name === 'dark'` and `useTheme().colors['surface-0'] === '#121210'`.
- [ ] **Step 5: Implement** `ThemeProvider` reading `useColorScheme()`; root layout keeps the splash screen until Bricolage Grotesque 800, IBM Plex Sans 400/500/600 and IBM Plex Mono 500/600 load (`@expo-google-fonts/*`), then wraps the app in `ThemeProvider` and the i18n provider.
- [ ] **Step 6: Run** `npm test` → PASS.
- [ ] **Step 7: Commit** `feat(theme): add design-system tokens, fonts and i18n`.

### Task 3: Time values

**Files:**
- Create: `src/core/time/time.ts`, `src/core/time/__tests__/time.test.ts`

**Interfaces:**
- Produces: `type Hundredths = number`; `type TimeKind = 'repetition' | 'series_total' | 'race' | 'split'`; `formatTime(value: Hundredths | null, options?: { decimalSeparator?: ',' | '.' }): string` (default separator `','`); `hundredthsFromNanos(elapsedNanos: bigint): Hundredths`.

- [ ] **Step 1: Write the failing tests:**
  - `formatTime(null) === '—'` and `formatTime(undefined as unknown as null) === '—'`; neither returns `'0,00'`.
  - `formatTime(0) === '0,00'` (a real zero is allowed, null is not zero).
  - `formatTime(3391) === '33,91'`, `formatTime(7240) === '1:12,40'`, `formatTime(3391, { decimalSeparator: '.' }) === '33.91'`.
  - `hundredthsFromNanos(339_199_999_999n) === 33919` (truncates, never rounds up).
- [ ] **Step 2: Run** `npm test -- time` → FAIL.
- [ ] **Step 3: Implement** in `src/core/time/time.ts`.
- [ ] **Step 4: Run** `npm test -- time` → PASS.
- [ ] **Step 5: Commit** `feat(domain): add time values that never treat missing as zero`.

### Task 4: Supabase schema, roles and Row Level Security

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `supabase/migrations/20261025000000_foundations.sql`, `supabase/seed.sql`, `supabase/tests/database/foundations_rls.test.sql`
- Modify: `.github/workflows/app-checks.yml` (job `db-tests`)

**Interfaces:**
- Produces tables (all `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `created_by uuid default auth.uid()`):
  - `schools(name text not null)`
  - `categories(school_id uuid not null references schools, name text not null, sort_order int not null default 0)`
  - `training_groups(school_id uuid not null references schools, name text not null)`
  - `school_memberships(school_id uuid not null, user_id uuid not null references auth.users, role text not null check (role in ('school_admin','coach')), unique (school_id, user_id, role))`
  - `platform_admins(user_id uuid primary key references auth.users)` (no `id` column)
  - `athletes(first_name text not null, last_name text not null)`
  - `athlete_managers(user_id uuid not null references auth.users, athlete_id uuid not null references athletes, relation text not null check (relation in ('guardian','self')), unique (user_id, athlete_id))`
  - `athlete_schools(athlete_id uuid not null, school_id uuid not null, category_id uuid references categories, unique (athlete_id, school_id))`
  - `athlete_groups(athlete_id uuid not null, group_id uuid not null references training_groups, unique (athlete_id, group_id))`
  - `coach_group_assignments(coach_user_id uuid not null, group_id uuid not null, unique (coach_user_id, group_id))`
  - `coach_athlete_assignments(coach_user_id uuid not null, athlete_id uuid not null, unique (coach_user_id, athlete_id))`
- Produces SQL functions in schema `app` (`stable`, `security definer`, `set search_path = ''`): `app.is_platform_admin() returns boolean`; `app.admin_school_ids() returns setof uuid`; `app.coach_athlete_ids() returns setof uuid` (athletes of the coach's groups plus direct assignments); `app.managed_athlete_ids() returns setof uuid`; `app.visible_athlete_ids() returns setof uuid` (union of the three plus athletes of `admin_school_ids()`).
- Produces publication `powersync` listing the tables above.

- [ ] **Step 1: Write the failing pgTAP tests** in `foundations_rls.test.sql`, with synthetic users created in the test (no real names):
  - coach A sees exactly the athletes of A's groups plus A's direct assignment; does not see an athlete of another group.
  - after deleting A's group assignment, A no longer sees that group's athletes.
  - guardian G sees only athletes in `athlete_managers` for G; an adult athlete (`relation = 'self'`) sees only themselves.
  - school admin S sees all athletes of S's school and none of another school.
  - a user with no relations sees no athletes.
  - coach A cannot insert into `athlete_groups` (only school admins of that school can); school admin S can.
  - anon role sees nothing in any table.
- [ ] **Step 2: Run** `supabase start && supabase test db` → FAIL (tables missing).
- [ ] **Step 3: Implement** the migration: tables, `app.*` functions, `enable row level security` on every table, `select` policies using `app.visible_athlete_ids()` (athletes and athlete-linked tables) or `app.admin_school_ids()` / membership (school tables), `insert/update/delete` policies only for school admins of the row's school (and platform admins), grants to `authenticated`, and `create publication powersync for table ...` listing every table above. `supabase/seed.sql`: one synthetic school, two groups, one coach, one guardian, four athletes.
- [ ] **Step 4: Run** `supabase db reset && supabase test db` → PASS.
- [ ] **Step 5: CI job** `db-tests` in `app-checks.yml`: install the Supabase CLI with its official setup action pinned by SHA, `supabase db start`, `supabase test db`.
- [ ] **Step 6: Commit** `feat(db): add schools, athletes and roles with row level security`.

### Task 5: PowerSync schema, Sync Streams and Supabase connector

**Files:**
- Create: `powersync/sync-config.yaml`, `src/core/sync/schema.ts`, `src/core/sync/db.ts`, `src/core/sync/supabase.ts`, `src/core/sync/connector.ts`, `src/core/sync/__tests__/connector.test.ts`
- Modify: `package.json` (`@powersync/react-native`, `@op-engineering/op-sqlite` ≥ 1.17.0, `@powersync/react`, `@supabase/supabase-js`), `app.config.ts` (plugins required by op-sqlite, if any)

**Interfaces:**
- Consumes: Task 4 tables.
- Produces:
  - `AppSchema` in `schema.ts`: one `Table` per Task 4 table except `platform_admins` (no `id` column declared); plus local-only tables `pending_writes(table_name text, record_id text)` and `upload_failures(table_name text, record_id text, op text, payload text, error_code text, failed_at text)`.
  - `db: PowerSyncDatabase` (`dbFilename: 'trailskill.db'`) in `db.ts`.
  - `class SupabaseConnector implements PowerSyncBackendConnector` with `fetchCredentials(): Promise<{ endpoint: string; token: string } | null>` and `uploadData(database: AbstractPowerSyncDatabase): Promise<void>`.
  - `isPermanentUploadError(error: { code?: string }): boolean` — true for Postgres classes `22` (data exception), `23` (integrity constraint) and code `42501` (insufficient privilege); false otherwise.

- [ ] **Step 1: Sync Streams.** `powersync/sync-config.yaml` with `config: edition: 3` and `auto_subscribe: true` streams that mirror Task 4's select policies using `auth.user_id()`: managed athletes, coach athletes (group and direct), school-admin school data. Validate in the PowerSync dashboard; if a query shape is rejected there, record the replacement shape in the PR description.
- [ ] **Step 2: Write the failing tests** in `connector.test.ts` with a fake database whose `getNextCrudTransaction()` returns a transaction with operations and a spy `complete()`, and a mocked Supabase client:
  - a `PUT` calls `upsert` on its table with `{ id, ...opData }`; `PATCH` calls `update().eq('id', id)`; `DELETE` calls `delete().eq('id', id)`; then `complete()` is called once and the operation's `pending_writes` row is deleted.
  - a `42501` error: the operation is inserted into `upload_failures` with its payload and code, its `pending_writes` row is deleted, `complete()` is called (the queue moves on), and nothing is thrown.
  - a network error (no `code`): `uploadData` throws and `complete()` is not called (PowerSync retries).
  - `fetchCredentials` when the session is expired: calls `supabase.auth.refreshSession()` and returns the refreshed `access_token`; returns `null` when there is no session.
- [ ] **Step 3: Run** `npm test -- connector` → FAIL.
- [ ] **Step 4: Implement** `schema.ts`, `db.ts`, `supabase.ts` (session persisted with `expo-secure-store`), and `connector.ts` per the interfaces above.
- [ ] **Step 5: Run** `npm test -- connector` → PASS.
- [ ] **Step 6: Commit** `feat(sync): add PowerSync schema, sync streams and Supabase connector`.

### Task 6: Local-first writes and sync state

**Files:**
- Create: `src/core/sync/writes.ts`, `src/core/sync/syncState.ts`, `src/core/sync/__tests__/writes.test.ts`, `src/core/sync/__tests__/syncState.test.ts`

**Interfaces:**
- Consumes: `db`, `AppSchema` local-only tables (Task 5).
- Produces:
  - `writeRecord(table: string, values: Record<string, unknown> & { id?: string }): Promise<string>` — generates a UUID when `id` is missing, and inside one `db.writeTransaction` upserts the row and inserts `pending_writes(table_name, record_id)`; returns the id.
  - `deleteRecord(table: string, id: string): Promise<void>` — same transaction pattern.
  - `type RecordSyncState = 'on_device' | 'sending' | 'synced' | 'not_sent'` (`'needs_review'` is added with conflict handling in a later step).
  - `recordSyncState(input: { pending: boolean; failed: boolean; uploading: boolean }): RecordSyncState` — failed → `not_sent`; pending and uploading → `sending`; pending → `on_device`; otherwise `synced`.
  - `useRecordSyncState(table: string, id: string): RecordSyncState` and `useGlobalSyncSummary(): { pending: number; failed: number; uploading: boolean; lastSyncedAt: Date | null }` built on `useQuery` and `useStatus` from `@powersync/react`.
  - i18n keys `sync.on_device` "En el teléfono", `sync.sending` "Enviando", `sync.synced` "Enviado", `sync.not_sent` "No enviado".

- [ ] **Step 1: Write the failing tests:**
  - `recordSyncState` returns each of the four states for its inputs, and `not_sent` wins over `pending`.
  - `writeRecord` (with a fake `db.writeTransaction` that records statements) issues the row write and the `pending_writes` insert in the **same** transaction, and returns a UUID when no id is given.
  - **Review Focus 1:** a write whose transaction committed but was never uploaded is reported `on_device` by `useRecordSyncState` after the database instance is re-created (simulated restart over the same fake store).
- [ ] **Step 2: Run** `npm test -- data` → FAIL.
- [ ] **Step 3: Implement** `writes.ts` and `syncState.ts`.
- [ ] **Step 4: Run** `npm test -- data` → PASS.
- [ ] **Step 5: Commit** `feat(sync): add local-first writes with per-record sync state`.

### Task 7: Session, sign-in and guarded sign-out

**Files:**
- Create: `src/core/session/SessionProvider.tsx`, `src/core/session/__tests__/signOut.test.ts`, `src/app/(auth)/sign-in.tsx`, `src/app/(auth)/__tests__/sign-in.test.tsx`
- Modify: `src/app/_layout.tsx` (session gate and `PowerSyncContext.Provider`), `src/app/(app)/index.tsx` (global sync pill), `src/core/i18n/es-CO.json`

**Interfaces:**
- Consumes: `supabase`, `db`, `SupabaseConnector`, `useGlobalSyncSummary`.
- Produces: `useSession(): { session: Session | null; requestCode(email: string): Promise<void>; verifyCode(email: string, code: string): Promise<void>; signOut(options?: { force?: boolean }): Promise<'signed_out' | 'blocked_pending'> }`; `signOutDecision(pendingCount: number, force: boolean): 'proceed' | 'blocked_pending'`.

- [ ] **Step 1: Write the failing tests:**
  - `signOutDecision(0, false) === 'proceed'`, `signOutDecision(3, false) === 'blocked_pending'`, `signOutDecision(3, true) === 'proceed'`.
  - **Review Focus 4:** `signOut({ force: true })` calls `db.disconnectAndClear()` before `supabase.auth.signOut()`, so the next user starts with an empty local database.
  - sign-in screen: entering an email and pressing the button calls `requestCode`; entering the 6-digit code calls `verifyCode`; a wrong code shows `auth.code_mismatch` ("Ese código no coincide. Revisa el último mensaje o pide uno nuevo.").
- [ ] **Step 2: Run** `npm test -- session sign-in` → FAIL.
- [ ] **Step 3: Implement** email one-time code sign-in with `supabase.auth.signInWithOtp` and `verifyOtp` (email provider for development; the production SMS or email provider is an open decision in ADR 0001). After sign-in, `db.connect(new SupabaseConnector())`. The root layout routes to `(auth)` without a session and to `(app)` with one. Home shows the global sync summary using the `sync.*` keys.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(session): add email code sign-in and guarded sign-out`.

### Task 8: End-to-end check on a device

**Files:**
- Create: `docs/testing/foundations-device-check.md` (the steps below and their observed results)

**Interfaces:**
- Consumes: everything above, the Supabase and PowerSync services on the Dokploy server (ADR 0002) (credentials from the maintainer, never committed).

- [ ] **Step 1:** `eas build --profile development --platform android`; install on an Android device.
- [ ] **Step 2:** Sign in as the seeded coach. Expected: only the seeded coach's athletes are listed (temporary debug list on Home is acceptable and removed in this task).
- [ ] **Step 3:** Turn on airplane mode, write a synthetic record with `writeRecord`, force-quit, reopen. Expected: record present, state "En el teléfono".
- [ ] **Step 4:** Turn off airplane mode. Expected: state becomes "Enviado"; the row exists in Supabase with `created_by` = the coach.
- [ ] **Step 5 (Review Focus 5):** In Supabase, remove the coach's group assignment. Expected: after sync, those athletes leave the device; a write for one of them ends "No enviado" (RLS denial), and the queue keeps sending other writes.
- [ ] **Step 6 (Review Focus 3):** Stay offline longer than the access-token lifetime configured in Supabase, then reconnect. Expected: pending writes upload without signing in again.
- [ ] **Step 7:** Record the observed results in `docs/testing/foundations-device-check.md`. Commit `test: record foundations device check`.

---

## Spec coverage (step 1 of section 12)

| Requirement | Task |
| --- | --- |
| App shell, Expo, Android first, API 36 | 1 |
| Design-system theme, fonts, translation keys | 2 |
| Missing time is never zero | 3 |
| Roles, assignments, server-side permissions | 4 |
| Local database, outbox, sync scoped per user | 5, 6 |
| Never lose local data; truthful sync state | 5, 6, 8 |
| Sign-in and safe sign-out on shared devices | 7 |

Conflict detection and the platform administrator's review screen (spec section 7) need edits of existing measurements, which arrive with timing (delivery step 3); they are planned there.
