const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { pathToFileURL } = require('node:url')
const { resolveCompiledServiceModule } = require('./helpers.cjs')

function withElectronUserData(t, options = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-workspace-'))
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => tmpDir,
          getName: () => 'LinX Service Runtime Test',
        },
      }
    }
    if (options.acpModule && String(request).endsWith('/AcpAgentRuntime.js')) {
      return options.acpModule
    }
    if (options.gitModule && String(request).endsWith('/GitWorktreeService.js')) {
      return options.gitModule
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  t.after(() => {
    Module._load = originalLoad
    fs.rmSync(tmpDir, { recursive: true, force: true })
    for (const relative of [
      'lib/runtime-threads.js',
      'lib/runtime-runner.js',
      'lib/runtime-runner-mock.js',
      'lib/runtime-workspace.js',
      'lib/xpod-chatkit-runtime.js',
      'lib/linx-paths.js',
    ]) {
      const modulePath = resolveCompiledServiceModule(relative)
      delete require.cache[require.resolve(modulePath)]
    }
  })
  return tmpDir
}

function loadRuntimeModules(t, options = {}) {
  withElectronUserData(t, options)
  const runtimeThreadsPath = resolveCompiledServiceModule('lib/runtime-threads.js')
  const runtimeWorkspacePath = resolveCompiledServiceModule('lib/runtime-workspace.js')
  const xpodRuntimePath = resolveCompiledServiceModule('lib/xpod-chatkit-runtime.js')
  delete require.cache[require.resolve(runtimeThreadsPath)]
  delete require.cache[require.resolve(runtimeWorkspacePath)]
  delete require.cache[require.resolve(xpodRuntimePath)]
  return {
    ...require(runtimeThreadsPath),
    workspace: require(runtimeWorkspacePath),
  }
}

function makeGitRepo(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-repo-'))
  const { execFileSync } = require('node:child_process')
  execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repo, stdio: 'ignore' })
  fs.writeFileSync(path.join(repo, 'README.md'), '# runtime repo\n')
  execFileSync('git', ['add', 'README.md'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, stdio: 'ignore' })
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  return repo
}

test('runtime sessions support local folder, local worktree, and Pod container workspaces', async (t) => {
  const { RuntimeThreadsModule } = loadRuntimeModules(t)
  const runtime = new RuntimeThreadsModule()

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-folder-'))
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }))
  const localFolder = runtime.createSession({
    threadId: 'thread-local-folder',
    title: 'Local folder',
    repoPath: folder,
    runnerType: 'mock',
    tool: 'mock',
  })
  assert.equal(localFolder.workspaceKind, 'local-folder')
  assert.equal(localFolder.repoPath, path.resolve(folder))
  assert.equal(localFolder.folderPath, path.resolve(folder))
  assert.equal((await runtime.startSession(localFolder.id)).status, 'active')
  const afterRuntimeMessage = await runtime.sendSessionMessage(localFolder.id, 'hello runtime')
  assert.equal(afterRuntimeMessage.metadata.reconciler.latest.eventType, 'message.appended')
  assert.equal(afterRuntimeMessage.metadata.reconciler.latest.wakeJobs[0].targetRole, 'primary-agent')
  assert.equal(afterRuntimeMessage.reconciler.latest.id, afterRuntimeMessage.metadata.reconciler.latest.id)

  const repo = makeGitRepo(t)
  const worktree = path.join(os.tmpdir(), `linx-runtime-worktree-${Date.now()}`)
  t.after(() => fs.rmSync(worktree, { recursive: true, force: true }))
  const localWorktree = runtime.createSession({
    threadId: 'thread-local-worktree',
    title: 'Local worktree',
    repoPath: repo,
    folderPath: worktree,
    runnerType: 'mock',
    tool: 'mock',
  })
  assert.equal(localWorktree.workspaceKind, 'local-worktree')
  assert.equal(localWorktree.repoPath, path.resolve(repo))
  assert.equal(localWorktree.folderPath, path.resolve(worktree))
  assert.equal((await runtime.startSession(localWorktree.id)).status, 'active')

  const podRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-pod-'))
  t.after(() => fs.rmSync(podRoot, { recursive: true, force: true }))
  process.env.CSS_ROOT_FILE_PATH = podRoot
  process.env.CSS_BASE_URL = 'https://node-0000.undefineds.co/'
  t.after(() => {
    delete process.env.CSS_ROOT_FILE_PATH
    delete process.env.CSS_BASE_URL
  })
  const podContainer = 'https://node-0000.undefineds.co/.data/workspaces/thread-pod/'
  const podSession = runtime.createSession({
    threadId: 'thread-pod',
    container: podContainer,
    workspaceKind: 'pod-container',
    title: 'Pod workspace',
    runnerType: 'mock',
    tool: 'mock',
  })
  assert.equal(podSession.workspaceKind, 'pod-container')
  assert.equal(podSession.container, podContainer)
  assert.equal(podSession.repoPath, undefined)
  assert.equal(podSession.folderPath, undefined)
  assert.equal((await runtime.startSession(podSession.id)).status, 'active')
})

