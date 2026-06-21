import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const commandSource = readFileSync(new URL('../src/lib/linx-pi-cli-command.ts', import.meta.url), 'utf8')

test('default Pi/TUI command module does not construct Pod ORM state directly', () => {
  assert.doesNotMatch(commandSource, /from ['"]\.\/models\.js['"]/, 'shell command should not import shared model DB primitives directly')
  assert.doesNotMatch(commandSource, /\bdrizzle\s*\(/, 'shell command should delegate Pod DB construction to a use-case module')
  assert.doesNotMatch(commandSource, /\bsolidResources\b/, 'shell command should not know the shared model schema bundle')
})
