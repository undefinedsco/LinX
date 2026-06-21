const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-electron-')),
        setPath: () => {},
        isPackaged: false,
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

process.once('exit', () => {
  Module._load = originalLoad
})

function createProvider(domain = { type: 'none' }) {
  return {
    id: 'local',
    name: 'Local',
    issuerUrl: 'http://localhost:5737',
    managed: {
      status: 'stopped',
      dataDir: '/tmp/local-pod',
      port: 5737,
      domain,
    },
  }
}

function createProvisioning(overrides = {}) {
  return {
    nodeId: 'abc123',
    publicUrl: 'https://node-abc123.undefineds.co/',
    provisionCode: 'pc-123',
    provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
    cloudIdentityUrl: 'https://id.undefineds.co',
    cloudApiUrl: 'https://api.undefineds.co',
    registeredAt: Date.now(),
    ...overrides,
  }
}

test('LocalOnboardingController starts Local with Cloud binding and becomes ready without blocking on contract support', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-'))
  const calls = []

  const controller = new LocalOnboardingController({
    stateDir,
    ensureBootstrapProvider: () => createProvider(),
    xpodManager: {
      getStatus: async () => {
        calls.push('status')
        return calls.includes('start')
          ? {
              running: true,
              status: 'running',
              localUrl: 'http://localhost:5737/',
              baseUrl: 'http://localhost:5737/',
              provisioning: createProvisioning(),
            }
          : {
              running: false,
              status: 'stopped',
              localUrl: 'http://localhost:5737/',
              baseUrl: 'http://localhost:5737/',
            }
      },
      start: async () => {
        calls.push('start')
      },
    },
    fetchCapabilities: async () => ({
      supported: false,
      contract: null,
      baseUrl: null,
      version: null,
    }),
  })

  const spaceSnapshot = await controller.chooseSpace('local')
  assert.equal(spaceSnapshot.state, 'idle')
  assert.equal(spaceSnapshot.spaceKind, 'local')

  const finalSnapshot = await controller.continue()
  assert.equal(finalSnapshot.state, 'ready')
  assert.equal(finalSnapshot.errorCode, null)
  assert.deepEqual(calls, ['status', 'status', 'start', 'status'])
})

test('LocalOnboardingController publishes xpod startup progress while starting Local', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-progress-'))
  const snapshots = []
  let started = false

  const controller = new LocalOnboardingController({
    stateDir,
    ensureBootstrapProvider: () => createProvider(),
    onSnapshotChange: (snapshot) => snapshots.push(snapshot),
    xpodManager: {
      getStatus: async () => started
        ? {
            running: true,
            status: 'running',
            localUrl: 'http://localhost:5737/',
            baseUrl: 'http://localhost:5737/',
          }
        : {
            running: false,
            status: 'stopped',
            localUrl: 'http://localhost:5737/',
            baseUrl: 'http://localhost:5737/',
          },
      start: async (_options, onProgress) => {
        onProgress?.({
          phase: 'install-bun',
          label: '安装 xpod runtime 包与生产依赖',
          detail: 'bun install · @undefineds.co/xpod@0.3.4',
        })
        started = true
      },
    },
  })

  await controller.chooseSpace('standalone')
  await controller.continue()

  const progressSnapshot = snapshots.find((snapshot) => snapshot.progress?.phase === 'install-bun')
  assert.ok(progressSnapshot)
  assert.equal(progressSnapshot.message, '安装 xpod runtime 包与生产依赖')
  assert.equal(progressSnapshot.progress.detail, 'bun install · @undefineds.co/xpod@0.3.4')
})

test('LocalOnboardingController does not publish raw Local addresses as startup progress detail', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-progress-address-'))
  const snapshots = []
  let started = false

  const controller = new LocalOnboardingController({
    stateDir,
    ensureBootstrapProvider: () => createProvider(),
    onSnapshotChange: (snapshot) => snapshots.push(snapshot),
    xpodManager: {
      getStatus: async () => started
        ? {
            running: true,
            status: 'running',
            localUrl: 'http://localhost:5737/',
            baseUrl: 'http://localhost:5737/',
          }
        : {
            running: false,
            status: 'stopped',
            localUrl: 'http://localhost:5737/',
            baseUrl: 'http://localhost:5737/',
          },
      start: async (_options, onProgress) => {
        onProgress?.({
          phase: 'custom-debug',
          label: '等待 Local 服务就绪',
          detail: 'http://localhost:5737/',
        })
        started = true
      },
    },
  })

  await controller.chooseSpace('standalone')
  await controller.continue()

  const progressSnapshot = snapshots.find((snapshot) => snapshot.progress?.phase === 'custom-debug')
  assert.ok(progressSnapshot)
  assert.equal(progressSnapshot.message, '等待 Local 服务就绪')
  assert.equal(progressSnapshot.progress.detail, null)
})

