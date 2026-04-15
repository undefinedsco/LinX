const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

test('AuthorizedWorkspaceStore uses a visible workspace root outside raw pod storage', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-workspace-store-'))
  const metadataDir = path.join(tempRoot, 'meta')
  const workspaceRoot = path.join(tempRoot, 'Linx Workspaces')

  const { AuthorizedWorkspaceStore } = require('../dist/lib/workspace/store.js')
  const store = new AuthorizedWorkspaceStore({ metadataDir, workspaceRoot })

  assert.equal(store.getWorkspaceRoot(), workspaceRoot)
  assert.equal(fs.existsSync(workspaceRoot), true)
  assert.equal(path.basename(workspaceRoot), 'Linx Workspaces')
})

test('XpodWorkspaceAdapter resolves only the authorized pod derived from ownerWebId', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-workspace-adapter-'))
  const dataRoot = path.join(tempRoot, 'pod')
  fs.mkdirSync(path.join(dataRoot, 'alice'), { recursive: true })
  fs.mkdirSync(path.join(dataRoot, 'bob'), { recursive: true })

  const envPath = path.join(tempRoot, '.env')
  fs.writeFileSync(envPath, [
    `CSS_BASE_URL=http://localhost:5737/`,
    `CSS_ROOT_FILE_PATH=${dataRoot}`,
  ].join('\n'))

  const { XpodWorkspaceAdapter } = require('../dist/lib/workspace/xpod-workspace-adapter.js')
  const adapter = new XpodWorkspaceAdapter({
    envPath,
    statusProvider: () => ({ running: true, baseUrl: 'http://localhost:5737/' }),
  })

  const { primitives } = adapter.resolveAuthorizedPrimitives({
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
  })

  assert.equal(primitives.length, 1)
  assert.equal(primitives[0].podName, 'alice')
  assert.equal(primitives[0].podBaseUrl, 'http://localhost:5737/alice/')
  assert.equal(primitives[0].filesPath, path.join(dataRoot, 'alice'))
})

test('XpodWorkspaceAdapter rejects explicit pod selection outside the owner pod', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-workspace-adapter-reject-'))
  const dataRoot = path.join(tempRoot, 'pod')
  fs.mkdirSync(path.join(dataRoot, 'alice'), { recursive: true })
  fs.mkdirSync(path.join(dataRoot, 'bob'), { recursive: true })

  const envPath = path.join(tempRoot, '.env')
  fs.writeFileSync(envPath, [
    'CSS_BASE_URL=http://localhost:5737/',
    `CSS_ROOT_FILE_PATH=${dataRoot}`,
  ].join('\n'))

  const { XpodWorkspaceAdapter } = require('../dist/lib/workspace/xpod-workspace-adapter.js')
  const adapter = new XpodWorkspaceAdapter({
    envPath,
    statusProvider: () => ({ running: true, baseUrl: 'http://localhost:5737/' }),
  })

  assert.throws(() => {
    adapter.resolveAuthorizedPrimitives({
      ownerWebId: 'http://localhost:5737/alice/profile/card#me',
      podBaseUrls: ['http://localhost:5737/bob/'],
    })
  }, /cannot exceed the owner pod/)
})

