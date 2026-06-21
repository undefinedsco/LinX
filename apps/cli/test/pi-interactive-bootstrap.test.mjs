import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { globalAgent as httpsGlobalAgent } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'
import { initTheme } from '@earendil-works/pi-coding-agent'

process.env.PI_OFFLINE = '1'
initTheme('dark')
test.after(() => {
  httpsGlobalAgent.destroy()
})

const LINX_RUNTIME_MANAGED_AUTH_KEY = 'linx-runtime-managed-auth'

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

function isolateSolidHome(t, prefix) {
  const previousSolidHome = process.env.SOLID_HOME
  const solidHome = mkdtempSync(join(tmpdir(), prefix))
  process.env.SOLID_HOME = solidHome
  t.after(() => {
    if (previousSolidHome === undefined) {
      delete process.env.SOLID_HOME
    } else {
      process.env.SOLID_HOME = previousSolidHome
    }
    rmSync(solidHome, { recursive: true, force: true })
  })
  return solidHome
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

test('pi interactive bootstrap can instantiate with the LinX runtime adapter', async (t) => {
  const [{ module: runtimeModule, cleanup: runtimeCleanup }, { module: interactiveModule, cleanup: interactiveCleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/runtime.ts'),
    loadAutoModeModule('lib/pi-adapter/interactive.ts'),
  ])
  t.after(() => runtimeCleanup())
  t.after(() => interactiveCleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const originalCwd = process.cwd()
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-interactive-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-interactive-agent-'))
  t.after(() => {
    process.chdir(originalCwd)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  assert.equal(typeof runtimeModule.createLinxRuntimeAdapter, 'function')
  assert.equal(typeof runtimeModule.createPiRuntimeAdapter, 'function')
  assert.equal(typeof interactiveModule.bootstrapLinxInteractiveMode, 'function')
  assert.equal(typeof interactiveModule.bootstrapPiInteractiveMode, 'function')
  assert.equal(typeof interactiveModule.withLinxResumeOutputStyle, 'function')
  assert.equal(typeof interactiveModule.withSuppressedPiResumeOutput, 'function')

  const adapter = runtimeModule.createLinxRuntimeAdapter({
    async createRemoteCompletion() {
      return 'ok'
    },
    createNativeProxy() {
      return {
        remoteUrl: 'ws://127.0.0.1:8877',
        record: {
          id: 'auto_native_proxy_789',
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

  const interactive = interactiveModule.bootstrapLinxInteractiveMode(runtime)
  t.after(() => interactive.stop())
  assert.equal(typeof interactive.init, 'function')
  assert.equal(typeof interactive.run, 'function')
  assert.equal(typeof interactive.requestLogin, 'function')
  assert.equal(typeof interactive.requestBackendCredential, 'function')
  assert.equal(typeof interactive.stop, 'function')
  process.chdir(originalCwd)
})

test('pi interactive bootstrap passes initial prompt options into Pi interactive mode', async (t) => {
  isolateSolidHome(t, 'linx-pi-initial-prompt-solid-')
  const [{ module: runtimeModule, cleanup: runtimeCleanup }, { module: interactiveModule, cleanup: interactiveCleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/runtime.ts'),
    loadAutoModeModule('lib/pi-adapter/interactive.ts'),
  ])
  t.after(() => runtimeCleanup())
  t.after(() => interactiveCleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const originalCwd = process.cwd()
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-initial-prompt-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-initial-prompt-agent-'))
  t.after(() => {
    process.chdir(originalCwd)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = runtimeModule.createPiRuntimeAdapter({
    async createRemoteCompletion() {
      return 'ok'
    },
    createNativeProxy() {
      return {
        remoteUrl: 'ws://127.0.0.1:8877',
        record: {
          id: 'auto_native_proxy_initial_prompt',
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
    },
  })

  const runtime = await adapter.createRuntime({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
  })

  const interactive = interactiveModule.bootstrapPiInteractiveMode(runtime, {
    initialMessage: 'ship the auto prompt',
  })
  t.after(() => interactive.stop())

  assert.equal(interactive.__unsafeInteractiveForTests.options.initialMessage, 'ship the auto prompt')
  await runtime.dispose()
  process.chdir(originalCwd)
})

test('pi interactive backend credential prompt uses the existing extension input surface', async (t) => {
  isolateSolidHome(t, 'linx-pi-backend-credential-solid-')
  const [{ module: runtimeModule, cleanup: runtimeCleanup }, { module, cleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/runtime.ts'),
    loadAutoModeModule('lib/pi-adapter/interactive.ts'),
  ])
  t.after(() => runtimeCleanup())
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const originalCwd = process.cwd()
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-backend-credential-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-backend-credential-agent-'))
  t.after(() => {
    process.chdir(originalCwd)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })
  const prompts = []
  const adapter = runtimeModule.createPiRuntimeAdapter({
    createNativeProxy() {
      return {
        remoteUrl: 'ws://127.0.0.1:8877',
        record: {
          id: 'auto_native_proxy_credential_prompt',
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
    backend: 'native',
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
    },
  })
  const runtime = await adapter.createRuntime({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
  })
  const interactive = module.bootstrapPiInteractiveMode(runtime)
  t.after(() => interactive.stop())
  const raw = interactive.__unsafeInteractiveForTests
  const statuses = []
  raw.showStatus = (message) => {
    statuses.push(message)
  }
  raw.showExtensionInput = async (title, placeholder) => {
    prompts.push({ title, placeholder })
    if (prompts.length === 1) return '  deepseek  '
    return prompts.length === 2 ? '  sk-deepseek  ' : '  https://api.deepseek.com/v1  '
  }

  const value = await interactive.requestBackendCredential({
    providerIdPrompt: 'Codex provider id',
    apiKeyPrompt: 'Codex provider API key',
    providerId: 'openai',
    providerLabel: 'Codex-compatible provider',
    reason: 'missing',
  })

  assert.deepEqual(value, {
    providerId: 'deepseek',
    apiKey: 'sk-deepseek',
  })
  assert.equal(statuses.length, 1)
  assert.match(statuses[0], /AI Secretary detected missing Codex-compatible provider credentials/)
  assert.match(statuses[0], /retry the message/)
  assert.match(prompts[0].title, /Codex-compatible provider missing provider/)
  assert.equal(prompts[0].placeholder, 'Codex provider id')
  assert.match(prompts[1].title, /Codex-compatible provider missing credential/)
  assert.match(prompts[1].title, /save it to your Pod AI settings/)
  assert.equal(prompts[1].placeholder, 'Codex provider API key')
  await runtime.dispose()
  process.chdir(originalCwd)
})

test('pi interactive backend credential prompt distinguishes invalid existing credentials', async (t) => {
  isolateSolidHome(t, 'linx-pi-invalid-backend-credential-solid-')
  const [{ module: runtimeModule, cleanup: runtimeCleanup }, { module, cleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/runtime.ts'),
    loadAutoModeModule('lib/pi-adapter/interactive.ts'),
  ])
  t.after(() => runtimeCleanup())
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const originalCwd = process.cwd()
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-invalid-backend-credential-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-invalid-backend-credential-agent-'))
  t.after(() => {
    process.chdir(originalCwd)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })
  const statuses = []
  const prompts = []
  const adapter = runtimeModule.createPiRuntimeAdapter({
    createNativeProxy() {
      return {
        remoteUrl: 'ws://127.0.0.1:8878',
        record: {
          id: 'auto_native_proxy_invalid_credential_prompt',
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
    backend: 'native',
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
    },
  })
  const runtime = await adapter.createRuntime({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
  })
  const interactive = module.bootstrapPiInteractiveMode(runtime)
  t.after(() => interactive.stop())
  const raw = interactive.__unsafeInteractiveForTests
  raw.showStatus = (message) => {
    statuses.push(message)
  }
  raw.showExtensionInput = async (title, placeholder) => {
    prompts.push({ title, placeholder })
    if (prompts.length === 1) return ''
    return prompts.length === 2 ? 'sk-fixed' : 'https://api.openai.com/v1'
  }

  const value = await interactive.requestBackendCredential({
    providerIdPrompt: 'Codex provider id',
    apiKeyPrompt: 'Codex provider API key',
    providerId: 'openai',
    providerLabel: 'Codex-compatible provider',
    reason: 'invalid',
  })

  assert.deepEqual(value, {
    providerId: 'openai',
    apiKey: 'sk-fixed',
  })
  assert.match(statuses[0], /AI Secretary detected invalid Codex-compatible provider credentials/)
  assert.match(prompts[0].title, /Codex-compatible provider invalid provider/)
  assert.match(prompts[1].title, /Codex-compatible provider invalid credential/)
  await runtime.dispose()
  process.chdir(originalCwd)
})

test('pi interactive backend credential prompt reuses Pi login dialog when TUI is initialized', async (t) => {
  isolateSolidHome(t, 'linx-pi-backend-credential-dialog-solid-')
  const [{ module: runtimeModule, cleanup: runtimeCleanup }, { module, cleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/runtime.ts'),
    loadAutoModeModule('lib/pi-adapter/interactive.ts'),
  ])
  t.after(() => runtimeCleanup())
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const originalCwd = process.cwd()
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-backend-credential-dialog-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-backend-credential-dialog-agent-'))
  t.after(() => {
    process.chdir(originalCwd)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })
  const adapter = runtimeModule.createPiRuntimeAdapter({
    createNativeProxy() {
      return {
        remoteUrl: 'ws://127.0.0.1:8879',
        record: {
          id: 'auto_native_proxy_credential_dialog_prompt',
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
    backend: 'native',
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
    },
  })
  const runtime = await adapter.createRuntime({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
  })
  const interactive = module.bootstrapPiInteractiveMode(runtime)
  t.after(() => interactive.stop())
  const raw = interactive.__unsafeInteractiveForTests
  const statuses = []
  const focused = []
  raw.isInitialized = true
  raw.showStatus = (message) => {
    statuses.push(message)
  }
  raw.showExtensionInput = async () => {
    throw new Error('initialized TUI should use Pi LoginDialogComponent')
  }
  const originalSetFocus = raw.ui.setFocus?.bind(raw.ui)
  raw.ui.setFocus = (component) => {
    focused.push(component)
    originalSetFocus?.(component)
  }
  raw.ui.requestRender = () => {}

  const credentialPromise = interactive.requestBackendCredential({
    providerIdPrompt: 'Codex provider id',
    apiKeyPrompt: 'Codex provider API key',
    baseUrlPrompt: 'Codex-compatible API base URL',
    providerId: 'openai',
    providerLabel: 'Codex-compatible provider',
    reason: 'missing',
  })

  await new Promise((resolve) => setImmediate(resolve))
  const dialog = focused.find((component) => component?.constructor?.name === 'LoginDialogComponent')
  assert.ok(dialog, 'expected Pi LoginDialogComponent to collect backend credentials')
  for (const value of ['deepseek', 'sk-deepseek', 'https://api.deepseek.com/v1']) {
    dialog.input.setValue(value)
    dialog.input.onSubmit()
    await new Promise((resolve) => setImmediate(resolve))
  }

  assert.deepEqual(await credentialPromise, {
    providerId: 'deepseek',
    apiKey: 'sk-deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
  })
  assert.match(statuses[0], /AI Secretary detected missing Codex-compatible provider credentials/)
  assert.equal(focused.at(-1), raw.editor)
  await runtime.dispose()
  process.chdir(originalCwd)
})

test('linx interactive /ai connect reuses Pi login dialog but saves through LinX Pod AI connect', async (t) => {
  const [{ module, cleanup }, { module: brandingModule, cleanup: brandingCleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/interactive.ts'),
    loadAutoModeModule('lib/pi-adapter/branding.ts'),
  ])
  t.after(() => {
    cleanup()
    brandingCleanup()
  })

  const submitted = []
  const statuses = []
  const saves = []
  const authStorageWrites = []
  const focused = []
  const editor = {
    setText() {},
  }
  const interactive = {
    isInitialized: true,
    defaultEditor: {},
    editor,
    editorContainer: {
      clear() {},
      addChild() {},
    },
    session: {
      modelRegistry: {
        refresh() {
          authStorageWrites.push('modelRegistry.refresh')
        },
        authStorage: {
          set(provider, value) {
            authStorageWrites.push({ method: 'set', provider, value })
          },
          setRuntimeApiKey(provider, value) {
            authStorageWrites.push({ method: 'setRuntimeApiKey', provider, value })
          },
        },
      },
    },
    ui: {
      setFocus(target) {
        focused.push(target)
      },
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
    async showExtensionInput() {
      throw new Error('/ai connect should use Pi LoginDialogComponent when TUI is initialized')
    },
    async updateAvailableProviderCount() {
      authStorageWrites.push('updateAvailableProviderCount')
    },
  }
  const runtime = {
    async connectAiProviderCredential(input) {
      saves.push(input)
      return {
        providerId: input.provider,
        maskedApiKey: 'sk-a****-key',
      }
    },
  }

  module.installLinxGlobalCommands(interactive, runtime, process.cwd())
  interactive.setupEditorSubmitHandler()

  const connectPromise = interactive.defaultEditor.onSubmit('/ai connect stepfun --model step-3.7-flash --base-url https://api.stepfun.com/v1')
  await new Promise((resolve) => setImmediate(resolve))
  const dialog = focused.find((component) => component?.constructor?.name === 'LoginDialogComponent')
  assert.ok(dialog, 'expected /ai connect to collect credentials with Pi LoginDialogComponent')
  dialog.input.setValue('sk-stepfun-test-key')
  dialog.input.onSubmit()
  await new Promise((resolve) => setImmediate(resolve))
  await connectPromise

  assert.deepEqual(submitted, [])
  assert.deepEqual(saves, [{
    provider: 'stepfun',
    apiKey: 'sk-stepfun-test-key',
    baseUrl: 'https://api.stepfun.com/v1',
    model: 'step-3.7-flash',
  }])
  assert.deepEqual(authStorageWrites, ['modelRegistry.refresh', 'updateAvailableProviderCount'])
  assert.match(statuses.join('\n'), /Connected AI provider stepfun to LinX Pod AI settings/)
  assert.equal(focused.at(-1), editor)
})

test('linx interactive /ai connect survives Pi submit rebinding during bootstrap init', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const saves = []
  const overwrittenSubmits = []
  const statuses = []
  const focused = []
  const editor = {
    setText() {},
    async onSubmit(text) {
      overwrittenSubmits.push(text)
    },
  }
  const interactive = {
    isInitialized: true,
    defaultEditor: editor,
    editor,
    editorContainer: {
      clear() {},
      addChild() {},
    },
    session: {
      modelRegistry: {
        refresh() {},
      },
    },
    ui: {
      setFocus(target) {
        focused.push(target)
      },
      requestRender() {},
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
    async showExtensionInput() {
      throw new Error('initialized TUI should use Pi LoginDialogComponent')
    },
    async updateAvailableProviderCount() {},
  }
  const runtime = {
    async connectAiProviderCredential(input) {
      saves.push(input)
      return {
        providerId: input.provider,
        maskedApiKey: 'sk-t****-key',
      }
    },
  }

  module.installLinxFinalSubmitCommandRouter(interactive, runtime)
  const connectPromise = editor.onSubmit('/ai connect stepfun --model step-3.7-flash --base-url https://api.stepfun.com/v1')
  await new Promise((resolve) => setImmediate(resolve))
  const dialog = focused.find((component) => component?.constructor?.name === 'LoginDialogComponent')
  assert.ok(dialog, 'expected final submit guard to open Pi LoginDialogComponent after Pi rebinding')
  dialog.input.setValue('sk-stepfun-test-key')
  dialog.input.onSubmit()
  await new Promise((resolve) => setImmediate(resolve))
  await connectPromise

  assert.deepEqual(overwrittenSubmits, [])
  assert.deepEqual(saves, [{
    provider: 'stepfun',
    apiKey: 'sk-stepfun-test-key',
    baseUrl: 'https://api.stepfun.com/v1',
    model: 'step-3.7-flash',
  }])
  assert.match(statuses.join('\n'), /Connected AI provider stepfun to LinX Pod AI settings/)
  assert.equal(focused.at(-1), editor)
})

test('linx interactive getUserInput consumes /ai connect before backend prompt loop', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const saves = []
  const statuses = []
  const focused = []
  const inputs = [
    '/ai connect stepfun --model step-3.7-flash --base-url https://api.stepfun.com/v1',
    'normal backend prompt',
  ]
  const editor = {
    setText() {},
  }
  const interactive = {
    isInitialized: true,
    defaultEditor: editor,
    editor,
    editorContainer: {
      clear() {},
      addChild() {},
    },
    session: {
      modelRegistry: {
        refresh() {},
      },
    },
    ui: {
      setFocus(target) {
        focused.push(target)
      },
      requestRender() {},
    },
    async getUserInput() {
      return inputs.shift()
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
    async showExtensionInput() {
      throw new Error('initialized TUI should use Pi LoginDialogComponent')
    },
    async updateAvailableProviderCount() {},
  }
  const runtime = {
    async connectAiProviderCredential(input) {
      saves.push(input)
      return {
        providerId: input.provider,
        maskedApiKey: 'sk-t****-key',
      }
    },
  }

  module.installLinxInputCommandRouter(interactive, runtime)
  const inputPromise = interactive.getUserInput()
  await new Promise((resolve) => setImmediate(resolve))
  const dialog = focused.find((component) => component?.constructor?.name === 'LoginDialogComponent')
  assert.ok(dialog, 'expected getUserInput router to open Pi LoginDialogComponent')
  dialog.input.setValue('sk-stepfun-test-key')
  dialog.input.onSubmit()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(await inputPromise, 'normal backend prompt')
  assert.deepEqual(saves, [{
    provider: 'stepfun',
    apiKey: 'sk-stepfun-test-key',
    baseUrl: 'https://api.stepfun.com/v1',
    model: 'step-3.7-flash',
  }])
  assert.match(statuses.join('\n'), /Connected AI provider stepfun to LinX Pod AI settings/)
})

test('linx interactive session prompt consumes /ai connect before backend prompt', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const saves = []
  const statuses = []
  const focused = []
  const backendPrompts = []
  const editor = {
    setText() {},
  }
  const interactive = {
    isInitialized: true,
    defaultEditor: editor,
    editor,
    editorContainer: {
      clear() {},
      addChild() {},
    },
    session: {
      modelRegistry: {
        refresh() {},
      },
      async prompt(text, options) {
        backendPrompts.push({ text, options })
        return 'backend-result'
      },
    },
    ui: {
      setFocus(target) {
        focused.push(target)
      },
      requestRender() {},
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
    async showExtensionInput() {
      throw new Error('initialized TUI should use Pi LoginDialogComponent')
    },
    async updateAvailableProviderCount() {},
  }
  const runtime = {
    async connectAiProviderCredential(input) {
      saves.push(input)
      return {
        providerId: input.provider,
        maskedApiKey: 'sk-t****-key',
      }
    },
  }

  module.installLinxSessionCommandRouter(interactive, runtime)
  const connectPromise = interactive.session.prompt('/ai connect stepfun --model step-3.7-flash --base-url https://api.stepfun.com/v1')
  await new Promise((resolve) => setImmediate(resolve))
  const dialog = focused.find((component) => component?.constructor?.name === 'LoginDialogComponent')
  assert.ok(dialog, 'expected session prompt router to open Pi LoginDialogComponent')
  dialog.input.setValue('sk-stepfun-test-key')
  dialog.input.onSubmit()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(await connectPromise, undefined)
  assert.deepEqual(backendPrompts, [])
  assert.deepEqual(saves, [{
    provider: 'stepfun',
    apiKey: 'sk-stepfun-test-key',
    baseUrl: 'https://api.stepfun.com/v1',
    model: 'step-3.7-flash',
  }])
  assert.match(statuses.join('\n'), /Connected AI provider stepfun to LinX Pod AI settings/)

  assert.equal(await interactive.session.prompt('normal backend prompt', { streamingBehavior: 'steer' }), 'backend-result')
  assert.deepEqual(backendPrompts, [{
    text: 'normal backend prompt',
    options: { streamingBehavior: 'steer' },
  }])
})

test('linx interactive session prompt routes peer commands without recursion', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const statuses = []
  const backendPrompts = []
  const interactive = {
    editor: {
      setText() {},
    },
    session: {
      async prompt(text, options) {
        backendPrompts.push({ text, options })
      },
    },
    ui: {
      requestRender() {},
    },
    showStatus(message) {
      statuses.push(message)
    },
  }
  const runtime = {}

  module.installLinxSessionCommandRouter(interactive, runtime)
  await interactive.session.prompt('/goal implement the smoke test')

  assert.deepEqual(backendPrompts, [{
    text: '/goal implement the smoke test',
    options: undefined,
  }])
  assert.equal(module.isLinxInteractiveGoalModeEnabled(interactive, runtime), true)
  assert.match(statuses.join('\n'), /Peer command routed/)
})

test('linx interactive /rewind materializes a clean active Pi session without submitting to backend', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const sessionManager = SessionManager.inMemory('/tmp/linx-rewind-test')
  const originalSessionId = sessionManager.getSessionId()
  const firstUser = sessionManager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'first turn' }],
    timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
  })
  const firstAssistant = sessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'first answer' }],
    provider: 'undefineds',
    model: 'linx-lite',
    stopReason: 'stop',
    timestamp: Date.parse('2026-04-01T00:00:01.000Z'),
  })
  const secondUser = sessionManager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'dirty turn' }],
    timestamp: Date.parse('2026-04-01T00:00:02.000Z'),
  })
  sessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'dirty answer' }],
    provider: 'undefineds',
    model: 'linx-lite',
    stopReason: 'stop',
    timestamp: Date.parse('2026-04-01T00:00:03.000Z'),
  })

  const submitted = []
  const statuses = []
  const renders = []
  const transcriptRefreshes = []
  const agentState = {
    ...sessionManager.buildSessionContext(),
  }
  const interactive = {
    defaultEditor: {},
    editor: {
      setText() {},
    },
    session: {
      sessionManager,
      agent: {
        state: agentState,
      },
    },
    ui: {
      requestRender() {
        renders.push('render')
      },
    },
    rebuildChatFromMessages() {
      transcriptRefreshes.push(sessionManager.buildSessionContext().messages.map((message) => message.content[0].text))
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
  }

  module.installLinxGlobalCommands(interactive, {}, '/tmp/linx-rewind-test')
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/rewind')

  assert.deepEqual(submitted, [])
  assert.notEqual(sessionManager.getSessionId(), originalSessionId)
  assert.equal(sessionManager.getLeafId(), firstAssistant)
  assert.equal(sessionManager.getEntry(secondUser), undefined)
  assert.deepEqual(sessionManager.getEntries().map((entry) => entry.id), [
    firstUser,
    firstAssistant,
  ])
  assert.deepEqual(agentState.messages.map((message) => message.content[0].text), [
    'first turn',
    'first answer',
  ])
  assert.deepEqual(transcriptRefreshes, [[
    'first turn',
    'first answer',
  ]])
  assert.match(statuses.join('\n'), /Rewound 1 turn/)
  assert.equal(renders.length > 0, true)
  assert.equal(sessionManager.getBranch().map((entry) => entry.id).includes(firstUser), true)
})

test('linx interactive /rewind opens a TUI selector for the rollback target', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const sessionManager = SessionManager.inMemory('/tmp/linx-rewind-selector-test')
  sessionManager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'first turn' }],
    timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
  })
  const firstAssistant = sessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'first answer' }],
    provider: 'undefineds',
    model: 'linx-lite',
    stopReason: 'stop',
    timestamp: Date.parse('2026-04-01T00:00:01.000Z'),
  })
  const secondUser = sessionManager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'dirty turn' }],
    timestamp: Date.parse('2026-04-01T00:00:02.000Z'),
  })
  sessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'dirty answer' }],
    provider: 'undefineds',
    model: 'linx-lite',
    stopReason: 'stop',
    timestamp: Date.parse('2026-04-01T00:00:03.000Z'),
  })

  const submitted = []
  const statuses = []
  const renders = []
  const transcriptRefreshes = []
  const agentState = {
    ...sessionManager.buildSessionContext(),
  }
  let selectorResult
  let doneCalled = false
  const interactive = {
    defaultEditor: {},
    editor: {
      setText() {},
    },
    session: {
      sessionManager,
      agent: {
        state: agentState,
      },
    },
    ui: {
      requestRender() {
        renders.push('render')
      },
    },
    rebuildChatFromMessages() {
      transcriptRefreshes.push(sessionManager.buildSessionContext().messages.map((message) => message.content[0].text))
    },
    showSelector(create) {
      selectorResult = create(() => {
        doneCalled = true
      })
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
  }

  module.installLinxGlobalCommands(interactive, {}, '/tmp/linx-rewind-selector-test')
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/rewind')

  assert.deepEqual(submitted, [])
  assert.ok(selectorResult?.component)
  assert.ok(selectorResult?.focus)
  assert.equal(sessionManager.getLeafId() !== firstAssistant, true)

  await selectorResult.focus.onSelect(secondUser)

  assert.equal(doneCalled, true)
  assert.equal(sessionManager.getLeafId(), firstAssistant)
  assert.equal(sessionManager.getEntry(secondUser), undefined)
  assert.deepEqual(agentState.messages.map((message) => message.content[0].text), [
    'first turn',
    'first answer',
  ])
  assert.deepEqual(transcriptRefreshes, [[
    'first turn',
    'first answer',
  ]])
  assert.match(statuses.join('\n'), /Rewound to before selected message/)
  assert.equal(renders.length > 0, true)
})

