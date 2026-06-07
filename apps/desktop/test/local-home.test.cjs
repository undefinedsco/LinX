const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

test('resolveLinxLocalPaths derives desktop paths from LINX_HOME when provided', (t) => {
  const originalLoad = Module._load
  const previousSolidHome = process.env.SOLID_HOME
  const previousLinxHome = process.env.LINX_HOME
  const linxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-home-'))
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
    if (previousSolidHome === undefined) {
      delete process.env.SOLID_HOME
    } else {
      process.env.SOLID_HOME = previousSolidHome
    }
    if (previousLinxHome === undefined) {
      delete process.env.LINX_HOME
    } else {
      process.env.LINX_HOME = previousLinxHome
    }
    fs.rmSync(linxHome, { recursive: true, force: true })
  })

  process.env.LINX_HOME = linxHome

  delete require.cache[modulePath]
  const { resolveLinxLocalPaths } = require(modulePath)
  const paths = resolveLinxLocalPaths()

  assert.equal(paths.home, path.join(linxHome, 'desktop'))
  assert.equal(paths.electronUserDataDir, path.join(linxHome, 'desktop', 'electron'))
  assert.equal(paths.envFile, path.join(linxHome, 'desktop', '.env'))
  assert.equal(paths.runtimeEnvFile, path.join(linxHome, 'desktop', 'xpod.runtime.env'))
  assert.equal(paths.providersFile, path.join(linxHome, 'desktop', 'providers.json'))
  assert.equal(paths.onboardingFile, path.join(linxHome, 'desktop', 'local-onboarding.json'))
  assert.equal(paths.stateFile, path.join(linxHome, 'desktop', 'xpod-service.json'))
  assert.equal(paths.logsDir, path.join(linxHome, 'desktop', 'logs'))
  assert.equal(paths.podDir, path.join(linxHome, 'desktop', 'pod'))
})

test('resolveLinxLocalPaths defaults under SOLID_HOME apps linx', (t) => {
  const originalLoad = Module._load
  const previousSolidHome = process.env.SOLID_HOME
  const previousLinxHome = process.env.LINX_HOME
  const solidHome = fs.mkdtempSync(path.join(os.tmpdir(), 'solid-home-'))
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
    if (previousSolidHome === undefined) {
      delete process.env.SOLID_HOME
    } else {
      process.env.SOLID_HOME = previousSolidHome
    }
    if (previousLinxHome === undefined) {
      delete process.env.LINX_HOME
    } else {
      process.env.LINX_HOME = previousLinxHome
    }
    fs.rmSync(solidHome, { recursive: true, force: true })
  })

  process.env.SOLID_HOME = solidHome
  delete process.env.LINX_HOME

  delete require.cache[modulePath]
  const { resolveLinxLocalPaths } = require(modulePath)
  const paths = resolveLinxLocalPaths()

  assert.equal(paths.home, path.join(solidHome, 'apps', 'linx', 'desktop'))
  assert.equal(paths.electronUserDataDir, path.join(solidHome, 'apps', 'linx', 'desktop', 'electron'))
})

test('applyLinxLocalHomeToElectronUserData scopes Electron storage under LINX_HOME', (t) => {
  const originalLoad = Module._load
  const previousSolidHome = process.env.SOLID_HOME
  const previousLinxHome = process.env.LINX_HOME
  const linxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-home-user-data-'))
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
    if (previousSolidHome === undefined) {
      delete process.env.SOLID_HOME
    } else {
      process.env.SOLID_HOME = previousSolidHome
    }
    if (previousLinxHome === undefined) {
      delete process.env.LINX_HOME
    } else {
      process.env.LINX_HOME = previousLinxHome
    }
    fs.rmSync(linxHome, { recursive: true, force: true })
  })

  process.env.LINX_HOME = linxHome

  delete require.cache[modulePath]
  const { applyLinxLocalHomeToElectronUserData } = require(modulePath)
  const userDataDir = applyLinxLocalHomeToElectronUserData()

  assert.equal(userDataDir, path.join(linxHome, 'desktop', 'electron'))
  assert.deepEqual(calls, [
    { name: 'userData', value: path.join(linxHome, 'desktop', 'electron') },
  ])
  assert.equal(fs.existsSync(path.join(linxHome, 'desktop', 'electron')), true)
})

test('ensureLinxLocalHome migrates legacy local artifacts into LINX_HOME desktop home', (t) => {
  const originalLoad = Module._load
  const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-legacy-'))
  const previousSolidHome = process.env.SOLID_HOME
  const previousLinxHome = process.env.LINX_HOME
  const linxHome = path.join(legacyRoot, 'linx-home')
  const expectedLocalHome = path.join(linxHome, 'desktop')
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
    if (previousSolidHome === undefined) {
      delete process.env.SOLID_HOME
    } else {
      process.env.SOLID_HOME = previousSolidHome
    }
    if (previousLinxHome === undefined) {
      delete process.env.LINX_HOME
    } else {
      process.env.LINX_HOME = previousLinxHome
    }
    fs.rmSync(legacyRoot, { recursive: true, force: true })
  })

  process.env.LINX_HOME = linxHome

  delete require.cache[modulePath]
  const { ensureLinxLocalHome } = require(modulePath)
  const paths = ensureLinxLocalHome()

  assert.equal(paths.home, expectedLocalHome)
  assert.equal(fs.existsSync(paths.envFile), true)
  assert.equal(fs.existsSync(paths.providersFile), true)
  assert.equal(fs.existsSync(path.join(paths.podDir, 'identity.sqlite')), true)
  assert.equal(fs.existsSync(path.join(legacyRoot, '.env')), false)
  assert.equal(fs.existsSync(path.join(legacyRoot, 'providers.json')), false)
})
