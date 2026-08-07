import * as matchers from '@testing-library/jest-dom/matchers'
import { expect, vi } from 'vitest'

expect.extend(matchers);

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(String(key), String(value)) }
}

function ensureTestStorage(name: 'localStorage' | 'sessionStorage') {
  const current = window[name]
  const storage = typeof current?.getItem === 'function' && typeof current?.setItem === 'function'
    ? current
    : new MemoryStorage()
  Object.defineProperty(window, name, { configurable: true, value: storage })
  Object.defineProperty(globalThis, name, { configurable: true, value: storage })
}

if (typeof window !== 'undefined') {
  // Node 25 exposes an incomplete global localStorage unless a backing file is
  // configured. Vitest can copy that object over JSDOM's complete Storage API.
  ensureTestStorage('localStorage')
  ensureTestStorage('sessionStorage')
}

// Mock scrollIntoView for JSDOM
if (typeof window !== 'undefined' && window.HTMLElement?.prototype) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
}

function createTestClientRect(): DOMRect {
  if (typeof DOMRect !== 'undefined') return new DOMRect(0, 0, 0, 0)
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect
}

function createTestClientRectList(): DOMRectList {
  const rect = createTestClientRect()
  return {
    0: rect,
    length: 1,
    item: (index: number) => index === 0 ? rect : null,
    [Symbol.iterator]: function* () {
      yield rect
    },
  } as DOMRectList
}

if (typeof window !== 'undefined') {
  if (!window.CSS) {
    Object.defineProperty(window, 'CSS', {
      configurable: true,
      value: {},
    })
  }
  if (typeof window.CSS.supports !== 'function') {
    window.CSS.supports = vi.fn(() => false)
  }

  const getClientRects = () => createTestClientRectList()
  const getBoundingClientRect = () => createTestClientRect()

  if (window.Range?.prototype && !window.Range.prototype.getClientRects) {
    window.Range.prototype.getClientRects = getClientRects
  }
  if (window.Range?.prototype && !window.Range.prototype.getBoundingClientRect) {
    window.Range.prototype.getBoundingClientRect = getBoundingClientRect
  }
  if (window.Element?.prototype && !window.Element.prototype.getClientRects) {
    window.Element.prototype.getClientRects = getClientRects
  }
  if (window.Element?.prototype && !window.Element.prototype.getBoundingClientRect) {
    window.Element.prototype.getBoundingClientRect = getBoundingClientRect
  }
}