test('linx interactive /rewind can reset the branch to the session root', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const sessionManager = SessionManager.inMemory('/tmp/linx-rewind-root-test')
  sessionManager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'only turn' }],
    timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
  })
  sessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'only answer' }],
    provider: 'undefineds',
    model: 'linx-lite',
    stopReason: 'stop',
    timestamp: Date.parse('2026-04-01T00:00:01.000Z'),
  })

  const statuses = []
  const agentState = {
    ...sessionManager.buildSessionContext(),
  }
  const interactive = {
    defaultEditor: {},
    editor: {
      setText() {},
    },
    session: {
      sessionManager,
      agent: {
        state: agentState,
      },
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {
        throw new Error('/rewind should not reach backend submit')
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
  }

  module.installLinxGlobalCommands(interactive, {}, '/tmp/linx-rewind-root-test')
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/rewind 2')

  assert.equal(sessionManager.getLeafId(), null)
  assert.deepEqual(sessionManager.getEntries(), [])
  assert.deepEqual(agentState.messages, [])
  assert.match(statuses.join('\n'), /Rewound 1 turn/)
})

test('linx interactive /rewind can use legacy entry-only session managers', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const statuses = []
  const calls = []
  const entries = [
    {
      id: 'user-1',
      type: 'message',
      parentId: null,
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'legacy dirty turn' }],
      },
    },
    {
      id: 'assistant-1',
      type: 'message',
      parentId: 'user-1',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'legacy dirty answer' }],
      },
    },
  ]
  const agentState = { messages: [{ role: 'user', content: [{ type: 'text', text: 'legacy dirty turn' }] }] }
  const sessionManager = {
    getEntries() {
      calls.push('getEntries')
      return entries
    },
    resetLeaf() {
      calls.push('resetLeaf')
    },
    buildSessionContext() {
      calls.push('buildSessionContext')
      return { messages: [] }
    },
  }
  const interactive = {
    defaultEditor: {},
    editor: {
      setText() {},
    },
    session: {
      sessionManager,
      agent: {
        state: agentState,
      },
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {
        throw new Error('/rewind should not reach backend submit')
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
  }

  module.installLinxGlobalCommands(interactive, {}, '/tmp/linx-rewind-legacy-test')
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/rewind')

  assert.deepEqual(calls, ['getEntries', 'getEntries', 'getEntries', 'getEntries', 'resetLeaf', 'buildSessionContext'])
  assert.deepEqual(agentState.messages, [])
  assert.match(statuses.join('\n'), /Rewound 1 turn/)
})

test('linx interactive /ai connect falls back to extension input when dialog cannot render', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const prompts = []
  const saves = []
  const statuses = []
  const interactive = {
    defaultEditor: {},
    editor: {
      setText() {},
    },
    session: {
      modelRegistry: {
        refresh() {},
      },
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {}
    },
    async showExtensionInput(title, placeholder) {
      prompts.push({ title, placeholder })
      return prompts.length === 1 ? '  sk-openai-test-key  ' : ''
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
    async updateAvailableProviderCount() {},
  }
  const runtime = {
    async connectAiProviderCredential(input) {
      saves.push(input)
      return {
        providerId: input.provider,
        maskedApiKey: 'sk-o****-key',
      }
    },
  }

  module.installLinxGlobalCommands(interactive, runtime, process.cwd())
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/ai connect codex')

  assert.equal(prompts.length, 2)
  assert.match(prompts[0].title, /OpenAI connect credential/)
  assert.equal(prompts[0].placeholder, 'OpenAI API key')
  assert.match(prompts[1].title, /OpenAI connect base URL/)
  assert.deepEqual(saves, [{
    provider: 'openai',
    apiKey: 'sk-openai-test-key',
  }])
  assert.match(statuses.join('\n'), /Connected AI provider openai to LinX Pod AI settings/)
})

test('linx interactive branding stores agent state under .solid/apps/linx and patches update checks', async (t) => {
  const [{ module: brandingModule, cleanup: brandingCleanup }, { module: interactiveModule, cleanup: interactiveCleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/branding.ts'),
    loadAutoModeModule('lib/pi-adapter/interactive.ts'),
  ])
  t.after(() => brandingCleanup())
  t.after(() => interactiveCleanup())

  assert.equal(brandingModule.LINX_AGENT_DIR.endsWith('/.solid/apps/linx/agent'), true)

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
        getShowTerminalProgress() { return false },
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
  t.after(() => interactive.stop())
  assert.equal(typeof interactive.init, 'function')
  assert.equal(typeof interactive.run, 'function')
  assert.equal(typeof interactive.stop, 'function')
})

test('linx assistant rendering hides backend reasoning blocks from resumed history', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { AssistantMessageComponent } = await import('@earendil-works/pi-coding-agent')
  module.patchPiAssistantMessageRendering()

  const component = new AssistantMessageComponent({
    role: 'assistant',
    content: [
      {
        type: 'thinking',
        thinking: 'The user wants me to expose internal reasoning.',
        thinkingSignature: 'reasoning_content',
      },
      { type: 'text', text: 'Visible answer only.' },
    ],
    stopReason: 'stop',
  })

  const rendered = component.render(100).join('\n')
  assert.doesNotMatch(rendered, /internal reasoning/)
  assert.doesNotMatch(rendered, /The user wants me/)
  assert.match(rendered, /Visible answer only/)
})

test('linx escape interrupt aborts streaming session before Pi default handler', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
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

test('linx escape interrupt aborts bash and preserves non-empty editor escape behavior', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const calls = []
  const interactive = {
    defaultEditor: {
      onEscape() {
        calls.push('original')
      },
    },
    editor: {
      getText() {
        return 'draft'
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

test('linx escape interrupt opens rewind selector on double idle escape', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const sessionManager = SessionManager.inMemory('/tmp/linx-double-escape-rewind-test')
  sessionManager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'first turn' }],
    timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
  })
  sessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'first answer' }],
    provider: 'undefineds',
    model: 'linx-lite',
    stopReason: 'stop',
    timestamp: Date.parse('2026-04-01T00:00:01.000Z'),
  })

  const calls = []
  const statuses = []
  let selectorResult
  const interactive = {
    defaultEditor: {
      onEscape() {
        calls.push('original')
      },
    },
    editor: {
      getText() {
        return ''
      },
    },
    session: {
      sessionManager,
      agent: {
        state: sessionManager.buildSessionContext(),
      },
    },
    ui: {
      requestRender() {
        calls.push('render')
      },
    },
    showSelector(create) {
      calls.push('selector')
      selectorResult = create(() => {})
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
  }

  module.installLinxEscapeInterrupt(interactive)
  interactive.defaultEditor.onEscape()
  interactive.defaultEditor.onEscape()

  assert.equal(calls.includes('original'), false)
  assert.equal(calls.includes('selector'), true)
  assert.ok(selectorResult?.component)
  assert.match(statuses.join('\n'), /Press Escape again to rewind/)
})

test('linx escape interrupt keeps wrapping later Pi escape handler assignments', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
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

test('linx escape interrupt ignores self rebinds to avoid recursive exit crashes', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const calls = []
  const interactive = {
    defaultEditor: {
      onEscape() {
        calls.push('original')
      },
    },
    session: {
      get isBashRunning() {
        calls.push('isBashRunning')
        return false
      },
    },
  }

  module.installLinxEscapeInterrupt(interactive)
  const wrapped = interactive.defaultEditor.onEscape
  interactive.defaultEditor.onEscape = wrapped
  interactive.defaultEditor.onEscape()

  assert.deepEqual(calls, ['isBashRunning', 'original'])
})

test('linx interrupt hands auto control back to the user before Pi clear exit semantics', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const calls = []
  const interactive = {
    __autoEnabled: true,
    runtime: { autoEnabled: true },
    defaultEditor: {
      actionHandlers: new Map([
        ['app.clear', () => {
          calls.push('pi-clear')
        }],
      ]),
      onEscape() {
        calls.push('pi-escape')
      },
    },
    session: {
      isStreaming: true,
      abort() {
        calls.push('abort')
      },
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {
        calls.push('render')
      },
    },
    showStatus(message) {
      calls.push(message)
    },
  }

  module.installLinxEscapeInterrupt(interactive)
  interactive.defaultEditor.actionHandlers.get('app.clear')()

  assert.equal(interactive.__autoEnabled, false)
  assert.equal(interactive.runtime.autoEnabled, false)
  assert.equal(calls[0], 'abort')
  assert.match(calls[1], /Auto off: you drive the current session directly/)
  assert.match(calls[1], /What changed: backend prompts, approvals, and free-form input return to the local TUI/)
  assert.equal(calls.includes('pi-clear'), false)

  interactive.session.isStreaming = false
  interactive.defaultEditor.actionHandlers.get('app.clear')()
  assert.equal(calls.includes('pi-clear'), true)
})

test('linx extension ui select keeps TUI interaction and mirrors the local decision to Pod', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-approval.ts')
  t.after(() => cleanup())

  const runtime = createApprovalRuntime()
  const calls = []
  const baseUi = createBaseExtensionUi({
    async select(title, options, opts) {
      calls.push({ title, options, hasSignal: !!opts?.signal })
      return 'Allow'
    },
  })
  const ui = module.createPodBackedExtensionUiContext(baseUi, {
    runtime,
    cwd: '/tmp/linx-work',
    sessionId: '019df-test-extension-ui-local',
    pollMs: 1,
  })

  const selected = await ui.select('Dangerous command: rm -rf /tmp/demo', ['Allow', 'Block'])
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(selected, 'Allow')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].options, ['Allow', 'Block'])
  assert.equal(calls[0].hasSignal, true)
  assert.equal(runtime.state.approvals.length, 1)
  assert.equal(runtime.state.approvals[0].status, 'approved')
  assert.equal(runtime.state.approvals[0].decisionRole, 'human')
  assert.equal(runtime.state.approvals[0].toolName, 'extension-ui-select')
  assert.match(runtime.state.approvals[0].session, /\/\.data\/chat\/__secretary__\/index\.ttl#019df-test-extension-ui-local$/)
  assert.deepEqual(JSON.parse(runtime.state.approvals[0].approvalOptions), [
    { optionId: '0', label: 'Allow', kind: 'allow_once' },
    { optionId: '1', label: 'Block', kind: 'reject_once' },
  ])
  const reason = JSON.parse(runtime.state.approvals[0].reason)
  assert.equal(reason.decision, 'accept')
  assert.equal(JSON.parse(reason.note).selectedLabel, 'Allow')
})

test('linx extension ui confirm can be resolved from Pod without local selection', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-approval.ts')
  t.after(() => cleanup())

  const runtime = createApprovalRuntime({
    onSleep(state) {
      for (const approval of state.approvals) {
        if (approval.status === 'pending') {
          approval.status = 'approved'
          approval.reason = JSON.stringify({ decision: 'accept', note: 'approved in GUI' })
          approval.resolvedAt = new Date('2026-05-05T00:00:01.000Z')
        }
      }
    },
  })
  const calls = []
  const baseUi = createBaseExtensionUi({
    async confirm(title, message, opts) {
      calls.push({ title, message, hasSignal: !!opts?.signal })
      await new Promise((resolve) => setTimeout(resolve, 25))
      return false
    },
  })
  const ui = module.createPodBackedExtensionUiContext(baseUi, {
    runtime,
    cwd: '/tmp/linx-work',
    sessionId: '019df-test-extension-ui-remote',
    pollMs: 1,
  })

  const confirmed = await ui.confirm('Clear session?', 'All messages will be lost.')

  assert.equal(confirmed, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].hasSignal, true)
  assert.equal(runtime.state.approvals.length, 1)
  assert.equal(runtime.state.approvals[0].status, 'approved')
  assert.equal(runtime.state.approvals[0].toolName, 'extension-ui-confirm')
})

test('linx extension ui select leaves ordinary menus as Pi-native TUI only', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-approval.ts')
  t.after(() => cleanup())

  const runtime = createApprovalRuntime()
  const baseUi = createBaseExtensionUi({
    async select() {
      return 'Result 2'
    },
  })
  const ui = module.createPodBackedExtensionUiContext(baseUi, {
    runtime,
    cwd: '/tmp/linx-work',
    sessionId: '019df-test-extension-menu',
  })

  const selected = await ui.select('Stored Search Results', ['Result 1', 'Result 2'])

  assert.equal(selected, 'Result 2')
  assert.equal(runtime.state.approvals.length, 0)
  assert.equal(runtime.state.audits.length, 0)
})

test('linx extension ui falls back to local TUI when Pod approval is unavailable', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-approval.ts')
  t.after(() => cleanup())

  const warnings = []
  const baseUi = createBaseExtensionUi({
    async select() {
      return 'Local only'
    },
  })
  const ui = module.createPodBackedExtensionUiContext(baseUi, {
    runtime: {
      async getPodDataSession() {
        return null
      },
      createStore() {
        throw new Error('should not create store')
      },
      async sleep() {},
      now() {
        return new Date('2026-05-05T00:00:00.000Z')
      },
    },
    onWarning(error) {
      warnings.push(error)
    },
  })

  const selected = await ui.select('Dangerous command?', ['Allow', 'Block'])
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(selected, 'Local only')
  assert.equal(warnings.length, 1)
  assert.match(warnings[0].message, /linx login/)
})

test('linx interactive bootstrap wraps extension ui context with Pod-backed approvals', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const interactive = {
    createExtensionUIContext() {
      return createBaseExtensionUi()
    },
    sessionManager: {
      getSessionId() {
        return '019df-test-patch'
      },
    },
  }

  module.installPodBackedExtensionUi(interactive, { cwd: '/tmp/linx-work' })
  const ui = interactive.createExtensionUIContext()

  assert.notEqual(ui.select, createBaseExtensionUi().select)
  assert.equal(interactive.__linxPodBackedExtensionUiInstalled, true)
})

