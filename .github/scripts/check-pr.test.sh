#!/bin/sh
# Tests .github/scripts/check-pr.sh with synthetic PR titles and descriptions.
# Usage: sh .github/scripts/check-pr.test.sh   (from the repository root; no network, all data is synthetic)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
CHECK=$HERE/check-pr.sh
FX=$HERE/check-pr-fixtures
TEMPLATE=$HERE/../pull_request_template.md
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
trap 'exit 130' INT TERM

GOOD='feat(timing): add a synthetic widget'
PASSED=0
FAILED=0

pass() { PASSED=$((PASSED + 1)); printf "ok   %s\n" "$1"; }
fail() { FAILED=$((FAILED + 1)); printf "FAIL %s\n" "$1"; [ -s "$T/err" ] && sed 's/^/       stderr: /' "$T/err"; }

# run TITLE BODYFILE: runs the script with the inputs only in the environment; sets rc and fills $T/err.
run() {
  PR_TITLE=$1 PR_BODY=$(cat "$2") sh "$CHECK" >"$T/out" 2>"$T/err" </dev/null
  rc=$?
}

# expect_pass DESC TITLE BODYFILE
expect_pass() {
  run "$2" "$3"
  if [ "$rc" -eq 0 ] && [ ! -s "$T/err" ]; then pass "$1"; else fail "$1 (exit $rc)"; fi
}

# expect_fail DESC TITLE BODYFILE NEEDLE: exits non-zero and NEEDLE appears in stderr.
expect_fail() {
  run "$2" "$3"
  if [ "$rc" -ne 0 ] && grep -Fq -- "$4" "$T/err"; then pass "$1"; else fail "$1 (exit $rc, wanted: $4)"; fi
}

# expect_absent DESC TITLE BODYFILE NEEDLE: exits non-zero and NEEDLE does not appear in stderr.
expect_absent() {
  run "$2" "$3"
  if [ "$rc" -ne 0 ] && ! grep -Fq -- "$4" "$T/err"; then pass "$1"; else fail "$1 (exit $rc, unwanted: $4)"; fi
}

# drop_section NAME FILE: removes the "## NAME" heading and its content.
drop_section() { awk -v n="$1" '/^## /{skip = (substr($0, 4) == n)} !skip' "$2"; }

# set_section NAME TEXT FILE: keeps the heading and replaces its content with TEXT.
set_section() {
  N=$1 R=$2 awk '
    /^## /{skip = (substr($0, 4) == ENVIRON["N"]); print; if (skip) { print ""; print ENVIRON["R"]; print "" } ; next}
    !skip' "$3"
}

LINK_MSG='PR description must link its issue with an English closing keyword (Closes #12) or with Refs #12 when the PR does not close it'
TITLE_MSG='PR title must be a Conventional Commit'
SECTIONS='Resumen
Issue relacionado
Cambios
Cómo se probó
Capturas
Riesgos e impacto
Checklist
Requiere aprobación del maintainer'

# --- Valid descriptions ---
expect_pass 'full description passes' "$GOOD" "$FX/full.md"
expect_pass 'fixture of PR 937 passes' "$GOOD" "$FX/pr-937.md"
expect_pass 'fixture of PR 938 passes' "$GOOD" "$FX/pr-938.md"
expect_pass 'fixture of PR 940 passes' "$GOOD" "$FX/pr-940.md"
grep -v '^Closes #941$' "$FX/pr-937.md" >"$T/refs-only.md"
expect_pass 'PR 937 with only Refs #77 passes' "$GOOD" "$T/refs-only.md"
sed 's/^Closes #12$/Refs #12/' "$FX/full.md" >"$T/refs12.md"
expect_pass 'Refs #12 alone passes' "$GOOD" "$T/refs12.md"
sed 's/^Closes #12$/closes #12/' "$FX/full.md" >"$T/lower.md"
expect_pass 'lowercase closing keyword passes' "$GOOD" "$T/lower.md"
awk '{printf "%s\r\n", $0}' "$FX/full.md" >"$T/crlf.md"
expect_pass 'CRLF description passes' "$GOOD" "$T/crlf.md"
set_section Cambios '### Detail' "$FX/full.md" >"$T/sub.md"
expect_pass 'a ### line counts as content' "$GOOD" "$T/sub.md"
set_section Capturas 'N/A' "$FX/full.md" >"$T/na.md"
expect_pass 'N/A counts as content' "$GOOD" "$T/na.md"
set_section 'Riesgos e impacto' 'Ninguno' "$FX/full.md" >"$T/ninguno.md"
expect_pass 'Ninguno counts as content' "$GOOD" "$T/ninguno.md"

