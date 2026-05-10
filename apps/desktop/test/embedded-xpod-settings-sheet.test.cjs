const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const {
  EmbeddedXpodSettingsSheet,
  getEmbeddedXpodSettingsBounds,
} = require(resolveCompiledDesktopModule('lib/embedded-xpod-settings-sheet.js'))

test('EmbeddedXpodSettingsSheet exposes closed state before opening', () => {
  const sheet = new EmbeddedXpodSettingsSheet({
    getMainWindow: () => null,
  })

  assert.deepEqual(sheet.getState(), {
    open: false,
    reason: 'closed',
    ready: false,
  })
})

test('getEmbeddedXpodSettingsBounds centers a large settings surface inside the main window', () => {
  const bounds = getEmbeddedXpodSettingsBounds({ width: 1400, height: 900 })

  assert.deepEqual(bounds, {
    x: 140,
    y: 50,
    width: 1120,
    height: 800,
  })
})

test('getEmbeddedXpodSettingsBounds clamps to the available parent size', () => {
  const bounds = getEmbeddedXpodSettingsBounds({ width: 900, height: 640 })

  assert.deepEqual(bounds, {
    x: 24,
    y: 24,
    width: 852,
    height: 592,
  })
})

test('EmbeddedXpodSettingsSheet returns focus to the main window when it closes', async () => {
  const actions = []
  const view = {
    webContents: {
      loadURL: async () => undefined,
      focus: () => undefined,
      isDestroyed: () => false,
      on: () => undefined,
      close: () => undefined,
      setWindowOpenHandler: () => undefined,
    },
    setBounds: () => undefined,
  }

  const mainWindow = {
    isDestroyed: () => false,
    addBrowserView: () => undefined,
    setTopBrowserView: () => undefined,
    on: () => undefined,
    removeListener: () => undefined,
    removeBrowserView: () => {
      actions.push('removeBrowserView')
    },
    focus: () => {
      actions.push('focusWindow')
    },
    getContentBounds: () => ({ width: 1200, height: 800 }),
    webContents: {
      focus: () => {
        actions.push('focusWebContents')
      },
    },
  }

  const sheet = new EmbeddedXpodSettingsSheet({
    getMainWindow: () => mainWindow,
  })

  sheet.view = view
  sheet.attachedWindow = mainWindow
  sheet.close()

  assert.deepEqual(actions, ['removeBrowserView', 'focusWebContents', 'focusWindow'])
})
