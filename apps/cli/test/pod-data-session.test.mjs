import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

test('createPodDataSession normalizes OIDC credentials into a lazy Pod fetch capability', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pod-data-session.ts')
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
  let fetchCalls = 0
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
    async authenticate() {
      throw new Error('client credentials should not be used')
    },
    authenticatedFetch: async () => {
      fetchCalls += 1
      return new Response(null, { status: 200 })
    },
  }

  const session = await module.createPodDataSession(runtime)

  assert.equal(session?.webId, credentials.webId)
  assert.equal(accessTokenCalls, 0)

  await session.fetch('https://id.undefineds.co/alice/.data/test.ttl')
  await session.fetch('https://id.undefineds.co/alice/.data/test.ttl')

  assert.equal(accessTokenCalls, 2)
  assert.equal(fetchCalls, 2)
})