test('LocalOnboardingController treats a running Standalone service as ready without Cloud binding', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const controller = new LocalOnboardingController({
    stateDir: fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-')),
    ensureBootstrapProvider: () => createProvider({ type: 'none' }),
    xpodManager: {
      getStatus: async () => ({
        running: true,
        status: 'running',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'http://localhost:5737/',
      }),
      start: async () => {
        throw new Error('should not start')
      },
    },
  })

  const snapshot = await controller.chooseSpace('standalone')
  assert.equal(snapshot.state, 'ready')
  assert.equal(snapshot.errorCode, null)
  assert.equal(snapshot.spaceKind, 'standalone')
})

test('LocalOnboardingController does not infer Local space from configured public address', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-'))
  const controller = new LocalOnboardingController({
    stateDir,
    ensureBootstrapProvider: () => createProvider({ type: 'custom', value: 'pod.example.com' }),
    xpodManager: {
      getStatus: async () => ({
        running: false,
        status: 'stopped',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'https://pod.example.com/',
      }),
      start: async () => {
        throw new Error('should not start')
      },
    },
  })

  const snapshot = await controller.refresh()
  assert.equal(snapshot.state, 'space_required')
  assert.equal(snapshot.spaceKind, null)

  const persisted = JSON.parse(fs.readFileSync(path.join(stateDir, 'local-onboarding.json'), 'utf8'))
  assert.equal(persisted.spaceKind, null)
  assert.equal(persisted.providerId, 'local')
})

test('LocalOnboardingController restarts a running Standalone service when the user switches to Local with a public domain', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-'))
  let domain = { type: 'none' }
  let status = {
    running: true,
    status: 'running',
    providerId: 'local',
    localUrl: 'http://localhost:5737/',
    baseUrl: 'http://localhost:5737/',
  }
  const startCalls = []

  const controller = new LocalOnboardingController({
    stateDir,
    ensureBootstrapProvider: () => createProvider(domain),
    xpodManager: {
      getStatus: async () => status,
      start: async (options) => {
        startCalls.push(options)
        status = {
          running: true,
          status: 'running',
          providerId: 'local',
          localUrl: 'http://localhost:5737/',
          baseUrl: 'https://pod.example.com/',
          provisioning: createProvisioning({
            publicUrl: 'https://pod.example.com/',
            cloudIdentityUrl: 'https://id.undefineds.co',
          }),
        }
      },
    },
    fetchCapabilities: async () => ({
      supported: true,
      contract: 'linx-local-onboarding/v1',
      baseUrl: status.baseUrl,
      version: '0.2.23',
    }),
  })

  const standaloneSnapshot = await controller.chooseSpace('standalone')
  assert.equal(standaloneSnapshot.state, 'ready')
  assert.equal(standaloneSnapshot.spaceKind, 'standalone')
  assert.equal(startCalls.length, 0)

  domain = { type: 'custom', value: 'pod.example.com' }
  const upgradedSnapshot = await controller.chooseSpace('local')
  assert.equal(upgradedSnapshot.state, 'repair_required')
  assert.equal(upgradedSnapshot.spaceKind, 'local')
  assert.equal(upgradedSnapshot.publicUrl, 'https://pod.example.com/')
  assert.equal(upgradedSnapshot.errorCode, 'LOCAL_CLOUD_BINDING_REQUIRED')

  const finalSnapshot = await controller.continue()
  assert.equal(finalSnapshot.state, 'ready')
  assert.equal(finalSnapshot.spaceKind, 'local')
  assert.equal(finalSnapshot.publicUrl, 'https://pod.example.com/')
  assert.equal(finalSnapshot.cloudIdentityUrl, 'https://id.undefineds.co')
  assert.equal(finalSnapshot.provisionCode, 'pc-123')

  assert.equal(startCalls.length, 1)
  assert.deepEqual(startCalls[0], {
    providerId: 'local',
    dataDir: '/tmp/local-pod',
    port: 5737,
    spaceKind: 'local',
    domain: { type: 'custom', value: 'pod.example.com' },
    tunnelToken: undefined,
  })

  const persisted = JSON.parse(fs.readFileSync(path.join(stateDir, 'local-onboarding.json'), 'utf8'))
  assert.equal(persisted.spaceKind, 'local')
  assert.equal(persisted.providerId, 'local')
})

