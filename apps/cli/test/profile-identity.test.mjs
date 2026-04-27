import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

function credentials(overrides = {}) {
  return {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/ganbb/profile/card#me',
    authType: 'oidc_oauth',
    sourceDir: '/tmp/linx',
    secrets: {
      oidcRefreshToken: 'refresh-token',
      oidcAccessToken: 'access-token',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
    },
    ...overrides,
  }
}

test('extractUsernameFromWebId uses the profile path owner as fallback identity', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/profile-identity.ts')
  t.after(() => cleanup())

  assert.equal(module.extractUsernameFromWebId('https://id.undefineds.co/ganbb/profile/card#me'), 'ganbb')
  assert.equal(module.extractUsernameFromWebId('https://id.undefineds.co/local/profile/card#me'), 'local')
  assert.equal(module.extractUsernameFromWebId('not logged in'), 'there')
})

test('resolveProfileDisplayName reads the configured WebID through solidProfileTable', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/profile-identity.ts')
  t.after(() => cleanup())

  const calls = []
  const displayName = await module.resolveProfileDisplayName({
    timeoutMs: 500,
    runtime: {
      loadCredentials() {
        return credentials()
      },
      getClientCredentials() {
        return null
      },
      async getOidcAccessToken() {
        return 'access-token'
      },
      async authenticate() {
        throw new Error('client credentials should not be used')
      },
      async resolveProfileIdentity(_session, webId) {
        calls.push({ webId })
        return {
          webId,
          profile: { name: 'Gan Lu', nick: 'ganbb' },
          displayName: 'Gan Lu',
          username: 'ganbb',
        }
      },
    },
  })

  assert.equal(displayName, 'Gan Lu')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].webId, 'https://id.undefineds.co/ganbb/profile/card#me')
})

test('resolveProfileDisplayName reuses the per-login profile db resource', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/profile-identity.ts')
  t.after(() => cleanup())

  const cache = new Map()
  let identityCount = 0
  let tokenCount = 0
  const runtime = {
    loadCredentials() {
      return credentials()
    },
    getClientCredentials() {
      return null
    },
    async getOidcAccessToken() {
      tokenCount += 1
      return 'access-token'
    },
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
    async resolveProfileIdentity(_session, webId) {
      identityCount += 1
      return {
        webId,
        profile: { name: 'Gan Lu' },
        displayName: 'Gan Lu',
        username: 'ganbb',
      }
    },
    getCachedResource(key) {
      return cache.get(key) ?? null
    },
    setCachedResource(key, resource) {
      cache.set(key, resource)
    },
  }

  assert.equal(await module.resolveProfileDisplayName({ timeoutMs: 500, runtime }), 'Gan Lu')
  assert.equal(await module.resolveProfileDisplayName({ timeoutMs: 500, runtime }), 'Gan Lu')
  assert.equal(identityCount, 1)
  assert.equal(tokenCount, 1)
})

test('resolveProfileDisplayName returns null when profile lookup fails', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/profile-identity.ts')
  t.after(() => cleanup())

  const displayName = await module.resolveProfileDisplayName({
    timeoutMs: 500,
    runtime: {
      loadCredentials() {
        return credentials()
      },
      getClientCredentials() {
        return null
      },
      async getOidcAccessToken() {
        return 'access-token'
      },
      async authenticate() {
        throw new Error('client credentials should not be used')
      },
      async resolveProfileIdentity() {
        throw new Error('pod offline')
      },
    },
  })

  assert.equal(displayName, null)
})
