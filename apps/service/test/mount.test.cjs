const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

test('PodMountStore uses a distinct visible mount root and store file', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-mount-store-'))
  const metadataDir = path.join(tempRoot, 'meta')
  const mountRoot = path.join(tempRoot, 'Linx Mounts')

  const { PodMountStore } = require('../dist/lib/mount/store.js')
  const store = new PodMountStore({ metadataDir, mountRoot })

  assert.equal(store.getMountRoot(), mountRoot)
  assert.equal(fs.existsSync(mountRoot), true)
  assert.equal(path.basename(mountRoot), 'Linx Mounts')
})

test('materializePodMount creates single-pod mount root with mount.json', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-pod-mount-materialize-'))
  const mountRoot = path.join(tempRoot, 'Linx Mounts')
  const aliceFiles = path.join(tempRoot, 'pod', 'alice')
  const aliceProjection = path.join(tempRoot, 'projection', 'alice', 'structured')
  const aliceProjectionQueries = path.join(aliceProjection, 'queries')

  fs.mkdirSync(aliceFiles, { recursive: true })
  fs.writeFileSync(path.join(aliceFiles, 'note.txt'), 'hello')
  fs.mkdirSync(aliceProjectionQueries, { recursive: true })
  fs.writeFileSync(path.join(aliceProjection, 'manifest.json'), '{}')
  fs.writeFileSync(path.join(aliceProjectionQueries, 'webid-profile-storage-oidcissuer.rq'), 'SELECT * WHERE { ?s ?p ?o }')

  const { materializePodMount } = require('../dist/lib/mount/materialize-mount.js')
  const record = materializePodMount({
    mountRoot,
    input: {
      ownerKey: 'alice@example.com',
      ownerWebId: 'http://localhost:5737/alice/profile/card#me',
      label: 'alice-mount',
    },
    snapshot: {
      source: 'local-embedded-xpod',
      running: true,
      baseUrl: 'http://localhost:5737/',
      dataRoot: path.join(tempRoot, 'pod'),
      projectionRoot: path.join(tempRoot, 'projection'),
      availablePodNames: ['alice'],
    },
    primitives: [
      {
        podName: 'alice',
        podBaseUrl: 'http://localhost:5737/alice/',
        filesPath: aliceFiles,
        structuredProjectionPath: aliceProjection,
      },
    ],
  })

  assert.equal(record.rootPath.startsWith(mountRoot), true)
  assert.equal(fs.existsSync(path.join(record.rootPath, 'files')), true)
  assert.equal(fs.existsSync(path.join(record.rootPath, 'structured')), true)
  assert.equal(fs.existsSync(path.join(record.rootPath, 'queries')), true)
  assert.equal(fs.existsSync(path.join(record.rootPath, 'mount.json')), true)
})

test('PodMountModule persists and reuses current mount independently from workspace module', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-pod-mount-module-'))
  const metadataDir = path.join(tempRoot, 'meta')
  const mountRoot = path.join(tempRoot, 'Linx Mounts')
  const dataRoot = path.join(tempRoot, 'pod')
  fs.mkdirSync(path.join(dataRoot, 'alice'), { recursive: true })

  const envPath = path.join(tempRoot, '.env')
  fs.writeFileSync(envPath, [
    'CSS_BASE_URL=http://localhost:5737/',
    `CSS_ROOT_FILE_PATH=${dataRoot}`,
  ].join('\n'))

  const { PodMountStore } = require('../dist/lib/mount/store.js')
  const { PodMountModule } = require('../dist/lib/mount/module.js')
  const { LocalXpodMountSource } = require('../dist/lib/mount/local-xpod-source.js')

  const store = new PodMountStore({ metadataDir, mountRoot })
  const adapter = new LocalXpodMountSource({
    envPath,
    statusProvider: () => ({ running: true, baseUrl: 'http://localhost:5737/' }),
  })
  const sessionProvider = () => ({
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
  })
  const mounts = new PodMountModule(store, adapter, sessionProvider)

  const first = await mounts.ensureCurrent()
  const second = await mounts.ensureCurrent()

  assert.equal(first.id, second.id)
  assert.equal(first.rootPath.startsWith(mountRoot), true)
  assert.equal(mounts.listForCurrentOwner().length, 1)
})

