import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

test('serializeOidcCredentials stores browser consent token set as oidc_oauth credentials', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/oidc-auth.ts')
  t.after(() => cleanup())

  const credentials = module.serializeOidcCredentials(
    'https://id.undefineds.co/',
    'https://pod.example/profile/card#me',
    {
      issuer: 'https://id.undefineds.co',
      clientId: 'client-id',
      refreshToken: 'refresh-token',
      accessToken: 'access-token',
      expiresAt: 1893456000,
    },
  )

  assert.deepEqual(credentials, {
    url: 'https://id.undefineds.co/',
    webId: 'https://pod.example/profile/card#me',
    authType: 'oidc_oauth',
    secrets: {
      oidcRefreshToken: 'refresh-token',
      oidcAccessToken: 'access-token',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
      oidcClientId: 'client-id',
    },
  })
})
