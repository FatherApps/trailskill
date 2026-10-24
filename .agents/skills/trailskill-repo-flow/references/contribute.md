# Contribute path (issue → merged pull request)

Rulebook: `CONTRIBUTING.md`, including its Definition of Done.

| Situation | Action |
| --- | --- |
| Issue missing or without acceptance criteria | Stop; ask the maintainer |
| Branch or PR already exists for the issue | Continue only if you own it; otherwise ask |
| Change grows beyond ~400 lines | Propose sub-issues before continuing |
| Touches auth, personal data, consent, data model, sync, release config, CI, or dependencies | Mark the PR as needing maintainer approval |

1. `gh issue view <n>`: confirm it is open; read scope, non-goals, and acceptance criteria.
2. `git fetch origin`, then `git worktree add ../trailskill-worktrees/<n>-<slug> -b <type>/<n>-<slug> origin/main`. Work only in that worktree.
3. For each acceptance criterion, write a failing test, then implement until it passes.
4. Run every check listed under Commands in `AGENTS.md`; all must pass.
5. Commit in small Conventional Commits ending with `Refs #<n>`.
6. `git push -u origin <branch>`, then `gh pr create --draft --title "<conventional title>" --body-file <filled copy of ../assets/pr-body.md>`.
7. Walk the Definition of Done. Run `gh pr ready` only when every item holds.
8. After the maintainer merges: `git worktree remove ../trailskill-worktrees/<n>-<slug>`, `git branch -D <branch>` (squash merges look unmerged locally), and confirm the issue is closed.

Closing check: PR URL exists, CI is green, every Definition of Done item is reported as met or not met.
