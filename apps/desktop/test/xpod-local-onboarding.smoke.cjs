const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

function installElectronStub(t) {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-smoke-electron-')),
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

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to reserve a local TCP port for xpod smoke test')))
        return
      }

      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(address.port)
      })
    })
  })
}

function decodeProvisionCodePayload(code) {
  assert.equal(typeof code, 'string')
  const dotIndex = code.indexOf('.')
  assert.ok(dotIndex > 0, 'provisionCode should be signed and self-contained')
  const payload = JSON.parse(Buffer.from(code.slice(0, dotIndex), 'base64url').toString('utf8'))
  assert.equal(typeof payload, 'object')
  assert.notEqual(payload, null)
  return payload
}

function assertProvisionCodeScope(code, expected) {
  const payload = decodeProvisionCodePayload(code)
  assert.equal(payload.spUrl, expected.spUrl)
  assert.equal(payload.nodeId, expected.nodeId)
  assert.equal(payload.serviceToken, expected.serviceToken)
  assert.equal(typeof payload.exp, 'number')
  assert.ok(payload.exp > Math.floor(Date.now() / 1000), 'provisionCode should not be expired')
}

test('Local onboarding reaches ready state against a real self-bootstrapped xpod runtime', {
  concurrency: false,
  timeout: 180000,
}, async (t) => {
  installElectronStub(t)
  const originalFetch = global.fetch
  let provisionCallCount = 0

  global.fetch = async (url, options) => {
    if (String(url) === 'https://api.undefineds.co/provision/nodes') {
      provisionCallCount += 1
      const body = JSON.parse(String(options?.body ?? '{}'))
      assert.equal(body.tunnelToken, undefined)
      assert.equal(body.publicUrl, 'https://pod.example.com/')
      assert.equal(body.domainMode, 'self-managed')
      const nodeId = body.nodeId || 'abc123'

      return {
        ok: true,
        json: async () => ({
          nodeId,
          nodeToken: `node-token-${provisionCallCount}`,
          serviceToken: 'service-token-1',
          provisionCode: `pc-${provisionCallCount}`,
        }),
      }
    }

    return originalFetch(url, options)
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-smoke-'))
  const dataDir = path.join(tmpDir, 'pod')
  const port = await findFreePort()
  const provider = {
    id: 'local',
    name: 'Local',
    issuerUrl: `http://localhost:${port}/`,
    managed: {
      status: 'stopped',
      dataDir,
      port,
      domain: { type: 'custom', value: 'pod.example.com' },
    },
  }
  const providerStatuses = []
  const providerManager = {
    updateManagedStatus: (providerId, status) => {
      providerStatuses.push({ providerId, status })
      if (providerId === provider.id && provider.managed) {
        provider.managed.status = status
      }
    },
    getManagedPods: () => [provider],
    get: (providerId) => (providerId === provider.id ? provider : undefined),
    getDefault: () => undefined,
  }
  const manager = new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env.local'),
      getAll: () => ({
        CSS_EDITION: 'local',
      }),
    },
    providerManager,
    tmpDir,
  )

  t.after(async () => {
    await manager.stop().catch(() => {})
  })

  const controller = new LocalOnboardingController({
    stateDir: tmpDir,
    xpodManager: manager,
    ensureBootstrapProvider: () => provider,
  })

  const chosen = await controller.chooseSpace('local')
  assert.equal(chosen.spaceKind, 'local')

  const snapshot = await controller.continue()
  const logPaths = manager.getLogPaths()
  const stderrLog = fs.existsSync(logPaths.stderr)
    ? fs.readFileSync(logPaths.stderr, 'utf8')
    : ''
  const stdoutLog = fs.existsSync(logPaths.stdout)
    ? fs.readFileSync(logPaths.stdout, 'utf8')
    : ''

  assert.equal(
    snapshot.state,
    'ready',
    [
      `snapshot=${JSON.stringify(snapshot)}`,
      stdoutLog ? `stdout:\n${stdoutLog}` : '',
      stderrLog ? `stderr:\n${stderrLog}` : '',
    ].filter(Boolean).join('\n\n'),
  )
  assert.equal(snapshot.errorCode, null)
  assert.equal(snapshot.capabilities?.supported, true)
  assert.equal(snapshot.capabilities?.contract, 'linx-local-onboarding/v1')
  assert.equal(snapshot.localUrl, `http://localhost:${port}/`)
  assert.equal(snapshot.publicUrl, 'https://pod.example.com/')
  assert.equal(snapshot.cloudIdentityUrl, 'https://id.undefineds.co')
  assertProvisionCodeScope(snapshot.provisionCode, {
    spUrl: 'https://pod.example.com/',
    nodeId: 'abc123',
    serviceToken: 'service-token-1',
  })
  assert.equal(snapshot.capabilities?.baseUrl, 'https://pod.example.com/')
  assert.ok(providerStatuses.some(({ status }) => status === 'starting'))
  assert.ok(providerStatuses.some(({ status }) => status === 'running'))
  assert.equal(provisionCallCount, 1)

  const capabilityResponse = await fetch(`http://127.0.0.1:${port}/api/linx/capabilities`, {
    headers: { Accept: 'application/json' },
  })
  assert.equal(capabilityResponse.ok, true)
  const capabilities = await capabilityResponse.json()
  assert.equal(capabilities.contract, 'linx-local-onboarding/v1')
})

