const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

test('EmbeddedAuthorizationSheet waits for auth page load before showing BrowserWindow', async (t) => {
  const originalLoad = Module._load
  const originalSetTimeout = global.setTimeout
  const actions = []
  let resolveLoad

  global.setTimeout = () => 0

  class FakeBrowserWindow {
    constructor(options) {
      actions.push(`title:${options.title}`)
      this.title = options.title
      this.webContents = {
        loadURL: async (url) => {
          actions.push(`loadURL:${url}`)
          await new Promise((resolve) => {
            resolveLoad = resolve
          })
        },
        executeJavaScript: async (script) => {
          if (script.includes('linx-embedded-auth-controls')) {
            actions.push('installAuthControls')
            return 'installed'
          }

          if (script.includes('__LINX_XPOD_AUTH_ENHANCER__')) {
            actions.push('installAuthEnhancer')
            return 'installed'
          }

          return { width: 420, height: 560 }
        },
        on: () => undefined,
        getURL: () => 'http://localhost:3000/.account/oidc/consent/',
        setWindowOpenHandler: () => undefined,
        close: () => undefined,
      }
    }

    setTitle(title) {
      this.title = title
      actions.push(`setTitle:${title}`)
    }
    focus() {
      actions.push('focus')
    }
    show() {
      actions.push('show')
    }
    isDestroyed() {
      return false
    }
    on() {}
    close() {
      actions.push('close')
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
    global.setTimeout = originalSetTimeout
  })

  const modulePath = resolveCompiledDesktopModule('lib/embedded-auth-sheet.js')
  const helperPath = resolveCompiledDesktopModule('lib/window-open-routing.js')
  delete require.cache[modulePath]
  delete require.cache[helperPath]
  const { EmbeddedAuthorizationSheet } = require(modulePath)

  const mainWindow = {
    isDestroyed: () => false,
  }

  const states = []
  const sheet = new EmbeddedAuthorizationSheet({
    getMainWindow: () => mainWindow,
    onStateChange: (state) => {
      states.push(state)
    },
  })

  const openPromise = sheet.open('http://localhost:3000/.account/oidc/consent/', {
    providerLabel: 'Cloud',
  })
  await waitFor(() => actions.includes('loadURL:http://localhost:3000/.account/oidc/consent/?embedded=1'))

  assert.deepEqual(states.at(-1), { open: true, reason: 'opened', ready: false })
  assert.equal(actions.includes('show'), false)
  assert.equal(actions.includes('loadURL:http://localhost:3000/.account/oidc/consent/?embedded=1'), true)

  resolveLoad()
  await openPromise

  assert.deepEqual(states.at(-1), { open: true, reason: 'opened', ready: true })
  assert.equal(actions.includes('title:Cloud 登录'), true)
  assert.equal(actions.includes('installAuthControls'), true)
  assert.equal(actions.includes('installAuthEnhancer'), true)
  assert.equal(actions.includes('show'), true)
  assert.equal(actions.indexOf('show') > actions.findIndex((entry) => entry.startsWith('loadURL:')), true)
})

async function waitFor(predicate, attempts = 10) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) {
      return
    }

    await Promise.resolve()
  }
}
