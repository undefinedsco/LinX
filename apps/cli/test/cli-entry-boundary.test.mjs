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

test('CLI entry delegates Pi runtime adapter wiring to a CLI composition module', () => {
  assert.match(indexSource, /from ['"]\.\/linx-cli-runtime-adapter-factory\.js['"]/, 'entry should import pre-composed runtime adapter factory from a CLI composition module')
  assert.doesNotMatch(indexSource, /from ['"]\.\/lib\/pi-adapter\/index\.js['"]/, 'entry should not import the Pi runtime adapter directly')
  assert.doesNotMatch(indexSource, /createLinxRuntimeAdapter/, 'entry should not construct the LinX runtime adapter')
  assert.doesNotMatch(indexSource, /createRemoteCompletionResult/, 'entry should not wire remote chat completion directly')
  assert.doesNotMatch(indexSource, /listRemoteModels/, 'entry should not wire remote model listing directly')
  assert.doesNotMatch(indexSource, /chat-api\.js/, 'entry should not dynamically import chat API internals')
})

test('CLI entry delegates package command implementation to a shell package module', () => {
  assert.match(indexSource, /from ['"]\.\/lib\/linx-package-command\.js['"]/, 'entry should import package command descriptors from a shell module')
  assert.doesNotMatch(indexSource, /DefaultPackageManager/, 'entry should not construct the Pi package manager directly')
  assert.doesNotMatch(indexSource, /SettingsManager/, 'entry should not construct Pi settings for package commands directly')
  assert.doesNotMatch(indexSource, /function runLinxPackageCommand\b/, 'entry should not implement package command execution')
  assert.doesNotMatch(indexSource, /function printConfiguredLinxPackages\b/, 'entry should not implement package list rendering')
})

test('CLI entry delegates legacy chat and models commands to a shell command module', () => {
  assert.match(indexSource, /from ['"]\.\/lib\/linx-chat-models-command\.js['"]/, 'entry should import chat/models command descriptors from a shell module')
  assert.doesNotMatch(indexSource, /function loadChatRuntime/, 'entry should not load chat runtime internals directly')
  assert.doesNotMatch(indexSource, /function resolveContext/, 'entry should not resolve Pod chat runtime context directly')
  assert.doesNotMatch(indexSource, /function resolveRuntimeAuthContext/, 'entry should not resolve model-list auth context directly')
  assert.doesNotMatch(indexSource, /function runSingleTurn/, 'entry should not implement single-turn chat execution')
  assert.doesNotMatch(indexSource, /function runInteractive/, 'entry should not implement the legacy prompt loop')
  assert.doesNotMatch(indexSource, /function formatRemoteModelMetadata/, 'entry should not render remote model metadata')
})

test('CLI entry delegates hidden Codex bridge commands to a shell command module', () => {
  assert.match(indexSource, /from ['"]\.\/lib\/linx-codex-plugin-command\.js['"]/, 'entry should import hidden Codex bridge command descriptors from a shell module')
  assert.doesNotMatch(indexSource, /createCodexNativeProxy/, 'entry should not construct the native Codex proxy directly')
  assert.doesNotMatch(indexSource, /createSymphonyCodexMcpServer/, 'entry should not construct the Symphony Codex MCP server directly')
  assert.doesNotMatch(indexSource, /codex-native-proxy/, 'entry should not define hidden Codex proxy command internals directly')
  assert.doesNotMatch(indexSource, /symphony-codex-mcp/, 'entry should not define hidden Symphony MCP command internals directly')
  assert.doesNotMatch(indexSource, /new Promise\(\(\) => \{\}\)/, 'entry should not own long-running hidden process lifecycle loops')
})

test('CLI entry delegates retired and placeholder commands to a shell command module', () => {
  assert.match(indexSource, /from ['"]\.\/lib\/linx-retired-command\.js['"]/, 'entry should import retired and placeholder command descriptors from a shell module')
  assert.doesNotMatch(indexSource, /CommandModule/, 'entry should not need yargs command implementation types')
  assert.doesNotMatch(indexSource, /retiredSymphonyCommand/, 'entry should not implement retired command descriptors inline')
  assert.doesNotMatch(indexSource, /Fork is not implemented yet/, 'entry should not implement placeholder command errors inline')
})
