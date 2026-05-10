const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

test('EmbeddedAuthorizationSheet resets to closed state when auth page fails to load', async (t) => {
  const originalLoad = Module._load

  class FakeBrowserWindow {
    constructor() {
      this.webContents = {
        loadURL: async () => {
          throw new Error('load failed')
        },
        executeJavaScript: async () => 'installed',
        on: () => undefined,
        getURL: () => 'http://localhost:3000/.account/oidc/consent/',
        setWindowOpenHandler: () => undefined,
      }
    }

    focus() {}
    show() {}
    isDestroyed() {
      return false
    }
    on() {}
    close() {
      this.closed = true
    }
  }

  FakeBrowserWindow.prototype.closed = false

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
  const sheet = new EmbeddedAuthorizationSheet({
    getMainWindow: () => ({
      isDestroyed: () => false,
    }),
    onStateChange: (state) => states.push(state),
  })

  await assert.rejects(
    () => sheet.open('http://localhost:3000/.account/oidc/consent/'),
    /load failed/,
  )

  assert.deepEqual(states, [
    { open: true, reason: 'opened', ready: false },
    { open: false, reason: 'dismissed', ready: false },
  ])
  assert.deepEqual(sheet.getState(), { open: false, reason: 'dismissed', ready: false })
})
