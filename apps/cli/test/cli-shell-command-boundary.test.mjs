import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const commandSource = readFileSync(new URL('../src/lib/linx-pi-cli-command.ts', import.meta.url), 'utf8')
const autoModeCommandSource = readFileSync(new URL('../src/lib/auto-mode-command.ts', import.meta.url), 'utf8')
const symphonyCommandSource = readFileSync(new URL('../src/lib/symphony-command.ts', import.meta.url), 'utf8')
const codexPluginCommandSource = readFileSync(new URL('../src/lib/linx-codex-plugin-command.ts', import.meta.url), 'utf8')

test('default Pi/TUI command module does not construct Pod ORM state directly', () => {
  assert.doesNotMatch(commandSource, /from ['"]\.\/models\.js['"]/, 'shell command should not import shared model DB primitives directly')
  assert.doesNotMatch(commandSource, /\bdrizzle\s*\(/, 'shell command should delegate Pod DB construction to a use-case module')
  assert.doesNotMatch(commandSource, /\bsolidResources\b/, 'shell command should not know the shared model schema bundle')
})

test('auto-mode command module depends on owning auto-mode modules instead of the aggregate barrel', () => {
  assert.doesNotMatch(
    autoModeCommandSource,
    /from ['"]\.\/auto-mode\/index\.js['"]/,
    'auto-mode command should import archive, format, runner, and types from their owning modules',
  )
})

test('auto-mode internals do not expose an aggregate barrel inside the CLI shell', () => {
  assert.equal(
    existsSync(new URL('../src/lib/auto-mode/index.ts', import.meta.url)),
    false,
    'auto-mode internals should be consumed through owning modules, not a local aggregate barrel',
  )
})

test('symphony command module depends on owning auto-mode modules instead of the aggregate barrel', () => {
  assert.doesNotMatch(
    symphonyCommandSource,
    /from ['"]\.\/auto-mode\/index\.js['"]/,
    'symphony command should import auto-mode runner and types from their owning modules',
  )
})

test('codex plugin command module depends on owning plugin modules instead of the aggregate barrel', () => {
  assert.doesNotMatch(
    codexPluginCommandSource,
    /from ['"]\.\/codex-plugin\/index\.js['"]/,
    'codex plugin command should import native proxy and MCP server from their owning modules',
  )
})

test('codex plugin internals do not expose an aggregate barrel inside the CLI shell', () => {
  assert.equal(
    existsSync(new URL('../src/lib/codex-plugin/index.ts', import.meta.url)),
    false,
    'codex plugin internals should be consumed through owning modules, not a local aggregate barrel',
  )
})