test('an idle runtime session can be reconfigured after workspace startup fails', (t) => {
  const { RuntimeThreadsModule } = loadRuntimeModules(t)
  const runtime = new RuntimeThreadsModule()
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-retry-'))
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }))

  const first = runtime.createSession({
    threadId: 'thread-runtime-retry',
    container: 'https://pod.example/.data/workspaces/retry/',
    workspaceKind: 'pod-container',
    title: 'Retry runtime',
    runnerType: 'xpod-pty',
    tool: 'codex',
  })
  const retried = runtime.createSession({
    threadId: first.threadId,
    title: first.title,
    repoPath: folder,
    folderPath: folder,
    runnerType: 'mock',
    tool: 'mock',
  })

  assert.equal(retried.id, first.id)
  assert.equal(retried.workspaceKind, 'local-folder')
  assert.equal(retried.container, undefined)
  assert.equal(retried.folderPath, path.resolve(folder))
  assert.equal(retried.runnerType, 'mock')
})



test('xpod-pty runtime session startup prepares local folder, worktree, and Pod workspace directories', async (t) => {
  class FakeAcpAgentRuntime {
    async *run() {}
  }
  const { execFileSync } = require('node:child_process')
  const { RuntimeThreadsModule, workspace } = loadRuntimeModules(t, {
    acpModule: { AcpAgentRuntime: FakeAcpAgentRuntime },
    gitModule: {
      GitWorktreeService: class {
        async assertGitRepo() {}
        async createWorktree(options) {
          execFileSync('git', ['worktree', 'add', '-b', options.branch || `linx-test-${Date.now()}`, options.worktreePath, options.baseRef || 'HEAD'], {
            cwd: options.repoPath,
            stdio: 'ignore',
          })
        }
      },
    },
  })
  const runtime = new RuntimeThreadsModule()

  const localFolder = path.join(os.tmpdir(), `linx-xpod-local-folder-${Date.now()}`)
  t.after(() => fs.rmSync(localFolder, { recursive: true, force: true }))
  const folderSession = runtime.createSession({
    threadId: 'thread-xpod-folder',
    title: 'xpod local folder',
    repoPath: localFolder,
    runnerType: 'xpod-pty',
    tool: 'codex',
  })
  assert.equal((await runtime.startSession(folderSession.id)).status, 'active')
  assert.equal(fs.statSync(localFolder).isDirectory(), true)

  const repo = makeGitRepo(t)
  const worktree = path.join(os.tmpdir(), `linx-xpod-worktree-${Date.now()}`)
  t.after(() => fs.rmSync(worktree, { recursive: true, force: true }))
  const worktreeSession = runtime.createSession({
    threadId: 'thread-xpod-worktree',
    title: 'xpod worktree',
    repoPath: repo,
    folderPath: worktree,
    baseRef: 'HEAD',
    branch: `linx-test-${Date.now()}`,
    runnerType: 'xpod-pty',
    tool: 'codex',
  })
  assert.equal((await runtime.startSession(worktreeSession.id)).status, 'active')
  assert.equal(fs.statSync(path.join(worktree, '.git')).isFile(), true)
  assert.equal(fs.readFileSync(path.join(worktree, 'README.md'), 'utf8'), '# runtime repo\n')

  const podRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-pod-root-'))
  t.after(() => fs.rmSync(podRoot, { recursive: true, force: true }))
  process.env.CSS_ROOT_FILE_PATH = podRoot
  process.env.CSS_BASE_URL = 'https://node-0000.undefineds.co/'
  t.after(() => {
    delete process.env.CSS_ROOT_FILE_PATH
    delete process.env.CSS_BASE_URL
  })

  const podContainer = 'https://node-0000.undefineds.co/.data/workspaces/thread-xpod-pod/'
  const podSession = runtime.createSession({
    threadId: 'thread-xpod-pod',
    container: podContainer,
    workspaceKind: 'pod-container',
    title: 'xpod Pod workspace',
    runnerType: 'xpod-pty',
    tool: 'codex',
  })
  assert.equal((await runtime.startSession(podSession.id)).status, 'active')
  const podWorkdir = workspace.resolveRuntimeThreadWorkdir(podSession)
  assert.equal(podWorkdir, path.join(podRoot, '.data', 'workspaces', 'thread-xpod-pod'))
  fs.mkdirSync(path.join(podWorkdir, 'fs-check'), { recursive: true })
  fs.writeFileSync(path.join(podWorkdir, 'fs-check', 'write.txt'), 'pod fs write ok\n')
  assert.equal(fs.readFileSync(path.join(podWorkdir, 'fs-check', 'write.txt'), 'utf8'), 'pod fs write ok\n')
  assert.deepEqual(fs.readdirSync(path.join(podWorkdir, 'fs-check')), ['write.txt'])
})



