import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const commandSource = readFileSync(new URL('../src/lib/linx-pi-cli-command.ts', import.meta.url), 'utf8')

test('default Pi/TUI command module delegates resume selector rendering to a shell UI module', () => {
  assert.doesNotMatch(commandSource, /\bnew\s+TUI\b/, 'command orchestration should not instantiate the terminal UI directly')
  assert.doesNotMatch(commandSource, /\bnew\s+ProcessTerminal\b/, 'command orchestration should not own terminal construction')
  assert.doesNotMatch(commandSource, /\bnew\s+SessionSelectorComponent\b/, 'command orchestration should delegate selector rendering')
})
