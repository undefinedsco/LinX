import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))

function createMockCredential(access = 'access-token') {
  return {
    type: 'oauth',
    refresh: 'refresh-token',
    access,
    expires: Date.now() + 60_000,
  }
}

test('linx startup login prompt decision covers the auth state matrix', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  assert.deepEqual(await module.resolveLinxStartupLoginPromptDecision({
    backend: 'cloud',
    print: true,
    resolveCredential() {
      throw new Error('should not inspect credentials in print mode')
    },
  }), { shouldPrompt: false, reason: 'print-mode' })

  assert.deepEqual(await module.resolveLinxStartupLoginPromptDecision({
    backend: 'native',
    resolveCredential() {
      throw new Error('should not inspect credentials for native backend')
    },
  }), { shouldPrompt: false, reason: 'native-backend' })

  assert.deepEqual(await module.resolveLinxStartupLoginPromptDecision({
    backend: 'cloud',
    async resolveCredential() {
      return createMockCredential()
    },
  }), { shouldPrompt: false, reason: 'credential-present' })
  assert.equal(module.resolveLinxStartupLoginReason({
    shouldPrompt: false,
    reason: 'credential-present',
  }), null)

  assert.deepEqual(await module.resolveLinxStartupLoginPromptDecision({
    backend: 'cloud',
    async resolveCredential() {
      return null
    },
  }), { shouldPrompt: true, reason: 'missing-credential' })
  assert.equal(module.resolveLinxStartupLoginReason({
    shouldPrompt: true,
    reason: 'missing-credential',
  }), 'startup')

  const expired = new Error('LinX Cloud login expired.')
  expired.authExpired = true
  assert.deepEqual(await module.resolveLinxStartupLoginPromptDecision({
    backend: 'cloud',
    async resolveCredential() {
      throw expired
    },
  }), { shouldPrompt: true, reason: 'expired-credential' })
  assert.equal(module.resolveLinxStartupLoginReason({
    shouldPrompt: true,
    reason: 'expired-credential',
  }), 'expired')

  await assert.rejects(
    () => module.resolveLinxStartupLoginPromptDecision({
      backend: 'cloud',
      async resolveCredential() {
        throw new Error('token endpoint unavailable')
      },
    }),
    /token endpoint unavailable/,
  )
})

test('linx interactive login reason preserves startup vs expired auth semantics', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  assert.equal(module.resolveLinxInteractiveLoginReason({
    startupDecision: { shouldPrompt: false, reason: 'credential-present' },
  }), null)
  assert.equal(module.resolveLinxInteractiveLoginReason({
    startupDecision: { shouldPrompt: true, reason: 'missing-credential' },
  }), 'startup')
  assert.equal(module.resolveLinxInteractiveLoginReason({
    startupDecision: { shouldPrompt: true, reason: 'expired-credential' },
  }), 'expired')
  assert.equal(module.resolveLinxInteractiveLoginReason({
    startupDecision: { shouldPrompt: false, reason: 'credential-present' },
    runtimePromptOnStart: true,
  }), 'expired')
  assert.equal(module.resolveLinxInteractiveLoginReason({
    startupDecision: { shouldPrompt: true, reason: 'missing-credential' },
    runtimePromptOnStart: true,
  }), 'expired')
})

