const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

function installElectronStub(t) {
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
}

function createManager(options = {}) {
  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-health-'))
  const config = options.config ?? {}
  const providerManager = options.providerManager ?? {}
  return new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env'),
      getAll: () => config,
    },
    {
      updateManagedStatus: () => {},
      getManagedPods: () => [],
      getDefault: () => undefined,
      get: () => undefined,
      ...providerManager,
    },
    tmpDir,
  )
}

test('XpodManager treats service as ready only when css and api are running', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch

  global.fetch = async (url) => {
    assert.equal(String(url), 'http://localhost:3000/service/status')
    return {
      ok: true,
      json: async () => [
        { name: 'css', status: 'running' },
        { name: 'api', status: 'running' },
      ],
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const ready = await manager.isServiceReady('http://localhost:3000/')
  assert.equal(ready, true)
})

test('XpodManager treats service as not ready when api is still starting', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch

  global.fetch = async () => ({
    ok: true,
    json: async () => [
      { name: 'css', status: 'running' },
      { name: 'api', status: 'starting' },
    ],
  })

  t.after(() => {
    global.fetch = originalFetch
  })

  const ready = await manager.isServiceReady('http://localhost:3000/')
  assert.equal(ready, false)
})

test('XpodManager detects an externally started xpod without local state', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager({
    config: {
      CSS_PORT: '5737',
      CSS_BASE_URL: 'http://localhost:5737/',
    },
    providerManager: {
      getManagedPods: () => [
        {
          id: 'local',
          issuerUrl: 'http://localhost:5737',
          managed: {
            status: 'stopped',
            dataDir: '/tmp/local-pod',
            port: 5737,
            domain: { type: 'none' },
          },
        },
      ],
    },
  })
  const originalFetch = global.fetch

  global.fetch = async (url) => {
    assert.equal(String(url), 'http://localhost:5737/service/status')
    return {
      ok: true,
      json: async () => [
        { name: 'css', status: 'running' },
        { name: 'api', status: 'running' },
      ],
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const status = await manager.getStatus()
  assert.equal(status.running, true)
  assert.equal(status.status, 'running')
  assert.equal(status.providerId, 'local')
  assert.equal(status.localUrl, 'http://localhost:5737/')
  assert.equal(status.baseUrl, 'http://localhost:5737/')
})

test('XpodManager healthCheck returns true for an externally started xpod without local state', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager({
    config: {
      CSS_PORT: '5737',
      CSS_BASE_URL: 'http://localhost:5737/',
    },
    providerManager: {
      getManagedPods: () => [
        {
          id: 'local',
          issuerUrl: 'http://localhost:5737',
          managed: {
            status: 'stopped',
            dataDir: '/tmp/local-pod',
            port: 5737,
            domain: { type: 'none' },
          },
        },
      ],
    },
  })
  const originalFetch = global.fetch

  global.fetch = async () => ({
    ok: true,
    json: async () => [
      { name: 'css', status: 'running' },
      { name: 'api', status: 'running' },
    ],
  })

  t.after(() => {
    global.fetch = originalFetch
  })

  const healthy = await manager.healthCheck()
  assert.equal(healthy, true)
})

test('XpodManager trusts its active child process state when process probing is unavailable', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalKill = process.kill

  process.kill = () => {
    const error = new Error('probe unavailable')
    error.code = 'ESRCH'
    throw error
  }

  t.after(() => {
    process.kill = originalKill
  })

  manager.childProcess = {
    pid: 98765,
    exitCode: null,
    signalCode: null,
    killed: false,
  }

  assert.equal(manager.isProcessAlive(98765), true)

  manager.childProcess.exitCode = 1
  assert.equal(manager.isProcessAlive(98765), false)
})

test('XpodManager treats EPERM process probes as an alive external process', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalKill = process.kill

  process.kill = () => {
    const error = new Error('operation not permitted')
    error.code = 'EPERM'
    throw error
  }

  t.after(() => {
    process.kill = originalKill
  })

  assert.equal(manager.isProcessAlive(123456), true)
})

test('XpodManager does not dispose the current child while status refresh runs during startup', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager({
    providerManager: {
      updateManagedStatus: () => {},
    },
  })
  const originalFetch = global.fetch
  const statePath = path.join(path.dirname(manager.getLogPaths().directory), 'xpod-service.json')

  fs.writeFileSync(statePath, JSON.stringify({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    baseUrl: 'https://node-0000.undefineds.co/',
    localUrl: 'http://localhost:5737/',
    startedAt: Date.now(),
    pid: 246813,
    launchKind: 'managed-bun-package',
    runtimeId: 'managed-bun-package|current-start',
  }), 'utf8')

  manager.childProcess = {
    pid: 246813,
    exitCode: null,
    signalCode: null,
    killed: false,
  }
  manager.resolveComparableLaunchTarget = () => ({
    kind: 'package-bin',
    rootDir: '/different/xpod',
    entryPath: '/different/xpod/bin/xpod.js',
  })

  let killedPid = null
  manager.killProcess = async (pid) => {
    killedPid = pid
  }
  global.fetch = async () => ({
    ok: true,
    json: async () => [
      { name: 'css', status: 'running' },
      { name: 'api', status: 'starting' },
    ],
  })

  t.after(() => {
    global.fetch = originalFetch
  })

  const status = await manager.getStatus()

  assert.equal(status.status, 'starting')
  assert.equal(status.pid, 246813)
  assert.equal(killedPid, null)
  assert.equal(fs.existsSync(statePath), true)
})

