import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('createPodDataSession normalizes OIDC credentials into a lazy Pod fetch capability', async (t) => {
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

  let accessTokenCalls = 0
  let restoredFetchCalls = 0
  let authenticatedFetchCalls = 0
  const runtime = {
    loadCredentials() {
      return credentials
    },
    getClientCredentials() {
      return null
    },
    async getOidcAccessToken() {
      accessTokenCalls += 1
      return 'access-token'
    },
    async restoreStoredOidcSession() {
      return {
        info: {
          isLoggedIn: true,
          webId: credentials.webId,
          sessionId: 'stored-oidc-session',
        },
        fetch: async () => {
          restoredFetchCalls += 1
          return new Response(null, { status: 200 })
        },
        login: async () => {},
        logout: async () => {},
        handleIncomingRedirect: async () => {},
      }
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
    authenticatedFetch: async () => {
      authenticatedFetchCalls += 1
      return new Response(null, { status: 200 })
    },
  }

  const session = await module.createPodDataSession(runtime)

  assert.equal(session?.webId, credentials.webId)
  assert.equal(session?.podUrl, 'https://id.undefineds.co/alice/')
  assert.equal(session?.solidSession.info.podUrl, 'https://id.undefineds.co/alice/')
  assert.equal(accessTokenCalls, 0)

  await session.fetch('https://id.undefineds.co/alice/.data/test.ttl')
  await session.fetch('https://id.undefineds.co/alice/.data/test.ttl')

  assert.equal(accessTokenCalls, 0)
  assert.equal(restoredFetchCalls, 2)
  assert.equal(authenticatedFetchCalls, 0)
})

test('createPodDataSession fails fast when client credentials authentication hangs', async (t) => {
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
    authenticate() {
      return new Promise(() => undefined)
    },
    authenticatedFetch: async () => new Response(null, { status: 200 }),
  }

  await assert.rejects(
    () => module.createPodDataSession(runtime),
    /LinX Pod client credentials authentication timed out/,
  )
})

test('OIDC Pod fetch fails fast when token refresh hangs', async (t) => {
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
        fetch: async () => new Response(null, { status: 200 }),
        login: async () => {},
        logout: async () => {},
        handleIncomingRedirect: async () => {},
      }
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
    authenticatedFetch: async () => new Response(null, { status: 200 }),
  }

  const session = await module.createPodDataSession(runtime)
  await assert.rejects(
    () => session.getRuntimeAuthToken(),
    /LinX Pod OIDC token refresh timed out/,
  )
})

test('OIDC Pod data session fails fast when stored Solid session restore hangs', async (t) => {
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
    async getOidcAccessToken() {
      return 'access-token'
    },
    restoreStoredOidcSession() {
      return new Promise(() => undefined)
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
    authenticatedFetch: async () => new Response(null, { status: 200 }),
  }

  await assert.rejects(
    () => module.createPodDataSession(runtime),
    /LinX Pod OIDC session restore timed out/,
  )
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
        fetch: async () => new Response(null, { status: 200 }),
        login: async () => {},
        logout: async () => {
          logoutCalls += 1
        },
        handleIncomingRedirect: async () => {},
      }
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
    authenticatedFetch: async () => new Response(null, { status: 200 }),
  }

  const session = await module.createPodDataSession(runtime)
  await session.close()

  assert.equal(logoutCalls, 0)
})
