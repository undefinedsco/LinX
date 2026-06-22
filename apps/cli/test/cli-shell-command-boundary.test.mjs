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
const autoModeAuthSource = readFileSync(new URL('../src/lib/auto-mode/auth.ts', import.meta.url), 'utf8')
const autoModePodPersistenceSource = readFileSync(new URL('../src/lib/auto-mode/pod-persistence.ts', import.meta.url), 'utf8')
const autoModePodApprovalSource = readFileSync(new URL('../src/lib/auto-mode/pod-approval.ts', import.meta.url), 'utf8')
const autoModeRuntimeSourceUrl = new URL('../src/lib/auto-mode/runtime.ts', import.meta.url)
const podChatStoreSource = readFileSync(new URL('../src/lib/pod-chat-store.ts', import.meta.url), 'utf8')
const symphonyPodProjectionSource = readFileSync(new URL('../src/lib/symphony/pod-projection.ts', import.meta.url), 'utf8')
const symphonyRuntimeSourceUrl = new URL('../src/lib/symphony/runtime.ts', import.meta.url)
const linxLoginFlowSource = readFileSync(new URL('../src/lib/linx-login-flow.ts', import.meta.url), 'utf8')
const oidcAuthSource = readFileSync(new URL('../src/lib/oidc-auth.ts', import.meta.url), 'utf8')

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

test('auto-mode auth does not expose shared parser through a test-only internal aggregate', () => {
  assert.doesNotMatch(
    autoModeAuthSource,
    /__internal/,
    'Auth parser tests should use the shared runtime parser directly instead of a production __internal aggregate export',
  )
})

test('auto-mode runner does not re-export Solid client credential parser through a test seam', () => {
  assert.doesNotMatch(
    autoModeRunnerSource,
    /__testParseSolidClientCredentials/,
    'Solid client credential parser tests should import the parser from its owning login module instead of through auto-mode runner',
  )
})

test('auto-mode runner does not expose Secretary reaction window policy through a test seam', () => {
  assert.doesNotMatch(
    autoModeRunnerSource,
    /__testResolveSecretaryReactionWindowMs/,
    'Secretary reaction window policy should live in an owning module instead of being tested through auto-mode runner',
  )
})

test('auto-mode runner does not expose shell command routing through a test seam', () => {
  assert.doesNotMatch(
    autoModeRunnerSource,
    /__testHandleAutoModeShellCommand/,
    'Auto-mode shell command routing should live in an owning module instead of being tested through runner',
  )
})

test('auto-mode runner does not expose LinX Cloud auth prompt through a test seam', () => {
  assert.doesNotMatch(
    autoModeRunnerSource,
    /__testPromptLinxCloudAuth/,
    'LinX Cloud auth prompt should live in an owning auth module instead of being tested through runner',
  )
})

test('auto-mode runner does not export the runtime dependency aggregate', () => {
  assert.doesNotMatch(
    autoModeRunnerSource,
    /export\s+const\s+autoModeRuntime\b/,
    'Auto-mode runtime dependencies should live in an owning runtime module instead of being exported by runner',
  )
  assert.equal(
    existsSync(autoModeRuntimeSourceUrl),
    true,
    'Auto-mode runtime dependency injection should have an owning module',
  )
})

test('Pod chat store does not expose a test-only internal aggregate', () => {
  assert.doesNotMatch(
    podChatStoreSource,
    /__podChatStoreInternal/,
    'Pod chat store tests should use named runtime seams and shared model resources instead of a production __internal aggregate export',
  )
})

test('Pod chat store runtime seam is not re-exported through the store module', () => {
  assert.doesNotMatch(
    podChatStoreSource,
    /export\s*\{[\s\S]*setPodChatStoreRuntime[\s\S]*\}\s*from ['"]\.\/pod-chat-store-runtime\.js['"]/,
    'Pod chat store tests should import the runtime seam from its owning module instead of using pod-chat-store as a hidden aggregate',
  )
})

test('auto-mode Pod persistence builders do not expose a test-only internal aggregate', () => {
  assert.doesNotMatch(
    autoModePodPersistenceSource,
    /__podPersistenceInternal/,
    'Pod persistence builder tests should import projection builders from their owning module instead of a production __internal aggregate export',
  )
})

test('auto-mode Pod approval stores do not expose a test-only internal aggregate', () => {
  assert.doesNotMatch(
    autoModePodApprovalSource,
    /__podApprovalInternal/,
    'Pod approval store tests should import store factories from their owning module instead of a production __internal aggregate export',
  )
})

test('Symphony Pod projection does not expose a test-only internal aggregate', () => {
  assert.doesNotMatch(
    symphonyPodProjectionSource,
    /__symphonyPodProjectionInternal/,
    'Symphony Pod projection tests should use named public use-cases or owning modules instead of a production __internal aggregate export',
  )
})

test('symphony command module depends on owning auto-mode modules instead of the aggregate barrel', () => {
  assert.doesNotMatch(
    symphonyCommandSource,
    /from ['"]\.\/auto-mode\/index\.js['"]/,
    'symphony command should import auto-mode runner and types from their owning modules',
  )
})

test('symphony command module does not own the default runtime dependency aggregate', () => {
  assert.doesNotMatch(
    symphonyCommandSource,
    /const\s+defaultRuntime\s*:\s*SymphonyRuntime\b/,
    'Symphony runtime dependencies should live in an owning runtime module instead of the command module',
  )
  assert.equal(
    existsSync(symphonyRuntimeSourceUrl),
    true,
    'Symphony runtime dependency injection should have an owning module',
  )
  assert.doesNotMatch(
    symphonyCommandSource,
    /from ['"]\.\/auto-mode\/archive\.js['"]/,
    'Symphony command should read auto-mode archives through its runtime boundary instead of a hidden fallback import',
  )
})

test('codex plugin command module depends on owning plugin modules instead of the aggregate barrel', () => {
  assert.doesNotMatch(
    codexPluginCommandSource,
    /from ['"]\.\/codex-plugin\/index\.js['"]/,
    'codex plugin command should import native proxy and MCP server from their owning modules',
  )
})

test('linx login flow does not expose auth refresh through a test seam', () => {
  assert.doesNotMatch(
    linxLoginFlowSource,
    /__testRefreshLinxAuthState/,
    'LinX auth state refresh should be a named login-flow API instead of a production __test export',
  )
})

test('OIDC auth does not expose browser-consent reuse through a test seam', () => {
  assert.doesNotMatch(
    oidcAuthSource,
    /__testReuseExistingBrowserConsentLogin/,
    'Browser-consent reuse should be a named OIDC auth API instead of a production __test export',
  )
})

test('OIDC auth does not expose refresh error normalization through a test seam', () => {
  assert.doesNotMatch(
    oidcAuthSource,
    /__testNormalizeOidcSessionRefreshError/,
    'OIDC refresh error normalization should be a named OIDC auth API instead of a production __test export',
  )
})

test('codex plugin internals do not expose an aggregate barrel inside the CLI shell', () => {
  assert.equal(
    existsSync(new URL('../src/lib/codex-plugin/index.ts', import.meta.url)),
    false,
    'codex plugin internals should be consumed through owning modules, not a local aggregate barrel',
  )
})
