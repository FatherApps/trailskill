# AGENTS.md

Entry point for AI agents working on TrailSkill. It is a map, not the rulebook: rules live in the linked documents and are not repeated here.

## Project

TrailSkill is a modular athlete-development platform for multiple schools and, later, multiple sports. It starts with swimming in Colombia. La Academia (Liga Atlántico) is the pilot school, not the brand.

Stack: React Native + Expo (Android first, iOS from the same code) with Supabase and PowerSync for the backend and offline sync. See [`docs/decisions/0001-app-and-backend-stack.md`](docs/decisions/0001-app-and-backend-stack.md).

## Project organization

Decided by the maintainer on 2026-10-24:

- **One app, one repository.** A single Expo app serves every role: guardians and adult athletes on phones, school administrators and coaches on tablets (the school console). What each person sees depends on their role and screen size. Permissions are always enforced by the backend, never only by hiding screens.
- **Android first, iOS from the same code.** Keep Android-only APIs inside isolated native modules so iOS builds stay possible.
- **Not a monorepo yet.** Code is organized by feature inside the app (layout defined with the scaffold). Move to a multi-package monorepo only when a second deployable appears, such as a custom backend service, and record that change as an ADR in `docs/decisions/`.
- **Backend:** Supabase with PowerSync for offline sync (ADR 0001). Its migrations, policies, and functions live in this repository under `supabase/`.
- **Race timing:** the Kotlin prototype `cronometro-natacion-fase3` is kept outside this repository as a reference only; do not copy it in. Its pure logic (stopwatch state machine, splits, arrival assignment) is rewritten in TypeScript with tests. Only button capture with a native timestamp becomes a small Expo local module. An on-screen stopwatch is always available as a fallback. The prototype's USB headset volume keys work on Android only; buttons meant for iOS must send regular keyboard keys.

## Sources of truth

| Topic | Document |
| --- | --- |
| Workflow, branches, commits, pull requests, Definition of Done | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Versioning, releases, OTA updates, Google Play | [`docs/RELEASING.md`](docs/RELEASING.md) |
| Product rules and pilot scope | [`PROJECT-HANDOFF-2026-10-24.md`](PROJECT-HANDOFF-2026-10-24.md) (moving to `docs/product/`) |
| Architecture decisions | [`docs/decisions/`](docs/decisions/) |
| Visual design: palette, typography, components, logo | [`design/README.md`](design/README.md), which links the design system (the source of truth) |

Product documents mark items as **confirmed**, **proposed**, or **open**. Only confirmed items are requirements.

## How to work

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before your first change. In short: one assigned issue, one branch, one worktree, one small pull request into `main`.

## Skill

All repository work (setup, issues, branches, pull requests, releases, hotfixes, OTA updates, Google Play) goes through the project skill `trailskill-repo-flow`:

- Canonical: [`.agents/skills/trailskill-repo-flow/SKILL.md`](.agents/skills/trailskill-repo-flow/SKILL.md) — read by Codex, OpenCode, and Pi.
- Claude Code: `.claude/skills/trailskill-repo-flow` is a symlink to the same folder.

If your tool does not load skills automatically, read that `SKILL.md` before any repository action. Edit only the canonical folder.

## Hard limits

Agents never:

- push to `main`, force-push, merge, create tags, or delete branches they do not own;
- run production builds, `eas submit`, or `eas update`, or touch Play Console, signing, or credentials;
- read, create, or commit secrets (`.env`, keystores, service-account files);
- use real personal data (FECNA, the pilot school, real users) in code, tests, fixtures, logs, or examples;
- implement product rules marked proposed or open;
- add dependencies or change CI or release configuration unless the issue asks for it;
- edit files outside the issue's scope or work on another agent's branch;
- change the palette, typography, shapes, iconography, or logo, or use a visual value that is not in the design system (see [`design/README.md`](design/README.md)).

## Google Play requirements

These are mandatory for any build, configuration, or plan that targets Google Play. Details and official sources: [`docs/RELEASING.md`](docs/RELEASING.md#one-time-setup-maintainer).

- Every Play build must target Android 16 (API level 36) or higher. Google Play requires it for new apps and app updates since 31 August 2026. Never set `targetSdkVersion` below 36. Google raises this level every year: re-check the source before each release.
- The TrailSkill Play developer account is personal, so production access requires a closed test with at least 12 testers opted in for 14 consecutive days. The La Academia pilot runs on the closed testing track and its testers must satisfy this requirement before any production release is planned.

## When unsure

Stop and ask the maintainer in the issue. A missing rule is not permission, the same way a missing time is not zero.

## Language

Code, commits, and docs in English. Issues and pull request descriptions in Spanish, using the templates in `.github/` (keep `Closes #N` in English). Conversation with the maintainer in Spanish.

## Commands

Pending: install, run, test, lint, and type-check commands are added here when the Expo project is scaffolded.

## Reporting

When you finish, report what changed, which checks you ran with their results, and anything you skipped or could not verify.
