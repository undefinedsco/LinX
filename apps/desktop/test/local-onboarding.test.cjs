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
          label: '下载 xpod runtime',
          detail: '@undefineds.co/xpod@0.3.4',
        })
        started = true
      },
    },
  })

  await controller.chooseSpace('standalone')
  await controller.continue()

  const progressSnapshot = snapshots.find((snapshot) => snapshot.progress?.phase === 'install-bun')
  assert.ok(progressSnapshot)
  assert.equal(progressSnapshot.message, '下载 xpod runtime')
  assert.equal(progressSnapshot.progress.detail, '@undefineds.co/xpod@0.3.4')
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
      baseUrl: 'http://localhost:5737/',
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
  assert.match(failed.message, /Service Unavailable/)

  const refreshed = await controller.refresh()
  assert.equal(refreshed.state, 'error')
  assert.equal(refreshed.spaceKind, 'local')
  assert.equal(refreshed.errorCode, 'LOCAL_START_FAILED')
  assert.equal(refreshed.message, failed.message)
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
      baseUrl: 'http://localhost:5737/',
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
