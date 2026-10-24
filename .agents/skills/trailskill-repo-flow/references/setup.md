# Setup path (maintainer, one time)

Rulebook: `CONTRIBUTING.md`, sections "Branching model" and "Pull requests".

1. Confirm with the maintainer: GitHub owner, repository name, and visibility (private during the pilot is recommended). Creating the remote needs explicit authorization.
2. In the project root: `git init -b main`. The first commit holds only the existing documents and is the one allowed direct commit to `main`: `chore: add contribution and release guidelines`.
3. After confirmation: `gh repo create <owner>/trailskill --private --source=. --push`.
4. Merge settings: `gh repo edit --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge`.
5. Protect `main` with a branch ruleset (repository Settings → Rules): require a pull request with 1 approval, require linear history, block force pushes, restrict deletions. Add required status checks once CI exists.
6. Labels: `gh label create needs-decision --description "Blocked by an open product question"`. Add type and area labels as they are needed.
7. Once the app scaffold exists, add `.github/CODEOWNERS` assigning the maintainer to sensitive paths (auth, data model, sync, release and CI config).

Closing check: `gh repo view --json defaultBranchRef,visibility` shows `main`; the ruleset is active; `git status` is clean.
