import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  adoptPreservedSolidClientRegistration,
  clearSolidAuthClientState,
  clearSolidClientRegistration,
  clearSolidClientRegistrationForAccount,
  clearSolidSessionForAccount,
  clearSolidSessionPreservingClient,
  clearStoredSolidSession,
  clearUnrestorableSolidAuthState,
  getStoredSolidClientLoginOptions,
  getStoredSolidSession,
  performSignOut,
  reconcileLoginClientSchema,
  rememberSolidClientRegistration,
} from './login-utils'

const CURRENT = 'solidClientAuthn:currentSession'
const CACHE = 'linx-solid-client-registration'
const recordKey = (sessionId: string) => `solidClientAuthenticationUser:${sessionId}`
const secureKey = (sessionId: string) =>
  `solidClientAuthn:secure:solidClientAuthenticationUser:${sessionId}`
const ISSUER = 'https://id.example.com'
const OTHER_ISSUER = 'https://other.example.com'
const REDIRECT = 'http://localhost:5173/auth/callback'

/** A record exactly as Inrupt's ClientRegistrar writes it after a DCR. */
function dcrRecord(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    clientId: 'registered-client',
    clientSecret: 'registered-secret',
    clientType: 'dynamic',
    clientName: 'LinX',
    expiresAt: '0',
    issuer: ISSUER,
    redirectUrl: REDIRECT,
    ...overrides,
  })
}

function read(sessionId: string): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(recordKey(sessionId))
  return raw === null ? null : JSON.parse(raw) as Record<string, unknown>
}

function cache(): Record<string, Record<string, unknown>> {
  const raw = window.localStorage.getItem(CACHE)
  return raw === null ? {} : JSON.parse(raw) as Record<string, Record<string, unknown>>
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('registration authority', () => {
  it('does not assign an issuer-less client to the requested provider', () => {
    window.localStorage.setItem(CURRENT, 'unknown-issuer')
    window.localStorage.setItem(recordKey('unknown-issuer'), dcrRecord({ issuer: undefined }))

    expect(getStoredSolidClientLoginOptions(OTHER_ISSUER)).toBeNull()
    expect(rememberSolidClientRegistration()).toBe(false)
    expect(cache()).toEqual({})
  })

  it('forgets the matching cached client when the account is identified by WebID', () => {
    const webId = `${ISSUER}/alice/profile/card#me`
    window.localStorage.setItem(CURRENT, 'alice')
    window.localStorage.setItem(recordKey('alice'), dcrRecord({ webId }))
    rememberSolidClientRegistration()
    expect(cache()[ISSUER]).toBeDefined()

    expect(clearSolidClientRegistrationForAccount({ webId })).toBe(true)
    expect(cache()).toEqual({})
    expect(getStoredSolidClientLoginOptions(ISSUER)).toBeNull()
  })
})

afterEach(() => {
  window.localStorage.clear()
})

describe('issuer identity is case-sensitive after the host', () => {
  it('keeps a case-different PATH as a different issuer (negative)', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), dcrRecord({
      issuer: 'https://id.example.com/Tenant',
    }))

    // Same issuer, host case differs -> normalize and reuse.
    expect(getStoredSolidClientLoginOptions('https://ID.EXAMPLE.COM/Tenant')).toEqual({
      clientId: 'registered-client',
      clientSecret: 'registered-secret',
    })
    // Path case differs -> DIFFERENT issuer, must not reuse.
    expect(getStoredSolidClientLoginOptions('https://id.example.com/tenant')).toBeNull()
  })

  it('keeps a case-different PATH distinct in the issuer-keyed cache', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), dcrRecord({
      issuer: 'https://id.example.com/Tenant',
    }))
    expect(rememberSolidClientRegistration()).toBe(true)

    expect(cache()['https://id.example.com/Tenant']).toMatchObject({ clientId: 'registered-client' })
    expect(cache()['https://id.example.com/tenant']).toBeUndefined()
    expect(Object.keys(cache())).toEqual(['https://id.example.com/Tenant'])
  })

  it('tolerates a trailing slash on the issuer', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), dcrRecord({ issuer: `${ISSUER}/` }))

    expect(getStoredSolidClientLoginOptions(ISSUER)).not.toBeNull()
  })
})

