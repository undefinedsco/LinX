const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const legacyOidcKey = ['OIDC', 'ISSUER'].join('_')
const legacyCssIdpKey = `CSS_${['IDP', 'URL'].join('_')}`
const legacyXpodOidcKey = `XPOD_${['OIDC', 'ISSUER'].join('_')}`
const legacyIdentityProviderKey = ['identity', 'ProviderUrl'].join('')

function loadConfigManager(t) {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-config-manager-electron-')),
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  return require(resolveCompiledDesktopModule('lib/config-manager.js'))
}

test('ConfigManager drops legacy OIDC/IDP config keys when loading and saving', (t) => {
  const { ConfigManager } = loadConfigManager(t)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-config-manager-'))
  fs.writeFileSync(path.join(tmpDir, '.env'), [
    'CSS_EDITION=local',
    `${legacyOidcKey}=https://legacy-id.example`,
    `${legacyCssIdpKey}=https://legacy-idp.example`,
    `${legacyXpodOidcKey}=https://legacy-xpod.example`,
    `${legacyIdentityProviderKey}=https://legacy-shorthand.example`,
    'CLOUDFLARE_TUNNEL_TOKEN=cf-token',
    '',
  ].join('\n'), 'utf-8')

  const manager = new ConfigManager(tmpDir)
  const loaded = manager.getAll()
  assert.equal(loaded.CSS_EDITION, 'local')
  assert.equal(loaded.CLOUDFLARE_TUNNEL_TOKEN, 'cf-token')
  assert.equal(loaded[legacyOidcKey], undefined)
  assert.equal(loaded[legacyCssIdpKey], undefined)
  assert.equal(loaded[legacyXpodOidcKey], undefined)
  assert.equal(loaded[legacyIdentityProviderKey], undefined)

  manager.save()
  const saved = fs.readFileSync(path.join(tmpDir, '.env'), 'utf-8')
  assert.equal(saved.includes(legacyOidcKey), false)
  assert.equal(saved.includes(legacyCssIdpKey), false)
  assert.equal(saved.includes(legacyIdentityProviderKey), false)
})

test('ConfigManager update does not persist legacy OIDC/IDP config keys', (t) => {
  const { ConfigManager } = loadConfigManager(t)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-config-manager-'))
  const manager = new ConfigManager(tmpDir)

  manager.update({
    CSS_BASE_URL: 'https://node-0000.undefineds.co/',
    [legacyOidcKey]: 'https://legacy-id.example',
    [legacyCssIdpKey]: 'https://legacy-idp.example',
    oidcIssuer: 'https://id.undefineds.co',
  })

  const loaded = manager.getAll()
  assert.equal(loaded.CSS_BASE_URL, 'https://node-0000.undefineds.co/')
  assert.equal(loaded.oidcIssuer, 'https://id.undefineds.co')
  assert.equal(loaded[legacyOidcKey], undefined)
  assert.equal(loaded[legacyCssIdpKey], undefined)
})
