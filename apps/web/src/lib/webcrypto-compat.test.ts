import { afterEach, describe, expect, it, vi } from 'vitest'
import { installWebCryptoCompat } from './webcrypto-compat'

describe('installWebCryptoCompat', () => {
  const originalCryptoKey = globalThis.CryptoKey

  afterEach(() => {
    vi.restoreAllMocks()
    if (typeof originalCryptoKey === 'undefined') {
      Reflect.deleteProperty(globalThis, 'CryptoKey')
    } else {
      Object.defineProperty(globalThis, 'CryptoKey', {
        configurable: true,
        writable: true,
        value: originalCryptoKey,
      })
    }
  })

  it('derives CryptoKey from WebCrypto when the global constructor is missing', async () => {
    const generatedKey = await globalThis.crypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )

    Reflect.deleteProperty(globalThis, 'CryptoKey')
    expect(typeof globalThis.CryptoKey).toBe('undefined')

    await installWebCryptoCompat()

    expect(globalThis.CryptoKey).toBe(Object.getPrototypeOf(generatedKey).constructor)
  })

  it('does not replace an existing CryptoKey global', async () => {
    const existingCryptoKey = globalThis.CryptoKey

    await installWebCryptoCompat()

    expect(globalThis.CryptoKey).toBe(existingCryptoKey)
  })

  it('keeps booting if WebCrypto cannot derive a constructor', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const originalCrypto = globalThis.crypto
    Reflect.deleteProperty(globalThis, 'CryptoKey')
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        subtle: {
          generateKey: vi.fn().mockRejectedValue(new Error('not available')),
        },
      },
    })

    await installWebCryptoCompat()

    expect(typeof globalThis.CryptoKey).toBe('undefined')
    expect(warn).toHaveBeenCalledWith(
      '[webcrypto-compat] failed to install CryptoKey shim:',
      expect.any(Error),
    )

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    })
  })
})
