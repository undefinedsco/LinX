import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const entryPath = join(cliRoot, 'dist', 'index.js')

function solidAuthDir(home) {
  return join(home, '.solid', 'auth')
}

function solidCredentialsPath(home) {
  return join(solidAuthDir(home), 'credentials.json')
}

function solidAccountPath(home) {
  return join(solidAuthDir(home), 'account.json')
}

function solidOidcStorageDir(home) {
  return join(solidAuthDir(home), 'oidc-storage')
}

function createFetchMock(t) {
  const root = mkdtempSync(join(tmpdir(), 'linx-cli-fetch-mock-'))
  const modulePath = join(root, 'fake-fetch.mjs')
  const logFile = join(root, 'requests.jsonl')
  const baseUrl = 'https://account.test/'

  writeFileSync(
    modulePath,
    `import { appendFileSync } from 'node:fs'

function normalizeHeaders(input) {
  const headers = {}
  if (!input) return headers
  if (Array.isArray(input)) {
    for (const [key, value] of input) headers[String(key).toLowerCase()] = String(value)
    return headers
  }
  if (typeof input.entries === 'function') {
    for (const [key, value] of input.entries()) headers[String(key).toLowerCase()] = String(value)
    return headers
  }
  for (const [key, value] of Object.entries(input)) headers[String(key).toLowerCase()] = String(value)
  return headers
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : String(input.url)
  const method = String(init.method || 'GET').toUpperCase()
  const headers = normalizeHeaders(init.headers)
  const body = typeof init.body === 'string' ? init.body : init.body ? String(init.body) : ''

  appendFileSync(process.env.FAKE_FETCH_LOG, JSON.stringify({ method, url, headers, body }) + '\\n')

  const parsed = new URL(url)
  const pathname = parsed.pathname

  if (method === 'GET' && pathname === '/.account/' && !headers.authorization) {
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (method === 'POST' && pathname === '/.account/login/password/') {
    const payload = JSON.parse(body || '{}')
    if (payload.email === 'dev@example.com' && payload.password === 'passw0rd') {
      return new Response(JSON.stringify({ authorization: 'token_test' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'invalid_credentials' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (method === 'GET' && pathname === '/.account/' && headers.authorization === 'CSS-Account-Token token_test') {
    return new Response(JSON.stringify({
      controls: {
        account: {
          clientCredentials: 'https://account.test/.account/client-credentials/',
        },
      },
      webIds: {
        'https://pod.example/profile/card#me': 'https://account.test/pod/',
      },
      clientCredentials: {
        'https://account.test/.account/client-credentials/cred_test/': 'https://pod.example/profile/card#me',
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (method === 'POST' && pathname === '/.account/client-credentials/') {
    const payload = JSON.parse(body || '{}')
    return new Response(JSON.stringify({
      id: 'cred_test',
      secret: 'secret_test',
      label: payload.name,
      webId: payload.webId,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (method === 'DELETE' && pathname === '/.account/client-credentials/cred_test/') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (method === 'GET' && pathname === '/.well-known/openid-configuration') {
    return new Response(JSON.stringify({
      token_endpoint: 'https://account.test/token',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (method === 'POST' && pathname === '/token') {
    const params = new URLSearchParams(body)
    if (params.get('client_id') === 'cred_test' && params.get('client_secret') === 'secret_test') {
      return new Response(JSON.stringify({
        access_token: 'pod_access_token',
        expires_in: 3600,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'invalid_client' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ error: 'not_found' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  })
}
`,
  )

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  return { baseUrl, logFile, modulePath }
}

function execCli(args, env, modulePath) {
  return execFileSync(process.execPath, ['--import', modulePath, entryPath, ...args], {
    cwd: cliRoot,
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf-8',
  })
}

