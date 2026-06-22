import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const cliAppSource = readFileSync(new URL('../src/linx-cli-app.ts', import.meta.url), 'utf8')

const piCliCommandSource = readFileSync(new URL('../src/lib/linx-pi-cli-command.ts', import.meta.url), 'utf8')

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

test('default Pi/TUI command module delegates top-level prompt admission policy', () => {
  const admissionSource = readFileSync(new URL('../src/lib/linx-top-level-command-admission.ts', import.meta.url), 'utf8')

  assert.match(piCliCommandSource, /from ['"]\.\/linx-top-level-command-admission\.js['"]/, 'Pi command orchestration should import top-level command admission policy')
  assert.doesNotMatch(piCliCommandSource, /RESERVED_NON_TOP_LEVEL_COMMANDS/, 'reserved top-level command words should live in the admission policy module')
  assert.doesNotMatch(piCliCommandSource, /Unknown command:/, 'top-level command rejection copy should live in the admission policy module')
  assert.match(admissionSource, /RESERVED_NON_TOP_LEVEL_COMMANDS/, 'admission policy should own reserved command-shaped prompt tokens')
})

test('default Pi/TUI command module delegates auto-mode and backend admission policy', () => {
  assert.match(piCliCommandSource, /from ['"]\.\/linx-auto-mode-cli-admission\.js['"]/, 'Pi command orchestration should import auto-mode CLI admission policy')
  assert.doesNotMatch(piCliCommandSource, /\bisAutoModeRequest\b/, 'auto-mode request detection should live in the auto-mode admission policy module')
  assert.doesNotMatch(piCliCommandSource, /\brunAutoModeCommand\b/, 'auto-mode command execution should live in the auto-mode admission policy module')
})

test('default Pi/TUI command module delegates resume selector admission policy', () => {
  assert.match(piCliCommandSource, /from ['"]\.\/linx-pi-resume-cli-admission\.js['"]/, 'Pi command orchestration should import resume selector admission policy')
  assert.doesNotMatch(piCliCommandSource, /from ['"]\.\/linx-session-selector-ui\.js['"]/, 'Pi command orchestration should not import selector rendering directly')
  assert.doesNotMatch(piCliCommandSource, /\bselectLinxPiSession\b/, 'resume selector UI call should live in the resume admission policy module')
  assert.doesNotMatch(piCliCommandSource, /No session selected/, 'resume selector user copy should live in the resume admission policy module')
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

test('CLI app delegates config namespace registration to a shell config module', () => {
  const configCommandSource = readFileSync(new URL('../src/lib/linx-config-command.ts', import.meta.url), 'utf8')
  const statusLineConfigCommandSource = readFileSync(new URL('../src/lib/linx-status-line-config-command.ts', import.meta.url), 'utf8')

  assert.match(cliAppSource, /from ['"]\.\/lib\/linx-config-command\.js['"]/, 'CLI app should import the top-level config namespace from a shell config module')
  assert.doesNotMatch(cliAppSource, /from ['"]\.\/lib\/status-line-command\.js['"]/, 'CLI app should not import a section module as the top-level config owner')
  assert.match(configCommandSource, /from ['"]\.\/linx-status-line-config-command\.js['"]/, 'top-level config namespace should import the status-line config section from a named section module')
  assert.doesNotMatch(configCommandSource, /from ['"]\.\/status-line-command\.js['"]/, 'top-level config namespace should not depend on the ambiguous status-line-command module name')
  assert.doesNotMatch(statusLineConfigCommandSource, /export const configCommand\b/, 'status-line config section module should not own the top-level config command')
  assert.match(statusLineConfigCommandSource, /export const statusLineConfigCommand\b/, 'status-line config section module should export only its config section descriptor')
})

test('CLI app delegates models command to a shell command module', () => {
  assert.match(cliAppSource, /from ['"]\.\/lib\/linx-models-command\.js['"]/, 'CLI app should import models command descriptor from a shell module')
  assert.doesNotMatch(cliAppSource, /function loadChatRuntime\b/, 'CLI app should not load chat runtime internals directly')
  assert.doesNotMatch(cliAppSource, /function resolveRuntimeAuthContext\b/, 'CLI app should not resolve model-list auth context directly')
  assert.doesNotMatch(cliAppSource, /legacyChatCommand/, 'CLI app should not register the retired legacy chat command')
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

test('CLI app delegates retired commands to a shell command module', () => {
  assert.match(cliAppSource, /from ['"]\.\/lib\/linx-retired-command\.js['"]/, 'CLI app should import retired command descriptors from a shell module')
  assert.doesNotMatch(cliAppSource, /CommandModule/, 'CLI app should not need yargs command implementation types')
  assert.doesNotMatch(cliAppSource, /retiredSymphonyCommand/, 'CLI app should not implement retired command descriptors inline')
})