test('XpodManager stops a stale managed runtime when dev now prefers sibling xpod source', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager({
    config: {
      CSS_PORT: '3000',
      CSS_BASE_URL: 'http://localhost:3000/',
    },
    providerManager: {
      getManagedPods: () => [],
      updateManagedStatus: () => {},
    },
  })

  const statePath = path.join(path.dirname(manager.getLogPaths().directory), 'xpod-service.json')
  fs.writeFileSync(statePath, JSON.stringify({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 3000,
    baseUrl: 'http://localhost:3000/',
    localUrl: 'http://localhost:3000/',
    startedAt: Date.now(),
    pid: 424242,
    launchKind: 'package-bin',
  }), 'utf8')

  let killedPid = null
  manager.resolveComparableLaunchTarget = () => ({
    kind: 'dev-source',
    rootDir: '/Users/ganlu/develop/xpod-cli',
    entryPath: '/Users/ganlu/develop/xpod-cli/src/main.ts',
  })
  manager.isProcessAlive = () => true
  manager.killProcess = async (pid) => {
    killedPid = pid
  }
  manager.waitForShutdown = async () => {}

  const status = await manager.getStatus()

  assert.equal(killedPid, 424242)
  assert.equal(status.running, false)
  assert.equal(status.status, 'stopped')
  assert.equal(fs.existsSync(statePath), false)
})

test('XpodManager stops an old dev-source runtime from a different xpod checkout', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager({
    config: {
      CSS_PORT: '5737',
      CSS_BASE_URL: 'https://node-0000.undefineds.co/',
    },
    providerManager: {
      getManagedPods: () => [],
      updateManagedStatus: () => {},
    },
  })

  const statePath = path.join(path.dirname(manager.getLogPaths().directory), 'xpod-service.json')
  fs.writeFileSync(statePath, JSON.stringify({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    baseUrl: 'https://node-0000.undefineds.co/',
    localUrl: 'http://localhost:5737/',
    startedAt: Date.now(),
    pid: 40670,
    launchKind: 'dev-source',
    runtimeId: 'dev-source|/Users/ganlu/develop/xpod-cli|/Users/ganlu/develop/xpod-cli/src/main.ts|',
  }), 'utf8')

  let killedPid = null
  manager.resolveComparableLaunchTarget = () => ({
    kind: 'dev-source',
    rootDir: '/Users/ganlu/develop/xpod',
    entryPath: '/Users/ganlu/develop/xpod/src/main.ts',
  })
  manager.isProcessAlive = () => true
  manager.killProcess = async (pid) => {
    killedPid = pid
  }
  manager.waitForShutdown = async () => {}

  const status = await manager.getStatus()

  assert.equal(killedPid, 40670)
  assert.equal(status.running, false)
  assert.equal(status.status, 'stopped')
  assert.equal(fs.existsSync(statePath), false)
})

test('XpodManager restarts dev-source runtime when xpod auth assets changed in place', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-source-'))
  const sourceRoot = path.join(tmpRoot, 'xpod')
  const authHtml = path.join(sourceRoot, 'static/app/auth.html')
  const mainTs = path.join(sourceRoot, 'src/main.ts')
  const handlerTs = path.join(sourceRoot, 'src/identity/ReactAppViewHandler.ts')
  const localConfig = path.join(sourceRoot, 'config/local.json')
  const mainConfig = path.join(sourceRoot, 'config/main.json')
  const baseConfig = path.join(sourceRoot, 'config/xpod.base.json')
  const packageJson = path.join(sourceRoot, 'package.json')
  fs.mkdirSync(path.dirname(authHtml), { recursive: true })
  fs.mkdirSync(path.dirname(handlerTs), { recursive: true })
  fs.mkdirSync(path.dirname(localConfig), { recursive: true })
  fs.writeFileSync(mainTs, 'console.log("xpod")\n', 'utf8')
  fs.writeFileSync(handlerTs, 'export {}\n', 'utf8')
  fs.writeFileSync(localConfig, '{}\n', 'utf8')
  fs.writeFileSync(mainConfig, '{}\n', 'utf8')
  fs.writeFileSync(baseConfig, '{}\n', 'utf8')
  fs.writeFileSync(packageJson, '{"name":"@undefineds.co/xpod","version":"0.0.0"}\n', 'utf8')
  fs.writeFileSync(authHtml, '<script src="/app/assets/main.js"></script>\n', 'utf8')

  const manager = createManager({
    config: {
      CSS_PORT: '5737',
      CSS_BASE_URL: 'http://localhost:5737/',
    },
    providerManager: {
      getManagedPods: () => [],
      updateManagedStatus: () => {},
    },
  })
  const target = {
    kind: 'dev-source',
    rootDir: sourceRoot,
    entryPath: mainTs,
  }
  const statePath = path.join(path.dirname(manager.getLogPaths().directory), 'xpod-service.json')
  fs.writeFileSync(statePath, JSON.stringify({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    baseUrl: 'http://localhost:5737/',
    localUrl: 'http://localhost:5737/',
    startedAt: Date.now(),
    pid: 4096,
    launchKind: 'dev-source',
    runtimeId: manager.buildRuntimeId(target),
  }), 'utf8')

  fs.writeFileSync(authHtml, '<script src="/app/assets/main.js?v={{ASSET_VERSION}}"></script>\n', 'utf8')

  let killedPid = null
  manager.resolveComparableLaunchTarget = () => target
  manager.isProcessAlive = () => true
  manager.killProcess = async (pid) => {
    killedPid = pid
  }
  manager.waitForShutdown = async () => {}

  const status = await manager.getStatus()

  assert.equal(killedPid, 4096)
  assert.equal(status.running, false)
  assert.equal(status.status, 'stopped')
  assert.equal(fs.existsSync(statePath), false)
})

