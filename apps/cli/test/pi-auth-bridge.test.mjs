import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

test('resolveLinxPiCloudOAuthCredential maps linx client-credentials login into a pi oauth credential shape', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/auth.ts')
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
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/auth.ts')
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
