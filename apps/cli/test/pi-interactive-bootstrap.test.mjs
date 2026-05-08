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
      state: {
        messages: [],
        model: {
          id: 'linx-lite',
          provider: 'undefineds',
          reasoning: true,
          contextWindow: 1000,
        },
        thinkingLevel: 'medium',
      },
    },
    services: {},
    diagnostics: [],
  }

  const interactive = interactiveModule.bootstrapPiInteractiveMode(runtime)
  assert.equal(typeof interactive.init, 'function')
  assert.equal(typeof interactive.run, 'function')
  assert.equal(typeof interactive.stop, 'function')
})

test('linx escape interrupt aborts streaming session before Pi default handler', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const calls = []
  const interactive = {
    defaultEditor: {
      onEscape() {
        calls.push('original')
      },
    },
    session: {
      isStreaming: true,
      abort() {
        calls.push('abort')
      },
    },
  }

  module.installLinxEscapeInterrupt(interactive)
  interactive.defaultEditor.onEscape()

  assert.deepEqual(calls, ['abort'])
})

test('linx escape interrupt aborts bash and preserves idle escape behavior', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const calls = []
  const interactive = {
    defaultEditor: {
      onEscape() {
        calls.push('original')
      },
    },
    session: {
      isBashRunning: true,
      abortBash() {
        calls.push('abortBash')
      },
    },
  }

  module.installLinxEscapeInterrupt(interactive)
  interactive.defaultEditor.onEscape()
  interactive.session.isBashRunning = false
  interactive.defaultEditor.onEscape()

  assert.deepEqual(calls, ['abortBash', 'original'])
})

test('linx escape interrupt keeps wrapping later Pi escape handler assignments', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const calls = []
  const interactive = {
    defaultEditor: {
      onEscape() {
        calls.push('original')
      },
    },
    session: {
      abort() {
        calls.push('abort')
      },
    },
    loadingAnimation: {},
  }

  module.installLinxEscapeInterrupt(interactive)
  interactive.defaultEditor.onEscape = () => {
    calls.push('later')
  }
  interactive.defaultEditor.onEscape()
  interactive.loadingAnimation = null
  interactive.defaultEditor.onEscape()

  assert.deepEqual(calls, ['abort', 'later'])
})

test('linx footer patch adds cache rate from assistant usage', async (t) => {
  const [{ module: runtimeModule, cleanup: runtimeCleanup }, { module: interactiveModule, cleanup: interactiveCleanup }] = await Promise.all([
    loadWatchModule('lib/pi-adapter/runtime.ts'),
    loadWatchModule('lib/pi-adapter/interactive.ts'),
  ])
  t.after(() => runtimeCleanup())
  t.after(() => interactiveCleanup())

  const { FooterComponent } = await import('@mariozechner/pi-coding-agent')
  const { visibleWidth } = await import('@mariozechner/pi-tui')

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
        getEntries() {
          return [
            {
              type: 'message',
              message: {
                role: 'assistant',
                usage: {
                  input: 60,
                  output: 25,
                  cacheRead: 30,
                  cacheWrite: 10,
                  cost: { total: 0 },
                },
              },
            },
          ]
        },
      },
      state: {
        model: {
          id: 'linx-lite',
          provider: 'undefineds',
          reasoning: true,
          contextWindow: 1000,
        },
        thinkingLevel: 'medium',
      },
      modelRegistry: {
        isUsingOAuth() {
          return false
        },
      },
      getContextUsage() {
        return { contextWindow: 1000, percent: 12.5 }
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

  const footer = new FooterComponent(runtime.session, {
    getGitBranch() { return null },
    getExtensionStatuses() { return new Map() },
    getAvailableProviderCount() { return 1 },
  })

  const rendered = footer.render(100)
  const renderedText = rendered.join('\n')
  assert.match(renderedText, /↑60 • ↓25 • 12\.5%\/1\.0k \(auto\) • cache 30% • linx-lite • medium/)
  assert.doesNotMatch(renderedText, /\bR30\b/)
  assert.doesNotMatch(renderedText, /\bW10\b/)
  assert.equal(rendered.every((line) => visibleWidth(line) <= 100), true)
})