test('XpodManager does not blindly scan fallback localhost ports without a bound provider', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager({
    config: {
      CSS_PORT: '5737',
      CSS_BASE_URL: 'http://localhost:5737/',
    },
  })
  const originalFetch = global.fetch
  let called = false

  global.fetch = async () => {
    called = true
    return {
      ok: true,
      json: async () => [
        { name: 'css', status: 'running' },
        { name: 'api', status: 'running' },
      ],
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const status = await manager.getStatus()
  assert.equal(status.running, false)
  assert.equal(status.status, 'stopped')
  assert.equal(called, false)
})

test('XpodManager provisions a user-provided public URL for Local user-managed canonical domain startup', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch
  const calls = []

  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options.body ?? '{}')),
    })

    return {
      ok: true,
      json: async () => ({
        nodeId: 'abc123',
        nodeToken: `node-token-${calls.length}`,
        serviceToken: 'service-token-1',
        provisionCode: `pc-${calls.length}`,
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const registration = await manager.ensureManagedCloudRegistration({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    domain: { type: 'custom', value: 'pod.example.com' },
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    url: 'https://api.undefineds.co/provision/nodes',
    body: {
      publicUrl: 'https://pod.example.com/',
      localPort: 5737,
      domainMode: 'self-managed',
    },
  })
  assert.equal(registration.publicUrl, 'https://pod.example.com/')
  assert.equal(registration.provisionCode, 'pc-1')
  assert.equal(registration.provisionUrl, 'https://id.undefineds.co/.account/?provisionCode=pc-1')
  assert.equal(registration.spDomain, undefined)
})

test('XpodManager reports a clear error when managed Cloud registration times out', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch

  global.fetch = async (_url, options = {}) => {
    return new Promise((_resolve, reject) => {
      options.signal?.addEventListener?.('abort', () => {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        reject(error)
      })
    })
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  await assert.rejects(
    () => manager.ensureManagedCloudRegistration({
      providerId: 'local',
      dataDir: '/tmp/local-pod',
      port: 5737,
      spaceKind: 'local',
      domain: { type: 'custom', value: 'pod.example.com' },
    }),
    /连接登录服务超时。请检查网络后重试。/,
  )
})

test('XpodManager forwards configured tunnel token on self-managed registration', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch
  const calls = []

  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options.body ?? '{}')),
    })

    return {
      ok: true,
      json: async () => ({
        nodeId: 'abc123',
        nodeToken: `node-token-${calls.length}`,
        serviceToken: 'service-token-1',
        provisionCode: `pc-${calls.length}`,
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  await manager.ensureManagedCloudRegistration({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    domain: { type: 'custom', value: 'pod.example.com' },
    tunnelToken: 'cf-token-local',
  })

  assert.equal(calls[0].body.tunnelToken, 'cf-token-local')
  assert.equal(calls[0].body.tunnelMode, 'client')
  assert.equal(calls[0].body.domainMode, 'self-managed')
  assert.equal(calls.length, 1)
})

test('XpodManager marks configured custom domains as self-managed provisioning', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch
  const calls = []

  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options.body ?? '{}')),
    })

    return {
      ok: true,
      json: async () => ({
        nodeId: 'abc123',
        nodeToken: 'node-token-1',
        serviceToken: 'service-token-1',
        provisionCode: 'pc-1',
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const registration = await manager.ensureManagedCloudRegistration({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    domain: { type: 'custom', value: 'pod.example.com' },
    tunnelToken: 'cf-token-local',
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    url: 'https://api.undefineds.co/provision/nodes',
    body: {
      publicUrl: 'https://pod.example.com/',
      localPort: 5737,
      tunnelToken: 'cf-token-local',
      tunnelMode: 'client',
      domainMode: 'self-managed',
    },
  })
  assert.equal(registration.publicUrl, 'https://pod.example.com/')
  assert.equal(registration.spDomain, undefined)
  assert.equal(registration.tunnelToken, 'cf-token-local')
})

test('XpodManager asks Cloud to allocate a managed canonical URL when Local has no user domain', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch
  const calls = []

  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options.body ?? '{}')),
    })

    return {
      ok: true,
      json: async () => ({
        nodeId: 'node-0000',
        nodeToken: 'node-token-1',
        serviceToken: 'service-token-1',
        provisionCode: 'pc-1',
        publicUrl: 'https://node-0000.undefineds.co/',
        spDomain: 'node-0000.undefineds.co',
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const registration = await manager.ensureManagedCloudRegistration({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    domain: { type: 'none' },
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    url: 'https://api.undefineds.co/provision/nodes',
    body: {
      localPort: 5737,
      domainMode: 'managed',
    },
  })
  assert.equal(registration.publicUrl, 'https://node-0000.undefineds.co/')
  assert.equal(registration.spDomain, 'node-0000.undefineds.co')
  assert.equal(registration.provisionCode, 'pc-1')
})

test('XpodManager retries official managed Local registration with the preallocated test publicUrl for older Cloud APIs', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch
  const calls = []

  global.fetch = async (url, options = {}) => {
    const body = JSON.parse(String(options.body ?? '{}'))
    calls.push({
      url: String(url),
      body,
    })

    if (calls.length === 1) {
      return {
        ok: false,
        text: async () => '{"error":"publicUrl is required"}',
      }
    }

    return {
      ok: true,
      json: async () => ({
        nodeId: body.nodeId ?? 'node-0000',
        nodeToken: 'node-token-1',
        serviceToken: 'service-token-1',
        provisionCode: 'pc-1',
        publicUrl: body.publicUrl,
        spDomain: body.spDomain,
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const registration = await manager.ensureManagedCloudRegistration({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    domain: { type: 'none' },
  })

  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0], {
    url: 'https://api.undefineds.co/provision/nodes',
    body: {
      localPort: 5737,
      domainMode: 'managed',
    },
  })
  assert.deepEqual(calls[1], {
    url: 'https://api.undefineds.co/provision/nodes',
    body: {
      domainMode: 'self-managed',
      spDomain: 'node-0000.undefineds.co',
      publicUrl: 'https://node-0000.undefineds.co/',
      localPort: 5737,
    },
  })
  assert.equal(registration.publicUrl, 'https://node-0000.undefineds.co/')
  assert.equal(registration.spDomain, 'node-0000.undefineds.co')
  assert.equal(registration.provisionCode, 'pc-1')
})

test('XpodManager does not send cached managed domain as publicUrl during Cloud-managed allocation', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch
  const calls = []

  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options.body ?? '{}')),
    })

    return {
      ok: true,
      json: async () => ({
        nodeId: '868c9f63-6b0e-4255-8f7f-f2e347908ba4',
        nodeToken: 'node-token-1',
        serviceToken: 'service-token-1',
        provisionCode: 'pc-1',
        publicUrl: 'https://node-abcd1234ef56.undefineds.co/',
        spDomain: 'node-abcd1234ef56.undefineds.co',
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const registration = await manager.ensureManagedCloudRegistration({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    domain: { type: 'managed', value: 'node-0000.undefineds.co' },
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    url: 'https://api.undefineds.co/provision/nodes',
    body: {
      localPort: 5737,
      domainMode: 'managed',
      spDomain: 'node-0000.undefineds.co',
    },
  })
  assert.equal(registration.publicUrl, 'https://node-abcd1234ef56.undefineds.co/')
  assert.equal(registration.spDomain, 'node-abcd1234ef56.undefineds.co')
})

test('XpodManager requests a configured Cloud-managed spDomain without treating it as user publicUrl', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch
  const calls = []

  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options.body ?? '{}')),
    })

    return {
      ok: true,
      json: async () => ({
        nodeId: 'node-0000',
        nodeToken: 'node-token-1',
        serviceToken: 'service-token-1',
        provisionCode: 'pc-node-0000',
        publicUrl: 'https://node-0000.undefineds.co/',
        spDomain: 'node-0000.undefineds.co',
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const registration = await manager.ensureManagedCloudRegistration({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    domain: { type: 'managed', value: 'https://node-0000.undefineds.co/' },
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    url: 'https://api.undefineds.co/provision/nodes',
    body: {
      spDomain: 'node-0000.undefineds.co',
      domainMode: 'managed',
      localPort: 5737,
    },
  })
  assert.equal(registration.publicUrl, 'https://node-0000.undefineds.co/')
  assert.equal(registration.spDomain, 'node-0000.undefineds.co')
})

test('XpodManager treats Cloud managed spDomain as the canonical Local storage URL', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch
  const calls = []

  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options.body ?? '{}')),
    })

    return {
      ok: true,
      json: async () => ({
        nodeId: 'node-abcd1234ef56',
        nodeToken: 'node-token-1',
        serviceToken: 'service-token-1',
        provisionCode: 'pc-1',
        publicUrl: 'https://node-0000.undefineds.co/',
        spDomain: 'node-abcd1234ef56.undefineds.co',
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const registration = await manager.ensureManagedCloudRegistration({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    domain: { type: 'none' },
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].body.domainMode, 'managed')
  assert.equal(registration.publicUrl, 'https://node-abcd1234ef56.undefineds.co/')
  assert.equal(registration.spDomain, 'node-abcd1234ef56.undefineds.co')
})

test('XpodManager keeps an existing canonical URL with managed domain strategy when re-registering Local', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch
  const calls = []

  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options.body ?? '{}')),
    })

    return {
      ok: true,
      json: async () => ({
        nodeId: 'node-0000',
        nodeToken: 'node-token-1',
        serviceToken: 'service-token-1',
        provisionCode: 'pc-2',
        publicUrl: 'https://node-0000.undefineds.co/',
        spDomain: 'node-0000.undefineds.co',
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const registration = await manager.ensureManagedCloudRegistration(
    {
      providerId: 'local',
      dataDir: '/tmp/local-pod',
      port: 5737,
      spaceKind: 'local',
      domain: { type: 'none' },
      tunnelToken: 'cf-token-local',
    },
    {
      nodeId: 'node-0000',
      nodeToken: 'node-token-1',
      serviceToken: 'service-token-1',
      provisionCode: '',
      publicUrl: 'https://node-0000.undefineds.co/',
      spDomain: 'node-0000.undefineds.co',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=old',
      cloudIdentityUrl: 'https://id.undefineds.co',
      cloudApiUrl: 'https://api.undefineds.co',
      registeredAt: Date.now(),
    },
  )

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    url: 'https://api.undefineds.co/provision/nodes',
    body: {
      nodeId: 'node-0000',
      nodeToken: 'node-token-1',
      serviceToken: 'service-token-1',
      spDomain: 'node-0000.undefineds.co',
      tunnelToken: 'cf-token-local',
      domainMode: 'managed',
      tunnelMode: 'client',
      localPort: 5737,
    },
  })
  assert.equal(registration.publicUrl, 'https://node-0000.undefineds.co/')
  assert.equal(registration.spDomain, 'node-0000.undefineds.co')
})

