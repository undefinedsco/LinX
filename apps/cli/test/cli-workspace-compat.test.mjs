import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

async function withWorkspaceCompatModules(t) {
  const root = mkdtempSync(join(tmpdir(), 'linx-cli-workspace-compat-'))
  const workspace = join(root, 'workspace')
  const otherWorkspace = join(root, 'other-workspace')
  const home = join(root, 'home')
  const agentDir = join(home, '.linx', 'agent')
  const autoModeHome = join(home, '.linx', 'auto-mode')

  const originalHome = process.env.HOME
  const originalAutoModeHome = process.env.LINX_AUTO_MODE_HOME
  process.env.HOME = home
  process.env.LINX_AUTO_MODE_HOME = autoModeHome

  t.after(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    if (originalAutoModeHome === undefined) {
      delete process.env.LINX_AUTO_MODE_HOME
    } else {
      process.env.LINX_AUTO_MODE_HOME = originalAutoModeHome
    }
    rmSync(root, { recursive: true, force: true })
  })

  const [
    piLoaded,
    autoArchiveLoaded,
    symphonyLoaded,
  ] = await Promise.all([
    loadAutoModeModule('lib/linx-session-manager.ts'),
    loadAutoModeModule('lib/auto-mode/archive.ts'),
    loadAutoModeModule('lib/symphony-command.ts'),
  ])

  t.after(() => {
    piLoaded.cleanup()
    autoArchiveLoaded.cleanup()
    symphonyLoaded.cleanup()
  })

  return {
    workspace,
    otherWorkspace,
    agentDir,
    pi: piLoaded.module,
    autoArchive: autoArchiveLoaded.module,
    symphony: symphonyLoaded.module,
  }
}

test('CLI normal, auto, and symphony modes coexist under the same workspace without conflating sessions', async (t) => {
  const {
    workspace,
    otherWorkspace,
    agentDir,
    pi,
    autoArchive,
    symphony,
  } = await withWorkspaceCompatModules(t)

  const piSession = await pi.createLinxPiSessionManager({ cwd: workspace, agentDir })
  piSession.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'normal mode prompt' }],
    timestamp: Date.now(),
  })
  // Pi only flushes a new session file after the first assistant message.
  // This mirrors a real completed normal-mode turn rather than a draft-only session.
  piSession.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'normal mode reply' }],
    api: 'openai-completions',
    provider: 'undefineds',
    model: 'linx-lite',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  })

  const listedPiSessions = await pi.listLinxPiSessions(workspace, agentDir)
  assert.equal(listedPiSessions.length, 1)
  assert.equal(listedPiSessions[0].id, piSession.getSessionId())
  assert.equal(listedPiSessions[0].cwd, workspace)

  const otherWorkspacePiSessions = await pi.listLinxPiSessions(otherWorkspace, agentDir)
  assert.equal(otherWorkspacePiSessions.length, 0)

  const autoSession = autoArchive.createAutoModeSession({
    backend: 'codex',
    mode: 'manual',
    cwd: workspace,
    plain: true,
    passthroughArgs: [],
  }, {
    command: 'codex-acp',
    args: [],
  })
  autoArchive.finishAutoModeSession(autoSession, { status: 'completed', exitCode: 0 })

  const fakeRuntime = {
    runAutoMode(options) {
      assert.equal(options.cwd, workspace)
      assert.equal(options.goalMode, true)
      const record = autoArchive.createAutoModeSession({
        ...options,
        passthroughArgs: options.passthroughArgs ?? [],
      }, {
        command: 'codex-acp',
        args: [],
      })
      autoArchive.finishAutoModeSession(record, { status: 'completed', exitCode: 0 })
      return Promise.resolve(0)
    },
    listAutoModeSessions() {
      return autoArchive.listAutoModeSessions()
    },
  }

  const plan = await symphony.runSymphony({
    objective: ['delegate from same workspace'],
    backend: 'codex',
    auto: true,
    cwd: workspace,
    plain: true,
  }, fakeRuntime)

  assert.equal(plan.session.cwd, workspace)
  assert.equal(plan.session.status, 'completed')
  assert.equal(plan.delivery.status, 'completed')
  assert.ok(plan.session.autoModeSessionId)
  assert.notEqual(plan.session.autoModeSessionId, autoSession.id)

  const archivedAutoSessions = autoArchive.listAutoModeSessions()
  assert.equal(archivedAutoSessions.length, 2)
  assert.deepEqual(new Set(archivedAutoSessions.map((record) => record.cwd)), new Set([workspace]))
  assert.ok(archivedAutoSessions.some((record) => record.id === autoSession.id && record.status === 'completed'))
  assert.ok(archivedAutoSessions.some((record) => record.id === plan.session.autoModeSessionId && record.goalMode === true))

  const listedAfterAutoAndSymphony = await pi.listLinxPiSessions(workspace, agentDir)
  assert.equal(listedAfterAutoAndSymphony.length, 1)
  assert.equal(listedAfterAutoAndSymphony[0].id, piSession.getSessionId())
})
