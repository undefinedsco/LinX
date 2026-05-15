import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('resolveLinxPiCloudOAuthCredential maps linx client-credentials login into a pi oauth credential shape', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/auth.ts')
  t.after(() => cleanup())

  const requestedIssuers = []
  const credential = await module.resolveLinxPiCloudOAuthCredential('https://api.undefineds.co/v1', {
    loadCredentials() {
      return {
        url: 'https://id.undefineds.co',
        webId: 'https://alice.example/profile/card#me',
        authType: 'client_credentials',
        sourceDir: '/tmp/linx',
        secrets: {
          authMethod: 'client_credentials',
          clientId: 'client-id',
          clientSecret: 'client-secret',
        },
      }
    },
    getClientCredentials() {
      return {
        authMethod: 'client_credentials',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      }
    },
    async getAccessToken(_clientId, _clientSecret, issuerUrl) {
      requestedIssuers.push(issuerUrl)
      return {
        accessToken: 'access-token',
        tokenType: 'Bearer',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      }
    },
  })

  assert.deepEqual(credential, {
    type: 'oauth',
    refresh: 'client-secret',
    access: 'access-token',
    expires: new Date('2030-01-01T00:00:00.000Z').getTime(),
  })
  assert.deepEqual(requestedIssuers, ['https://api.undefineds.co/v1'])
})

test('resolveLinxPiCloudOAuthCredential falls back to stored issuer url when no override is passed', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/auth.ts')
  t.after(() => cleanup())

  const requestedIssuers = []
  await module.resolveLinxPiCloudOAuthCredential(undefined, {
    loadCredentials() {
      return {
        url: 'https://id.undefineds.co',
        webId: 'https://alice.example/profile/card#me',
        authType: 'client_credentials',
        sourceDir: '/tmp/linx',
        secrets: {
          authMethod: 'client_credentials',
          clientId: 'client-id',
          clientSecret: 'client-secret',
        },
      }
    },
    getClientCredentials() {
      return {
        authMethod: 'client_credentials',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      }
    },
    async getAccessToken(_clientId, _clientSecret, issuerUrl) {
      requestedIssuers.push(issuerUrl)
      return {
        accessToken: 'access-token',
        tokenType: 'Bearer',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      }
    },
  })

  assert.deepEqual(requestedIssuers, ['https://id.undefineds.co'])
})

test('resolveLinxPiCloudOAuthCredential supports legacy runtime as the second argument', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/auth.ts')
  t.after(() => cleanup())

  const requestedIssuers = []
  const credential = await module.resolveLinxPiCloudOAuthCredential('https://api.undefineds.co/v1', {
    loadCredentials() {
      return {
        url: 'https://id.undefineds.co',
        webId: 'https://alice.example/profile/card#me',
        authType: 'client_credentials',
        sourceDir: '/tmp/linx',
        secrets: {
          authMethod: 'client_credentials',
          clientId: 'client-id',
          clientSecret: 'client-secret',
        },
      }
    },
    getClientCredentials() {
      return {
        authMethod: 'client_credentials',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      }
    },
    async getAccessToken(_clientId, _clientSecret, issuerUrl) {
      requestedIssuers.push(issuerUrl)
      return {
        accessToken: 'access-token',
        tokenType: 'Bearer',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      }
    },
    async getOidcAccessToken() {
      return null
    },
  })

  assert.deepEqual(credential, {
    type: 'oauth',
    refresh: 'client-secret',
    access: 'access-token',
    expires: new Date('2030-01-01T00:00:00.000Z').getTime(),
  })
  assert.deepEqual(requestedIssuers, ['https://api.undefineds.co/v1'])
})