test('pi runtime adapter defaults to cloud backend without creating a native proxy', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  let proxyCreated = false
  const adapter = module.createPiRuntimeAdapter({
    createNativeProxy() {
      proxyCreated = true
      throw new Error('cloud mode should not create a native proxy')
    },
    async createRemoteCompletion() {
      return 'hi from cloud'
    },
  }, {
    cwd: '/tmp/demo',
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

  assert.equal(adapter.remoteUrl, 'https://api.undefineds.co/v1')
  assert.equal(adapter.sessionId, 'undefineds_pi_frontend')
  assert.equal(adapter.cwd, '/tmp/demo')
  assert.equal(adapter.model, 'gpt-5-codex')
  assert.equal(adapter.backend, 'undefineds')
  assert.equal(adapter.streamAdapter.sessionId, 'undefineds_pi_frontend')
  assert.equal(typeof adapter.streamAdapter.streamFn, 'function')
  assert.equal(typeof adapter.createRuntime, 'function')

  await adapter.start()
  await adapter.close()

  assert.equal(proxyCreated, false)
})

test('pi runtime adapter can still wrap the native proxy when explicitly requested', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  let started = false
  let closed = false
  const adapter = module.createPiRuntimeAdapter({
    createNativeProxy(options) {
      assert.equal(options.cwd, '/tmp/demo')
      assert.equal(options.model, 'gpt-5-codex')
      assert.equal(options.listenPort, 8877)
      return {
        remoteUrl: 'ws://127.0.0.1:8877',
        record: {
          id: 'auto_native_proxy_123',
          cwd: '/tmp/demo',
          model: 'gpt-5-codex',
          backend: 'codex',
        },
        async start() {
          started = true
        },
        async sendTurn() {},
        subscribe() {
          return () => {}
        },
        async close() {
          closed = true
        },
      }
    },
  }, {
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    port: 8877,
    backend: 'native',
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

  assert.equal(adapter.remoteUrl, 'ws://127.0.0.1:8877')
  assert.equal(adapter.sessionId, 'auto_native_proxy_123')
  assert.equal(adapter.backend, 'codex')

  await adapter.start()
  await adapter.close()

  assert.equal(started, true)
  assert.equal(closed, true)
})

test('pi runtime adapter createRuntime builds a minimal pi runtime around the cloud stream adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })
  const completionCalls = []
  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion(input) {
      completionCalls.push(input)
      return 'hello from cloud'
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

  assert.equal(typeof runtime, 'object')
  assert.equal(typeof runtime.session, 'object')
  assert.equal(typeof runtime.services, 'object')
  assert.ok(Array.isArray(runtime.diagnostics))
  assert.equal(runtime.linxAuthBridge.description, 'undefineds-cloud-oauth-bridge')
  assert.equal(runtime.linxAuthBridge.authMode, 'oauth')
  assert.equal(runtime.linxAuthBridge.providerId, 'undefineds')
  assert.equal(runtime.session.model.provider, 'undefineds')

  await runtime.session.prompt('say hi')
  assert.equal(completionCalls.length, 1)
  assert.equal(completionCalls[0].apiKey, 'cloud-access-token')
  assert.equal(completionCalls[0].runtimeUrl, 'https://api.undefineds.co/v1')
  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter exposes bundled LinX skills during initial resource loading', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-skills-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-skills-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion() {
      return 'hello with skills'
    },
  }, {
    cwd,
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

  const skills = runtime.session.resourceLoader.getSkills().skills
  assert.deepEqual(skills.map((skill) => skill.name).sort(), [
    'drizzle-solid',
    'pod-storage',
    'solid-modeling',
    'xpod-componentsjs',
  ])
  assert.equal(
    skills.every((skill) => skill.sourceInfo?.source === '@undefineds.co/linx'),
    true,
  )
  assert.equal(
    skills.every((skill) => skill.sourceInfo?.origin === 'package'),
    true,
  )
  assert.match(runtime.session.systemPrompt, /<skill>/)
  assert.match(runtime.session.systemPrompt, /solid-modeling/)

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter configures undefineds models as openai chat completions', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-api-drift-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-api-drift-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion() {
      return 'hello after api drift'
    },
  }, {
    cwd,
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

  assert.equal(runtime.session.model.api, 'openai-completions')
  assert.deepEqual(runtime.session.model.compat, {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsStrictMode: false,
  })

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter lets interactive sessions start without a user API key', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-agent-no-key-'))
  t.after(() => {
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion() {
      return 'should not be reached'
    },
  }, {
    cwd: cliRoot,
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
    },
  })

  const runtime = await adapter.createRuntime({
    cwd: cliRoot,
    agentDir,
    sessionManager: SessionManager.inMemory(cliRoot),
  })

  assert.equal(runtime.session.model.provider, 'undefineds')
  const providerApiKey = await runtime.session.modelRegistry.getApiKeyForProvider('undefineds')
  assert.equal(typeof providerApiKey, 'string')
  assert.ok(providerApiKey.length > 0)
  await runtime.dispose()
})