test('XpodManager refreshes a cached managed domain by nodeId instead of treating it as user input', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch
  const calls = []

  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options.body ?? '{}')),
    })

    return {
      ok: true,
      json: async () => ({
        nodeId: 'node-0000',
        nodeToken: 'node-token-1',
        serviceToken: 'service-token-1',
        provisionCode: 'pc-fresh',
        publicUrl: 'https://node-0000.undefineds.co/',
        spDomain: 'node-0000.undefineds.co',
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const registration = await manager.ensureManagedCloudRegistration(
    {
      providerId: 'local',
      dataDir: '/tmp/local-pod',
      port: 5737,
      spaceKind: 'local',
      domain: { type: 'managed', value: 'node-0000.undefineds.co' },
    },
    {
      nodeId: 'node-0000',
      nodeToken: 'node-token-1',
      serviceToken: 'service-token-1',
      provisionCode: '',
      publicUrl: 'https://node-0000.undefineds.co/',
      spDomain: 'node-0000.undefineds.co',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=old',
      cloudIdentityUrl: 'https://id.undefineds.co',
      cloudApiUrl: 'https://api.undefineds.co',
      registeredAt: Date.now(),
    },
  )

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    url: 'https://api.undefineds.co/provision/nodes',
    body: {
      nodeId: 'node-0000',
      nodeToken: 'node-token-1',
      serviceToken: 'service-token-1',
      spDomain: 'node-0000.undefineds.co',
      localPort: 5737,
      domainMode: 'managed',
    },
  })
  assert.equal(registration.publicUrl, 'https://node-0000.undefineds.co/')
  assert.equal(registration.provisionCode, 'pc-fresh')
})