function createAiCommandHarness(rows = {}) {
  const operations = []
  const stored = new Map()
  const resourceName = (resource) => resource?.config?.name ?? resource?.name ?? 'unknown'
  const recordKey = (name, id) => `${name}:${id}`
  const resolveId = (name, target) => {
    if (typeof target === 'string') return target
    if (name === 'aiModel') {
      const rawId = String(target.id ?? '')
      if (rawId.includes('#')) {
        return rawId.replace(/^\/?settings\/providers\//, '')
      }
      const providerRef = String(target.isProvidedBy ?? '')
      const provider = providerRef.includes('#') ? providerRef.split('#').pop() : providerRef.split('/').pop()
      return `${provider?.replace(/\.ttl$/, '')}.ttl#${rawId}`
    }
    return String(target.id)
  }
  const seed = (name, id, row) => {
    stored.set(recordKey(name, id), row)
  }
  const inferId = (name, row) => {
    if (name === 'aiModel') return resolveId(name, { id: row.id, isProvidedBy: row.isProvidedBy })
    return row.id
  }

  for (const row of rows.credentialRows ?? []) {
    seed('credential', row.id, row)
  }
  for (const row of rows.providerRows ?? []) {
    seed('aiProvider', row.id, row)
  }
  for (const row of rows.modelRows ?? []) {
    seed('aiModel', inferId('aiModel', row), row)
  }

  const db = {
    resolveLocatorId(resource, locator) {
      return resolveId(resourceName(resource), locator)
    },
    async findById(resource, id) {
      return stored.get(recordKey(resourceName(resource), id)) ?? null
    },
    async updateById(resource, id, update) {
      const name = resourceName(resource)
      const key = recordKey(name, id)
      const next = { ...(stored.get(key) ?? {}), ...update }
      stored.set(key, next)
      operations.push({ op: 'update', resource: name, id, row: next })
      return next
    },
    async deleteById(resource, id) {
      const name = resourceName(resource)
      const key = recordKey(name, id)
      const row = stored.get(key) ?? null
      stored.delete(key)
      operations.push({ op: 'delete', resource: name, id, row })
      return row
    },
    insert(resource) {
      return {
        values(row) {
          return {
            async execute() {
              const name = resourceName(resource)
              const id = inferId(name, row)
              stored.set(recordKey(name, id), row)
              operations.push({ op: 'insert', resource: name, id, row })
              return [row]
            },
          }
        },
      }
    },
  }
  const output = []
  const contexts = []
  const syncResults = []

  return {
    db,
    operations,
    output,
    contexts,
    syncResults,
    dependencies: {
      async resolvePodWriteContext(urlOverride) {
        contexts.push(urlOverride)
        return {
          accessToken: 'test-access-token',
          podUrl: 'https://pod.example/profile/',
          webId: 'https://pod.example/profile/card#me',
        }
      },
      createDb() {
        return db
      },
      async loadAiConfigRows() {
        return {
          credentialRows: rows.credentialRows ?? [],
          providerRows: rows.providerRows ?? [],
          modelRows: rows.modelRows ?? [],
        }
      },
      write(chunk) {
        output.push(chunk)
      },
      syncNow() {
        return new Date('2026-05-21T00:00:00.000Z')
      },
      onSyncResult(result) {
        syncResults.push(result)
      },
    },
  }
}

test('linx login command reuses an existing browser consent session by default', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/login-command.ts')
  t.after(() => cleanup())

  const loginOptions = []
  const output = []

  await module.runLinxLoginCommand({ url: 'https://id.undefineds.co/' }, {
    write(chunk) {
      output.push(chunk)
    },
    async openBrowser(url) {
      throw new Error(`browser should not open when existing session is reused: ${url}`)
    },
    async promptText(prompt) {
      throw new Error(`manual redirect prompt should not open when existing session is reused: ${prompt}`)
    },
    async ensureBrowserConsentLogin(options) {
      loginOptions.push(options)
      return {
        url: 'https://id.undefineds.co/',
        webId: 'https://id.undefineds.co/ganbb/profile/card#me',
        reusedExistingSession: true,
        tokenSet: {},
        credentialsToSave: {},
      }
    },
  })

  assert.equal(loginOptions.length, 1)
  assert.equal(loginOptions[0].issuerUrl, 'https://id.undefineds.co/')
  assert.equal(loginOptions[0].forceFresh, false)
  assert.match(output.join(''), /LinX login successful\./)
  assert.match(output.join(''), /session: reused/)
})

test('linx login --fresh starts a fresh browser consent flow', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/login-command.ts')
  t.after(() => cleanup())

  const loginOptions = []
  const prompts = []
  const opened = []
  const output = []

  await module.runLinxLoginCommand({ url: 'https://id.undefineds.co/', fresh: true }, {
    write(chunk) {
      output.push(chunk)
    },
    async openBrowser(url) {
      opened.push(url)
    },
    async promptText(prompt) {
      prompts.push(prompt)
      return '  http://127.0.0.1:1234/auth/callback?code=abc&state=state  '
    },
    async ensureBrowserConsentLogin(options) {
      loginOptions.push(options)
      options.onAuthUrl('https://id.undefineds.co/.oidc/auth?client_id=test')
      await options.openBrowser('https://id.undefineds.co/.oidc/auth?client_id=test')
      assert.equal(await options.manualRedirectUrl(), 'http://127.0.0.1:1234/auth/callback?code=abc&state=state')
      return {
        url: 'https://id.undefineds.co/',
        webId: 'https://id.undefineds.co/ganbb/profile/card#me',
        reusedExistingSession: false,
        tokenSet: {},
        credentialsToSave: {},
      }
    },
  })

  assert.equal(loginOptions[0].forceFresh, true)
  assert.equal(loginOptions[0].forceRefreshExisting, undefined)
  assert.deepEqual(opened, ['https://id.undefineds.co/.oidc/auth?client_id=test'])
  assert.deepEqual(prompts, ['redirect URL (leave empty to keep waiting): '])
  assert.match(output.join(''), /LinX login successful\./)
  assert.match(output.join(''), /session: browser-consent/)
})

