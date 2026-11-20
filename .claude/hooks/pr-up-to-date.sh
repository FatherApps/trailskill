#!/bin/sh
# Claude Code PreToolUse hook (matcher Bash): denies opening or readying a pull request while the branch lacks origin/main.
# The agent merges origin/main (history is never rewritten), runs the checks and retries.
# Reads the PreToolUse JSON on stdin. Without jq it greps the raw JSON, which still contains the command text.
UPDATED="rama actualizada con main: corre los checks y vuelve a hacer push"
input=$(cat)
if command -v jq >/dev/null 2>&1; then
  command_text=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
  cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
else
  command_text=$input
  cwd=
fi
printf '%s' "$command_text" | grep -Eq '(^|[^[:alnum:]_-])(gh pr (create|ready)|orch-pr (create|ready))([^[:alnum:]_-]|$)' || exit 0

[ -n "$cwd" ] || cwd=$PWD
git -C "$cwd" fetch -q origin main 2>/dev/null || exit 0 # offline: the workflow labels stale PRs later
git -C "$cwd" merge-base --is-ancestor origin/main HEAD && exit 0

reason="$UPDATED. Falta origin/main en esta rama: corre git merge origin/main (un merge, sin reescribir el historial), resuelve conflictos, corre los checks y vuelve a hacer push antes de abrir o marcar lista la PR."
if command -v jq >/dev/null 2>&1; then
  jq -n --arg r "$reason" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
else
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
fi
