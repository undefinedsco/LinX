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

test('OIDC Pod data session clears stale OIDC storage when refresh fails', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-data-session.ts')
  t.after(() => cleanup())

  const home = mkdtempSync(join(tmpdir(), 'linx-pod-data-legacy-oidc-home-'))
  const linxDir = join(home, '.linx')
  const storageDir = join(linxDir, 'oidc-storage')
  mkdirSync(storageDir, { recursive: true })

  const sessionId = 'linx-cli-oidc-legacy'
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
  writeFileSync(join(storageDir, encodeURIComponent('solidClientAuthn:registeredSessions')), JSON.stringify([sessionId]), 'utf-8')
  writeFileSync(
    join(storageDir, encodeURIComponent(`solidClientAuthenticationUser:${sessionId}`)),
    JSON.stringify({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      issuer: 'https://id.undefineds.co/',
      redirectUrl: 'http://127.0.0.1:43123/auth/callback',
      dpop: 'false',
      keepAlive: 'false',
      refreshToken: 'refresh-token',
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      isLoggedIn: 'true',
    }),
    'utf-8',
  )
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
    () => module.createPodDataSession(),
    /LinX Cloud login expired/,
  )
  assert.equal(existsSync(join(linxDir, 'config.json')), false)
  assert.equal(existsSync(join(linxDir, 'secrets.json')), false)
  assert.equal(existsSync(storageDir), false)
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
