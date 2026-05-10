const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

test('EmbeddedXpodSettingsSheet resets to closed state when dashboard fails to load', async (t) => {
  const originalLoad = Module._load

  class FakeBrowserView {
    constructor() {
      this.webContents = {
        loadURL: async () => {
          throw new Error('load failed')
        },
        focus: () => undefined,
        isDestroyed: () => false,
        on: () => undefined,
        close: () => undefined,
      }
    }

    setBounds() {}
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

  const states = []
  const sheet = new EmbeddedXpodSettingsSheet({
    getMainWindow: () => ({
      isDestroyed: () => false,
      addBrowserView: () => undefined,
      setTopBrowserView: () => undefined,
      on: () => undefined,
      removeListener: () => undefined,
      getContentBounds: () => ({ width: 1200, height: 800 }),
    }),
    onStateChange: (state) => states.push(state),
  })

  await assert.rejects(
    () => sheet.open('http://localhost:3000/dashboard/'),
    /load failed/,
  )

  assert.deepEqual(states, [
    { open: true, reason: 'opened', ready: false },
    { open: false, reason: 'closed', ready: false },
  ])
  assert.deepEqual(sheet.getState(), { open: false, reason: 'closed', ready: false })
})
