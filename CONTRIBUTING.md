# Contributing to TrailSkill

This document is the single source of truth for how people and AI agents contribute to TrailSkill. If another document disagrees with it, this one wins until it is changed through a pull request.

- Release and Google Play publishing: [`docs/RELEASING.md`](docs/RELEASING.md)
- Quick reference for AI agents: [`AGENTS.md`](AGENTS.md)
- Step-by-step procedures for people and agents: [`trailskill-repo-flow` skill](.agents/skills/trailskill-repo-flow/SKILL.md)

## Roles

| Role | Who | Responsibilities |
| --- | --- | --- |
| Maintainer | Project owner | Decides product scope, privacy and personal-data questions, merges to `main`, cuts releases, publishes to Google Play. |
| Contributor | Human developers | Picks up issues, opens pull requests, reviews others' pull requests. |
| Agent | Any AI coding agent | Works like a contributor on one assigned issue, within the limits in [`AGENTS.md`](AGENTS.md). Never merges, tags, or publishes. |

Only the maintainer can approve changes to product rules, data handling, permissions, consent, or release configuration.

## Workflow at a glance

```text
issue → branch (own worktree) → small commits → pull request → CI green + review → squash merge into main → delete branch
```

1. **Issue first.** Every change starts from a GitHub issue with a clear outcome and acceptance criteria. No issue, no branch.
2. **One issue, one branch, one owner.** Do not share a branch or a working copy with another contributor or agent.
3. **Small pull requests.** Aim for about 400 changed lines or fewer. Split larger work into issues that can be merged independently.
4. **Close out.** After the merge: the branch is deleted, the worktree is removed, and the issue is closed by the pull request.

## Running the app

The app uses native modules (op-sqlite, PowerSync) that Expo Go does not include, so it runs in a **development build**: a debug build of TrailSkill with `expo-dev-client` that loads its JavaScript from Metro.

Prerequisites: Android Studio with the Android SDK, the `Medium_Phone_API_37.0` emulator running, and `JAVA_HOME` set to Android Studio's JDK (on macOS, `/Applications/Android Studio.app/Contents/jbr/Contents/Home`).

1. Install dependencies: `npm ci`.
2. Build and install the development build on the emulator: `npx expo run:android --no-bundler`. It generates `android/` (ignored by Git). Rebuild only when a native dependency or a config plugin changes; JavaScript changes do not need a new build. The local database is encrypted with SQLCipher, so pull the change that enabled it and rebuild once; the first launch deletes the old unencrypted local database and creates an empty encrypted one, which syncs again from the server.
3. Start Metro in watch mode: `npx expo start --dev-client`, then press `a` to open TrailSkill on the emulator. Saving a file reloads the app.

Several worktrees and sessions share the emulator:

- If port 8081 is taken, add `--port <free port>` to step 3. Do not set `CI=1`: it turns off reloads.
- Sessions that cannot press `a` run `adb reverse tcp:<port> tcp:<port>`, open TrailSkill on the emulator, and connect the launcher to `http://localhost:<port>` (type it under Development servers and tap Connect, or tap it under Recently opened).
- On its first start the launcher asks for the nearby devices permission to find local servers; allow it on the emulator.
- Expo Go (`host.exp.exponent`) is a different app. Before a screenshot, check that TrailSkill is in front: `adb shell dumpsys activity activities | grep topResumedActivity` must show `com.fatherapps.trailskill`.

**Screenshots.** Sessions that check visual work capture the emulator with `adb exec-out screencap -p > <name>.png` and attach the image to the pull request. Use synthetic data only and keep screenshots out of the repository.

Without a local Android toolchain, `eas build --profile development --platform android` builds the same development build in the cloud.

## Branching model

TrailSkill uses **trunk-based development**: one long-lived branch (`main`), short-lived work branches, and tags for releases. There is no `develop` branch.

### `main`

- Always releasable: builds, passes CI, and contains no half-finished feature exposed to users.
- Protected: no direct pushes, no force pushes, no deletion. Two layers enforce it: the versioned hook `.githooks/pre-push`, which stops the mistake on your machine before it reaches GitHub, and a GitHub branch ruleset once the `fatherapps` organization moves to the GitHub Team plan (the Free plan cannot protect branches in private repositories). Until then, the hook and review are the only protection. Run `git config core.hooksPath .githooks` once in every clone.
- Changes enter only through a reviewed pull request with passing checks.
- Unfinished features that must merge early stay behind a feature flag or unreachable from the UI.

