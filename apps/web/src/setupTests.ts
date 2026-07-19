import * as matchers from '@testing-library/jest-dom/matchers'
import { expect, vi } from 'vitest'

expect.extend(matchers);

// Mock scrollIntoView for JSDOM
if (typeof window !== 'undefined' && window.HTMLElement?.prototype) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
}

if (typeof window !== 'undefined' && typeof window.localStorage?.getItem !== 'function') {
  const values = new Map<string, string>()
  const storage = {
    get length() {
      return values.size
    },
    clear: () => {
      for (const key of values.keys()) {
        delete (storage as Record<string, unknown>)[key]
      }
      values.clear()
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key)
      delete (storage as Record<string, unknown>)[key]
    },
    setItem: (key: string, value: string) => {
      const stringValue = String(value)
      values.set(key, stringValue)
      Object.defineProperty(storage, key, {
        value: stringValue,
        enumerable: true,
        configurable: true,
      })
    },
  } as Storage

  Object.defineProperty(window, 'localStorage', {
    value: storage,
    configurable: true,
  })
  vi.stubGlobal('localStorage', storage)
}
