import type { Register } from 'claude-code'

const PR_CREATE = /(^|[;&|(\s])gh\s+pr\s+create\b/

// shortcut: warns once per distinct set of build paths per session, then lets the next
// attempt through; CI (check-ota.sh) stays the real guard. Upgrade if people retry blindly.
const warned = new Set<string>()

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!PR_CREATE.test(e.command)) return next(e)

    // The only list of build paths lives in the script; this hook never repeats it.
    const run = await $.process.run(['sh', '.github/scripts/check-ota.sh', 'classify', 'origin/main', 'HEAD'])
    if (run.exitCode !== 1 && run.exitCode !== 2) return next(e)

    const key = `${run.exitCode}:${run.stdout}`
    if (warned.has(key)) return next(e)
    warned.add(key)

    const detail =
      run.exitCode === 1
        ? `This branch touches paths that need a Play build:\n${run.stdout.trim()}\nTick «Requiere build de Play» (not «Apto para OTA») in the "## Entrega" section of the PR body, then run gh pr create again.`
        : `The OTA classifier could not run (${run.stderr.trim()}). Fix that first: an error never counts as OTA. Then tick exactly one box in "## Entrega" and run gh pr create again.`
    return { deny: `${$.plugin.name}: ${detail}` }
  })
}