test('pi runtime adapter prefers linx-lite when cloud model discovery returns multiple models', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-default-model-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-default-model-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const completionCalls = []
  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion(input) {
      completionCalls.push(input)
      return 'hello from preferred default'
    },
    async listRemoteModels() {
      return [
        { id: 'linx', contextWindow: 200_000 },
        { id: 'linx-lite', contextWindow: 100_000 },
      ]
    },
  }, {
    cwd,
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

  assert.equal(adapter.model, 'linx-lite')
  assert.equal(runtime.session.model.id, 'linx-lite')

  await runtime.session.prompt('say hi')
  assert.equal(completionCalls.length, 1)
  assert.equal(completionCalls[0].model, 'linx-lite')

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter keeps both LinX fallback models when cloud discovery is unavailable', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-model-fallback-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-model-fallback-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion() {
      return 'hello fallback models'
    },
    async listRemoteModels() {
      throw new Error('models unavailable')
    },
  }, {
    cwd,
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

  const available = runtime.session.modelRegistry.getAvailable()
    .filter((model) => model.provider === 'undefineds')
    .map((model) => model.id)
  assert.deepEqual(available, ['linx', 'linx-lite'])
  assert.equal(runtime.session.model.id, 'linx-lite')

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter enables xhigh thinking for LinX cloud models', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-xhigh-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-xhigh-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion() {
      return 'hello xhigh'
    },
  }, {
    cwd,
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

  assert.equal(runtime.session.model.provider, 'undefineds')
  assert.equal(runtime.session.supportsXhighThinking(), true)
  assert.ok(runtime.session.getAvailableThinkingLevels().includes('xhigh'))
  runtime.session.setThinkingLevel('xhigh')
  assert.equal(runtime.session.thinkingLevel, 'xhigh')

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter ignores stale undefineds defaults that point to gpt-5-codex', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-stale-default-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-stale-default-agent-'))
  mkdirSync(agentDir, { recursive: true })
  writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({
    defaultProvider: 'undefineds',
    defaultModel: 'gpt-5-codex',
  }, null, 2))

  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const completionCalls = []
  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion(input) {
      completionCalls.push(input)
      return 'hello after stale default fix'
    },
    async listRemoteModels() {
      return [
        { id: 'linx', contextWindow: 200_000 },
        { id: 'linx-lite', contextWindow: 100_000 },
      ]
    },
  }, {
    cwd,
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

  assert.equal(runtime.session.model.id, 'linx-lite')
  runtime.session.setThinkingLevel('xhigh')
  await runtime.session.prompt('say hi')
  assert.equal(completionCalls.length, 1)
  assert.equal(completionCalls[0].model, 'linx-lite')
  assert.equal(completionCalls[0].reasoning, 'xhigh')

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter preserves the last valid LinX model and thinking defaults', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-saved-default-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-saved-default-agent-'))
  mkdirSync(agentDir, { recursive: true })
  writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({
    defaultProvider: 'undefineds',
    defaultModel: 'linx',
    defaultThinkingLevel: 'xhigh',
  }, null, 2))

  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion() {
      return 'hello saved default'
    },
    async listRemoteModels() {
      return [
        { id: 'linx', contextWindow: 200_000 },
        { id: 'linx-lite', contextWindow: 100_000 },
      ]
    },
  }, {
    cwd,
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

  assert.equal(runtime.session.model.id, 'linx')
  assert.equal(runtime.session.thinkingLevel, 'xhigh')

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter brands the default system prompt as LinX AI Secretary', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-system-prompt-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-system-prompt-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion() {
      return 'hello system prompt'
    },
  }, {
    cwd,
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

  assert.match(runtime.session.systemPrompt, /AI Secretary/)
  assert.match(runtime.session.systemPrompt, /AI主理人/)
  assert.match(runtime.session.systemPrompt, /我是 LinX/)
  assert.doesNotMatch(runtime.session.systemPrompt, /operating inside pi/)

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter marks expired cloud auth during startup model preflight', async (t) => {
  const [{ module, cleanup }, { module: chatApiModule, cleanup: chatApiCleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/runtime.ts'),
    loadAutoModeModule('lib/chat-api.ts'),
  ])
  t.after(() => cleanup())
  t.after(() => chatApiCleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-expired-auth-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-expired-auth-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion() {
      return 'not reached'
    },
    async listRemoteModels() {
      throw new chatApiModule.RemoteChatRequestError('LinX Cloud login expired.', 401, '{"message":"Invalid Solid token"}', true)
    },
  }, {
    cwd,
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
      oauth: {
        name: 'LinX Cloud',
        async login() {
          return {
            refresh: 'refresh-token',
            access: 'expired-access-token',
            expires: Date.now() + 60_000,
          }
        },
        async refreshToken(credentials) {
          return credentials
        },
        getApiKey() {
          return 'expired-access-token'
        },
      },
    },
  })

  const runtime = await adapter.createRuntime({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
  })

  assert.equal(runtime.linxAuthBridge.shouldPromptLoginOnStart, true)
  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter silently refreshes stored auth before prompting for login', async (t) => {
  const [{ module, cleanup }, { module: chatApiModule, cleanup: chatApiCleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/runtime.ts'),
    loadAutoModeModule('lib/chat-api.ts'),
  ])
  t.after(() => cleanup())
  t.after(() => chatApiCleanup())

  const originalHome = process.env.HOME
  const originalFetch = globalThis.fetch
  const tokenRequests = []
  let currentToken = 'initial-token'
  const tokenServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/.well-known/openid-configuration') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        token_endpoint: 'http://127.0.0.1:0/token',
      }))
      return
    }

    res.writeHead(404)
    res.end('not found')
  })
  await new Promise((resolve, reject) => {
    tokenServer.once('error', reject)
    tokenServer.listen(0, '127.0.0.1', resolve)
  })
  const address = tokenServer.address()
  assert.equal(typeof address, 'object')
  const issuerUrl = `http://127.0.0.1:${address.port}`
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : String(input.url)
    if (url === `${issuerUrl}/.well-known/openid-configuration`) {
      return new Response(JSON.stringify({
        token_endpoint: `${issuerUrl}/token`,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url === `${issuerUrl}/token`) {
      tokenRequests.push(String(init.body ?? ''))
      const token = currentToken
      currentToken = 'refreshed-token'
      return new Response(JSON.stringify({
        access_token: token,
        expires_in: 3600,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return originalFetch(input, init)
  }

  const home = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-refresh-home-'))
  const linxDir = join(home, '.linx')
  mkdirSync(linxDir, { recursive: true })
  writeFileSync(join(linxDir, 'config.json'), JSON.stringify({
    url: issuerUrl,
    webId: 'https://alice.example/profile/card#me',
    authType: 'client_credentials',
  }, null, 2))
  writeFileSync(join(linxDir, 'secrets.json'), JSON.stringify({
    authMethod: 'client_credentials',
    clientId: 'client-id',
    clientSecret: 'client-secret',
  }, null, 2))
  process.env.HOME = home

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-refresh-auth-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-refresh-auth-agent-'))
  t.after(async () => {
    globalThis.fetch = originalFetch
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    await closeHttpServer(tokenServer)
    process.chdir(cliRoot)
    rmSync(home, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const seenApiKeys = []
  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion() {
      return 'hello after silent refresh'
    },
    async listRemoteModels(_session, _runtimeUrl, apiKey) {
      seenApiKeys.push(apiKey)
      if (apiKey === 'initial-token') {
        throw new chatApiModule.RemoteChatRequestError('LinX Cloud login expired.', 401, '{"message":"Invalid Solid token"}', true)
      }
      assert.equal(apiKey, 'refreshed-token')
      return [
        { id: 'linx', contextWindow: 200_000 },
        { id: 'linx-lite', contextWindow: 100_000 },
      ]
    },
  }, {
    cwd,
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
      issuerUrl,
    },
  })

  const runtime = await adapter.createRuntime({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
  })

  assert.deepEqual(seenApiKeys, ['initial-token', 'refreshed-token'])
  assert.equal(tokenRequests.length, 2)
  assert.equal(runtime.linxAuthBridge.shouldPromptLoginOnStart, false)
  assert.equal(runtime.session.model.id, 'linx-lite')
  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter silently refreshes stored auth when chat completion rejects the token', async (t) => {
  const [{ module, cleanup }, { module: chatApiModule, cleanup: chatApiCleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/runtime.ts'),
    loadAutoModeModule('lib/chat-api.ts'),
  ])
  t.after(() => cleanup())
  t.after(() => chatApiCleanup())

  const originalHome = process.env.HOME
  const originalFetch = globalThis.fetch
  const tokenRequests = []
  let currentToken = 'initial-token'
  const home = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-chat-refresh-home-'))
  const linxDir = join(home, '.linx')
  mkdirSync(linxDir, { recursive: true })
  process.env.HOME = home

  const tokenServer = createServer()
  await new Promise((resolve, reject) => {
    tokenServer.once('error', reject)
    tokenServer.listen(0, '127.0.0.1', resolve)
  })
  const address = tokenServer.address()
  assert.equal(typeof address, 'object')
  const issuerUrl = `http://127.0.0.1:${address.port}`
  tokenServer.on('request', (req, res) => {
    if (req.method === 'GET' && req.url === '/.well-known/openid-configuration') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ token_endpoint: `${issuerUrl}/token` }))
      return
    }
    if (req.method === 'POST' && req.url === '/token') {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        tokenRequests.push(Buffer.concat(chunks).toString('utf-8'))
        const token = currentToken
        currentToken = 'refreshed-token'
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ access_token: token, expires_in: 3600 }))
      })
      return
    }
    res.writeHead(404)
    res.end('not found')
  })

  globalThis.fetch = originalFetch
  writeFileSync(join(linxDir, 'config.json'), JSON.stringify({
    url: issuerUrl,
    webId: 'https://alice.example/profile/card#me',
    authType: 'client_credentials',
  }, null, 2))
  writeFileSync(join(linxDir, 'secrets.json'), JSON.stringify({
    authMethod: 'client_credentials',
    clientId: 'client-id',
    clientSecret: 'client-secret',
  }, null, 2))

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-chat-refresh-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-chat-refresh-agent-'))
  t.after(async () => {
    globalThis.fetch = originalFetch
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    await closeHttpServer(tokenServer)
    process.chdir(cliRoot)
    rmSync(home, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const completionApiKeys = []
  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion(input) {
      completionApiKeys.push(input.apiKey)
      if (input.apiKey === 'initial-token') {
        throw new chatApiModule.RemoteChatRequestError('LinX Cloud login expired.', 401, '{"message":"Invalid Solid token"}', true)
      }
      assert.equal(input.apiKey, 'refreshed-token')
      return 'hello after chat auth refresh'
    },
    async listRemoteModels() {
      return [
        { id: 'linx', contextWindow: 200_000 },
        { id: 'linx-lite', contextWindow: 100_000 },
      ]
    },
  }, {
    cwd,
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
      issuerUrl,
    },
  })

  const runtime = await adapter.createRuntime({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
  })

  await runtime.session.prompt('say hi')

  assert.deepEqual(completionApiKeys, ['initial-token', 'refreshed-token'])
  assert.equal(tokenRequests.length, 2)
  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter overrides restored non-LinX session models', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-stale-session-model-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-stale-session-model-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const sessionManager = SessionManager.inMemory(cwd)
  sessionManager.appendModelChange('anthropic', 'claude-3.5-sonnet')
  sessionManager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'old message' }],
    timestamp: new Date().toISOString(),
  })

  const completionCalls = []
  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion(input) {
      completionCalls.push(input)
      return 'hello after stale session model fix'
    },
    async listRemoteModels() {
      return [
        { id: 'linx', contextWindow: 200_000 },
        { id: 'linx-lite', contextWindow: 100_000 },
      ]
    },
  }, {
    cwd,
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
    sessionManager,
  })

  assert.equal(runtime.session.model.provider, 'undefineds')
  assert.equal(runtime.session.model.id, 'linx-lite')

  await runtime.session.prompt('say hi')
  assert.equal(completionCalls.length, 1)
  assert.equal(completionCalls[0].model, 'linx-lite')

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter keeps Pi native and LinX packaged tools active in the cloud path', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-tools-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-tools-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion() {
      return 'hello'
    },
  }, {
    cwd,
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

  assert.deepEqual(runtime.session.getActiveToolNames(), [
    'read',
    'bash',
    'edit',
    'write',
    'web_fetch',
    'web_search',
    'pod_read',
    'pod_write',
  ])
  await runtime.dispose()
})

