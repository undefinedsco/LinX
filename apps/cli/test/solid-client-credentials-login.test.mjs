import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('parseSolidClientCredentials accepts only direct Solid client credentials', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/solid-client-credentials-login.ts')
  t.after(() => cleanup())

  assert.deepEqual(module.parseSolidClientCredentials('linx-client:linx-secret'), {
    clientId: 'linx-client',
    clientSecret: 'linx-secret',
  })
  const legacyKey = `sk-${Buffer.from('linx-client:linx-secret', 'utf-8').toString('base64')}`
  assert.equal(module.parseSolidClientCredentials(legacyKey), null)
  assert.equal(module.parseSolidClientCredentials('sk-openai-test-key'), null)
  assert.equal(module.parseSolidClientCredentials('sk-ant-test-key'), null)
})

test('persistSolidClientCredentialsLogin validates and persists reloadable ~/.linx credentials', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/solid-client-credentials-login.ts')
  t.after(() => cleanup())

  const savedCredentials = []
  const savedAccounts = []
  const closed = []
  const key = 'linx-client:linx-secret'
  let currentCredentials = null

  const result = await module.persistSolidClientCredentialsLogin(key, {
    loadCredentials() {
      return currentCredentials
    },
    saveCredentials(credentials) {
      savedCredentials.push(credentials)
      currentCredentials = {
        ...credentials,
        sourceDir: '/tmp/linx-home/.linx',
      }
    },
    clearCredentials() {
      currentCredentials = null
    },
    saveAccountSession(account) {
      savedAccounts.push(account)
    },
    resolveAccountBaseUrl() {
      return 'https://id.undefineds.co/'
    },
    async createPodDataSession() {
      assert.equal(currentCredentials?.authType, 'client_credentials')
      assert.deepEqual(currentCredentials?.secrets, {
        clientId: 'linx-client',
        clientSecret: 'linx-secret',
      })
      return {
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        podUrl: 'https://id.undefineds.co/alice/',
        async close() {
          closed.push(true)
        },
      }
    },
  })

  assert.equal(result.webId, 'https://id.undefineds.co/alice/profile/card#me')
  assert.equal(result.podUrl, 'https://id.undefineds.co/alice/')
  assert.deepEqual(savedCredentials.at(-1), {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'client_credentials',
    secrets: {
      clientId: 'linx-client',
      clientSecret: 'linx-secret',
    },
  })
  assert.deepEqual(savedAccounts.at(-1), {
    url: 'https://id.undefineds.co/',
    email: 'client-credentials',
    token: 'client-credentials',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    podUrl: 'https://id.undefineds.co/alice/',
    createdAt: savedAccounts.at(-1).createdAt,
  })
  assert.match(savedAccounts.at(-1).createdAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(closed, [true])
})

test('persistSolidClientCredentialsLogin restores previous credentials when validation fails', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/solid-client-credentials-login.ts')
  t.after(() => cleanup())

  const previousCredentials = {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'oidc_oauth',
    sourceDir: '/tmp/linx-home/.linx',
    secrets: {
      oidcRefreshToken: 'old-refresh',
      oidcAccessToken: 'old-access',
      oidcExpiresAt: '2026-01-01T00:00:00.000Z',
    },
  }
  const savedCredentials = []
  const key = 'linx-client:linx-secret'

  await assert.rejects(
    () => module.persistSolidClientCredentialsLogin(key, {
      loadCredentials() {
        return previousCredentials
      },
      saveCredentials(credentials) {
        savedCredentials.push(credentials)
      },
      clearCredentials() {
        throw new Error('previous credentials should be restored instead of cleared')
      },
      saveAccountSession() {},
      resolveAccountBaseUrl() {
        return 'https://id.undefineds.co/'
      },
      async createPodDataSession() {
        throw new Error('validation failed')
      },
    }),
    /validation failed/,
  )

  assert.deepEqual(savedCredentials.at(-1), previousCredentials)
})