test('PodMountSourceSelector falls back to remote mirror when local source cannot resolve the owner pod', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-pod-mount-remote-source-'))
  const remoteMirrorRoot = path.join(tempRoot, 'remote-pod-mirror')
  const remoteFiles = path.join(remoteMirrorRoot, 'pods', 'alice', 'files')
  const remoteStructured = path.join(remoteMirrorRoot, 'pods', 'alice', 'structured')
  fs.mkdirSync(remoteFiles, { recursive: true })
  fs.mkdirSync(remoteStructured, { recursive: true })
  fs.writeFileSync(path.join(remoteFiles, 'note.txt'), 'remote')

  const { LocalXpodMountSource } = require('../dist/lib/mount/local-xpod-source.js')
  const { RemoteSolidPodMountSource } = require('../dist/lib/mount/remote-solid-pod-source.js')
  const { PodMountSourceSelector } = require('../dist/lib/mount/source-selector.js')

  const local = new LocalXpodMountSource({
    envPath: path.join(tempRoot, '.missing.env'),
    statusProvider: () => ({ running: false, baseUrl: 'http://localhost:5737/' }),
  })
  const remote = new RemoteSolidPodMountSource({
    mirrorRoot: remoteMirrorRoot,
    accountProvider: () => ({
      ownerKey: 'alice@example.com',
      ownerWebId: 'https://id.undefineds.co/alice/profile/card#me',
      podUrl: 'https://pods.undefineds.co/alice/',
      url: 'https://id.undefineds.co/',
    }),
  })

  const selector = new PodMountSourceSelector([local, remote])
  const result = selector.resolveAuthorizedPrimitives({
    ownerWebId: 'https://id.undefineds.co/alice/profile/card#me',
  })

  assert.equal(result.snapshot.source, 'remote-solid-pod')
  assert.equal(result.primitives.length, 1)
  assert.equal(result.primitives[0].filesPath, remoteFiles)
  assert.equal(result.primitives[0].structuredProjectionPath, remoteStructured)
  assert.equal(result.primitives[0].podBaseUrl, 'https://pods.undefineds.co/alice/')
})

test('PodMountModule reveal APIs open the mounted path', async (t) => {
  const opened = []
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'open') {
      return async (target) => {
        opened.push(target)
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const modulePath = require.resolve('../dist/lib/mount/module.js')
  delete require.cache[modulePath]
  const { PodMountModule } = require('../dist/lib/mount/module.js')

  const mounts = new PodMountModule({
    list: () => [{ id: 'm1', ownerKey: 'alice@example.com', rootPath: '/tmp/linx-mount-alice' }],
    get: (id) => (id === 'm1' ? { id: 'm1', ownerKey: 'alice@example.com', rootPath: '/tmp/linx-mount-alice' } : null),
    save: (record) => record,
    remove: () => {},
    getMountRoot: () => '/tmp',
    acquireLease: () => ({ holderId: 'holder-1' }),
    releaseLease: () => {},
  }, {
    getSnapshot: () => ({ source: 'local-embedded-xpod', running: true, baseUrl: 'http://localhost:5737/', dataRoot: '/tmp', availablePodNames: [] }),
    resolveAuthorizedPrimitives: () => ({ snapshot: { source: 'local-embedded-xpod', running: true, baseUrl: 'http://localhost:5737/', dataRoot: '/tmp', availablePodNames: [] }, primitives: [] }),
  }, () => ({
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
  }))

  mounts.findLatestForOwner = () => ({ id: 'm1', ownerKey: 'alice@example.com', rootPath: '/tmp/linx-mount-alice' })
  mounts.getForCurrentOwner = () => ({ id: 'm1', ownerKey: 'alice@example.com', rootPath: '/tmp/linx-mount-alice' })
  mounts.ensureCurrent = () => ({ id: 'm1', ownerKey: 'alice@example.com', rootPath: '/tmp/linx-mount-alice' })

  await mounts.revealCurrent()
  await mounts.revealForCurrentOwner('m1')

  assert.deepEqual(opened, ['/tmp/linx-mount-alice', '/tmp/linx-mount-alice'])
})

test('RemoteSolidPodMountSource can prepare a remote mirror before mounting', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-remote-source-prepare-'))
  const remoteMirrorRoot = path.join(tempRoot, 'remote-pod-mirror')
  const calls = []

  const { RemoteSolidPodMountSource } = require('../dist/lib/mount/remote-solid-pod-source.js')
  const source = new RemoteSolidPodMountSource({
    mirrorRoot: remoteMirrorRoot,
    accountProvider: () => ({
      ownerKey: 'alice@example.com',
      ownerWebId: 'https://id.undefineds.co/alice/profile/card#me',
      podUrl: 'https://pods.undefineds.co/alice/',
      url: 'https://id.undefineds.co/',
    }),
    mirrorManager: {
      async ensureMirror(input) {
        calls.push(['ensure', input])
        fs.mkdirSync(input.filesPath, { recursive: true })
        fs.writeFileSync(path.join(input.filesPath, 'hello.txt'), 'world')
        return { filesPath: input.filesPath }
      },
      async activateMirror(input) {
        calls.push(['activate', input])
      },
      async releaseMirror() {},
    },
  })

  const result = await source.prepareAuthorizedPrimitives({
    ownerWebId: 'https://id.undefineds.co/alice/profile/card#me',
  })

  assert.equal(result.snapshot.source, 'remote-solid-pod')
  assert.equal(result.primitives.length, 1)
  assert.equal(fs.existsSync(path.join(result.primitives[0].filesPath, 'hello.txt')), true)
  assert.deepEqual(calls.map(([kind]) => kind), ['ensure', 'activate'])
})