test('pi runtime adapter applies a default timeout to bash when the model omits one', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-bash-timeout-'))
  t.after(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  const execCalls = []
  const tools = module.createLinxPiCodingTools(cwd, {
    bashOperations: {
      async exec(command, workingDirectory, options) {
        execCalls.push({ command, workingDirectory, options })
        return { exitCode: 0 }
      },
    },
  })
  const bash = tools.find((tool) => tool.name === 'bash')
  assert.ok(bash)

  await bash.execute('call_timeout_1', { command: 'pwd' })
  await bash.execute('call_timeout_2', { command: 'pwd', timeout: 7 })

  assert.equal(execCalls[0].options.timeout, module.DEFAULT_LINX_PI_BASH_TIMEOUT_SECONDS)
  assert.equal(execCalls[1].options.timeout, 7)
})

test('linx pi remote approval preserves existing Pi extension beforeToolCall blocks', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-approval.ts')
  t.after(() => cleanup())

  const runtime = createApprovalRuntime()
  const session = createFakePiSession('019df-test-extension-block')
  session.agent.beforeToolCall = async () => ({ block: true, reason: 'extension blocked first' })

  module.installLinxPiRemoteApproval({
    session,
    cwd: '/tmp/linx-work',
    runtime,
  })

  const result = await session.agent.beforeToolCall(createToolContext({
    id: 'tool_bash_2',
    name: 'bash',
    args: { command: 'echo should not request remote approval' },
  }))

  assert.deepEqual(result, { block: true, reason: 'extension blocked first' })
  assert.equal(runtime.state.approvals.length, 0)
})