test('linx footer patch keeps cache rate line within terminal width', async (t) => {
  const [{ module: runtimeModule, cleanup: runtimeCleanup }, { module: interactiveModule, cleanup: interactiveCleanup }] = await Promise.all([
    loadWatchModule('lib/pi-adapter/runtime.ts'),
    loadWatchModule('lib/pi-adapter/interactive.ts'),
  ])
  t.after(() => runtimeCleanup())
  t.after(() => interactiveCleanup())

  const { FooterComponent } = await import('@mariozechner/pi-coding-agent')
  const { visibleWidth } = await import('@mariozechner/pi-tui')

  const runtime = {
    sessionManager: {
      getCwd() {
        return '/Users/ganlu'
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
          return '/Users/ganlu'
        },
        getSessionName() {
          return undefined
        },
        getEntries() {
          return [
            {
              type: 'message',
              message: {
                role: 'assistant',
                usage: {
                  input: 1500,
                  output: 55,
                  cacheRead: 0,
                  cacheWrite: 0,
                  cost: { total: 0 },
                },
              },
            },
          ]
        },
      },
      state: {
        model: {
          id: 'linx-lite',
          provider: 'undefineds',
          reasoning: true,
          contextWindow: 1_000_000,
        },
        thinkingLevel: 'high',
      },
      modelRegistry: {
        isUsingOAuth() {
          return false
        },
      },
      getContextUsage() {
        return { contextWindow: 1_000_000, percent: 0.2 }
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
  assert.equal(typeof runtimeModule.createPiRuntimeAdapter, 'function')
  assert.equal(typeof interactive.init, 'function')

  const footer = new FooterComponent(runtime.session, {
    getGitBranch() { return null },
    getExtensionStatuses() { return new Map() },
    getAvailableProviderCount() { return 1 },
  })

  const rendered = footer.render(180)
  assert.match(rendered.join('\n'), /cache 0%/)
  assert.equal(rendered.every((line) => visibleWidth(line) <= 180), true)
})

test('linx interactive exit message prints resume command and token usage', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const output = module.buildLinxExitMessage({
    sessionManager: {
      getCwd() {
        return '/tmp/demo'
      },
      getSessionName() {
        return undefined
      },
      getSessionId() {
        return '019df-exit-test'
      },
    },
    session: {
      sessionId: '019df-exit-test',
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
        getSessionId() {
          return '019df-exit-test'
        },
        getEntries() {
          return [
            {
              type: 'message',
              message: {
                role: 'assistant',
                usage: {
                  input: 100,
                  output: 25,
                  cacheRead: 50,
                  cacheWrite: 0,
                },
              },
            },
          ]
        },
      },
      resourceLoader: {
        getThemes() { return { themes: [] } },
      },
      autoCompactionEnabled: false,
    },
  })

  assert.match(output, /LinX session closed/)
  assert.match(output, /Token usage: input 100 · output 25 · cache 33%/)
  assert.match(output, /Resume: linx resume 019df-exit-test/)
})

test('linx welcome header keeps the full session id instead of truncating it', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const interactive = {
    sessionManager: {
      getCwd() {
        return '/tmp/demo'
      },
      getSessionName() {
        return undefined
      },
      getSessionId() {
        return '019dfb09-c57f-70cb-9768-3c054d44a3ed'
      },
    },
    session: {
      model: { id: 'linx' },
    },
  }

  const rendered = module.buildLinxWelcomeCardState
    ? module.buildLinxWelcomeCardState(interactive, 'ganbb')
    : null

  if (rendered) {
    assert.equal(rendered.session, '019dfb09-c57f-70cb-9768-3c054d44a3ed')
  }
})

