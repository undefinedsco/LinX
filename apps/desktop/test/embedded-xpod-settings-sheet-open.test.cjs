const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

test('EmbeddedXpodSettingsSheet waits for dashboard load before attaching BrowserView', async (t) => {
  const originalLoad = Module._load
  const actions = []
  let resolveLoad

  class FakeBrowserView {
    constructor() {
      this.webContents = {
        loadURL: async (url) => {
          actions.push(`loadURL:${url}`)
          await new Promise((resolve) => {
            resolveLoad = resolve
          })
        },
        focus: () => {
          actions.push('focus')
        },
        isDestroyed: () => false,
        on: () => undefined,
        close: () => undefined,
      }
    }

    setBounds(bounds) {
      actions.push(`setBounds:${bounds.width}x${bounds.height}`)
    }
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        BrowserView: FakeBrowserView,
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const modulePath = resolveCompiledDesktopModule('lib/embedded-xpod-settings-sheet.js')
  delete require.cache[modulePath]
  const { EmbeddedXpodSettingsSheet } = require(modulePath)

  const mainWindow = {
    isDestroyed: () => false,
    addBrowserView: () => {
      actions.push('addBrowserView')
    },
    setTopBrowserView: () => {
      actions.push('setTopBrowserView')
    },
    on: () => undefined,
    removeListener: () => undefined,
    getContentBounds: () => ({ width: 1200, height: 800 }),
  }

  const states = []
  const sheet = new EmbeddedXpodSettingsSheet({
    getMainWindow: () => mainWindow,
    onStateChange: (state) => {
      states.push(state)
    },
  })

  const openPromise = sheet.open('http://localhost:3000/dashboard/')
  await Promise.resolve()

  assert.deepEqual(states.at(-1), { open: true, reason: 'opened', ready: false })
  assert.equal(actions.includes('addBrowserView'), false)

  resolveLoad()
  await openPromise

  assert.deepEqual(states.at(-1), { open: true, reason: 'opened', ready: true })
  assert.equal(actions.includes('addBrowserView'), true)
  assert.equal(actions.indexOf('addBrowserView') > actions.findIndex((entry) => entry.startsWith('loadURL:')), true)
  assert.equal(actions.includes('focus'), true)
})