test('XpodManager refreshes expired managed provision codes without changing canonical Local URL', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch
  const calls = []
  const expiredPayload = Buffer
    .from(JSON.stringify({
      spUrl: 'https://node-0000.undefineds.co/',
      serviceToken: 'old-service-token',
      exp: Math.floor(Date.now() / 1000) - 60,
    }))
    .toString('base64url')

  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options.body ?? '{}')),
    })

    return {
      ok: true,
      json: async () => ({
        nodeId: 'node-0000',
        nodeToken: 'node-token-2',
        serviceToken: 'service-token-2',
        provisionCode: 'pc-fresh',
        publicUrl: 'https://node-0000.undefineds.co/',
        spDomain: 'node-0000.undefineds.co',
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const registration = await manager.ensureManagedCloudRegistration(
    {
      providerId: 'local',
      dataDir: '/tmp/local-pod',
      port: 5737,
      spaceKind: 'local',
      domain: { type: 'none' },
    },
    {
      nodeId: 'node-0000',
      nodeToken: 'node-token-1',
      serviceToken: 'service-token-1',
      provisionCode: `${expiredPayload}.old-signature`,
      publicUrl: 'https://node-0000.undefineds.co/',
      spDomain: 'node-0000.undefineds.co',
      provisionUrl: `https://id.undefineds.co/.account/?provisionCode=${expiredPayload}.old-signature`,
      cloudIdentityUrl: 'https://id.undefineds.co',
      cloudApiUrl: 'https://api.undefineds.co',
      registeredAt: Date.now(),
    },
  )

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    url: 'https://api.undefineds.co/provision/nodes',
    body: {
      nodeId: 'node-0000',
      nodeToken: 'node-token-1',
      serviceToken: 'service-token-1',
      spDomain: 'node-0000.undefineds.co',
      domainMode: 'managed',
      localPort: 5737,
    },
  })
  assert.equal(registration.publicUrl, 'https://node-0000.undefineds.co/')
  assert.equal(registration.spDomain, 'node-0000.undefineds.co')
  assert.equal(registration.provisionCode, 'pc-fresh')
})