test('materializeAuthorizedWorkspace creates a Finder-visible single-pod mount root', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-workspace-materialize-'))
  const workspaceRoot = path.join(tempRoot, 'Linx Workspaces')
  const aliceFiles = path.join(tempRoot, 'pod', 'alice')
  const aliceProjection = path.join(tempRoot, 'projection', 'alice', 'structured')
  const aliceProjectionQueries = path.join(aliceProjection, 'queries')

  fs.mkdirSync(aliceFiles, { recursive: true })
  fs.writeFileSync(path.join(aliceFiles, 'note.txt'), 'hello')
  fs.mkdirSync(aliceProjectionQueries, { recursive: true })
  fs.writeFileSync(path.join(aliceProjection, 'manifest.json'), '{}')
  fs.writeFileSync(path.join(aliceProjectionQueries, 'webid-profile-storage-oidcissuer.rq'), 'SELECT * WHERE { ?s ?p ?o }')

  const { materializeAuthorizedWorkspace } = require('../dist/lib/workspace/materialize-workspace.js')
  const record = materializeAuthorizedWorkspace({
    workspaceRoot,
    input: {
      ownerKey: 'alice@example.com',
      ownerWebId: 'http://localhost:5737/alice/profile/card#me',
      label: 'alice-session',
    },
    snapshot: {
      running: true,
      xpodBaseUrl: 'http://localhost:5737/',
      dataRoot: path.join(tempRoot, 'pod'),
      projectionRoot: path.join(tempRoot, 'projection'),
      availablePodNames: ['alice', 'bob'],
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

  assert.equal(record.finderVisible, true)
  assert.equal(record.podNames.length, 1)
  assert.equal(record.podNames[0], 'alice')
  assert.equal(record.rootPath.startsWith(workspaceRoot), true)
  assert.equal(record.rootPath.includes('.xpod-ai'), false)
  assert.equal(fs.existsSync(path.join(record.rootPath, 'files')), true)
  assert.equal(fs.existsSync(path.join(record.rootPath, 'structured')), true)
  assert.equal(fs.existsSync(path.join(record.rootPath, 'structured', 'manifest.json')), true)
  assert.equal(fs.existsSync(path.join(record.rootPath, 'queries', 'webid-profile-storage-oidcissuer.rq')), true)
  assert.equal(fs.existsSync(path.join(record.rootPath, 'workspace.json')), true)
  assert.equal(fs.existsSync(path.join(record.rootPath, 'mount.json')), true)
})

test('materializeAuthorizedWorkspace preserves file write-through for mounted pod files', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-pod-mount-write-through-'))
  const workspaceRoot = path.join(tempRoot, 'Linx Mounts')
  const aliceFiles = path.join(tempRoot, 'pod', 'alice')
  const aliceProjection = path.join(tempRoot, 'projection', 'alice', 'structured')

  fs.mkdirSync(aliceFiles, { recursive: true })
  fs.writeFileSync(path.join(aliceFiles, 'note.txt'), 'hello')
  fs.mkdirSync(aliceProjection, { recursive: true })
  fs.writeFileSync(path.join(aliceProjection, 'manifest.json'), '{}')

  const { materializeAuthorizedWorkspace } = require('../dist/lib/workspace/materialize-workspace.js')
  const record = materializeAuthorizedWorkspace({
    workspaceRoot,
    input: {
      ownerKey: 'alice@example.com',
      ownerWebId: 'http://localhost:5737/alice/profile/card#me',
      label: 'write-through',
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

  const mountedNote = path.join(record.rootPath, 'files', 'note.txt')
  fs.writeFileSync(mountedNote, 'changed-through-mount')
  const sourceNote = path.join(aliceFiles, 'note.txt')

  assert.equal(fs.readFileSync(sourceNote, 'utf-8'), 'changed-through-mount')
})

test('materializeAuthorizedWorkspace keeps structured and query views read-only copies', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-pod-mount-readonly-'))
  const workspaceRoot = path.join(tempRoot, 'Linx Mounts')
  const aliceFiles = path.join(tempRoot, 'pod', 'alice')
  const aliceProjection = path.join(tempRoot, 'projection', 'alice', 'structured')
  const aliceProjectionQueries = path.join(aliceProjection, 'queries')

  fs.mkdirSync(aliceFiles, { recursive: true })
  fs.mkdirSync(aliceProjectionQueries, { recursive: true })
  fs.writeFileSync(path.join(aliceProjection, 'manifest.json'), 'manifest-v1')
  fs.writeFileSync(path.join(aliceProjectionQueries, 'webid-profile-storage-oidcissuer.rq'), 'SELECT * WHERE { ?s ?p ?o }')

  const { materializeAuthorizedWorkspace } = require('../dist/lib/workspace/materialize-workspace.js')
  const record = materializeAuthorizedWorkspace({
    workspaceRoot,
    input: {
      ownerKey: 'alice@example.com',
      ownerWebId: 'http://localhost:5737/alice/profile/card#me',
      label: 'readonly-copy',
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

  const mountedManifest = path.join(record.rootPath, 'structured', 'manifest.json')
  const sourceManifest = path.join(aliceProjection, 'manifest.json')
  const mountedQuery = path.join(record.rootPath, 'queries', 'webid-profile-storage-oidcissuer.rq')

  assert.equal(fs.readFileSync(mountedManifest, 'utf-8'), 'manifest-v1')
  assert.equal(fs.readFileSync(mountedQuery, 'utf-8'), 'SELECT * WHERE { ?s ?p ?o }')

  let writeFailed = false
  try {
    fs.writeFileSync(mountedManifest, 'manifest-v2')
  } catch {
    writeFailed = true
  }

  assert.equal(writeFailed, true)
  assert.equal(fs.readFileSync(sourceManifest, 'utf-8'), 'manifest-v1')
})

test('materializeAuthorizedWorkspace makes fallback structured/query directories read-only', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-pod-mount-fallback-readonly-'))
  const workspaceRoot = path.join(tempRoot, 'Linx Mounts')
  const aliceFiles = path.join(tempRoot, 'pod', 'alice')

  fs.mkdirSync(aliceFiles, { recursive: true })
  fs.writeFileSync(path.join(aliceFiles, 'note.txt'), 'hello')

  const { materializeAuthorizedWorkspace } = require('../dist/lib/workspace/materialize-workspace.js')
  const record = materializeAuthorizedWorkspace({
    workspaceRoot,
    input: {
      ownerKey: 'alice@example.com',
      ownerWebId: 'http://localhost:5737/alice/profile/card#me',
      label: 'fallback-readonly',
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
      },
    ],
  })

  const fallbackStructuredReadme = path.join(record.rootPath, 'structured', 'README.md')
  const fallbackQueryReadme = path.join(record.rootPath, 'queries', 'README.md')

  let structuredWriteFailed = false
  let queryWriteFailed = false
  try {
    fs.writeFileSync(fallbackStructuredReadme, 'override')
  } catch {
    structuredWriteFailed = true
  }
  try {
    fs.writeFileSync(fallbackQueryReadme, 'override')
  } catch {
    queryWriteFailed = true
  }

  assert.equal(structuredWriteFailed, true)
  assert.equal(queryWriteFailed, true)
})

test('AuthorizedWorkspaceModule creates a persisted, scoped workspace record', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-workspace-module-'))
  const metadataDir = path.join(tempRoot, 'meta')
  const workspaceRoot = path.join(tempRoot, 'Linx Workspaces')
  const dataRoot = path.join(tempRoot, 'pod')
  fs.mkdirSync(path.join(dataRoot, 'alice'), { recursive: true })
  fs.writeFileSync(path.join(dataRoot, 'alice', 'hello.txt'), 'hello')

  const envPath = path.join(tempRoot, '.env')
  fs.writeFileSync(envPath, [
    'CSS_BASE_URL=http://localhost:5737/',
    `CSS_ROOT_FILE_PATH=${dataRoot}`,
  ].join('\n'))

  const { AuthorizedWorkspaceStore } = require('../dist/lib/workspace/store.js')
  const { XpodWorkspaceAdapter } = require('../dist/lib/workspace/xpod-workspace-adapter.js')
  const { AuthorizedWorkspaceModule } = require('../dist/lib/workspace/module.js')

  const store = new AuthorizedWorkspaceStore({ metadataDir, workspaceRoot })
  const adapter = new XpodWorkspaceAdapter({
    envPath,
    statusProvider: () => ({ running: true, baseUrl: 'http://localhost:5737/' }),
  })
  const module = new AuthorizedWorkspaceModule(store, adapter)

  const record = module.create({
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
    label: 'cli-session',
  })

  assert.equal(record.ownerKey, 'alice@example.com')
  assert.equal(record.podNames.length, 1)
  assert.equal(record.podNames[0], 'alice')
  assert.equal(module.list().length, 1)
  assert.equal(module.get(record.id)?.rootPath, record.rootPath)
  assert.equal(fs.existsSync(path.join(record.rootPath, 'files')), true)
})

test('AuthorizedWorkspaceModule rejects empty authorized workspace resolution', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-workspace-module-empty-'))
  const metadataDir = path.join(tempRoot, 'meta')
  const workspaceRoot = path.join(tempRoot, 'Linx Workspaces')
  const dataRoot = path.join(tempRoot, 'pod')
  fs.mkdirSync(path.join(dataRoot, 'alice'), { recursive: true })

  const envPath = path.join(tempRoot, '.env')
  fs.writeFileSync(envPath, [
    'CSS_BASE_URL=http://localhost:5737/',
    `CSS_ROOT_FILE_PATH=${dataRoot}`,
  ].join('\n'))

  const { AuthorizedWorkspaceStore } = require('../dist/lib/workspace/store.js')
  const { XpodWorkspaceAdapter } = require('../dist/lib/workspace/xpod-workspace-adapter.js')
  const { AuthorizedWorkspaceModule } = require('../dist/lib/workspace/module.js')

  const store = new AuthorizedWorkspaceStore({ metadataDir, workspaceRoot })
  const adapter = new XpodWorkspaceAdapter({
    envPath,
    statusProvider: () => ({ running: true, baseUrl: 'http://localhost:5737/' }),
  })
  const module = new AuthorizedWorkspaceModule(store, adapter)

  assert.throws(() => {
    module.create({
      ownerKey: 'bob@example.com',
      ownerWebId: 'http://localhost:5737/bob/profile/card#me',
    })
  }, /No authorized pod primitives were resolved/)
})

test('AuthorizedWorkspaceModule rejects caller identity that conflicts with local session', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-workspace-session-mismatch-'))
  const metadataDir = path.join(tempRoot, 'meta')
  const workspaceRoot = path.join(tempRoot, 'Linx Workspaces')
  const dataRoot = path.join(tempRoot, 'pod')
  fs.mkdirSync(path.join(dataRoot, 'alice'), { recursive: true })

  const envPath = path.join(tempRoot, '.env')
  fs.writeFileSync(envPath, [
    'CSS_BASE_URL=http://localhost:5737/',
    `CSS_ROOT_FILE_PATH=${dataRoot}`,
  ].join('\n'))

  const { AuthorizedWorkspaceStore } = require('../dist/lib/workspace/store.js')
  const { XpodWorkspaceAdapter } = require('../dist/lib/workspace/xpod-workspace-adapter.js')
  const { AuthorizedWorkspaceModule } = require('../dist/lib/workspace/module.js')

  const store = new AuthorizedWorkspaceStore({ metadataDir, workspaceRoot })
  const adapter = new XpodWorkspaceAdapter({
    envPath,
    statusProvider: () => ({ running: true, baseUrl: 'http://localhost:5737/' }),
  })
  const module = new AuthorizedWorkspaceModule(store, adapter, () => ({
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
  }))

  assert.throws(() => {
    module.create({
      ownerKey: 'mallory@example.com',
      ownerWebId: 'http://localhost:5737/alice/profile/card#me',
    })
  }, /ownerKey does not match the active Linx session/)
})

test('AuthorizedWorkspaceModule removes workspace files and store entry', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-workspace-remove-'))
  const metadataDir = path.join(tempRoot, 'meta')
  const workspaceRoot = path.join(tempRoot, 'Linx Workspaces')
  const dataRoot = path.join(tempRoot, 'pod')
  fs.mkdirSync(path.join(dataRoot, 'alice'), { recursive: true })

  const envPath = path.join(tempRoot, '.env')
  fs.writeFileSync(envPath, [
    'CSS_BASE_URL=http://localhost:5737/',
    `CSS_ROOT_FILE_PATH=${dataRoot}`,
  ].join('\n'))

  const { AuthorizedWorkspaceStore } = require('../dist/lib/workspace/store.js')
  const { XpodWorkspaceAdapter } = require('../dist/lib/workspace/xpod-workspace-adapter.js')
  const { AuthorizedWorkspaceModule } = require('../dist/lib/workspace/module.js')

  const store = new AuthorizedWorkspaceStore({ metadataDir, workspaceRoot })
  const adapter = new XpodWorkspaceAdapter({
    envPath,
    statusProvider: () => ({ running: true, baseUrl: 'http://localhost:5737/' }),
  })
  const module = new AuthorizedWorkspaceModule(store, adapter, () => ({
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
  }))

  const record = module.create({ label: 'remove-me' })
  assert.equal(fs.existsSync(record.rootPath), true)

  const removed = module.remove(record.id)
  assert.equal(removed.id, record.id)
  assert.equal(fs.existsSync(record.rootPath), false)
  assert.equal(module.get(record.id), null)
})

