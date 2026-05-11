import { afterEach, describe, expect, it } from 'vitest'
import { installBrowserNodeGlobals } from './browser-node-globals'

describe('installBrowserNodeGlobals', () => {
  const originalProcess = (globalThis as typeof globalThis & { process?: unknown }).process

  afterEach(() => {
    if (typeof originalProcess === 'undefined') {
      Reflect.deleteProperty(globalThis, 'process')
    } else {
      Object.defineProperty(globalThis, 'process', {
        configurable: true,
        writable: true,
        value: originalProcess,
      })
    }
  })

  it('installs a minimal process.env object for browser-only dependencies', () => {
    Reflect.deleteProperty(globalThis, 'process')

    installBrowserNodeGlobals()

    expect((globalThis as any).process).toEqual({ env: {} })
  })

  it('preserves an existing process object and only fills env', () => {
    const processLike = { version: 'browser-test' }
    Object.defineProperty(globalThis, 'process', {
      configurable: true,
      writable: true,
      value: processLike,
    })

    installBrowserNodeGlobals()

    expect((globalThis as any).process).toBe(processLike)
    expect((globalThis as any).process.env).toEqual({})
  })
})
