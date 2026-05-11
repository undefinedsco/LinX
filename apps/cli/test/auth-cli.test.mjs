import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadWatchModule } from './watch-test-bundle.mjs'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const entryPath = join(cliRoot, 'dist', 'index.js')

function readRequests(logFile) {
  if (!existsSync(logFile)) {
    return []
  }

  return readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
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

function isAuthorized(headers) {
  return headers.authorization === 'Bearer pod_access_token'
    || headers.authorization === 'Bearer access-token'
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

  if (
    method === 'PATCH'
    && (
      pathname === '/profile/settings/ai/providers.ttl'
      || pathname === '/profile/settings/credentials.ttl'
      || pathname === '/profile/settings/ai/models.ttl'
    )
  ) {
    if (isAuthorized(headers)) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (method === 'GET' && pathname === '/profile/settings/credentials.ttl') {
    if (!isAuthorized(headers)) {
      return new Response('unauthorized', { status: 401 })
    }

    if (!process.env.FAKE_AI_STATUS_TTL) {
      return new Response('not_found', { status: 404 })
    }

    return new Response(process.env.FAKE_AI_STATUS_TTL, {
      status: 200,
      headers: { 'content-type': 'text/turtle' },
    })
  }

  if (method === 'GET' && pathname === '/profile/settings/ai/providers.ttl') {
    if (!isAuthorized(headers)) {
      return new Response('unauthorized', { status: 401 })
    }

    if (!process.env.FAKE_AI_STATUS_PROVIDERS_TTL) {
      return new Response('not_found', { status: 404 })
    }

    return new Response(process.env.FAKE_AI_STATUS_PROVIDERS_TTL, {
      status: 200,
      headers: { 'content-type': 'text/turtle' },
    })
  }

  if (method === 'GET' && pathname === '/profile/settings/ai/models.ttl') {
    if (!isAuthorized(headers)) {
      return new Response('unauthorized', { status: 401 })
    }

    if (!process.env.FAKE_AI_STATUS_MODELS_TTL) {
      return new Response('not_found', { status: 404 })
    }

    return new Response(process.env.FAKE_AI_STATUS_MODELS_TTL, {
      status: 200,
      headers: { 'content-type': 'text/turtle' },
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


function writeClientCredentialsLogin(home) {
  const linxDir = join(home, '.linx')
  mkdirSync(linxDir, { recursive: true })
  writeFileSync(join(linxDir, 'config.json'), JSON.stringify({
    url: 'https://account.test/',
    webId: 'https://pod.example/profile/card#me',
    authType: 'client_credentials',
  }))
  writeFileSync(join(linxDir, 'secrets.json'), JSON.stringify({
    clientId: 'cred_test',
    clientSecret: 'secret_test',
  }))
  writeFileSync(join(linxDir, 'account.json'), JSON.stringify({
    url: 'https://account.test/',
    email: 'browser-consent',
    token: 'oidc-session',
    webId: 'https://pod.example/profile/card#me',
    podUrl: 'https://pod.example/profile/',
    createdAt: '2026-03-15T00:00:00.000Z',
  }))
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
  const home = mkdtempSync(join(tmpdir(), 'linx-cli-ai-connect-home-'))
  t.after(() => {
    rmSync(home, { recursive: true, force: true })
  })

  const { logFile, modulePath } = createFetchMock(t)
  writeClientCredentialsLogin(home)

  const output = execCli([
    'ai',
    'connect',
    'anthropic',
    '--api-key',
    'sk-ant-test-key',
    '--model',
    'claude-sonnet-4-20250514',
  ], {
    HOME: home,
    FAKE_FETCH_LOG: logFile,
  }, modulePath)

  assert.match(output, /Connected AI provider: anthropic/)
  assert.match(output, /api-key: sk-a\*\*\*\*-key/)

  const requests = readRequests(logFile)
  const providerPatch = requests.find((item) => item.method === 'PATCH' && item.url === 'https://pod.example/profile/settings/ai/providers.ttl')
  const credentialPatch = requests.find((item) => item.method === 'PATCH' && item.url === 'https://pod.example/profile/settings/credentials.ttl')
  const modelPatch = requests.find((item) => item.method === 'PATCH' && item.url === 'https://pod.example/profile/settings/ai/models.ttl')

  assert.ok(providerPatch)
  assert.ok(credentialPatch)
  assert.ok(modelPatch)
  assert.match(providerPatch.body, /https:\/\/vocab\.xpod\.dev\/ai#Provider/)
  assert.match(providerPatch.body, /https:\/\/vocab\.xpod\.dev\/ai#baseUrl/)
  assert.match(providerPatch.body, /https:\/\/vocab\.xpod\.dev\/ai#hasModel/)
  assert.match(credentialPatch.body, /https:\/\/vocab\.xpod\.dev\/credential#Credential/)
  assert.match(credentialPatch.body, /https:\/\/vocab\.xpod\.dev\/credential#apiKey/)
  assert.doesNotMatch(credentialPatch.body, /defaultModel/)
  assert.match(modelPatch.body, /https:\/\/vocab\.xpod\.dev\/ai#Model/)
  assert.match(modelPatch.body, /https:\/\/vocab\.xpod\.dev\/ai#displayName/)
  assert.match(modelPatch.body, /https:\/\/vocab\.xpod\.dev\/ai#isProvidedBy/)
})

test('linx ai disconnect removes provider credential config from Pod', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'linx-cli-ai-disconnect-home-'))
  t.after(() => {
    rmSync(home, { recursive: true, force: true })
  })

  const { logFile, modulePath } = createFetchMock(t)
  writeClientCredentialsLogin(home)

  const output = execCli([
    'ai',
    'disconnect',
    'claude',
  ], {
    HOME: home,
    FAKE_FETCH_LOG: logFile,
  }, modulePath)

  assert.match(output, /Disconnected AI provider: anthropic/)

  const requests = readRequests(logFile)
  const credentialPatches = requests.filter((item) =>
    item.method === 'PATCH' && item.url === 'https://pod.example/profile/settings/credentials.ttl')

  assert.ok(credentialPatches.some((item) => /https:\/\/pod\.example\/profile\/settings\/ai\/providers\.ttl#anthropic/.test(item.body)))
  assert.ok(credentialPatches.some((item) => /https:\/\/pod\.example\/profile\/settings\/ai\/providers\.ttl#claude/.test(item.body)))
})

test('linx ai status prints configured cloud AI credentials', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'linx-cli-ai-status-home-'))
  const linxDir = join(home, '.linx')

  t.after(() => {
    rmSync(home, { recursive: true, force: true })
  })

  mkdirSync(linxDir, { recursive: true })
  writeFileSync(join(linxDir, 'config.json'), JSON.stringify({
    url: 'https://account.test/',
    webId: 'https://pod.example/profile/card#me',
    authType: 'client_credentials',
  }))
  writeFileSync(join(linxDir, 'secrets.json'), JSON.stringify({
    clientId: 'cred_test',
    clientSecret: 'secret_test',
  }))

  const { logFile, modulePath } = createFetchMock(t)
  const output = execCli([
    'ai',
    'status',
    'anthropic',
  ], {
    HOME: home,
    FAKE_FETCH_LOG: logFile,
    FAKE_AI_STATUS_TTL: `<https://pod.example/profile/settings/credentials.ttl#anthropic-default> a <https://vocab.xpod.dev/credential#Credential> ;
  <https://vocab.xpod.dev/credential#service> "ai" ;
  <https://vocab.xpod.dev/credential#status> "active" ;
  <https://vocab.xpod.dev/credential#provider> <https://pod.example/profile/settings/ai/providers.ttl#anthropic> ;
  <https://vocab.xpod.dev/credential#apiKey> "sk-ant-test-key" .
`,
    FAKE_AI_STATUS_PROVIDERS_TTL: `<https://pod.example/profile/settings/ai/providers.ttl#anthropic> a <https://vocab.xpod.dev/ai#Provider> ;
  <https://vocab.xpod.dev/ai#baseUrl> "https://api.anthropic.com/v1" ;
  <https://vocab.xpod.dev/ai#hasModel> <https://pod.example/profile/settings/ai/models.ttl#claude-sonnet-4-20250514> .
`,
  }, modulePath)

  assert.match(output, /provider: anthropic/)
  assert.match(output, /model: claude-sonnet-4-20250514/)
  assert.match(output, /api-key: sk-a\*\*\*\*-key/)
})

test('linx ai connect accepts oidc oauth login and writes provider config to Pod', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'linx-cli-ai-connect-oidc-home-'))
  t.after(() => {
    rmSync(home, { recursive: true, force: true })
  })

  const { logFile, modulePath } = createFetchMock(t)
  const linxDir = join(home, '.linx')
  mkdirSync(linxDir, { recursive: true })
  writeFileSync(join(linxDir, 'config.json'), JSON.stringify({
    url: 'https://id.undefineds.co/',
    webId: 'https://pod.example/profile/card#me',
    authType: 'oidc_oauth',
  }))
  writeFileSync(join(linxDir, 'secrets.json'), JSON.stringify({
    oidcRefreshToken: 'refresh-token',
    oidcAccessToken: 'access-token',
    oidcExpiresAt: '2030-01-01T00:00:00.000Z',
    oidcClientId: 'client-123',
  }))
  writeFileSync(join(linxDir, 'account.json'), JSON.stringify({
    url: 'https://id.undefineds.co/',
    email: 'browser-consent',
    token: 'oidc-session',
    webId: 'https://pod.example/profile/card#me',
    podUrl: 'https://pod.example/profile/',
    createdAt: '2026-03-15T00:00:00.000Z',
  }))

  const output = execCli([
    'ai',
    'connect',
    'codex',
    '--api-key',
    'sk-openai-test-key',
  ], {
    HOME: home,
    FAKE_FETCH_LOG: logFile,
  }, modulePath)

  assert.match(output, /Connected AI provider: openai/)
  assert.match(output, /api-key: sk-o\*\*\*\*-key/)

  const requests = readRequests(logFile)
  const providerPatch = requests.find((item) => item.method === 'PATCH' && item.url === 'https://pod.example/profile/settings/ai/providers.ttl')
  const credentialPatch = requests.find((item) => item.method === 'PATCH' && item.url === 'https://pod.example/profile/settings/credentials.ttl')
  assert.equal(providerPatch?.headers.authorization, 'Bearer access-token')
  assert.equal(credentialPatch?.headers.authorization, 'Bearer access-token')
})
