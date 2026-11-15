/**
 * Proof against the REAL Inrupt SDK, not a storage simulation.
 *
 * `@inrupt/solid-client-authn-browser` is aliased to its real dist by
 * vitest.config.ts, so a `Session` here performs the same discovery, DCR and
 * storage bookkeeping the app runs in production. These tests pin the SDK
 * behaviour the LinX fix depends on:
 *
 *  1. an interactive login clears EVERY registered client, so storage alone
 *     cannot keep a client reusable across a provider switch;
 *  2. passing clientId/clientSecret back to login() stops a second DCR and a
 *     second consent, for the same client;
 *  3. the issuer-keyed cache keeps A and B independent, so A -> B -> A performs
 *     two registrations, not three.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom's TextEncoder returns a CROSS-REALM Uint8Array, which jose rejects when
// it builds the DPoP proof ("payload must be an instance of Uint8Array"). The SDK
// captures the encoder at module load, so this must be installed before its
// import. Without it the DPoP token exchange never reaches the token endpoint and
// the callback reuse assertion below could not observe a token request at all.
vi.hoisted(() => {
  const Base = globalThis.TextEncoder
  class SameRealmEncoder {
    readonly encoding = 'utf-8'
    encode(input?: string): Uint8Array {
      const raw = new Base().encode(input) as unknown as ArrayLike<number>
      return new Uint8Array(Array.from(raw))
    }
    encodeInto(input: string, dest: Uint8Array) {
      return new Base().encodeInto(input, dest as unknown as Uint8Array)
    }
  }
  Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: SameRealmEncoder })
  Object.defineProperty(window, 'TextEncoder', { configurable: true, value: SameRealmEncoder })
})

import { Session } from '@inrupt/solid-client-authn-browser'
import { PersistentSessionStorage } from '@/providers/persistent-session-storage'
import {
  adoptPreservedSolidClientRegistration,
  clearSolidClientRegistration,
  clearSolidClientRegistrationForAccount,
  clearSolidSessionForAccount,
  getStoredSolidClientLoginOptions,
  rememberSolidClientRegistration,
} from './login-utils'

const ISSUER_A = 'https://id.example.com'
const ISSUER_B = 'https://id-b.example.com'
const REDIRECT = 'http://localhost:5173/auth/callback'
const CURRENT = 'solidClientAuthn:currentSession'
const recordKey = (sessionId: string) => `solidClientAuthenticationUser:${sessionId}`

function discoveryFor(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/auth`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    registration_endpoint: `${issuer}/reg`,
    scopes_supported: ['openid', 'webid', 'offline_access'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic'],
    subject_types_supported: ['public'],
  }
}

/** Registrations performed per issuer by the mocked providers. */
const registrations: Record<string, number> = {}
/** Options for the mocked DCR/token endpoints (secretless public clients etc.). */
interface ProviderOptions {
  issueClientSecret?: boolean
  captureTokenRequests?: boolean
}
let providerOptions: ProviderOptions = {}
const tokenRequests: Array<{ headers: Record<string, string>; body: URLSearchParams }> = []

