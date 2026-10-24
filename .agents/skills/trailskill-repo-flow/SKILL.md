---
name: trailskill-repo-flow
description: "Trigger: issue, branch, worktree, commit, PR, merge, release, tag, hotfix, OTA, Google Play in TrailSkill. Runs the repository, branching, release, and publishing flow."
license: "TBD"
metadata:
  author: "trailskill"
  version: "1.0"
---

## Activation Contract

Load for any TrailSkill repository-process task: setting up the repository, working an issue from branch to merged pull request, cutting a release or hotfix, publishing an OTA update, or moving a build through Google Play. The same skill serves Claude Code, Codex, OpenCode, and Pi.

## Hard Rules

- The rulebooks are `CONTRIBUTING.md` (workflow) and `docs/RELEASING.md` (releases, Google Play). They win over this skill. Read the one your path needs.
- Never commit to or push `main`, force-push, or touch a branch you do not own.
- Maintainer-only, each with explicit maintainer confirmation first: merging, tagging, production builds, `eas submit`, `eas update`, Play Console changes, repository settings, creating remotes.
- No open issue with acceptance criteria means no branch: ask the maintainer.
- Implement only confirmed product rules. A proposed or open rule: label the issue `needs-decision`, ask, and stop that part.
- Synthetic data only. Never stage or print secrets.
- Conventional Commits in English, no AI attribution.

## Decision Gates

| Request | Path |
| --- | --- |
| Repository missing, or its settings, labels, or protection need work | `references/setup.md` (maintainer) |
| Start, continue, submit, or close an issue | `references/contribute.md` |
| Planned release, PATCH fix, hotfix, OTA update, Play promotion or rollout | `references/release.md` (maintainer) |
| Maintainer-only path requested by someone else | Stop; say the maintainer must run it |

## Execution Steps

1. Pick the path with the Decision Gates.
2. Read the matching reference file and the rulebook section it names.
3. Run its steps in order. Stop at every confirmation point and wait.
4. Run the path's closing check before reporting.

## Output Contract

Return: path taken; what changed (issue, branch, PR, tag, build or update IDs, Play track and rollout); checks run with results; confirmations obtained; anything skipped or still open.

## References

- `references/setup.md` — one-time repository setup
- `references/contribute.md` — issue to merged pull request
- `references/release.md` — releases, hotfixes, OTA, Google Play
- `assets/pr-body.md` — pull request description template
- `../../../CONTRIBUTING.md`, `../../../docs/RELEASING.md`, `../../../AGENTS.md`