test('resolveLinxPiCloudOAuthCredential maps oidc oauth login into a pi oauth credential shape', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/auth.ts')
  t.after(() => cleanup())

  const oidcCalls = []
  const credential = await module.resolveLinxPiCloudOAuthCredential('https://api.undefineds.co/v1', {}, {
    loadCredentials() {
      return {
        url: 'https://id.undefineds.co',
        webId: 'https://alice.example/profile/card#me',
        authType: 'oidc_oauth',
        sourceDir: '/tmp/linx',
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
    async getAccessToken() {
      throw new Error('client credentials token flow should not be used')
    },
    async getOidcAccessToken(stored, options) {
      oidcCalls.push({ stored, options })
      return 'oidc-access-token'
    },
  })

  assert.ok(credential)
  assert.equal(credential.type, 'oauth')
  assert.equal(credential.refresh, 'linx-oidc-refresh')
  assert.equal(credential.access, 'oidc-access-token')
  assert.equal(credential.expires, new Date('2030-01-01T00:00:00.000Z').getTime())
  assert.equal(oidcCalls.length, 1)
  assert.equal(oidcCalls[0].stored.authType, 'oidc_oauth')
  assert.deepEqual(oidcCalls[0].options, { forceRefresh: undefined })
})

test('resolveLinxPiCloudOAuthCredential forwards forceRefresh to oidc oauth restoration', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/auth.ts')
  t.after(() => cleanup())

  const forceRefreshValues = []
  await module.resolveLinxPiCloudOAuthCredential('https://api.undefineds.co/v1', { forceRefresh: true }, {
    loadCredentials() {
      return {
        url: 'https://id.undefineds.co',
        webId: 'https://alice.example/profile/card#me',
        authType: 'oidc_oauth',
        sourceDir: '/tmp/linx',
        secrets: {
          oidcRefreshToken: 'refresh-token',
          oidcAccessToken: 'expired-access-token',
          oidcExpiresAt: '2020-01-01T00:00:00.000Z',
          oidcClientId: 'client-id',
        },
      }
    },
    getClientCredentials() {
      return null
    },
    async getAccessToken() {
      throw new Error('client credentials token flow should not be used')
    },
    async getOidcAccessToken(_stored, options) {
      forceRefreshValues.push(options.forceRefresh)
      return 'refreshed-oidc-access-token'
    },
  })

  assert.deepEqual(forceRefreshValues, [true])
})

test('resolveLinxPiCloudOAuthCredential uses updated oidc expiry after refresh', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/auth.ts')
  t.after(() => cleanup())

  const secrets = {
    oidcRefreshToken: 'refresh-token',
    oidcAccessToken: 'expired-access-token',
    oidcExpiresAt: '2020-01-01T00:00:00.000Z',
    oidcClientId: 'client-id',
  }
  const credential = await module.resolveLinxPiCloudOAuthCredential('https://api.undefineds.co/v1', { forceRefresh: true }, {
    loadCredentials() {
      return {
        url: 'https://id.undefineds.co',
        webId: 'https://alice.example/profile/card#me',
        authType: 'oidc_oauth',
        sourceDir: '/tmp/linx',
        secrets,
      }
    },
    getClientCredentials() {
      return null
    },
    async getAccessToken() {
      throw new Error('client credentials token flow should not be used')
    },
    async getOidcAccessToken(stored) {
      stored.secrets.oidcAccessToken = 'refreshed-oidc-access-token'
      stored.secrets.oidcExpiresAt = '2031-02-03T04:05:06.000Z'
      return stored.secrets.oidcAccessToken
    },
  })

  assert.deepEqual(credential, {
    type: 'oauth',
    refresh: 'linx-oidc-refresh',
    access: 'refreshed-oidc-access-token',
    expires: new Date('2031-02-03T04:05:06.000Z').getTime(),
  })
})

test('resolveLinxPiCloudOAuthCredential propagates oidc login expiry for startup prompting', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/auth.ts')
  t.after(() => cleanup())

  const expired = new Error('invalid_grant')
  await assert.rejects(
    () => module.resolveLinxPiCloudOAuthCredential('https://api.undefineds.co/v1', {}, {
      loadCredentials() {
        return {
          url: 'https://id.undefineds.co',
          webId: 'https://alice.example/profile/card#me',
          authType: 'oidc_oauth',
          sourceDir: '/tmp/linx',
          secrets: {
            oidcRefreshToken: 'refresh-token',
            oidcAccessToken: 'expired-access-token',
            oidcExpiresAt: '2020-01-01T00:00:00.000Z',
            oidcClientId: 'client-id',
          },
        }
      },
      getClientCredentials() {
        return null
      },
      async getAccessToken() {
        throw new Error('client credentials token flow should not be used')
      },
      async getOidcAccessToken() {
        throw expired
      },
    }),
    /invalid_grant/,
  )
})

test('resolveLinxPiCloudOAuthCredential treats non-auth oidc restoration failures as missing credentials', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/auth.ts')
  t.after(() => cleanup())

  const credential = await module.resolveLinxPiCloudOAuthCredential('https://api.undefineds.co/v1', {}, {
    loadCredentials() {
      return {
        url: 'https://id.undefineds.co',
        webId: 'https://alice.example/profile/card#me',
        authType: 'oidc_oauth',
        sourceDir: '/tmp/linx',
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
    async getAccessToken() {
      throw new Error('client credentials token flow should not be used')
    },
    async getOidcAccessToken() {
      throw new Error('temporary local storage read failure')
    },
  })

  assert.equal(credential, null)
})