test('linx whoami reads the saved Solid auth account session', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'linx-cli-whoami-home-'))
  const authDir = solidAuthDir(home)

  t.after(() => {
    rmSync(home, { recursive: true, force: true })
  })

  mkdirSync(authDir, { recursive: true })
  writeFileSync(solidAccountPath(home), JSON.stringify({
    url: 'https://account.test/',
    email: 'dev@example.com',
    token: 'token_test',
    webId: 'https://pod.example/profile/card#me',
    podUrl: 'https://pod.example/profile/',
    createdAt: '2026-03-15T00:00:00.000Z',
  }))

  const { logFile, modulePath } = createFetchMock(t)
  const output = execCli(['whoami', '--verbose'], {
    HOME: home,
    FAKE_FETCH_LOG: logFile,
  }, modulePath)

  assert.match(output, /email: dev@example\.com/)
  assert.match(output, /server: https:\/\/account\.test\//)
  assert.match(output, /webId: https:\/\/pod\.example\/profile\/card#me/)
  assert.match(output, /pod: https:\/\/pod\.example\/profile\//)
})

test('linx logout removes account session and client credentials', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'linx-cli-logout-home-'))
  const authDir = solidAuthDir(home)
  const oidcStorageDir = solidOidcStorageDir(home)

  t.after(() => {
    rmSync(home, { recursive: true, force: true })
  })

  mkdirSync(authDir, { recursive: true })
  mkdirSync(oidcStorageDir, { recursive: true })
  writeFileSync(solidAccountPath(home), '{}')
  writeFileSync(solidCredentialsPath(home), '{}')
  writeFileSync(join(oidcStorageDir, encodeURIComponent('solidClientAuthn:registeredSessions')), '["stale-session"]')

  const { logFile, modulePath } = createFetchMock(t)
  const output = execCli(['logout'], {
    HOME: home,
    FAKE_FETCH_LOG: logFile,
  }, modulePath)

  assert.match(output, /Logged out\./)
  assert.equal(existsSync(solidAccountPath(home)), false)
  assert.equal(existsSync(solidCredentialsPath(home)), false)
  assert.equal(existsSync(oidcStorageDir), false)
})

test('linx logout does not clear Pod-backed AI provider credentials', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/login-command.ts')
  t.after(() => cleanup())

  const originalHome = process.env.HOME
  const home = mkdtempSync(join(tmpdir(), 'linx-cli-logout-ai-home-'))
  process.env.HOME = home
  t.after(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    rmSync(home, { recursive: true, force: true })
  })

  const output = []
  module.runLinxLogoutCommand({
    write(chunk) {
      output.push(chunk)
    },
  })

  assert.match(output.join(''), /Local Solid auth credentials removed/)
  assert.doesNotMatch(output.join(''), /AI provider|API key|provider credential/i)
})

