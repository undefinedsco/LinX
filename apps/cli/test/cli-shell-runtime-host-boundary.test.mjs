import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const commandSource = readFileSync(new URL('../src/lib/linx-pi-cli-command.ts', import.meta.url), 'utf8')

test('default Pi/TUI command module delegates Pod mirror runtime hosting', () => {
  assert.doesNotMatch(commandSource, /\bnew\s+LinxPiPodMirror\b/, 'command orchestration should not construct the Pod mirror host directly')
  assert.doesNotMatch(commandSource, /createFileSyncCheckpointStore\s*\(/, 'command orchestration should not construct mirror checkpoint storage directly')
  assert.doesNotMatch(commandSource, /__linxPodMirror/, 'command orchestration should not mutate runtime bridge internals for Pod mirror wiring')
})