test('linx pi remote approval does not create approvals for Pi-native allowed tool calls', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-approval.ts')
  t.after(() => cleanup())

  const runtime = createApprovalRuntime()
  const session = createFakePiSession('019df-test-native-allow')
  let originalCalled = false
  session.agent.beforeToolCall = async () => {
    originalCalled = true
    return undefined
  }

  module.installLinxPiRemoteApproval({
    session,
    cwd: '/tmp/linx-work',
    runtime,
  })

  const result = await session.agent.beforeToolCall(createToolContext({
    id: 'tool_bash_native_allow',
    name: 'bash',
    args: { command: 'pwd' },
  }))

  assert.equal(originalCalled, true)
  assert.equal(result, undefined)
  assert.equal(runtime.state.approvals.length, 0)
  assert.equal(runtime.state.audits.length, 0)
  assert.equal(runtime.state.inbox.length, 0)
})

test('linx pi auto approval uses the same secretary path outside auto-mode', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-approval.ts')
  t.after(() => cleanup())

  const runtime = createApprovalRuntime()
  const session = createFakePiSession('019df-test-pi-secretary')

  module.installLinxPiRemoteApproval({
    session,
    cwd: '/tmp/linx-work',
    runtime,
    mode: 'smart',
    resolveSecretaryRecommendation: async ({ request }) => ({
      kind: request.kind,
      canAutoDecide: true,
      decision: 'accept',
      confidence: 0.95,
      reason: 'safe enough for AI secretary',
      source: 'model',
    }),
  })

  const result = await session.agent.beforeToolCall(createToolContext({
    id: 'tool_bash_secretary',
    name: 'bash',
    args: { command: 'node --version' },
  }))

  assert.equal(result, undefined)
  assert.equal(runtime.state.approvals.length, 1)
  assert.equal(runtime.state.approvals[0].status, 'approved')
  assert.equal(runtime.state.approvals[0].toolCallId, 'tool_bash_secretary')
  assert.match(runtime.state.approvals[0].session, /\/\.data\/chat\/ai-secretary\/index\.ttl#019df-test-pi-secretary$/)
  assert.doesNotMatch(runtime.state.approvals[0].session, /linx-auto-mode/)
  assert.equal(runtime.state.audits.at(-1).action, 'approval_approved')
})

