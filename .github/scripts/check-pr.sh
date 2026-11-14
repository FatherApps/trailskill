#!/bin/sh
# Checks a pull request title and description against CONTRIBUTING.md and .github/pull_request_template.md.
# Usage: PR_TITLE="..." PR_BODY="..." sh .github/scripts/check-pr.sh
# The title and the description come only from the environment. The description is parsed
# by one awk program that reads it from ENVIRON, so the shell never expands it.
status=0
types='feat|fix|docs|refactor|test|chore|ci|build|perf'

if ! printf '%s\n' "$PR_TITLE" | grep -Eq "^($types)(\([a-z0-9-]+\))?!?: .+"; then
  echo "PR title must be a Conventional Commit, for example: feat(registration): add guardian consent step" >&2
  status=1
fi

# Every "## " section of the template must exist and have content once HTML comments are
# removed. An empty line, a lone "-" or "*", and "Closes #" without a number are not content.
# The headings are compared byte for byte, so the accents work in any awk and locale.
awk '
function meaningful(line,    t) {
  t = line
  gsub(/^[ \t]+|[ \t]+$/, "", t)
  if (t == "" || t ~ /^[-*]$/) return 0
  t = tolower(t)
  sub(/^[-*][ \t]+/, "", t)
  return t !~ /^(closes?|closed|fix(es|ed)?|resolves?|resolved|refs?)[ \t]+#$/
}

BEGIN {
  body = ENVIRON["PR_BODY"]
  gsub(/\r/, "", body)

  # Remove HTML comments, also multi-line ones. An unclosed one hides the rest, as on GitHub.
  kept = ""
  while ((i = index(body, "<!--")) > 0) {
    kept = kept substr(body, 1, i - 1)
    body = substr(body, i + 4)
    j = index(body, "-->")
    if (j == 0) { body = ""; break }
    body = substr(body, j + 3)
  }
  body = kept body

  n = split(body, line, "\n")
  for (k = 1; k <= n; k++) {
    if (line[k] ~ /^##[ \t]/) {
      cur = substr(line[k], 4)
      gsub(/^[ \t]+|[ \t]+$/, "", cur)
      seen[cur] = 1
    } else if (cur != "" && meaningful(line[k])) {
      filled[cur] = 1
    }
  }

  split("Resumen|Issue relacionado|Cambios|Cómo se probó|Capturas|Riesgos e impacto|Checklist|Requiere aprobación del maintainer", req, "|")
  bad = 0
  for (k = 1; k <= 8; k++) {
    if (!(req[k] in seen)) {
      print "PR description is missing the section \"## " req[k] "\" from .github/pull_request_template.md"
      bad = 1
    } else if (!(req[k] in filled)) {
      print "PR description section \"## " req[k] "\" is empty; fill it in, or write N/A or Ninguno when it does not apply"
      bad = 1
    }
  }

  if (tolower(body) !~ /(^|[^a-z0-9_])(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved|ref|refs) #[0-9]+/) {
    print "PR description must link its issue with an English closing keyword (Closes #12) or with Refs #12 when the PR does not close it"
    bad = 1
  }
  exit bad
}' </dev/null >&2 || status=1

exit "$status"