test('RuntimeThreadsModule provisions and stores mount metadata when owner identity is provided', async (t) => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-mount-home-'))
  const previousHome = process.env.HOME
  process.env.HOME = tempHome

  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './xpod-chatkit-runtime' || request.endsWith('/xpod-chatkit-runtime')) {
      return {
        XpodPtyRuntimeRunner: class FakeRunner {
          constructor() {}
          async start() { return {} }
          async pause() { return {} }
          async resume() { return {} }
          async stop() { return {} }
          async sendMessage() { return {} }
          async respondToToolCall() { return {} }
        },
      }
    }
    if (
      request === './workspace/module' ||
      request.endsWith('/workspace/module') ||
      request === './mount/module' ||
      request.endsWith('/mount/module')
    ) {
      return {
        getAuthorizedWorkspaceModule: () => ({
          peekOwnerContext: () => null,
          create: () => ({
            id: 'mount-1',
            rootPath: path.join(tempHome, 'Linx Mounts', 'alice', 'mount-1'),
          }),
        }),
        getPodMountModule: () => ({
          peekOwnerContext: () => null,
          listForCurrentOwner: () => [],
          create: () => ({
            id: 'mount-1',
            rootPath: path.join(tempHome, 'Linx Mounts', 'alice', 'mount-1'),
          }),
        }),
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
    if (previousHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = previousHome
    }
  })

  const runtimeThreadsPath = require.resolve('../dist/lib/runtime-threads.js')
  delete require.cache[runtimeThreadsPath]

  const { RuntimeThreadsModule } = require('../dist/lib/runtime-threads.js')
  const module = new RuntimeThreadsModule()
  const record = await module.createSession({
    threadId: 'thread-1',
    title: 'Mount Session',
    repoPath: tempHome,
    runnerType: 'mock',
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
  })

  assert.equal(record.workspace?.rootPath, path.join(tempHome, 'Linx Mounts', 'alice', 'mount-1'))
  assert.equal(record.ownerKey, 'alice@example.com')
  assert.equal(record.ownerWebId, 'http://localhost:5737/alice/profile/card#me')
  assert.equal(record.mountId, 'mount-1')
  assert.equal(record.mountPath, path.join(tempHome, 'Linx Mounts', 'alice', 'mount-1'))

  fs.mkdirSync(record.mountPath, { recursive: true })
  const started = await module.startSession(record.id)
  assert.equal(started.status, 'active')
  assert.match(module.getSessionLog(record.id), /Linx Mounts|Pod 挂载点/)
})

