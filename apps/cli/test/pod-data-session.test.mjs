import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('createPodDataSession normalizes OIDC credentials into a restored Pod session capability', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  const credentials = {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'oidc_oauth',
    sourceDir: '/tmp/linx',
    secrets: {
      oidcAccessToken: 'access-token',
      oidcRefreshToken: 'refresh-token',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
    },
  }

  let restoreCalls = 0
  const fetchCalls = []
  let logoutCalls = 0
  const runtime = {
    loadCredentials() {
      return credentials
    },
    getClientCredentials() {
      return null
    },
    async getOidcAccessToken() {
      return 'access-token'
    },
    async restoreStoredOidcSession() {
      restoreCalls += 1
      return {
        info: {
          isLoggedIn: true,
          webId: credentials.webId,
        },
        async fetch(url, init) {
          fetchCalls.push({ url: String(url), method: init?.method ?? 'GET' })
          return new Response(null, { status: 200 })
        },
        async logout() {
          logoutCalls += 1
        },
      }
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
  }

  const session = await module.createPodDataSession(runtime)

  assert.equal(session?.webId, credentials.webId)
  assert.equal(session?.podUrl, 'https://id.undefineds.co/alice/')
  assert.equal(session?.solidSession.info.podUrl, 'https://id.undefineds.co/alice/')
  assert.equal(restoreCalls, 1)

  await session.fetch('https://id.undefineds.co/alice/.data/test.ttl')
  await session.solidSession.fetch('https://id.undefineds.co/alice/.data/test.ttl', { method: 'HEAD' })
  await session.close()

  assert.deepEqual(fetchCalls, [
    { url: 'https://id.undefineds.co/alice/.data/test.ttl', method: 'GET' },
    { url: 'https://id.undefineds.co/alice/.data/test.ttl', method: 'HEAD' },
  ])
  assert.equal(logoutCalls, 0)
})

test('Pod data session strips caller content-length before Solid session fetch', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  const credentials = {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'oidc_oauth',
    sourceDir: '/tmp/linx',
    secrets: {
      oidcAccessToken: 'access-token',
      oidcRefreshToken: 'refresh-token',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
    },
  }
  const fetchCalls = []
  const runtime = {
    loadCredentials() {
      return credentials
    },
    getClientCredentials() {
      return null
    },
    async getOidcAccessToken() {
      return 'access-token'
    },
    async restoreStoredOidcSession() {
      return {
        info: {
          isLoggedIn: true,
          webId: credentials.webId,
        },
        async fetch(url, init) {
          const headers = new Headers(init?.headers)
          fetchCalls.push({
            url: String(url),
            method: init?.method ?? 'GET',
            contentLength: headers.get('content-length'),
            contentType: headers.get('content-type'),
            body: init?.body,
          })
          return new Response('ok', { status: 200 })
        },
        async logout() {},
      }
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
  }

  const session = await module.createPodDataSession(runtime)
  await session.fetch('https://id.undefineds.co/alice/.data/-/sparql', {
    method: 'POST',
    headers: {
      'content-length': '2457',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'query=select',
  })
  await session.runtimeFetch('https://api.undefineds.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-length': '128',
      'content-type': 'application/json',
    },
    body: '{}',
  })

  assert.deepEqual(fetchCalls, [
    {
      url: 'https://id.undefineds.co/alice/.data/-/sparql',
      method: 'POST',
      contentLength: null,
      contentType: 'application/x-www-form-urlencoded',
      body: 'query=select',
    },
    {
      url: 'https://api.undefineds.co/v1/chat/completions',
      method: 'POST',
      contentLength: null,
      contentType: 'application/json',
      body: '{}',
    },
  ])
})

