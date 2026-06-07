import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

let autoModeModulePromise

async function getAutoModeBundle() {
  if (!autoModeModulePromise) {
    autoModeModulePromise = loadAutoModeModule()
  }

  return autoModeModulePromise
}

async function runAutoMode(entryPath, options, env) {
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import(${JSON.stringify(pathToFileURL(entryPath).href)})
          .then(({ runAutoMode }) => runAutoMode(${JSON.stringify(options)}))
          .then((exitCode) => {
            process.exit(exitCode);
          })
          .catch((error) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          });
      `,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf-8')
  child.stderr.setEncoding('utf-8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => resolve(code))
  })

  return {
    exitCode,
    stdout,
    stderr,
  }
}

async function withPatchedEnv(t, env, fn) {
  const originals = new Map()

  for (const [key, value] of Object.entries(env)) {
    originals.set(key, process.env[key])
    process.env[key] = value
  }

  t.after(() => {
    for (const [key, value] of originals.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  return fn()
}

test('claude auth preflight parser recognizes logged-out status json', async () => {
  const { module } = await getAutoModeBundle()
  const parsed = module.__internal.parseClaudeAuthStatus(JSON.stringify({
    loggedIn: false,
    authMethod: 'none',
    apiProvider: 'firstParty',
  }))

  assert.equal(parsed.state, 'unauthenticated')
  assert.match(parsed.message, /claude auth login/)
})

test('runtime auth failure detection prefers protocol payloads', async () => {
  const { module } = await getAutoModeBundle()
  const failure = module.detectAutoModeAuthFailure('claude', JSON.stringify({
    type: 'assistant',
    error: 'authentication_failed',
    message: {
      content: [{ type: 'text', text: 'Not logged in · Please run /login' }],
    },
  }))

  assert.ok(failure)
  assert.match(failure.message, /Claude Code is not authenticated/)
  assert.match(failure.message, /claude auth login/)
})

test('pod ai selector prefers active anthropic credentials', async () => {
  const { module } = await getAutoModeBundle()
  const match = module.__podInternal.selectPodCredentialForBackend('claude', [
    {
      id: 'cred-openai',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-openai',
      provider: 'https://pod.example/settings/providers/openai.ttl',
    },
    {
      id: 'cred-anthropic',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-anthropic',
      provider: 'https://pod.example/settings/providers/anthropic.ttl',
    },
  ], [
    {
      id: 'anthropic',
      '@id': 'https://pod.example/settings/providers/anthropic.ttl',
    },
    {
      id: 'openai',
      '@id': 'https://pod.example/settings/providers/openai.ttl',
    },
  ])

  assert.deepEqual(match, {
    providerId: 'anthropic',
    apiKey: 'sk-anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
  })
})

test('pod ai selector uses shared provider aliases for claude credentials', async () => {
  const { module } = await getAutoModeBundle()
  const match = module.__podInternal.selectPodCredentialForBackend('claude', [
    {
      id: 'cred-claude',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-claude',
      provider: 'https://pod.example/settings/providers/claude.ttl',
    },
  ], [
    {
      id: 'claude',
      '@id': 'https://pod.example/settings/providers/claude.ttl',
    },
  ])

  assert.deepEqual(match, {
    providerId: 'anthropic',
    apiKey: 'sk-claude',
    baseUrl: 'https://api.anthropic.com/v1',
  })
})

test('pod ai selector maps openai credentials to codex backend', async () => {
  const { module } = await getAutoModeBundle()
  const match = module.__podInternal.selectPodCredentialForBackend('codex', [
    {
      id: 'cred-openai',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-openai',
      provider: 'https://pod.example/settings/providers/openai.ttl',
    },
  ], [
    {
      id: 'openai',
      '@id': 'https://pod.example/settings/providers/openai.ttl',
      baseUrl: 'https://api.openai.com/v1',
    },
  ])

  assert.deepEqual(match, {
    providerId: 'openai',
    apiKey: 'sk-openai',
    baseUrl: 'https://api.openai.com/v1',
  })
})

test('pod ai selector maps codebuddy credentials and prefers credential baseUrl', async () => {
  const { module } = await getAutoModeBundle()
  const match = module.__podInternal.selectPodCredentialForBackend('codebuddy', [
    {
      id: 'cred-codebuddy',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-codebuddy',
      provider: 'https://pod.example/settings/providers/codebuddy.ttl',
      baseUrl: 'https://proxy.codebuddy.example/v1',
    },
  ], [
    {
      id: 'codebuddy',
      '@id': 'https://pod.example/settings/providers/codebuddy.ttl',
      baseUrl: 'https://api.codebuddy.ai/v1',
    },
  ])

  assert.deepEqual(match, {
    providerId: 'codebuddy',
    apiKey: 'sk-codebuddy',
    baseUrl: 'https://proxy.codebuddy.example/v1',
  })
})

test('auto-mode run options always resolve backend credentials from LinX Cloud Pod config', async (t) => {
  const { module } = await getAutoModeBundle()

  let preflightCalls = 0
  let podCalls = 0

  t.mock.method(module.autoModeRuntime, 'preflightAutoModeAuth', async (backend) => {
    preflightCalls += 1
    assert.equal(backend, 'claude')
    return {
      state: 'unauthenticated',
      message: 'Claude Code is not authenticated. Run `claude auth login` and try again.',
    }
  })

  t.mock.method(module.autoModeRuntime, 'loadPodBackendCredential', async (backend) => {
    podCalls += 1
    assert.equal(backend, 'claude')
    return {
      backend: 'claude',
      provider: 'anthropic',
      env: {
        ANTHROPIC_API_KEY: 'sk-pod-key',
      },
    }
  })

  const resolved = await module.resolveAutoRunOptions({
    backend: 'claude',
    mode: 'smart',
    cwd: process.cwd(),
    prompt: 'hello',
    passthroughArgs: [],
    credentialSource: 'local',
  })

  assert.equal(preflightCalls, 0)
  assert.equal(podCalls, 1)
  assert.equal(resolved.options.credentialSource, 'cloud')
  assert.equal(resolved.options.resolvedCredentialSource, 'cloud')
  assert.deepEqual(resolved.options.commandEnv, {
    ANTHROPIC_API_KEY: 'sk-pod-key',
  })
  assert.equal(resolved.authPreflight.state, 'authenticated')
})

test('cloud credential source resolves pod-backed codex credentials and skips local auth preflight', async (t) => {
  const { module } = await getAutoModeBundle()
  let preflightCalls = 0

  t.mock.method(module.autoModeRuntime, 'preflightAutoModeAuth', async () => {
    preflightCalls += 1
    return { state: 'authenticated' }
  })

  t.mock.method(module.autoModeRuntime, 'loadPodBackendCredential', async (backend) => {
    assert.equal(backend, 'codex')
    return {
      backend: 'codex',
      provider: 'openai',
      env: {
        OPENAI_API_KEY: 'sk-openai',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
      },
    }
  })

  const resolved = await module.resolveAutoRunOptions({
    backend: 'codex',
    mode: 'smart',
    cwd: process.cwd(),
    passthroughArgs: [],
    credentialSource: 'cloud',
  })

  assert.equal(preflightCalls, 0)
  assert.equal(resolved.options.resolvedCredentialSource, 'cloud')
  assert.deepEqual(resolved.options.commandEnv, {
    OPENAI_API_KEY: 'sk-openai',
    CODEX_API_KEY: 'sk-openai',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
  })
  assert.equal(resolved.authPreflight.state, 'authenticated')
})

test('oidc pod data session exposes a drizzle-compatible solid session', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(cleanup)

  const credentials = {
    url: 'https://id.undefineds.co/',
    webId: 'https://pod.example/profile/card#me',
    authType: 'oidc_oauth',
    sourceDir: '/tmp/linx',
    secrets: {
      oidcRefreshToken: 'refresh',
      oidcAccessToken: 'access',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
    },
  }
  const requests = []

  const podSession = await module.createPodDataSession({
    loadCredentials: () => credentials,
    getClientCredentials: () => null,
    getOidcAccessToken: async (stored) => {
      assert.equal(stored, credentials)
      return 'access-token'
    },
    restoreStoredOidcSession: async () => {
      throw new Error('OIDC data access should not restore a keepAlive Solid session')
    },
    authenticate: async () => {
      throw new Error('client credentials auth should not be used')
    },
    authenticatedFetch: async (url, token, init) => {
      requests.push({ url: String(url), token, method: init?.method ?? 'GET' })
      return new Response('ok', { status: 200 })
    },
  })

  assert.ok(podSession)
  assert.equal(podSession.webId, credentials.webId)
  assert.equal(podSession.solidSession.info.isLoggedIn, true)
  assert.equal(podSession.solidSession.info.webId, credentials.webId)

  await podSession.solidSession.fetch('https://pod.example/settings/credentials.ttl', { method: 'HEAD' })
  assert.deepEqual(requests, [{
    url: 'https://pod.example/settings/credentials.ttl',
    token: 'access-token',
    method: 'HEAD',
  }])
  assert.equal(await podSession.getRuntimeAuthToken(), 'access-token')
})

test('pod-backed codex credential is read through shared model db', async () => {
  const { module } = await getAutoModeBundle()
  const credentialResource = { name: 'credentialResource' }
  const aiProviderResource = { name: 'aiProviderResource' }
  let createDbCalls = 0
  let fetchCalls = 0
  const selectResources = []
  const findByIds = []
  const runtime = {
    async getPodDataSession() {
      return {
        webId: 'https://pod.example/profile/card#me',
        credentials: {
          url: 'https://id.undefineds.co/',
          webId: 'https://pod.example/profile/card#me',
          authType: 'oidc_oauth',
          secrets: {
            oidcRefreshToken: 'refresh',
            oidcAccessToken: 'access',
            oidcExpiresAt: '2030-01-01T00:00:00.000Z',
          },
        },
        solidSession: {
          info: {
            isLoggedIn: true,
            webId: 'https://pod.example/profile/card#me',
          },
          async fetch() {
            fetchCalls += 1
            return new Response('unexpected fetch', { status: 500 })
          },
          async logout() {},
        },
        async fetch() {
          fetchCalls += 1
          return new Response('unexpected fetch', { status: 500 })
        },
        async close() {},
      }
    },
    createDb(session) {
      createDbCalls += 1
      assert.equal(session.solidSession.info.isLoggedIn, true)
      return {
        select() {
          return {
            from(resource) {
              return {
                async execute() {
                  selectResources.push(resource)
                  if (resource === credentialResource) {
                    return [{
                      id: 'openai-default',
                      service: 'ai',
                      status: 'active',
                      provider: 'https://pod.example/settings/providers/openai.ttl',
                      apiKey: 'sk-openai',
                    }]
                  }
                  throw new Error('unexpected collection scan')
                },
              }
            },
          }
        },
        async findById(resource, id) {
          findByIds.push([resource, id])
          if (resource === aiProviderResource && id === 'openai') {
            return {
              id: 'openai',
              '@id': 'https://pod.example/settings/providers/openai.ttl',
              baseUrl: 'https://api.openai.com/v1',
            }
          }
          return null
        },
      }
    },
    credentialResource,
    aiProviderResource,
  }

  const credential = await module.loadPodBackendCredential('codex', runtime)

  assert.deepEqual(credential, {
    backend: 'codex',
    provider: 'openai',
    env: {
      OPENAI_API_KEY: 'sk-openai',
      CODEX_API_KEY: 'sk-openai',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
    },
  })
  assert.equal(createDbCalls, 1)
  assert.equal(fetchCalls, 0)
  assert.deepEqual(selectResources, [credentialResource])
  assert.deepEqual(findByIds, [
    [aiProviderResource, 'openai'],
    [aiProviderResource, 'codex'],
  ])
})

test('cloud credential source resolves pod-backed codebuddy credentials and skips local auth preflight', async (t) => {
  const { module } = await getAutoModeBundle()
  let preflightCalls = 0

  t.mock.method(module.autoModeRuntime, 'preflightAutoModeAuth', async () => {
    preflightCalls += 1
    return { state: 'authenticated' }
  })

  t.mock.method(module.autoModeRuntime, 'loadPodBackendCredential', async (backend) => {
    assert.equal(backend, 'codebuddy')
    return {
      backend: 'codebuddy',
      provider: 'codebuddy',
      env: {
        CODEBUDDY_API_KEY: 'sk-codebuddy',
        CODEBUDDY_BASE_URL: 'https://proxy.codebuddy.example/v1',
      },
    }
  })

  const resolved = await module.resolveAutoRunOptions({
    backend: 'codebuddy',
    mode: 'smart',
    cwd: process.cwd(),
    passthroughArgs: [],
    credentialSource: 'cloud',
  })

  assert.equal(preflightCalls, 0)
  assert.equal(resolved.options.resolvedCredentialSource, 'cloud')
  assert.deepEqual(resolved.options.commandEnv, {
    CODEBUDDY_API_KEY: 'sk-codebuddy',
    CODEBUDDY_BASE_URL: 'https://proxy.codebuddy.example/v1',
  })
  assert.equal(resolved.authPreflight.state, 'authenticated')
})

test('auto-mode credential resolution ignores local backend auth status', async (t) => {
  const { module } = await getAutoModeBundle()
  let preflightCalls = 0

  t.mock.method(module.autoModeRuntime, 'preflightAutoModeAuth', async () => {
    preflightCalls += 1
    throw new Error('local auth must not be checked')
  })

  t.mock.method(module.autoModeRuntime, 'loadPodBackendCredential', async () => ({
    backend: 'claude',
    provider: 'anthropic',
    env: {
      ANTHROPIC_API_KEY: 'sk-pod-key',
    },
  }))

  const resolved = await module.resolveAutoRunOptions({
    backend: 'claude',
    mode: 'smart',
    cwd: process.cwd(),
    passthroughArgs: [],
  })

  assert.equal(preflightCalls, 0)
  assert.equal(resolved.options.credentialSource, 'cloud')
  assert.equal(resolved.options.resolvedCredentialSource, 'cloud')
  assert.deepEqual(resolved.options.commandEnv, {
    ANTHROPIC_API_KEY: 'sk-pod-key',
  })
})

test('auto-mode normalizes runtime auth failures for codebuddy sessions', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-auto-mode-auth-runtime-'))
  const binDir = join(root, 'bin')
  const autoModeHome = join(root, 'auto-mode-home')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  mkdirSync(binDir, { recursive: true })

  const fakeCodebuddyPath = join(binDir, 'codebuddy')
  writeFileSync(
    fakeCodebuddyPath,
    `#!/usr/bin/env node
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_auth_fail' } })
    return
  }
  if (message.method === 'session/prompt') {
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_auth_fail',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Not logged in · Please sign in first' },
        },
      },
    })
    write({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32001,
        message: 'Not logged in · Please sign in first',
      },
    })
    process.exit(1)
  }
})
`,
  )
  chmodSync(fakeCodebuddyPath, 0o755)

  const { module } = await getAutoModeBundle()

  t.mock.method(module.autoModeRuntime, 'loadPodBackendCredential', async (backend) => {
    assert.equal(backend, 'codebuddy')
    return {
      backend: 'codebuddy',
      provider: 'codebuddy',
      env: {
        CODEBUDDY_API_KEY: 'sk-codebuddy',
      },
    }
  })
  t.mock.method(module.autoModeRuntime, 'persistAutoModeConversationToPod', async () => {})

  let thrown
  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
  }, async () => {
    try {
      await module.runAutoMode({
        backend: 'codebuddy',
        mode: 'smart',
        cwd: process.cwd(),
        prompt: 'hello',
        passthroughArgs: [],
      })
    } catch (error) {
      thrown = error
    }
  })

  assert.ok(thrown)
  assert.match(thrown.message, /CodeBuddy Code is not authenticated/)

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)

  const session = JSON.parse(readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.status, 'failed')
  assert.equal(session.backendSessionId, 'sess_auth_fail')
  assert.match(session.error, /CodeBuddy Code is not authenticated/)

  const eventsFile = join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl')
  assert.equal(existsSync(eventsFile), true)
  const events = readFileSync(eventsFile, 'utf-8')
  assert.match(events, /Not logged in/)
})

test.after(async () => {
  const loaded = autoModeModulePromise ? await autoModeModulePromise : null
  loaded?.cleanup()
})
