import { expect, test } from 'claude-code/testing'

// Run with: claude plugin test .claude/plugins/ota-pr-hook
test('warns once when the classifier finds build paths, never otherwise', async ($, on) => {
  let code = 1
  on('process.run', () => ({ value: { exitCode: code, stdout: 'android/x\n', stderr: '' } }))
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } as never }))
  const call = (command: string) => $.tool.call({ tool: 'Bash', command })

  expect((await call('gh pr create --title x')).deny).toContain('Requiere build de Play')
  expect((await call('gh pr create --title x')).deny).toBeUndefined()
  code = 0
  expect((await call('echo hi')).deny).toBeUndefined()
  expect((await call('gh pr create --title y')).deny).toBeUndefined()
})