test('createPodDataSession fails fast when client credentials session login hangs', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  const runtime = {
    authTimeoutMs: 5,
    loadCredentials() {
      return {
        url: 'https://id.undefineds.co/',
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        authType: 'client_credentials',
        sourceDir: '/tmp/linx',
        secrets: {
          clientId: 'id',
          clientSecret: 'secret',
        },
      }
    },
    getClientCredentials(credentials) {
      return credentials.secrets
    },
    async getOidcAccessToken() {
      throw new Error('oidc should not be used')
    },
    async restoreStoredOidcSession() {
      throw new Error('oidc should not be used')
    },
    async authenticate() {
      return new Promise(() => undefined)
    },
  }

  await assert.rejects(
    () => module.createPodDataSession(runtime),
    /LinX Pod client credentials authentication timed out/,
  )
})

test('OIDC runtime auth token fails fast when token refresh hangs', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  const runtime = {
    authTimeoutMs: 5,
    loadCredentials() {
      return {
        url: 'https://id.undefineds.co/',
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        authType: 'oidc_oauth',
        sourceDir: '/tmp/linx',
        secrets: {
          oidcAccessToken: 'access-token',
          oidcRefreshToken: 'refresh-token',
          oidcExpiresAt: '2030-01-01T00:00:00.000Z',
        },
      }
    },
    getClientCredentials() {
      return null
    },
    getOidcAccessToken() {
      return new Promise(() => undefined)
    },
    async restoreStoredOidcSession() {
      return {
        info: {
          isLoggedIn: true,
          webId: 'https://id.undefineds.co/alice/profile/card#me',
        },
        async fetch() {
          return new Response(null, { status: 200 })
        },
        async logout() {},
      }
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
  }

  const session = await module.createPodDataSession(runtime)
  await assert.rejects(
    () => session.getRuntimeAuthToken(),
    /LinX Pod OIDC token refresh timed out/,
  )
})

test('runtimeFetch reuses Solid session auth without applying Pod data fetch timeout', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  const credentials = {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'oidc_oauth',
    sourceDir: '/tmp/linx',
    secrets: {
      oidcAccessToken: 'access-token',
      oidcRefreshToken: 'refresh-token',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
    },
  }
  const runtime = {
    fetchTimeoutMs: 5,
    loadCredentials() {
      return credentials
    },
    getClientCredentials() {
      return null
    },
    async getOidcAccessToken() {
      return 'access-token'
    },
    async restoreStoredOidcSession() {
      return {
        info: {
          isLoggedIn: true,
          webId: credentials.webId,
        },
        async fetch(url) {
          if (String(url).includes('/v1/chat/completions')) {
            await new Promise((resolve) => setTimeout(resolve, 25))
            return new Response('runtime ok', { status: 200 })
          }
          return new Promise(() => undefined)
        },
        async logout() {},
      }
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
  }

  const session = await module.createPodDataSession(runtime)

  await assert.rejects(
    () => session.fetch('https://id.undefineds.co/alice/.data/slow.ttl'),
    /LinX Pod request timed out after 0s/,
  )

  const runtimeResponse = await session.runtimeFetch('https://api.undefineds.co/v1/chat/completions', { method: 'POST' })
  assert.equal(await runtimeResponse.text(), 'runtime ok')
})

test('runtimeFetch normalizes legacy Pod timeout labels for Cloud chat completions', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  const credentials = {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'oidc_oauth',
    sourceDir: '/tmp/linx',
    secrets: {
      oidcAccessToken: 'access-token',
      oidcRefreshToken: 'refresh-token',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
    },
  }
  const runtime = {
    loadCredentials() {
      return credentials
    },
    getClientCredentials() {
      return null
    },
    async getOidcAccessToken() {
      return 'access-token'
    },
    async restoreStoredOidcSession() {
      return {
        info: {
          isLoggedIn: true,
          webId: credentials.webId,
        },
        async fetch(url) {
          throw new Error(`LinX Pod request timed out after 30s: POST ${url}`)
        },
        async logout() {},
      }
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
  }

  const session = await module.createPodDataSession(runtime)

  await assert.rejects(
    () => session.runtimeFetch('https://api.undefineds.co/v1/chat/completions', { method: 'POST' }),
    (error) => {
      assert.equal(error.message, 'LinX Cloud request timed out after 30s.')
      assert.doesNotMatch(error.message, /LinX Pod request/)
      assert.match(error.cause?.message ?? '', /LinX Pod request timed out/)
      return true
    },
  )
})

