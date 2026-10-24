# Setup path (maintainer, one time)

Rulebook: `CONTRIBUTING.md`, sections "Branching model" and "Pull requests".

1. The repository lives in the `fatherapps` organization (the maintainer's development company; one repository per app) and is private. Creating or transferring it needs explicit maintainer authorization.
2. In the project root: `git init -b main`. The first commit holds only the existing documents and is the one allowed direct commit to `main`: `chore: add contribution and release guidelines`.
3. After confirmation: `gh repo create fatherapps/trailskill --private --source=. --push`. This initial push of `main` is the only direct push allowed; enable the hook afterwards: `git config core.hooksPath .githooks`.
4. Merge settings: `gh repo edit --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge`.
5. Protect `main`. On the Free organization plan, private repositories cannot have branch protection or rulesets: rely on `.githooks/pre-push` and review. When `fatherapps` moves to GitHub Team, add a branch ruleset: require a pull request with 1 approval, require linear history, block force pushes, restrict deletions, and add required status checks once CI exists.
6. Collaborators: add people to the `fatherapps` organization and grant them access to this repository through a team (Organization settings → Teams), with the lowest role that lets them work. Share `CONTRIBUTING.md` and the hook setup with each one.
7. Labels: `gh label create needs-decision --description "Blocked by an open product question"`. Add type and area labels as they are needed.
8. Once the app scaffold exists, add `.github/CODEOWNERS` assigning the maintainer to sensitive paths (auth, data model, sync, release and CI config).

Closing check: `gh repo view fatherapps/trailskill --json defaultBranchRef,visibility` shows `main` and `PRIVATE`; the ruleset is active if the organization is on Team; `git status` is clean.