test('XpodManager reuses an existing Local canonical URL even when older state has no spDomain', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch
  const calls = []

  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options.body ?? '{}')),
    })

    return {
      ok: true,
      json: async () => ({
        nodeId: 'legacy-node',
        nodeToken: 'legacy-node-token',
        serviceToken: 'legacy-service-token',
        provisionCode: 'pc-new',
        publicUrl: 'https://legacy-node.undefineds.co/',
        spDomain: 'legacy-node.undefineds.co',
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const registration = await manager.ensureManagedCloudRegistration(
    {
      providerId: 'local',
      dataDir: '/tmp/local-pod',
      port: 5737,
      spaceKind: 'local',
      domain: { type: 'none' },
    },
    {
      nodeId: 'legacy-node',
      nodeToken: 'legacy-node-token',
      serviceToken: 'legacy-service-token',
      provisionCode: 'legacy-pc',
      publicUrl: 'https://pod.example.com/',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=legacy-pc',
      cloudIdentityUrl: 'https://id.undefineds.co',
      cloudApiUrl: 'https://api.undefineds.co',
      registeredAt: Date.now(),
    },
  )

  assert.equal(calls.length, 0)
  assert.equal(registration.publicUrl, 'https://pod.example.com/')
  assert.equal(registration.spDomain, undefined)
  assert.equal(registration.provisionCode, 'legacy-pc')
})

test('XpodManager start reuses a healthy matching Local service before resolving runtime', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager({
    providerManager: {
      updateManagedStatus: () => {},
    },
  })
  const statePath = path.join(path.dirname(manager.getLogPaths().directory), 'xpod-service.json')
  fs.writeFileSync(statePath, JSON.stringify({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    baseUrl: 'https://node-0000.undefineds.co/',
    localUrl: 'http://localhost:5737/',
    startedAt: Date.now(),
    pid: 246813,
    launchKind: 'managed-bun-package',
    runtimeId: 'managed-bun-package|old-runtime',
    provisioning: {
      nodeId: 'node-0000',
      nodeToken: 'node-token-1',
      serviceToken: 'service-token-1',
      provisionCode: 'legacy-pc',
      publicUrl: 'https://node-0000.undefineds.co/',
      spDomain: 'node-0000.undefineds.co',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=legacy-pc',
      cloudIdentityUrl: 'https://id.undefineds.co',
      cloudApiUrl: 'https://api.undefineds.co',
      registeredAt: 1760000000000,
    },
  }), 'utf8')

  const originalFetch = global.fetch
  global.fetch = async (url) => {
    assert.equal(String(url), 'http://localhost:5737/service/status')
    return {
      ok: true,
      json: async () => [
        { name: 'css', status: 'running' },
        { name: 'api', status: 'running' },
      ],
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  manager.resolvePreferredLaunchTarget = () => {
    throw new Error('healthy matching Local service should not prepare runtime')
  }
  manager.registerProvisionedNode = () => {
    throw new Error('healthy matching Local service should not call Cloud provisioning')
  }

  const progress = []
  await manager.start({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    domain: { type: 'managed', value: 'node-0000.undefineds.co' },
  }, (event) => {
    progress.push(event)
  })

  assert.deepEqual(progress, [{
    phase: 'ready',
    label: '本地空间已运行',
    detail: 'http://localhost:5737/',
  }])
})

test('XpodManager Standalone startup skips managed Cloud registration', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch

  global.fetch = async () => {
    throw new Error('Standalone startup should not call Cloud provisioning')
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  manager.readState = () => null
  manager.resolvePreferredLaunchTarget = () => ({
    kind: 'dev-source',
    rootDir: '/Users/example/xpod-cli',
    entryPath: '/Users/example/xpod-cli/src/main.ts',
  })
  manager.ensureEnvFileExists = () => {}
  manager.buildLaunchSpec = () => ({
    command: process.execPath,
    args: ['-e', ''],
    cwd: process.cwd(),
  })
  manager.buildSpawnOptions = () => ({
    cwd: process.cwd(),
    env: {},
    detached: true,
    windowsHide: true,
    stdio: ['ignore', fs.openSync('/tmp/linx-standalone.out', 'a'), fs.openSync('/tmp/linx-standalone.err', 'a')],
  })
  manager.attachProcessHandlers = () => {}
  manager.writeState = () => {}
  manager.waitForReady = async () => {}
  manager.providerManager.updateManagedStatus = () => {}

  const originalSpawn = require('node:child_process').spawn
  require('node:child_process').spawn = () => ({
    pid: 12345,
    unref() {},
  })

  t.after(() => {
    require('node:child_process').spawn = originalSpawn
    try { fs.unlinkSync('/tmp/linx-standalone.out') } catch {}
    try { fs.unlinkSync('/tmp/linx-standalone.err') } catch {}
  })

  await manager.start({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'standalone',
    domain: { type: 'none' },
  })
})

test('XpodManager treats managed canonical domains as Local storage space for startup and resume', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch
  const calls = []

  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options.body ?? '{}')),
    })

    return {
      ok: true,
      json: async () => ({
        nodeId: 'node-0000',
        nodeToken: 'node-token-1',
        serviceToken: 'service-token-1',
        provisionCode: 'pc-1',
        publicUrl: 'https://node-0000.undefineds.co/',
        spDomain: 'node-0000.undefineds.co',
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  manager.readState = () => null
  manager.resolvePreferredLaunchTarget = () => ({
    kind: 'dev-source',
    rootDir: '/Users/example/xpod-cli',
    entryPath: '/Users/example/xpod-cli/src/main.ts',
  })
  manager.ensureEnvFileExists = () => {}
  manager.buildLaunchSpec = () => ({
    command: process.execPath,
    args: ['-e', ''],
    cwd: process.cwd(),
  })
  manager.buildSpawnOptions = () => ({
    cwd: process.cwd(),
    env: {},
    detached: true,
    windowsHide: true,
    stdio: ['ignore', fs.openSync('/tmp/linx-managed.out', 'a'), fs.openSync('/tmp/linx-managed.err', 'a')],
  })
  manager.attachProcessHandlers = () => {}
  manager.writeState = () => {}
  manager.waitForReady = async () => {}
  manager.providerManager.updateManagedStatus = () => {}

  const originalSpawn = require('node:child_process').spawn
  require('node:child_process').spawn = () => ({
    pid: 67890,
    unref() {},
  })

  const managedProvider = {
    id: 'local',
    issuerUrl: 'http://localhost:5737',
    managed: {
      status: 'stopped',
      dataDir: '/tmp/local-pod',
      port: 5737,
      spaceKind: 'local',
      domain: { type: 'managed', value: 'node-0000.undefineds.co' },
    },
  }

  manager.providerManager.getManagedPods = () => [managedProvider]
  manager.providerManager.get = () => managedProvider
  manager.providerManager.getDefault = () => managedProvider

  t.after(() => {
    require('node:child_process').spawn = originalSpawn
    try { fs.unlinkSync('/tmp/linx-managed.out') } catch {}
    try { fs.unlinkSync('/tmp/linx-managed.err') } catch {}
  })

  await manager.start({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    domain: { type: 'managed', value: 'node-0000.undefineds.co' },
  })

  assert.equal(calls[0].body.domainMode, 'managed')
  assert.equal(calls[0].body.publicUrl, undefined)

  const resumed = await manager.resume()
  assert.equal(resumed, true)
  assert.equal(calls.length, 1)
})

test('XpodManager persists managed Cloud registration after Local startup', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const registrationPath = path.join(path.dirname(manager.getLogPaths().directory), 'xpod-cloud-registration.json')
  const originalFetch = global.fetch

  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      nodeId: 'node-0000',
      nodeToken: 'node-token-1',
      serviceToken: 'service-token-1',
      provisionCode: 'pc-1',
      publicUrl: 'https://node-0000.undefineds.co/',
      spDomain: 'node-0000.undefineds.co',
    }),
  })

  t.after(() => {
    global.fetch = originalFetch
  })

  manager.readState = () => null
  manager.resolvePreferredLaunchTarget = () => ({
    kind: 'dev-source',
    rootDir: '/Users/example/xpod-cli',
    entryPath: '/Users/example/xpod-cli/src/main.ts',
  })
  manager.ensureEnvFileExists = () => {}
  manager.buildLaunchSpec = () => ({
    command: process.execPath,
    args: ['-e', ''],
    cwd: process.cwd(),
  })
  manager.buildSpawnOptions = () => ({
    cwd: process.cwd(),
    env: {},
    detached: true,
    windowsHide: true,
    stdio: ['ignore', fs.openSync('/tmp/linx-managed-persist.out', 'a'), fs.openSync('/tmp/linx-managed-persist.err', 'a')],
  })
  manager.attachProcessHandlers = () => {}
  manager.writeState = () => {}
  manager.waitForReady = async () => {}
  manager.providerManager.updateManagedStatus = () => {}

  const originalSpawn = require('node:child_process').spawn
  require('node:child_process').spawn = () => ({
    pid: 24680,
    unref() {},
  })

  t.after(() => {
    require('node:child_process').spawn = originalSpawn
    try { fs.unlinkSync('/tmp/linx-managed-persist.out') } catch {}
    try { fs.unlinkSync('/tmp/linx-managed-persist.err') } catch {}
  })

  await manager.start({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    domain: { type: 'none' },
  })

  const persisted = JSON.parse(fs.readFileSync(registrationPath, 'utf8'))
  assert.equal(persisted.local.nodeId, 'node-0000')
  assert.equal(persisted.local.nodeToken, 'node-token-1')
  assert.equal(persisted.local.serviceToken, 'service-token-1')
  assert.equal(persisted.local.publicUrl, 'https://node-0000.undefineds.co/')
  assert.equal(persisted.local.spDomain, 'node-0000.undefineds.co')
})

