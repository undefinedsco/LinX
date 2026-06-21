import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const commandSource = readFileSync(new URL('../src/lib/linx-pi-cli-command.ts', import.meta.url), 'utf8')

test('default Pi/TUI command module does not assemble LinX cloud runtime dependencies', () => {
  assert.doesNotMatch(commandSource, /createRemoteCompletionResult/, 'command orchestration should not wire chat completion helpers directly')
  assert.doesNotMatch(commandSource, /listRemoteModels\s*\(/, 'command orchestration should not wire model catalog helpers directly')
  assert.doesNotMatch(commandSource, /import\('\.\/chat-api\.js'\)/, 'command orchestration should not dynamically import chat API internals')
})
