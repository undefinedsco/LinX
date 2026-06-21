import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))

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

async function readAuthHeader(authFetch, url = 'https://api.undefineds.co/v1/probe') {
  const originalFetch = globalThis.fetch
  let authorization = null
  globalThis.fetch = async (_url, init = {}) => {
    authorization = new Headers(init.headers).get('Authorization')
    return new Response(null, { status: 204 })
  }
  try {
    await authFetch(url, {
      headers: {
        Accept: 'application/json',
      },
    })
    return authorization
  } finally {
    globalThis.fetch = originalFetch
  }
}

test('LinX cloud runtime auth helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-cloud-runtime-auth.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.resolveLinxCloudRuntimeAuthFetch, 'function')
  assert.equal(typeof module.resolveRuntimeAuthFetchFromApiKey, 'function')
  assert.equal(typeof module.withLinxCloudCompletionTimeout, 'function')
})

test('LinX cloud model catalog helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-cloud-models.ts')
  t.after(() => cleanup())

  assert.equal(module.LINX_CLOUD_PROVIDER_ID, 'undefineds')
  assert.equal(typeof module.buildFallbackLinxCloudProviderModels, 'function')
  assert.equal(typeof module.mergeLinxCloudProviderModels, 'function')
  assert.equal(typeof module.sanitizeLinxCloudDefaults, 'function')
})

test('LinX runtime resource helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-runtime-resources.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.resolveBundledLinxSkillsDir, 'function')
  assert.equal(typeof module.resolveInstalledMarketSkillDirs, 'function')
  assert.equal(typeof module.resolveBundledPiPackageRoot, 'function')
  assert.equal(typeof module.withLinxSkillSourceInfo, 'function')
})

test('LinX startup login policy helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-startup-login-policy.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.resolveLinxStartupLoginPromptDecision, 'function')
  assert.equal(typeof module.resolveLinxStartupLoginReason, 'function')
  assert.equal(typeof module.resolveLinxInteractiveLoginReason, 'function')
})

test('LinX runtime prompt helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-runtime-system-prompt.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.withLinxRuntimeSystemPrompt, 'function')
  assert.equal(typeof module.overrideLinxSystemPrompt, 'function')
})

test('LinX runtime thinking helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-runtime-thinking.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.enableLinxXhighThinking, 'function')
})

test('LinX runtime coding tools helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-runtime-coding-tools.ts')
  t.after(() => cleanup())

  assert.equal(module.DEFAULT_LINX_PI_BASH_TIMEOUT_SECONDS, 15)
  assert.equal(typeof module.createLinxPiCodingTools, 'function')
})

test('LinX runtime OAuth provider helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-runtime-oauth-provider.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.createLinxManagedRuntimeOAuthProvider, 'function')
})

test('LinX cloud runtime coordinator lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-cloud-runtime-coordinator.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.createLinxCloudRuntimeCoordinator, 'function')
})

test('LinX runtime provider registration helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-runtime-provider-registration.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.createLinxRuntimeProviderRegistration, 'function')
})

test('LinX runtime completion backend helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-runtime-completion-backend.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.createLinxRuntimeCompletionBackend, 'function')
})

test('native backend command router helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/native-backend-command-router.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.createNativeBackendCommandRouter, 'function')
})

test('native backend stream backend helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/native-backend-stream-backend.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.createNativeBackendStreamBackend, 'function')
  const calls = []
  const listeners = []
  const proxy = {
    id: 'proxy-1',
    async sendTurn(input) {
      calls.push([this.id, input])
    },
    subscribe(listener) {
      listeners.push([this.id, listener])
      return () => calls.push([this.id, 'unsubscribed'])
    },
  }

  const backend = module.createNativeBackendStreamBackend(proxy)
  await backend.sendTurn('hello')
  const unsubscribe = backend.subscribe(() => {})
  unsubscribe()

  assert.deepEqual(calls, [
    ['proxy-1', 'hello'],
    ['proxy-1', 'unsubscribed'],
  ])
  assert.equal(listeners.length, 1)
  assert.equal(listeners[0][0], 'proxy-1')
})

test('LinX runtime AgentSession composition helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-runtime-agent-session.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.createLinxAgentSessionRuntime, 'function')
})

