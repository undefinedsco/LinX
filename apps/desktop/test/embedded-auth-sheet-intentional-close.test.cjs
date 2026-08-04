const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

test('EmbeddedAuthorizationSheet swallows load errors after an intentional close', async (t) => {
  const originalLoad = Module._load

  let sheetRef = null

  class FakeBrowserWindow {
    constructor() {
      this.closed = false
      const window = this
      this.webContents = {
        loadURL: async () => {
          sheetRef.close('dismissed')
          throw new Error('Object has been destroyed')
        },
        executeJavaScript: async () => 'installed',
        on: () => undefined,
        getURL: () => 'http://localhost:3000/.account/oidc/consent/',
        setWindowOpenHandler: () => undefined,
        isDestroyed: () => window.closed,
      }
    }

    focus() {}
    show() {}
    isDestroyed() {
      return this.closed
    }
    on() {}
    close() {
      this.closed = true
    }
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        BrowserWindow: FakeBrowserWindow,
        shell: {
          openExternal: async () => undefined,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const modulePath = resolveCompiledDesktopModule('lib/embedded-auth-sheet.js')
  const helperPath = resolveCompiledDesktopModule('lib/window-open-routing.js')
  delete require.cache[modulePath]
  delete require.cache[helperPath]
  const { EmbeddedAuthorizationSheet } = require(modulePath)

  const states = []
  sheetRef = new EmbeddedAuthorizationSheet({
    getMainWindow: () => ({
      isDestroyed: () => false,
    }),
    onStateChange: (state) => states.push(state),
  })

  await sheetRef.open('http://localhost:3000/.account/oidc/consent/')

  assert.deepEqual(states, [
    { open: true, reason: 'opened', ready: false },
    { open: false, reason: 'dismissed', ready: false },
  ])
  assert.deepEqual(sheetRef.getState(), { open: false, reason: 'dismissed', ready: false })
})