test('linx pi approval blocks unsafe tool calls when remote approval rejects', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-approval.ts')
  t.after(() => cleanup())

  const runtime = createApprovalRuntime({
    onSleep(state) {
      for (const approval of state.approvals) {
        if (approval.status === 'pending') {
          approval.status = 'rejected'
          approval.resolvedAt = new Date('2026-05-05T00:00:01.000Z')
        }
      }
    },
  })
  const session = createFakePiSession('019df-test-pi-block')

  module.installLinxPiRemoteApproval({
    session,
    cwd: '/tmp/linx-work',
    runtime,
    mode: 'smart',
    resolveSecretaryRecommendation: async () => null,
  })

  const result = await session.agent.beforeToolCall(createToolContext({
    id: 'tool_write_block',
    name: 'write',
    args: { path: '/tmp/linx-work/out.txt', content: 'hello' },
  }))

  assert.equal(result?.block, true)
  assert.match(result?.reason ?? '', /LinX denied/)
  assert.equal(runtime.state.approvals.length, 1)
  assert.equal(runtime.state.approvals[0].status, 'rejected')
})

function createToolContext({ id, name, args }) {
  return {
    assistantMessage: {
      role: 'assistant',
      content: [{ type: 'toolCall', id, name, arguments: args }],
      timestamp: Date.now(),
    },
    toolCall: { type: 'toolCall', id, name, arguments: args },
    args,
    context: {
      messages: [],
      tools: [],
      systemPrompt: '',
    },
  }
}

function createFakePiSession(sessionId) {
  return {
    agent: {},
    sessionManager: {
      getSessionId() {
        return sessionId
      },
    },
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

async function closeHttpServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') {
        reject(error)
        return
      }
      resolve()
    })
    server.closeIdleConnections?.()
    server.closeAllConnections?.()
  })
}