test('LocalOnboardingController preserves start errors across refreshes until retry context changes', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const controller = new LocalOnboardingController({
    stateDir: fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-')),
    ensureBootstrapProvider: () => createProvider({ type: 'custom', value: 'pod.example.com' }),
    xpodManager: {
      getStatus: async () => ({
        running: false,
        status: 'stopped',
        providerId: 'local',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'http://localhost:5737/',
      }),
      start: async () => {
        throw new Error('无法完成 Local 的 Cloud 绑定：{"error":"Service Unavailable","details":""}')
      },
    },
  })

  await controller.chooseSpace('local')

  const failed = await controller.continue()
  assert.equal(failed.state, 'error')
  assert.equal(failed.spaceKind, 'local')
  assert.equal(failed.errorCode, 'LOCAL_START_FAILED')
  assert.match(failed.message, /登录服务暂时不可用/)

  const refreshed = await controller.refresh()
  assert.equal(refreshed.state, 'error')
  assert.equal(refreshed.spaceKind, 'local')
  assert.equal(refreshed.errorCode, 'LOCAL_START_FAILED')
  assert.equal(refreshed.message, failed.message)
})

test('LocalOnboardingController hides raw xpod runtime diagnostics from start errors', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const controller = new LocalOnboardingController({
    stateDir: fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-')),
    ensureBootstrapProvider: () => createProvider(),
    xpodManager: {
      getStatus: async () => ({
        running: false,
        status: 'stopped',
        providerId: 'local',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'http://localhost:5737/',
      }),
      start: async () => {
        throw new Error([
          "Cannot find module 'jsonld'",
          'Require stack:',
          '- /Users/ganlu/Library/Application Support/@linx/desktop/local/runtimes/xpod/index.js',
        ].join('\n'))
      },
    },
  })

  await controller.chooseSpace('standalone')
  const failed = await controller.continue()

  assert.equal(failed.state, 'error')
  assert.equal(failed.message, '本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。')
  assert.doesNotMatch(failed.message, /jsonld|Require stack|Application Support|\/Users\//)
})

test('LocalOnboardingController requires an explicit space for an existing local instance', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-'))
  const controller = new LocalOnboardingController({
    stateDir,
    ensureBootstrapProvider: () => createProvider({ type: 'none' }),
    xpodManager: {
      getStatus: async () => ({
        running: false,
        status: 'stopped',
        providerId: 'local',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'http://localhost:5737/',
      }),
      start: async () => {
        throw new Error('should not start')
      },
    },
  })

  const snapshot = await controller.refresh()
  assert.equal(snapshot.state, 'space_required')
  assert.equal(snapshot.spaceKind, null)

  const persisted = JSON.parse(fs.readFileSync(path.join(stateDir, 'local-onboarding.json'), 'utf8'))
  assert.equal(persisted.spaceKind, null)
  assert.equal(persisted.providerId, 'local')
})

test('LocalOnboardingController requires explicit first-run space selection', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-'))
  const controller = new LocalOnboardingController({
    stateDir,
    ensureBootstrapProvider: () => createProvider({ type: 'none' }),
    xpodManager: {
      getStatus: async () => ({
        running: false,
        status: 'stopped',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'http://localhost:5737/',
      }),
      start: async () => {
        throw new Error('should not start')
      },
    },
  })

  const snapshot = await controller.refresh()
  assert.equal(snapshot.state, 'space_required')
  assert.equal(snapshot.spaceKind, null)

  const persisted = JSON.parse(fs.readFileSync(path.join(stateDir, 'local-onboarding.json'), 'utf8'))
  assert.equal(persisted.spaceKind, null)
  assert.equal(persisted.providerId, 'local')
})