describe('issuer-keyed registration cache', () => {
  it('retains one whitelisted registration per issuer', () => {
    window.localStorage.setItem(CURRENT, 'a')
    window.localStorage.setItem(recordKey('a'), dcrRecord({ clientId: 'a-client', clientSecret: 'a-secret' }))
    rememberSolidClientRegistration()

    window.localStorage.setItem(CURRENT, 'b')
    window.localStorage.setItem(recordKey('b'), dcrRecord({
      clientId: 'b-client',
      clientSecret: 'b-secret',
      issuer: OTHER_ISSUER,
    }))
    rememberSolidClientRegistration()

    // Both providers are retained, keyed by exact issuer.
    expect(cache()[ISSUER]).toMatchObject({ clientId: 'a-client' })
    expect(cache()[OTHER_ISSUER]).toMatchObject({ clientId: 'b-client' })
  })

  it('stores registration metadata only, never session state or secure material', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), dcrRecord({
      // Fields that must NOT be copied into the cache.
      refreshToken: 'secret-refresh',
      accessToken: 'secret-access',
      idToken: 'secret-id',
      privateKey: 'secret-dpop-key',
      publicKey: 'secret-dpop-pub',
      webId: 'https://id.example.com/alice#me',
      isLoggedIn: 'true',
      codeVerifier: 'secret-verifier',
      dpop: 'true',
      keepAlive: 'true',
      redirectUrl: REDIRECT,
      someUnknownField: 'nope',
    }))

    rememberSolidClientRegistration()

    const entry = cache()[ISSUER]
    expect(entry).toEqual({
      clientId: 'registered-client',
      clientSecret: 'registered-secret',
      clientType: 'dynamic',
      expiresAt: '0',
      clientName: 'LinX',
      issuer: ISSUER,
    })
    const serialized = JSON.stringify(entry)
    for (const forbidden of [
      'secret-refresh', 'secret-access', 'secret-id', 'secret-dpop-key',
      'secret-dpop-pub', 'secret-verifier', 'someUnknownField', 'alice',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('never offers an expired confidential registration for reuse', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), dcrRecord({
      expiresAt: String(Math.floor(Date.now() / 1000) - 60),
    }))
    rememberSolidClientRegistration()
    // Stored for bookkeeping, but never offered for reuse once expired.
    expect(getStoredSolidClientLoginOptions(ISSUER)).toBeNull()
  })

  it('accepts a secretless PUBLIC client but never invents a secret or expiry', () => {
    // `oidc-client-ext.registerClient()` asks for `token_endpoint_auth_method:
    // "none"`, so a public client has no secret and no expiry. Rejecting that
    // shape would force a DCR on every single login against a real provider.
    window.localStorage.setItem(CURRENT, 'public-client')
    window.localStorage.setItem(recordKey('public-client'), JSON.stringify({
      clientId: 'public-client-id',
      clientType: 'dynamic',
      clientName: 'LinX',
      issuer: OTHER_ISSUER,
      redirectUrl: REDIRECT,
    }))

    expect(rememberSolidClientRegistration()).toBe(true)
    expect(getStoredSolidClientLoginOptions(OTHER_ISSUER)).toEqual({
      clientId: 'public-client-id',
    })
    const entry = cache()[OTHER_ISSUER]
    expect(entry).toMatchObject({ clientId: 'public-client-id' })
    expect(entry).not.toHaveProperty('clientSecret')
    expect(entry).not.toHaveProperty('expiresAt')
  })

  it('rejects a confidential registration whose expiry cannot be parsed', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), JSON.stringify({
      clientId: 'confidential-id',
      clientSecret: 'confidential-secret',
      clientType: 'dynamic',
      issuer: ISSUER,
    }))
    rememberSolidClientRegistration()

    // `ClientRegistrar` would treat this secret-bearing client as expired.
    expect(getStoredSolidClientLoginOptions(ISSUER)).toBeNull()
  })
})

