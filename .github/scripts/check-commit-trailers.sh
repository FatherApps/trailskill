#!/bin/sh
# Fails when a commit message in a range has a line starting with "Claude-Session:" or
# "Co-Authored-By:" (any case): commits carry no AI attribution (CONTRIBUTING.md, Commits).
# Usage: COMMIT_RANGE="<base>..<head>" sh .github/scripts/check-commit-trailers.sh
# The range comes only from the environment and the messages are read by awk from `git log`,
# so the shell never expands a commit message. Needs enough history to resolve the range.
set -u

if [ -z "${COMMIT_RANGE:-}" ]; then
  echo "COMMIT_RANGE is required, for example COMMIT_RANGE=origin/main..HEAD" >&2
  exit 2
fi

# One record per commit: a marker line with the hash, then the raw message (%B). %s and %b would
# fold a trailer on the line after the subject into the subject, where it would go unchecked.
if ! log=$(git log --format='%x01%h%n%B' "$COMMIT_RANGE" 2>&1); then
  printf '%s\n' "$log" >&2
  exit 2
fi

printf '%s\n' "$log" | awk '
  /^\001/ { commit = substr($0, 2); subject = 1; next }
  subject { commit = commit " " $0; subject = 0 }
  {
    l = tolower($0)
    if (l ~ /^claude-session:/) t = "Claude-Session:"
    else if (l ~ /^co-authored-by:/) t = "Co-Authored-By:"
    else next
    printf "commit %s has the trailer \"%s\"; remove it from the commit message\n", commit, t
    bad = 1
  }
  END { exit bad }' >&2