test('linx pod status output filter removes noisy Pod connection status lines', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-status-output.ts')
  t.after(() => cleanup())

  const noisy = [
    'Connecting to Solid Pod: https://id.undefineds.co/ganbb/',
    'Using WebID: https://id.undefineds.co/ganbb/profile/card#me────────────────────',
    'Using explicit Pod URL; skipping Pod root probe',
    'Successfully connected to Solid Pod',
    'real user-facing line',
  ].join('\n')

  assert.equal(module.filterPodStatusOutput(noisy), 'real user-facing line')
})

test('pod status output filtering lives in a shell output module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-status-output.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.installPodStatusOutputFilter, 'function')
  assert.equal(typeof module.suppressPodStatusOutput, 'function')
  assert.equal(typeof module.filterPodStatusOutput, 'function')
})

test('linx status line supports Codex-style token config from environment', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-status-line.ts')
  t.after(() => cleanup())
  const previousStatusLine = process.env.LINX_STATUS_LINE
  const previousUseColors = process.env.LINX_STATUS_LINE_USE_COLORS
  const previousHome = process.env.HOME
  process.env.LINX_STATUS_LINE = [
    'model-with-reasoning',
    'git-branch',
    'context-remaining',
    'total-input-tokens',
    'total-output-tokens',
    'current-dir',
    'session-name',
  ].join(',')
  process.env.LINX_STATUS_LINE_USE_COLORS = 'false'
  process.env.HOME = '/tmp'
  t.after(() => {
    restoreEnv('LINX_STATUS_LINE', previousStatusLine)
    restoreEnv('LINX_STATUS_LINE_USE_COLORS', previousUseColors)
    restoreEnv('HOME', previousHome)
  })

  const line = module.buildLinxFooterStatusLine({
    width: 180,
    autoCompactEnabled: true,
    footerData: {
      getGitBranch() {
        return 'feature/statusline'
      },
    },
    session: {
      sessionManager: {
        getCwd() {
          return '/tmp/demo'
        },
        getSessionName() {
          return 'smoke'
        },
        getEntries() {
          return [
            {
              type: 'message',
              message: {
                role: 'assistant',
                usage: {
                  input: 1200,
                  output: 80,
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
          contextWindow: 1000,
        },
        thinkingLevel: 'high',
      },
      getContextUsage() {
        return { contextWindow: 1000, percent: 25 }
      },
    },
  }).trimEnd()

  assert.equal(line, 'linx-lite • high • feature/statusline • ctx left 750 • ↑1.2k • ↓80 • ~/demo • smoke')
})

test('linx status line reads app-local JSON config from LINX_HOME', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-status-line.ts')
  t.after(() => cleanup())
  const linxHome = mkdtempSync(join(tmpdir(), 'linx-status-line-home-'))
  const previousLinxHome = process.env.LINX_HOME
  const previousStatusLine = process.env.LINX_STATUS_LINE
  const previousUseColors = process.env.LINX_STATUS_LINE_USE_COLORS
  process.env.LINX_HOME = linxHome
  delete process.env.LINX_STATUS_LINE
  delete process.env.LINX_STATUS_LINE_USE_COLORS
  t.after(() => {
    restoreEnv('LINX_HOME', previousLinxHome)
    restoreEnv('LINX_STATUS_LINE', previousStatusLine)
    restoreEnv('LINX_STATUS_LINE_USE_COLORS', previousUseColors)
    rmSync(linxHome, { recursive: true, force: true })
  })
  mkdirSync(linxHome, { recursive: true })
  writeFileSync(join(linxHome, 'config.json'), JSON.stringify({
    status_line: ['provider', 'model', 'git_branch'],
    status_line_use_colors: false,
  }))

  const line = module.buildLinxFooterStatusLine({
    width: 80,
    autoCompactEnabled: true,
    footerData: {
      getGitBranch() {
        return 'main'
      },
    },
    session: {
      sessionManager: {
        getCwd() {
          return '/tmp/demo'
        },
        getEntries() {
          return []
        },
      },
      state: {
        model: {
          id: 'linx-lite',
          provider: 'undefineds',
          contextWindow: 1000,
        },
      },
      getContextUsage() {
        return { contextWindow: 1000, percent: 5 }
      },
    },
  }).trimEnd()

  assert.equal(line, 'undefineds • linx-lite • main')
})

test('linx interactive /update checks npm and opens the TUI update selector', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const previousOffline = process.env.PI_OFFLINE
  const previousFetch = globalThis.fetch
  delete process.env.PI_OFFLINE
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { version: '0.9.9' }
    },
  })
  t.after(() => {
    restoreEnv('PI_OFFLINE', previousOffline)
    globalThis.fetch = previousFetch
  })

  const submitted = []
  const selectorCalls = []
  const statuses = []
  const interactive = {
    defaultEditor: {},
    editor: {
      setText() {},
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
      selectorCalls.push({ title, options })
      return 'Later'
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
  }

  module.installLinxGlobalCommands(interactive, {}, process.cwd())
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/update')
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(submitted, [])
  assert.equal(selectorCalls.length, 1)
  assert.match(selectorCalls[0].title, /LinX update available/)
  assert.deepEqual(selectorCalls[0].options, ['Later', 'Install update and restart', 'Open changelog'])
  assert.equal(statuses.some((message) => String(message).includes('Skipped LinX 0.9.9 for now.')), true)
})

test('linx interactive /statusline direct commands update app-local config', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())
  const linxHome = mkdtempSync(join(tmpdir(), 'linx-interactive-statusline-home-'))
  const previousLinxHome = process.env.LINX_HOME
  const previousStatusLine = process.env.LINX_STATUS_LINE
  const previousUseColors = process.env.LINX_STATUS_LINE_USE_COLORS
  process.env.LINX_HOME = linxHome
  delete process.env.LINX_STATUS_LINE
  delete process.env.LINX_STATUS_LINE_USE_COLORS
  t.after(() => {
    restoreEnv('LINX_HOME', previousLinxHome)
    restoreEnv('LINX_STATUS_LINE', previousStatusLine)
    restoreEnv('LINX_STATUS_LINE_USE_COLORS', previousUseColors)
    rmSync(linxHome, { recursive: true, force: true })
  })

  const submitted = []
  const statuses = []
  const renders = []
  const interactive = {
    defaultEditor: {},
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {
        renders.push('render')
      },
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
  }

  module.installLinxGlobalCommands(interactive, {}, process.cwd())
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/statusline set model-with-reasoning git-branch context-remaining')
  await interactive.defaultEditor.onSubmit('/statusline colors off')

  const config = JSON.parse(readFileSync(join(linxHome, 'config.json'), 'utf-8'))
  assert.deepEqual(submitted, [])
  assert.deepEqual(config.status_line, ['model-with-reasoning', 'git-branch', 'context-remaining'])
  assert.equal(config.status_line_use_colors, false)
  assert.match(statuses.join('\n'), /Status line updated/)
  assert.match(statuses.join('\n'), /colors disabled/)
  assert.equal(renders.length > 0, true)
})

test('linx interactive /statusline opens a draft multi-select editor', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())
  const linxHome = mkdtempSync(join(tmpdir(), 'linx-interactive-statusline-selector-home-'))
  const previousLinxHome = process.env.LINX_HOME
  const previousStatusLine = process.env.LINX_STATUS_LINE
  const previousUseColors = process.env.LINX_STATUS_LINE_USE_COLORS
  process.env.LINX_HOME = linxHome
  delete process.env.LINX_STATUS_LINE
  delete process.env.LINX_STATUS_LINE_USE_COLORS
  t.after(() => {
    restoreEnv('LINX_HOME', previousLinxHome)
    restoreEnv('LINX_STATUS_LINE', previousStatusLine)
    restoreEnv('LINX_STATUS_LINE_USE_COLORS', previousUseColors)
    rmSync(linxHome, { recursive: true, force: true })
  })

  let selectorResult
  let doneCalled = false
  const statuses = []
  const interactive = {
    defaultEditor: {},
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {
        throw new Error('/statusline should not reach backend submit')
      }
    },
    showSelector(create) {
      selectorResult = create(() => {
        doneCalled = true
      })
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
  }

  module.installLinxGlobalCommands(interactive, {}, process.cwd())
  interactive.setupEditorSubmitHandler()
  const submitPromise = interactive.defaultEditor.onSubmit('/statusline')
  await new Promise((resolve) => setImmediate(resolve))

  assert.ok(selectorResult?.component)
  assert.ok(selectorResult?.focus)
  const renderFocus = () => stripAnsi(selectorResult.focus.render(120).join('\n'))
  const moveSelectionTo = (needle) => {
    for (let index = 0; index < 40; index += 1) {
      if (renderFocus().split('\n').some((line) => line.startsWith('> ') && line.includes(needle))) {
        return
      }
      selectorResult.focus.handleInput('\x1B[B')
    }
    throw new Error(`Could not select ${needle}.\n${renderFocus()}`)
  }

  assert.match(renderFocus(), /> ✓ total-input-tokens/)
  assert.match(renderFocus(), /  ○ git-branch/)
  assert.match(renderFocus(), /Enter toggles/)

  moveSelectionTo('git-branch')
  selectorResult.focus.handleInput('\r')
  assert.match(renderFocus(), /> ✓ git-branch/)
  assert.equal(existsSync(join(linxHome, 'config.json')), false)

  moveSelectionTo('current-dir')
  selectorResult.focus.handleInput('\r')
  assert.match(renderFocus(), /> ✓ current-dir/)
  assert.equal(existsSync(join(linxHome, 'config.json')), false)

  moveSelectionTo('Done')
  selectorResult.focus.handleInput('\r')
  await submitPromise

  const config = JSON.parse(readFileSync(join(linxHome, 'config.json'), 'utf-8'))
  assert.equal(doneCalled, true)
  assert.deepEqual(config.status_line, [
    'total-input-tokens',
    'total-output-tokens',
    'context-usage',
    'cache-rate',
    'model-with-reasoning',
    'git-branch',
    'current-dir',
  ])
  assert.match(statuses.join('\n'), /Status line updated/)
})

test('linx footer patch adds cache rate from assistant usage', async (t) => {
  const linxHome = mkdtempSync(join(tmpdir(), 'linx-status-line-patch-home-'))
  const previousLinxHome = process.env.LINX_HOME
  const previousStatusLine = process.env.LINX_STATUS_LINE
  const previousUseColors = process.env.LINX_STATUS_LINE_USE_COLORS
  process.env.LINX_HOME = linxHome
  delete process.env.LINX_STATUS_LINE
  delete process.env.LINX_STATUS_LINE_USE_COLORS
  t.after(() => {
    restoreEnv('LINX_HOME', previousLinxHome)
    restoreEnv('LINX_STATUS_LINE', previousStatusLine)
    restoreEnv('LINX_STATUS_LINE_USE_COLORS', previousUseColors)
    rmSync(linxHome, { recursive: true, force: true })
  })

  const [{ module: runtimeModule, cleanup: runtimeCleanup }, { module: interactiveModule, cleanup: interactiveCleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/runtime.ts'),
    loadAutoModeModule('lib/pi-adapter/interactive.ts'),
  ])
  t.after(() => runtimeCleanup())
  t.after(() => interactiveCleanup())

  const { FooterComponent } = await import('@earendil-works/pi-coding-agent')
  const { visibleWidth } = await import('@earendil-works/pi-tui')

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
        getShowTerminalProgress() { return false },
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
  t.after(() => interactive.stop())
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
  const linxHome = mkdtempSync(join(tmpdir(), 'linx-status-line-width-home-'))
  const previousLinxHome = process.env.LINX_HOME
  const previousStatusLine = process.env.LINX_STATUS_LINE
  const previousUseColors = process.env.LINX_STATUS_LINE_USE_COLORS
  process.env.LINX_HOME = linxHome
  delete process.env.LINX_STATUS_LINE
  delete process.env.LINX_STATUS_LINE_USE_COLORS
  t.after(() => {
    restoreEnv('LINX_HOME', previousLinxHome)
    restoreEnv('LINX_STATUS_LINE', previousStatusLine)
    restoreEnv('LINX_STATUS_LINE_USE_COLORS', previousUseColors)
    rmSync(linxHome, { recursive: true, force: true })
  })

  const [{ module: runtimeModule, cleanup: runtimeCleanup }, { module: interactiveModule, cleanup: interactiveCleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/runtime.ts'),
    loadAutoModeModule('lib/pi-adapter/interactive.ts'),
  ])
  t.after(() => runtimeCleanup())
  t.after(() => interactiveCleanup())

  const { FooterComponent } = await import('@earendil-works/pi-coding-agent')
  const { visibleWidth } = await import('@earendil-works/pi-tui')

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
        getShowTerminalProgress() { return false },
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
  t.after(() => interactive.stop())
  assert.equal(typeof runtimeModule.createLinxRuntimeAdapter, 'function')
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
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
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
  assert.match(output, /Resume: linx --session 019df-exit-test/)
})

test('linx interactive run suppresses Pi resume command output while preserving LinX output', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())
  const writes = captureProcessStreamWrites(t, process.stdout)

  await module.withSuppressedPiResumeOutput(async () => {
    process.stdout.write('\x1b[2mTo resume this session:\x1b[22m pi --session-dir /Users/ganlu/.solid/apps/linx/agent/sessions --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
    process.stdout.write('Resume: linx --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
  })

  assert.equal(writes.join(''), 'Resume: linx --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
})

test('linx resume output style suppresses split upstream Pi resume hints', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())
  const writes = captureProcessStreamWrites(t, process.stdout)

  await module.withLinxResumeOutputStyle(async () => {
    process.stdout.write('\x1b[2mTo resume this session:')
    process.stdout.write('\x1b[22m pi --session-dir /Users/ganlu/.solid/apps/linx/agent/sessions ')
    process.stdout.write('--session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
    process.stdout.write('Resume: linx --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
  })

  assert.equal(writes.join(''), 'Resume: linx --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
})

test('linx resume output style suppresses upstream Pi resume hints on stderr', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())
  const writes = captureProcessStreamWrites(t, process.stderr)

  await module.withLinxResumeOutputStyle(async () => {
    process.stderr.write('To resume this session: pi --session-dir /Users/ganlu/.solid/apps/linx/agent/sessions --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
    process.stderr.write('LinX warning stays visible\n')
  })

  assert.equal(writes.join(''), 'LinX warning stays visible\n')
})

test('linx resume output style keeps suppressing Pi resume hints written on the trailing tick', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())
  const writes = captureProcessStreamWrites(t, process.stdout)

  await module.withLinxResumeOutputStyle(async () => {
    setImmediate(() => {
      process.stdout.write('To resume this session: pi --session-dir /Users/ganlu/.solid/apps/linx/agent/sessions --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
    })
  })

  assert.equal(writes.join(''), '')
})

test('linx persistent resume output style suppresses Pi resume hints after run scope', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  module.installLinxResumeOutputStyle()()
  const writes = captureProcessStreamWrites(t, process.stdout)
  const restore = module.installLinxResumeOutputStyle()
  try {
    await new Promise((resolve) => {
      setImmediate(() => {
        process.stdout.write('To resume this session: pi --session-dir /Users/ganlu/.solid/apps/linx/agent/sessions --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
        process.stdout.write('Resume: linx --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
        resolve()
      })
    })
  } finally {
    restore()
  }

  assert.equal(writes.join(''), 'Resume: linx --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
})

test('linx resume output style preserves non-Pi output with the same sentence prefix', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())
  const writes = captureProcessStreamWrites(t, process.stdout)

  await module.withLinxResumeOutputStyle(async () => {
    process.stdout.write('To resume this session: use linx resume 019e5cf6-cbfa-75c2-9d50-5a736c158c17')
  })

  assert.equal(writes.join(''), 'To resume this session: use linx resume 019e5cf6-cbfa-75c2-9d50-5a736c158c17')
})

function captureProcessStreamWrites(t, stream) {
  const originalWrite = stream.write
  const writes = []
  stream.write = ((chunk, encodingOrCallback, callback) => {
    const text = String(chunk)
    if (!isNodeTestRunnerOutput(text)) {
      writes.push(text)
    }
    const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback
    done?.()
    return true
  })
  t.after(() => {
    stream.write = originalWrite
  })
  return writes
}

function isNodeTestRunnerOutput(text) {
  return text.includes('test:')
    || text.startsWith('✔ ')
    || text.startsWith('✖ ')
    || text.startsWith('ℹ ')
}

function createBaseExtensionUi(overrides = {}) {
  return {
    async select() {
      return undefined
    },
    async confirm() {
      return false
    },
    async input() {
      return undefined
    },
    notify() {},
    onTerminalInput() {
      return () => {}
    },
    setStatus() {},
    setWorkingMessage() {},
    setWidget() {},
    setFooter() {},
    setHeader() {},
    setTitle() {},
    async custom() {
      return undefined
    },
    pasteToEditor() {},
    setEditorText() {},
    getEditorText() {
      return ''
    },
    async editor() {
      return undefined
    },
    setEditorComponent() {},
    theme: {},
    getAllThemes() {
      return []
    },
    getTheme() {
      return undefined
    },
    setTheme() {
      return { success: true }
    },
    getToolsExpanded() {
      return false
    },
    setToolsExpanded() {},
    ...overrides,
  }
}

function createApprovalRuntime(options = {}) {
  const state = {
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    approvals: [],
    audits: [],
    grants: [],
    inbox: [],
  }
  const runtime = {
    state,
    async getPodDataSession() {
      const credentials = {
        url: 'https://id.undefineds.co/',
        webId: state.webId,
        authType: 'clientCredentials',
        sourceDir: '/tmp/linx',
        secrets: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
        },
      }
      return {
        credentials,
        webId: state.webId,
        fetch: async () => new Response(null, { status: 204 }),
      }
    },
    createStore() {
      return {
        async listApprovals() {
          return state.approvals
        },
        async insertApproval(row) {
          state.approvals.push({ ...row })
        },
        async updateApproval(id, patch) {
          const row = state.approvals.find((entry) => entry.id === id)
          Object.assign(row, patch)
        },
        async listAudits() {
          return state.audits
        },
        async insertAudit(row) {
          state.audits.push({ ...row })
        },
        async listGrants() {
          return state.grants
        },
        async insertGrant(row) {
          state.grants.push({ ...row })
        },
        async insertInboxNotification(row) {
          state.inbox.push({ ...row })
        },
      }
    },
    async sleep() {
      options.onSleep?.(state)
    },
    now() {
      return new Date('2026-05-05T00:00:00.000Z')
    },
  }
  return runtime
}

test('linx welcome header keeps the full session id instead of truncating it', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
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
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
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
  assert.deepEqual(selectorCalls[0].options, ['Later', 'Install update and restart', 'Open changelog'])
  assert.equal(openedUrls[0], 'https://github.com/undefineds-co/linx-cli/releases')
  assert.equal(statuses.some((message) => message.includes('Opened LinX changelog')), true)
  const renderedText = rendered.map((child) => child.text ?? child.render?.(100)?.join('\n') ?? '').join('\n')
  assert.doesNotMatch(renderedText, /Run: npm install -g @undefineds\.co\/linx/)
})

test('linx runtime suppresses upstream Pi version notifications', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const selectorCalls = []
  const interactive = {
    options: {},
    settingsManager: {
      getQuietStartup() {
        return true
      },
    },
    sessionManager: {
      getCwd() {
        return process.cwd()
      },
      getSessionName() {
        return undefined
      },
    },
    ui: {
      requestRender() {},
      terminal: {
        setTitle() {},
      },
    },
    async init() {},
    async run() {
      await this.init()
      this.showNewVersionNotification('0.78.0')
    },
    async showExtensionSelector(title, options) {
      selectorCalls.push({ title, options })
      return 'Later'
    },
  }

  module.applyLinxInteractiveBranding(interactive)
  await interactive.run()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(selectorCalls.length, 0)
})