# --- Each section missing or empty names the section ---
while IFS= read -r name; do
  drop_section "$name" "$FX/full.md" >"$T/missing.md"
  expect_fail "missing \"$name\" fails naming it" "$GOOD" "$T/missing.md" "missing the section \"## $name\""
  set_section "$name" '<!-- only a comment -->' "$FX/full.md" >"$T/empty.md"
  expect_fail "comment-only \"$name\" fails naming it" "$GOOD" "$T/empty.md" "section \"## $name\" is empty"
done <<EOF2
$SECTIONS
EOF2

set_section Cambios '- ' "$FX/full.md" >"$T/dash.md"
expect_fail 'an empty "- " in Cambios fails naming it' "$GOOD" "$T/dash.md" 'section "## Cambios" is empty'
set_section 'Issue relacionado' 'Closes #' "$FX/full.md" >"$T/closes-empty.md"
expect_fail 'Closes # without a number fails naming the section' "$GOOD" "$T/closes-empty.md" 'section "## Issue relacionado" is empty'
expect_fail 'Closes # without a number fails the link check' "$GOOD" "$T/closes-empty.md" "$LINK_MSG"
set_section Cambios '<!--
- looks like content
-->' "$FX/full.md" >"$T/multi.md"
expect_fail 'a multi-line comment does not count as content' "$GOOD" "$T/multi.md" 'section "## Cambios" is empty'

# --- The unedited template ---
expect_fail 'template fails the link check' "$GOOD" "$TEMPLATE" "$LINK_MSG"
while IFS= read -r name; do
  [ "$name" = Checklist ] && continue
  expect_fail "template: \"$name\" is reported empty" "$GOOD" "$TEMPLATE" "section \"## $name\" is empty"
done <<EOF2
$SECTIONS
EOF2
expect_absent 'template: Checklist is not reported' "$GOOD" "$TEMPLATE" 'section "## Checklist"'

# --- Linked issue ---
set_section 'Issue relacionado' 'Ninguno' "$FX/full.md" >"$T/nolink.md"
expect_fail 'no issue link fails' "$GOOD" "$T/nolink.md" "$LINK_MSG"
expect_absent 'no issue link does not report an empty section' "$GOOD" "$T/nolink.md" 'is empty'
set_section 'Issue relacionado' '<!-- Closes #12 -->' "$FX/full.md" >"$T/commented.md"
expect_fail 'a closing keyword inside a comment fails the link check' "$GOOD" "$T/commented.md" "$LINK_MSG"

# --- Title ---
expect_fail 'a bad title still fails' 'Add stuff' "$FX/full.md" "$TITLE_MSG"
expect_absent 'a bad title with a valid body reports only the title' 'Add stuff' "$FX/full.md" 'PR description'

# --- Injection: title and body only travel through the environment ---
P=$T/pwned
# shellcheck disable=SC2016  # the single quotes keep the injection payloads literal on purpose
{
  printf '%s\n' '$(touch '"$P"'1)'
  printf '%s\n' '`touch '"$P"'2`'
  printf '%s\n' "'; touch $P"'3; '"'"
  printf '%s\n' '"; touch '"$P"'4; "'
  printf '%s\n' '%s%n %d %x \n \\ $HOME ${HOME} $((1+1))'
  printf '%s\n' '$(touch '"$P"'5) `touch '"$P"'6` '"'; touch $P"'7; '"'"' %s%n'
} >"$T/payloads"
while IFS= read -r payload; do
  INJ=$payload awk '{print} /^## Resumen/{print ""; print ENVIRON["INJ"]}
    END{print ""; print "## " ENVIRON["INJ"]; print ENVIRON["INJ"]}' "$FX/full.md" >"$T/inj.md"
  expect_pass "injection in title and body stays inert: $payload" "feat: $payload" "$T/inj.md"
  expect_fail "injection in a bad title fails on the title only: $payload" "$payload" "$T/inj.md" "$TITLE_MSG"
done <"$T/payloads"
if ls "$T"/pwned* >/dev/null 2>&1; then fail 'injection created a file'; else pass 'injection created no file'; fi

echo
echo "$PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ]
