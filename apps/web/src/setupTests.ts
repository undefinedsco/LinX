import * as matchers from '@testing-library/jest-dom/matchers'
import { expect, vi } from 'vitest'

expect.extend(matchers);

// Mock scrollIntoView for JSDOM
if (typeof window !== 'undefined' && window.HTMLElement?.prototype) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
}
