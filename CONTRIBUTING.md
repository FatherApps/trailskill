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

## Branching model

TrailSkill uses **trunk-based development**: one long-lived branch (`main`), short-lived work branches, and tags for releases. There is no `develop` branch.

### `main`

- Always releasable: builds, passes CI, and contains no half-finished feature exposed to users.
- Protected: no direct pushes, no force pushes, no deletion.
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

These run in CI on every pull request and become required as soon as the project scaffold exists:

- type check
- lint and format check
- unit and integration tests
- pull request title follows Conventional Commits

## Definition of Done

A pull request is ready to merge when:

- [ ] It solves the linked issue and meets its acceptance criteria.
- [ ] New or changed behavior has tests; a bug fix includes a test that failed before the fix.
- [ ] All CI checks pass.
- [ ] Docs, help text, and `AGENTS.md` references are updated when behavior or workflow changed.
- [ ] No secrets, credentials, or real personal data in code, fixtures, logs, or screenshots.
- [ ] Offline behavior and missing data were considered where they apply (a missing time is not zero).
- [ ] It has the required approvals.

## Product decisions and architecture

- Product rules live in the product documents (currently [`PROJECT-HANDOFF-2026-10-24.md`](PROJECT-HANDOFF-2026-10-24.md), moving to `docs/product/`). They distinguish **confirmed**, **proposed**, and **open** items. Only confirmed items are requirements.
- If an issue depends on an open item, stop and ask the maintainer. Do not fill the gap with an assumption.
- Significant technical decisions (backend, sync strategy, auth provider, and similar) are recorded as Architecture Decision Records in `docs/decisions/NNNN-short-title.md` with context, decision, and consequences.

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
- **Labels:** type (`feat`, `fix`, ...), area, and `needs-decision` when blocked by an open product question.

Large features are split into sub-issues that can each be merged on their own.

## Language

Code, identifiers, comments, commits, and documentation are written in English. Issues and pull request descriptions are written in Spanish, using the templates in `.github/`. Pull request titles stay Conventional Commits in English, and closing keywords stay in English (`Closes #12`) because GitHub only recognizes them in English. User-facing app copy follows the product's localization files.
