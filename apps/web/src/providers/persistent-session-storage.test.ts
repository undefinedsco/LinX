import { beforeEach, describe, expect, it } from 'vitest'
import { PersistentSessionStorage } from './persistent-session-storage'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear() { values.clear() },
    getItem(key) { return values.get(key) ?? null },
    key(index) { return Array.from(values.keys())[index] ?? null },
    removeItem(key) { values.delete(key) },
    setItem(key, value) { values.set(key, value) },
  }
}

const CACHE_KEY = 'linx-solid-client-registration'
const RECORD = 'solidClientAuthenticationUser:session-1'
const ISSUER = 'https://id.example.com'

function cacheRegistration(entry: Record<string, unknown>) {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify({ [ISSUER]: entry }))
}

describe('PersistentSessionStorage', () => {
  it('keeps secure auth records available to a newly created session', async () => {
    const browserStorage = createMemoryStorage()
    const firstSessionStorage = new PersistentSessionStorage(browserStorage, 'secure')
    const secondSessionStorage = new PersistentSessionStorage(browserStorage, 'secure')

    await firstSessionStorage.set(
      'solidClientAuthenticationUser:session-1',
      JSON.stringify({ isLoggedIn: 'true', refreshToken: 'refresh-token' }),
    )

    await expect(secondSessionStorage.get('solidClientAuthenticationUser:session-1'))
      .resolves.toBe(JSON.stringify({ isLoggedIn: 'true', refreshToken: 'refresh-token' }))
  })

  it('deletes namespaced records without touching the regular app storage', async () => {
    const browserStorage = createMemoryStorage()
    browserStorage.setItem('solidClientAuthenticationUser:session-1', 'insecure')
    const sessionStorage = new PersistentSessionStorage(browserStorage, 'secure')

    await sessionStorage.set('solidClientAuthenticationUser:session-1', 'secure')
    await sessionStorage.delete('solidClientAuthenticationUser:session-1')

    expect(browserStorage.getItem('solidClientAuthenticationUser:session-1')).toBe('insecure')
    expect(browserStorage.getItem('solidClientAuthn:secure:solidClientAuthenticationUser:session-1')).toBeNull()
  })

  describe('reusable client metadata boundary', () => {
    beforeEach(() => {
      window.localStorage.clear()
    })

    it('adds the missing expiry to the SDK record for the same issuer and client', async () => {
      cacheRegistration({
        clientId: 'client-1',
        clientSecret: 'secret-1',
        clientType: 'dynamic',
        expiresAt: '0',
        issuer: ISSUER,
      })
      const storage = new PersistentSessionStorage(window.localStorage, 'insecure')

      // Exactly what the SDK's static-client path writes: no expiresAt.
      await storage.set(RECORD, JSON.stringify({
        clientId: 'client-1',
        clientType: 'static',
        clientSecret: 'secret-1',
        clientName: 'LinX',
        issuer: ISSUER,
        codeVerifier: 'keep-me',
        dpop: 'true',
      }))

      const written = JSON.parse(window.localStorage.getItem(RECORD) ?? '{}')
      expect(written).toMatchObject({
        clientId: 'client-1',
        clientSecret: 'secret-1',
        clientType: 'dynamic',
        expiresAt: '0',
      })
      // PKCE and DPoP state must survive untouched.
      expect(written.codeVerifier).toBe('keep-me')
      expect(written.dpop).toBe('true')
    })

    it('does not merge when the clientId differs from the cached one', async () => {
      cacheRegistration({
        clientId: 'cached-client',
        clientSecret: 'secret-1',
        clientType: 'dynamic',
        expiresAt: '0',
        issuer: ISSUER,
      })
      const storage = new PersistentSessionStorage(window.localStorage, 'insecure')
      const payload = JSON.stringify({
        clientId: 'different-client',
        clientType: 'static',
        issuer: ISSUER,
      })

      await storage.set(RECORD, payload)

      expect(window.localStorage.getItem(RECORD)).toBe(payload)
    })

    it('does not merge across issuers', async () => {
      cacheRegistration({
        clientId: 'client-1',
        clientSecret: 'secret-1',
        clientType: 'dynamic',
        expiresAt: '0',
        issuer: ISSUER,
      })
      const storage = new PersistentSessionStorage(window.localStorage, 'insecure')
      const payload = JSON.stringify({
        clientId: 'client-1',
        clientType: 'static',
        issuer: 'https://other.example.com',
      })

      await storage.set(RECORD, payload)

      expect(window.localStorage.getItem(RECORD)).toBe(payload)
    })

    it('never touches the secure (token / DPoP) store', async () => {
      cacheRegistration({
        clientId: 'client-1',
        clientSecret: 'secret-1',
        clientType: 'dynamic',
        expiresAt: '0',
        issuer: ISSUER,
      })
      const storage = new PersistentSessionStorage(window.localStorage, 'secure')
      const payload = JSON.stringify({
        clientId: 'client-1',
        clientType: 'static',
        issuer: ISSUER,
        refreshToken: 'must-not-change',
      })

      await storage.set(RECORD, payload)

      expect(window.localStorage.getItem(`solidClientAuthn:secure:${RECORD}`)).toBe(payload)
    })

    it('leaves non-session keys alone', async () => {
      const storage = new PersistentSessionStorage(window.localStorage, 'insecure')
      await storage.set('linx-something-else', '{"a":1}')
      expect(window.localStorage.getItem('linx-something-else')).toBe('{"a":1}')
    })
  })
})
