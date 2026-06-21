import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const cliAppSource = readFileSync(new URL('../src/linx-cli-app.ts', import.meta.url), 'utf8')

test('CLI entry delegates yargs command registration to a CLI app module', () => {
  assert.match(indexSource, /from ['"]\.\/linx-cli-app\.js['"]/, 'entry should import the CLI app runner')
  assert.doesNotMatch(indexSource, /from ['"]yargs['"]/, 'entry should not construct yargs directly')
  assert.doesNotMatch(indexSource, /from ['"]yargs\/helpers['"]/, 'entry should not know yargs helper wiring')
  assert.doesNotMatch(indexSource, /\.command\(/, 'entry should not register command descriptors directly')
  assert.doesNotMatch(indexSource, /\.strict\(\)/, 'entry should not own parser policy')
  assert.doesNotMatch(indexSource, /\.fail\(/, 'entry should not own CLI failure handling')
  assert.doesNotMatch(indexSource, /cli\.parse\(\)/, 'entry should not own parser execution')
})

test('CLI app delegates Pi/TUI command orchestration to a shell command module', () => {
  assert.match(cliAppSource, /from ['"]\.\/lib\/linx-pi-cli-command\.js['"]/, 'CLI app should import Pi command descriptors from the shell command module')
  assert.doesNotMatch(cliAppSource, /async function runPiCommand\b/)
  assert.doesNotMatch(cliAppSource, /function buildPiCommand\b/)
  assert.doesNotMatch(cliAppSource, /async function selectLinxSession\b/)
  assert.doesNotMatch(cliAppSource, /async function resolvePiStartupControlState\b/)
})

test('CLI app delegates Pi runtime adapter wiring to a CLI composition module', () => {
  assert.match(cliAppSource, /from ['"]\.\/linx-cli-runtime-adapter-factory\.js['"]/, 'CLI app should import pre-composed runtime adapter factory from a CLI composition module')
  assert.doesNotMatch(cliAppSource, /from ['"]\.\/lib\/pi-adapter\/index\.js['"]/, 'CLI app should not import the Pi runtime adapter directly')
  assert.doesNotMatch(cliAppSource, /createLinxRuntimeAdapter/, 'CLI app should not construct the LinX runtime adapter')
  assert.doesNotMatch(cliAppSource, /createRemoteCompletionResult/, 'CLI app should not wire remote chat completion directly')
  assert.doesNotMatch(cliAppSource, /listRemoteModels/, 'CLI app should not wire remote model listing directly')
  assert.doesNotMatch(cliAppSource, /chat-api\.js/, 'CLI app should not dynamically import chat API internals')
})

test('CLI app delegates package command implementation to a shell package module', () => {
  assert.match(cliAppSource, /from ['"]\.\/lib\/linx-package-command\.js['"]/, 'CLI app should import package command descriptors from a shell module')
  assert.doesNotMatch(cliAppSource, /DefaultPackageManager/, 'CLI app should not construct the Pi package manager directly')
  assert.doesNotMatch(cliAppSource, /SettingsManager/, 'CLI app should not construct Pi settings for package commands directly')
  assert.doesNotMatch(cliAppSource, /function runLinxPackageCommand\b/, 'CLI app should not implement package command execution')
  assert.doesNotMatch(cliAppSource, /function printConfiguredLinxPackages\b/, 'CLI app should not implement package list rendering')
})

test('CLI app delegates legacy chat and models commands to a shell command module', () => {
  assert.match(cliAppSource, /from ['"]\.\/lib\/linx-chat-models-command\.js['"]/, 'CLI app should import chat/models command descriptors from a shell module')
  assert.doesNotMatch(cliAppSource, /function loadChatRuntime\b/, 'CLI app should not load chat runtime internals directly')
  assert.doesNotMatch(cliAppSource, /function resolveContext\b/, 'CLI app should not resolve Pod chat runtime context directly')
  assert.doesNotMatch(cliAppSource, /function resolveRuntimeAuthContext\b/, 'CLI app should not resolve model-list auth context directly')
  assert.doesNotMatch(cliAppSource, /function runSingleTurn\b/, 'CLI app should not implement single-turn chat execution')
  assert.doesNotMatch(cliAppSource, /function runInteractive\b/, 'CLI app should not implement the legacy prompt loop')
  assert.doesNotMatch(cliAppSource, /function formatRemoteModelMetadata\b/, 'CLI app should not render remote model metadata')
})

test('CLI app delegates hidden Codex bridge commands to a shell command module', () => {
  assert.match(cliAppSource, /from ['"]\.\/lib\/linx-codex-plugin-command\.js['"]/, 'CLI app should import hidden Codex bridge command descriptors from a shell module')
  assert.doesNotMatch(cliAppSource, /createCodexNativeProxy/, 'CLI app should not construct the native Codex proxy directly')
  assert.doesNotMatch(cliAppSource, /createSymphonyCodexMcpServer/, 'CLI app should not construct the Symphony Codex MCP server directly')
  assert.doesNotMatch(cliAppSource, /codex-native-proxy/, 'CLI app should not define hidden Codex proxy command internals directly')
  assert.doesNotMatch(cliAppSource, /symphony-codex-mcp/, 'CLI app should not define hidden Symphony MCP command internals directly')
  assert.doesNotMatch(cliAppSource, /new Promise\(\(\) => \{\}\)/, 'CLI app should not own long-running hidden process lifecycle loops')
})

test('CLI app delegates retired and placeholder commands to a shell command module', () => {
  assert.match(cliAppSource, /from ['"]\.\/lib\/linx-retired-command\.js['"]/, 'CLI app should import retired and placeholder command descriptors from a shell module')
  assert.doesNotMatch(cliAppSource, /CommandModule/, 'CLI app should not need yargs command implementation types')
  assert.doesNotMatch(cliAppSource, /retiredSymphonyCommand/, 'CLI app should not implement retired command descriptors inline')
  assert.doesNotMatch(cliAppSource, /Fork is not implemented yet/, 'CLI app should not implement placeholder command errors inline')
})
