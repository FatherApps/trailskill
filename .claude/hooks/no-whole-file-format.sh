#!/bin/sh
# Claude Code PreToolUse hook (matcher Bash): denies formatters that rewrite whole files.
# Blocks `prettier --write|-w`, `eslint --fix`, `expo lint --fix` (also via npx or `npm run lint -- --fix`) unless every
# argument is an explicit file, and `npm run format`. `prettier --check`, `format:check` and explicit files are allowed.
# Reads the PreToolUse JSON on stdin. Without jq it scans the raw JSON, which still contains the command text.
# shortcut: quotes inside a command are stripped, not parsed, and `;` or `|` inside quotes split a command; fine for a guard, upgrade if it misfires.
MESSAGE="no formatear archivos enteros: resolvé conflictos a mano"
input=$(cat)
if command -v jq >/dev/null 2>&1; then
  command_text=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
  cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
else
  command_text=$input
  cwd=
fi
[ -n "$cwd" ] && cd "$cwd" 2>/dev/null

# Explicit file: no glob characters, not a directory, and either an existing file or a name with an extension.
is_file() {
  case $1 in '' | *[\*\?\[\]\{\}]* | */) return 1 ;; esac
  [ -d "$1" ] && return 1
  [ -f "$1" ] && return 0
  case $1 in *.*) return 0 ;; esac
  return 1
}

# Returns 0 when one command segment formats whole files.
bad_segment() {
  set -f
  # shellcheck disable=SC2086
  set -- $1
  kind= write= has_file=0 has_other=0
  prev=
  for raw in "$@"; do
    tok=$(printf '%s' "$raw" | tr -d "\"'")
    case $tok in
      prettier | */prettier) kind=prettier ;;
      eslint | */eslint) kind=eslint ;;
      lint) [ "$prev" = expo ] || [ "$prev" = run ] && kind=eslint ;;
      format) [ "$prev" = run ] && return 0 ;;
      --write | -w) [ "$kind" = prettier ] && write=1 ;;
      --fix) [ "$kind" = eslint ] && write=1 ;;
      -* | -- | npx | npm | run | exec | expo | pnpm | yarn | dlx | *=*) ;;
      *) if is_file "$tok"; then has_file=1; else has_other=1; fi ;;
    esac
    prev=$tok
  done
  [ -n "$write" ] || return 1
  [ "$has_file" = 1 ] && [ "$has_other" = 0 ] && return 1
  return 0
}

segments=$(printf '%s\n' "$command_text" | sed 's/&&/;/g; s/||/;/g' | tr ';|' '\n\n')
deny=0
old_ifs=$IFS
IFS='
'
for segment in $segments; do
  IFS=$old_ifs
  if bad_segment "$segment"; then deny=1; break; fi
  IFS='
'
done
IFS=$old_ifs
[ "$deny" = 1 ] || exit 0

if command -v jq >/dev/null 2>&1; then
  jq -n --arg r "$MESSAGE" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
else
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$MESSAGE"
fi
