import { describe, expect, it } from 'vitest'
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
})
