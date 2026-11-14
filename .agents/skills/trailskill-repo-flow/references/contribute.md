# Contribute path (issue → merged pull request)

Rulebook: `CONTRIBUTING.md`, including its Definition of Done.

| Situation | Action |
| --- | --- |
| Issue missing or without acceptance criteria | Stop; ask the maintainer |
| Branch or PR already exists for the issue | Continue only if you own it; otherwise ask |
| Change grows beyond ~400 lines | Propose sub-issues before continuing |
| Touches auth, personal data, consent, data model, sync, release config, CI, or dependencies | Mark the PR as needing maintainer approval |

0. First time in this clone: `git config core.hooksPath .githooks` (blocks pushes to `main`).
0b. Run the `trailskill-triage` skill before you create or start an issue, and work from its verdict (`CONTRIBUTING.md`, Working sequence).
1. `gh issue view <n>`: confirm it is open; read scope, non-goals, and acceptance criteria. If it has no area label, ask the maintainer to add one (`CONTRIBUTING.md`, Area labels).
2. `git fetch origin`, then `git worktree add ../trailskill-worktrees/<n>-<slug> -b <type>/<n>-<slug> origin/main`. Work only in that worktree.
3. Before writing a new function, hook, or component, search `src/core/`, the owning module, and other modules' `index.ts` for one to reuse or extend (`CONTRIBUTING.md`, Reuse before creating). For `area: front-mobile` or `area: front-tablet`, open the design-system reference first (`CONTRIBUTING.md`, Visual fidelity).
4. For each acceptance criterion, write a failing test, then implement until it passes.
5. Run every check listed under Commands in `AGENTS.md`; all must pass.
6. Commit in small Conventional Commits ending with `Refs #<n>`.
7. `git push -u origin <branch>`, fill the pull request body, run `PR_TITLE="<conventional title>" PR_BODY="$(cat body.md)" sh .github/scripts/check-pr.sh` (it must pass), then `gh pr create --draft --title "<conventional title>" --body-file <filled copy of ../../../../.github/pull_request_template.md, written in Spanish>`.
8. Wait for the PR checks (`gh pr checks <n> --watch`); fix any failure. Walk the Definition of Done. Run `gh pr ready` only when every item holds.
9. After the maintainer merges: `git worktree remove ../trailskill-worktrees/<n>-<slug>`, `git branch -D <branch>` (squash merges look unmerged locally), and confirm the issue is closed.

For an agent, done means the pull request is open; step 8 still follows.

Closing check: PR URL exists, CI is green, every Definition of Done item is reported as met or not met.
