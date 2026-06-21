import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('CLI entry delegates Pi/TUI command orchestration to a shell command module', () => {
  assert.match(indexSource, /from ['"]\.\/lib\/linx-pi-cli-command\.js['"]/)
  assert.doesNotMatch(indexSource, /async function runPiCommand\b/)
  assert.doesNotMatch(indexSource, /function buildPiCommand\b/)
  assert.doesNotMatch(indexSource, /async function selectLinxSession\b/)
  assert.doesNotMatch(indexSource, /async function resolvePiStartupControlState\b/)
})