test('linx ai connect writes provider and credential config to Pod', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/ai-command.ts')
  t.after(() => cleanup())

  const harness = createAiCommandHarness()
  await module.runAiCommand({
    action: 'connect',
    provider: 'anthropic',
    'api-key': 'sk-ant-test-key',
    model: 'claude-sonnet-4-20250514',
  }, harness.dependencies)

  const output = harness.output.join('')
  assert.match(output, /Connected AI provider: anthropic/)
  assert.match(output, /api-key: sk-a\*\*\*\*-key/)

  const providerInsert = harness.operations.find((item) => item.op === 'insert' && item.resource === 'aiProvider')
  const credentialInsert = harness.operations.find((item) => item.op === 'insert' && item.resource === 'credential')
  const modelInsert = harness.operations.find((item) => item.op === 'insert' && item.resource === 'aiModel')

  assert.deepEqual(harness.contexts, [undefined])
  assert.ok(providerInsert)
  assert.ok(credentialInsert)
  assert.ok(modelInsert)
  assert.equal(providerInsert.row.id, 'anthropic')
  assert.equal(providerInsert.row.baseUrl, 'https://api.anthropic.com/v1')
  assert.equal(providerInsert.row.hasModel, '/settings/providers/anthropic.ttl#claude-sonnet-4-20250514')
  assert.equal(credentialInsert.row.id, 'anthropic-default')
  assert.equal(credentialInsert.row.provider, '/settings/providers/anthropic.ttl')
  assert.equal(credentialInsert.row.service, 'ai')
  assert.equal(credentialInsert.row.apiKey, 'sk-ant-test-key')
  assert.equal(credentialInsert.row.defaultModel, undefined)
  assert.equal(modelInsert.row.id, 'anthropic.ttl#claude-sonnet-4-20250514')
  assert.equal(modelInsert.row.displayName, 'claude-sonnet-4-20250514')
  assert.equal(modelInsert.row.isProvidedBy, '/settings/providers/anthropic.ttl')
  assert.equal(harness.syncResults.length, 1)
  assert.deepEqual(harness.syncResults[0], {
    source: 'cli-ai-command',
    target: 'pod',
    direction: 'local-to-core',
    plane: 'control-plane',
    authority: 'core',
    attempted: 1,
    applied: 1,
    skipped: 0,
    failed: 0,
    failures: [],
    startedAt: '2026-05-21T00:00:00.000Z',
    completedAt: '2026-05-21T00:00:00.000Z',
    status: 'completed',
    metadata: {
      action: 'ai.connect',
      resourceBindings: {
        provider: {
          uri: '/settings/providers/anthropic.ttl',
          local: 'anthropic',
        },
        model: {
          uri: '/settings/providers/anthropic.ttl#claude-sonnet-4-20250514',
          local: 'claude-sonnet-4-20250514',
        },
      },
    },
  })
})

test('linx ai disconnect removes provider credential config from Pod', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/ai-command.ts')
  t.after(() => cleanup())

  const harness = createAiCommandHarness({
    credentialRows: [
      {
        id: 'anthropic-default',
        provider: 'anthropic',
        service: 'ai',
        status: 'active',
        apiKey: 'sk-ant-test-key',
      },
      {
        id: 'claude-default',
        provider: 'claude',
        service: 'ai',
        status: 'active',
        apiKey: 'sk-claude-test-key',
      },
      {
        id: 'openai-default',
        provider: 'openai',
        service: 'ai',
        status: 'active',
        apiKey: 'sk-openai-test-key',
      },
    ],
  })

  await module.runAiCommand({
    action: 'disconnect',
    provider: 'claude',
  }, harness.dependencies)

  assert.match(harness.output.join(''), /Disconnected AI provider: anthropic/)
  const deletes = harness.operations.filter((item) => item.op === 'delete' && item.resource === 'credential')
  assert.deepEqual(deletes.map((item) => item.id).sort(), ['anthropic-default', 'claude-default'])
  assert.equal(harness.syncResults.length, 1)
  assert.deepEqual(harness.syncResults[0], {
    source: 'cli-ai-command',
    target: 'pod',
    direction: 'local-to-core',
    plane: 'control-plane',
    authority: 'core',
    attempted: 1,
    applied: 1,
    skipped: 0,
    failed: 0,
    failures: [],
    startedAt: '2026-05-21T00:00:00.000Z',
    completedAt: '2026-05-21T00:00:00.000Z',
    status: 'completed',
    metadata: {
      action: 'ai.disconnect',
      resourceBindings: {
        provider: {
          uri: '/settings/providers/anthropic.ttl',
          local: 'anthropic',
        },
      },
    },
  })
})

test('linx ai status prints configured cloud AI credentials', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/ai-command.ts')
  t.after(() => cleanup())

  const harness = createAiCommandHarness({
    credentialRows: [{
      id: 'anthropic-default',
      provider: 'anthropic',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-ant-test-key',
    }],
    providerRows: [{
      id: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      hasModel: '/settings/providers/anthropic.ttl#claude-sonnet-4-20250514',
    }],
    modelRows: [{
      id: 'claude-sonnet-4-20250514',
      displayName: 'Claude Sonnet 4',
      isProvidedBy: '/settings/providers/anthropic.ttl',
      status: 'active',
    }],
  })

  await module.runAiCommand({
    action: 'status',
    provider: 'anthropic',
  }, harness.dependencies)

  const output = harness.output.join('')

  assert.match(output, /provider: anthropic/)
  assert.match(output, /model: claude-sonnet-4-20250514/)
  assert.match(output, /api-key: sk-a\*\*\*\*-key/)
})