test('XpodManager detects external Local service with persisted managed canonical URL', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const provider = {
    id: 'local',
    issuerUrl: 'http://localhost:5737',
    managed: {
      status: 'stopped',
      dataDir: '/tmp/local-pod',
      port: 5737,
      spaceKind: 'local',
      domain: { type: 'none' },
    },
  }
  const manager = createManager({
    providerManager: {
      getManagedPods: () => [provider],
      get: () => provider,
      getDefault: () => provider,
      updateManagedStatus: () => {},
    },
  })
  const registrationPath = path.join(path.dirname(manager.getLogPaths().directory), 'xpod-cloud-registration.json')
  fs.writeFileSync(registrationPath, JSON.stringify({
    local: {
      nodeId: 'node-0000',
      nodeToken: 'node-token-1',
      serviceToken: 'service-token-1',
      provisionCode: 'pc-1',
      publicUrl: 'https://node-0000.undefineds.co/',
      spDomain: 'node-0000.undefineds.co',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-1',
      cloudIdentityUrl: 'https://id.undefineds.co',
      cloudApiUrl: 'https://api.undefineds.co',
      registeredAt: 1760000000000,
    },
  }), 'utf8')

  const originalFetch = global.fetch
  global.fetch = async (url) => {
    assert.equal(String(url), 'http://localhost:5737/service/status')
    return {
      ok: true,
      json: async () => [
        { name: 'css', status: 'running' },
        { name: 'api', status: 'running' },
      ],
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const status = await manager.getStatus()
  assert.equal(status.running, true)
  assert.equal(status.status, 'running')
  assert.equal(status.providerId, 'local')
  assert.equal(status.localUrl, 'http://localhost:5737/')
  assert.equal(status.baseUrl, 'https://node-0000.undefineds.co/')
  assert.equal(status.provisioning.nodeId, 'node-0000')
  assert.equal(status.provisioning.publicUrl, 'https://node-0000.undefineds.co/')
})

test('XpodManager does not expose localhost as a Local Cloud-managed canonical URL before Cloud allocation', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const provider = {
    id: 'local',
    issuerUrl: 'http://localhost:5737',
    managed: {
      status: 'stopped',
      dataDir: '/tmp/local-pod',
      port: 5737,
      spaceKind: 'local',
      domain: { type: 'none' },
    },
  }
  const manager = createManager({
    config: {
      CSS_BASE_URL: 'http://localhost:5737/',
    },
    providerManager: {
      getManagedPods: () => [provider],
      get: () => provider,
      getDefault: () => provider,
      updateManagedStatus: () => {},
    },
  })
  const originalFetch = global.fetch
  let called = false

  global.fetch = async () => {
    called = true
    return {
      ok: true,
      json: async () => [
        { name: 'css', status: 'running' },
        { name: 'api', status: 'running' },
      ],
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const status = await manager.getStatus()
  assert.equal(status.running, false)
  assert.equal(status.status, 'stopped')
  assert.equal(called, false)
})

test('XpodManager reuses persisted managed registration on resume without reallocation', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const provider = {
    id: 'local',
    issuerUrl: 'http://localhost:5737',
    managed: {
      status: 'stopped',
      dataDir: '/tmp/local-pod',
      port: 5737,
      spaceKind: 'local',
      domain: { type: 'none' },
    },
  }
  const manager = createManager({
    providerManager: {
      getManagedPods: () => [provider],
      get: () => provider,
      getDefault: () => provider,
      updateManagedStatus: () => {},
    },
  })
  const registrationPath = path.join(path.dirname(manager.getLogPaths().directory), 'xpod-cloud-registration.json')
  fs.writeFileSync(registrationPath, JSON.stringify({
    local: {
      nodeId: 'node-0000',
      nodeToken: 'node-token-1',
      serviceToken: 'service-token-1',
      provisionCode: 'pc-1',
      publicUrl: 'https://node-0000.undefineds.co/',
      spDomain: 'node-0000.undefineds.co',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-1',
      cloudIdentityUrl: 'https://id.undefineds.co',
      cloudApiUrl: 'https://api.undefineds.co',
      registeredAt: 1760000000000,
    },
  }), 'utf8')

  const originalFetch = global.fetch
  let fetchCalls = 0
  global.fetch = async () => {
    fetchCalls += 1
    throw new Error('resume should reuse persisted managed registration without calling Cloud')
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  manager.readState = () => null
  manager.resolvePreferredLaunchTarget = () => ({
    kind: 'dev-source',
    rootDir: '/Users/example/xpod-cli',
    entryPath: '/Users/example/xpod-cli/src/main.ts',
  })
  manager.ensureEnvFileExists = () => {}
  manager.buildLaunchSpec = (_target, _port, envPath) => {
    const envText = fs.readFileSync(envPath, 'utf8')
    assert.match(envText, /CSS_BASE_URL=https:\/\/node-0000\.undefineds\.co\//)
    assert.match(envText, /oidcIssuer=https:\/\/id\.undefineds\.co/)
    assert.match(envText, /XPOD_NODE_ID=node-0000/)
    assert.match(envText, /XPOD_NODE_TOKEN=node-token-1/)
    assert.match(envText, /XPOD_SERVICE_TOKEN=service-token-1/)
    return {
      command: process.execPath,
      args: ['-e', ''],
      cwd: process.cwd(),
    }
  }
  manager.buildSpawnOptions = () => ({
    cwd: process.cwd(),
    env: {},
    detached: true,
    windowsHide: true,
    stdio: ['ignore', fs.openSync('/tmp/linx-managed-resume.out', 'a'), fs.openSync('/tmp/linx-managed-resume.err', 'a')],
  })
  manager.attachProcessHandlers = () => {}
  manager.writeState = () => {}
  manager.waitForReady = async () => {}

  const originalSpawn = require('node:child_process').spawn
  require('node:child_process').spawn = () => ({
    pid: 13579,
    unref() {},
  })

  t.after(() => {
    require('node:child_process').spawn = originalSpawn
    try { fs.unlinkSync('/tmp/linx-managed-resume.out') } catch {}
    try { fs.unlinkSync('/tmp/linx-managed-resume.err') } catch {}
  })

  const resumed = await manager.resume()
  assert.equal(resumed, true)
  assert.equal(fetchCalls, 0)
})

test('XpodManager normalizes older persisted managed registrations to spDomain for startup', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const provider = {
    id: 'local',
    issuerUrl: 'http://localhost:5737',
    managed: {
      status: 'stopped',
      dataDir: '/tmp/local-pod',
      port: 5737,
      spaceKind: 'local',
      domain: { type: 'managed', value: 'node-0000.undefineds.co' },
    },
  }
  const manager = createManager({
    providerManager: {
      getManagedPods: () => [provider],
      get: () => provider,
      getDefault: () => provider,
      updateManagedStatus: () => {},
    },
  })
  const registrationPath = path.join(path.dirname(manager.getLogPaths().directory), 'xpod-cloud-registration.json')
  fs.writeFileSync(registrationPath, JSON.stringify({
    local: {
      nodeId: 'node-abcd1234ef56',
      nodeToken: 'node-token-1',
      serviceToken: 'service-token-1',
      provisionCode: 'pc-1',
      publicUrl: 'https://node-0000.undefineds.co/',
      spDomain: 'node-abcd1234ef56.undefineds.co',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-1',
      cloudIdentityUrl: 'https://id.undefineds.co',
      cloudApiUrl: 'https://api.undefineds.co',
      registeredAt: 1760000000000,
    },
  }), 'utf8')

  const originalFetch = global.fetch
  let fetchCalls = 0
  global.fetch = async () => {
    fetchCalls += 1
    throw new Error('resume should reuse persisted managed registration without calling Cloud')
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  manager.readState = () => null
  manager.resolvePreferredLaunchTarget = () => ({
    kind: 'dev-source',
    rootDir: '/Users/example/xpod-cli',
    entryPath: '/Users/example/xpod-cli/src/main.ts',
  })
  manager.ensureEnvFileExists = () => {}
  manager.buildLaunchSpec = (_target, _port, envPath) => {
    const envText = fs.readFileSync(envPath, 'utf8')
    assert.match(envText, /CSS_BASE_URL=https:\/\/node-abcd1234ef56\.undefineds\.co\//)
    assert.match(envText, /oidcIssuer=https:\/\/id\.undefineds\.co/)
    assert.match(envText, /XPOD_NODE_ID=node-abcd1234ef56/)
    return {
      command: process.execPath,
      args: ['-e', ''],
      cwd: process.cwd(),
    }
  }
  manager.buildSpawnOptions = () => ({
    cwd: process.cwd(),
    env: {},
    detached: true,
    windowsHide: true,
    stdio: ['ignore', fs.openSync('/tmp/linx-managed-normalized.out', 'a'), fs.openSync('/tmp/linx-managed-normalized.err', 'a')],
  })
  manager.attachProcessHandlers = () => {}
  manager.writeState = () => {}
  manager.waitForReady = async () => {}

  const originalSpawn = require('node:child_process').spawn
  require('node:child_process').spawn = () => ({
    pid: 97531,
    unref() {},
  })

  t.after(() => {
    require('node:child_process').spawn = originalSpawn
    try { fs.unlinkSync('/tmp/linx-managed-normalized.out') } catch {}
    try { fs.unlinkSync('/tmp/linx-managed-normalized.err') } catch {}
  })

  const resumed = await manager.resume()
  assert.equal(resumed, true)
  assert.equal(fetchCalls, 0)
})

test('XpodManager does not infer a resumable Local space from a configured domain alone', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const provider = {
    id: 'local',
    issuerUrl: 'http://localhost:5737',
    managed: {
      status: 'stopped',
      dataDir: '/tmp/local-pod',
      port: 5737,
      domain: { type: 'managed', value: 'node-0000.undefineds.co' },
    },
  }
  const manager = createManager({
    providerManager: {
      getManagedPods: () => [provider],
      get: () => provider,
      getDefault: () => provider,
      updateManagedStatus: () => {},
    },
  })

  assert.equal(manager.getResumableStartOptions(), null)
  assert.equal(await manager.resume(), false)
})
