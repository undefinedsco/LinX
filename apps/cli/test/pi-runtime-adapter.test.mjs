import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadWatchModule } from './watch-test-bundle.mjs'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))

test('pi runtime adapter defaults to cloud backend without creating a native proxy', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/runtime.ts')
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
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/runtime.ts')
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
          id: 'watch_native_proxy_123',
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
  assert.equal(adapter.sessionId, 'watch_native_proxy_123')
  assert.equal(adapter.backend, 'codex')

  await adapter.start()
  await adapter.close()

  assert.equal(started, true)
  assert.equal(closed, true)
})

test('pi runtime adapter createRuntime builds a minimal pi runtime around the cloud stream adapter', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/runtime.ts')
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
  assert.equal(runtime.session.model.provider, 'undefineds')

  await runtime.session.prompt('say hi')
  assert.equal(completionCalls.length, 1)
  assert.equal(completionCalls[0].apiKey, 'cloud-access-token')
  assert.equal(completionCalls[0].runtimeUrl, 'https://api.undefineds.co/v1')
  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter configures undefineds models as openai chat completions', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/runtime.ts')
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
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/runtime.ts')
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
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/runtime.ts')
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

test('pi runtime adapter ignores stale undefineds defaults that point to gpt-5-codex', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/runtime.ts')
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
  await runtime.session.prompt('say hi')
  assert.equal(completionCalls.length, 1)
  assert.equal(completionCalls[0].model, 'linx-lite')

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter keeps Pi native coding tools active in the cloud path', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/runtime.ts')
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

  assert.deepEqual(runtime.session.getActiveToolNames(), ['read', 'bash', 'edit', 'write'])
  await runtime.dispose()
})