test('linx update notification ignores unversioned objects and never renders object values', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const selectorCalls = []
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
      return 'Install update and restart'
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
  }

  module.applyLinxInteractiveBranding(interactive)
  interactive.showNewVersionNotification({ command: 'self-update', label: 'Install latest' })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(selectorCalls.length, 0)
  assert.equal(statuses.some((message) => String(message).includes('[object Object]')), false)
  const renderedText = rendered.map((child) => child.text ?? child.render?.(100)?.join('\n') ?? '').join('\n')
  assert.doesNotMatch(renderedText, /\[object Object\]/)
})


test('shell lifecycle restart releases the old TUI and keeps the shell waiting for the new process', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/shell-lifecycle.ts')
  t.after(() => cleanup())

  const events = []
  const childHandlers = {}
  const runtimeEnv = {}
  const interactive = {
    stop() {
      events.push({ type: 'stop', noExitMessage: runtimeEnv[module.LINX_TUI_NO_EXIT_MESSAGE_ENV] })
    },
    showError(message) {
      events.push(`error:${message}`)
    },
  }
  const runtime = {
    execPath: '/usr/local/bin/node',
    argv: ['/usr/local/bin/node', '/usr/local/bin/linx', '--session', 'session_123'],
    env: runtimeEnv,
    cwd() {
      return '/workspace/project'
    },
    spawnProcess(command, args, options) {
      events.push({ type: 'spawn', command, args, options })
      return {
        on(event, handler) {
          childHandlers[event] = handler
          events.push({ type: 'child-listener', event })
          return this
        },
      }
    },
    exitProcess(code) {
      events.push({ type: 'exit', code })
    },
    defer(callback, delayMs) {
      events.push({ type: 'defer', delayMs })
      callback()
    },
  }

  module.restartInteractiveShellProcess(interactive, { runtime })

  assert.deepEqual(events[0], { type: 'stop', noExitMessage: '1' })
  assert.deepEqual(events[1], { type: 'defer', delayMs: 50 })
  assert.equal(events[2]?.type, 'spawn')
  assert.equal(events[2].command, runtime.execPath)
  assert.deepEqual(events[2].args, runtime.argv.slice(1))
  assert.equal(events[2].options.cwd, '/workspace/project')
  assert.notEqual(events[2].options.env, runtimeEnv)
  assert.equal(events[2].options.env[module.LINX_TUI_NO_EXIT_MESSAGE_ENV], undefined)
  assert.equal(events[2].options.stdio, 'inherit')
  assert.equal(events[2].options.detached, false)
  assert.equal(runtimeEnv[module.LINX_TUI_NO_EXIT_MESSAGE_ENV], '1')
  assert.equal(events.some((event) => event?.type === 'exit'), false)

  assert.equal(typeof childHandlers.close, 'function')
  childHandlers.close(0, null)

  assert.equal(runtimeEnv[module.LINX_TUI_NO_EXIT_MESSAGE_ENV], undefined)
  assert.equal(events.at(-1)?.type, 'exit')
  assert.equal(events.at(-1).code, 0)
})

test('shell lifecycle restart drains terminal input before handing the TTY to the replacement process', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/shell-lifecycle.ts')
  t.after(() => cleanup())

  const events = []
  const childHandlers = {}
  const runtimeEnv = {}
  let resolveDrain
  const interactive = {
    ui: {
      terminal: {
        drainInput(maxMs) {
          events.push({ type: 'drain', maxMs })
          return new Promise((resolve) => {
            resolveDrain = () => {
              events.push({ type: 'drain-finished' })
              resolve()
            }
          })
        },
      },
    },
    stop() {
      events.push({
        type: 'stop',
        restarting: module.isInteractiveShellRestarting(interactive),
        noExitMessage: runtimeEnv[module.LINX_TUI_NO_EXIT_MESSAGE_ENV],
      })
    },
    showError(message) {
      events.push(`error:${message}`)
    },
  }
  const runtime = {
    execPath: '/usr/local/bin/node',
    argv: ['/usr/local/bin/node', '/usr/local/bin/linx', '--session', 'session_123'],
    env: runtimeEnv,
    cwd() {
      return '/workspace/project'
    },
    spawnProcess(command, args, options) {
      events.push({ type: 'spawn', command, args, options })
      return {
        on(event, handler) {
          childHandlers[event] = handler
          return this
        },
      }
    },
    exitProcess(code) {
      events.push({ type: 'exit', code })
    },
    defer(callback, delayMs) {
      events.push({ type: 'defer', delayMs })
      callback()
    },
  }

  const restart = module.restartInteractiveShellProcess(interactive, { runtime })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(events, [{ type: 'drain', maxMs: 1000 }])
  assert.equal(module.isInteractiveShellRestarting(interactive), true)
  assert.equal(runtimeEnv[module.LINX_TUI_NO_EXIT_MESSAGE_ENV], '1')

  resolveDrain()
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(events.slice(0, 4), [
    { type: 'drain', maxMs: 1000 },
    { type: 'drain-finished' },
    { type: 'stop', restarting: true, noExitMessage: '1' },
    { type: 'defer', delayMs: 50 },
  ])
  assert.equal(events[4]?.type, 'spawn')
  assert.equal(events.some((event) => event?.type === 'exit'), false)

  childHandlers.close(0, null)
  await restart

  assert.equal(module.isInteractiveShellRestarting(interactive), false)
  assert.equal(runtimeEnv[module.LINX_TUI_NO_EXIT_MESSAGE_ENV], undefined)
  assert.deepEqual(events.at(-1), { type: 'exit', code: 0 })
})

test('interactive stop router keeps original stop and final cleanup when a before handler fails', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-interactive-stop-router.ts')
  t.after(() => cleanup())

  const events = []
  const interactive = {
    stop() {
      events.push('original')
    },
  }

  module.registerLinxInteractiveStopHandler(interactive, {
    name: 'failing-before',
    phase: 'before',
    priority: 10,
    handler() {
      events.push('before')
      throw new Error('before failed')
    },
  })
  module.registerLinxInteractiveStopHandler(interactive, {
    name: 'later-before',
    phase: 'before',
    priority: 20,
    handler() {
      events.push('later-before')
    },
  })
  module.registerLinxInteractiveStopHandler(interactive, {
    name: 'after',
    phase: 'after',
    handler() {
      events.push('after')
    },
  })
  module.registerLinxInteractiveStopHandler(interactive, {
    name: 'cleanup',
    phase: 'finally',
    handler() {
      events.push('cleanup')
    },
  })

  assert.throws(() => interactive.stop(), /before failed/)
  assert.deepEqual(events, ['before', 'later-before', 'original', 'after', 'cleanup'])
})

test('linx update notification normalizes object version values and selector object choices', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const selectorCalls = []
  const openedUrls = []
  const statuses = []
  const interactive = {
    chatContainer: {
      addChild() {},
    },
    ui: {
      requestRender() {},
    },
    async showExtensionSelector(title, options) {
      selectorCalls.push({ title, options })
      return { value: 'Open changelog' }
    },
    openExternal(url) {
      openedUrls.push(url)
    },
    showStatus(message) {
      statuses.push(message)
    },
  }

  module.applyLinxInteractiveBranding(interactive)
  interactive.showNewVersionNotification({ version: ' 0.2.4 ' })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(selectorCalls.length, 1)
  assert.match(selectorCalls[0].title, /latest 0\.2\.4/)
  assert.equal(openedUrls[0], 'https://github.com/undefineds-co/linx-cli/releases')
  assert.equal(statuses.some((message) => message.includes('Opened LinX changelog for 0.2.4')), true)
})

test('linx update notification replays after deferred startup login completes', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const selectorCalls = []
  const loginCalls = []
  const statuses = []
  const interactive = {
    isInitialized: true,
    session: {
      modelRegistry: {
        refresh() {},
        authStorage: {
          async login(providerId, callbacks) {
            loginCalls.push(providerId)
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
      return title.includes('update available') ? 'Later' : 'Authorize in browser'
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
  module.requestLinxCloudLogin(interactive, 'startup')
  interactive.showNewVersionNotification({ version: '0.9.9' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(selectorCalls.length, 2)
  assert.match(selectorCalls[0].title, /LinX Cloud login required/)
  assert.match(selectorCalls[1].title, /LinX update available/)
  assert.deepEqual(loginCalls, ['undefineds', `undefineds:${LINX_RUNTIME_MANAGED_AUTH_KEY}`])
  assert.equal(statuses.some((message) => String(message).includes('Skipped LinX 0.9.9 for now.')), true)
})

test('linx update version comparison handles preview builds', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  assert.equal(module.isVersionNewer('0.2.3', '0.2.4-preview.1777478039135'), false)
  assert.equal(module.isVersionNewer('0.2.4-preview.1777478039135', '0.2.3'), true)
  assert.equal(module.isVersionNewer('0.2.4', '0.2.4-preview.1777478039135'), true)
  assert.equal(module.isVersionNewer('0.2.4-preview.1777478039135', '0.2.4'), false)
  assert.equal(module.isVersionNewer('0.2.4', '0.2.3'), true)
})



test('interactive shell command modules share one submit patch point', async (t) => {
  const [{ module, cleanup }, { module: brandingModule, cleanup: brandingCleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/interactive.ts'),
    loadAutoModeModule('lib/pi-adapter/branding.ts'),
  ])
  t.after(() => {
    cleanup()
    brandingCleanup()
  })

  let setupPatchCount = 0
  const submitted = []
  const statuses = []
  const selectors = []
  const interactive = {
    defaultEditor: {},
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    runtime: {},
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
    async showExtensionSelector(title, options) {
      selectors.push({ title, options })
      return 'Later'
    },
    showError(message) {
      throw new Error(String(message))
    },
  }

  let currentSetup = interactive.setupEditorSubmitHandler
  Object.defineProperty(interactive, 'setupEditorSubmitHandler', {
    configurable: true,
    enumerable: true,
    get() {
      return currentSetup
    },
    set(value) {
      setupPatchCount += 1
      currentSetup = value
    },
  })

  brandingModule.applyLinxInteractiveBranding(interactive)
  module.installLinxGlobalCommands(interactive, {}, process.cwd())
  module.installSymphonyCommand(interactive)
  module.installBackendCommandRouter(interactive, {
    backend: 'codex',
    async execute(command) {
      return { handled: true, message: `backend:${command}` }
    },
  })

  assert.equal(setupPatchCount, 1, 'shell integrations should install a single shared submit router patch')

  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/symphony on')
  await interactive.defaultEditor.onSubmit('/symphony off')
  await interactive.defaultEditor.onSubmit('/status')
  await interactive.defaultEditor.onSubmit('/symphony on')
  await interactive.defaultEditor.onSubmit('hello')

  assert.equal(statuses.some((message) => String(message).includes('Symphony is on')), true)
  assert.equal(statuses.some((message) => String(message).includes('Symphony is off')), true)
  assert.equal(statuses.some((message) => String(message).includes('backend:/status')), true)
  assert.equal(submitted.length, 1)
  assert.match(submitted[0], /AI Secretary Symphony request/)
  assert.match(submitted[0], /User message:\nhello/)
})

test('linx /login command shows a LinX-only auth selector before browser login', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
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
  assert.deepEqual(linxSelectorCalls[0].options, ['Authorize in browser', 'Enter Solid client credentials', 'Exit'])
  assert.equal(loginCalls[0], 'undefineds')
  assert.equal(loginCalls[1], `undefineds:${LINX_RUNTIME_MANAGED_AUTH_KEY}`)
  assert.equal(loginCalls.includes('undefineds:fresh-access-token'), false)
  assert.deepEqual(loginForceFreshValues, [true])
  assert.deepEqual(hasManualRedirectCallbacks, [true])
  assert.equal(openedUrls[0], 'https://id.undefineds.co/.oidc/auth?client_id=test')
  assert.deepEqual(submitted, ['hello'])
})

test('linx /login command accepts selector object choices from TUI surfaces', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const loginCalls = []
  const selectorCalls = []
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
      this.defaultEditor.onSubmit = async () => {}
    },
    async showExtensionSelector(title, options) {
      selectorCalls.push({ title, options })
      return { label: 'Authorize in browser' }
    },
    showStatus() {},
    showError(message) {
      throw new Error(message)
    },
    openExternal() {},
    async updateAvailableProviderCount() {},
  }

  module.applyLinxInteractiveBranding(interactive)
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/login')

  assert.equal(selectorCalls.length, 1)
  assert.deepEqual(loginCalls, ['undefineds', `undefineds:${LINX_RUNTIME_MANAGED_AUTH_KEY}`])
})

test('linx browser login fallback passes a manual redirect input callback to auth storage', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
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
  assert.equal(loginCalls[1], `undefineds:${LINX_RUNTIME_MANAGED_AUTH_KEY}`)
  assert.equal(loginCalls.includes('undefineds:fresh-access-token'), false)
  assert.deepEqual(loginForceFreshValues, [true])
  assert.deepEqual(manualRedirects, ['http://127.0.0.1:1234/auth/callback?code=abc&state=state&iss=https%3A%2F%2Fid.undefineds.co%2F'])
  assert.equal(openedUrls[0], 'https://id.undefineds.co/.oidc/auth?client_id=test')
})

test('linx browser login dialog also forces a fresh consent flow', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const loginCalls = []
  const loginForceFreshValues = []
  const hasManualRedirectCallbacks = []
  const hasAbortSignals = []
  const addedChildren = []
  const focused = []
  const editor = { setText() {} }
  const interactive = {
    defaultEditor: {},
    editor,
    editorContainer: {
      clear() {},
      addChild(child) {
        addedChildren.push(child)
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
            hasAbortSignals.push(callbacks.signal instanceof AbortSignal)
          },
          get() {
            return undefined
          },
        },
      },
    },
    chatContainer: {
      addChild() {},
    },
    ui: {
      setFocus(target) {
        focused.push(target)
      },
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {}
    },
    async showExtensionSelector() {
      return 'Authorize in browser'
    },
    showStatus() {},
    showError(message) {
      throw new Error(message)
    },
    async updateAvailableProviderCount() {},
  }

  module.applyLinxInteractiveBranding(interactive)
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/login')

  assert.deepEqual(loginCalls, ['undefineds'])
  assert.deepEqual(loginForceFreshValues, [true])
  assert.deepEqual(hasManualRedirectCallbacks, [true])
  assert.deepEqual(hasAbortSignals, [true])
  assert.equal(addedChildren.at(-1), editor)
  assert.equal(focused.at(-1), editor)
})

test('linx /login command labels Solid client credentials entry as Solid identity, not AI provider login', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const errorMessages = []
  const prompts = []
  const interactive = {
    defaultEditor: {},
    editor: {
      setText() {},
    },
    session: {
      modelRegistry: {
        refresh() {},
        authStorage: {
          setRuntimeApiKey() {},
          set() {},
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
      assert.deepEqual(options, ['Authorize in browser', 'Enter Solid client credentials', 'Exit'])
      return 'Enter Solid client credentials'
    },
    async showExtensionInput(title, placeholder) {
      prompts.push({ title, placeholder })
      return '  invalid  '
    },
    showStatus() {},
    showError(message) {
      errorMessages.push(message)
    },
    async updateAvailableProviderCount() {},
  }

  module.applyLinxInteractiveBranding(interactive)
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/login')

  assert.equal(prompts.length, 1)
  assert.match(prompts[0].title, /Solid client credentials/)
  assert.match(prompts[0].title, /AI provider keys belong in `linx ai connect`/)
  assert.equal(prompts[0].placeholder, 'client_id:client_secret')
  assert.equal(errorMessages.length, 1)
  assert.match(errorMessages[0], /Expected client_id:client_secret/)
})

test('linx /login Solid client credentials marks Pi runtime auth as session-managed', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const solidSecret = 'linx-client:linx-secret'
  const runtimeWrites = []
  const persistedSecrets = []
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
            runtimeWrites.push({ method: 'set', providerId, credential })
          },
          setRuntimeApiKey(providerId, apiKey) {
            runtimeWrites.push({ method: 'setRuntimeApiKey', providerId, apiKey })
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
    async __linxPersistSolidSecretLogin(secret) {
      persistedSecrets.push(secret)
      return {
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        podUrl: 'https://id.undefineds.co/alice/',
        accessToken: 'resolved-solid-access-token',
      }
    },
    async showExtensionSelector(_title, options) {
      assert.deepEqual(options, ['Authorize in browser', 'Enter Solid client credentials', 'Exit'])
      return 'Enter Solid client credentials'
    },
    async showExtensionInput(title, placeholder) {
      assert.match(title, /Solid client credentials/)
      assert.equal(placeholder, 'client_id:client_secret')
      return solidSecret
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

  assert.deepEqual(persistedSecrets, [solidSecret])
  assert.deepEqual(runtimeWrites.find((entry) => entry.method === 'setRuntimeApiKey'), {
    method: 'setRuntimeApiKey',
    providerId: 'undefineds',
    apiKey: LINX_RUNTIME_MANAGED_AUTH_KEY,
  })
  assert.deepEqual(runtimeWrites.find((entry) => entry.method === 'set'), {
    method: 'set',
    providerId: 'undefineds',
    credential: {
      type: 'api_key',
      key: LINX_RUNTIME_MANAGED_AUTH_KEY,
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      podUrl: 'https://id.undefineds.co/alice/',
    },
  })
  assert.equal(runtimeWrites.some((entry) => JSON.stringify(entry).includes(solidSecret)), false)
  assert.equal(runtimeWrites.some((entry) => JSON.stringify(entry).includes('resolved-solid-access-token')), false)
  assert.equal(statuses.some((message) => String(message).includes('Solid client credentials saved to ~/.solid/auth')), true)
})

test('linx native oauth selector is replaced with LinX-only login', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const originalHome = process.env.HOME
  const home = mkdtempSync(join(tmpdir(), 'linx-pi-logout-home-'))
  process.env.HOME = home
  t.after(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    rmSync(home, { recursive: true, force: true })
  })

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
  assert.deepEqual(selectorCalls[0].options, ['Authorize in browser', 'Enter Solid client credentials', 'Exit'])
  assert.deepEqual(selectorCalls[1].options, ['Authorize in browser', 'Enter Solid client credentials', 'Exit'])
  assert.equal(loginCalls.includes('anthropic'), false)
  assert.equal(loginCalls.filter((entry) => entry === 'undefineds').length, 2)
  assert.deepEqual(loginForceFreshValues, [true, true])
  assert.equal(loginCalls.includes('logout:undefineds'), true)
  assert.equal(statuses.some((message) => message.includes('LinX only supports LinX Cloud')), true)
  assert.equal(statuses.some((message) => message.includes('Logged out of LinX Cloud')), true)
})

test('linx startup login prompt uses the required-login copy and can exit', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
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
  assert.deepEqual(selectorCalls[0].options, ['Authorize in browser', 'Enter Solid client credentials', 'Exit'])
  assert.equal(stopped, true)
})