function installProviders(options: ProviderOptions = {}) {
  providerOptions = options
  tokenRequests.length = 0
  for (const key of Object.keys(registrations)) delete registrations[key]
  registrations[ISSUER_A] = 0
  registrations[ISSUER_B] = 0
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String((input as { url?: string })?.url ?? input)
    if (url.includes('.well-known/openid-configuration')) {
      const issuer = url.startsWith(ISSUER_B) ? ISSUER_B : ISSUER_A
      return new Response(JSON.stringify(discoveryFor(issuer)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    for (const issuer of [ISSUER_A, ISSUER_B]) {
      if (url === `${issuer}/reg`) {
        registrations[issuer] += 1
        // `token_endpoint_auth_method: "none"` means a public client, for which
        // a real provider returns NO client_secret at all.
        const body: Record<string, unknown> = {
          client_id: `${issuer}-client-${registrations[issuer]}`,
        }
        if (providerOptions.issueClientSecret !== false) {
          body.client_secret = `${issuer}-secret-${registrations[issuer]}`
          body.client_secret_expires_at = 0
        }
        return new Response(JSON.stringify(body), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === `${issuer}/token` && providerOptions.captureTokenRequests) {
        // Capturing the token request is the ONLY way to prove which client the
        // callback actually used. Fail it afterwards so no ID-token/JWKS fixture
        // is needed: this asserts client reuse, NOT a successful OAuth exchange.
        tokenRequests.push({
          headers: { ...(init?.headers as Record<string, string> | undefined) ?? {} },
          body: new URLSearchParams(String(init?.body ?? '')),
        })
        return new Response('{"error":"invalid_grant"}', {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      }
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
}

interface Authorization {
  clientId: string | null
  registeredForIssuer: number
}

/**
 * Run one authorization and report which client the provider was asked about.
 * `login()` never resolves while a redirect is pending, so it is bounded.
 */
async function authorize(
  sessionId: string,
  issuer: string,
  options: Record<string, unknown>,
): Promise<Authorization> {
  const session = new Session({}, sessionId)
  let authorizationUrl: string | null = null
  await Promise.race([
    session.login({
      oidcIssuer: issuer,
      redirectUrl: REDIRECT,
      clientName: 'LinX',
      handleRedirect: (url: string) => { authorizationUrl = url },
      ...options,
    } as Parameters<Session['login']>[0]),
    new Promise((resolve) => setTimeout(resolve, 400)),
  ]).catch(() => undefined)
  return {
    clientId: authorizationUrl
      ? new URL(authorizationUrl).searchParams.get('client_id')
      : null,
    registeredForIssuer: registrations[issuer],
  }
}

function seedSession(sessionId: string, issuer: string, clientId: string, secret: string) {
  window.localStorage.setItem(CURRENT, sessionId)
  window.localStorage.setItem(recordKey(sessionId), JSON.stringify({
    clientId,
    clientSecret: secret,
    clientType: 'dynamic',
    clientName: 'LinX',
    expiresAt: '0',
    issuer,
    redirectUrl: REDIRECT,
  }))
}

beforeEach(() => {
  window.localStorage.clear()
  installProviders()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('Inrupt 4.0.0 registration semantics', () => {
  it('clears a stored registration on interactive login, so storage alone cannot preserve it', async () => {
    seedSession('linx-auth', ISSUER_A, 'original-client', 'original-secret')

    const result = await authorize('linx-auth', ISSUER_A, { prompt: 'consent' })

    // Documents WHY the client is passed in rather than only stored.
    expect(result.clientId).toBe(`${ISSUER_A}-client-1`)
    expect(result.registeredForIssuer).toBe(1)
    expect(getStoredSolidClientLoginOptions(ISSUER_A)).toEqual({
      clientId: `${ISSUER_A}-client-1`,
      clientSecret: `${ISSUER_A}-secret-1`,
    })
  })

  it('reuses the same client for a prompt=none -> consent retry', async () => {
    seedSession('linx-auth', ISSUER_A, 'original-client', 'original-secret')

    const client = getStoredSolidClientLoginOptions(ISSUER_A)
    expect(client).toEqual({ clientId: 'original-client', clientSecret: 'original-secret' })

    const silent = await authorize('linx-auth', ISSUER_A, { prompt: 'none', ...client })
    const interactive = await authorize('linx-auth', ISSUER_A, { prompt: 'consent', ...client })

    // No second registration, so the consent prompt covers the same client.
    expect(silent.clientId).toBe('original-client')
    expect(interactive.clientId).toBe('original-client')
    expect(registrations[ISSUER_A]).toBe(0)
  })

  it('registers a fresh client when no reusable registration exists', async () => {
    const result = await authorize('linx-auth', ISSUER_A, { prompt: 'consent' })

    expect(result.registeredForIssuer).toBe(1)
    expect(result.clientId).toBe(`${ISSUER_A}-client-1`)
  })
})

describe('A -> B -> A isolation across real interactive clears', () => {
  it('performs two registrations, not three, and keeps A after forgetting B', async () => {
    // --- A registers for the first time -------------------------------------
    const firstA = await authorize('session-a', ISSUER_A, { prompt: 'consent' })
    expect(firstA.registeredForIssuer).toBe(1)
    expect(firstA.clientId).toBe(`${ISSUER_A}-client-1`)
    seedSession('session-a', ISSUER_A, `${ISSUER_A}-client-1`, `${ISSUER_A}-secret-1`)
    rememberSolidClientRegistration()

    // --- switch to B: A is snapshotted first, then B registers --------------
    const clientForB = getStoredSolidClientLoginOptions(ISSUER_B)
      ?? adoptPreservedSolidClientRegistration('session-b', ISSUER_B)
    expect(clientForB).toBeNull()
    const firstB = await authorize('session-b', ISSUER_B, { prompt: 'consent' })
    expect(firstB.registeredForIssuer).toBe(1)
    expect(firstB.clientId).toBe(`${ISSUER_B}-client-1`)
    seedSession('session-b', ISSUER_B, `${ISSUER_B}-client-1`, `${ISSUER_B}-secret-1`)
    rememberSolidClientRegistration()

    // --- back to A: the SDK wiped A's session record on B's login, but the
    //     issuer-keyed cache still has A's client -> reuse, no third DCR -----
    const clientForA = getStoredSolidClientLoginOptions(ISSUER_A)
      ?? adoptPreservedSolidClientRegistration('session-a-again', ISSUER_A)
    expect(clientForA).toEqual({
      clientId: `${ISSUER_A}-client-1`,
      clientSecret: `${ISSUER_A}-secret-1`,
    })
    const secondA = await authorize('session-a-again', ISSUER_A, { prompt: 'consent', ...clientForA })
    expect(secondA.clientId).toBe(`${ISSUER_A}-client-1`)
    expect(registrations[ISSUER_A]).toBe(1)

    // Two registrations total for a full A -> B -> A cycle.
    expect(registrations[ISSUER_A] + registrations[ISSUER_B]).toBe(2)
  })

  it('explicitly forgetting A removes A only and leaves B reusable', async () => {
    const firstA = await authorize('session-a', ISSUER_A, { prompt: 'consent' })
    seedSession('session-a', ISSUER_A, `${ISSUER_A}-client-1`, `${ISSUER_A}-secret-1`)
    rememberSolidClientRegistration()
    expect(firstA.clientId).toBe(`${ISSUER_A}-client-1`)

    const firstB = await authorize('session-b', ISSUER_B, { prompt: 'consent' })
    seedSession('session-b', ISSUER_B, `${ISSUER_B}-client-1`, `${ISSUER_B}-secret-1`)
    rememberSolidClientRegistration()
    expect(firstB.clientId).toBe(`${ISSUER_B}-client-1`)

    // Explicit forget of A only.
    expect(clearSolidClientRegistrationForAccount({ issuerUrl: ISSUER_A })).toBe(true)
    clearSolidSessionForAccount({ issuerUrl: ISSUER_A })

    // B is untouched and still reusable without another registration.
    const reuseB = getStoredSolidClientLoginOptions(ISSUER_B)
    expect(reuseB).toEqual({
      clientId: `${ISSUER_B}-client-1`,
      clientSecret: `${ISSUER_B}-secret-1`,
    })
    const secondB = await authorize('session-b-again', ISSUER_B, { prompt: 'consent', ...reuseB })
    expect(secondB.clientId).toBe(`${ISSUER_B}-client-1`)
    expect(registrations[ISSUER_B]).toBe(1)

    // A was forgotten, so it must register again next time.
    expect(getStoredSolidClientLoginOptions(ISSUER_A)).toBeNull()
    const retryA = await authorize('session-a-again', ISSUER_A, { prompt: 'consent' })
    expect(retryA.clientId).toBe(`${ISSUER_A}-client-2`)
    expect(registrations[ISSUER_A]).toBe(2)
  })
})

describe('invalid_client reset on the real SDK path', () => {
  it('costs exactly one extra registration and then reuses the new client', async () => {
    seedSession('linx-auth', ISSUER_A, 'deleted-client', 'deleted-secret')
    rememberSolidClientRegistration()
    expect(getStoredSolidClientLoginOptions(ISSUER_A)).toEqual({
      clientId: 'deleted-client',
      clientSecret: 'deleted-secret',
    })

    // Bounded reset: the rejected registration is dropped for this issuer only.
    expect(clearSolidClientRegistration()).toBe(true)
    expect(getStoredSolidClientLoginOptions(ISSUER_A)).toBeNull()

    // First attempt after the reset registers exactly once.
    const retry = await authorize('linx-auth', ISSUER_A, { prompt: 'consent' })
    expect(retry.registeredForIssuer).toBe(1)
    expect(retry.clientId).toBe(`${ISSUER_A}-client-1`)
    seedSession('linx-auth', ISSUER_A, `${ISSUER_A}-client-1`, `${ISSUER_A}-secret-1`)
    rememberSolidClientRegistration()

    // ...and that client is reused afterwards.
    const reused = getStoredSolidClientLoginOptions(ISSUER_A)
    const later = await authorize('linx-auth', ISSUER_A, { prompt: 'consent', ...reused })
    expect(later.clientId).toBe(`${ISSUER_A}-client-1`)
    expect(registrations[ISSUER_A]).toBe(1)
  })
})

describe('public (secretless) clients', () => {
  it('reuses a secretless client across A -> B -> A with two registrations, not three', async () => {
    installProviders({ issueClientSecret: false })
    window.localStorage.clear()

    // --- A registers as a public client (provider returned no secret) --------
    const firstA = await authorize('session-a', ISSUER_A, { prompt: 'consent' })
    expect(firstA.registeredForIssuer).toBe(1)
    const aClientId = `${ISSUER_A}-client-1`
    expect(firstA.clientId).toBe(aClientId)

    // The SDK's own record for a public client: clientId + type, NO secret.
    window.localStorage.setItem(CURRENT, 'session-a')
    window.localStorage.setItem(recordKey('session-a'), JSON.stringify({
      clientId: aClientId,
      clientType: 'dynamic',
      clientName: 'LinX',
      issuer: ISSUER_A,
      redirectUrl: REDIRECT,
    }))
    expect(rememberSolidClientRegistration()).toBe(true)

    // --- switch to B -------------------------------------------------------
    expect(getStoredSolidClientLoginOptions(ISSUER_B)).toBeNull()
    const firstB = await authorize('session-b', ISSUER_B, { prompt: 'consent' })
    expect(firstB.registeredForIssuer).toBe(1)
    window.localStorage.setItem(CURRENT, 'session-b')
    window.localStorage.setItem(recordKey('session-b'), JSON.stringify({
      clientId: `${ISSUER_B}-client-1`,
      clientType: 'dynamic',
      clientName: 'LinX',
      issuer: ISSUER_B,
      redirectUrl: REDIRECT,
    }))
    rememberSolidClientRegistration()

    // --- back to A: A's session record was wiped; the cache still has it ----
    const clientForA = getStoredSolidClientLoginOptions(ISSUER_A)
    expect(clientForA).toEqual({ clientId: aClientId })
    // A public client must never gain an invented secret.
    expect(clientForA).not.toHaveProperty('clientSecret')

    const secondA = await authorize('session-a-again', ISSUER_A, { prompt: 'consent', ...clientForA })
    expect(secondA.clientId).toBe(aClientId)
    expect(registrations[ISSUER_A]).toBe(1)
    expect(registrations[ISSUER_A] + registrations[ISSUER_B]).toBe(2)
  })

  it('keeps the silent -> consent retry on the same secretless client', async () => {
    installProviders({ issueClientSecret: false })
    window.localStorage.clear()

    const first = await authorize('session-a', ISSUER_A, { prompt: 'none' })
    expect(first.registeredForIssuer).toBe(1)
    window.localStorage.setItem(CURRENT, 'session-a')
    window.localStorage.setItem(recordKey('session-a'), JSON.stringify({
      clientId: `${ISSUER_A}-client-1`,
      clientType: 'dynamic',
      clientName: 'LinX',
      issuer: ISSUER_A,
      redirectUrl: REDIRECT,
    }))
    rememberSolidClientRegistration()

    const client = getStoredSolidClientLoginOptions(ISSUER_A)
    expect(client).toEqual({ clientId: `${ISSUER_A}-client-1` })

    const consent = await authorize('session-a-retry', ISSUER_A, { prompt: 'consent', ...client })
    expect(consent.clientId).toBe(`${ISSUER_A}-client-1`)
    // Still no second registration, and the capability stays DPoP by default.
    expect(registrations[ISSUER_A]).toBe(1)
  })
})

describe('callback token exchange reuses the consented client', () => {
  /**
   * Stops at the token request on purpose: the token endpoint answers 400 after
   * being captured. This asserts CLIENT REUSE at the callback, not a completed
   * OAuth exchange (no ID token or JWKS fixture is built).
   */
  async function runCallback(withAdapter: boolean) {
    installProviders({ captureTokenRequests: true })
    window.localStorage.clear()

    const sessionId = 'sess-cb'
    window.localStorage.setItem(CURRENT, sessionId)
    window.localStorage.setItem(recordKey(sessionId), JSON.stringify({
      clientId: 'original-client',
      clientSecret: 'original-secret',
      clientType: 'dynamic',
      clientName: 'LinX',
      expiresAt: '0',
      issuer: ISSUER_A,
      redirectUrl: REDIRECT,
    }))
    rememberSolidClientRegistration()

    const session = withAdapter
      // The production storage boundary — this is what the app actually uses.
      ? new Session({
          insecureStorage: new PersistentSessionStorage(window.localStorage, 'insecure'),
          secureStorage: new PersistentSessionStorage(window.localStorage, 'secure'),
        }, sessionId)
      // Plain passthrough, to show what happens WITHOUT the repair.
      : new Session({}, sessionId)

    let authorizationUrl: string | null = null
    await Promise.race([
      session.login({
        oidcIssuer: ISSUER_A,
        redirectUrl: REDIRECT,
        clientName: 'LinX',
        prompt: 'consent',
        clientId: 'original-client',
        clientSecret: 'original-secret',
        handleRedirect: (url: string) => { authorizationUrl = url },
      } as Parameters<Session['login']>[0]),
      new Promise((resolve) => setTimeout(resolve, 400)),
    ]).catch(() => undefined)

    const state = authorizationUrl
      ? new URL(authorizationUrl).searchParams.get('state')
      : null
    expect(state).toBeTruthy()

    const registrationsAfterLogin = registrations[ISSUER_A]
    const errors: string[] = []
    session.events.on('error' as never, ((code: unknown, detail: unknown) => {
      errors.push(`${String(code)}:${String(detail)}`)
    }) as never)

    await Promise.race([
      session.handleIncomingRedirect({
        url: `${window.location.origin}/auth/callback?code=abc&state=${state}`,
        restorePreviousSession: false,
      }).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]).catch(() => undefined)

    return {
      registrationsAfterLogin,
      registrationsAfterCallback: registrations[ISSUER_A],
      tokenRequests,
      errors,
    }
  }

  it('without the repair the callback registers a DIFFERENT client before the token exchange', async () => {
    const result = await runCallback(false)

    expect(result.registrationsAfterLogin).toBe(0)
    // Proves the defect: the callback performs a second DCR.
    expect(result.registrationsAfterCallback).toBe(1)
    expect(result.tokenRequests, JSON.stringify(result.errors)).toHaveLength(1)
    // ...and the token exchange then uses that NEW client, not the consented one.
    expect(result.tokenRequests[0].body.get('client_id')).toBe(`${ISSUER_A}-client-1`)
  })

  it('with the storage boundary the callback reuses the ORIGINAL client and skips DCR', async () => {
    const result = await runCallback(true)

    expect(result.registrationsAfterLogin).toBe(0)
    // The whole point: no second dynamic registration during the callback.
    expect(result.registrationsAfterCallback).toBe(0)
    expect(result.tokenRequests, JSON.stringify(result.errors)).toHaveLength(1)

    // The token request carries the client the user actually consented to.
    expect(result.tokenRequests[0].body.get('client_id')).toBe('original-client')
    expect(result.tokenRequests[0].headers.Authorization).toBe(
      `Basic ${btoa('original-client:original-secret')}`,
    )
  })
})