test('Local onboarding upgrades a running Standalone xpod to Local after adding a public domain', {
  concurrency: false,
  timeout: 240000,
}, async (t) => {
  installElectronStub(t)
  const originalFetch = global.fetch
  let provisionCallCount = 0

  global.fetch = async (url, options) => {
    if (String(url) === 'https://api.undefineds.co/provision/nodes') {
      provisionCallCount += 1
      const body = JSON.parse(String(options?.body ?? '{}'))
      assert.equal(body.tunnelToken, undefined)
      assert.equal(body.publicUrl, 'https://pod.example.com/')
      assert.equal(body.domainMode, 'self-managed')

      return {
        ok: true,
        json: async () => ({
          nodeId: body.nodeId || 'abc123',
          nodeToken: `node-token-${provisionCallCount}`,
          serviceToken: 'service-token-1',
          provisionCode: `pc-${provisionCallCount}`,
        }),
      }
    }

    return originalFetch(url, options)
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const { XpodManager } = require(resolveCompiledDesktopModule('lib/xpod-manager.js'))
  const { LocalOnboardingController } = require(resolveCompiledDesktopModule('lib/local-onboarding.js'))

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-smoke-upgrade-'))
  const dataDir = path.join(tmpDir, 'pod')
  const port = await findFreePort()
  const provider = {
    id: 'local',
    name: 'Local',
    issuerUrl: `http://localhost:${port}/`,
    managed: {
      status: 'stopped',
      dataDir,
      port,
      domain: { type: 'none' },
    },
  }
  const providerStatuses = []
  const providerManager = {
    updateManagedStatus: (providerId, status) => {
      providerStatuses.push({ providerId, status })
      if (providerId === provider.id && provider.managed) {
        provider.managed.status = status
      }
    },
    getManagedPods: () => [provider],
    get: (providerId) => (providerId === provider.id ? provider : undefined),
    getDefault: () => undefined,
  }
  const manager = new XpodManager(
    {},
    {
      getConfigPath: () => path.join(tmpDir, '.env.local'),
      getAll: () => ({
        CSS_EDITION: 'local',
      }),
    },
    providerManager,
    tmpDir,
  )

  t.after(async () => {
    await manager.stop().catch(() => {})
  })

  const controller = new LocalOnboardingController({
    stateDir: tmpDir,
    xpodManager: manager,
    ensureBootstrapProvider: () => provider,
  })

  const standalone = await controller.chooseSpace('standalone')
  assert.equal(standalone.spaceKind, 'standalone')

  const localSnapshot = await controller.continue()
  assert.equal(localSnapshot.state, 'ready')
  assert.equal(localSnapshot.spaceKind, 'standalone')
  assert.equal(localSnapshot.localUrl, `http://localhost:${port}/`)
  assert.equal(localSnapshot.baseUrl, `http://localhost:${port}/`)
  assert.equal(localSnapshot.publicUrl, null)
  assert.equal(provisionCallCount, 0)

  provider.managed.domain = { type: 'custom', value: 'pod.example.com' }

  const needsBinding = await controller.chooseSpace('local')
  assert.equal(needsBinding.state, 'repair_required')
  assert.equal(needsBinding.spaceKind, 'local')
  assert.equal(needsBinding.publicUrl, 'https://pod.example.com/')
  assert.equal(needsBinding.errorCode, 'LOCAL_CLOUD_BINDING_REQUIRED')

  const remoteSnapshot = await controller.continue()
  const logPaths = manager.getLogPaths()
  const stderrLog = fs.existsSync(logPaths.stderr)
    ? fs.readFileSync(logPaths.stderr, 'utf8')
    : ''
  const stdoutLog = fs.existsSync(logPaths.stdout)
    ? fs.readFileSync(logPaths.stdout, 'utf8')
    : ''

  assert.equal(
    remoteSnapshot.state,
    'ready',
    [
      `snapshot=${JSON.stringify(remoteSnapshot)}`,
      stdoutLog ? `stdout:\n${stdoutLog}` : '',
      stderrLog ? `stderr:\n${stderrLog}` : '',
    ].filter(Boolean).join('\n\n'),
  )
  assert.equal(remoteSnapshot.spaceKind, 'local')
  assert.equal(remoteSnapshot.localUrl, `http://localhost:${port}/`)
  assert.equal(remoteSnapshot.baseUrl, 'https://pod.example.com/')
  assert.equal(remoteSnapshot.publicUrl, 'https://pod.example.com/')
  assert.equal(remoteSnapshot.cloudIdentityUrl, 'https://id.undefineds.co')
  assertProvisionCodeScope(remoteSnapshot.provisionCode, {
    spUrl: 'https://pod.example.com/',
    nodeId: 'abc123',
    serviceToken: 'service-token-1',
  })
  assert.equal(remoteSnapshot.capabilities?.supported, true)
  assert.equal(remoteSnapshot.capabilities?.baseUrl, 'https://pod.example.com/')
  assert.equal(provisionCallCount, 1)
  assert.ok(providerStatuses.some(({ status }) => status === 'starting'))
  assert.ok(providerStatuses.some(({ status }) => status === 'running'))
})