test('linx update notification uses an action selector instead of a static npm command', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const selectorCalls = []
  const openedUrls = []
  const statuses = []
  const rendered = []
  const interactive = {
    chatContainer: {
      addChild(child) {
        rendered.push(child)
      },
    },
    ui: {
      requestRender() {},
    },
    async showExtensionSelector(title, options) {
      selectorCalls.push({ title, options })
      return 'Open changelog'
    },
    openExternal(url) {
      openedUrls.push(url)
    },
    showStatus(message) {
      statuses.push(message)
    },
  }

  module.applyLinxInteractiveBranding(interactive)
  interactive.showNewVersionNotification('0.2.3')
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(selectorCalls.length, 1)
  assert.match(selectorCalls[0].title, /LinX update available/)
  assert.deepEqual(selectorCalls[0].options, ['Install update and restart', 'Open changelog', 'Later'])
  assert.equal(openedUrls[0], 'https://github.com/undefineds-co/linx-cli/releases')
  assert.equal(statuses.some((message) => message.includes('Opened LinX changelog')), true)
  const renderedText = rendered.map((child) => child.text ?? child.render?.(100)?.join('\n') ?? '').join('\n')
  assert.doesNotMatch(renderedText, /Run: npm install -g @undefineds\.co\/linx/)
})

test('linx update version comparison handles preview builds', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  assert.equal(module.isVersionNewer('0.2.3', '0.2.4-preview.1777478039135'), false)
  assert.equal(module.isVersionNewer('0.2.4-preview.1777478039135', '0.2.3'), true)
  assert.equal(module.isVersionNewer('0.2.4', '0.2.4-preview.1777478039135'), true)
  assert.equal(module.isVersionNewer('0.2.4-preview.1777478039135', '0.2.4'), false)
  assert.equal(module.isVersionNewer('0.2.4', '0.2.3'), true)
})

test('linx /login command shows a LinX-only auth selector before browser login', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const submitted = []
  const editorTexts = []
  const loginCalls = []
  const loginForceFreshValues = []
  const hasManualRedirectCallbacks = []
  const linxSelectorCalls = []
  const oauthSelectorCalls = []
  const openedUrls = []
  const interactive = {
    defaultEditor: {},
    editor: {
      setText(value) {
        editorTexts.push(value)
      },
    },
    session: {
      modelRegistry: {
        refresh() {},
        authStorage: {
          async login(providerId, callbacks) {
            loginCalls.push(providerId)
            loginForceFreshValues.push(callbacks.forceFresh)
            hasManualRedirectCallbacks.push(typeof callbacks.onManualCodeInput === 'function')
            callbacks.onAuth({ url: 'https://id.undefineds.co/.oidc/auth?client_id=test' })
          },
          get() {
            return { type: 'oauth', access: 'fresh-access-token', refresh: 'refresh', expires: Date.now() + 60_000 }
          },
          setRuntimeApiKey(providerId, apiKey) {
            loginCalls.push(`${providerId}:${apiKey}`)
          },
        },
      },
    },
    chatContainer: {
      addChild() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    async showExtensionSelector(title, options) {
      linxSelectorCalls.push({ title, options })
      return 'Authorize in browser'
    },
    showOAuthSelector(mode) {
      oauthSelectorCalls.push(mode)
    },
    showStatus() {},
    showError(message) {
      throw new Error(message)
    },
    openExternal(url) {
      openedUrls.push(url)
    },
    async updateAvailableProviderCount() {},
  }

  module.applyLinxInteractiveBranding(interactive)
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/login')
  await interactive.defaultEditor.onSubmit('hello')

  assert.deepEqual(editorTexts, [''])
  assert.deepEqual(oauthSelectorCalls, [])
  assert.equal(linxSelectorCalls.length, 1)
  assert.match(linxSelectorCalls[0].title, /LinX Cloud authorization/)
  assert.deepEqual(linxSelectorCalls[0].options, ['Authorize in browser', 'Enter API key', 'Exit'])
  assert.equal(loginCalls[0], 'undefineds')
  assert.equal(loginCalls[1], 'undefineds:fresh-access-token')
  assert.deepEqual(loginForceFreshValues, [false])
  assert.deepEqual(hasManualRedirectCallbacks, [true])
  assert.equal(openedUrls[0], 'https://id.undefineds.co/.oidc/auth?client_id=test')
  assert.deepEqual(submitted, ['hello'])
})