test('DefaultRemoteSolidPodMirrorManager hydrates remote files and writes local edits back', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-remote-mirror-manager-'))
  const filesPath = path.join(tempRoot, 'pods', 'alice', 'files')
  const remoteState = new Map([
    ['https://pods.undefineds.co/alice/', { kind: 'dir' }],
    ['https://pods.undefineds.co/alice/note.txt', { kind: 'file', data: Buffer.from('remote note') }],
  ])
  const writes = []
  const deleted = []

  function listContainer(resourceUrl) {
    const normalized = resourceUrl.endsWith('/') ? resourceUrl : `${resourceUrl}/`
    const direct = []
    for (const [url, entry] of remoteState.entries()) {
      if (url === normalized) continue
      if (!url.startsWith(normalized)) continue
      const rest = url.slice(normalized.length)
      if (!rest) continue
      const first = rest.split('/')[0]
      const childUrl = entry.kind === 'dir'
        ? `${normalized}${first}/`
        : `${normalized}${first}`
      if (!direct.includes(childUrl)) {
        direct.push(childUrl)
      }
    }
    return direct.sort()
  }

  const { DefaultRemoteSolidPodMirrorManager } = require('../dist/lib/mount/remote-solid-mirror.js')
  const manager = new DefaultRemoteSolidPodMirrorManager(async () => ({
    loadClientCredentials: () => ({
      url: 'https://id.undefineds.co/',
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      clientId: 'client',
      clientSecret: 'secret',
    }),
    async login() {
      return {
        fetch: globalThis.fetch,
        async logout() {},
      }
    },
    async listContainer(resourceUrl) {
      return listContainer(resourceUrl)
    },
    async readFile(resourceUrl) {
      const entry = remoteState.get(resourceUrl)
      return new Uint8Array(entry?.data ?? Buffer.alloc(0))
    },
    async writeFile(resourceUrl, data) {
      writes.push(resourceUrl)
      remoteState.set(resourceUrl, { kind: 'file', data: Buffer.from(data) })
    },
    async createContainer(resourceUrl) {
      remoteState.set(resourceUrl, { kind: 'dir' })
    },
    async deleteFile(resourceUrl) {
      deleted.push(resourceUrl)
      remoteState.delete(resourceUrl)
    },
    async deleteContainer(resourceUrl) {
      deleted.push(resourceUrl)
      remoteState.delete(resourceUrl)
    },
  }))

  await manager.ensureMirror({
    podBaseUrl: 'https://pods.undefineds.co/alice/',
    podName: 'alice',
    filesPath,
  })
  assert.equal(fs.readFileSync(path.join(filesPath, 'note.txt'), 'utf-8'), 'remote note')

  await manager.activateMirror({
    podBaseUrl: 'https://pods.undefineds.co/alice/',
    podName: 'alice',
    filesPath,
  })

  fs.writeFileSync(path.join(filesPath, 'note.txt'), 'local edit')
  await manager.syncPath('alice', 'note.txt')
  await manager.releaseMirror({ podName: 'alice' })

  assert.equal(deleted.length, 0)
  assert.ok(writes.includes('https://pods.undefineds.co/alice/note.txt'))
  assert.equal(Buffer.from(remoteState.get('https://pods.undefineds.co/alice/note.txt').data).toString('utf-8'), 'local edit')
})