describe('a rejected client is reset at most once and then reused', () => {
  it('drops only the current issuer registration so exactly one new DCR happens', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), dcrRecord({ isLoggedIn: 'true' }))
    rememberSolidClientRegistration()

    expect(clearSolidClientRegistration()).toBe(true)

    expect(read('linx-auth')).not.toHaveProperty('clientId')
    expect(getStoredSolidClientLoginOptions(ISSUER)).toBeNull()
    expect(cache()[ISSUER]).toBeUndefined()
  })

  it('leaves another issuer registration reusable after a reset', () => {
    window.localStorage.setItem(CURRENT, 'a')
    window.localStorage.setItem(recordKey('a'), dcrRecord())
    rememberSolidClientRegistration()
    window.localStorage.setItem(CURRENT, 'b')
    window.localStorage.setItem(recordKey('b'), dcrRecord({
      clientId: 'b-client',
      clientSecret: 'b-secret',
      issuer: OTHER_ISSUER,
    }))
    rememberSolidClientRegistration()

    window.localStorage.setItem(CURRENT, 'a')
    clearSolidClientRegistration()

    expect(cache()[ISSUER]).toBeUndefined()
    expect(cache()[OTHER_ISSUER]).toMatchObject({ clientId: 'b-client' })
    // The other provider is still fully reusable.
    expect(getStoredSolidClientLoginOptions(OTHER_ISSUER)).toEqual({
      clientId: 'b-client',
      clientSecret: 'b-secret',
    })
  })
})

describe('provider isolation in the actual cleanup paths', () => {
  it('forgets only the matching account, leaving the other provider usable', () => {
    window.localStorage.setItem(recordKey('a'), dcrRecord({ clientId: 'a-client' }))
    window.localStorage.setItem(recordKey('b'), dcrRecord({
      clientId: 'b-client',
      issuer: OTHER_ISSUER,
    }))
    window.localStorage.setItem(CURRENT, 'a')
    rememberSolidClientRegistration()
    window.localStorage.setItem(CURRENT, 'b')
    rememberSolidClientRegistration()

    expect(clearSolidClientRegistrationForAccount({ issuerUrl: ISSUER })).toBe(true)

    expect(read('a')).not.toHaveProperty('clientId')
    expect(read('b')).toMatchObject({ clientId: 'b-client' })
    expect(cache()[OTHER_ISSUER]).toMatchObject({ clientId: 'b-client' })
  })

  it('clears only the matching account session', () => {
    window.localStorage.setItem(CURRENT, 'a')
    window.localStorage.setItem(recordKey('a'), dcrRecord({ isLoggedIn: 'true' }))
    window.localStorage.setItem(recordKey('b'), dcrRecord({
      clientId: 'b-client',
      issuer: OTHER_ISSUER,
      isLoggedIn: 'true',
    }))

    expect(clearSolidSessionForAccount({ issuerUrl: ISSUER })).toBe(true)

    expect(window.localStorage.getItem(recordKey('a'))).toBeNull()
    expect(read('b')).toMatchObject({ clientId: 'b-client', isLoggedIn: 'true' })
  })

  it('does nothing when the account binding is empty', () => {
    window.localStorage.setItem(CURRENT, 'a')
    window.localStorage.setItem(recordKey('a'), dcrRecord())

    expect(clearSolidClientRegistrationForAccount({})).toBe(false)
    expect(clearSolidSessionForAccount({})).toBe(false)
    expect(read('a')).toMatchObject({ clientId: 'registered-client' })
  })
})

