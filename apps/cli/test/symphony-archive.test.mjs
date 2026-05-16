import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('symphony archive creates, updates, lists, and resolves records', async (t) => {
  const originalHome = process.env.HOME
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-home-'))
  process.env.HOME = root
  const symphonyHome = join(root, '.linx', 'symphony')

  t.after(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    rmSync(root, { recursive: true, force: true })
  })

  const { module, cleanup } = await loadAutoModeModule('lib/symphony/archive.ts')
  t.after(() => cleanup())

  const {
    createArchivedLinxSymphonyRunPlan,
    listLinxSymphonyDeliveries,
    listLinxSymphonySessions,
    listLinxSymphonyTasks,
    loadLinxSymphonyDelivery,
    loadLinxSymphonySession,
    loadLinxSymphonyTask,
    resolveLinxSymphonyRecord,
    updateLinxSymphonyDeliveryStatus,
    updateLinxSymphonySessionStatus,
    updateLinxSymphonyTaskStatus,
  } = module

  const plan = createArchivedLinxSymphonyRunPlan({
    objective: 'verify symphony archive',
    acceptanceCriteria: ['task exists', 'session is loadable'],
    workspacePath: '/tmp/linx',
    workspaceKind: 'git',
    repository: 'https://github.com/undefineds/linx.git',
    branch: 'main',
    worktree: '/tmp/linx-worktree',
    backend: 'codex',
    mode: 'auto',
    now: new Date('2026-04-02T00:00:00.000Z'),
    randomId: 'archive',
  })

  const task = updateLinxSymphonyTaskStatus(plan.task, 'running')
  const delivery = updateLinxSymphonyDeliveryStatus(plan.delivery, 'dispatched')
  const session = updateLinxSymphonySessionStatus(plan.session, 'running', { dryRun: false })

  assert.equal(task.status, 'running')
  assert.equal(delivery.status, 'dispatched')
  assert.equal(session.status, 'running')
  assert.equal(session.dryRun, false)

  assert.equal(listLinxSymphonyTasks().length, 1)
  assert.equal(listLinxSymphonyDeliveries().length, 1)
  assert.equal(listLinxSymphonySessions().length, 1)
  assert.equal(loadLinxSymphonyTask(plan.task.id)?.id, plan.task.id)
  assert.equal(loadLinxSymphonyDelivery(plan.delivery.id.slice(0, 24))?.id, plan.delivery.id)
  assert.equal(loadLinxSymphonySession(plan.session.id)?.id, plan.session.id)

  const resolved = resolveLinxSymphonyRecord(plan.task.id.slice(0, 20))
  assert.equal(resolved?.kind, 'task')
  assert.equal(resolved?.record.id, plan.task.id)

  const taskFile = readFileSync(join(symphonyHome, 'tasks', plan.task.id, 'task.json'), 'utf-8')
  const deliveryFile = readFileSync(join(symphonyHome, 'deliveries', plan.delivery.id, 'delivery.json'), 'utf-8')
  const sessionFile = readFileSync(join(symphonyHome, 'sessions', plan.session.id, 'session.json'), 'utf-8')
  assert.match(taskFile, /verify symphony archive/)
  assert.match(deliveryFile, /task_dispatch/)
  assert.match(sessionFile, /"status": "running"/)
})

test('symphony archive ignores legacy worker overrides and defaults under ~/.linx/symphony', async (t) => {
  const originalHome = process.env.HOME
  const tempHome = mkdtempSync(join(tmpdir(), 'linx-symphony-home-'))
  const legacyHome = mkdtempSync(join(tmpdir(), 'linx-worker-legacy-'))
  process.env.HOME = tempHome
  process.env.LINX_WORKER_HOME = legacyHome

  t.after(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    delete process.env.LINX_WORKER_HOME
    rmSync(tempHome, { recursive: true, force: true })
    rmSync(legacyHome, { recursive: true, force: true })
  })

  const { module, cleanup } = await loadAutoModeModule('lib/symphony/archive.ts')
  t.after(() => cleanup())

  const { createArchivedLinxSymphonyRunPlan, getLinxSymphonyHome } = module
  const plan = createArchivedLinxSymphonyRunPlan({
    objective: 'default home check',
    workspacePath: '/tmp/linx',
    backend: 'claude',
    mode: 'manual',
    randomId: 'home',
  })

  assert.equal(getLinxSymphonyHome().startsWith(legacyHome), false)
  assert.equal(getLinxSymphonyHome(), join(tempHome, '.linx', 'symphony'))
  assert.equal(plan.task.id.startsWith('sym_task_'), true)
})

test('symphony run bridges non-dry-run plans into the auto-mode runtime and records completion', async (t) => {
  const originalHome = process.env.HOME
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-run-home-'))
  process.env.HOME = root

  t.after(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    rmSync(root, { recursive: true, force: true })
  })

  const { module, cleanup } = await loadAutoModeModule('lib/symphony-command.ts')
  t.after(() => cleanup())

  const runCalls = []
  let autoSessions = []
  const plan = await module.runLinxSymphony({
    objective: ['bridge', 'runtime'],
    backend: 'codex',
    auto: true,
    cwd: '/tmp/linx',
    acceptance: ['runtime called'],
    model: 'gpt-5.5',
  }, {
    async runAutoMode(options) {
      runCalls.push(options)
      autoSessions = [{
        id: 'auto_bridge_123',
        backend: 'codex',
        runtime: 'local',
        transport: 'acp',
        mode: 'auto',
        cwd: '/tmp/linx',
        passthroughArgs: [],
        credentialSource: 'cloud',
        command: 'codex-acp',
        args: [],
        status: 'completed',
        startedAt: '2026-04-02T00:00:01.000Z',
        archiveDir: '/tmp/auto_bridge_123',
        eventsFile: '/tmp/auto_bridge_123/events.jsonl',
      }]
      return 0
    },
    listAutoModeSessions() {
      return autoSessions
    },
  })

  assert.equal(runCalls.length, 1)
  assert.equal(runCalls[0].backend, 'codex')
  assert.equal(runCalls[0].mode, 'auto')
  assert.equal(runCalls[0].autoModeEnabled, true)
  assert.equal(runCalls[0].cwd, '/tmp/linx')
  assert.equal(runCalls[0].model, 'gpt-5.5')
  assert.match(runCalls[0].prompt, /# LinX Symphony Task/)
  assert.match(runCalls[0].prompt, /bridge runtime/)
  assert.match(runCalls[0].prompt, /runtime called/)

  assert.equal(plan.task.status, 'completed')
  assert.equal(plan.delivery.status, 'completed')
  assert.equal(plan.delivery.autoModeSessionId, 'auto_bridge_123')
  assert.equal(plan.session.status, 'completed')
  assert.equal(plan.session.autoModeSessionId, 'auto_bridge_123')
  assert.equal(plan.session.exitCode, 0)
})