test('PodMountModule rejects a second active writer for the same Pod in single-writer MVP mode', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-pod-mount-lease-conflict-'))
  const metadataDir = path.join(tempRoot, 'meta')
  const mountRoot = path.join(tempRoot, 'Linx Mounts')
  const dataRoot = path.join(tempRoot, 'pod')
  fs.mkdirSync(path.join(dataRoot, 'alice'), { recursive: true })

  const { PodMountStore } = require('../dist/lib/mount/store.js')
  const { PodMountModule } = require('../dist/lib/mount/module.js')

  let now = Date.now()
  const store = new PodMountStore({
    metadataDir,
    mountRoot,
    leaseTtlMs: 5 * 60_000,
    nowProvider: () => now,
  })
  const source = {
    getSnapshot: () => ({ source: 'local-embedded-xpod', running: true, baseUrl: 'http://localhost:5737/', dataRoot, availablePodNames: ['alice'] }),
    resolveAuthorizedPrimitives: () => ({
      snapshot: { source: 'local-embedded-xpod', running: true, baseUrl: 'http://localhost:5737/', dataRoot, availablePodNames: ['alice'] },
      primitives: [{ podName: 'alice', podBaseUrl: 'http://localhost:5737/alice/', filesPath: path.join(dataRoot, 'alice') }],
    }),
  }

  const first = new PodMountModule(store, source, () => ({
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
    createdAt: '2026-04-13T00:00:00.000Z',
  }))

  const second = new PodMountModule(store, source, () => ({
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
    createdAt: '2026-04-13T00:05:00.000Z',
  }))

  const firstRecord = await first.ensureCurrent()
  assert.equal(typeof firstRecord.id, 'string')

  await assert.rejects(
    () => second.ensureCurrent(),
    /already mounted by another active Linx session/i,
  )
})

test('PodMountModule allows stale single-writer lease recovery', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-pod-mount-lease-stale-'))
  const metadataDir = path.join(tempRoot, 'meta')
  const mountRoot = path.join(tempRoot, 'Linx Mounts')
  const dataRoot = path.join(tempRoot, 'pod')
  fs.mkdirSync(path.join(dataRoot, 'alice'), { recursive: true })

  const { PodMountStore } = require('../dist/lib/mount/store.js')
  const { PodMountModule } = require('../dist/lib/mount/module.js')

  let now = Date.now()
  const store = new PodMountStore({
    metadataDir,
    mountRoot,
    leaseTtlMs: 1_000,
    nowProvider: () => now,
  })
  const source = {
    getSnapshot: () => ({ source: 'local-embedded-xpod', running: true, baseUrl: 'http://localhost:5737/', dataRoot, availablePodNames: ['alice'] }),
    resolveAuthorizedPrimitives: () => ({
      snapshot: { source: 'local-embedded-xpod', running: true, baseUrl: 'http://localhost:5737/', dataRoot, availablePodNames: ['alice'] },
      primitives: [{ podName: 'alice', podBaseUrl: 'http://localhost:5737/alice/', filesPath: path.join(dataRoot, 'alice') }],
    }),
  }

  const first = new PodMountModule(store, source, () => ({
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
    createdAt: '2026-04-13T00:00:00.000Z',
  }))

  const second = new PodMountModule(store, source, () => ({
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
    createdAt: '2026-04-13T00:05:00.000Z',
  }))

  await first.ensureCurrent()
  now += 2_000

  const recovered = await second.ensureCurrent()
  assert.equal(typeof recovered.id, 'string')
  assert.equal(store.getLease('alice@example.com', 'http://localhost:5737/alice/profile/card#me')?.holderId.includes('2026-04-13T00:05:00.000Z'), true)
})


