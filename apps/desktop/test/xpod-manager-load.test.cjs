const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

test('XpodManager loads without requiring xpod runtime on module import', (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-')),
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-instance-'))
  const manager = new XpodManager(
    {},
    { getConfigPath: () => path.join(tmpDir, '.env') },
    { updateManagedStatus: () => {} },
    tmpDir,
  )

  assert.equal(typeof XpodManager, 'function')
  assert.ok(manager)
})

test('XpodManager adds workspace node_modules to child NODE_PATH', (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-')),
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-env-'))
  const manager = new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env'),
      getAll: () => ({ CSS_EDITION: 'local', XPOD_MODE: 'local' }),
    },
    { updateManagedStatus: () => {} },
    tmpDir,
  )

  const env = manager.buildProcessEnv(
    { kind: 'dev-source', rootDir: '/Users/example/xpod', entryPath: '/Users/example/xpod/src/main.ts' },
    { providerId: 'local', dataDir: tmpDir, port: 5737 },
    {
      providerId: 'local',
      dataDir: tmpDir,
      port: 5737,
      baseUrl: 'http://localhost:5737/',
      localUrl: 'http://localhost:5737/',
    },
  )

  assert.ok(env.NODE_PATH)
  assert.match(env.NODE_PATH, /node_modules/)
})

test('XpodManager managed env pins Cloud IdP URL for local managed SP mode', (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-')),
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-issuer-'))
  const manager = new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env'),
      getAll: () => ({
        CSS_EDITION: 'local',
        XPOD_MODE: 'local',
        oidcIssuer: 'https://id.undefineds.co',
        XPOD_CLOUD_API_ENDPOINT: 'https://api.undefineds.co',
      }),
    },
    { updateManagedStatus: () => {} },
    tmpDir,
  )

  const env = manager.buildProcessEnv(
    { kind: 'dev-source', rootDir: '/Users/example/xpod-cli', entryPath: '/Users/example/xpod-cli/src/main.ts' },
    { providerId: 'local', dataDir: tmpDir, port: 5737, startupMode: 'remote-ready' },
    {
      providerId: 'local',
      dataDir: tmpDir,
      port: 5737,
      baseUrl: 'https://node-abc123.undefineds.co/',
      localUrl: 'http://localhost:5737/',
    },
    {
      nodeId: 'abc123',
      nodeToken: 'node-token',
      serviceToken: 'service-token',
      provisionCode: 'provision-code',
      publicUrl: 'https://node-abc123.undefineds.co/',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=provision-code',
      cloudIdentityUrl: 'https://id.undefineds.co',
      cloudApiUrl: 'https://api.undefineds.co',
      registeredAt: Date.now(),
    },
  )

  assert.equal(env.oidcIssuer, 'https://id.undefineds.co')
  assert.equal(env[['OIDC', 'ISSUER'].join('_')], undefined)
  assert.equal(env.XPOD_CLOUD_API_ENDPOINT, 'https://api.undefineds.co')
})

test('XpodManager keeps oidcIssuer as the xpod external IdP env contract', (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-')),
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-css-issuer-'))
  const manager = new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env'),
      getAll: () => ({
        CSS_EDITION: 'local',
        XPOD_MODE: 'local',
        oidcIssuer: 'https://id.undefineds.co',
      }),
    },
    { updateManagedStatus: () => {} },
    tmpDir,
  )

  const env = manager.buildProcessEnv(
    { kind: 'dev-source', rootDir: '/Users/example/xpod-cli', entryPath: '/Users/example/xpod-cli/src/main.ts' },
    { providerId: 'local', dataDir: tmpDir, port: 5737, startupMode: 'remote-ready' },
    {
      providerId: 'local',
      dataDir: tmpDir,
      port: 5737,
      baseUrl: 'https://node-abc123.undefineds.co/',
      localUrl: 'http://localhost:5737/',
    },
  )

  assert.equal(env.oidcIssuer, 'https://id.undefineds.co')
  assert.equal(env[['OIDC', 'ISSUER'].join('_')], undefined)
})

test('XpodManager device-only env keeps local base URL without managed Cloud provisioning keys', (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-')),
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-device-only-'))
  const manager = new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env'),
      getAll: () => ({
        CSS_EDITION: 'local',
        XPOD_MODE: 'local',
        oidcIssuer: 'https://id.undefineds.co',
        XPOD_CLOUD_API_ENDPOINT: 'https://api.undefineds.co',
      }),
    },
    { updateManagedStatus: () => {} },
    tmpDir,
  )

  const env = manager.buildProcessEnv(
    { kind: 'dev-source', rootDir: '/Users/example/xpod-cli', entryPath: '/Users/example/xpod-cli/src/main.ts' },
    { providerId: 'local', dataDir: tmpDir, port: 5737, startupMode: 'device-only' },
    {
      providerId: 'local',
      dataDir: tmpDir,
      port: 5737,
      baseUrl: 'http://localhost:5737/',
      localUrl: 'http://localhost:5737/',
    },
  )

  assert.equal(env[['OIDC', 'ISSUER'].join('_')], undefined)
  assert.equal(env.oidcIssuer, undefined)
  assert.equal(env.XPOD_CLOUD_API_ENDPOINT, undefined)
  assert.equal(env.CSS_BASE_URL, 'http://localhost:5737/')
  assert.equal(env.XPOD_NODE_ID, undefined)
  assert.equal(env.XPOD_NODE_TOKEN, undefined)
  assert.equal(env.XPOD_SERVICE_TOKEN, undefined)
})