test('linx browser login fallback passes a manual redirect input callback to auth storage', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const loginCalls = []
  const loginForceFreshValues = []
  const manualRedirects = []
  const openedUrls = []
  const interactive = {
    defaultEditor: {},
    editor: {
      setText() {},
    },
    session: {
      modelRegistry: {
        refresh() {},
        authStorage: {
          async login(providerId, callbacks) {
            loginCalls.push(providerId)
            loginForceFreshValues.push(callbacks.forceFresh)
            callbacks.onAuth({ url: 'https://id.undefineds.co/.oidc/auth?client_id=test' })
            manualRedirects.push(await callbacks.onManualCodeInput?.())
          },
          get() {
            return { type: 'oauth', access: 'fresh-access-token', refresh: 'refresh', expires: Date.now() + 60_000 }
          },
          setRuntimeApiKey(providerId, apiKey) {
            loginCalls.push(`${providerId}:${apiKey}`)
          },
        },
      },
    },
    chatContainer: {
      addChild() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {}
    },
    async showExtensionSelector() {
      return 'Authorize in browser'
    },
    async showExtensionInput(title) {
      assert.match(title, /Paste final redirect URL/)
      return '  http://127.0.0.1:1234/auth/callback?code=abc&state=state&iss=https%3A%2F%2Fid.undefineds.co%2F  '
    },
    showStatus() {},
    showError(message) {
      throw new Error(message)
    },
    openExternal(url) {
      openedUrls.push(url)
    },
    async updateAvailableProviderCount() {},
  }

  module.applyLinxInteractiveBranding(interactive)
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/login')

  assert.equal(loginCalls[0], 'undefineds')
  assert.equal(loginCalls[1], 'undefineds:fresh-access-token')
  assert.deepEqual(loginForceFreshValues, [false])
  assert.deepEqual(manualRedirects, ['http://127.0.0.1:1234/auth/callback?code=abc&state=state&iss=https%3A%2F%2Fid.undefineds.co%2F'])
  assert.equal(openedUrls[0], 'https://id.undefineds.co/.oidc/auth?client_id=test')
})

test('linx /login command can store a direct LinX API key from the selector', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const stored = []
  const runtimeKeys = []
  const statuses = []
  const interactive = {
    defaultEditor: {},
    editor: {
      setText() {},
    },
    session: {
      modelRegistry: {
        refresh() {},
        authStorage: {
          set(providerId, credential) {
            stored.push({ providerId, credential })
          },
          setRuntimeApiKey(providerId, apiKey) {
            runtimeKeys.push({ providerId, apiKey })
          },
        },
      },
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {}
    },
    async showExtensionSelector(title, options) {
      assert.match(title, /LinX Cloud authorization/)
      assert.deepEqual(options, ['Authorize in browser', 'Enter API key', 'Exit'])
      return 'Enter API key'
    },
    async showExtensionInput(title) {
      assert.match(title, /Use LinX Cloud API key/)
      return '  linx-test-key  '
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
    async updateAvailableProviderCount() {},
  }

  module.applyLinxInteractiveBranding(interactive)
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/login')

  assert.deepEqual(runtimeKeys, [{ providerId: 'undefineds', apiKey: 'linx-test-key' }])
  assert.deepEqual(stored, [{ providerId: 'undefineds', credential: { type: 'api_key', key: 'linx-test-key' } }])
  assert.equal(statuses.some((message) => message.includes('API key saved')), true)
})

