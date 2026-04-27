import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadWatchModule } from './watch-test-bundle.mjs'

test('pi interactive bootstrap can instantiate and init/stop with the LinX runtime adapter', async (t) => {
  const [{ module: runtimeModule, cleanup: runtimeCleanup }, { module: interactiveModule, cleanup: interactiveCleanup }] = await Promise.all([
    loadWatchModule('lib/pi-adapter/runtime.ts'),
    loadWatchModule('lib/pi-adapter/interactive.ts'),
  ])
  t.after(() => runtimeCleanup())
  t.after(() => interactiveCleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-interactive-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-interactive-agent-'))
  t.after(() => {
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = runtimeModule.createPiRuntimeAdapter({
    createNativeProxy() {
      return {
        remoteUrl: 'ws://127.0.0.1:8877',
        record: {
          id: 'watch_native_proxy_789',
          cwd,
          model: 'gpt-5-codex',
          backend: 'codex',
        },
        async start() {},
        async sendTurn() {},
        subscribe() {
          return () => {}
        },
        async close() {},
      }
    },
  }, {
    cwd,
    model: 'gpt-5-codex',
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
      oauth: {
        name: 'LinX Cloud',
        async login() {
          return {
            refresh: 'refresh-token',
            access: 'access-token',
            expires: Date.now() + 60_000,
          }
        },
        async refreshToken(credentials) {
          return credentials
        },
        getApiKey() {
          return 'cloud-access-token'
        },
      },
    },
  })

  const runtime = await adapter.createRuntime({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
  })

  const interactive = interactiveModule.bootstrapPiInteractiveMode(runtime)
  assert.equal(typeof interactive.init, 'function')
  assert.equal(typeof interactive.stop, 'function')

  await interactive.init()
  interactive.stop()
})

test('linx interactive branding stores agent state under .linx and patches update checks', async (t) => {
  const [{ module: brandingModule, cleanup: brandingCleanup }, { module: interactiveModule, cleanup: interactiveCleanup }] = await Promise.all([
    loadWatchModule('lib/pi-adapter/branding.ts'),
    loadWatchModule('lib/pi-adapter/interactive.ts'),
  ])
  t.after(() => brandingCleanup())
  t.after(() => interactiveCleanup())

  assert.equal(brandingModule.LINX_AGENT_DIR.endsWith('/.linx/agent'), true)

  const runtime = {
    sessionManager: {
      getCwd() {
        return '/tmp/demo'
      },
      getSessionName() {
        return undefined
      },
    },
    session: {
      settingsManager: {
        getShowHardwareCursor() { return false },
        getClearOnShrink() { return false },
        getEditorPaddingX() { return 1 },
        getAutocompleteMaxVisible() { return 8 },
        getHideThinkingBlock() { return false },
        getTheme() { return 'dark' },
        getQuietStartup() { return true },
      },
      sessionManager: {
        getCwd() {
          return '/tmp/demo'
        },
        getSessionName() {
          return undefined
        },
      },
      resourceLoader: {
        getThemes() { return { themes: [] } },
      },
      autoCompactionEnabled: false,
    },
    services: {},
    diagnostics: [],
  }

  const interactive = interactiveModule.bootstrapPiInteractiveMode(runtime)
  assert.equal(typeof interactive.init, 'function')
  assert.equal(typeof interactive.run, 'function')
  assert.equal(typeof interactive.stop, 'function')
})