test('XpodManager device-only desired state keeps HTTP LAN CSS_BASE_URL as the canonical Local URL', (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-')),
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-lan-base-url-'))
  const manager = new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env'),
      getAll: () => ({
        CSS_EDITION: 'local',
        XPOD_MODE: 'local',
        CSS_BASE_URL: 'http://192.168.1.10:5737',
      }),
    },
    { updateManagedStatus: () => {} },
    tmpDir,
  )

  const state = manager.createDesiredState({
    providerId: 'local',
    dataDir: tmpDir,
    port: 5737,
    startupMode: 'device-only',
    domain: { type: 'none' },
  })
  const env = manager.buildProcessEnv(
    { kind: 'dev-source', rootDir: '/Users/example/xpod-cli', entryPath: '/Users/example/xpod-cli/src/main.ts' },
    { providerId: 'local', dataDir: tmpDir, port: 5737, startupMode: 'device-only' },
    state,
  )

  assert.equal(state.baseUrl, 'http://192.168.1.10:5737/')
  assert.equal(state.localUrl, 'http://localhost:5737/')
  assert.equal(env.CSS_BASE_URL, 'http://192.168.1.10:5737/')
  assert.equal(env.XPOD_CLOUD_API_ENDPOINT, undefined)
})

test('XpodManager device-only desired state ignores HTTPS CSS_BASE_URL unless remote-ready provisioning owns it', (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-')),
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-public-base-url-'))
  const manager = new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env'),
      getAll: () => ({
        CSS_EDITION: 'local',
        XPOD_MODE: 'local',
        CSS_BASE_URL: 'https://pod.example.com',
      }),
    },
    { updateManagedStatus: () => {} },
    tmpDir,
  )

  const state = manager.createDesiredState({
    providerId: 'local',
    dataDir: tmpDir,
    port: 5737,
    startupMode: 'device-only',
    domain: { type: 'none' },
  })

  assert.equal(state.baseUrl, 'http://localhost:5737/')
})

test('XpodManager removes inherited OIDC env unless runtime config explicitly sets oidcIssuer', (t) => {
  const originalLoad = Module._load
  const pollutionKey = ['OIDC', 'ISSUER'].join('_')
  const originalOidcIssuer = process.env[pollutionKey]
  const originalLowerOidcIssuer = process.env.oidcIssuer
  const legacyOidcKey = `CSS_${pollutionKey}`
  const legacyCssIdpKey = `CSS_${['IDP', 'URL'].join('_')}`
  const legacyIdpKey = `XPOD_${['IDP', 'URL'].join('_')}`
  const legacyShorthandKey = ['identity', 'ProviderUrl'].join('')
  const originalLegacyOidc = process.env[legacyOidcKey]
  const originalLegacyCssIdp = process.env[legacyCssIdpKey]
  const originalLegacyIdp = process.env[legacyIdpKey]
  const originalLegacyShorthand = process.env[legacyShorthandKey]

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-')),
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
    if (originalOidcIssuer === undefined) delete process.env[pollutionKey]
    else process.env[pollutionKey] = originalOidcIssuer
    if (originalLowerOidcIssuer === undefined) delete process.env.oidcIssuer
    else process.env.oidcIssuer = originalLowerOidcIssuer
    if (originalLegacyOidc === undefined) delete process.env[legacyOidcKey]
    else process.env[legacyOidcKey] = originalLegacyOidc
    if (originalLegacyCssIdp === undefined) delete process.env[legacyCssIdpKey]
    else process.env[legacyCssIdpKey] = originalLegacyCssIdp
    if (originalLegacyIdp === undefined) delete process.env[legacyIdpKey]
    else process.env[legacyIdpKey] = originalLegacyIdp
    if (originalLegacyShorthand === undefined) delete process.env[legacyShorthandKey]
    else process.env[legacyShorthandKey] = originalLegacyShorthand
  })

  process.env[pollutionKey] = 'https://inherited-id.undefineds.co'
  process.env.oidcIssuer = 'https://legacy.example.com'
  process.env[legacyOidcKey] = 'https://legacy-oidc.example.com'
  process.env[legacyCssIdpKey] = 'https://legacy-css-idp.example.com'
  process.env[legacyIdpKey] = 'https://legacy-idp.example.com'
  process.env[legacyShorthandKey] = 'https://legacy-shorthand.example.com'

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-inherited-issuer-'))
  const manager = new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env'),
      getAll: () => ({
        CSS_EDITION: 'local',
        XPOD_MODE: 'local',
      }),
    },
    { updateManagedStatus: () => {} },
    tmpDir,
  )

  const env = manager.buildProcessEnv(
    { kind: 'dev-source', rootDir: '/Users/example/xpod-cli', entryPath: '/Users/example/xpod-cli/src/main.ts' },
    { providerId: 'local', dataDir: tmpDir, port: 5737, startupMode: 'device-only' },
    {
      providerId: 'local',
      dataDir: tmpDir,
      port: 5737,
      baseUrl: 'http://localhost:5737/',
      localUrl: 'http://localhost:5737/',
    },
  )

  assert.equal(env[pollutionKey], undefined)
  assert.equal(env.oidcIssuer, undefined)
  assert.equal(env[legacyOidcKey], undefined)
  assert.equal(env[legacyCssIdpKey], undefined)
  assert.equal(env[legacyIdpKey], undefined)
  assert.equal(env[legacyShorthandKey], undefined)
})