test('PodMountModule exposes active lease status for the current session', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-pod-mount-lease-status-'))
  const metadataDir = path.join(tempRoot, 'meta')
  const mountRoot = path.join(tempRoot, 'Linx Mounts')
  const dataRoot = path.join(tempRoot, 'pod')
  fs.mkdirSync(path.join(dataRoot, 'alice'), { recursive: true })

  const { PodMountStore } = require('../dist/lib/mount/store.js')
  const { PodMountModule } = require('../dist/lib/mount/module.js')

  const store = new PodMountStore({ metadataDir, mountRoot })
  const source = {
    getSnapshot: () => ({ source: 'local-embedded-xpod', running: true, baseUrl: 'http://localhost:5737/', dataRoot, availablePodNames: ['alice'] }),
    resolveAuthorizedPrimitives: () => ({
      snapshot: { source: 'local-embedded-xpod', running: true, baseUrl: 'http://localhost:5737/', dataRoot, availablePodNames: ['alice'] },
      primitives: [{ podName: 'alice', podBaseUrl: 'http://localhost:5737/alice/', filesPath: path.join(dataRoot, 'alice') }],
    }),
  }
  const mounts = new PodMountModule(store, source, () => ({
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
    createdAt: '2026-04-13T00:00:00.000Z',
  }))

  const record = await mounts.ensureCurrent()
  const lease = mounts.getLeaseStatus(record)

  assert.equal(lease?.mode, 'single-writer')
  assert.equal(lease?.scope, 'owner-session')
  assert.equal(lease?.active, true)
  assert.equal(lease?.ownedByCurrentSession, true)
  assert.equal(typeof lease?.expiresAt, 'string')
})

test('serializeMountForResponse keeps mount payload separate from owner session status', async () => {
  const record = {
    id: 'mount-1',
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
    source: 'local-embedded-xpod',
    xpodBaseUrl: 'http://localhost:5737/',
    rootPath: '/tmp/linx-mount-alice',
    finderVisible: true,
    status: 'ready',
    podBaseUrls: ['http://localhost:5737/alice/'],
    podNames: ['alice'],
    mounts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  }
  const { serializeMountForResponse, serializeOwnerSessionStatus } = require('../dist/lib/web-server.js')
  const result = serializeMountForResponse(record)
  const ownerSessionStatus = serializeOwnerSessionStatus({
    getLeaseStatus: () => ({
      mode: 'single-writer',
      scope: 'owner-session',
      active: true,
      expiresAt: '2026-04-13T00:00:00.000Z',
      ownedByCurrentSession: true,
    }),
  }, record)

  assert.equal(result.mountId, 'mount-1')
  assert.equal(result.mountPath, '/tmp/linx-mount-alice')
  assert.equal(result.ownerKey, undefined)
  assert.equal(result.ownerWebId, undefined)
  assert.equal(result.lease, undefined)
  assert.equal(ownerSessionStatus?.mode, 'single-writer')
  assert.equal(ownerSessionStatus?.ownedByCurrentSession, true)
})

