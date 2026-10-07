import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

describe('Radix modal interaction state', () => {
  it('shares one dismissable layer between menus, dialogs and popovers', () => {
    // Each copy owns its own body pointer-event lock. Opening a dialog from
    // a different menu copy can otherwise restore `none` after both close.
    const layers = [
      '@radix-ui/react-dialog',
      '@radix-ui/react-menu',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-toast',
    ].map(name => createRequire(require.resolve(name)).resolve('@radix-ui/react-dismissable-layer'))
    expect(new Set(layers).size).toBe(1)
  })
})