test('Pod workspace runtime message can perform filesystem write and list through the session cwd', async (t) => {
  const acpCalls = []
  class FakeAcpAgentRuntime {
    async *run(input) {
      acpCalls.push(input)
      const workspaceUrl = new URL(input.config.workspace)
      const cwd = decodeURIComponent(workspaceUrl.pathname)
      const dir = path.join(cwd, 'runtime-fs')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'from-session.txt'), 'written by runtime\n')
      yield { type: 'text', text: `fs:${fs.readdirSync(dir).join(',')}` }
    }
  }

  const { RuntimeThreadsModule, workspace } = loadRuntimeModules(t, {
    acpModule: { AcpAgentRuntime: FakeAcpAgentRuntime },
    gitModule: {
      GitWorktreeService: class {
        async assertGitRepo() {}
        async createWorktree() {}
      },
    },
  })

  const podRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-pod-message-'))
  t.after(() => fs.rmSync(podRoot, { recursive: true, force: true }))
  process.env.CSS_ROOT_FILE_PATH = podRoot
  process.env.CSS_BASE_URL = 'https://node-0000.undefineds.co/'
  t.after(() => {
    delete process.env.CSS_ROOT_FILE_PATH
    delete process.env.CSS_BASE_URL
  })

  const runtime = new RuntimeThreadsModule()
  const session = runtime.createSession({
    threadId: 'thread-pod-message',
    container: 'https://node-0000.undefineds.co/.data/workspaces/thread-pod-message/',
    workspaceKind: 'pod-container',
    title: 'Pod message fs',
    runnerType: 'xpod-pty',
    tool: 'codex',
  })
  await runtime.startSession(session.id)
  const done = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for assistant_done')), 1000)
    const unsubscribe = runtime.subscribeSession(session.id, (event) => {
      if (event.type === 'assistant_done') {
        clearTimeout(timeout)
        unsubscribe()
        resolve(event)
      }
    })
  })
  await runtime.sendSessionMessage(session.id, 'write and list')
  const event = await done
  assert.equal(event.text, 'fs:from-session.txt')
  const workdir = workspace.resolveRuntimeThreadWorkdir(session)
  assert.equal(fs.readFileSync(path.join(workdir, 'runtime-fs', 'from-session.txt'), 'utf8'), 'written by runtime\n')
  assert.equal(acpCalls[0].config.workspace, workspace.runtimeThreadWorkspaceFileUrl(session))
})

test('Pod workspace resolves to the server-side Pod container path for filesystem operations', async (t) => {
  const { workspace } = loadRuntimeModules(t)
  const podRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-pod-fs-'))
  t.after(() => fs.rmSync(podRoot, { recursive: true, force: true }))
  process.env.CSS_ROOT_FILE_PATH = podRoot
  process.env.CSS_BASE_URL = 'https://node-0000.undefineds.co/'
  t.after(() => {
    delete process.env.CSS_ROOT_FILE_PATH
    delete process.env.CSS_BASE_URL
  })

  const record = {
    id: 'session-pod-fs',
    threadId: 'thread-pod-fs',
    container: 'https://node-0000.undefineds.co/.data/workspaces/thread-pod-fs/',
    workspaceKind: 'pod-container',
    title: 'Pod FS',
    runnerType: 'mock',
    tool: 'mock',
    status: 'idle',
    tokenUsage: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  }

  const workdir = workspace.resolveRuntimeThreadWorkdir(record, { ensure: true })
  assert.equal(workdir, path.join(podRoot, '.data', 'workspaces', 'thread-pod-fs'))
  assert.equal(workspace.runtimeThreadWorkspaceFileUrl(record), pathToFileURL(workdir).href)

  const file = path.join(workdir, 'notes', 'hello.txt')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, 'hello from pod workspace\n')
  assert.equal(fs.readFileSync(file, 'utf8'), 'hello from pod workspace\n')
  assert.deepEqual(fs.readdirSync(path.join(workdir, 'notes')), ['hello.txt'])
})

test('Pod workspace refuses to resolve containers outside this xpod origin', (t) => {
  const { workspace } = loadRuntimeModules(t)
  const podRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-runtime-pod-guard-'))
  t.after(() => fs.rmSync(podRoot, { recursive: true, force: true }))
  process.env.CSS_ROOT_FILE_PATH = podRoot
  process.env.CSS_BASE_URL = 'https://node-0000.undefineds.co/'
  t.after(() => {
    delete process.env.CSS_ROOT_FILE_PATH
    delete process.env.CSS_BASE_URL
  })

  assert.throws(
    () => workspace.mapPodContainerToLocalPath('https://id.undefineds.co/gcloud/.data/workspaces/thread/'),
    /not served by this xpod origin/,
  )
})
