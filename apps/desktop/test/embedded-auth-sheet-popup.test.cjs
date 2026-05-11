const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

test('EmbeddedAuthorizationSheet keeps same-origin popup navigation inside the embedded sheet', async (t) => {
  const originalLoad = Module._load
  const actions = []
  let openHandler = null

  class FakeBrowserWindow {
    constructor() {
      this.webContents = {
        loadURL: async (url) => {
          actions.push(`loadURL:${url}`)
        },
        executeJavaScript: async (script) => {
          if (script.includes('__LINX_XPOD_AUTH_ENHANCER__')) {
            return 'installed'
          }

          return { width: 420, height: 560 }
        },
        on: () => undefined,
        getURL: () => 'http://localhost:3000/.account/oidc/consent/',
        setWindowOpenHandler: (handler) => {
          openHandler = handler
        },
      }
    }

    focus() {}
    show() {}
    isDestroyed() {
      return false
    }
    on() {}
    close() {}
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        BrowserWindow: FakeBrowserWindow,
        shell: {
          openExternal: async (url) => {
            actions.push(`openExternal:${url}`)
          },
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

  const sheet = new EmbeddedAuthorizationSheet({
    getMainWindow: () => ({
      isDestroyed: () => false,
    }),
  })

  await sheet.open('http://localhost:3000/.account/oidc/consent/')

  assert.equal(typeof openHandler, 'function')
  const result = openHandler({ url: 'http://localhost:3000/.account/account/' })
  await Promise.resolve()

  assert.deepEqual(result, { action: 'deny' })
  assert.equal(actions.includes('loadURL:http://localhost:3000/.account/account/?embedded=1'), true)
  assert.equal(actions.some((entry) => entry.startsWith('openExternal:')), false)
})

test('EmbeddedAuthorizationSheet sends cross-origin popup navigation to the system browser', async (t) => {
  const originalLoad = Module._load
  const actions = []
  let openHandler = null

  class FakeBrowserWindow {
    constructor() {
      this.webContents = {
        loadURL: async () => undefined,
        executeJavaScript: async (script) => {
          if (script.includes('__LINX_XPOD_AUTH_ENHANCER__')) {
            return 'installed'
          }

          return { width: 420, height: 560 }
        },
        on: () => undefined,
        getURL: () => 'http://localhost:3000/.account/oidc/consent/',
        setWindowOpenHandler: (handler) => {
          openHandler = handler
        },
      }
    }

    focus() {}
    show() {}
    isDestroyed() {
      return false
    }
    on() {}
    close() {}
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        BrowserWindow: FakeBrowserWindow,
        shell: {
          openExternal: async (url) => {
            actions.push(`openExternal:${url}`)
          },
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

  const sheet = new EmbeddedAuthorizationSheet({
    getMainWindow: () => ({
      isDestroyed: () => false,
    }),
  })

  await sheet.open('http://localhost:3000/.account/oidc/consent/')

  assert.equal(typeof openHandler, 'function')
  const result = openHandler({ url: 'https://example.com/docs' })
  await Promise.resolve()

  assert.deepEqual(result, { action: 'deny' })
  assert.deepEqual(actions, ['openExternal:https://example.com/docs'])
})