test('linx ai status reads explicit provider config without provider/model collection scans', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/ai-command.ts')
  t.after(() => cleanup())

  const output = []
  const selectResources = []
  const findByIds = []
  const resourceName = (resource) => resource?.config?.name ?? resource?.name ?? 'unknown'
  const db = {
    resolveLocatorId(resource, locator) {
      assert.equal(resourceName(resource), 'aiModel')
      assert.deepEqual(locator, {
        id: 'gpt-5.5',
        isProvidedBy: '/settings/providers/openai.ttl',
      })
      return 'openai.ttl#gpt-5.5'
    },
    select() {
      return {
        from(resource) {
          return {
            async execute() {
              selectResources.push(resourceName(resource))
              if (resourceName(resource) !== 'credential') {
                throw new Error(`unexpected collection scan: ${resourceName(resource)}`)
              }
              return [{
                id: 'openai-default',
                provider: '/settings/providers/openai.ttl',
                service: 'ai',
                status: 'active',
                apiKey: 'sk-openai-test-key',
              }]
            },
          }
        },
      }
    },
    async findById(resource, id) {
      findByIds.push([resourceName(resource), id])
      if (resourceName(resource) === 'aiProvider' && id === 'openai') {
        return {
          id: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          hasModel: '/settings/providers/openai.ttl#gpt-5.5',
        }
      }
      if (resourceName(resource) === 'aiModel' && id === 'openai.ttl#gpt-5.5') {
        return {
          id: 'gpt-5.5',
          displayName: 'GPT-5.5',
          isProvidedBy: '/settings/providers/openai.ttl',
          status: 'active',
        }
      }
      return null
    },
  }

  await module.runAiCommand({
    action: 'status',
    provider: 'codex',
  }, {
    async resolvePodWriteContext() {
      return {
        accessToken: 'test-access-token',
        podUrl: 'https://pod.example/profile/',
        webId: 'https://pod.example/profile/card#me',
      }
    },
    createDb() {
      return db
    },
    write(chunk) {
      output.push(chunk)
    },
  })

  assert.deepEqual(selectResources, ['credential'])
  assert.deepEqual(findByIds, [
    ['aiProvider', 'openai'],
    ['aiModel', 'openai.ttl#gpt-5.5'],
  ])
  assert.match(output.join(''), /provider: openai/)
  assert.match(output.join(''), /model: gpt-5\.5/)
  assert.match(output.join(''), /api-key: sk-o\*\*\*\*-key/)
})

test('linx ai connect deletes replaced provider-scoped model config', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/ai-command.ts')
  t.after(() => cleanup())

  const harness = createAiCommandHarness({
    credentialRows: [{
      id: 'anthropic-default',
      provider: '/settings/providers/anthropic.ttl',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-ant-test-key',
    }],
    providerRows: [{
      id: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      hasModel: '/settings/providers/anthropic.ttl#old-model',
    }],
    modelRows: [{
      id: 'old-model',
      displayName: 'Old Model',
      isProvidedBy: '/settings/providers/anthropic.ttl',
      status: 'active',
    }],
  })

  await module.runAiCommand({
    action: 'connect',
    provider: 'anthropic',
    'api-key': 'sk-ant-test-key',
    model: 'new-model',
  }, harness.dependencies)

  const modelDeletes = harness.operations.filter((item) => item.op === 'delete' && item.resource === 'aiModel')
  assert.deepEqual(modelDeletes.map((item) => item.id), ['anthropic.ttl#old-model'])
})

test('linx ai connect uses the resolved Pod context before ORM writes', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/ai-command.ts')
  t.after(() => cleanup())

  const harness = createAiCommandHarness()
  const createDbContexts = []

  await module.runAiCommand({
    action: 'connect',
    provider: 'codex',
    'api-key': 'sk-openai-test-key',
    url: 'https://id.undefineds.co/',
  }, {
    ...harness.dependencies,
    createDb(context) {
      createDbContexts.push(context)
      return harness.db
    },
  })

  assert.deepEqual(harness.contexts, ['https://id.undefineds.co/'])
  assert.deepEqual(createDbContexts, [{
    accessToken: 'test-access-token',
    podUrl: 'https://pod.example/profile/',
    webId: 'https://pod.example/profile/card#me',
  }])
  assert.match(harness.output.join(''), /Connected AI provider: openai/)
  assert.ok(harness.operations.some((item) =>
    item.op === 'insert'
    && item.resource === 'credential'
    && item.row.provider === '/settings/providers/openai.ttl'
    && item.row.apiKey === 'sk-openai-test-key'))
})