test('RuntimeThreadsModule can provision mount metadata from trusted local session context when owner is omitted', async (t) => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-mount-session-home-'))
  const previousHome = process.env.HOME
  process.env.HOME = tempHome

  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './xpod-chatkit-runtime' || request.endsWith('/xpod-chatkit-runtime')) {
      return {
        XpodPtyRuntimeRunner: class FakeRunner {
          constructor() {}
          async start() { return {} }
          async pause() { return {} }
          async resume() { return {} }
          async stop() { return {} }
          async sendMessage() { return {} }
          async respondToToolCall() { return {} }
        },
      }
    }
    if (
      request === './workspace/module' ||
      request.endsWith('/workspace/module') ||
      request === './mount/module' ||
      request.endsWith('/mount/module')
    ) {
      return {
        getAuthorizedWorkspaceModule: () => ({
          peekOwnerContext: () => ({
            ownerKey: 'alice@example.com',
            ownerWebId: 'http://localhost:5737/alice/profile/card#me',
          }),
          create: () => ({
            id: 'mount-2',
            rootPath: path.join(tempHome, 'Linx Mounts', 'alice', 'mount-2'),
          }),
        }),
        getPodMountModule: () => ({
          peekOwnerContext: () => ({
            ownerKey: 'alice@example.com',
            ownerWebId: 'http://localhost:5737/alice/profile/card#me',
          }),
          listForCurrentOwner: () => [],
          create: () => ({
            id: 'mount-2',
            rootPath: path.join(tempHome, 'Linx Mounts', 'alice', 'mount-2'),
          }),
        }),
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
    if (previousHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = previousHome
    }
  })

  const runtimeThreadsPath = require.resolve('../dist/lib/runtime-threads.js')
  delete require.cache[runtimeThreadsPath]

  const { RuntimeThreadsModule } = require('../dist/lib/runtime-threads.js')
  const module = new RuntimeThreadsModule()
  const record = await module.createSession({
    threadId: 'thread-2',
    title: 'Session Context Mount',
    repoPath: tempHome,
    runnerType: 'mock',
  })

  assert.equal(record.workspace?.rootPath, path.join(tempHome, 'Linx Mounts', 'alice', 'mount-2'))
  assert.equal(record.mountId, 'mount-2')
  assert.equal(record.mountPath, path.join(tempHome, 'Linx Mounts', 'alice', 'mount-2'))
})