test('linx expired login prompt is deferred until interactive init completes', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const selectorCalls = []
  const loginForceFreshValues = []
  const interactive = {
    isInitialized: false,
    session: {
      modelRegistry: {
        refresh() {},
        authStorage: {
          async login(_providerId, callbacks) {
            loginForceFreshValues.push(callbacks.forceFresh)
          },
          get() {
            return undefined
          },
        },
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
  assert.deepEqual(selectorCalls[0].options, ['Authorize in browser', 'Enter Solid client credentials', 'Exit'])
  assert.deepEqual(loginForceFreshValues, [true])
})

test('linx interactive branding shows the LinX auth selector when cloud auth expires', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
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
  assert.deepEqual(selectorCalls[0].options, ['Authorize in browser', 'Enter Solid client credentials', 'Exit'])
  assert.equal(loginCalls[0], 'undefineds')
  assert.equal(loginCalls[1], `undefineds:${LINX_RUNTIME_MANAGED_AUTH_KEY}`)
  assert.equal(loginCalls.includes('undefineds:fresh-access-token'), false)
  assert.deepEqual(loginForceFreshValues, [true])
  assert.deepEqual(hasManualRedirectCallbacks, [true])
  assert.equal(refreshCalls.length, 1)
  assert.equal(statuses.some((message) => message.includes('Choose how to re-authorize')), false)
  assert.equal(statuses.some((message) => message.includes('Browser authorization complete')), true)
  assert.equal(openedUrls[0], 'https://id.undefineds.co/.oidc/auth?client_id=test')
  const renderedText = rendered.map((child) => child.text ?? child.render?.(100)?.join('\n') ?? '').join('\n')
  assert.match(renderedText, /LinX Cloud authorization/)
})

test('linx interactive branding normalizes misclassified cloud completion Pod timeout in showError', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const errors = []
  const interactive = {
    showError(message) {
      errors.push(message)
    },
    updateTerminalTitle() {},
    ui: {
      requestRender() {},
    },
  }

  module.applyLinxInteractiveBranding(interactive)
  interactive.showError('Retry failed after 3 attempts: LinX Pod request timed out after 30s: POST https://api.undefineds.co/v1/chat/completions')
  interactive.showError('LinX Pod request timed out after 30s: POST https://id.undefineds.co/gcloud/.data/chat/index.ttl')

  assert.deepEqual(errors, [
    'LinX Cloud is temporarily unavailable. Request exceeded 30s. Please retry shortly.',
    'LinX Pod request timed out after 30s: POST https://id.undefineds.co/gcloud/.data/chat/index.ttl',
  ])
})

test('linx interactive branding normalizes misclassified cloud completion Pod timeout in session events', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const handledEvents = []
  const interactive = {
    async handleEvent(event) {
      handledEvents.push(event)
    },
    updateTerminalTitle() {},
    ui: {
      requestRender() {},
    },
  }

  module.applyLinxInteractiveBranding(interactive)
  await interactive.handleEvent({
    type: 'error',
    message: {
      role: 'assistant',
      stopReason: 'error',
      errorMessage: 'Retry failed after 3 attempts: LinX Pod request timed out after 30s: POST https://api.undefineds.co/v1/chat/completions',
    },
  })

  assert.equal(handledEvents.length, 1)
  assert.equal(handledEvents[0].message.errorMessage, 'LinX Cloud is temporarily unavailable. Request exceeded 30s. Please retry shortly.')
})

test('linx auth refresh clears the startup re-prompt flag after browser login succeeds', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const interactive = {
    runtimeHost: {
      linxAuthBridge: {
        shouldPromptLoginOnStart: true,
      },
    },
    session: {
      modelRegistry: {
        refresh() {},
        authStorage: {
          get() {
            return { type: 'oauth', access: 'fresh-access-token', refresh: 'refresh', expires: Date.now() + 60_000 }
          },
          setRuntimeApiKey() {},
        },
      },
    },
    ui: {
      requestRender() {},
    },
    async updateAvailableProviderCount() {},
  }

  await module.__testRefreshLinxAuthState(interactive)

  assert.equal(interactive.runtimeHost.linxAuthBridge.shouldPromptLoginOnStart, false)
})

test('linx auth-expired login prompt defers update notifications while reauth is pending', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const selectorCalls = []
  const loginCalls = []
  const statuses = []
  let finishLogin
  const loginFinished = new Promise((resolve) => {
    finishLogin = resolve
  })
  const interactive = {
    session: {
      modelRegistry: {
        refresh() {},
        authStorage: {
          async login(providerId) {
            loginCalls.push(providerId)
            await loginFinished
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
      return title.includes('update available') ? 'Later' : 'Authorize in browser'
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
  interactive.showError('LinX Cloud login expired.')
  interactive.showNewVersionNotification({ version: '0.9.9' })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(selectorCalls.length, 1)
  assert.match(selectorCalls[0].title, /LinX Cloud login expired/)
  assert.doesNotMatch(selectorCalls[0].title, /LinX update available/)
  assert.deepEqual(loginCalls, ['undefineds'])
  assert.equal(statuses.some((message) => String(message).includes('Installing LinX')), false)

  finishLogin()
  await new Promise((resolve) => setImmediate(resolve))
})

test('linx auth recovery does not reschedule login when the login attempt itself fails', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const selectorCalls = []
  const errors = []
  const statuses = []
  const interactive = {
    session: {
      modelRegistry: {
        authStorage: {
          async login() {
            throw new Error('LinX Cloud login expired.')
          },
        },
      },
    },
    ui: {
      requestRender() {},
    },
    async showExtensionSelector(title, options) {
      selectorCalls.push({ title, options })
      return 'Authorize in browser'
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      errors.push(message)
    },
    async updateAvailableProviderCount() {},
  }

  module.applyLinxInteractiveBranding(interactive)
  interactive.showError('LinX Cloud login expired.')
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(selectorCalls.length, 1)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /LinX Cloud login failed: LinX Cloud login expired/)
  assert.equal(statuses.filter((message) => String(message).includes('Choose a sign-in method below')).length, 1)
})

test('linx auth recovery preserves pending retry when auth expired reaches showError', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const selectorCalls = []
  const statuses = []
  const branches = []
  const activeMessages = []
  let continued = false
  const interactive = {
    session: {
      agent: {
        state: {
          messages: [
            { role: 'user', content: [{ type: 'text', text: '你好' }] },
            { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'LinX Cloud login expired.' },
          ],
        },
        async waitForIdle() {},
        continue() {
          continued = true
        },
      },
      sessionManager: {
        getLeafId() {
          return 'assistant-error'
        },
        getEntry(id) {
          if (id === 'assistant-error') {
            return {
              id,
              type: 'message',
              parentId: 'user-1',
              message: {
                role: 'assistant',
                content: [],
                stopReason: 'error',
                errorMessage: 'LinX Cloud login expired.',
              },
            }
          }
          if (id === 'user-1') {
            return {
              id,
              type: 'message',
              parentId: null,
              message: { role: 'user', content: [{ type: 'text', text: '你好' }] },
            }
          }
          return undefined
        },
        getBranch() {
          return [
            {
              id: 'user-1',
              type: 'message',
              parentId: null,
              message: { role: 'user', content: [{ type: 'text', text: '你好' }] },
            },
            {
              id: 'assistant-error',
              type: 'message',
              parentId: 'user-1',
              message: {
                role: 'assistant',
                content: [],
                stopReason: 'error',
                errorMessage: 'LinX Cloud login expired.',
              },
            },
          ]
        },
        branch(id) {
          branches.push(id)
        },
        buildSessionContext() {
          activeMessages.push('rebuilt')
          return { messages: [{ role: 'user', content: [{ type: 'text', text: '你好' }] }] }
        },
      },
      modelRegistry: {
        refresh() {},
        authStorage: {
          async login(providerId, callbacks) {
            callbacks.onAuth({ url: 'https://id.undefineds.co/.oidc/auth?client_id=test' })
          },
          get() {
            return { type: 'oauth', access: 'fresh-access-token', refresh: 'refresh', expires: Date.now() + 60_000 }
          },
          setRuntimeApiKey() {},
        },
      },
    },
    chatContainer: {
      addChild() {},
      removeChild() {},
    },
    footer: {
      invalidate() {},
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
  interactive.showError('LinX Cloud login expired.')
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(selectorCalls.length, 1)
  assert.match(selectorCalls[0].title, /LinX Cloud login expired/)
  assert.deepEqual(branches, ['user-1', 'user-1'])
  assert.deepEqual(interactive.session.agent.state.messages, [{ role: 'user', content: [{ type: 'text', text: '你好' }] }])
  assert.equal(activeMessages.length, 2)
  assert.equal(continued, true)
  assert.equal(statuses.some((message) => String(message).includes('Retrying your message')), true)
})

test('linx interactive branding reacts to assistant stream auth-expired events', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const loginCalls = []
  const loginForceFreshValues = []
  const selectorCalls = []
  const events = []
  const statuses = []
  const branches = []
  const activeMessages = []
  let continued = false
  const interactive = {
    async handleEvent(event) {
      events.push(event)
      return 'handled'
    },
    session: {
      agent: {
        state: {
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'hello' }] },
            { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'LinX Cloud login expired.' },
          ],
        },
        async waitForIdle() {},
        continue() {
          continued = true
        },
      },
      sessionManager: {
        getLeafId() {
          return 'assistant-error'
        },
        getEntry(id) {
          if (id === 'assistant-error') {
            return {
              id,
              type: 'message',
              parentId: 'user-1',
              message: {
                role: 'assistant',
                content: [],
                stopReason: 'error',
                errorMessage: 'LinX Cloud login expired.',
              },
            }
          }
          if (id === 'user-1') {
            return {
              id,
              type: 'message',
              parentId: null,
              message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
            }
          }
          return undefined
        },
        getBranch() {
          return [
            {
              id: 'user-1',
              type: 'message',
              parentId: null,
              message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
            },
            {
              id: 'assistant-error',
              type: 'message',
              parentId: 'user-1',
              message: {
                role: 'assistant',
                content: [],
                stopReason: 'error',
                errorMessage: 'LinX Cloud login expired.',
              },
            },
          ]
        },
        branch(id) {
          branches.push(id)
        },
        buildSessionContext() {
          activeMessages.push('rebuilt')
          return { messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] }
        },
      },
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
    showStatus(message) {
      statuses.push(message)
    },
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

  assert.equal(result, undefined)
  assert.equal(events.length, 0)
  assert.equal(selectorCalls.length, 1)
  assert.match(selectorCalls[0].title, /LinX Cloud login expired/)
  assert.equal(loginCalls[0], 'undefineds')
  assert.equal(loginCalls[1], `undefineds:${LINX_RUNTIME_MANAGED_AUTH_KEY}`)
  assert.equal(loginCalls.includes('undefineds:fresh-access-token'), false)
  assert.deepEqual(loginForceFreshValues, [true])
  assert.deepEqual(branches, ['user-1', 'user-1'])
  assert.deepEqual(interactive.session.agent.state.messages, [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }])
  assert.equal(activeMessages.length, 2)
  assert.equal(continued, true)
  assert.equal(statuses.some((message) => message.includes('Retrying your message')), true)
})

test('linx interactive branding surfaces auth-expired recovery for top-level stream errors', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const statuses = []
  const selectorCalls = []
  const branches = []
  const interactive = {
    async handleEvent(event) {
      throw new Error(`original handler should not render auth error: ${event.type}`)
    },
    session: {
      agent: {
        state: {
          messages: [
            { role: 'user', content: [{ type: 'text', text: '你好' }] },
            { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'LinX Cloud login expired.' },
          ],
        },
      },
      sessionManager: {
        getLeafId() {
          return 'assistant-error'
        },
        getEntry(id) {
          if (id === 'assistant-error') {
            return {
              id,
              type: 'message',
              parentId: 'user-1',
              message: { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'LinX Cloud login expired.' },
            }
          }
          if (id === 'user-1') {
            return {
              id,
              type: 'message',
              parentId: null,
              message: { role: 'user', content: [{ type: 'text', text: '你好' }] },
            }
          }
          return undefined
        },
        getBranch() {
          return [
            {
              id: 'user-1',
              type: 'message',
              parentId: null,
              message: { role: 'user', content: [{ type: 'text', text: '你好' }] },
            },
            {
              id: 'assistant-error',
              type: 'message',
              parentId: 'user-1',
              message: { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'LinX Cloud login expired.' },
            },
          ]
        },
        branch(id) {
          branches.push(id)
        },
        buildSessionContext() {
          return { messages: [{ role: 'user', content: [{ type: 'text', text: '你好' }] }] }
        },
      },
      modelRegistry: {
        authStorage: {},
      },
    },
    chatContainer: {
      removeChild() {},
    },
    footer: {
      invalidate() {},
    },
    ui: {
      requestRender() {},
    },
    async showExtensionSelector(title, options) {
      selectorCalls.push({ title, options })
      return undefined
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
  }

  module.applyLinxInteractiveBranding(interactive)
  await interactive.handleEvent({
    type: 'error',
    errorMessage: 'LinX Cloud login expired.',
  })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(selectorCalls.length, 1)
  assert.match(selectorCalls[0].title, /LinX Cloud login expired/)
  assert.equal(statuses.some((message) => String(message).includes('Your message reached LinX')), true)
  assert.deepEqual(branches, ['user-1'])
  assert.deepEqual(interactive.session.agent.state.messages, [{ role: 'user', content: [{ type: 'text', text: '你好' }] }])
})

test('linx auth-expired branch restore still runs when reauth is cancelled', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/branding.ts')
  t.after(() => cleanup())

  const branches = []
  const selectorCalls = []
  const interactive = {
    async handleEvent(event) {
      throw new Error(`original handler should not render auth error: ${event.type}`)
    },
    session: {
      agent: {
        state: {
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'hello' }] },
            { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'LinX Cloud login expired.' },
          ],
        },
      },
      sessionManager: {
        getLeafId() {
          return 'assistant-error'
        },
        getBranch() {
          return [
            {
              id: 'user-1',
              type: 'message',
              parentId: null,
              message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
            },
            {
              id: 'assistant-error',
              type: 'message',
              parentId: 'user-1',
              message: { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'LinX Cloud login expired.' },
            },
          ]
        },
        getEntry() {
          return undefined
        },
        branch(id) {
          branches.push(id)
        },
        buildSessionContext() {
          return { messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] }
        },
      },
      modelRegistry: {
        authStorage: {},
      },
    },
    chatContainer: {
      removeChild() {},
    },
    footer: {
      invalidate() {},
    },
    ui: {
      requestRender() {},
    },
    async showExtensionSelector(title) {
      selectorCalls.push(title)
      return undefined
    },
    showStatus() {},
    showError(message) {
      throw new Error(message)
    },
  }

  module.applyLinxInteractiveBranding(interactive)
  await interactive.handleEvent({
    type: 'message_end',
    message: { errorMessage: 'LinX Cloud login expired.' },
  })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(selectorCalls.length, 1)
  assert.deepEqual(branches, ['user-1'])
  assert.deepEqual(interactive.session.agent.state.messages, [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }])
})

test('linx interactive preserves Pi built-ins before backend slash routing', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const submitted = []
  const commands = []
  const statuses = []
  const editorTexts = []
  const interactive = {
    defaultEditor: {},
    podSession: {
      webId: 'https://alice.example/profile/card#me',
    },
    sessionManager: {
      getSessionId() {
        return 'session-123'
      },
    },
    editor: {
      setText(text) {
        editorTexts.push(text)
      },
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
  }

  module.installBackendCommandRouter(interactive, {
    backend: 'codex',
    async execute(input) {
      commands.push(input)
      return { handled: true, message: `backend handled ${input}` }
    },
  })
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/compact')
  await interactive.defaultEditor.onSubmit('/model gpt-5.4-mini')
  await interactive.defaultEditor.onSubmit('/new')
  await interactive.defaultEditor.onSubmit('/session')
  await interactive.defaultEditor.onSubmit('/fork')
  await interactive.defaultEditor.onSubmit('/name ship-it')
  await interactive.defaultEditor.onSubmit('/help')
  await interactive.defaultEditor.onSubmit('/commands')
  await interactive.defaultEditor.onSubmit('/models')
  await interactive.defaultEditor.onSubmit('/status')
  await interactive.defaultEditor.onSubmit('/rollback 2')

  assert.deepEqual(commands, ['/commands', '/models', '/status', '/rollback 2'])
  assert.deepEqual(submitted, ['/compact', '/model gpt-5.4-mini', '/new', '/session', '/fork', '/name ship-it', '/help'])
  assert.deepEqual(editorTexts, ['', '', '', ''])
  assert.deepEqual(statuses, [
    'backend handled /commands',
    'backend handled /models',
    'backend handled /status',
    'backend handled /rollback 2',
  ])
})

test('linx interactive keeps global slash commands and unknown backend commands on the Pi path', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const submitted = []
  const commands = []
  const interactive = {
    defaultEditor: {},
    editor: {
      setText() {
        throw new Error('unknown/global commands should not clear input in the backend router')
      },
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
  }

  module.installBackendCommandRouter(interactive, {
    backend: 'codex',
    async execute(input) {
      commands.push(input)
      return { handled: false }
    },
  })
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/login')
  await interactive.defaultEditor.onSubmit('/hotkeys')
  await interactive.defaultEditor.onSubmit('/auto')
  await interactive.defaultEditor.onSubmit('/symphony')
  await interactive.defaultEditor.onSubmit('/manual')
  await interactive.defaultEditor.onSubmit('/smart')
  await interactive.defaultEditor.onSubmit('/unknown')
  await interactive.defaultEditor.onSubmit('hello')

  assert.deepEqual(commands, [])
  assert.deepEqual(submitted, ['/login', '/hotkeys', '/auto', '/symphony', '/manual', '/smart', '/unknown', 'hello'])
})

test('linx interactive handles /auto before backend fallback', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const businessSessionManager = SessionManager.inMemory('/tmp/demo')
  const submitted = []
  const commands = []
  const autoValues = []
  const controlChanges = []
  const statuses = []
  const editorTexts = []
  const prompts = []
  const customMessages = []
  const interactive = {
    defaultEditor: {},
    sessionManager: businessSessionManager,
    session: {
      isStreaming: false,
      async sendCustomMessage(message, options) {
        customMessages.push({ message, options })
      },
      async prompt(text, options) {
        prompts.push({ text, options })
      },
      async steer() {
        throw new Error('/auto must not steer the active business session')
      },
      async followUp() {
        throw new Error('/auto must not queue a follow-up in the active business session')
      },
      async sendUserMessage() {
        throw new Error('/auto must not send a user message to the active business session')
      },
      agent: {
        async continue() {
          throw new Error('/auto must not continue the active business session')
        },
      },
    },
    editor: {
      setText(text) {
        editorTexts.push(text)
      },
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
  }
  const runtime = {
    backendCommandRouter: {
      backend: 'codex',
      async execute(input) {
        commands.push(input)
        return { handled: false }
      },
      setAutoEnabled(enabled) {
        autoValues.push(enabled)
      },
    },
  }

  module.installLinxGlobalCommands(interactive, runtime, '/tmp/demo', {
    onAutoControlChange(enabled) {
      controlChanges.push(enabled)
    },
  })
  module.installBackendCommandRouter(interactive, runtime.backendCommandRouter)
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/auto')
  await interactive.defaultEditor.onSubmit('/auto on')
  await interactive.defaultEditor.onSubmit('/auto off')

  assert.deepEqual(commands, [])
  assert.deepEqual(submitted, [])
  assert.deepEqual(autoValues, [])
  assert.deepEqual(controlChanges, [true, false])
  assert.deepEqual(editorTexts, ['', '', ''])
  assert.equal(prompts.length, 0)
  assert.equal(customMessages.length, 0)
  const snapshot = interactive.__sessionControlManager.getSnapshot()
  assert.equal(snapshot.autoEnabled, false)
  assert.equal(snapshot.businessSession.id, businessSessionManager.getSessionId())
  assert.notEqual(snapshot.controlSession.id, businessSessionManager.getSessionId())
  assert.match(statuses[0], /Auto is off/)
  assert.match(statuses[0], /What changed: backend prompts, approvals, and free-form input return to the local TUI/)
  assert.match(statuses[1], /Auto on: Secretary drives the current session input loop/)
  assert.match(statuses[1], /What changed: backend prompts and blocked approval\/input requests go to Secretary first/)
  assert.match(statuses[1], /Ctrl\+C or \/auto off hands control back to you/)
  assert.match(statuses[1], /Backend approval policy is unchanged/)
  assert.match(statuses[2], /Auto off: you drive the current session directly/)
  assert.match(statuses[2], /Auto only controls input ownership; it does not change whether the current chat peer is Secretary or worker\/backend/)
})


