const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

test('resolveLinxLocalPaths uses LINX_LOCAL_HOME when provided', (t) => {
  const originalLoad = Module._load
  const previousLocalHome = process.env.LINX_LOCAL_HOME
  const modulePath = resolveCompiledDesktopModule('lib/local-home.js')

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => path.join(os.tmpdir(), 'ignored-electron-user-data'),
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
    if (previousLocalHome === undefined) {
      delete process.env.LINX_LOCAL_HOME
    } else {
      process.env.LINX_LOCAL_HOME = previousLocalHome
    }
  })

  process.env.LINX_LOCAL_HOME = '/tmp/linx-local-home'

  delete require.cache[modulePath]
  const { resolveLinxLocalPaths } = require(modulePath)
  const paths = resolveLinxLocalPaths()

  assert.equal(paths.home, '/tmp/linx-local-home')
  assert.equal(paths.electronUserDataDir, '/tmp/linx-local-home/electron')
  assert.equal(paths.envFile, '/tmp/linx-local-home/.env')
  assert.equal(paths.runtimeEnvFile, '/tmp/linx-local-home/xpod.runtime.env')
  assert.equal(paths.providersFile, '/tmp/linx-local-home/providers.json')
  assert.equal(paths.onboardingFile, '/tmp/linx-local-home/local-onboarding.json')
  assert.equal(paths.stateFile, '/tmp/linx-local-home/xpod-service.json')
  assert.equal(paths.logsDir, '/tmp/linx-local-home/logs')
  assert.equal(paths.podDir, '/tmp/linx-local-home/pod')
})

test('applyLinxLocalHomeToElectronUserData scopes Electron storage under LINX_LOCAL_HOME', (t) => {
  const originalLoad = Module._load
  const previousLocalHome = process.env.LINX_LOCAL_HOME
  const modulePath = resolveCompiledDesktopModule('lib/local-home.js')
  const calls = []

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          setPath: (name, value) => {
            calls.push({ name, value })
          },
          getPath: () => path.join(os.tmpdir(), 'ignored-electron-user-data'),
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
    if (previousLocalHome === undefined) {
      delete process.env.LINX_LOCAL_HOME
    } else {
      process.env.LINX_LOCAL_HOME = previousLocalHome
    }
    fs.rmSync('/tmp/linx-local-home-user-data', { recursive: true, force: true })
  })

  process.env.LINX_LOCAL_HOME = '/tmp/linx-local-home-user-data'

  delete require.cache[modulePath]
  const { applyLinxLocalHomeToElectronUserData } = require(modulePath)
  const userDataDir = applyLinxLocalHomeToElectronUserData()

  assert.equal(userDataDir, '/tmp/linx-local-home-user-data/electron')
  assert.deepEqual(calls, [
    { name: 'userData', value: '/tmp/linx-local-home-user-data/electron' },
  ])
  assert.equal(fs.existsSync('/tmp/linx-local-home-user-data/electron'), true)
})

test('ensureLinxLocalHome migrates legacy local artifacts into the unified local home', (t) => {
  const originalLoad = Module._load
  const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-legacy-'))
  const previousLocalHome = process.env.LINX_LOCAL_HOME
  const customLocalHome = path.join(legacyRoot, 'local-home')
  const modulePath = resolveCompiledDesktopModule('lib/local-home.js')

  fs.writeFileSync(path.join(legacyRoot, '.env'), 'CSS_PORT=5737\n', 'utf8')
  fs.writeFileSync(path.join(legacyRoot, 'providers.json'), '{"providers":[],"defaultId":"undefineds"}\n', 'utf8')
  fs.mkdirSync(path.join(legacyRoot, 'pod'), { recursive: true })
  fs.writeFileSync(path.join(legacyRoot, 'pod', 'identity.sqlite'), '', 'utf8')

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => legacyRoot,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
    if (previousLocalHome === undefined) {
      delete process.env.LINX_LOCAL_HOME
    } else {
      process.env.LINX_LOCAL_HOME = previousLocalHome
    }
    fs.rmSync(legacyRoot, { recursive: true, force: true })
  })

  process.env.LINX_LOCAL_HOME = customLocalHome

  delete require.cache[modulePath]
  const { ensureLinxLocalHome } = require(modulePath)
  const paths = ensureLinxLocalHome()

  assert.equal(paths.home, customLocalHome)
  assert.equal(fs.existsSync(paths.envFile), true)
  assert.equal(fs.existsSync(paths.providersFile), true)
  assert.equal(fs.existsSync(path.join(paths.podDir, 'identity.sqlite')), true)
  assert.equal(fs.existsSync(path.join(legacyRoot, '.env')), false)
  assert.equal(fs.existsSync(path.join(legacyRoot, 'providers.json')), false)
})