describe('explicit sign-out and schema reset drop the cache', () => {
  it('clearSolidAuthClientState removes cached clientSecret material', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), dcrRecord())
    rememberSolidClientRegistration()
    // Guard: the secret really is in the cache before the wipe.
    expect(JSON.stringify(cache())).toContain('registered-secret')

    expect(clearSolidAuthClientState()).toBe(true)

    expect(window.localStorage.getItem(CACHE)).toBeNull()
    expect(JSON.stringify(window.localStorage)).not.toContain('registered-secret')
  })

  it('clearStoredSolidSession removes cached clientSecret material', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), dcrRecord())
    rememberSolidClientRegistration()

    clearStoredSolidSession()

    expect(window.localStorage.getItem(CACHE)).toBeNull()
    expect(JSON.stringify(window.localStorage)).not.toContain('registered-secret')
  })

  it('performSignOut drops cached registration material end to end', async () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), dcrRecord())
    rememberSolidClientRegistration()
    expect(JSON.stringify(cache())).toContain('registered-secret')

    // The real sign-out helper, not a bare clearStoredSolidSession call.
    await performSignOut(async () => undefined)

    expect(window.localStorage.getItem(CACHE)).toBeNull()
    expect(JSON.stringify(window.localStorage)).not.toContain('registered-secret')
    expect(getStoredSolidClientLoginOptions(ISSUER)).toBeNull()
  })

  it('schema reset discards cached registrations so a migration cannot reuse them', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), dcrRecord())
    rememberSolidClientRegistration()
    expect(JSON.stringify(cache())).toContain('registered-secret')

    expect(reconcileLoginClientSchema()).toBe(true)

    expect(window.localStorage.getItem(CACHE)).toBeNull()
    expect(JSON.stringify(window.localStorage)).not.toContain('registered-secret')
    expect(getStoredSolidClientLoginOptions(ISSUER)).toBeNull()
  })

  it('keeps another issuer cache entry when only one is forgotten', () => {
    window.localStorage.setItem(CURRENT, 'a')
    window.localStorage.setItem(recordKey('a'), dcrRecord())
    rememberSolidClientRegistration()
    window.localStorage.setItem(CURRENT, 'b')
    window.localStorage.setItem(recordKey('b'), dcrRecord({
      clientId: 'b-client',
      clientSecret: 'b-secret',
      issuer: OTHER_ISSUER,
    }))
    rememberSolidClientRegistration()

    // Explicit forget of one account goes through the public scoped API.
    expect(clearSolidClientRegistrationForAccount({ issuerUrl: ISSUER })).toBe(true)

    expect(cache()[ISSUER]).toBeUndefined()
    expect(cache()[OTHER_ISSUER]).toMatchObject({ clientId: 'b-client' })
    expect(clearSolidAuthClientState()).toBe(true)
    expect(window.localStorage.getItem(CACHE)).toBeNull()
  })
})