test('auto editor indicator shell module decorates the active input bar', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-auto-editor-indicator.ts')
  t.after(() => cleanup())

  const { visibleWidth } = await import('@earendil-works/pi-tui')
  const interactive = {
    __autoEnabled: true,
    defaultEditor: {
      render(width) {
        return [
          '─'.repeat(width),
          ' '.repeat(width),
        ]
      },
    },
  }

  module.installLinxAutoEditorIndicator(interactive)
  const rendered = interactive.defaultEditor.render(40)

  assert.match(rendered.join('\n'), /托管中/)
  assert.equal(rendered.every((line) => visibleWidth(line) <= 40), true)
})

test('linx interactive shows delegated input bar while auto is on', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { visibleWidth } = await import('@earendil-works/pi-tui')

  const renderCalls = []
  const interactive = {
    __autoEnabled: false,
    defaultEditor: {
      render(width) {
        renderCalls.push(width)
        return [
          '─'.repeat(width),
          ' '.repeat(width),
          '─'.repeat(width),
        ]
      },
    },
  }

  module.installLinxAutoEditorIndicator(interactive)
  module.installLinxAutoEditorIndicator(interactive)

  const normal = interactive.defaultEditor.render(60)
  assert.equal(normal[0], '─'.repeat(60))
  assert.equal(renderCalls.length, 1)

  interactive.__autoEnabled = true
  const delegated = interactive.defaultEditor.render(60)
  const delegatedText = delegated.join('\n')
  assert.match(delegatedText, /托管中/)
  assert.match(delegatedText, /Secretary 自动输入/)
  assert.match(delegatedText, /Ctrl\+C 接管/)
  assert.match(delegatedText, /\/auto off/)
  assert.equal(delegated.every((line) => visibleWidth(line) <= 60), true)

  interactive.__autoEnabled = false
  const restored = interactive.defaultEditor.render(60)
  assert.equal(restored[0], '─'.repeat(60))
  assert.equal(renderCalls.length, 3)
})

test('linx interactive records normal user input through Thread Reconciler before Pi projection', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const businessSessionManager = SessionManager.inMemory('/tmp/demo')
  const controlManagers = []
  const submitted = []
  const interactive = {
    __autoEnabled: false,
    defaultEditor: {},
    sessionManager: businessSessionManager,
    editor: {
      setText() {
        throw new Error('normal user input should not be treated as a command')
      },
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showWarning(message) {
      throw new Error(message)
    },
  }
  const runtime = {
    cwd: '/tmp/demo',
    sessionControl: {
      createControlSession({ cwd }) {
        const manager = SessionManager.inMemory(cwd)
        controlManagers.push(manager)
        return manager
      },
    },
  }

  module.installLinxGlobalCommands(interactive, runtime, '/tmp/demo')
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('hello backend')

  assert.deepEqual(submitted, ['hello backend'])
  assert.equal(controlManagers.length, 1)
  const appended = controlManagers[0].getEntries().find((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'thread.message.appended'
  ))
  assert.ok(appended)
  assert.equal(appended.data?.data?.source, 'user')
  assert.equal(appended.data?.data?.content, 'hello backend')
  assert.deepEqual(appended.data?.data?.actor, { id: 'current-user', role: 'user' })
  assert.equal(Object.hasOwn(appended.data?.data ?? {}, 'runtimeProjectionHint'), false)
  assert.equal(Object.hasOwn(appended.data?.data ?? {}, 'projectedRole'), false)
  assert.equal(appended.data?.data?.reconciler?.policyKind, 'direct')
  assert.equal(appended.data?.data?.reconciler?.eventType, 'message.appended')
  assert.equal(appended.data?.data?.reconciler?.wakeJobs?.[0]?.targetRole, 'primary-agent')
})

test('linx interactive /auto on creates a control session without projecting a business turn', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const businessSessionManager = SessionManager.inMemory('/tmp/demo')
  const businessEntryCount = businessSessionManager.getEntries().length
  const controlManagers = []
  const prompts = []
  const customMessages = []
  const interactive = {
    defaultEditor: {},
    sessionManager: businessSessionManager,
    session: {
      isStreaming: false,
      async sendCustomMessage(message, options) {
        customMessages.push({ message, options })
      },
      async prompt(text, options) {
        prompts.push({ text, options })
      },
      async steer() {
        throw new Error('/auto must not steer the active chat')
      },
      async followUp() {
        throw new Error('/auto must not queue an active-chat follow-up')
      },
      async sendUserMessage() {
        throw new Error('/auto must not create a user message')
      },
      agent: {
        async continue() {
          throw new Error('/auto must not continue the active chat')
        },
      },
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {}
    },
    showStatus() {},
  }
  const runtime = {
    sessionControl: {
      createControlSession({ cwd, businessSession }) {
        assert.equal(cwd, '/tmp/demo')
        assert.equal(businessSession.id, businessSessionManager.getSessionId())
        const manager = SessionManager.inMemory(cwd)
        controlManagers.push(manager)
        return manager
      },
    },
    backendCommandRouter: {
      backend: 'codex',
      async execute(input) {
        throw new Error(`/auto must not route to backend command handler: ${input}`)
      },
      setAutoEnabled() {
        throw new Error('/auto must not mutate backend-native auto state directly')
      },
    },
  }

  module.installLinxGlobalCommands(interactive, runtime, '/tmp/demo')
  module.installBackendCommandRouter(interactive, runtime.backendCommandRouter)
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/auto on')

  assert.equal(businessSessionManager.getEntries().length, businessEntryCount)
  assert.equal(prompts.length, 0)
  assert.equal(customMessages.length, 0)
  assert.equal(controlManagers.length, 1)
  assert.equal(controlManagers[0].getEntries().some((entry) => entry.type === 'message'), false)
  assert.equal(controlManagers[0].getEntries().some((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'auto.state.changed'
  )), true)
  const snapshot = interactive.__sessionControlManager.getSnapshot()
  assert.equal(snapshot.autoEnabled, true)
  assert.equal(snapshot.businessSession.id, businessSessionManager.getSessionId())
  assert.equal(snapshot.controlSession.id, controlManagers[0].getSessionId())
})

test('linx interactive /auto with startup input enables auto and submits the input as Secretary projection', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const businessSessionManager = SessionManager.inMemory('/tmp/demo')
  businessSessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: '一鸣惊人 -> 接「人」字！' }],
    api: 'openai-completions',
    provider: 'undefineds',
    model: 'linx-lite',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  })

  const submitted = []
  const commands = []
  const controlManagers = []
  const editorTexts = []
  let resolveNextUserInputCalls = 0
  const interactive = {
    defaultEditor: {},
    sessionManager: businessSessionManager,
    session: {
      cwd: '/tmp/demo',
      isStreaming: false,
      async sendUserMessage(text) {
        submitted.push(text)
      },
    },
    editor: {
      setText(text) {
        editorTexts.push(text)
      },
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus() {},
  }
  const runtime = {
    cwd: '/tmp/demo',
    model: 'linx-lite',
    sessionControl: {
      createControlSession({ cwd }) {
        const manager = SessionManager.inMemory(cwd)
        controlManagers.push(manager)
        return manager
      },
      resolveNextUserInput() {
        resolveNextUserInputCalls += 1
        return '人山人海'
      },
    },
    backendCommandRouter: {
      backend: 'codex',
      async execute(input) {
        commands.push(input)
        return { handled: false }
      },
    },
  }

  module.installLinxGlobalCommands(interactive, runtime, '/tmp/demo')
  module.installBackendCommandRouter(interactive, runtime.backendCommandRouter)
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/auto 我们玩成语接龙')
  await new Promise((resolve) => setTimeout(resolve, 120))

  assert.deepEqual(commands, [])
  assert.deepEqual(submitted, ['我们玩成语接龙'])
  assert.deepEqual(editorTexts, [''])
  assert.equal(interactive.__autoEnabled, true)
  assert.equal(runtime.autoEnabled, true)
  assert.equal(resolveNextUserInputCalls, 0)
  assert.equal(controlManagers.length, 1)
  const snapshot = interactive.__sessionControlManager.getSnapshot()
  assert.equal(snapshot.autoEnabled, true)
  const entries = controlManagers[0].getEntries()
  const userInput = entries.find((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'thread.message.appended'
    && entry.data?.data?.source === 'secretary-runtime-intent'
  ))
  assert.ok(userInput)
  assert.equal(userInput.data?.data?.content, '我们玩成语接龙')
  assert.equal(userInput.data?.data?.actor?.role, 'secretary')
  assert.equal(userInput.data?.data?.reconciler?.policyKind, 'auto')
  assert.equal(entries.some((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'auto.input.requested'
  )), false)
  assert.equal(entries.some((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'auto.input.delivered'
    && entry.data?.data?.data?.runtimeProjection?.source === 'secretary-runtime-intent'
  )), true)
})

test('linx interactive /auto startup input is backend-agnostic', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const backends = ['codex', 'claude', 'codebuddy']

  for (const backend of backends) {
    await t.test(backend, async () => {
      const businessSessionManager = SessionManager.inMemory('/tmp/demo')
      const submitted = []
      const commands = []
      const interactive = {
        defaultEditor: {},
        sessionManager: businessSessionManager,
        session: {
          cwd: '/tmp/demo',
          isStreaming: false,
          async sendUserMessage(text) {
            submitted.push(text)
          },
        },
        editor: {
          setText() {},
        },
        ui: {
          requestRender() {},
        },
        setupEditorSubmitHandler() {
          this.defaultEditor.onSubmit = async (text) => {
            submitted.push(text)
          }
        },
        showStatus() {},
      }
      const runtime = {
        cwd: '/tmp/demo',
        backendCommandRouter: {
          backend,
          async execute(input) {
            commands.push(input)
            return { handled: false }
          },
        },
      }

      module.installLinxGlobalCommands(interactive, runtime, '/tmp/demo')
      module.installBackendCommandRouter(interactive, runtime.backendCommandRouter)
      interactive.setupEditorSubmitHandler()

      await interactive.defaultEditor.onSubmit(`/auto start ${backend}`)

      assert.deepEqual(commands, [])
      assert.deepEqual(submitted, [`start ${backend}`])
      assert.equal(interactive.__autoEnabled, true)
      assert.equal(runtime.autoEnabled, true)
      const snapshot = interactive.__sessionControlManager.getSnapshot()
      assert.equal(snapshot.autoEnabled, true)
      assert.equal(snapshot.businessSession.id, businessSessionManager.getSessionId())
    })
  }
})

test('linx interactive /auto can let Secretary send a /goal command to the current chat peer', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const businessSessionManager = SessionManager.inMemory('/tmp/demo')
  const submitted = []
  const commands = []
  const statuses = []
  const interactive = {
    defaultEditor: {},
    sessionManager: businessSessionManager,
    session: {
      cwd: '/tmp/demo',
      isStreaming: false,
      async sendUserMessage(text) {
        submitted.push(text)
      },
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
  }
  const runtime = {
    cwd: '/tmp/demo',
    backendCommandRouter: {
      backend: 'codex',
      async execute(input) {
        commands.push(input)
        return { handled: false }
      },
    },
  }

  module.installLinxGlobalCommands(interactive, runtime, '/tmp/demo')
  module.installBackendCommandRouter(interactive, runtime.backendCommandRouter)
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/auto /goal ship the login fix')

  assert.deepEqual(commands, [])
  assert.deepEqual(submitted, ['/goal ship the login fix'])
  assert.equal(interactive.__autoEnabled, true)
  assert.equal(runtime.autoEnabled, true)
  assert.equal(module.isLinxInteractiveGoalModeEnabled(interactive, runtime), true)
  assert.equal(runtime.goalMode, true)
  assert.match(statuses.join('\n'), /Peer command routed; Secretary goal supervision mirror is active/)
  const entries = interactive.__sessionControlManager.controlSessionManager.getEntries()
  assert.equal(entries.some((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'thread.message.appended'
    && entry.data?.data?.source === 'secretary-runtime-intent'
    && entry.data?.data?.content === '/goal ship the login fix'
  )), true)
  assert.equal(entries.some((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'auto.input.delivered'
    && entry.data?.data?.data?.runtimeProjection?.targetRole === 'peer-command'
  )), true)
})

test('linx interactive /auto projected command treats /auto as Secretary control only', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const businessSessionManager = SessionManager.inMemory('/tmp/demo')
  const submitted = []
  const statuses = []
  const interactive = {
    defaultEditor: {},
    sessionManager: businessSessionManager,
    session: {
      cwd: '/tmp/demo',
      isStreaming: false,
      async sendUserMessage(text) {
        submitted.push(text)
      },
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
  }
  const runtime = {
    cwd: '/tmp/demo',
  }

  module.installLinxGlobalCommands(interactive, runtime, '/tmp/demo')
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/auto /auto off')

  assert.deepEqual(submitted, [])
  assert.equal(interactive.__autoEnabled, false)
  assert.equal(runtime.autoEnabled, false)
  assert.match(statuses.join('\n'), /Auto off: you drive the current session directly/)
  const entries = interactive.__sessionControlManager.controlSessionManager.getEntries()
  assert.equal(entries.some((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'thread.message.appended'
    && entry.data?.data?.source === 'secretary-runtime-intent'
    && entry.data?.data?.content === '/auto off'
  )), true)
  assert.equal(entries.some((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'auto.input.delivered'
    && entry.data?.data?.data?.runtimeProjection?.targetRole === 'control-command'
  )), true)
})

test('linx interactive goal mode does not let agent_end trigger per-message Secretary replies', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const businessSessionManager = SessionManager.inMemory('/tmp/demo')
  businessSessionManager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'ship the login fix' }],
    timestamp: Date.now(),
  })
  businessSessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'I am editing the login flow now.' }],
    api: 'openai-completions',
    provider: 'undefineds',
    model: 'linx-lite',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  })

  const sentUserMessages = []
  let subscriber = null
  let resolveNextUserInputCalls = 0
  const interactive = {
    defaultEditor: {},
    sessionManager: businessSessionManager,
    session: {
      cwd: '/tmp/demo',
      isStreaming: false,
      subscribe(callback) {
        subscriber = callback
        return () => {
          subscriber = null
        }
      },
      async sendUserMessage(text, options) {
        sentUserMessages.push({ text, options })
      },
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {}
    },
    showStatus() {},
  }
  const runtime = {
    cwd: '/tmp/demo',
    resolveNextUserInput() {
      resolveNextUserInputCalls += 1
      return 'do not send this immediately'
    },
  }

  module.installLinxGlobalCommands(interactive, runtime, '/tmp/demo')
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/auto /goal ship the login fix')
  assert.equal(typeof subscriber, 'function')
  subscriber({ type: 'agent_end' })
  await new Promise((resolve) => setTimeout(resolve, 120))

  assert.deepEqual(sentUserMessages, [{ text: '/goal ship the login fix', options: undefined }])
  assert.equal(resolveNextUserInputCalls, 0)
  assert.equal(module.isLinxInteractiveGoalModeEnabled(interactive, runtime), true)
  assert.equal(runtime.goalMode, true)
})

test('linx interactive goal supervision can skip when Secretary has no useful steer', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const businessSessionManager = SessionManager.inMemory('/tmp/demo')
  businessSessionManager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'ship the login fix' }],
    timestamp: Date.now(),
  })
  businessSessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'Tests are still running.' }],
    api: 'openai-completions',
    provider: 'undefineds',
    model: 'linx-lite',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  })

  const sentUserMessages = []
  const controlManagers = []
  const interactive = {
    defaultEditor: {},
    sessionManager: businessSessionManager,
    session: {
      cwd: '/tmp/demo',
      isStreaming: false,
      async sendUserMessage(text, options) {
        sentUserMessages.push({ text, options })
      },
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {}
    },
    showStatus() {},
  }
  const runtime = {
    cwd: '/tmp/demo',
    goalModeSupervisorIntervalMs: 10,
    sessionControl: {
      createControlSession({ cwd }) {
        const manager = SessionManager.inMemory(cwd)
        controlManagers.push(manager)
        return manager
      },
    },
    resolveNextUserInput(context) {
      assert.equal(context.goalMode, true)
      return ''
    },
  }

  module.installLinxGlobalCommands(interactive, runtime, '/tmp/demo')
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/auto /goal ship the login fix')
  interactive.__linxAutoInputController.schedule('runtime-idle')
  await new Promise((resolve) => setTimeout(resolve, 120))

  assert.deepEqual(sentUserMessages, [{ text: '/goal ship the login fix', options: undefined }])
  const skipped = controlManagers[0].getEntries().find((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'auto.input.skipped'
  ))
  assert.ok(skipped)
  assert.match(skipped.data?.data?.data?.message, /no Secretary intervention needed/)
})

test('linx interactive /auto on projects Secretary output through user input after assistant messages', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const businessSessionManager = SessionManager.inMemory('/tmp/demo')
  businessSessionManager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: '我们玩成语接龙' }],
    timestamp: Date.now(),
  })
  businessSessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: '一字千金 -> 接「金」字！' }],
    api: 'openai-completions',
    provider: 'undefineds',
    model: 'linx-lite',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  })

  const sentUserMessages = []
  const prompts = []
  const customMessages = []
  const controlManagers = []
  const interactive = {
    defaultEditor: {},
    sessionManager: businessSessionManager,
    session: {
      cwd: '/tmp/demo',
      isStreaming: false,
      async sendCustomMessage(message, options) {
        customMessages.push({ message, options })
      },
      async prompt(text, options) {
        prompts.push({ text, options })
      },
      async steer() {
        throw new Error('/auto must not steer the active chat')
      },
      async followUp() {
        throw new Error('/auto must not queue an active-chat follow-up')
      },
      async sendUserMessage(text, options) {
        sentUserMessages.push({ text, options })
      },
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {}
    },
    showStatus() {},
  }
  const runtime = {
    cwd: '/tmp/demo',
    model: 'linx-lite',
    sessionControl: {
      createControlSession({ cwd }) {
        const manager = SessionManager.inMemory(cwd)
        controlManagers.push(manager)
        return manager
      },
    },
    resolveNextUserInput(context) {
      assert.equal(context.recentMessages.at(-1).role, 'assistant')
      assert.match(context.recentMessages.at(-1).text, /一字千金/)
      return '金玉满堂'
    },
  }

  module.installLinxGlobalCommands(interactive, runtime, '/tmp/demo')
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/auto on')
  await new Promise((resolve) => setTimeout(resolve, 120))

  assert.deepEqual(sentUserMessages, [{ text: '金玉满堂', options: undefined }])
  assert.equal(prompts.length, 0)
  assert.equal(customMessages.length, 0)
  assert.equal(controlManagers.length, 1)
  const controlEntries = controlManagers[0].getEntries()
  const requestedEntry = controlEntries.find((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'auto.input.requested'
  ))
  assert.ok(requestedEntry)
  assert.equal(requestedEntry.data?.data?.data?.reconciler?.policyKind, 'auto')
  assert.equal(requestedEntry.data?.data?.data?.reconciler?.wakeJobs?.[0]?.targetAgent, '__secretary__')
  assert.equal(requestedEntry.data?.data?.data?.scheduler?.wakeRecords?.[0]?.status, 'queued')
  const deliveredEntry = controlEntries.find((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'auto.input.delivered'
  ))
  assert.ok(deliveredEntry)
  const runtimeIntentEntry = controlEntries.find((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'thread.message.appended'
    && entry.data?.data?.source === 'secretary-runtime-intent'
  ))
  assert.ok(runtimeIntentEntry)
  assert.deepEqual(runtimeIntentEntry.data?.data?.actor, { id: '__secretary__', role: 'secretary' })
  assert.equal(Object.hasOwn(runtimeIntentEntry.data?.data ?? {}, 'runtimeProjectionHint'), false)
  assert.equal(Object.hasOwn(runtimeIntentEntry.data?.data ?? {}, 'projectedRole'), false)
  assert.equal(runtimeIntentEntry.data?.data?.reconciler?.policyKind, 'auto')
  assert.equal(runtimeIntentEntry.data?.data?.reconciler?.wakeJobs?.length, 0)
  assert.deepEqual(deliveredEntry.data?.data?.data?.runtimeProjection, {
    targetRole: 'user',
    source: 'secretary-runtime-intent',
    controlDecision: runtimeIntentEntry.data?.data?.reconciler,
  })
  assert.equal(deliveredEntry.data?.data?.data?.scheduler?.completed?.[0]?.status, 'completed')
})