test('RuntimeThreadsModule can provision a mount-backed path workspace from owner context', async (t) => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-workspace-first-pod-'))
  const previousHome = process.env.HOME
  process.env.HOME = tempHome

  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './xpod-chatkit-runtime' || request.endsWith('/xpod-chatkit-runtime')) {
      return {
        XpodPtyRuntimeRunner: class FakeRunner {
          constructor() {}
          async start() { return {} }
          async pause() { return {} }
          async resume() { return {} }
          async stop() { return {} }
          async sendMessage() { return {} }
          async respondToToolCall() { return {} }
        },
      }
    }
    if (
      request === './workspace/module' ||
      request.endsWith('/workspace/module') ||
      request === './mount/module' ||
      request.endsWith('/mount/module')
    ) {
      return {
        getAuthorizedWorkspaceModule: () => ({
          peekOwnerContext: () => null,
        }),
        getPodMountModule: () => ({
          peekOwnerContext: () => null,
          listForCurrentOwner: () => [],
          create: async () => ({
            id: 'mount-pod-1',
            rootPath: path.join(tempHome, 'Linx Mounts', 'alice', 'mount-pod-1'),
          }),
          release: () => {},
        }),
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
    if (previousHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = previousHome
    }
  })

  const runtimeThreadsPath = require.resolve('../dist/lib/runtime-threads.js')
  delete require.cache[runtimeThreadsPath]

  const { RuntimeThreadsModule } = require('../dist/lib/runtime-threads.js')
  const module = new RuntimeThreadsModule()
  const record = await module.createSession({
    threadId: 'thread-pod-workspace',
    title: 'Pod Workspace',
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
    runnerType: 'mock',
  })

  assert.equal(record.workspace?.rootPath, path.join(tempHome, 'Linx Mounts', 'alice', 'mount-pod-1'))
  assert.equal(record.mountId, 'mount-pod-1')
  assert.equal(record.mountPath, path.join(tempHome, 'Linx Mounts', 'alice', 'mount-pod-1'))
  assert.equal(record.repoPath, path.join(tempHome, 'Linx Mounts', 'alice', 'mount-pod-1'))
})

test('RuntimeThreadsModule accepts a workspace-first session input with git metadata', async () => {
  const { RuntimeThreadsModule } = require('../dist/lib/runtime-threads.js')
  const module = new RuntimeThreadsModule()
  const record = await module.createSession({
    threadId: 'thread-folder-workspace',
    title: 'Folder Workspace',
    workspace: {
      rootPath: '/repo/feature',
      scope: 'subfolder',
      capabilities: {
        git: true,
        writable: true,
      },
      git: {
        repoPath: '/repo',
        worktreePath: '/repo/feature',
        branch: 'feature/test',
        baseRef: 'main',
      },
    },
    runnerType: 'mock',
  })

  assert.equal(record.workspace?.rootPath, '/repo/feature')
  assert.equal(record.repoPath, '/repo')
  assert.equal(record.worktreePath, '/repo/feature')
  assert.equal(record.mountId, undefined)
  assert.equal(record.mountPath, undefined)
})