test('linx startup login prompt decision covers the auth state matrix', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-startup-login-policy.ts')
  t.after(() => cleanup())

  let closed = false
  assert.deepEqual(await module.resolveLinxStartupLoginPromptDecision({
    backend: 'cloud',
    print: true,
    resolveSession() {
      throw new Error('should not inspect sessions in print mode')
    },
  }), { shouldPrompt: false, reason: 'print-mode' })

  assert.deepEqual(await module.resolveLinxStartupLoginPromptDecision({
    backend: 'native',
    resolveSession() {
      throw new Error('should not inspect sessions for native backend')
    },
  }), { shouldPrompt: false, reason: 'native-backend' })

  assert.deepEqual(await module.resolveLinxStartupLoginPromptDecision({
    backend: 'cloud',
    async resolveSession() {
      return {
        async close() {
          closed = true
        },
      }
    },
  }), { shouldPrompt: false, reason: 'credential-present' })
  assert.equal(closed, true)
  assert.equal(module.resolveLinxStartupLoginReason({
    shouldPrompt: false,
    reason: 'credential-present',
  }), null)

  assert.deepEqual(await module.resolveLinxStartupLoginPromptDecision({
    backend: 'cloud',
    async resolveSession() {
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
    async resolveSession() {
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
      async resolveSession() {
        throw new Error('session restore unavailable')
      },
    }),
    /session restore unavailable/,
  )
})

test('linx interactive login reason preserves startup vs expired auth semantics', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-startup-login-policy.ts')
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

test('linx startup login prompt ignores transient upstream outages', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-startup-login-policy.ts')
  t.after(() => cleanup())

  const decision = await module.resolveLinxStartupLoginPromptDecision({
    backend: 'cloud',
    async resolveSession() {
      throw new Error('expected 200 OK, got: 502 Bad Gateway')
    },
    loadStoredCredentials() {
      return {
        url: 'https://id.undefineds.co/',
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        authType: 'oidc_oauth',
        secrets: {
          oidcRefreshToken: 'refresh-token',
          oidcAccessToken: 'access-token',
          oidcExpiresAt: '2030-01-01T00:00:00.000Z',
        },
      }
    },
  })

  assert.deepEqual(decision, { shouldPrompt: false, reason: 'credential-present' })
  assert.equal(module.resolveLinxStartupLoginReason(decision), null)
})

test('pi runtime adapter defaults to cloud backend without creating a native proxy', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  let proxyCreated = false
  const adapter = module.createLinxRuntimeAdapter({
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
  assert.equal(adapter.backend, 'linx')
  assert.equal(adapter.runtimeBackend, undefined)
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
  const resolvedEnvCalls = []
  const adapter = module.createLinxRuntimeAdapter({
    createNativeProxy(options) {
      assert.equal(options.cwd, '/tmp/demo')
      assert.equal(options.model, undefined)
      assert.equal(options.listenPort, 8877)
      assert.equal(options.autoEnabled, true)
      assert.equal(options.codexApprovalPolicy, undefined)
      assert.deepEqual(options.passthroughArgs, ['--profile', 'linx'])
      assert.deepEqual(options.env, { CODEX_API_KEY: 'sk-static' })
      assert.equal(typeof options.resolveEnv, 'function')
      resolvedEnvCalls.push(options.resolveEnv)
      return {
        remoteUrl: 'ws://127.0.0.1:8877',
        record: {
          id: 'auto_native_proxy_123',
          cwd: '/tmp/demo',
          model: 'codex-default',
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
    port: 8877,
    backend: 'native',
    autoEnabled: true,
    passthroughArgs: ['--profile', 'linx'],
    backendEnv: { CODEX_API_KEY: 'sk-static' },
    async resolveBackendEnv() {
      return { CODEX_BASE_URL: 'https://codex.example/v1' }
    },
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
  assert.equal(adapter.backend, 'linx')
  assert.equal(adapter.runtimeBackend, 'codex')
  assert.equal(adapter.model, 'codex-default')
  assert.equal(adapter.backendCommandRouter, undefined)
  assert.equal(resolvedEnvCalls.length, 1)
  assert.deepEqual(await resolvedEnvCalls[0](), { CODEX_BASE_URL: 'https://codex.example/v1' })

  await adapter.start()
  await adapter.close()

  assert.equal(started, true)
  assert.equal(closed, true)
})

test('pi runtime adapter exposes native backend command router when the proxy supports it', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const commands = []
  const listeners = []
  const adapter = module.createLinxRuntimeAdapter({
    createNativeProxy() {
      return {
        remoteUrl: 'ws://127.0.0.1:8877',
        record: {
          id: 'auto_native_proxy_router',
          cwd: '/tmp/demo',
          model: 'codex-default',
          backend: 'codex',
        },
        async start() {},
        async sendTurn() {},
        async executeCommand(input) {
          commands.push(input)
          return { handled: true, message: `handled ${input}` }
        },
        subscribe(listener) {
          listeners.push(listener)
          return () => {
            const index = listeners.indexOf(listener)
            if (index !== -1) {
              listeners.splice(index, 1)
            }
          }
        },
        async close() {},
      }
    },
  }, {
    cwd: '/tmp/demo',
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

  assert.equal(adapter.backendCommandRouter.backend, 'codex')
  assert.deepEqual(await adapter.backendCommandRouter.execute('/compact'), {
    handled: true,
    message: 'handled /compact',
  })
  const unsubscribe = adapter.backendCommandRouter.subscribe(() => {})
  assert.equal(listeners.length, 1)
  unsubscribe()
  assert.equal(listeners.length, 0)
  assert.deepEqual(commands, ['/compact'])

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-router-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-router-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })
  const runtime = await adapter.createRuntime({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
  })

  assert.equal(runtime.backendCommandRouter.backend, 'codex')
  assert.equal(runtime.backendSessionRef.id, 'auto_native_proxy_router')
  assert.equal(runtime.backendSessionRef.backend, 'codex')
  assert.deepEqual(await runtime.backendCommandRouter.execute('/rollback 1'), {
    handled: true,
    message: 'handled /rollback 1',
  })
  assert.deepEqual(commands, ['/compact', '/rollback 1'])

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter createRuntime builds a minimal pi runtime around the cloud stream adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })
  const completionCalls = []
  const adapter = module.createLinxRuntimeAdapter({
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
  assert.equal(runtime.linxAuthBridge.providerId, 'undefineds')
  assert.equal(runtime.linxAuthBridge.providerLabel, 'LinX Cloud')
  assert.equal('authMode' in runtime.linxAuthBridge, false)
  assert.equal(runtime.backend, 'linx')
  assert.equal(runtime.runtimeBackend, undefined)
  assert.equal(runtime.session.model.provider, 'undefineds')

  await runtime.session.prompt('say hi')
  assert.equal(completionCalls.length, 1)
  assert.equal(await readAuthHeader(completionCalls[0].authFetch), 'Bearer cloud-access-token')
  assert.equal(completionCalls[0].runtimeUrl, 'https://api.undefineds.co/v1')
  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter prefers current Pod session fetch over stale Pi apiKey for default LinX cloud completion', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const completionAuthHeaders = []
  let podSessionCalls = 0
  let podSessionCloses = 0
  const adapter = module.createLinxRuntimeAdapter({
    async createRemoteCompletion(input) {
      completionAuthHeaders.push(await readAuthHeader(input.authFetch))
      return 'hello from current session'
    },
  }, {
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
    },
    async getPodDataSession() {
      podSessionCalls += 1
      return {
        async runtimeFetch(url, init) {
          const headers = new Headers(init?.headers)
          headers.set('Authorization', 'DPoP current-session-token')
          return fetch(url, { ...init, headers })
        },
        async close() {
          podSessionCloses += 1
        },
      }
    },
  })

  const events = []
  for await (const event of adapter.streamAdapter.streamFn(undefined, {
    messages: [{ role: 'user', content: 'hello' }],
  }, {
    apiKey: 'stale-pi-runtime-token',
    async authFetch() {
      throw new Error('LinX Pod request timed out after 30s: POST https://api.undefineds.co/v1/chat/completions')
    },
  })) {
    events.push(event)
  }

  assert.deepEqual(completionAuthHeaders, ['DPoP current-session-token'])
  assert.equal(podSessionCalls, 1)
  assert.equal(podSessionCloses, 1)
  assert.equal(events.at(-1)?.type, 'done')
  assert.equal(events.at(-1)?.message.content[0].text, 'hello from current session')
})

test('pi runtime adapter reports stalled cloud completions as cloud timeout, not Pod timeout', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const previousTimeout = process.env.LINX_CHAT_TIMEOUT_MS
  process.env.LINX_CHAT_TIMEOUT_MS = '5'
  t.after(() => {
    if (previousTimeout === undefined) {
      delete process.env.LINX_CHAT_TIMEOUT_MS
    } else {
      process.env.LINX_CHAT_TIMEOUT_MS = previousTimeout
    }
  })

  const adapter = module.createLinxRuntimeAdapter({
    async createRemoteCompletion(input) {
      await input.authFetch('https://api.undefineds.co/v1/chat/completions', { method: 'POST' })
      return 'should not finish'
    },
  }, {
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
    },
    async getPodDataSession() {
      return {
        async runtimeFetch() {
          return new Promise(() => undefined)
        },
        async close() {},
      }
    },
  })

  const events = []
  for await (const event of adapter.streamAdapter.streamFn(undefined, {
    messages: [{ role: 'user', content: 'hello' }],
  })) {
    events.push(event)
  }

  const errorEvent = events.find((event) => event.type === 'error')
  assert.ok(errorEvent)
  assert.equal(errorEvent.error.errorMessage, 'LinX Cloud is temporarily unavailable. Request exceeded 1s. Please retry shortly.')
  assert.doesNotMatch(errorEvent.error.errorMessage, /LinX Pod request/)
})

test('pi runtime adapter exposes bundled LinX skills during initial resource loading', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-skills-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-skills-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createLinxRuntimeAdapter({
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

  try {
    const skills = runtime.session.resourceLoader.getSkills().skills
    const skillNames = skills.map((skill) => skill.name).sort()
    for (const name of ['symphony', 'xpod-cli']) {
      assert.ok(skillNames.includes(name), `expected bundled LinX product skill ${name}`)
    }
    for (const name of ['drizzle-solid', 'solid-modeling', 'xpod-componentsjs']) {
      assert.equal(skillNames.includes(name), false, `developer skill ${name} should not be exposed to Secretary`)
    }
    assert.ok(skillNames.includes('librarian'), 'expected pi-web-access skill to be loaded from the bundled package')
    const linxSkills = skills.filter((skill) => ['symphony', 'xpod-cli'].includes(skill.name))
    assert.equal(linxSkills.length, 2)
    assert.equal(
      linxSkills.every((skill) => skill.sourceInfo?.source === '@undefineds.co/linx'),
      true,
    )
    assert.equal(
      linxSkills.every((skill) => skill.sourceInfo?.origin === 'package'),
      true,
    )
    assert.match(runtime.session.systemPrompt, /<skill>/)
    assert.match(runtime.session.systemPrompt, /symphony/)
    assert.match(runtime.session.systemPrompt, /xpod-cli/)
    assert.doesNotMatch(runtime.session.systemPrompt, /solid-modeling/)
    assert.doesNotMatch(runtime.session.systemPrompt, /xpod-componentsjs/)
  } finally {
    await runtime.dispose()
    process.chdir(cliRoot)
  }
})

test('pi runtime adapter prefers bundled xpod-cli skill over installed market skill', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  const { module: resourceModule, cleanup: cleanupResources } = await loadAutoModeModule('lib/linx-runtime-resources.ts')
  t.after(() => cleanup())
  t.after(() => cleanupResources())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-xpod-market-skill-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-xpod-market-agent-'))
  const codexHome = mkdtempSync(join(tmpdir(), 'linx-codex-market-home-'))
  const previousCodexHome = process.env.CODEX_HOME
  const skillDir = join(codexHome, 'plugins', 'cache', 'undefineds', 'xpod-cli', '9.9.9', 'skills', 'xpod-cli')
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), `---
name: xpod-cli
description: Xpod CLI Market Skill
---

# Xpod CLI Market Skill
`)
  process.env.CODEX_HOME = codexHome
  t.after(() => {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
    rmSync(codexHome, { recursive: true, force: true })
  })

  const adapter = module.createLinxRuntimeAdapter({
    async createRemoteCompletion() {
      return 'hello with xpod market skill'
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

  try {
    assert.deepEqual(resourceModule.resolveInstalledMarketSkillDirs(), [skillDir])
    const skills = runtime.session.resourceLoader.getSkills().skills
    const xpodSkills = skills.filter((skill) => skill.name === 'xpod-cli')
    assert.equal(xpodSkills.length, 1, 'expected bundled xpod-cli to de-duplicate market fallback')
    assert.equal(xpodSkills[0].sourceInfo?.source, '@undefineds.co/linx')
    assert.equal(xpodSkills[0].sourceInfo?.origin, 'package')
    assert.equal(xpodSkills[0].sourceInfo?.version, undefined)
  } finally {
    await runtime.dispose()
  }
})

test('pi runtime adapter prefers vendored pi-web-access packages when bundled', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-runtime-resources.ts')
  t.after(() => cleanup())

  const bundleRoot = mkdtempSync(join(tmpdir(), 'linx-pi-vendor-root-'))
  const runtimeDir = join(bundleRoot, 'dist', 'lib', 'pi-adapter')
  const vendorRoot = join(bundleRoot, 'vendor', 'pi-web-access')
  mkdirSync(vendorRoot, { recursive: true })
  writeFileSync(join(vendorRoot, 'package.json'), JSON.stringify({
    name: 'pi-web-access',
    type: 'module',
  }, null, 2))
  t.after(() => {
    rmSync(bundleRoot, { recursive: true, force: true })
  })

  const resolved = module.resolveBundledPiPackageRoot(
    'pi-web-access',
    pathToFileURL(join(runtimeDir, 'runtime.js')).href,
  )

  assert.equal(resolved, vendorRoot)
})

test('pi runtime adapter configures undefineds models as openai chat completions', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-api-drift-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-api-drift-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createLinxRuntimeAdapter({
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

  assert.equal(runtime.session.model.api, 'linx-cloud-chat-completions')
  assert.deepEqual(runtime.session.model.compat, {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsStrictMode: false,
  })

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter lets interactive sessions start without a user API key', async (t) => {
  isolateSolidHome(t, 'linx-pi-agent-no-key-solid-')
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-agent-no-key-'))
  t.after(() => {
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createLinxRuntimeAdapter({
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

  assert.equal(runtime.backend, 'linx')
  assert.equal(runtime.runtimeBackend, undefined)
  assert.equal(runtime.session.model.provider, 'undefineds')
  const providerApiKey = await runtime.session.modelRegistry.getApiKeyForProvider('undefineds')
  assert.equal(typeof providerApiKey, 'string')
  assert.ok(providerApiKey.length > 0)
  await runtime.dispose()
})

test('pi runtime adapter prefers linx-lite when cloud model discovery returns multiple models', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-default-model-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-default-model-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const completionCalls = []
  const adapter = module.createLinxRuntimeAdapter({
    async createRemoteCompletion(input) {
      completionCalls.push(input)
      return 'hello from preferred default'
    },
    async listRemoteModels() {
      return [
        { id: 'linx', contextWindow: 1_000_000 },
        { id: 'linx-lite', contextWindow: 1_000_000 },
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
  assert.equal(runtime.session.model.contextWindow, 1_000_000)

  await runtime.session.prompt('say hi')
  assert.equal(completionCalls.length, 1)
  assert.equal(completionCalls[0].model, 'linx-lite')

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter keeps both LinX fallback models when cloud discovery is unavailable', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-model-fallback-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-model-fallback-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createLinxRuntimeAdapter({
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
    .map((model) => ({ id: model.id, contextWindow: model.contextWindow }))
  assert.deepEqual(available, [
    { id: 'linx', contextWindow: 1_000_000 },
    { id: 'linx-lite', contextWindow: 1_000_000 },
  ])
  assert.equal(runtime.session.model.id, 'linx-lite')

  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter enables xhigh thinking for LinX cloud models', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-xhigh-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-xhigh-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createLinxRuntimeAdapter({
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

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
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
  const adapter = module.createLinxRuntimeAdapter({
    async createRemoteCompletion(input) {
      completionCalls.push(input)
      return 'hello after stale default fix'
    },
    async listRemoteModels() {
      return [
        { id: 'linx', contextWindow: 1_000_000 },
        { id: 'linx-lite', contextWindow: 1_000_000 },
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

test('pi runtime adapter preserves the last valid LinX model and thinking defaults', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
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

  const adapter = module.createLinxRuntimeAdapter({
    async createRemoteCompletion() {
      return 'hello saved default'
    },
    async listRemoteModels() {
      return [
        { id: 'linx', contextWindow: 1_000_000 },
        { id: 'linx-lite', contextWindow: 1_000_000 },
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

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-system-prompt-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-system-prompt-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createLinxRuntimeAdapter({
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
  assert.match(runtime.session.systemPrompt, /user-facing LinX product abilities/)
  assert.match(runtime.session.systemPrompt, /Do not advertise repository-local agent instructions/)
  assert.doesNotMatch(runtime.session.systemPrompt, /operating inside pi/)
  assert.doesNotMatch(runtime.session.systemPrompt, /semble search/)

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

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-expired-auth-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-expired-auth-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const adapter = module.createLinxRuntimeAdapter({
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

test('pi runtime adapter does not fail interactive login when post-login model sync rejects the token', async (t) => {
  const [{ module, cleanup }, { module: chatApiModule, cleanup: chatApiCleanup }] = await Promise.all([
    loadAutoModeModule('lib/pi-adapter/runtime.ts'),
    loadAutoModeModule('lib/chat-api.ts'),
  ])
  t.after(() => cleanup())
  t.after(() => chatApiCleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-login-sync-auth-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-login-sync-auth-agent-'))
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  let runtimeLogin
  const adapter = module.createLinxRuntimeAdapter({
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
            access: 'expired-after-login-token',
            expires: Date.now() + 60_000,
          }
        },
        async refreshToken(credentials) {
          return credentials
        },
        getApiKey(credentials) {
          return credentials.access
        },
      },
    },
  })

  const runtime = await adapter.createRuntime({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
  })
  runtimeLogin = runtime.session.modelRegistry.authStorage.login('undefineds', {
    onAuth() {},
    onProgress() {},
  })

  await assert.doesNotReject(runtimeLogin)
  assert.equal(runtime.session.modelRegistry.authStorage.get('undefineds')?.access, 'expired-after-login-token')
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

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-refresh-auth-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-refresh-auth-agent-'))
  t.after(async () => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const seenAuthHeaders = []
  const podSessionAuthHeaders = ['DPoP initial-session-token', 'DPoP refreshed-session-token']
  let podSessionCalls = 0
  let podSessionCloses = 0
  const adapter = module.createLinxRuntimeAdapter({
    async createRemoteCompletion() {
      return 'hello after silent refresh'
    },
    async listRemoteModels(authFetch) {
      const authHeader = await readAuthHeader(authFetch)
      seenAuthHeaders.push(authHeader)
      if (authHeader === 'DPoP initial-session-token') {
        throw new chatApiModule.RemoteChatRequestError('LinX Cloud login expired.', 401, '{"message":"Invalid Solid token"}', true)
      }
      assert.equal(authHeader, 'DPoP refreshed-session-token')
      return [
        { id: 'linx', contextWindow: 1_000_000 },
        { id: 'linx-lite', contextWindow: 1_000_000 },
      ]
    },
  }, {
    cwd,
    async getPodDataSession() {
      const authHeader = podSessionAuthHeaders[podSessionCalls] ?? 'DPoP refreshed-session-token'
      podSessionCalls += 1
      return {
        async runtimeFetch(url, init) {
          const headers = new Headers(init?.headers)
          headers.set('Authorization', authHeader)
          return fetch(url, { ...init, headers })
        },
        async close() {
          podSessionCloses += 1
        },
      }
    },
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
    },
  })

  const runtime = await adapter.createRuntime({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
  })

  assert.deepEqual(seenAuthHeaders, ['DPoP initial-session-token', 'DPoP refreshed-session-token'])
  assert.equal(podSessionCalls, 2)
  assert.equal(podSessionCloses, 2)
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

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-chat-refresh-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-chat-refresh-agent-'))
  t.after(async () => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const completionAuthHeaders = []
  const podSessionAuthHeaders = ['DPoP initial-session-token', 'DPoP refreshed-session-token']
  let podSessionCalls = 0
  let podSessionCloses = 0
  const adapter = module.createLinxRuntimeAdapter({
    async createRemoteCompletion(input) {
      const authHeader = await readAuthHeader(input.authFetch)
      completionAuthHeaders.push(authHeader)
      if (authHeader === 'DPoP initial-session-token') {
        throw new chatApiModule.RemoteChatRequestError('LinX Cloud login expired.', 401, '{"message":"Invalid Solid token"}', true)
      }
      assert.equal(authHeader, 'DPoP refreshed-session-token')
      return 'hello after chat auth refresh'
    },
    async listRemoteModels() {
      return [
        { id: 'linx', contextWindow: 1_000_000 },
        { id: 'linx-lite', contextWindow: 1_000_000 },
      ]
    },
  }, {
    cwd,
    async getPodDataSession() {
      const authHeader = podSessionAuthHeaders[podSessionCalls] ?? 'DPoP refreshed-session-token'
      podSessionCalls += 1
      return {
        async runtimeFetch(url, init) {
          const headers = new Headers(init?.headers)
          headers.set('Authorization', authHeader)
          return fetch(url, { ...init, headers })
        },
        async close() {
          podSessionCloses += 1
        },
      }
    },
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
    },
  })

  const runtime = await adapter.createRuntime({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
  })

  await runtime.session.prompt('say hi')

  assert.deepEqual(completionAuthHeaders, ['DPoP initial-session-token', 'DPoP refreshed-session-token'])
  assert.equal(podSessionCalls, 2)
  assert.equal(podSessionCloses, 2)
  await runtime.dispose()
  process.chdir(cliRoot)
})

test('pi runtime adapter clears startup auth prompt after a successful browser login refresh', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  let loginCalls = 0
  const adapter = module.createLinxRuntimeAdapter({
    async createRemoteCompletion() {
      return 'ok'
    },
    async listRemoteModels() {
      return [{ id: 'linx', contextWindow: 1_000_000 }]
    },
  }, {
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
      oauth: {
        name: 'LinX Cloud',
        async login() {
          loginCalls += 1
          return {
            refresh: 'refresh-token',
            access: 'access-token',
            expires: Date.now() + 60_000,
          }
        },
        async refreshToken(credentials) {
          return credentials
        },
        getApiKey(credentials) {
          return credentials.access
        },
      },
    },
  })

  const runtime = await adapter.createRuntime({
    cwd: cliRoot,
    agentDir: join(cliRoot, '.tmp-pi-auth-prompt'),
    sessionManager: (await import('@earendil-works/pi-coding-agent')).SessionManager.inMemory(cliRoot),
  })

  assert.equal(loginCalls, 1)
  assert.equal(runtime.linxAuthBridge.shouldPromptLoginOnStart, false)
  await runtime.dispose()
})

test('pi runtime adapter overrides restored non-LinX session models', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
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
  const adapter = module.createLinxRuntimeAdapter({
    async createRemoteCompletion(input) {
      completionCalls.push(input)
      return 'hello after stale session model fix'
    },
    async listRemoteModels() {
      return [
        { id: 'linx', contextWindow: 1_000_000 },
        { id: 'linx-lite', contextWindow: 1_000_000 },
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

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-tools-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-tools-agent-'))
  const projectExtensionDir = join(cwd, '.pi', 'extensions', 'project-extra-tool')
  t.after(() => {
    process.chdir(cliRoot)
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })
  mkdirSync(projectExtensionDir, { recursive: true })
  writeFileSync(join(projectExtensionDir, 'index.js'), `
import { Type } from 'typebox'

export default function projectExtraTool(pi) {
  pi.registerTool({
    name: 'project_extra_tool',
    label: 'Project Extra Tool',
    description: 'Project extension tool used to verify LinX does not install a global tool allowlist.',
    parameters: Type.Object({}),
    async execute() {
      return {
        content: [{ type: 'text', text: 'ok' }],
        details: {},
      }
    },
  })
}
`)

  const adapter = module.createLinxRuntimeAdapter({
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

  const activeTools = runtime.session.getActiveToolNames()
  for (const toolName of [
    'read',
    'bash',
    'edit',
    'write',
    'web_search',
    'code_search',
    'fetch_content',
    'get_search_content',
    'project_extra_tool',
  ]) {
    assert.ok(activeTools.includes(toolName), `${toolName} should be active`)
  }
  assert.equal(activeTools.includes('pod_read'), false, 'legacy pod_read should not be active by default')
  assert.equal(activeTools.includes('pod_write'), false, 'legacy pod_write should not be active by default')
  assert.ok(runtime.session.getAllTools().some((tool) => tool.name === 'project_extra_tool'))
  await runtime.dispose()
})

test('LinX runtime coding tools apply a default timeout to bash when the model omits one', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-runtime-coding-tools.ts')
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