test('linx interactive /auto on retries empty Secretary projection when backend asks for a game turn', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const businessSessionManager = SessionManager.inMemory('/tmp/demo')
  businessSessionManager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: '戢鳞潜翼' }],
    timestamp: Date.now(),
  })
  businessSessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: '翼字太难接，我被卡住了。有招吗？' }],
    api: 'openai-completions',
    provider: 'undefineds',
    model: 'linx-lite',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  })

  const sentUserMessages = []
  const controlManagers = []
  let calls = 0
  const interactive = {
    defaultEditor: {},
    sessionManager: businessSessionManager,
    session: {
      cwd: '/tmp/demo',
      isStreaming: false,
      async sendUserMessage(text, options) {
        sentUserMessages.push({ text, options })
      },
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {}
    },
    showStatus() {},
  }
  const runtime = {
    cwd: '/tmp/demo',
    model: 'linx-lite',
    sessionControl: {
      createControlSession({ cwd }) {
        const manager = SessionManager.inMemory(cwd)
        controlManagers.push(manager)
        return manager
      },
    },
    resolveNextUserInput(context) {
      calls += 1
      assert.equal(context.recentMessages.at(-1).role, 'assistant')
      assert.match(context.recentMessages.at(-1).text, /有招吗/)
      return calls === 1 ? '' : '翼翼小心'
    },
  }

  module.installLinxGlobalCommands(interactive, runtime, '/tmp/demo')
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/auto on')
  await new Promise((resolve) => setTimeout(resolve, 120))

  assert.equal(calls, 2)
  assert.deepEqual(sentUserMessages, [{ text: '翼翼小心', options: undefined }])
  const delivered = controlManagers[0].getEntries().find((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'auto.input.delivered'
  ))
  assert.equal(delivered?.data?.data?.data?.attempts, 2)
  assert.equal(delivered?.data?.data?.data?.scheduler?.completed?.[0]?.status, 'completed')
})

test('linx interactive /auto off cancels pending Secretary user input projection', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const businessSessionManager = SessionManager.inMemory('/tmp/demo')
  businessSessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: '一鸣惊人 -> 接「人」字！' }],
    api: 'openai-completions',
    provider: 'undefineds',
    model: 'linx-lite',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  })

  const sentUserMessages = []
  const interactive = {
    defaultEditor: {},
    sessionManager: businessSessionManager,
    session: {
      cwd: '/tmp/demo',
      isStreaming: false,
      async sendUserMessage(text, options) {
        sentUserMessages.push({ text, options })
      },
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {}
    },
    showStatus() {},
  }
  const runtime = {
    cwd: '/tmp/demo',
    resolveNextUserInput() {
      return '人山人海'
    },
  }

  module.installLinxGlobalCommands(interactive, runtime, '/tmp/demo')
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/auto on')
  await interactive.defaultEditor.onSubmit('/auto off')
  await new Promise((resolve) => setTimeout(resolve, 120))

  assert.deepEqual(sentUserMessages, [])
  assert.equal(interactive.__autoEnabled, false)
  assert.equal(runtime.autoEnabled, false)
})

test('linx interactive /auto on only updates control state while streaming', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const businessSessionManager = SessionManager.inMemory('/tmp/demo')
  const prompts = []
  const customMessages = []
  let pendingRefreshes = 0
  const interactive = {
    defaultEditor: {},
    sessionManager: businessSessionManager,
    session: {
      isStreaming: true,
      async sendCustomMessage(message, options) {
        customMessages.push({ message, options })
      },
      async prompt(text, options) {
        prompts.push({ text, options })
      },
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {}
    },
    updatePendingMessagesDisplay() {
      pendingRefreshes += 1
    },
    showStatus() {},
  }

  module.installLinxGlobalCommands(interactive, {}, '/tmp/demo')
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/auto on')

  assert.equal(prompts.length, 0)
  assert.equal(customMessages.length, 0)
  assert.equal(pendingRefreshes, 0)
  const controlEntries = interactive.__sessionControlManager
    .getSnapshot()
    .controlSession
  assert.ok(controlEntries.id)
})

test('linx session control records only blocked runtime events while auto is on', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/session-control.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const businessSessionManager = SessionManager.inMemory('/tmp/demo')
  const interactive = {
    __autoEnabled: false,
    sessionManager: businessSessionManager,
  }
  const runtime = {
    backendSessionRef: {
      id: 'runtime-session-1',
      backend: 'acp',
      cwd: '/tmp/demo',
      model: 'agent-runtime',
    },
  }
  const manager = module.getSessionControlManager(interactive, runtime, '/tmp/demo')

  assert.equal(manager.recordRuntimeEvent({
    type: 'tool.call',
    name: 'read',
    arguments: { path: 'README.md' },
  }), null)
  const manualBlocked = manager.recordRuntimeEvent({
    type: 'input.required',
    message: 'Need input?',
    request: {
      kind: 'user-input',
      message: 'Need input?',
      questions: [{
        id: 'next',
        header: 'Next',
        question: 'Next step?',
        options: [],
      }],
    },
  })
  assert.equal(manualBlocked.type, 'input.required')
  assert.equal(manualBlocked.reconciliation.policyKind, 'direct')
  assert.equal(manualBlocked.reconciliation.eventType, 'input.required')
  assert.deepEqual(manualBlocked.reconciliation.wakeJobs, [])
  assert.match(manualBlocked.reconciliation.skippedReason, /Policy direct does not wake/)

  manager.setAutoEnabled(true)
  assert.equal(manager.recordRuntimeEvent({
    type: 'tool.call',
    name: 'bash',
    arguments: { command: 'pwd' },
  }), null)

  const blocked = manager.recordRuntimeEvent({
    type: 'approval.required',
    message: 'Run command?',
    request: {
      kind: 'command-approval',
      command: 'npm test',
    },
  })

  assert.equal(blocked.type, 'approval.required')
  assert.equal(blocked.source.businessSession.id, businessSessionManager.getSessionId())
  assert.equal(blocked.source.runtime.id, 'runtime-session-1')
  assert.equal(blocked.source.runtime.backend, 'acp')
  assert.equal(blocked.reconciliation.policyKind, 'auto')
  assert.equal(blocked.reconciliation.eventType, 'approval.required')
  assert.equal(blocked.reconciliation.wakeJobs[0].targetAgent, '__secretary__')
  assert.equal(blocked.reconciliation.wakeJobs[0].targetRole, 'secretary')

  const snapshot = manager.getSnapshot()
  assert.equal(snapshot.blockedEvents.length, 2)
  assert.equal(snapshot.blockedEvents[0].message, 'Need input?')
  assert.equal(snapshot.blockedEvents[1].message, 'Run command?')
})

test('linx interactive /auto status can reflect runtime-initialized auto flag', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const statuses = []
  const interactive = {
    __autoEnabled: true,
    defaultEditor: {},
    editor: { setText() {} },
    ui: { requestRender() {} },
    showStatus(message) {
      statuses.push(message)
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {}
    },
  }

  module.installLinxGlobalCommands(interactive, { autoEnabled: true }, '/tmp/demo')
  interactive.setupEditorSubmitHandler()
  await interactive.defaultEditor.onSubmit('/auto')

  assert.match(statuses[0], /Auto is on/)
})

