import test from 'node:test'
import assert from 'node:assert/strict'
import { get } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

function solidAuthDir(home) {
  return join(home, '.solid', 'auth')
}

function solidCredentialsPath(home) {
  return join(solidAuthDir(home), 'credentials.json')
}

function solidAccountPath(home) {
  return join(solidAuthDir(home), 'account.json')
}

function solidOidcStorageDir(home) {
  return join(solidAuthDir(home), 'oidc-storage')
}

function writeSolidCredentials(home, credentials) {
  mkdirSync(solidAuthDir(home), { recursive: true })
  writeFileSync(solidCredentialsPath(home), JSON.stringify(credentials, null, 2))
}

test('serializeOidcCredentials stores browser consent token set as oidc_oauth credentials', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/oidc-auth.ts')
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
  const { module, cleanup } = await loadAutoModeModule('lib/oidc-auth.ts')
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
  const { module, cleanup } = await loadAutoModeModule('lib/oidc-auth.ts')
  t.after(() => cleanup())

  assert.equal(module.isOidcLoginExpiredError(new Error('Invalid refresh credentials: OPError: invalid_client (client authentication failed)')), true)
  assert.equal(module.isOidcLoginExpiredError(new Error('Invalid refresh credentials: Error: Missing static client secret in storage.')), true)
  assert.equal(module.isOidcLoginExpiredError(new Error('OPError: invalid_grant')), true)
  assert.equal(module.isOidcLoginExpiredError(new Error('OPError: invalid_redirect_uri (redirect_uris must only contain strings)')), true)
  assert.equal(module.isOidcLoginExpiredError(new Error('Failed to fetch WebID profile: 500 Internal Server Error')), false)
  assert.equal(module.isOidcLoginExpiredError(new Error('expected 200 OK, got: 502 Bad Gateway')), false)
  assert.equal(module.isOidcTransientRemoteError(new Error('expected 200 OK, got: 502 Bad Gateway')), true)
})

test('existing browser consent reuse clears stale local OIDC state when storage cannot be refreshed', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/oidc-auth.ts')
  t.after(() => cleanup())

  const originalHome = process.env.HOME
  const home = mkdtempSync(join(tmpdir(), 'linx-oidc-stale-home-'))
  writeSolidCredentials(home, {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'oidc_oauth',
    secrets: {
      oidcRefreshToken: 'old-refresh',
      oidcAccessToken: 'old-access',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
      oidcClientId: 'old-client',
    },
  })
  writeFileSync(solidAccountPath(home), JSON.stringify({
    url: 'https://id.undefineds.co/',
    email: 'browser-consent',
    token: 'oidc-session',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    createdAt: '2026-05-31T00:00:00.000Z',
  }, null, 2))
  process.env.HOME = home

  t.after(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    rmSync(home, { recursive: true, force: true })
  })

  const reused = await module.reuseExistingBrowserConsentLogin({
    issuerUrl: 'https://id.undefineds.co/',
  })

  assert.equal(reused, null)
  assert.equal(existsSync(solidCredentialsPath(home)), false)
  assert.equal(existsSync(solidAccountPath(home)), false)
})

test('transient OIDC refresh failures do not clear stored login state', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/oidc-auth.ts')
  t.after(() => cleanup())

  const originalHome = process.env.HOME
  const home = mkdtempSync(join(tmpdir(), 'linx-oidc-transient-home-'))
  const storageDir = solidOidcStorageDir(home)
  const sessionId = 'transient-session'
  mkdirSync(storageDir, { recursive: true })
  writeSolidCredentials(home, {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'oidc_oauth',
    secrets: {
      oidcRefreshToken: 'old-refresh',
      oidcAccessToken: 'old-access',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
      oidcClientId: 'old-client',
    },
  })
  writeFileSync(join(storageDir, encodeURIComponent('solidClientAuthn:registeredSessions')), JSON.stringify([sessionId]))
  writeFileSync(
    join(storageDir, encodeURIComponent(`solidClientAuthenticationUser:${sessionId}`)),
    JSON.stringify({
      issuer: 'https://id.undefineds.co/',
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      dpop: 'true',
    }),
  )
  process.env.HOME = home

  t.after(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    rmSync(home, { recursive: true, force: true })
  })

  const error = module.normalizeOidcSessionRefreshError(new Error('expected 200 OK, got: 502 Bad Gateway'))
  assert.equal(module.isOidcTransientRemoteError(error), true)
  assert.equal(module.isOidcLoginExpiredError(error), false)
  assert.match(String(error), /temporarily unavailable/i)
  assert.equal(existsSync(solidCredentialsPath(home)), true)
  assert.equal(existsSync(storageDir), true)
})