test('linx native oauth selector is replaced with LinX-only login', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const selectorCalls = []
  const loginCalls = []
  const loginForceFreshValues = []
  const statuses = []
  const interactive = {
    session: {
      modelRegistry: {
        refresh() {},
        authStorage: {
          async login(providerId, callbacks) {
            loginCalls.push(providerId)
            loginForceFreshValues.push(callbacks.forceFresh)
            callbacks.onAuth({ url: 'https://id.undefineds.co/.oidc/auth?client_id=test' })
          },
          get() {
            return { type: 'oauth', access: 'fresh-access-token', refresh: 'refresh', expires: Date.now() + 60_000 }
          },
          setRuntimeApiKey(providerId, apiKey) {
            loginCalls.push(`${providerId}:${apiKey}`)
          },
          logout(providerId) {
            loginCalls.push(`logout:${providerId}`)
          },
        },
      },
    },
    chatContainer: {
      addChild() {},
    },
    ui: {
      requestRender() {},
    },
    async showExtensionSelector(title, options) {
      selectorCalls.push({ title, options })
      return 'Authorize in browser'
    },
    openExternal() {},
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
    async updateAvailableProviderCount() {},
  }

  module.applyLinxInteractiveBranding(interactive)
  await interactive.showOAuthSelector('login')
  await interactive.showLoginDialog('anthropic')
  await interactive.showOAuthSelector('logout')

  assert.equal(selectorCalls.length, 2)
  assert.deepEqual(selectorCalls[0].options, ['Authorize in browser', 'Enter API key', 'Exit'])
  assert.deepEqual(selectorCalls[1].options, ['Authorize in browser', 'Enter API key', 'Exit'])
  assert.equal(loginCalls.includes('anthropic'), false)
  assert.equal(loginCalls.filter((entry) => entry === 'undefineds').length, 2)
  assert.deepEqual(loginForceFreshValues, [false, false])
  assert.equal(loginCalls.includes('logout:undefineds'), true)
  assert.equal(statuses.some((message) => message.includes('LinX only supports LinX Cloud')), true)
  assert.equal(statuses.some((message) => message.includes('Logged out of LinX Cloud')), true)
})

test('linx startup login prompt uses the required-login copy and can exit', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const selectorCalls = []
  let stopped = false
  const interactive = {
    isInitialized: false,
    session: {
      modelRegistry: {
        authStorage: {},
      },
    },
    options: {
      verbose: false,
    },
    settingsManager: {
      getQuietStartup() {
        return true
      },
    },
    ui: {
      requestRender() {},
    },
    async showExtensionSelector(title, options) {
      selectorCalls.push({ title, options })
      return 'Exit'
    },
    showStatus() {},
    showError(message) {
      throw new Error(message)
    },
    stop() {
      stopped = true
    },
    async init() {
      this.isInitialized = true
    },
  }

  module.applyLinxInteractiveBranding(interactive)
  module.requestLinxCloudLogin(interactive, 'startup')
  await interactive.init()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(selectorCalls.length, 1)
  assert.match(selectorCalls[0].title, /LinX Cloud login required/)
  assert.deepEqual(selectorCalls[0].options, ['Authorize in browser', 'Enter API key', 'Exit'])
  assert.equal(stopped, true)
})

test('linx expired login prompt is deferred until interactive init completes', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const selectorCalls = []
  const interactive = {
    isInitialized: false,
    session: {
      modelRegistry: {
        authStorage: {},
      },
    },
    settingsManager: {
      getQuietStartup() {
        return true
      },
    },
    ui: {
      requestRender() {},
    },
    async showExtensionSelector(title, options) {
      selectorCalls.push({ title, options })
      return 'Authorize in browser'
    },
    showStatus() {},
    showError(message) {
      throw new Error(message)
    },
    async init() {
      this.isInitialized = true
    },
  }

  module.applyLinxInteractiveBranding(interactive)
  module.requestLinxCloudLogin(interactive, 'expired')
  assert.equal(selectorCalls.length, 0)

  await interactive.init()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(selectorCalls.length, 1)
  assert.match(selectorCalls[0].title, /LinX Cloud login expired/)
  assert.deepEqual(selectorCalls[0].options, ['Authorize in browser', 'Enter API key', 'Exit'])
})