test('linx interactive restores auto mode visibly on resume startup', async (t) => {
  const [{ module: runtimeModule, cleanup: runtimeCleanup }, { module, cleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/runtime.ts'),
    loadAutoModeModule('lib/pi-adapter/interactive.ts'),
  ])
  t.after(() => runtimeCleanup())
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const originalCwd = process.cwd()
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-restored-auto-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-restored-auto-agent-'))
  t.after(() => {
    process.chdir(originalCwd)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const statuses = []
  const controllerStarts = []
  const adapter = runtimeModule.createPiRuntimeAdapter({
    async createRemoteCompletion() {
      return 'ok'
    },
  }, {
    cwd,
    autoEnabled: true,
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
  runtime.autoEnabled = true

  const bootstrap = module.bootstrapPiInteractiveMode(runtime, {
    restoredAuto: true,
  })
  const interactive = bootstrap.__unsafeInteractiveForTests
  const originalShowStatus = interactive.showStatus?.bind(interactive)
  interactive.showStatus = (message) => {
    statuses.push(message)
    originalShowStatus?.(message)
  }

  const controller = {
    start(options) {
      controllerStarts.push(options)
    },
    stop() {},
  }
  interactive.__linxAutoInputController = controller
  interactive.run = async () => {}

  await bootstrap.run()

  assert.equal(controllerStarts.length, 1)
  assert.deepEqual(controllerStarts[0], { scheduleImmediately: true })
  assert.match(statuses[0], /Auto restored from the previous session/)
  assert.match(statuses[0], /auto · Ctrl\+C or \/auto off to hand control back/)
  bootstrap.stop()
  await runtime.dispose()
  process.chdir(originalCwd)
})

test('linx interactive handles /cd before backend fallback and updates runtime cwd', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const originalCwd = process.cwd()
  const root = mkdtempSync(join(tmpdir(), 'linx-pi-cd-command-'))
  const next = mkdtempSync(join(root, 'workspace-'))
  const expectedCwd = realpathSync(next)
  t.after(() => {
    process.chdir(originalCwd)
    rmSync(root, { recursive: true, force: true })
  })

  const submitted = []
  const commands = []
  const cwdUpdates = []
  const statuses = []
  const interactive = {
    defaultEditor: {},
    session: {
      cwd: root,
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      throw new Error(message)
    },
  }
  const runtime = {
    cwd: root,
    backendCommandRouter: {
      backend: 'codex',
      async execute(input) {
        commands.push(input)
        return { handled: false }
      },
      setCwd(cwd) {
        cwdUpdates.push(cwd)
      },
    },
  }

  module.installLinxGlobalCommands(interactive, runtime, root)
  module.installBackendCommandRouter(interactive, runtime.backendCommandRouter)
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit(`/cd ${next}`)

  assert.deepEqual(commands, [])
  assert.deepEqual(submitted, [])
  assert.deepEqual(cwdUpdates, [next])
  assert.equal(realpathSync(runtime.cwd), expectedCwd)
  assert.equal(realpathSync(interactive.session.cwd), expectedCwd)
  assert.equal(realpathSync(process.cwd()), expectedCwd)
  assert.match(statuses[0], new RegExp(`Workspace changed to ${next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
})

test('linx interactive rejects /symphony objective and keeps routing inside LinX command layer', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const submitted = []
  const commands = []
  const prompts = []
  const statuses = []
  const editorTexts = []
  const interactive = {
    defaultEditor: {},
    podSession: {
      webId: 'https://alice.example/profile/card#me',
    },
    sessionManager: {
      getSessionId() {
        return 'session-123'
      },
    },
    editor: {
      setText(text) {
        editorTexts.push(text)
      },
    },
    session: {
      isStreaming: false,
      async prompt(text, options) {
        prompts.push({ text, options })
      },
    },
    ui: {
      requestRender() {},
    },
    showStatus(message) {
      statuses.push(message)
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
  }

  module.installSymphonyCommand(interactive)
  module.installBackendCommandRouter(interactive, {
    backend: 'codex',
    async execute(input) {
      commands.push(input)
      return { handled: true, message: `backend handled ${input}` }
    },
  })
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/symphony verify backend prompt projection')

  assert.deepEqual(commands, [])
  assert.deepEqual(submitted, [])
  assert.deepEqual(editorTexts, [''])
  assert.equal(module.isLinxInteractiveSymphonyModeEnabled(interactive), false)
  assert.equal(prompts.length, 0)
  assert.equal(statuses.length, 1)
  assert.match(statuses[0], /Unsupported \/symphony argument: verify backend prompt projection/)
  assert.match(statuses[0], /Use \/symphony on to chat with Secretary/)
  assert.match(statuses[0], /send the objective as a normal chat message to Secretary/)
})

test('linx interactive resolves /symphony source from runtime Pod session', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const statuses = []
  const interactive = {
    defaultEditor: {},
    runtime: {
      async getPodDataSession() {
        return {
          webId: 'https://alice.example/profile/card#me',
        }
      },
    },
    sessionManager: {
      getSessionId() {
        return 'session-runtime-pod'
      },
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {
        throw new Error('/symphony status should be handled in LinX command layer')
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
  }

  module.installSymphonyCommand(interactive)
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/symphony status')

  assert.equal(statuses.length, 1)
  assert.match(statuses[0], /Chat: https:\/\/alice\.example\/.data\/chat\/__secretary__\/index\.ttl#this/)
  assert.match(statuses[0], /Thread: https:\/\/alice\.example\/.data\/chat\/__secretary__\/index\.ttl#session-runtime-pod/)
})

test('linx interactive /symphony switches current chat peer for following messages', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const submitted = []
  const statuses = []
  const editorTexts = []
  const controlManagers = []
  const interactive = {
    defaultEditor: {},
    podSession: {
      webId: 'https://alice.example/profile/card#me',
    },
    sessionManager: {
      getSessionId() {
        return 'session-status'
      },
    },
    __linxSymphonyPodProjectionRuntime: {
      getPodDataSession: async () => null,
    },
    runtime: {
      sessionControl: {
        createControlSession({ cwd }) {
          const manager = SessionManager.inMemory(cwd)
          controlManagers.push(manager)
          return manager
        },
      },
    },
    __linxListSymphonyIssues() {
      return []
    },
    __linxListSymphonySessions() {
      return [
        {
          status: 'running',
          backend: 'codex',
          mode: 'auto',
          cwd: '/tmp/linx-a',
          autoModeSessionId: 'auto-worker-a',
          target: {
            label: 'Codex worker A',
            agent: 'codex-worker-a',
            chat: 'https://alice.example/.data/chat/codex-worker-a/index.ttl#this',
          },
        },
        {
          status: 'completed',
          backend: 'codex',
          mode: 'auto',
          cwd: '/tmp/linx-done',
          target: {
            label: 'Completed worker',
          },
        },
      ]
    },
    editor: {
      setText(text) {
        editorTexts.push(text)
      },
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
  }

  module.installSymphonyCommand(interactive)
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/symphony on')
  await interactive.defaultEditor.onSubmit('ship the login fix')
  await interactive.defaultEditor.onSubmit('/symphony status')
  await interactive.defaultEditor.onSubmit('/symphony off')
  await interactive.defaultEditor.onSubmit('normal chat')

  assert.deepEqual(editorTexts, ['', '', ''])
  assert.equal(module.isLinxInteractiveSymphonyModeEnabled(interactive), false)
  assert.match(statuses[0], /Symphony is on/)
  assert.match(statuses[0], /ordinary chat ordinary/)
  assert.doesNotMatch(statuses[0], /Skills:/)
  assert.doesNotMatch(statuses[0], /What changed:/)
  assert.match(statuses[1], /Symphony is on/)
  assert.match(statuses[1], /Current chat peer: Secretary/)
  assert.match(statuses[1], /Running workers: 1/)
  assert.match(statuses[1], /codex\/auto -> Codex worker A/)
  assert.match(statuses[1], /runtime=auto-worker-a/)
  assert.match(statuses[1], /Chat: https:\/\/alice\.example\/.data\/chat\/__secretary__\/index\.ttl#this/)
  assert.match(statuses[1], /Thread: https:\/\/alice\.example\/.data\/chat\/__secretary__\/index\.ttl#session-status/)
  assert.match(statuses[2], /Symphony is off/)
  assert.match(statuses[2], /Back to direct chat/)
  assert.match(statuses[2], /Active handoffs from this window were stopped/)
  assert.equal(submitted.length, 2)
  assert.match(submitted[0], /AI Secretary Symphony request/)
  assert.match(submitted[0], /Symphony is on: the user is chatting with Secretary/)
  assert.match(submitted[0], /Default response style: reply like normal chat/)
  assert.match(submitted[0], /do not explain that it was not delegated/)
  assert.match(submitted[0], /use the xpod CLI as the direct Pod tool surface/i)
  assert.match(submitted[0], /model-backed xpod obj commands/)
  assert.match(submitted[0], /same Solid authority as LinX inside the Agent Runtime/)
  assert.match(submitted[0], /verify xpod auth status\/whoami reports the same acting WebID\/Pod root/)
  assert.match(submitted[0], /Do not hand-patch TTL or guess Pod paths/)
  assert.match(submitted[0], /ship the login fix/)
  assert.equal(submitted[1], 'normal chat')
  assert.equal(controlManagers.length, 1)
  const messageEntry = controlManagers[0].getEntries().find((entry) => (
    entry.type === 'custom'
    && entry.customType === 'linx-session-control'
    && entry.data?.kind === 'thread.message.appended'
  ))
  assert.ok(messageEntry)
  assert.equal(messageEntry.data?.data?.content, 'ship the login fix')
  assert.doesNotMatch(messageEntry.data?.data?.content ?? '', /AI Secretary Symphony request/)
  assert.equal(messageEntry.data?.data?.reconciler?.policyKind, 'direct')
})

test('linx interactive /symphony keeps worker-looking messages in the Secretary lane', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const submitted = []
  const statuses = []
  const errors = []
  const runCalls = []
  const editorTexts = []
  const interactive = {
    defaultEditor: {},
    __autoEnabled: true,
    __linxSymphonyWorkerModel: 'deepseek-v4',
    podSession: {
      webId: 'https://alice.example/profile/card#me',
    },
    session: {
      model: {
        id: 'gpt-5.5',
      },
    },
    sessionManager: {
      getSessionId() {
        return 'session-secretary-lane'
      },
    },
    runtime: {
      runtimeBackend: 'codex',
      cwd: '/tmp/linx-secretary-lane',
    },
    editor: {
      setText(text) {
        editorTexts.push(text)
      },
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      errors.push(message)
    },
    __linxRunSymphony: async (...args) => {
      runCalls.push(args)
      throw new Error('raw Symphony user input must not directly dispatch a worker')
    },
  }

  module.installSymphonyCommand(interactive)
  interactive.setupEditorSubmitHandler()

  const messages = [
    '请派出一个任务，用 cc worker 回复 exactly symphony-ok',
    'worker 干完了吗',
    '请派出一个任务，用 linx worker，model=step-3.7-flash，回复 exactly symphony-ok',
  ]

  await interactive.defaultEditor.onSubmit('/symphony on')
  for (const message of messages) {
    await interactive.defaultEditor.onSubmit(message)
  }
  await Promise.all(interactive.__linxSymphonyDispatches ?? [])

  assert.equal(errors.length, 0)
  assert.deepEqual(runCalls, [])
  assert.equal(submitted.length, messages.length)
  for (let i = 0; i < messages.length; i += 1) {
    assert.match(submitted[i], /AI Secretary Symphony request/)
    assert.match(submitted[i], /Symphony is on: the user is chatting with Secretary/)
    assert.match(submitted[i], /xpod CLI as the direct Pod tool surface/i)
    assert.match(submitted[i], new RegExp(messages[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.deepEqual(editorTexts, [''])
  assert.match(statuses[0], /Symphony is on/)
  assert.equal(statuses.length, 1)
})

test('linx interactive /symphony off restores worker backend chat without pending dispatch', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const submitted = []
  const statuses = []
  const errors = []
  const interactive = {
    defaultEditor: {},
    __autoEnabled: true,
    podSession: {
      webId: 'https://alice.example/profile/card#me',
    },
    sessionManager: {
      getSessionId() {
        return 'session-symphony-off-secretary-lane'
      },
    },
    runtime: {
      runtimeBackend: 'codex',
      cwd: '/tmp/linx-dispatch-off',
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async (text) => {
        submitted.push(text)
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
    showError(message) {
      errors.push(message)
    },
    __linxRunSymphony: async () => {
      throw new Error('raw Symphony user input must not directly dispatch a worker')
    },
  }

  module.installSymphonyCommand(interactive)
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/symphony on')
  await interactive.defaultEditor.onSubmit('请派出一个任务，让 worker 回复 exactly symphony-ok')
  await interactive.defaultEditor.onSubmit('/symphony off')
  await interactive.defaultEditor.onSubmit('normal chat after off')
  await Promise.all(interactive.__linxSymphonyDispatches ?? [])

  assert.equal(errors.length, 0)
  assert.equal(module.isLinxInteractiveSymphonyModeEnabled(interactive), false)
  assert.equal(submitted.length, 2)
  assert.match(submitted[0], /AI Secretary Symphony request/)
  assert.match(submitted[0], /请派出一个任务，让 worker 回复 exactly symphony-ok/)
  assert.equal(submitted[1], 'normal chat after off')
  assert.match(statuses[0], /Symphony is on/)
  assert.match(statuses[1], /Symphony is off/)
  assert.match(statuses[1], /Back to direct chat/)
  assert.equal(statuses.length, 2)
})

test('linx interactive /symphony status reads open issues and running workers from Pod control state when available', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const statuses = []
  const { issueResource, sessionResource, deliveryResource } = await import('@undefineds.co/models')
  const interactive = {
    defaultEditor: {},
    podSession: {
      webId: 'https://alice.example/profile/card#me',
    },
    sessionManager: {
      getSessionId() {
        return 'session-status'
      },
    },
    __linxListSymphonySessions() {
      return [
        {
          status: 'running',
          backend: 'codex',
          mode: 'auto',
          cwd: '/tmp/linx-local-stale',
          autoModeSessionId: 'auto-local-stale',
          target: {
            label: 'Stale local worker',
          },
        },
      ]
    },
    __linxListSymphonyIssues() {
      return [
        {
          uri: 'urn:undefineds:linx:issue:issue_local_stale',
          title: 'Stale local issue',
          status: 'open',
          priority: 'medium',
          source: 'cli',
          issuer: { source: 'user' },
          tasks: [],
          deliveries: [],
          sessions: [],
          createdAt: '2026-04-02T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
      ]
    },
    __linxSymphonyPodProjectionRuntime: {
      getPodDataSession: async () => ({
        webId: 'https://alice.example/profile/card#me',
        podUrl: 'https://alice.example/',
        solidSession: { fetch },
      }),
      issueResource,
      sessionResource,
      deliveryResource,
      createDb() {
        return {
          init: async () => undefined,
          select() {
            return {
              from(resource) {
                assert.ok(resource === issueResource || resource === sessionResource || resource === deliveryResource)
                return {
                  execute: async () => resource === issueResource
                    ? [
                      {
                        id: 'issue_pod_open',
                        title: 'Pod authority issue',
                        description: 'Pod issue should win over local archive',
                        status: 'open',
                        priority: 'high',
                        chat: 'https://alice.example/.data/chat/__secretary__/index.ttl#this',
                        thread: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-pod',
                        tasks: ['https://alice.example/.data/task/index.ttl#task-pod'],
                        createdAt: new Date('2026-04-02T00:00:00.000Z'),
                        updatedAt: new Date('2026-04-02T00:03:00.000Z'),
                      },
                      {
                        id: 'issue_pod_closed',
                        title: 'Closed Pod issue',
                        status: 'closed',
                        createdAt: new Date('2026-04-02T00:00:00.000Z'),
                        updatedAt: new Date('2026-04-02T00:02:00.000Z'),
                      },
                    ]
                    : resource === sessionResource
                      ? [
                      {
                        id: 'session-running',
                        status: 'active',
                        tool: 'symphony:codex',
                        policyVersion: 'linx-symphony-session/v1',
                        metadata: {
                          kind: 'symphony-run',
                          mode: 'auto',
                          workspacePath: '/tmp/linx-pod',
                          workers: [
                            {
                              status: 'running',
                              backend: 'codex',
                              title: 'Pod Codex worker',
                              autoModeSessionId: 'auto-pod-worker',
                              target: {
                                chat: 'https://alice.example/.data/chat/pod-worker/index.ttl#this',
                              },
                            },
                          ],
                        },
                      },
                      ]
                      : [
                        {
                          id: 'report-pod',
                          kind: 'report',
                          status: 'completed',
                          task: 'https://alice.example/.data/task/index.ttl#task-pod',
                          chat: 'https://alice.example/.data/chat/pod-worker/index.ttl#this',
                          thread: 'https://alice.example/.data/chat/pod-worker/index.ttl#thread-report',
                          objective: 'Pod worker completed.',
                          payload: {
                            kind: 'symphony_report',
                            outcome: 'completed',
                            summary: 'Pod worker completed.',
                            backend: 'codex',
                            agent: 'pod-codex-worker',
                            autoModeSessionId: 'auto-pod-report',
                          },
                          completedAt: new Date('2026-04-02T00:05:00.000Z'),
                          updatedAt: new Date('2026-04-02T00:05:00.000Z'),
                        },
                      ],
                }
              },
            }
          },
        }
      },
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {
        throw new Error('/symphony status should be handled in LinX command layer')
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
  }

  module.configureLinxInteractiveShellState(interactive, { symphonyModeEnabled: true })
  module.installSymphonyCommand(interactive)
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/symphony status')

  assert.equal(statuses.length, 1)
  assert.match(statuses[0], /Pod control state: active/)
  assert.match(statuses[0], /Open issues: 1/)
  assert.match(statuses[0], /open Pod authority issue/)
  assert.match(statuses[0], /issue_pod_open/)
  assert.match(statuses[0], /Running workers: 1/)
  assert.match(statuses[0], /Recent reports: 1/)
  assert.match(statuses[0], /codex\/auto -> Pod Codex worker/)
  assert.match(statuses[0], /runtime=auto-pod-worker/)
  assert.match(statuses[0], /completed codex -> pod-codex-worker: Pod worker completed/)
  assert.match(statuses[0], /runtime=auto-pod-report/)
  assert.match(statuses[0], /cwd=\/tmp\/linx-pod/)
  assert.doesNotMatch(statuses[0], /Stale local issue/)
  assert.doesNotMatch(statuses[0], /Closed Pod issue/)
  assert.doesNotMatch(statuses[0], /Stale local worker/)
  assert.doesNotMatch(statuses[0], /auto-local-stale/)
})

test('linx interactive /symphony status reports Pod control-state failure without showing local archive as truth', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const statuses = []
  const { issueResource, sessionResource, deliveryResource } = await import('@undefineds.co/models')
  const interactive = {
    defaultEditor: {},
    __linxSymphonyStatusPodTimeoutMs: 10,
    podSession: {
      webId: 'https://alice.example/profile/card#me',
    },
    sessionManager: {
      getSessionId() {
        return 'session-status-timeout'
      },
    },
    __linxListSymphonySessions() {
      return [
        {
          status: 'running',
          backend: 'codex',
          mode: 'auto',
          cwd: '/tmp/linx-local-running',
          autoModeSessionId: 'auto-local-running',
          target: {
            label: 'Local running worker',
          },
        },
      ]
    },
    __linxListSymphonyIssues() {
      return [
        {
          uri: 'urn:undefineds:linx:issue:issue_local_open',
          title: 'Local open issue',
          status: 'open',
          priority: 'medium',
          source: 'cli',
          issuer: { source: 'user' },
          tasks: [],
          deliveries: [],
          sessions: [],
          createdAt: '2026-04-02T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
      ]
    },
    __linxSymphonyPodProjectionRuntime: {
      getPodDataSession: async () => ({
        webId: 'https://alice.example/profile/card#me',
        podUrl: 'https://alice.example/',
        solidSession: { fetch },
      }),
      issueResource,
      sessionResource,
      deliveryResource,
      createDb() {
        return {
          init: async () => undefined,
          select() {
            return {
              from() {
                return {
                  execute: () => new Promise(() => {}),
                }
              },
            }
          },
          insert() {
            throw new Error('status read must not write')
          },
        }
      },
    },
    editor: {
      setText() {},
    },
    ui: {
      requestRender() {},
    },
    setupEditorSubmitHandler() {
      this.defaultEditor.onSubmit = async () => {
        throw new Error('/symphony status should be handled in LinX command layer')
      }
    },
    showStatus(message) {
      statuses.push(message)
    },
  }

  module.configureLinxInteractiveShellState(interactive, { symphonyModeEnabled: true })
  module.installSymphonyCommand(interactive)
  interactive.setupEditorSubmitHandler()

  await interactive.defaultEditor.onSubmit('/symphony status')

  assert.equal(statuses.length, 1)
  assert.match(statuses[0], /Pod control state: unavailable/)
  assert.doesNotMatch(statuses[0], /Fallback: showing local Symphony archive/)
  assert.match(statuses[0], /Open issues: 0/)
  assert.doesNotMatch(statuses[0], /Local open issue/)
  assert.match(statuses[0], /Running workers: 0/)
  assert.doesNotMatch(statuses[0], /Local running worker/)
  assert.doesNotMatch(statuses[0], /auto-local-running/)
})


test('command autocomplete shell module adds LinX slash commands', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-command-autocomplete.ts')
  t.after(() => cleanup())

  const interactive = {
    autocompleteProvider: undefined,
    setupAutocompleteProvider() {
      this.autocompleteProvider = {
        commands: [{ name: 'login', description: 'refresh LinX login' }],
      }
    },
  }

  module.installLinxCommandAutocomplete(interactive)
  interactive.setupAutocompleteProvider()

  assert.deepEqual(interactive.autocompleteProvider.commands.map((command) => command.name), [
    'login',
    'auto',
    'cd',
    'goal',
    'rewind',
    'statusline',
    'update',
    'ai',
    'symphony',
  ])
})

test('linx interactive adds LinX commands to real slash command autocomplete provider', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const interactive = {
    autocompleteProvider: undefined,
    defaultEditor: {
      providers: [],
      setAutocompleteProvider(provider) {
        this.providers.push(provider)
      },
    },
    editor: {
      providers: [],
      setAutocompleteProvider(provider) {
        this.providers.push(provider)
      },
    },
    setupAutocompleteProvider() {
      this.autocompleteProvider = {
        commands: [
          { name: 'login', description: 'refresh LinX login' },
        ],
      }
      this.defaultEditor.setAutocompleteProvider(this.autocompleteProvider)
      this.editor.setAutocompleteProvider(this.autocompleteProvider)
    },
  }

  module.installSymphonyAutocomplete(interactive)
  interactive.setupAutocompleteProvider()
  interactive.setupAutocompleteProvider()

  const commandByName = (name) => interactive.autocompleteProvider.commands.find((command) => command.name === name)
  assert.deepEqual(interactive.autocompleteProvider.commands, [
    { name: 'login', description: 'refresh LinX login' },
    {
      name: 'auto',
      argumentHint: 'on|off|status',
      description: 'toggle AI Secretary driving for this session',
      getArgumentCompletions: commandByName('auto').getArgumentCompletions,
    },
    {
      name: 'cd',
      argumentHint: '<dir>',
      description: 'change workspace for this LinX session',
    },
    {
      name: 'goal',
      argumentHint: '<peer-command>',
      description: 'send a goal command to the current chat peer',
    },
    {
      name: 'rewind',
      description: 'select a user message and rewind the active branch before it',
    },
    {
      name: 'statusline',
      argumentHint: 'set|colors|tokens|reset',
      description: 'configure which items appear in the status line',
      getArgumentCompletions: commandByName('statusline').getArgumentCompletions,
    },
    {
      name: 'update',
      description: 'check for a LinX CLI update and install from the TUI',
    },
    {
      name: 'ai',
      argumentHint: 'connect <provider>',
      description: 'connect AI provider credentials to LinX Pod settings',
      getArgumentCompletions: commandByName('ai').getArgumentCompletions,
    },
    {
      name: 'symphony',
      argumentHint: 'on|off|status',
      description: 'turn Secretary task handoff on/off, or show status',
      getArgumentCompletions: commandByName('symphony').getArgumentCompletions,
    },
  ])
  assert.equal(interactive.defaultEditor.providers.length, 2)
  assert.equal(interactive.editor.providers.length, 2)
  assert.deepEqual(await commandByName('auto').getArgumentCompletions('o'), [
    { value: 'on', label: 'on', description: 'Secretary drives the session and asks when blocked' },
    { value: 'off', label: 'off', description: 'User drives the session directly' },
  ])
  assert.equal(interactive.autocompleteProvider.commands[3].getArgumentCompletions, undefined)
  assert.equal(commandByName('rewind').getArgumentCompletions, undefined)
  assert.deepEqual(await commandByName('ai').getArgumentCompletions('con'), [
    { value: 'connect ', label: 'connect', description: 'Connect an AI provider key to LinX Pod AI settings' },
  ])
  assert.deepEqual(await commandByName('ai').getArgumentCompletions('connect c'), [
    { value: 'connect codebuddy', label: 'codebuddy', description: 'Connect codebuddy credentials' },
    { value: 'connect codex', label: 'codex', description: 'Connect codex credentials' },
    { value: 'connect claude', label: 'claude', description: 'Connect claude credentials' },
  ])
  assert.deepEqual(await commandByName('symphony').getArgumentCompletions('o'), [
    { value: 'on', label: 'on', description: 'Secretary can plan and hand off larger tasks' },
    { value: 'off', label: 'off', description: 'Return to direct chat' },
  ])
})

test('linx interactive autocomplete patch falls back to legacy setupAutocomplete hook', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/interactive.ts')
  t.after(() => cleanup())

  const interactive = {
    autocompleteProvider: undefined,
    setupAutocomplete(fdPath) {
      this.autocompleteProvider = {
        fdPath,
        commands: [
          { name: 'login', description: 'refresh LinX login' },
        ],
      }
    },
  }

  module.installSymphonyAutocomplete(interactive)
  interactive.setupAutocomplete('/usr/bin/fd')

  assert.equal(interactive.autocompleteProvider.fdPath, '/usr/bin/fd')
  assert.deepEqual(interactive.autocompleteProvider.commands.map((command) => command.name), [
    'login',
    'auto',
    'cd',
    'goal',
    'rewind',
    'statusline',
    'update',
    'ai',
    'symphony',
  ])
})

test('footer rendering patch lives in a shell rendering module', async (t) => {
  const [{ module, cleanup }, { module: stateModule, cleanup: stateCleanup }] = await Promise.all([
    loadAutoModeModule('lib/linx-footer-patch.ts'),
    loadAutoModeModule('lib/linx-interactive-shell-state.ts'),
  ])
  t.after(() => {
    cleanup()
    stateCleanup()
  })

  assert.equal(typeof module.installLinxFooterPatch, 'function')
  assert.equal(typeof module.setLinxFooterInteractive, 'function')
  assert.equal(typeof module.buildLinxFooterModePrefix, 'function')

  const interactive = { __autoEnabled: true }
  stateModule.configureLinxInteractiveShellState(interactive, { symphonyModeEnabled: true })
  module.setLinxFooterInteractive(interactive)
  assert.equal(module.buildLinxFooterModePrefix(), 'Symphony · Auto')
})

test('assistant message rendering patch lives in a shell rendering module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-assistant-message-rendering.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.patchPiAssistantMessageRendering, 'function')
})

test('welcome header rendering lives in a shell rendering module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-welcome-header.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.installLinxWelcomeHeader, 'function')
  assert.equal(typeof module.buildLinxWelcomeCardState, 'function')
})

test('interactive branding composition lives in a shell module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-interactive-branding.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.applyLinxInteractiveBranding, 'function')
  assert.equal(typeof module.requestLinxCloudLogin, 'function')
  assert.equal(typeof module.LINX_AGENT_DIR, 'string')
})

test('interactive bootstrap composition lives in a shell module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-interactive-bootstrap.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.bootstrapLinxInteractiveMode, 'function')
  assert.equal(typeof module.bootstrapPiInteractiveMode, 'function')
})

test('interactive theme installation lives in a shell rendering module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-theme.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.ensureLinxPiTheme, 'function')
})

test('backend command router patch lives in a shell command module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-backend-command-router.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.installBackendCommandRouter, 'function')
})

test('backend command contract lives in a shell backend module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/backend-command.ts')
  t.after(() => cleanup())

  assert.ok(module)
})

test('runtime managed auth sentinel lives outside the Pi runtime adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-runtime-auth.ts')
  t.after(() => cleanup())

  assert.equal(module.LINX_RUNTIME_MANAGED_AUTH_KEY, LINX_RUNTIME_MANAGED_AUTH_KEY)
  assert.equal(module.isLinxRuntimeManagedAuthKey(LINX_RUNTIME_MANAGED_AUTH_KEY), true)
  assert.equal(module.isLinxRuntimeManagedAuthKey('sk-real-key'), false)
})

test('backend credential helper lives in a shell backend module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/backend-credentials.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.backendCredentialInput, 'function')
  assert.equal(typeof module.loadOrPromptBackendCredential, 'function')
  assert.equal(typeof module.promptAndSaveBackendCredential, 'function')
})

test('session control manager lives in a shell control module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/session-control.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.SessionControlManager, 'function')
  assert.equal(typeof module.getSessionControlManager, 'function')
  assert.equal(typeof module.installSessionControlRuntimeEventBridge, 'function')
})

test('backend command router shell module installs projected routing by default', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-backend-command-router.ts')
  t.after(() => cleanup())

  const interactive = {
    setupEditorSubmitHandler() {},
  }

  module.installBackendCommandRouter(interactive, {
    backend: 'codex',
    async execute() {
      return { handled: false }
    },
  })

  assert.equal(typeof interactive.__linxHandleProjectedCommand, 'function')
})

test('interactive command routing patch lives in a shell command module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-interactive-command-routing.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.installLinxShellCommands, 'function')
  assert.equal(typeof module.installLinxInputCommandRouter, 'function')
  assert.equal(typeof module.installLinxFinalSubmitCommandRouter, 'function')
  assert.equal(typeof module.installLinxSessionCommandRouter, 'function')
  assert.equal(typeof module.installProjectedCommandRouter, 'function')
})

test('interactive post-init hooks live in a shell lifecycle module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-interactive-post-init.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.installLinxInteractivePostInitHooks, 'function')
  assert.equal(typeof module.installLinxEscapeInterrupt, 'function')
})

test('interactive runtime host bridge lives in a shell/runtime module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-interactive-runtime-host.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.ensureInteractiveRuntimeHost, 'function')
})

test('interactive stop cleanup lives in the shell lifecycle module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/shell-lifecycle.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.installInteractiveStopCleanup, 'function')
})

test('pod-backed extension ui patch lives in a shell ui module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-pod-backed-extension-ui.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.installPodBackedExtensionUi, 'function')
})

test('pod-backed extension ui context lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-backed-extension-ui-context.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.createPodBackedExtensionUiContext, 'function')
})

test('restored auto startup patch lives in a shell startup module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-restored-auto-startup.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.installLinxRestoredAutoStartup, 'function')
})

test('Secretary auto input controller lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/secretary-auto-input-controller.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.getSecretaryAutoInputController, 'function')
})

test('symphony interactive command patch lives in a shell command module', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-symphony-interactive-command.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.installSymphonyCommand, 'function')
})

test('workspace command shell module owns cwd changes and startup notice hooks', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-workspace-command.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.changeInteractiveCwd, 'function')
  assert.equal(typeof module.resolveInteractiveCwd, 'function')
  assert.equal(typeof module.installLinxCwdStartupNotice, 'function')
})
