import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadWatchModule } from './watch-test-bundle.mjs'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const entryPath = join(cliRoot, 'dist', 'index.js')

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
  const tableName = (table) => table?.config?.name ?? table?.name ?? 'unknown'
  const locatorKey = (name, locator) => `${name}:${JSON.stringify(locator)}`
  const seed = (name, locator, row) => {
    stored.set(locatorKey(name, locator), row)
  }
  const inferLocator = (name, row) => {
    if (name === 'aiModel') return { id: row.id, isProvidedBy: row.isProvidedBy }
    return { id: row.id }
  }

  for (const row of rows.credentialRows ?? []) {
    seed('credential', { id: row.id }, row)
  }
  for (const row of rows.providerRows ?? []) {
    seed('aiProvider', { id: row.id }, row)
  }
  for (const row of rows.modelRows ?? []) {
    seed('aiModel', { id: row.id, isProvidedBy: row.isProvidedBy }, row)
  }

  const db = {
    async findByLocator(table, locator) {
      return stored.get(locatorKey(tableName(table), locator)) ?? null
    },
    async updateByLocator(table, locator, update) {
      const name = tableName(table)
      const key = locatorKey(name, locator)
      const next = { ...(stored.get(key) ?? {}), ...update }
      stored.set(key, next)
      operations.push({ op: 'update', table: name, locator, row: next })
      return next
    },
    async deleteByLocator(table, locator) {
      const name = tableName(table)
      const key = locatorKey(name, locator)
      const row = stored.get(key) ?? null
      stored.delete(key)
      operations.push({ op: 'delete', table: name, locator, row })
      return row
    },
    insert(table) {
      return {
        values(row) {
          return {
            async execute() {
              const name = tableName(table)
              const locator = inferLocator(name, row)
              stored.set(locatorKey(name, locator), row)
              operations.push({ op: 'insert', table: name, locator, row })
              return [row]
            },
          }
        },
      }
    },
  }
  const output = []
  const contexts = []

  return {
    db,
    operations,
    output,
    contexts,
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
    },
  }
}

test('linx login command always starts a fresh browser consent flow', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/login-command.ts')
  t.after(() => cleanup())

  const loginOptions = []
  const prompts = []
  const opened = []
  const output = []

  await module.runLinxLoginCommand({ url: 'https://id.undefineds.co/' }, {
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

  assert.equal(loginOptions.length, 1)
  assert.equal(loginOptions[0].issuerUrl, 'https://id.undefineds.co/')
  assert.equal(loginOptions[0].forceFresh, true)
  assert.deepEqual(opened, ['https://id.undefineds.co/.oidc/auth?client_id=test'])
  assert.deepEqual(prompts, ['redirect URL (leave empty to keep waiting): '])
  assert.match(output.join(''), /LinX login successful\./)
  assert.match(output.join(''), /session: browser-consent/)
})

test('linx login command does not reuse an existing browser session when forceFresh is enabled', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/login-command.ts')
  t.after(() => cleanup())

  const loginOptions = []
  await module.runLinxLoginCommand({ url: 'https://id.undefineds.co/' }, {
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

  assert.equal(loginOptions[0].forceFresh, true)
  assert.equal(loginOptions[0].forceRefreshExisting, undefined)
})

test('linx whoami reads the saved LinX account session', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'linx-cli-whoami-home-'))
  const linxDir = join(home, '.linx')

  t.after(() => {
    rmSync(home, { recursive: true, force: true })
  })

  mkdirSync(linxDir, { recursive: true })
  writeFileSync(join(linxDir, 'account.json'), JSON.stringify({
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
  const linxDir = join(home, '.linx')

  t.after(() => {
    rmSync(home, { recursive: true, force: true })
  })

  mkdirSync(linxDir, { recursive: true })
  writeFileSync(join(linxDir, 'account.json'), '{}')
  writeFileSync(join(linxDir, 'config.json'), '{}')
  writeFileSync(join(linxDir, 'secrets.json'), '{}')

  const { logFile, modulePath } = createFetchMock(t)
  const output = execCli(['logout'], {
    HOME: home,
    FAKE_FETCH_LOG: logFile,
  }, modulePath)

  assert.match(output, /Logged out\./)
  assert.equal(existsSync(join(linxDir, 'account.json')), false)
  assert.equal(existsSync(join(linxDir, 'config.json')), false)
  assert.equal(existsSync(join(linxDir, 'secrets.json')), false)
})

test('linx ai connect writes provider and credential config to Pod', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/ai-command.ts')
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

  const providerInsert = harness.operations.find((item) => item.op === 'insert' && item.table === 'aiProvider')
  const credentialInsert = harness.operations.find((item) => item.op === 'insert' && item.table === 'credential')
  const modelInsert = harness.operations.find((item) => item.op === 'insert' && item.table === 'aiModel')

  assert.deepEqual(harness.contexts, [undefined])
  assert.ok(providerInsert)
  assert.ok(credentialInsert)
  assert.ok(modelInsert)
  assert.equal(providerInsert.row.id, 'anthropic')
  assert.equal(providerInsert.row.baseUrl, 'https://api.anthropic.com/v1')
  assert.equal(providerInsert.row.hasModel, '/settings/ai/models/anthropic.ttl#claude-sonnet-4-20250514')
  assert.equal(credentialInsert.row.id, 'anthropic-default')
  assert.equal(credentialInsert.row.provider, 'anthropic')
  assert.equal(credentialInsert.row.service, 'ai')
  assert.equal(credentialInsert.row.apiKey, 'sk-ant-test-key')
  assert.equal(credentialInsert.row.defaultModel, undefined)
  assert.equal(modelInsert.row.id, 'claude-sonnet-4-20250514')
  assert.equal(modelInsert.row.displayName, 'claude-sonnet-4-20250514')
  assert.equal(modelInsert.row.isProvidedBy, 'anthropic')
})

test('linx ai disconnect removes provider credential config from Pod', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/ai-command.ts')
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
  const deletes = harness.operations.filter((item) => item.op === 'delete' && item.table === 'credential')
  assert.deepEqual(deletes.map((item) => item.locator.id).sort(), ['anthropic-default', 'claude-default'])
})

test('linx ai status prints configured cloud AI credentials', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/ai-command.ts')
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
      hasModel: '/settings/ai/models/anthropic.ttl#claude-sonnet-4-20250514',
    }],
    modelRows: [{
      id: 'claude-sonnet-4-20250514',
      displayName: 'Claude Sonnet 4',
      isProvidedBy: 'anthropic',
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

test('linx ai connect uses the resolved Pod context before ORM writes', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/ai-command.ts')
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
    && item.table === 'credential'
    && item.row.provider === 'openai'
    && item.row.apiKey === 'sk-openai-test-key'))
})