test('LocalOnboardingController marks an already running local service as ready', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-'))
  const controller = new LocalOnboardingController({
    stateDir,
    ensureBootstrapProvider: () => createProvider({ type: 'none' }),
    xpodManager: {
      getStatus: async () => ({
        running: true,
        status: 'running',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'http://localhost:5737/',
        provisioning: createProvisioning(),
      }),
      start: async () => {
        throw new Error('should not start')
      },
    },
    fetchCapabilities: async () => ({
      supported: true,
      contract: 'linx-local-onboarding/v1',
      baseUrl: 'https://node-abc123.undefineds.co/',
      version: '0.2.2',
    }),
  })

  const snapshot = await controller.chooseSpace('local')
  assert.equal(snapshot.state, 'ready')
  assert.equal(snapshot.spaceKind, 'local')
  assert.equal(snapshot.localUrl, 'http://localhost:5737/')
  assert.equal(snapshot.cloudIdentityUrl, 'https://id.undefineds.co')
  assert.equal(snapshot.provisionCode, 'pc-123')
})

test('LocalOnboardingController probes Standalone capabilities on local URL while preserving LAN canonical URL', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const capabilityUrls = []
  const controller = new LocalOnboardingController({
    stateDir: fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-')),
    ensureBootstrapProvider: () => createProvider({ type: 'none' }),
    xpodManager: {
      getStatus: async () => ({
        running: true,
        status: 'running',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'http://host.docker.internal:5737/',
      }),
      start: async () => {
        throw new Error('should not start')
      },
    },
    fetchCapabilities: async (url) => {
      capabilityUrls.push(url)
      return {
        supported: true,
        contract: 'linx-local-onboarding/v1',
        baseUrl: 'http://host.docker.internal:5737/',
        version: '0.2.2',
      }
    },
  })

  const snapshot = await controller.chooseSpace('standalone')
  assert.equal(snapshot.state, 'ready')
  assert.equal(snapshot.baseUrl, 'http://host.docker.internal:5737/')
  assert.deepEqual(capabilityUrls, ['http://localhost:5737/'])
})

test('LocalOnboardingController still becomes ready when the capability probe times out', async (t) => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const originalFetch = global.fetch
  global.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener?.('abort', () => {
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      reject(error)
    })
  })

  t.after(() => {
    global.fetch = originalFetch
  })

  const controller = new LocalOnboardingController({
    stateDir: fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-')),
    ensureBootstrapProvider: () => createProvider({ type: 'none' }),
    xpodManager: {
      getStatus: async () => ({
        running: true,
        status: 'running',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'http://localhost:5737/',
        provisioning: createProvisioning(),
      }),
      start: async () => {
        throw new Error('should not start')
      },
    },
    fetchCapabilitiesTimeoutMs: 10,
  })

  const snapshot = await controller.chooseSpace('local')
  assert.equal(snapshot.state, 'ready')
  assert.equal(snapshot.errorCode, null)
})

test('LocalOnboardingController saves a Cloudflare command token and restarts Local with it', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-token-'))
  const provider = createProvider({ type: 'managed', value: 'node-0000.undefineds.co' })
  let status = {
    running: true,
    status: 'running',
    localUrl: 'http://localhost:5737/',
    baseUrl: 'https://node-0000.undefineds.co/',
    provisioning: createProvisioning({
      publicUrl: 'https://node-0000.undefineds.co/',
      spDomain: 'node-0000.undefineds.co',
    }),
  }
  const updates = []
  const startCalls = []

  const controller = new LocalOnboardingController({
    stateDir,
    ensureBootstrapProvider: () => provider,
    updateProvider: (_id, update) => {
      updates.push(update)
      provider.managed = update.managed
    },
    xpodManager: {
      getStatus: async () => status,
      start: async (options) => {
        startCalls.push(options)
        status = {
          running: true,
          status: 'running',
          localUrl: 'http://localhost:5737/',
          baseUrl: 'https://node-0000.undefineds.co/',
          provisioning: createProvisioning({
            publicUrl: 'https://node-0000.undefineds.co/',
            spDomain: 'node-0000.undefineds.co',
            tunnelToken: options.tunnelToken,
            tunnelProvider: 'cloudflare',
          }),
        }
      },
    },
    fetchCapabilities: async () => ({
      supported: true,
      contract: 'linx-local-onboarding/v1',
      baseUrl: 'https://node-0000.undefineds.co/',
      version: '0.3.31',
    }),
  })

  await controller.chooseSpace('local')
  const snapshot = await controller.saveTunnelToken({
    token: 'cloudflared tunnel run --token token-123',
  })

  assert.equal(updates.length, 1)
  assert.equal(updates[0].managed.tunnelToken, 'token-123')
  assert.equal(startCalls.length, 1)
  assert.equal(startCalls[0].tunnelToken, 'token-123')
  assert.equal(snapshot.state, 'ready')
  assert.equal(snapshot.tunnel.hasToken, true)
  assert.equal(snapshot.tunnel.provider, 'cloudflare')
})

