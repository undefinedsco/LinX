import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const commandSource = readFileSync(new URL('../src/lib/linx-pi-cli-command.ts', import.meta.url), 'utf8')
const autoModeCommandSource = readFileSync(new URL('../src/lib/auto-mode-command.ts', import.meta.url), 'utf8')
const symphonyCommandSource = readFileSync(new URL('../src/lib/symphony-command.ts', import.meta.url), 'utf8')
const codexPluginCommandSource = readFileSync(new URL('../src/lib/linx-codex-plugin-command.ts', import.meta.url), 'utf8')
const autoModeRunnerSource = readFileSync(new URL('../src/lib/auto-mode/runner.ts', import.meta.url), 'utf8')
const autoModeDisplaySource = readFileSync(new URL('../src/lib/auto-mode/display.ts', import.meta.url), 'utf8')
const autoModeFormatSource = readFileSync(new URL('../src/lib/auto-mode/format.ts', import.meta.url), 'utf8')
const autoModeSecretarySource = readFileSync(new URL('../src/lib/auto-mode/secretary.ts', import.meta.url), 'utf8')
const autoModePodAiSource = readFileSync(new URL('../src/lib/auto-mode/pod-ai.ts', import.meta.url), 'utf8')

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

test('auto-mode hook registry is imported through its owning module, not a default index entry', () => {
  assert.equal(
    existsSync(new URL('../src/lib/auto-mode/hooks/index.ts', import.meta.url)),
    false,
    'auto-mode hook registry should be named explicitly instead of hidden behind hooks/index',
  )
  for (const source of [autoModeRunnerSource, autoModeDisplaySource, autoModeFormatSource]) {
    assert.doesNotMatch(source, /from ['"]\.\/hooks\/index\.js['"]/)
  }
})

test('auto-mode Secretary does not expose test-only internal aggregate exports', () => {
  assert.doesNotMatch(
    autoModeSecretarySource,
    /__autoModeSecretaryInternal/,
    'Secretary runtime helpers should live in owning modules instead of a production __internal aggregate export',
  )
})

test('auto-mode Pod AI credential selection does not expose test-only internal aggregate exports', () => {
  assert.doesNotMatch(
    autoModePodAiSource,
    /__podInternal/,
    'Pod AI credential selectors should live in owning modules instead of a production __internal aggregate export',
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