test('Pod data fetch does not apply Pod timeout to LinX cloud chat completions', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  const credentials = {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'oidc_oauth',
    sourceDir: '/tmp/linx',
    secrets: {
      oidcAccessToken: 'access-token',
      oidcRefreshToken: 'refresh-token',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
    },
  }
  const runtime = {
    fetchTimeoutMs: 5,
    loadCredentials() {
      return credentials
    },
    getClientCredentials() {
      return null
    },
    async getOidcAccessToken() {
      return 'access-token'
    },
    async restoreStoredOidcSession() {
      return {
        info: {
          isLoggedIn: true,
          webId: credentials.webId,
        },
        async fetch(url) {
          if (String(url).includes('/v1/chat/completions')) {
            await new Promise((resolve) => setTimeout(resolve, 25))
            return new Response('completion ok', { status: 200 })
          }
          return new Promise(() => undefined)
        },
        async logout() {},
      }
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
  }

  const session = await module.createPodDataSession(runtime)
  const response = await session.fetch('https://api.undefineds.co/v1/chat/completions', { method: 'POST' })

  assert.equal(await response.text(), 'completion ok')
})

test('Pod data fetch does not classify LinX runtime API as Pod storage even when cached Pod URL is wrong', async (t) => {
  const previousHome = process.env.HOME
  const homeDir = mkdtempSync(join(tmpdir(), 'linx-pod-session-home-'))
  mkdirSync(join(homeDir, '.linx'), { recursive: true })
  writeFileSync(join(homeDir, '.linx', 'account.json'), `${JSON.stringify({
    url: 'https://id.undefineds.co/',
    email: 'browser-consent',
    token: 'oidc-session',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    podUrl: 'https://api.undefineds.co/v1/',
    createdAt: '2026-01-01T00:00:00.000Z',
  })}\n`, 'utf-8')
  process.env.HOME = homeDir
  t.after(() => {
    if (previousHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = previousHome
    }
    rmSync(homeDir, { recursive: true, force: true })
  })

  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  const credentials = {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'client_credentials',
    sourceDir: '/tmp/linx',
    secrets: {
      clientId: 'id',
      clientSecret: 'secret',
    },
  }
  const runtime = {
    fetchTimeoutMs: 5,
    loadCredentials() {
      return credentials
    },
    getClientCredentials(stored) {
      return stored.secrets
    },
    async getOidcAccessToken() {
      throw new Error('oidc should not be used')
    },
    async restoreStoredOidcSession() {
      throw new Error('oidc should not be used')
    },
    async authenticate() {
      return {
        session: {
          info: {
            isLoggedIn: true,
            webId: credentials.webId,
          },
          async fetch(url) {
            if (String(url).includes('/v1/chat/completions')) {
              await new Promise((resolve) => setTimeout(resolve, 25))
              return new Response('runtime ok', { status: 200 })
            }
            return new Promise(() => undefined)
          },
          async login() {},
          async logout() {},
          async handleIncomingRedirect() {},
        },
      }
    },
  }

  const session = await module.createPodDataSession(runtime)

  assert.equal(session.podUrl, 'https://api.undefineds.co/v1/')

  const response = await session.fetch('https://api.undefineds.co/v1/chat/completions', { method: 'POST' })

  assert.equal(await response.text(), 'runtime ok')
})

