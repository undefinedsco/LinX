const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

test('EmbeddedXpodSettingsSheet keeps same-origin popup navigation inside the embedded sheet', async (t) => {
  const originalLoad = Module._load
  const actions = []
  let openHandler = null

  class FakeBrowserView {
    constructor() {
      this.webContents = {
        loadURL: async (url) => {
          actions.push(`loadURL:${url}`)
        },
        focus: () => undefined,
        isDestroyed: () => false,
        on: () => undefined,
        getURL: () => 'http://localhost:3000/dashboard/',
        close: () => undefined,
        setWindowOpenHandler: (handler) => {
          openHandler = handler
        },
      }
    }

    setBounds() {}
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        BrowserView: FakeBrowserView,
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

  const modulePath = resolveCompiledDesktopModule('lib/embedded-xpod-settings-sheet.js')
  const helperPath = resolveCompiledDesktopModule('lib/window-open-routing.js')
  delete require.cache[modulePath]
  delete require.cache[helperPath]
  const { EmbeddedXpodSettingsSheet } = require(modulePath)

  const sheet = new EmbeddedXpodSettingsSheet({
    getMainWindow: () => ({
      isDestroyed: () => false,
      addBrowserView: () => undefined,
      setTopBrowserView: () => undefined,
      on: () => undefined,
      removeListener: () => undefined,
      getContentBounds: () => ({ width: 1200, height: 800 }),
    }),
  })

  await sheet.open('http://localhost:3000/dashboard/')

  assert.equal(typeof openHandler, 'function')
  const result = openHandler({ url: 'http://localhost:3000/.account/account/' })
  await Promise.resolve()

  assert.deepEqual(result, { action: 'deny' })
  assert.equal(actions.includes('loadURL:http://localhost:3000/.account/account/'), true)
  assert.equal(actions.some((entry) => entry.startsWith('openExternal:')), false)
})

test('EmbeddedXpodSettingsSheet sends cross-origin popup navigation to the system browser', async (t) => {
  const originalLoad = Module._load
  const actions = []
  let openHandler = null

  class FakeBrowserView {
    constructor() {
      this.webContents = {
        loadURL: async () => undefined,
        focus: () => undefined,
        isDestroyed: () => false,
        on: () => undefined,
        getURL: () => 'http://localhost:3000/dashboard/',
        close: () => undefined,
        setWindowOpenHandler: (handler) => {
          openHandler = handler
        },
      }
    }

    setBounds() {}
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        BrowserView: FakeBrowserView,
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

  const modulePath = resolveCompiledDesktopModule('lib/embedded-xpod-settings-sheet.js')
  const helperPath = resolveCompiledDesktopModule('lib/window-open-routing.js')
  delete require.cache[modulePath]
  delete require.cache[helperPath]
  const { EmbeddedXpodSettingsSheet } = require(modulePath)

  const sheet = new EmbeddedXpodSettingsSheet({
    getMainWindow: () => ({
      isDestroyed: () => false,
      addBrowserView: () => undefined,
      setTopBrowserView: () => undefined,
      on: () => undefined,
      removeListener: () => undefined,
      getContentBounds: () => ({ width: 1200, height: 800 }),
    }),
  })

  await sheet.open('http://localhost:3000/dashboard/')

  assert.equal(typeof openHandler, 'function')
  const result = openHandler({ url: 'https://example.com/docs' })
  await Promise.resolve()

  assert.deepEqual(result, { action: 'deny' })
  assert.deepEqual(actions, ['openExternal:https://example.com/docs'])
})