test('WebServerModule exposes canonical POST /api/mounts/current/ensure mount contract', async (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './workspace/module' || request.endsWith('/workspace/module')) {
      return {
        getAuthorizedWorkspaceModule: () => ({
          listForCurrentOwner: () => [],
          peekOwnerContext: () => null,
          findLatestForOwner: () => null,
          getForCurrentOwner: () => null,
          create: () => null,
          revealForCurrentOwner: async () => null,
          revealCurrent: async () => null,
          removeForCurrentOwner: () => null,
        }),
      }
    }
    if (request === './mount/module' || request.endsWith('/mount/module')) {
      return {
        getPodMountModule: () => ({
          listForCurrentOwner: () => [{
            id: 'mount-1',
            ownerKey: 'alice@example.com',
            ownerWebId: 'http://localhost:5737/alice/profile/card#me',
            source: 'local-embedded-xpod',
            xpodBaseUrl: 'http://localhost:5737/',
            rootPath: '/tmp/linx-mount-alice',
            finderVisible: true,
            status: 'ready',
            podBaseUrls: ['http://localhost:5737/alice/'],
            podNames: ['alice'],
            mounts: [],
            createdAt: '2026-04-14T00:00:00.000Z',
            updatedAt: '2026-04-14T00:00:00.000Z',
            lastUsedAt: '2026-04-14T00:00:00.000Z',
          }],
          getLeaseStatus: () => ({
            mode: 'single-writer',
            scope: 'owner-session',
            active: true,
            expiresAt: '2026-04-14T01:00:00.000Z',
            ownedByCurrentSession: true,
          }),
          peekOwnerContext: () => ({
            ownerKey: 'alice@example.com',
            ownerWebId: 'http://localhost:5737/alice/profile/card#me',
          }),
          findLatestForOwner: () => null,
          getForCurrentOwner: () => null,
          ensureCurrent: async () => ({
            id: 'mount-1',
            ownerKey: 'alice@example.com',
            ownerWebId: 'http://localhost:5737/alice/profile/card#me',
            source: 'local-embedded-xpod',
            xpodBaseUrl: 'http://localhost:5737/',
            rootPath: '/tmp/linx-mount-alice',
            finderVisible: true,
            status: 'ready',
            podBaseUrls: ['http://localhost:5737/alice/'],
            podNames: ['alice'],
            mounts: [],
            createdAt: '2026-04-14T00:00:00.000Z',
            updatedAt: '2026-04-14T00:00:00.000Z',
            lastUsedAt: '2026-04-14T00:00:00.000Z',
          }),
          revealCurrent: async () => null,
          revealForCurrentOwner: async () => null,
          removeForCurrentOwner: async () => null,
        }),
      }
    }
    if (request === './runtime-threads' || request.endsWith('/runtime-threads')) {
      return {
        getRuntimeThreadsModule: () => ({
          listSessions: () => [],
          getSession: () => null,
          subscribeSession: () => () => {},
          createSession: async () => null,
          startSession: async () => null,
          pauseSession: async () => null,
          resumeSession: async () => null,
          stopSession: async () => null,
          stopAllSessions: async () => {},
          sendSessionMessage: async () => null,
          respondToSessionToolCall: async () => null,
          getSessionLog: () => '',
        }),
      }
    }
    if (request === './xpod' || request.endsWith('/xpod')) {
      return {
        getXpodModule: () => ({
          start: async () => {},
          stop: async () => {},
          restart: async () => {},
          getStatus: () => ({ running: false, port: 5737, baseUrl: 'http://localhost:5737' }),
        }),
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const webServerPath = require.resolve('../dist/lib/web-server.js')
  delete require.cache[webServerPath]
  const { WebServerModule } = require('../dist/lib/web-server.js')
  const module = new WebServerModule()
  const server = module.app.listen(0)

  t.after(() => {
    server.close()
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null
  const response = await fetch(`http://127.0.0.1:${port}/api/mounts/current/ensure`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revealInFinder: false }),
  })
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.mountId, 'mount-1')
  assert.equal(payload.mountPath, '/tmp/linx-mount-alice')
  assert.equal(payload.ownerSessionStatus.mode, 'single-writer')
})

