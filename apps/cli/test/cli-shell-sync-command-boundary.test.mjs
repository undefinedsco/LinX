import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const commandSource = readFileSync(new URL('../src/lib/linx-pi-cli-command.ts', import.meta.url), 'utf8')

test('default Pi/TUI command module delegates Pod mirror sync recovery commands', () => {
  assert.doesNotMatch(commandSource, /listPendingPiPodMirrorSync/, 'command orchestration should not list Pod mirror sync checkpoints directly')
  assert.doesNotMatch(commandSource, /retryPendingPiPodMirrorSync/, 'command orchestration should not replay Pod mirror sync checkpoints directly')
  assert.doesNotMatch(commandSource, /runPiSyncStatusCommand/, 'sync recovery command implementation should live in its own shell command module')
  assert.doesNotMatch(commandSource, /runPiSyncRetryCommand/, 'sync recovery retry implementation should live in its own shell command module')
})