test('XpodManager runtime env path points to the generated local runtime env file', (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-')),
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-runtime-env-'))
  const manager = new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env'),
      getAll: () => ({
        CSS_EDITION: 'local',
        XPOD_MODE: 'local',
      }),
    },
    { updateManagedStatus: () => {} },
    tmpDir,
  )

  const runtimeEnv = manager.buildServiceEnv(
    { providerId: 'local', dataDir: tmpDir, port: 5737, startupMode: 'device-only' },
    {
      providerId: 'local',
      dataDir: tmpDir,
      port: 5737,
      baseUrl: 'http://localhost:5737/',
      localUrl: 'http://localhost:5737/',
    },
  )
  const runtimeEnvPath = manager.writeRuntimeEnvFile(runtimeEnv)
  runtimeEnv.XPOD_ENV_PATH = runtimeEnvPath

  assert.equal(runtimeEnv.XPOD_ENV_PATH, path.join(tmpDir, 'xpod.runtime.env'))
  assert.equal(fs.existsSync(runtimeEnvPath), true)
})

test('XpodManager spawns detached xpod process with direct log fds', (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-')),
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-spawn-'))
  const manager = new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env'),
      getAll: () => ({ CSS_EDITION: 'local', XPOD_MODE: 'local' }),
    },
    { updateManagedStatus: () => {} },
    tmpDir,
  )

  const spawnOptions = manager.buildSpawnOptions(
    tmpDir,
    { NODE_ENV: 'production' },
    path.join(tmpDir, 'xpod.out.log'),
    path.join(tmpDir, 'xpod.err.log'),
  )

  assert.equal(spawnOptions.cwd, tmpDir)
  assert.equal(spawnOptions.env.NODE_ENV, 'production')
  assert.equal(spawnOptions.detached, true)
  assert.equal(spawnOptions.windowsHide, true)
  assert.deepEqual(spawnOptions.stdio[0], 'ignore')
  assert.equal(typeof spawnOptions.stdio[1], 'number')
  assert.equal(typeof spawnOptions.stdio[2], 'number')

  fs.closeSync(spawnOptions.stdio[1])
  fs.closeSync(spawnOptions.stdio[2])
})

test('XpodManager dev-source launch disables bun dotenv auto-loading', (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-')),
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-launchspec-'))
  const manager = new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env'),
      getAll: () => ({ CSS_EDITION: 'local', XPOD_MODE: 'local' }),
    },
    { updateManagedStatus: () => {} },
    tmpDir,
  )

  const spec = manager.buildLaunchSpec(
    { kind: 'dev-source', rootDir: '/Users/example/xpod-cli', entryPath: '/Users/example/xpod-cli/src/main.ts' },
    5737,
    '/tmp/linx-xpod.env',
  )

  assert.equal(spec.command, 'bun')
  assert.equal(spec.args[0], '--no-env-file')
  assert.equal(spec.args[1], '/Users/example/xpod-cli/src/main.ts')
  assert.equal(spec.args.includes('--host'), false)
})

test('XpodManager launch spec leaves bind host derivation to xpod BASE_URL semantics', (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-')),
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-manager-launchspec-no-host-'))
  const manager = new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env'),
      getAll: () => ({ CSS_EDITION: 'local', XPOD_MODE: 'local' }),
    },
    { updateManagedStatus: () => {} },
    tmpDir,
  )

  const spec = manager.buildLaunchSpec(
    { kind: 'dev-source', rootDir: '/Users/example/xpod-cli', entryPath: '/Users/example/xpod-cli/src/main.ts' },
    5737,
    '/tmp/linx-xpod.env',
  )

  assert.equal(spec.args.includes('--host'), false)
})
