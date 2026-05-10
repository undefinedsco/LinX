export async function installWebCryptoCompat(): Promise<void> {
  if (typeof globalThis === 'undefined') {
    return
  }

  if (typeof globalThis.CryptoKey !== 'undefined') {
    return
  }

  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    return
  }

  try {
    const key = await subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
    const cryptoKeyConstructor = Object.getPrototypeOf(key)?.constructor
    if (typeof cryptoKeyConstructor === 'function' && typeof globalThis.CryptoKey === 'undefined') {
      Object.defineProperty(globalThis, 'CryptoKey', {
        configurable: true,
        writable: true,
        value: cryptoKeyConstructor,
      })
    }
  } catch (error) {
    console.warn('[webcrypto-compat] failed to install CryptoKey shim:', error)
  }
}
