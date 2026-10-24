#!/bin/sh
# Checks a pull request title and description against CONTRIBUTING.md.
# Usage: PR_TITLE="..." PR_BODY="..." sh .github/scripts/check-pr.sh
status=0
types='feat|fix|docs|refactor|test|chore|ci|build|perf'

if ! printf '%s\n' "$PR_TITLE" | grep -Eq "^($types)(\([a-z0-9-]+\))?!?: .+"; then
  echo "PR title must be a Conventional Commit, for example: feat(registration): add guardian consent step" >&2
  status=1
fi

if ! printf '%s\n' "$PR_BODY" | grep -Eiq '(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved) #[0-9]+'; then
  echo "PR description must link its issue with an English closing keyword, for example: Closes #12" >&2
  status=1
fi

exit "$status"
