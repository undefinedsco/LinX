import test from 'node:test'
import assert from 'node:assert/strict'
import { get } from 'node:http'
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

test('assertOidcCallbackDidNotReturnError surfaces identity provider callback errors', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/oidc-auth.ts')
  t.after(() => cleanup())

  assert.throws(
    () => module.assertOidcCallbackDidNotReturnError(
      'http://127.0.0.1:1234/auth/callback?error=server_error&error_description=oops%21',
    ),
    /OIDC callback returned server_error; description: oops!; redirect: http:\/\/127\.0\.0\.1:1234\/auth\/callback/,
  )

  assert.doesNotThrow(() => module.assertOidcCallbackDidNotReturnError(
    'http://127.0.0.1:1234/auth/callback?code=abc&state=xyz',
  ))
})

test('isOidcLoginExpiredError recognizes refresh credential failures', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/oidc-auth.ts')
  t.after(() => cleanup())

  assert.equal(module.isOidcLoginExpiredError(new Error('Invalid refresh credentials: OPError: invalid_client (client authentication failed)')), true)
  assert.equal(module.isOidcLoginExpiredError(new Error('Invalid refresh credentials: Error: Missing static client secret in storage.')), true)
  assert.equal(module.isOidcLoginExpiredError(new Error('OPError: invalid_grant')), true)
  assert.equal(module.isOidcLoginExpiredError(new Error('Failed to fetch WebID profile: 500 Internal Server Error')), false)
})

test('loginWithBrowserConsent cancels manual redirect prompt after browser callback', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/oidc-auth.ts')
  t.after(() => cleanup())

  const abortSignals = []
  let callbackUrl = ''
  let callbackHandled = false
  const resultPromise = module.withCallbackServer(
    '127.0.0.1',
    '/auth/callback',
    async (url) => {
      callbackUrl = url
    },
    async () => {
      callbackHandled = true
    },
    async (signal) => {
      abortSignals.push(signal)
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(''), { once: true })
      })
    },
  )

  while (!callbackUrl) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  await new Promise((resolve, reject) => {
    get(`${callbackUrl}?code=abc&state=state`, (response) => {
      response.resume()
      response.on('end', resolve)
    }).on('error', reject)
  })

  await resultPromise
  assert.equal(callbackHandled, true)
  assert.equal(abortSignals.length, 1)
  assert.equal(abortSignals[0].aborted, true)
})