### Work branches

Name: `<type>/<issue-number>-<short-description>`, lowercase, hyphen-separated.

```text
feat/12-guardian-signup
fix/34-split-time-rounding
docs/40-release-checklist
```

Allowed types match Conventional Commits: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`.

- Branch from the latest `main`.
- Keep it short-lived (days, not weeks). Rebase on `main` when it falls behind.
- Use a separate Git worktree per branch so parallel work never collides:

  ```bash
  git worktree add ../trailskill-worktrees/12-guardian-signup -b feat/12-guardian-signup origin/main
  ```

### Release branches (only when needed)

`release/X.Y` is created from a release tag only when a published version needs a fix while `main` already holds unreleased work. See [`docs/RELEASING.md`](docs/RELEASING.md#hotfixes).

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<optional scope>): <imperative summary>

<optional body: why, not what>

Refs #12
```

- Examples: `feat(registration): add guardian consent step`, `fix(timing): keep missing times empty instead of zero`.
- Breaking changes use `!` after the type or a `BREAKING CHANGE:` footer.
- Write in English.
- No AI attribution lines (`Co-Authored-By` an AI, "Generated with ..."). The person who opens the pull request is responsible for its content.

## Pull requests

- **Title:** a valid Conventional Commit. It becomes the squash commit message on `main`.
- **Description:** in Spanish, following [`.github/pull_request_template.md`](.github/pull_request_template.md): summary, linked issue (`Closes #12`), changes, how it was tested, screenshots (synthetic data only), risks, the Definition of Done checklist, and whether maintainer approval is needed.
- **Merge method:** squash merge only. Linear history on `main`.
- **Draft pull requests** are welcome for early feedback. Mark them ready only when the Definition of Done is met.

### Review

- At least one approval is required. The maintainer must approve changes that touch authentication, permissions, personal data, consent, minors' data, the data model or migrations, offline sync or conflict handling, release/signing/store configuration, CI, or dependencies.
- Reviewers check behavior against the issue's acceptance criteria, not only code style.
- The author resolves every review thread or answers it explicitly.
- An agent may review, but an agent's approval does not count as the required approval.

### Required checks

Every pull request runs [`.github/workflows/pr-checks.yml`](.github/workflows/pr-checks.yml) and [`.github/workflows/app-checks.yml`](.github/workflows/app-checks.yml):

- **PR title and linked issue:** the title is a Conventional Commit and the description links its issue with an English closing keyword (`Closes #12`). The check is [`.github/scripts/check-pr.sh`](.github/scripts/check-pr.sh), which you can run locally.
- **Secret scan:** gitleaks scans the branch history. Any finding fails the check; remove the secret and rotate it.

- **App checks** (`app-checks.yml`): `npm run typecheck`, `npm run lint` and `npm test`.

On the GitHub Free organization plan these checks cannot be made mandatory, so a failing check blocks the merge by team rule. Once the organization moves to GitHub Team, the `main` ruleset marks them as required.

## Definition of Done

A pull request is ready to merge when:

- [ ] It solves the linked issue and meets its acceptance criteria.
- [ ] New or changed behavior has tests; a bug fix includes a test that failed before the fix.
- [ ] All CI checks pass.
- [ ] Docs, help text, and `AGENTS.md` references are updated when behavior or workflow changed.
- [ ] No secrets, credentials, or real personal data in code, fixtures, logs, or screenshots.
- [ ] Offline behavior and missing data were considered where they apply (a missing time is not zero).
- [ ] It reuses existing functions, hooks, and components, or the description explains why none fit (see [Reuse before creating](#reuse-before-creating)).
- [ ] Interface changes match the design-system reference, with side-by-side screenshots in the description (see [Visual fidelity](#visual-fidelity)).
- [ ] It has the required approvals.

### Tests

Production code adds a `testID` only when the element has no role, label, or text a test can query. Each one carries a comment with the reason.

## Product decisions and architecture

- Product rules live in the product documents (currently [`PROJECT-HANDOFF-2026-10-24.md`](PROJECT-HANDOFF-2026-10-24.md), moving to `docs/product/`). They distinguish **confirmed**, **proposed**, and **open** items. Only confirmed items are requirements.
- If an issue depends on an open item, stop and ask the maintainer. Do not fill the gap with an assumption.
- Significant technical decisions (backend, sync strategy, auth provider, and similar) are recorded as Architecture Decision Records in `docs/decisions/NNNN-short-title.md` with context, decision, and consequences.
- Visual design (palette, typography, components, logo) comes only from the TrailSkill design system linked in [`design/README.md`](design/README.md). Design changes start there, never in code.

### Reuse before creating

Before writing a new function, hook, or component, search for an existing one in `src/core/`, in the module that owns the behavior, and in the `index.ts` of other modules.

- If something similar exists, reuse it or extend it instead of writing a duplicate.
- If a second module needs code that lives in another module, propose moving it to `src/core/`; the maintainer must approve the move ([ADR 0003](docs/decisions/0003-modular-architecture.md)).
- The pull request description says what was reused, or why nothing existing fit.

### Navigation

Navigate with the `useRouter()` hook from `expo-router`, never the module-level `router`: after Android recreates the Activity the module-level router is unbound and the next tap crashes ([expo/expo#51859](https://github.com/expo/expo/issues/51859)). Lint blocks the import.

- Wrap a handler in `useCallback` with `[router]` when a route passes it to a hook or child that uses it in effect dependencies (for example `openNext` in `src/app/(app)/_layout.tsx`), so a new function on every render does not re-run the effect.

### Visual fidelity

Issues labeled `area: front-mobile` or `area: front-tablet` are checked against their design-system reference: the component's README or the matching `Pantalla*` reference screen.

- The pull request includes side-by-side screenshots of the reference and the implementation, using synthetic data only.
- Anything the design system does not document is asked to the maintainer before it is implemented.

## Personal data and security

TrailSkill handles personal data of minors. These rules are not optional:

- Use only synthetic data in tests, fixtures, seeds, screenshots, issues, and pull requests. Never copy data from FECNA, the pilot school, or real users.
- Never commit secrets: API keys, service-account files, keystores, `.env` files. Commit only `.env.example`. Store build and submit secrets in EAS or GitHub encrypted secrets.
- Do not log personal data.
- Report a suspected leak or vulnerability privately to the maintainer, never in a public issue.
- Every new dependency needs a reason in the pull request. SDKs must be acceptable for an app that handles children's data (see [`docs/RELEASING.md`](docs/RELEASING.md#store-listing-and-policy)).

## Issues

Issues are written in Spanish with the templates in [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/): feature or task, and bug. Each issue states:

- **Problem or goal:** what a user can or cannot do today.
- **Scope:** what is included, plus explicit non-goals.
- **Acceptance criteria:** observable and testable.
- **Labels:** type (`feat`, `fix`, ...), at least one area label, and `needs-decision` when blocked by an open product question.

### Area labels

Every issue has at least one area label besides its type label. Area labels combine: a screen that also changes sync logic gets both `area: front-mobile` and `area: app-logic`.

| Label | Use |
| --- | --- |
| `area: front-mobile` | App screens and components on the phone |
| `area: front-tablet` | Tablet screens: school console, fulfillment grid |
| `area: app-logic` | App logic without interface: sync, session, repositories, pure logic |
| `area: backend` | Supabase: migrations, RLS, functions, Sync Streams |
| `area: infra` | Dokploy deployment, CI, builds |
| `area: docs` | ADRs, documentation, test records |
| `area: chore` | Maintenance: dependencies, cleanup |
| `area: research` | Research or a decision, no app code |

The pilot has no web version: the school console is the same app on a tablet. If a web version arrives, it gets its own area label together with an ADR.

Large features are split into sub-issues that can each be merged on their own.

## Language

Code, identifiers, comments, commits, and documentation are written in English. Issues and pull request descriptions are written in Spanish, using the templates in `.github/`. Pull request titles stay Conventional Commits in English, and closing keywords stay in English (`Closes #12`) because GitHub only recognizes them in English. User-facing app copy follows the product's localization files.
