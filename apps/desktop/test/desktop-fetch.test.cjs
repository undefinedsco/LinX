const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

function resetDesktopFetchModule() {
  const modulePath = resolveCompiledDesktopModule('lib/desktop-fetch.js')
  delete require.cache[require.resolve(modulePath)]
  return require(modulePath)
}

function installElectronStub(t, electron) {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return electron
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })
}

test('desktopFetch prefers Electron net.fetch in the desktop main process', async (t) => {
  let electronFetchCalled = false
  installElectronStub(t, {
    net: {
      fetch: async (input, init) => {
        electronFetchCalled = true
        assert.equal(String(input), 'https://id.undefineds.co/.well-known/openid-configuration')
        assert.equal(init?.method, 'GET')
        return { ok: true }
      },
    },
  })
  const originalFetch = global.fetch
  global.fetch = async () => {
    throw new Error('global fetch should not be used')
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const { desktopFetch } = resetDesktopFetchModule()
  const response = await desktopFetch('https://id.undefineds.co/.well-known/openid-configuration', {
    method: 'GET',
  })

  assert.equal(response.ok, true)
  assert.equal(electronFetchCalled, true)
})

test('desktopFetch falls back to global fetch when electron.net is unavailable', async (t) => {
  installElectronStub(t, { app: { isPackaged: false } })
  const originalFetch = global.fetch
  let globalFetchCalled = false
  global.fetch = async (input) => {
    globalFetchCalled = true
    assert.equal(String(input), 'http://localhost:5737/service/status')
    return { ok: true }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const { desktopFetch } = resetDesktopFetchModule()
  const response = await desktopFetch('http://localhost:5737/service/status')

  assert.equal(response.ok, true)
  assert.equal(globalFetchCalled, true)
})
