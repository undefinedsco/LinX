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
  manager.resolvePreferredLaunchTarget = () => ({
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

test('XpodManager provisions a user-provided public URL for remote-ready Local startup', { concurrency: false }, async (t) => {
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
    startupMode: 'remote-ready',
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
      startupMode: 'remote-ready',
      domain: { type: 'custom', value: 'pod.example.com' },
    }),
    /连接 Cloud 注册 Local 节点超时/,
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
    startupMode: 'remote-ready',
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
  assert.equal(registration.tunnelToken, undefined)
})

test('XpodManager rejects remote-ready Local startup without a user-provided public domain', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch

  global.fetch = async () => {
    throw new Error('remote-ready without public domain should not call Cloud provisioning')
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  await assert.rejects(
    () => manager.ensureManagedCloudRegistration({
      providerId: 'local',
      dataDir: '/tmp/local-pod',
      port: 5737,
      startupMode: 'remote-ready',
      domain: { type: 'none' },
    }),
    /需要先配置用户自己的公网域名或隧道域名/,
  )
})

test('XpodManager device-only startup skips managed Cloud registration', { concurrency: false }, async (t) => {
  installElectronStub(t)
  const manager = createManager()
  const originalFetch = global.fetch

  global.fetch = async () => {
    throw new Error('device-only startup should not call Cloud provisioning')
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
    stdio: ['ignore', fs.openSync('/tmp/linx-device-only.out', 'a'), fs.openSync('/tmp/linx-device-only.err', 'a')],
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
    try { fs.unlinkSync('/tmp/linx-device-only.out') } catch {}
    try { fs.unlinkSync('/tmp/linx-device-only.err') } catch {}
  })

  await manager.start({
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    startupMode: 'device-only',
    domain: { type: 'none' },
  })
})
