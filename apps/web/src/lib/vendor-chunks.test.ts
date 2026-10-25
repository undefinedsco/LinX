import { describe, expect, it } from 'vitest'

import { resolveVendorChunk } from '../../vite.config'

describe('resolveVendorChunk', () => {
  it('keeps vite virtual helpers out of heavy lazy vendor chunks', () => {
    // The entry chunk statically imports the preload helper; if it lands in
    // vendor-mermaid the first paint downloads ~2.8MB of mermaid.
    expect(resolveVendorChunk('\0vite/preload-helper.js')).toBe('runtime-helpers')
    expect(resolveVendorChunk('\0commonjsHelpers.js')).toBe('runtime-helpers')
  })

  it('still routes mermaid and d3 to the lazy vendor chunk', () => {
    expect(resolveVendorChunk('/repo/node_modules/mermaid/dist/mermaid.js')).toBe('vendor-mermaid')
    expect(resolveVendorChunk('/repo/node_modules/d3-scale/src/index.js')).toBe('vendor-mermaid')
  })
})
