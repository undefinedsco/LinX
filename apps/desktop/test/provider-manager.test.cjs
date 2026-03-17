const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

test('ProviderManager defaults to the official id.undefineds.co issuer', async (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-desktop-electron-')),
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-provider-manager-'))
  const providerManagerPath = path.resolve(__dirname, '../dist/apps/desktop/src/lib/provider-manager.js')
  const { ProviderManager } = require(providerManagerPath)
  const manager = new ProviderManager(configDir)

  assert.equal(manager.getDefault()?.issuerUrl, 'https://id.undefineds.co')
})