test('Pod data fetch timeout only applies to requests under the Pod storage root', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  const credentials = {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'oidc_oauth',
    sourceDir: '/tmp/linx',
    secrets: {
      oidcAccessToken: 'access-token',
      oidcRefreshToken: 'refresh-token',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
    },
  }
  const runtime = {
    fetchTimeoutMs: 5,
    loadCredentials() {
      return credentials
    },
    getClientCredentials() {
      return null
    },
    async getOidcAccessToken() {
      return 'access-token'
    },
    async restoreStoredOidcSession() {
      return {
        info: {
          isLoggedIn: true,
          webId: credentials.webId,
        },
        async fetch(url) {
          const requestUrl = String(url)
          if (requestUrl === 'https://id.undefineds.co/.oidc/auth') {
            await new Promise((resolve) => setTimeout(resolve, 25))
            return new Response('same-origin api ok', { status: 200 })
          }
          return new Promise(() => undefined)
        },
        async logout() {},
      }
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
  }

  const session = await module.createPodDataSession(runtime)

  await assert.rejects(
    () => session.fetch('https://id.undefineds.co/alice/.data/slow.ttl'),
    /LinX Pod request timed out after 0s/,
  )

  const response = await session.fetch('https://id.undefineds.co/.oidc/auth')
  assert.equal(await response.text(), 'same-origin api ok')
})

test('client credentials Pod data session uses Solid session fetch instead of bearer token exchange', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  let authenticateCalls = 0
  const fetchCalls = []
  let logoutCalls = 0

  const credentials = {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'client_credentials',
    sourceDir: '/tmp/linx',
    secrets: {
      clientId: 'id',
      clientSecret: 'secret',
    },
  }
  const runtime = {
    authTimeoutMs: 5,
    loadCredentials() {
      return credentials
    },
    getClientCredentials(stored) {
      return stored.secrets
    },
    async getOidcAccessToken() {
      throw new Error('oidc should not be used')
    },
    async restoreStoredOidcSession() {
      throw new Error('oidc should not be used')
    },
    async getAccessToken() {
      throw new Error('raw token exchange should not be used for client credentials')
    },
    async authenticate(clientId, clientSecret, oidcIssuer) {
      authenticateCalls += 1
      assert.equal(clientId, 'id')
      assert.equal(clientSecret, 'secret')
      assert.equal(oidcIssuer, 'https://id.undefineds.co/')
      return {
        session: {
          info: {
            isLoggedIn: true,
            webId: credentials.webId,
          },
          async fetch(url, init) {
            fetchCalls.push({
              url: String(url),
              authorization: new Headers(init?.headers).get('Authorization'),
              method: init?.method ?? 'GET',
            })
            return new Response(null, { status: 200 })
          },
          async logout() {
            logoutCalls += 1
          },
        },
      }
    },
  }

  const session = await module.createPodDataSession(runtime)
  assert.ok(session)
  assert.equal(session.solidSession.info.isLoggedIn, true)
  assert.equal(session.webId, credentials.webId)

  await session.fetch('https://id.undefineds.co/alice/.data/test.ttl')
  await session.solidSession.fetch('https://id.undefineds.co/alice/.data/test.ttl', { method: 'HEAD' })
  assert.deepEqual(fetchCalls, [
    { url: 'https://id.undefineds.co/alice/.data/test.ttl', authorization: null, method: 'GET' },
    { url: 'https://id.undefineds.co/alice/.data/test.ttl', authorization: null, method: 'HEAD' },
  ])

  await assert.rejects(
    () => session.getRuntimeAuthToken(),
    /session-managed/,
  )
  await session.close()
  assert.equal(authenticateCalls, 1)
  assert.equal(logoutCalls, 1)
})