test('linx interactive branding shows the LinX auth selector when cloud auth expires', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const errors = []
  const statuses = []
  const loginCalls = []
  const loginForceFreshValues = []
  const hasManualRedirectCallbacks = []
  const selectorCalls = []
  const refreshCalls = []
  const rendered = []
  const openedUrls = []
  const interactive = {
    session: {
      modelRegistry: {
        refresh() {
          refreshCalls.push(true)
        },
        authStorage: {
          async login(providerId, callbacks) {
            loginCalls.push(providerId)
            loginForceFreshValues.push(callbacks.forceFresh)
            hasManualRedirectCallbacks.push(typeof callbacks.onManualCodeInput === 'function')
            callbacks.onProgress('Opening LinX Cloud login in your browser...')
            callbacks.onAuth({ url: 'https://id.undefineds.co/.oidc/auth?client_id=test' })
          },
          get(providerId) {
            return providerId === 'undefineds'
              ? { type: 'oauth', access: 'fresh-access-token', refresh: 'refresh', expires: Date.now() + 60_000 }
              : undefined
          },
          setRuntimeApiKey(providerId, apiKey) {
            loginCalls.push(`${providerId}:${apiKey}`)
          },
        },
      },
    },
    chatContainer: {
      addChild(child) {
        rendered.push(child)
      },
    },
    ui: {
      requestRender() {},
    },
    openExternal(url) {
      openedUrls.push(url)
    },
    async showExtensionSelector(title, options) {
      selectorCalls.push({ title, options })
      return 'Authorize in browser'
    },
    showError(message) {
      errors.push(message)
    },
    showStatus(message) {
      statuses.push(message)
    },
    async updateAvailableProviderCount() {},
  }

  module.applyLinxInteractiveBranding(interactive)
  interactive.showError('Retry failed after 3 attempts: LinX Cloud login expired.\nRun /login to re-authorize.')
  await new Promise((resolve) => setTimeout(resolve, 0))
  interactive.showError('ordinary failure')

  assert.deepEqual(errors, ['ordinary failure'])
  assert.equal(selectorCalls.length, 1)
  assert.match(selectorCalls[0].title, /LinX Cloud login expired/)
  assert.deepEqual(selectorCalls[0].options, ['Authorize in browser', 'Enter API key', 'Exit'])
  assert.equal(loginCalls[0], 'undefineds')
  assert.equal(loginCalls[1], 'undefineds:fresh-access-token')
  assert.deepEqual(loginForceFreshValues, [true])
  assert.deepEqual(hasManualRedirectCallbacks, [true])
  assert.equal(refreshCalls.length, 1)
  assert.equal(statuses.some((message) => message.includes('Choose how to re-authorize')), false)
  assert.equal(statuses.some((message) => message.includes('Browser authorization complete')), true)
  assert.equal(openedUrls[0], 'https://id.undefineds.co/.oidc/auth?client_id=test')
  const renderedText = rendered.map((child) => child.text ?? child.render?.(100)?.join('\n') ?? '').join('\n')
  assert.match(renderedText, /LinX Cloud authorization/)
})

test('linx interactive branding reacts to assistant stream auth-expired events', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const loginCalls = []
  const loginForceFreshValues = []
  const selectorCalls = []
  const events = []
  const interactive = {
    async handleEvent(event) {
      events.push(event)
      return 'handled'
    },
    session: {
      modelRegistry: {
        refresh() {},
        authStorage: {
          async login(providerId, callbacks) {
            loginCalls.push(providerId)
            loginForceFreshValues.push(callbacks.forceFresh)
            callbacks.onAuth({ url: 'https://id.undefineds.co/.oidc/auth?client_id=test' })
          },
          get() {
            return { type: 'oauth', access: 'fresh-access-token', refresh: 'refresh', expires: Date.now() + 60_000 }
          },
          setRuntimeApiKey(providerId, apiKey) {
            loginCalls.push(`${providerId}:${apiKey}`)
          },
        },
      },
    },
    chatContainer: {
      addChild() {},
    },
    ui: {
      requestRender() {},
    },
    async showExtensionSelector(title, options) {
      selectorCalls.push({ title, options })
      return 'Authorize in browser'
    },
    openExternal() {},
    showStatus() {},
    showError(message) {
      throw new Error(message)
    },
    async updateAvailableProviderCount() {},
  }

  module.applyLinxInteractiveBranding(interactive)
  const result = await interactive.handleEvent({
    type: 'message_end',
    message: { errorMessage: 'LinX Cloud login expired.' },
  })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(result, 'handled')
  assert.equal(events.length, 1)
  assert.equal(selectorCalls.length, 1)
  assert.match(selectorCalls[0].title, /LinX Cloud login expired/)
  assert.equal(loginCalls[0], 'undefineds')
  assert.equal(loginCalls[1], 'undefineds:fresh-access-token')
  assert.deepEqual(loginForceFreshValues, [true])
})
