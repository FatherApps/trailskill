# Setup path (maintainer, one time)

Rulebook: `CONTRIBUTING.md`, sections "Branching model" and "Pull requests".

1. Confirm with the maintainer: GitHub owner, repository name, and visibility (private during the pilot is recommended). Creating the remote needs explicit authorization.
2. In the project root: `git init -b main`. The first commit holds only the existing documents and is the one allowed direct commit to `main`: `chore: add contribution and release guidelines`.
3. After confirmation: `gh repo create <owner>/trailskill --private --source=. --push`. This initial push of `main` is the only direct push allowed; enable the hook afterwards: `git config core.hooksPath .githooks`.
4. Merge settings: `gh repo edit --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge`.
5. Protect `main` with a branch ruleset (repository Settings → Rules; a private personal repository needs GitHub Pro): require a pull request with 1 approval, require linear history, block force pushes, restrict deletions. Add required status checks once CI exists. The `.githooks/pre-push` hook is a second, local layer.
6. Collaborators: `gh api -X PUT repos/<owner>/trailskill/collaborators/<github-user>` sends the invitation. Collaborators on a personal repository get write access, so share `CONTRIBUTING.md` and the hook setup with each one.
7. Labels: `gh label create needs-decision --description "Blocked by an open product question"`. Add type and area labels as they are needed.
8. Once the app scaffold exists, add `.github/CODEOWNERS` assigning the maintainer to sensitive paths (auth, data model, sync, release and CI config).

Closing check: `gh repo view --json defaultBranchRef,visibility` shows `main`; the ruleset is active; `git status` is clean.