test('OIDC Pod data session preserves login storage on transient refresh outage', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  const home = mkdtempSync(join(tmpdir(), 'linx-pod-data-transient-oidc-home-'))
  const linxDir = join(home, '.linx')
  const storageDir = join(linxDir, 'oidc-storage')
  mkdirSync(storageDir, { recursive: true })

  writeFileSync(join(linxDir, 'config.json'), JSON.stringify({
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'oidc_oauth',
  }, null, 2))
  writeFileSync(join(linxDir, 'secrets.json'), JSON.stringify({
    oidcRefreshToken: 'refresh-token',
    oidcAccessToken: 'access-token',
    oidcExpiresAt: '2030-01-01T00:00:00.000Z',
    oidcClientId: 'client-id',
  }, null, 2))
  writeFileSync(join(storageDir, 'sentinel'), 'keep me', 'utf-8')
  const originalHome = process.env.HOME
  process.env.HOME = home

  t.after(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    rmSync(home, { recursive: true, force: true })
  })

  await assert.rejects(
    () => module.createPodDataSession({
      loadCredentials() {
        return {
          url: 'https://id.undefineds.co/',
          webId: 'https://id.undefineds.co/alice/profile/card#me',
          authType: 'oidc_oauth',
          sourceDir: linxDir,
          secrets: {
            oidcRefreshToken: 'refresh-token',
            oidcAccessToken: 'access-token',
            oidcExpiresAt: '2030-01-01T00:00:00.000Z',
            oidcClientId: 'client-id',
          },
        }
      },
      getClientCredentials() {
        return null
      },
      async restoreStoredOidcSession() {
        const error = new Error('LinX Cloud is temporarily unavailable (502): Bad Gateway. Your login was not cleared; retry shortly.')
        error.transientRemote = true
        throw error
      },
      async getOidcAccessToken() {
        throw new Error('token refresh should not be used')
      },
      async authenticate() {
        throw new Error('client credentials should not be used')
      },
    }),
    /LinX Cloud is temporarily unavailable/,
  )
  assert.equal(existsSync(join(linxDir, 'config.json')), true)
  assert.equal(existsSync(join(linxDir, 'secrets.json')), true)
  assert.equal(existsSync(storageDir), true)
})

test('closing an OIDC Pod data session does not clear the stored browser login', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  const credentials = {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'oidc_oauth',
    sourceDir: '/tmp/linx',
    secrets: {
      oidcAccessToken: 'access-token',
      oidcRefreshToken: 'refresh-token',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
    },
  }
  let logoutCalls = 0
  const runtime = {
    loadCredentials() {
      return credentials
    },
    getClientCredentials() {
      return null
    },
    async getOidcAccessToken() {
      return 'access-token'
    },
    async restoreStoredOidcSession() {
      return {
        info: {
          isLoggedIn: true,
          webId: credentials.webId,
        },
        async fetch() {
          return new Response(null, { status: 200 })
        },
        async logout() {
          logoutCalls += 1
        },
      }
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
  }

  const session = await module.createPodDataSession(runtime)
  await session.close()

  assert.equal(logoutCalls, 0)
})

test('closing an OIDC Pod data session clears the restored refresh timer handle', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  const timer = setTimeout(() => {}, 60_000)
  t.after(() => clearTimeout(timer))
  const clearedTimers = []
  const originalClearTimeout = globalThis.clearTimeout
  globalThis.clearTimeout = (handle) => {
    clearedTimers.push(handle)
    return originalClearTimeout(handle)
  }
  t.after(() => {
    globalThis.clearTimeout = originalClearTimeout
  })

  const credentials = {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'oidc_oauth',
    sourceDir: '/tmp/linx',
    secrets: {
      oidcAccessToken: 'access-token',
      oidcRefreshToken: 'refresh-token',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
    },
  }
  const runtime = {
    loadCredentials() {
      return credentials
    },
    getClientCredentials() {
      return null
    },
    async getOidcAccessToken() {
      return 'access-token'
    },
    async restoreStoredOidcSession() {
      return {
        info: {
          isLoggedIn: true,
          webId: credentials.webId,
        },
        lastTimeoutHandle: timer,
        async fetch() {
          return new Response(null, { status: 200 })
        },
        async logout() {
          throw new Error('closing a restored browser OIDC session must not app-logout')
        },
      }
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
  }

  const session = await module.createPodDataSession(runtime)
  await session.close()

  assert.equal(clearedTimers.includes(timer), true)
})