test('RuntimeThreadsModule infers current owner mount from workspace.path without explicit mount fields', async (t) => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-container-mount-infer-'))
  const previousHome = process.env.HOME
  process.env.HOME = tempHome

  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './xpod-chatkit-runtime' || request.endsWith('/xpod-chatkit-runtime')) {
      return {
        XpodPtyRuntimeRunner: class FakeRunner {
          constructor() {}
          async start() { return {} }
          async pause() { return {} }
          async resume() { return {} }
          async stop() { return {} }
          async sendMessage() { return {} }
          async respondToToolCall() { return {} }
        },
      }
    }
    if (
      request === './workspace/module' ||
      request.endsWith('/workspace/module') ||
      request === './mount/module' ||
      request.endsWith('/mount/module')
    ) {
      return {
        getAuthorizedWorkspaceModule: () => ({
          peekOwnerContext: () => null,
        }),
        getPodMountModule: () => ({
          peekOwnerContext: () => ({
            ownerKey: 'alice@example.com',
            ownerWebId: 'http://localhost:5737/alice/profile/card#me',
          }),
          listForCurrentOwner: () => [{
            id: 'mount-inferred-1',
            ownerKey: 'alice@example.com',
            ownerWebId: 'http://localhost:5737/alice/profile/card#me',
            rootPath: path.join(tempHome, 'Linx Mounts', 'alice', 'mount-inferred-1'),
          }],
          create: async () => {
            throw new Error('create should not be called when mount is inferred from workspace path')
          },
          release: () => {},
        }),
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
    if (previousHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = previousHome
    }
  })

  const runtimeThreadsPath = require.resolve('../dist/lib/runtime-threads.js')
  delete require.cache[runtimeThreadsPath]

  const { RuntimeThreadsModule } = require('../dist/lib/runtime-threads.js')
  const module = new RuntimeThreadsModule()
  const record = await module.createSession({
    threadId: 'thread-workspace-path',
    title: 'Workspace Path Session',
    workspace: {
      path: path.join(tempHome, 'Linx Mounts', 'alice', 'mount-inferred-1', 'project'),
      copy: true,
    },
    runnerType: 'mock',
  })

  assert.equal(record.mountId, 'mount-inferred-1')
  assert.equal(record.mountPath, path.join(tempHome, 'Linx Mounts', 'alice', 'mount-inferred-1'))
  assert.equal(record.ownerKey, 'alice@example.com')
  assert.equal(record.ownerWebId, 'http://localhost:5737/alice/profile/card#me')
  assert.equal(record.repoPath, path.join(tempHome, 'Linx Mounts', 'alice', 'mount-inferred-1', 'project'))
  assert.equal(record.worktreePath, path.join(tempHome, 'Linx Mounts', 'alice', 'mount-inferred-1', 'project'))
})

test('RuntimeThreadsModule derives git copy worktree metadata from workspace.path + copy', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-workspace-copy-'))
  const repoPath = path.join(tempRoot, 'repo')
  const workspacePath = path.join(repoPath, 'packages', 'app')
  fs.mkdirSync(path.join(repoPath, '.git'), { recursive: true })
  fs.mkdirSync(workspacePath, { recursive: true })

  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-workspace-copy-home-'))
  const previousHome = process.env.HOME
  process.env.HOME = tempHome

  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === './xpod-chatkit-runtime' || request.endsWith('/xpod-chatkit-runtime')) {
      return {
        XpodPtyRuntimeRunner: class FakeRunner {
          constructor() {}
          async start() { return {} }
          async pause() { return {} }
          async resume() { return {} }
          async stop() { return {} }
          async sendMessage() { return {} }
          async respondToToolCall() { return {} }
        },
      }
    }
    if (
      request === './workspace/module' ||
      request.endsWith('/workspace/module') ||
      request === './mount/module' ||
      request.endsWith('/mount/module')
    ) {
      return {
        getAuthorizedWorkspaceModule: () => ({
          peekOwnerContext: () => null,
        }),
        getPodMountModule: () => ({
          peekOwnerContext: () => null,
          listForCurrentOwner: () => [],
          create: async () => {
            throw new Error('mount creation should not run for local git workspace copy')
          },
          release: () => {},
        }),
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
    if (previousHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = previousHome
    }
  })

  const runtimeThreadsPath = require.resolve('../dist/lib/runtime-threads.js')
  delete require.cache[runtimeThreadsPath]

  const { RuntimeThreadsModule } = require('../dist/lib/runtime-threads.js')
  const module = new RuntimeThreadsModule()
  const record = await module.createSession({
    threadId: 'thread-workspace-copy',
    title: 'Workspace Copy Session',
    workspace: {
      path: workspacePath,
      copy: true,
    },
    runnerType: 'mock',
  })

  const expectedWorktreeRoot = path.join(tempHome, 'Library', 'Application Support', 'LinX', 'runtime-copies', record.id)
  const expectedWorkspacePath = path.join(expectedWorktreeRoot, 'packages', 'app')

  assert.equal(record.repoPath, repoPath)
  assert.equal(record.worktreePath, expectedWorktreeRoot)
  assert.equal(record.workspace?.rootPath, expectedWorkspacePath)
  assert.equal(record.workspace?.git?.repoPath, repoPath)
  assert.equal(record.workspace?.git?.worktreePath, expectedWorktreeRoot)
})