test('WebServerModule no longer exposes legacy /api/workspaces routes', async (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './workspace/module' || request.endsWith('/workspace/module')) {
      return {
        getAuthorizedWorkspaceModule: () => ({
          listForCurrentOwner: () => [],
          peekOwnerContext: () => null,
          findLatestForOwner: () => null,
          getForCurrentOwner: () => null,
          create: () => null,
          revealForCurrentOwner: async () => null,
          revealCurrent: async () => null,
          removeForCurrentOwner: () => null,
        }),
      }
    }
    if (request === './mount/module' || request.endsWith('/mount/module')) {
      return {
        getPodMountModule: () => ({
          listForCurrentOwner: () => [],
          getLeaseStatus: () => null,
          peekOwnerContext: () => null,
          findLatestForOwner: () => null,
          getForCurrentOwner: () => null,
          ensureCurrent: async () => null,
          revealCurrent: async () => null,
          revealForCurrentOwner: async () => null,
          removeForCurrentOwner: async () => null,
        }),
      }
    }
    if (request === './runtime-threads' || request.endsWith('/runtime-threads')) {
      return {
        getRuntimeThreadsModule: () => ({
          listSessions: () => [],
          getSession: () => null,
          subscribeSession: () => () => {},
          createSession: async () => null,
          startSession: async () => null,
          pauseSession: async () => null,
          resumeSession: async () => null,
          stopSession: async () => null,
          stopAllSessions: async () => {},
          sendSessionMessage: async () => null,
          respondToSessionToolCall: async () => null,
          getSessionLog: () => '',
        }),
      }
    }
    if (request === './xpod' || request.endsWith('/xpod')) {
      return {
        getXpodModule: () => ({
          start: async () => {},
          stop: async () => {},
          restart: async () => {},
          getStatus: () => ({ running: false, port: 5737, baseUrl: 'http://localhost:5737' }),
        }),
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const webServerPath = require.resolve('../dist/lib/web-server.js')
  delete require.cache[webServerPath]
  const { WebServerModule } = require('../dist/lib/web-server.js')
  const module = new WebServerModule()
  const server = module.app.listen(0)

  t.after(() => {
    server.close()
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null
  const response = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
    redirect: 'manual',
  })

  assert.equal(response.status, 404)
  assert.equal(response.headers.get('location'), null)
})

test('WebServerModule accepts workspace.path runtime session creation', async (t) => {
  const originalLoad = Module._load
  let receivedInput = null

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './runtime-threads' || request.endsWith('/runtime-threads')) {
      return {
        getRuntimeThreadsModule: () => ({
          listSessions: () => [],
          getSession: () => null,
          subscribeSession: () => () => {},
          createSession: async (input) => {
            receivedInput = input
            return {
              id: 'runtime-3',
              threadId: input.threadId,
              title: input.title,
              repoPath: input.workspace?.path,
              worktreePath: input.workspace?.path,
              runnerType: 'mock',
              tool: input.tool ?? 'codex',
              status: 'idle',
              tokenUsage: 0,
              createdAt: '2026-04-15T00:00:00.000Z',
              updatedAt: '2026-04-15T00:00:00.000Z',
              lastActivityAt: '2026-04-15T00:00:00.000Z',
            }
          },
          startSession: async () => null,
          pauseSession: async () => null,
          resumeSession: async () => null,
          stopSession: async () => null,
          stopAllSessions: async () => {},
          sendSessionMessage: async () => null,
          respondToSessionToolCall: async () => null,
          getSessionLog: () => '',
        }),
      }
    }
    if (request === './mount/module' || request.endsWith('/mount/module')) {
      return {
        getPodMountModule: () => ({
          listForCurrentOwner: () => [],
          getLeaseStatus: () => null,
          peekOwnerContext: () => null,
          findLatestForOwner: () => null,
          getForCurrentOwner: () => null,
          ensureCurrent: async () => null,
          revealCurrent: async () => null,
          revealForCurrentOwner: async () => null,
          removeForCurrentOwner: async () => null,
        }),
      }
    }
    if (request === './xpod' || request.endsWith('/xpod')) {
      return {
        getXpodModule: () => ({
          start: async () => {},
          stop: async () => {},
          restart: async () => {},
          getStatus: () => ({ running: false, port: 5737, baseUrl: 'http://localhost:5737' }),
        }),
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const webServerPath = require.resolve('../dist/lib/web-server.js')
  delete require.cache[webServerPath]
  const { WebServerModule } = require('../dist/lib/web-server.js')
  const module = new WebServerModule()
  const server = module.app.listen(0)

  t.after(() => {
    server.close()
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null
  const response = await fetch(`http://127.0.0.1:${port}/api/threads/thread-workspace-runtime/runtime`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Workspace Runtime Session',
      workspace: {
        path: '/Volumes/Linx/alice/project',
        copy: true,
      },
      tool: 'codex',
    }),
  })
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(receivedInput.workspace.path, '/Volumes/Linx/alice/project')
  assert.equal(receivedInput.workspace.copy, true)
  assert.equal(payload.repoPath, '/Volumes/Linx/alice/project')
})

test('WebServerModule rejects runtime session creation without workspace.path', async (t) => {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './runtime-threads' || request.endsWith('/runtime-threads')) {
      return {
        getRuntimeThreadsModule: () => ({
          listSessions: () => [],
          getSession: () => null,
          subscribeSession: () => () => {},
          createSession: async () => {
            throw new Error('should not be called')
          },
          startSession: async () => null,
          pauseSession: async () => null,
          resumeSession: async () => null,
          stopSession: async () => null,
          stopAllSessions: async () => {},
          sendSessionMessage: async () => null,
          respondToSessionToolCall: async () => null,
          getSessionLog: () => '',
        }),
      }
    }
    if (request === './mount/module' || request.endsWith('/mount/module')) {
      return {
        getPodMountModule: () => ({
          listForCurrentOwner: () => [],
          getLeaseStatus: () => null,
          peekOwnerContext: () => null,
          findLatestForOwner: () => null,
          getForCurrentOwner: () => null,
          ensureCurrent: async () => null,
          revealCurrent: async () => null,
          revealForCurrentOwner: async () => null,
          removeForCurrentOwner: async () => null,
        }),
      }
    }
    if (request === './xpod' || request.endsWith('/xpod')) {
      return {
        getXpodModule: () => ({
          start: async () => {},
          stop: async () => {},
          restart: async () => {},
          getStatus: () => ({ running: false, port: 5737, baseUrl: 'http://localhost:5737' }),
        }),
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const webServerPath = require.resolve('../dist/lib/web-server.js')
  delete require.cache[webServerPath]
  const { WebServerModule } = require('../dist/lib/web-server.js')
  const module = new WebServerModule()
  const server = module.app.listen(0)

  t.after(() => {
    server.close()
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null
  const response = await fetch(`http://127.0.0.1:${port}/api/threads/thread-workspace-runtime/runtime`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Workspace Runtime Session',
      workspace: {
        git: {
          repoPath: '/repo',
        },
      },
      tool: 'codex',
    }),
  })
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.equal(payload.error, 'threadId and workspace.path are required')
})

test('WebServerModule exposes thread-bound runtime sidecar create route', async (t) => {
  const originalLoad = Module._load
  let receivedInput = null

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './runtime-threads' || request.endsWith('/runtime-threads')) {
      return {
        getRuntimeThreadsModule: () => ({
          listSessions: () => [],
          getSession: () => null,
          getSessionByChatThread: () => null,
          subscribeSession: () => () => {},
          createSession: async (input) => {
            receivedInput = input
            return {
              id: 'runtime-thread-sidecar-1',
              threadId: input.threadId,
              title: input.title,
              repoPath: input.workspace?.path,
              worktreePath: input.workspace?.path,
              runnerType: 'mock',
              tool: input.tool ?? 'codex',
              status: 'idle',
              tokenUsage: 0,
              createdAt: '2026-04-15T00:00:00.000Z',
              updatedAt: '2026-04-15T00:00:00.000Z',
              lastActivityAt: '2026-04-15T00:00:00.000Z',
            }
          },
          startSession: async () => null,
          pauseSession: async () => null,
          resumeSession: async () => null,
          stopSession: async () => null,
          stopAllSessions: async () => {},
          sendSessionMessage: async () => null,
          respondToSessionToolCall: async () => null,
          getSessionLog: () => '',
        }),
      }
    }
    if (request === './mount/module' || request.endsWith('/mount/module')) {
      return {
        getPodMountModule: () => ({
          listForCurrentOwner: () => [],
          getLeaseStatus: () => null,
          peekOwnerContext: () => null,
          findLatestForOwner: () => null,
          getForCurrentOwner: () => null,
          ensureCurrent: async () => null,
          revealCurrent: async () => null,
          revealForCurrentOwner: async () => null,
          removeForCurrentOwner: async () => null,
        }),
      }
    }
    if (request === './xpod' || request.endsWith('/xpod')) {
      return {
        getXpodModule: () => ({
          start: async () => {},
          stop: async () => {},
          restart: async () => {},
          getStatus: () => ({ running: false, port: 5737, baseUrl: 'http://localhost:5737' }),
        }),
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const webServerPath = require.resolve('../dist/lib/web-server.js')
  delete require.cache[webServerPath]
  const { WebServerModule } = require('../dist/lib/web-server.js')
  const module = new WebServerModule()
  const server = module.app.listen(0)

  t.after(() => {
    server.close()
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null
  const response = await fetch(`http://127.0.0.1:${port}/api/threads/thread-sidecar-1/runtime`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Thread Runtime Sidecar',
      workspace: {
        path: '/Volumes/Linx/alice/project',
        copy: true,
      },
      tool: 'codex',
    }),
  })
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(receivedInput.threadId, 'thread-sidecar-1')
  assert.equal(receivedInput.workspace.path, '/Volumes/Linx/alice/project')
  assert.equal(payload.threadId, 'thread-sidecar-1')
  assert.equal(payload.repoPath, '/Volumes/Linx/alice/project')
})