test('force restoring a DPoP OIDC session clears stale local OIDC state', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/oidc-auth.ts')
  t.after(() => cleanup())

  const originalHome = process.env.HOME
  const home = mkdtempSync(join(tmpdir(), 'linx-oidc-legacy-home-'))
  const storageDir = solidOidcStorageDir(home)
  const sessionId = 'legacy-session'
  mkdirSync(storageDir, { recursive: true })
  writeSolidCredentials(home, {
    url: 'https://id.undefineds.co/',
    webId: 'https://id.undefineds.co/alice/profile/card#me',
    authType: 'oidc_oauth',
    secrets: {
      oidcRefreshToken: 'old-refresh',
      oidcAccessToken: 'old-access',
      oidcExpiresAt: '2030-01-01T00:00:00.000Z',
      oidcClientId: 'old-client',
    },
  })
  writeFileSync(join(storageDir, encodeURIComponent('solidClientAuthn:registeredSessions')), JSON.stringify([sessionId]))
  writeFileSync(
    join(storageDir, encodeURIComponent(`solidClientAuthenticationUser:${sessionId}`)),
    JSON.stringify({
      issuer: 'https://id.undefineds.co/',
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      dpop: 'true',
    }),
  )
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
    () => module.restoreStoredOidcSession({
      url: 'https://id.undefineds.co/',
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      authType: 'oidc_oauth',
      secrets: {
        oidcRefreshToken: 'old-refresh',
        oidcAccessToken: 'old-access',
        oidcExpiresAt: '2030-01-01T00:00:00.000Z',
        oidcClientId: 'old-client',
      },
    }, { forceRefresh: true }),
    /LinX Cloud login expired/,
  )
  assert.equal(existsSync(solidCredentialsPath(home)), false)
  assert.equal(existsSync(storageDir), false)
})

test('loginWithBrowserConsent cancels manual redirect prompt after browser callback', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/oidc-auth.ts')
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

test('loginWithBrowserConsent keeps waiting when manual redirect prompt is cancelled first', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/oidc-auth.ts')
  t.after(() => cleanup())

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
    async () => {
      throw new Error('Login cancelled')
    },
  )

  while (!callbackUrl) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  await new Promise((resolve) => setTimeout(resolve, 20))

  assert.equal(callbackHandled, false)

  await new Promise((resolve, reject) => {
    get(`${callbackUrl}?code=abc&state=state`, (response) => {
      response.resume()
      response.on('end', resolve)
    }).on('error', reject)
  })

  await resultPromise
  assert.equal(callbackHandled, true)
})

test('loginWithBrowserConsent handles a manually pasted callback URL', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/oidc-auth.ts')
  t.after(() => cleanup())

  let callbackUrl = ''
  let callbackHandled = false
  await module.withCallbackServer(
    '127.0.0.1',
    '/auth/callback',
    async (url) => {
      callbackUrl = url
    },
    async (url) => {
      callbackHandled = true
      assert.match(url, /code=manual-code/)
    },
    async () => `${callbackUrl}?code=manual-code&state=state`,
  )

  assert.equal(callbackHandled, true)
})

test('loginWithBrowserConsent rejects a manually pasted OIDC error callback', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/oidc-auth.ts')
  t.after(() => cleanup())

  let callbackUrl = ''
  await assert.rejects(
    module.withCallbackServer(
      '127.0.0.1',
      '/auth/callback',
      async (url) => {
        callbackUrl = url
      },
      async () => {
        throw new Error('callback handler should not run for OIDC errors')
      },
      async () => `${callbackUrl}?error=server_error&error_description=oops%21`,
    ),
    /OIDC callback returned server_error; description: oops!/,
  )
})

test('loginWithBrowserConsent can be cancelled by the outer login signal', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/oidc-auth.ts')
  t.after(() => cleanup())

  const abortController = new AbortController()
  let callbackUrl = ''
  const resultPromise = module.withCallbackServer(
    '127.0.0.1',
    '/auth/callback',
    async (url) => {
      callbackUrl = url
    },
    async () => {},
    async (signal) => {
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(''), { once: true })
      })
    },
    abortController.signal,
  )

  while (!callbackUrl) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  abortController.abort()
  await assert.rejects(resultPromise, /Login cancelled/)
})
