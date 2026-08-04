import * as matchers from '@testing-library/jest-dom/matchers'
import { expect, vi } from 'vitest'

expect.extend(matchers);

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