test('LocalOnboardingController saves Local network config with custom domain and tunnel token', async () => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-network-'))
  const provider = createProvider({ type: 'none' })
  let status = {
    running: true,
    status: 'running',
    localUrl: 'http://localhost:5737/',
    baseUrl: 'https://node-0000.undefineds.co/',
    provisioning: createProvisioning({
      publicUrl: 'https://node-0000.undefineds.co/',
      spDomain: 'node-0000.undefineds.co',
    }),
  }
  const updates = []
  const startCalls = []

  const controller = new LocalOnboardingController({
    stateDir,
    ensureBootstrapProvider: () => provider,
    updateProvider: (_id, update) => {
      updates.push(update)
      provider.managed = update.managed
    },
    xpodManager: {
      getStatus: async () => status,
      start: async (options) => {
        startCalls.push(options)
        status = {
          running: true,
          status: 'running',
          localUrl: 'http://localhost:5737/',
          baseUrl: 'https://pod.example.com/',
          provisioning: createProvisioning({
            publicUrl: 'https://pod.example.com/',
            tunnelToken: options.tunnelToken,
            tunnelProvider: 'cloudflare',
          }),
        }
      },
    },
    fetchCapabilities: async () => ({
      supported: true,
      contract: 'linx-local-onboarding/v1',
      baseUrl: 'https://pod.example.com/',
      version: '0.3.31',
    }),
  })

  await controller.chooseSpace('local')
  const snapshot = await controller.saveNetworkConfig({
    publicDomain: 'https://pod.example.com/',
    tunnelProvider: 'cloudflare',
    tunnelToken: 'cloudflared tunnel run --token token-456',
  })

  assert.equal(updates.length, 1)
  assert.deepEqual(updates[0].managed.domain, { type: 'custom', value: 'pod.example.com' })
  assert.equal(updates[0].managed.tunnelToken, 'token-456')
  assert.equal(startCalls.length, 1)
  assert.deepEqual(startCalls[0].domain, { type: 'custom', value: 'pod.example.com' })
  assert.equal(startCalls[0].tunnelToken, 'token-456')
  assert.equal(snapshot.state, 'ready')
  assert.equal(snapshot.publicUrl, 'https://pod.example.com/')
  assert.equal(snapshot.tunnel.hasToken, true)
})

test('LocalOnboardingController reports public route mismatch during connectivity test', async (t) => {
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const requestUrl = String(url)
    const baseUrl = requestUrl.startsWith('http://localhost:5737/')
      ? 'https://node-0000.undefineds.co/'
      : 'https://wrong-node.undefineds.co/'

    return {
      ok: true,
      json: async () => ({
        contract: 'linx-local-onboarding/v1',
        baseUrl,
        version: '0.3.31',
      }),
    }
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const controller = new LocalOnboardingController({
    stateDir: fs.mkdtempSync(path.join(os.tmpdir(), 'linx-local-onboarding-connectivity-')),
    ensureBootstrapProvider: () => createProvider({ type: 'managed', value: 'node-0000.undefineds.co' }),
    xpodManager: {
      getStatus: async () => ({
        running: true,
        status: 'running',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'https://node-0000.undefineds.co/',
        provisioning: createProvisioning({
          publicUrl: 'https://node-0000.undefineds.co/',
          spDomain: 'node-0000.undefineds.co',
        }),
      }),
      start: async () => {
        throw new Error('should not start')
      },
    },
  })

  await controller.chooseSpace('local')
  const snapshot = await controller.testConnectivity()

  assert.equal(snapshot.connectivity.status, 'mismatch')
  assert.equal(snapshot.connectivity.local.reachable, true)
  assert.equal(snapshot.connectivity.public.reachable, true)
  assert.equal(snapshot.connectivity.public.sameNode, false)
})