describe('ordinary connect keeps a valid DCR client', () => {
  it('keeps the registration and drops only the unrestorable session state', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), dcrRecord({ codeVerifier: 'stale-verifier' }))

    expect(getStoredSolidSession()).toBeNull()
    expect(clearUnrestorableSolidAuthState()).toBe(true)

    const after = read('linx-auth')
    expect(after).toMatchObject({
      clientId: 'registered-client',
      clientSecret: 'registered-secret',
      clientType: 'dynamic',
      expiresAt: '0',
      issuer: ISSUER,
    })
    expect(after).not.toHaveProperty('redirectUrl')
    expect(after).not.toHaveProperty('codeVerifier')
    // The registration is now reusable for this issuer.
    expect(getStoredSolidClientLoginOptions(ISSUER)).not.toBeNull()
  })

  it('drops an orphan record that carries no client instead of leaving it behind', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), JSON.stringify({ issuer: ISSUER }))

    expect(clearUnrestorableSolidAuthState()).toBe(true)
    expect(window.localStorage.getItem(recordKey('linx-auth'))).toBeNull()
  })

  it('remembers a reusable registration when the pointer is gone', () => {
    window.localStorage.setItem(recordKey('orphaned'), dcrRecord())

    expect(clearUnrestorableSolidAuthState()).toBe(true)
    expect(cache()[ISSUER]).toMatchObject({ clientId: 'registered-client' })
  })

  it('leaves a genuinely restorable session untouched', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), dcrRecord({ isLoggedIn: 'true', dpop: 'true' }))

    expect(clearUnrestorableSolidAuthState()).toBe(false)
    expect(read('linx-auth')).toMatchObject({ isLoggedIn: 'true' })
  })

  it('drops a session record with no reusable client rather than shadowing it', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), JSON.stringify({ issuer: ISSUER }))

    expect(clearSolidSessionPreservingClient()).toBe(true)
    expect(window.localStorage.getItem(recordKey('linx-auth'))).toBeNull()
  })

  it('removes orphaned secure shadow records but keeps live ones', () => {
    window.localStorage.setItem(secureKey('orphaned'), JSON.stringify({ refreshToken: 'r' }))
    window.localStorage.setItem(CURRENT, 'orphaned')
    window.localStorage.setItem(recordKey('live'), dcrRecord())
    window.localStorage.setItem(secureKey('live'), JSON.stringify({ refreshToken: 'keep' }))

    clearUnrestorableSolidAuthState()

    expect(window.localStorage.getItem(secureKey('orphaned'))).toBeNull()
    expect(window.localStorage.getItem(secureKey('live'))).not.toBeNull()
  })

  it('does nothing when there is no session record at all', () => {
    expect(clearSolidSessionPreservingClient()).toBe(false)
    expect(clearSolidClientRegistration()).toBe(false)
    expect(clearUnrestorableSolidAuthState()).toBe(false)
  })

  it('tolerates malformed records without throwing', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), '{not-json')

    expect(() => clearUnrestorableSolidAuthState()).not.toThrow()
    expect(window.localStorage.getItem(recordKey('linx-auth'))).toBe('{not-json')
  })
})

describe('adopting a cached registration onto a new session', () => {
  it('seeds the new session and returns login options', () => {
    window.localStorage.setItem(CURRENT, 'old-session')
    window.localStorage.setItem(recordKey('old-session'), dcrRecord())
    rememberSolidClientRegistration()

    window.localStorage.setItem(CURRENT, 'new-session')
    expect(window.localStorage.getItem(recordKey('new-session'))).toBeNull()

    expect(adoptPreservedSolidClientRegistration('new-session', ISSUER)).toEqual({
      clientId: 'registered-client',
      clientSecret: 'registered-secret',
    })
    expect(read('new-session')).toMatchObject({
      clientId: 'registered-client',
      clientType: 'dynamic',
      expiresAt: '0',
    })
  })

  it('does not adopt into a different issuer', () => {
    window.localStorage.setItem(CURRENT, 'old-session')
    window.localStorage.setItem(recordKey('old-session'), dcrRecord())
    rememberSolidClientRegistration()

    expect(adoptPreservedSolidClientRegistration('new-session', OTHER_ISSUER)).toBeNull()
    expect(window.localStorage.getItem(recordKey('new-session'))).toBeNull()
  })

  it('does not overwrite a client the new session already registered', () => {
    window.localStorage.setItem(CURRENT, 'old-session')
    window.localStorage.setItem(recordKey('old-session'), dcrRecord())
    rememberSolidClientRegistration()
    window.localStorage.setItem(recordKey('new-session'), dcrRecord({ clientId: 'already-there' }))

    expect(adoptPreservedSolidClientRegistration('new-session', ISSUER)).toBeNull()
    expect(read('new-session')).toMatchObject({ clientId: 'already-there' })
  })

  it('never offers a registration whose expiry the SDK cannot reuse', () => {
    window.localStorage.setItem(CURRENT, 'linx-auth')
    window.localStorage.setItem(recordKey('linx-auth'), JSON.stringify({
      clientId: 'registered-client',
      clientSecret: 'registered-secret',
      clientType: 'dynamic',
      issuer: ISSUER,
    }))

    expect(getStoredSolidClientLoginOptions(ISSUER)).toBeNull()
  })
})