test('XpodPtyRuntimeRunner preserves git worktree provisioning for workspace-first sessions with git metadata', async (t) => {
  const calls = {
    assertGitRepo: null,
    createWorktree: null,
    ensureStartedConfig: null,
  }
  const repoPath = '/tmp/linx-repo'
  const worktreePath = '/tmp/linx-repo-worktree-missing'
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (typeof request === 'string' && request.endsWith('PtyThreadRuntime.js')) {
      return {
        PtyThreadRuntime: class FakePtyThreadRuntime {
          async ensureStarted(_threadId, cfg) {
            calls.ensureStartedConfig = cfg
          }
          stop() {}
          async *sendMessage() {}
          async *respondToRequest() {}
        },
      }
    }

    if (typeof request === 'string' && request.endsWith('GitWorktreeService.js')) {
      return {
        GitWorktreeService: class FakeGitWorktreeService {
          async assertGitRepo(repoPath) {
            calls.assertGitRepo = repoPath
          }
          async createWorktree(options) {
            calls.createWorktree = options
          }
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  t.after(() => {
    Module._load = originalLoad
  })

  const runnerPath = require.resolve('../dist/lib/xpod-chatkit-runtime.js')
  delete require.cache[runnerPath]
  const { XpodPtyRuntimeRunner } = require('../dist/lib/xpod-chatkit-runtime.js')

  const record = {
    id: 'thread-git-workspace',
    threadId: 'chat-thread-git-workspace',
    title: 'Git Workspace Session',
    workspace: {
      rootPath: worktreePath,
      scope: 'subfolder',
      capabilities: {
        git: true,
      },
      git: {
        repoPath,
        worktreePath,
        branch: 'feature/test',
        baseRef: 'main',
      },
    },
    repoPath,
    worktreePath,
    runnerType: 'xpod-pty',
    tool: 'codex',
    status: 'idle',
    tokenUsage: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    baseRef: 'main',
    branch: 'feature/test',
  }

  const host = {
    getRecord: () => record,
    updateRecord: (updates) => {
      Object.assign(record, updates)
      return record
    },
    emitEvent: () => {},
  }

  const runner = new XpodPtyRuntimeRunner(host)
  await runner.start()

  assert.equal(calls.assertGitRepo, repoPath)
  assert.deepEqual(calls.createWorktree, {
    repoPath,
    worktreePath,
    baseRef: 'main',
    branch: 'feature/test',
  })
  assert.equal(calls.ensureStartedConfig.workspace.type, 'git')
  assert.equal(calls.ensureStartedConfig.workspace.rootPath, repoPath)
})

test('Mock runtime path semantics prefer mountPath in emitted assistant output', async () => {
  const { MockRuntimeRunner } = require('../dist/lib/runtime-runner-mock.js')

  const events = []
  const record = {
    id: 'thread-1',
    threadId: 'chat-thread-1',
    title: 'Mount Session',
    repoPath: '/repo',
    worktreePath: '/repo',
    mountId: 'mount-1',
    mountPath: '/Volumes/Linx/alice',
    runnerType: 'mock',
    tool: 'mock',
    status: 'idle',
    tokenUsage: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  }

  const host = {
    getRecord: () => record,
    updateRecord: (updates) => {
      Object.assign(record, updates)
      return record
    },
    emitEvent: (event) => {
      events.push(event)
    },
  }

  const runner = new MockRuntimeRunner(host)
  await runner.start()
  await runner.sendMessage('inspect mount')
  for (let index = 0; index < 40; index += 1) {
    if (events.some((event) => event.type === 'assistant_done')) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  const meta = events.find((event) => event.type === 'meta')
  const done = events.find((event) => event.type === 'assistant_done')

  assert.equal(meta.workdir, '/Volumes/Linx/alice')
  assert.match(done.text, /当前 Pod 挂载点：\/Volumes\/Linx\/alice/)
})

test('Mock runtime path semantics prefer workspace.rootPath when provided', async () => {
  const { MockRuntimeRunner } = require('../dist/lib/runtime-runner-mock.js')

  const events = []
  const record = {
    id: 'thread-2',
    threadId: 'chat-thread-2',
    title: 'Folder Workspace Session',
    workspace: {
      rootPath: '/repo/feature',
    },
    repoPath: '/repo',
    worktreePath: '/repo/feature',
    runnerType: 'mock',
    tool: 'mock',
    status: 'idle',
    tokenUsage: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  }

  const host = {
    getRecord: () => record,
    updateRecord: (updates) => {
      Object.assign(record, updates)
      return record
    },
    emitEvent: (event) => {
      events.push(event)
    },
  }

  const runner = new MockRuntimeRunner(host)
  await runner.start()
  await runner.sendMessage('inspect workspace')
  for (let index = 0; index < 40; index += 1) {
    if (events.some((event) => event.type === 'assistant_done')) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  const meta = events.find((event) => event.type === 'meta')
  const done = events.find((event) => event.type === 'assistant_done')

  assert.equal(meta.workdir, '/repo/feature')
  assert.match(done.text, /当前 workspace 根：\/repo\/feature/)
})

test('AuthorizedWorkspaceModule can default owner context from a local session provider', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-workspace-session-context-'))
  const metadataDir = path.join(tempRoot, 'meta')
  const workspaceRoot = path.join(tempRoot, 'Linx Workspaces')
  const dataRoot = path.join(tempRoot, 'pod')
  fs.mkdirSync(path.join(dataRoot, 'alice'), { recursive: true })

  const envPath = path.join(tempRoot, '.env')
  fs.writeFileSync(envPath, [
    'CSS_BASE_URL=http://localhost:5737/',
    `CSS_ROOT_FILE_PATH=${dataRoot}`,
  ].join('\n'))

  const { AuthorizedWorkspaceStore } = require('../dist/lib/workspace/store.js')
  const { XpodWorkspaceAdapter } = require('../dist/lib/workspace/xpod-workspace-adapter.js')
  const { AuthorizedWorkspaceModule } = require('../dist/lib/workspace/module.js')

  const store = new AuthorizedWorkspaceStore({ metadataDir, workspaceRoot })
  const adapter = new XpodWorkspaceAdapter({
    envPath,
    statusProvider: () => ({ running: true, baseUrl: 'http://localhost:5737/' }),
  })
  const module = new AuthorizedWorkspaceModule(store, adapter, () => ({
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
  }))

  const record = module.create({ label: 'session-defaults' })

  assert.equal(record.ownerKey, 'alice@example.com')
  assert.equal(record.ownerWebId, 'http://localhost:5737/alice/profile/card#me')
  assert.equal(record.podNames[0], 'alice')
})

test('AuthorizedWorkspaceModule reuses the latest current workspace for the active owner', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-workspace-current-reuse-'))
  const metadataDir = path.join(tempRoot, 'meta')
  const workspaceRoot = path.join(tempRoot, 'Linx Workspaces')
  const dataRoot = path.join(tempRoot, 'pod')
  fs.mkdirSync(path.join(dataRoot, 'alice'), { recursive: true })

  const envPath = path.join(tempRoot, '.env')
  fs.writeFileSync(envPath, [
    'CSS_BASE_URL=http://localhost:5737/',
    `CSS_ROOT_FILE_PATH=${dataRoot}`,
  ].join('\n'))

  const { AuthorizedWorkspaceStore } = require('../dist/lib/workspace/store.js')
  const { XpodWorkspaceAdapter } = require('../dist/lib/workspace/xpod-workspace-adapter.js')
  const { AuthorizedWorkspaceModule } = require('../dist/lib/workspace/module.js')

  const store = new AuthorizedWorkspaceStore({ metadataDir, workspaceRoot })
  const adapter = new XpodWorkspaceAdapter({
    envPath,
    statusProvider: () => ({ running: true, baseUrl: 'http://localhost:5737/' }),
  })
  const sessionProvider = () => ({
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
  })
  const module = new AuthorizedWorkspaceModule(store, adapter, sessionProvider)

  const first = module.ensureCurrent({ label: 'current-workspace' })
  const second = module.ensureCurrent({ label: 'current-workspace' })

  assert.equal(first.id, second.id)
  assert.equal(first.rootPath, second.rootPath)
})

test('AuthorizedWorkspaceModule scopes list/get/remove to the current owner', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-workspace-scope-owner-'))
  const metadataDir = path.join(tempRoot, 'meta')
  const workspaceRoot = path.join(tempRoot, 'Linx Workspaces')
  const dataRoot = path.join(tempRoot, 'pod')
  fs.mkdirSync(path.join(dataRoot, 'alice'), { recursive: true })
  fs.mkdirSync(path.join(dataRoot, 'bob'), { recursive: true })

  const envPath = path.join(tempRoot, '.env')
  fs.writeFileSync(envPath, [
    'CSS_BASE_URL=http://localhost:5737/',
    `CSS_ROOT_FILE_PATH=${dataRoot}`,
  ].join('\n'))

  const { AuthorizedWorkspaceStore } = require('../dist/lib/workspace/store.js')
  const { XpodWorkspaceAdapter } = require('../dist/lib/workspace/xpod-workspace-adapter.js')
  const { AuthorizedWorkspaceModule } = require('../dist/lib/workspace/module.js')

  const store = new AuthorizedWorkspaceStore({ metadataDir, workspaceRoot })
  const adapter = new XpodWorkspaceAdapter({
    envPath,
    statusProvider: () => ({ running: true, baseUrl: 'http://localhost:5737/' }),
  })

  const aliceModule = new AuthorizedWorkspaceModule(store, adapter, () => ({
    ownerKey: 'alice@example.com',
    ownerWebId: 'http://localhost:5737/alice/profile/card#me',
  }))

  const bobModule = new AuthorizedWorkspaceModule(store, adapter, () => ({
    ownerKey: 'bob@example.com',
    ownerWebId: 'http://localhost:5737/bob/profile/card#me',
  }))

  const aliceRecord = aliceModule.create({ label: 'alice-space' })
  const bobRecord = bobModule.create({ label: 'bob-space' })

  assert.equal(aliceModule.listForCurrentOwner().length, 1)
  assert.equal(aliceModule.listForCurrentOwner()[0].id, aliceRecord.id)
  assert.equal(aliceModule.getForCurrentOwner(aliceRecord.id)?.id, aliceRecord.id)
  assert.equal(aliceModule.getForCurrentOwner(bobRecord.id), null)
  assert.throws(() => aliceModule.removeForCurrentOwner(bobRecord.id), /Workspace not found for current owner/)

  const removed = bobModule.removeForCurrentOwner(bobRecord.id)
  assert.equal(removed.id, bobRecord.id)
  assert.equal(bobModule.getForCurrentOwner(bobRecord.id), null)
})
