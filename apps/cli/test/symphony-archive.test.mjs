import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

function writeExecutable(path, source) {
  writeFileSync(path, source)
  chmodSync(path, 0o755)
}

async function withPatchedEnv(t, env, fn) {
  const originals = new Map()

  for (const [key, value] of Object.entries(env)) {
    originals.set(key, process.env[key])
    process.env[key] = value
  }

  t.after(() => {
    for (const [key, value] of originals.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  return fn()
}

async function importCompiledSibling(entryPath, relativePath) {
  return import(pathToFileURL(join(dirname(entryPath), relativePath)).href)
}

test('symphony archive creates, updates, lists, and resolves URI records', async (t) => {
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
    captureSymphonyIdea,
    createArchivedSymphonyRunPlan,
    listSymphonyIdeas,
    listSymphonyDeliveries,
    listSymphonyIssues,
    listSymphonySessions,
    listSymphonyTasks,
    loadSymphonyIdea,
    loadSymphonyDelivery,
    loadSymphonyIssue,
    loadSymphonySession,
    loadSymphonyTask,
    resolveSymphonyRecord,
    updateSymphonyIdeaStatus,
    updateSymphonyDeliveryStatus,
    updateSymphonySessionStatus,
    updateSymphonyTaskStatus,
  } = module

  const chat = 'https://alice.example/.data/chat/chat-1/index.ttl#this'
  const thread = 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1'
  const messages = ['https://alice.example/.data/chat/chat-1/2026/04/02/messages.ttl#message-1']
  const plan = createArchivedSymphonyRunPlan({
    objective: 'verify symphony archive',
    acceptanceCriteria: ['task exists', 'session is loadable'],
    workspacePath: '/tmp/linx',
    workspaceKind: 'git',
    repository: 'https://github.com/undefineds/linx.git',
    branch: 'main',
    worktree: '/tmp/linx-worktree',
    backend: 'codex',
    mode: 'auto',
    chat,
    thread,
    messages,
    now: new Date('2026-04-02T00:00:00.000Z'),
    randomId: 'archive',
  })

  const delivery = updateSymphonyDeliveryStatus(plan.delivery, 'dispatched')
  const task = updateSymphonyTaskStatus(plan.taskRecord, 'running')
  const session = updateSymphonySessionStatus(plan.session, 'running', { dryRun: false })
  const idea = captureSymphonyIdea({
    input: '我觉得 Symphony 应该先把碎片想法记录成 Idea，而不是直接派工。',
    affectedArea: 'symphony',
    chat,
    thread,
    messages,
    now: new Date('2026-04-02T00:02:00.000Z'),
    randomId: 'idea',
  })
  const candidateIdea = updateSymphonyIdeaStatus(idea, 'candidate', {
    commitment: 'direction',
    relatedRecords: [plan.issue.uri],
    nextStep: 'Compare against active Symphony records before promotion.',
  })

  assert.equal(delivery.status, 'dispatched')
  assert.equal(task.status, 'running')
  assert.equal(session.status, 'running')
  assert.equal(session.dryRun, false)
  assert.equal(candidateIdea.status, 'candidate')
  assert.equal(candidateIdea.commitment, 'direction')
  assert.deepEqual(candidateIdea.relatedRecords, [plan.issue.uri])

  assert.equal(listSymphonyIdeas().length, 1)
  assert.equal(listSymphonyIssues().length, 1)
  assert.equal(listSymphonyTasks().length, 1)
  assert.equal(listSymphonyDeliveries().length, 1)
  assert.equal(listSymphonySessions().length, 1)
  assert.equal(loadSymphonyIdea(idea.uri)?.uri, idea.uri)
  assert.equal(loadSymphonyIssue(plan.issue.uri)?.uri, plan.issue.uri)
  assert.equal(loadSymphonyTask(plan.task)?.uri, plan.task)
  assert.equal(loadSymphonyDelivery('delivery_2026-04-02T00-00-00-000Z')?.uri, plan.delivery.uri)
  assert.equal(loadSymphonySession(plan.session.uri)?.uri, plan.session.uri)

  assert.deepEqual(plan.issue.tasks, [plan.task])
  assert.equal(plan.taskRecord.issue, plan.issue.uri)
  assert.equal(plan.taskRecord.delivery, plan.delivery.uri)
  assert.equal(plan.taskRecord.session, plan.session.uri)
  assert.equal(plan.taskRecord.objective, 'verify symphony archive')
  assert.deepEqual(plan.taskRecord.acceptanceCriteria, ['task exists', 'session is loadable'])
  assert.equal(plan.delivery.issue, plan.issue.uri)
  assert.equal(plan.session.issue, plan.issue.uri)
  assert.equal(plan.session.delivery, plan.delivery.uri)
  assert.equal(plan.delivery.task, plan.task)
  assert.equal(plan.session.task, plan.task)
  assert.equal(plan.delivery.session, plan.session.uri)
  assert.deepEqual(plan.delivery.target, {
    source: 'active-session',
    backend: 'codex',
    agent: 'codex-worker',
    chat,
    thread,
    messages,
  })
  assert.deepEqual(plan.session.target, plan.delivery.target)
  assert.equal(plan.issue.chat, chat)
  assert.equal(plan.delivery.chat, chat)
  assert.equal(plan.session.chat, chat)
  assert.equal(plan.issue.thread, thread)
  assert.equal(plan.delivery.thread, thread)
  assert.equal(plan.session.thread, thread)
  assert.deepEqual(plan.issue.messages, messages)
  assert.deepEqual(plan.delivery.messages, messages)
  assert.deepEqual(plan.session.messages, messages)

  const resolved = resolveSymphonyRecord('delivery_2026-04-02T00-00-00-000Z')
  assert.equal(resolved?.kind, 'delivery')
  assert.equal(resolved?.record.uri, plan.delivery.uri)
  const resolvedIdea = resolveSymphonyRecord('idea_2026-04-02T00-02-00-000Z')
  assert.equal(resolvedIdea?.kind, 'idea')
  assert.equal(resolvedIdea?.record.uri, idea.uri)

  const ideaKey = 'idea_2026-04-02T00-02-00-000Z_idea'
  const issueKey = 'issue_2026-04-02T00-00-00-000Z_archive'
  const deliveryKey = 'delivery_2026-04-02T00-00-00-000Z_archive'
  const sessionKey = 'session_2026-04-02T00-00-00-000Z_archive'
  const ideaFile = readFileSync(join(symphonyHome, 'ideas', ideaKey, 'idea.json'), 'utf-8')
  const issueFile = readFileSync(join(symphonyHome, 'issues', issueKey, 'issue.json'), 'utf-8')
  const deliveryFile = readFileSync(join(symphonyHome, 'deliveries', deliveryKey, 'delivery.json'), 'utf-8')
  const sessionFile = readFileSync(join(symphonyHome, 'sessions', sessionKey, 'session.json'), 'utf-8')
  assert.match(ideaFile, /"status": "candidate"/)
  assert.match(ideaFile, /"commitment": "direction"/)
  assert.match(issueFile, /verify symphony archive/)
  assert.match(deliveryFile, /task_dispatch/)
  assert.match(sessionFile, /"status": "running"/)
  assert.doesNotMatch(deliveryFile, /"issueId"/)
  assert.doesNotMatch(deliveryFile, /"sessionId"/)
  assert.doesNotMatch(sessionFile, /"issueId"/)
  assert.doesNotMatch(sessionFile, /"deliveryId"/)
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

  const { createArchivedSymphonyRunPlan, getSymphonyHome } = module
  const plan = createArchivedSymphonyRunPlan({
    objective: 'default home check',
    workspacePath: '/tmp/linx',
    backend: 'claude',
autoEnabled: false,
mode: 'off',
    randomId: 'home',
  })

  assert.equal(getSymphonyHome().startsWith(legacyHome), false)
  assert.equal(getSymphonyHome(), join(tempHome, '.linx', 'symphony'))
  assert.equal(plan.issue.uri.startsWith('urn:undefineds:linx:issue:'), true)
  assert.equal(plan.task.startsWith('urn:undefineds:linx:task:'), true)
})

test('symphony archive triages obvious follow-up work into an existing open issue', async (t) => {
  const originalHome = process.env.HOME
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-triage-home-'))
  process.env.HOME = root

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

  const { createArchivedSymphonyRunPlan, listSymphonyIssues, triageSymphonyIssue } = module
  const chat = 'https://alice.example/.data/chat/__secretary__/index.ttl#this'
  const thread = 'https://alice.example/.data/chat/__secretary__/index.ttl#session-triage'
  const first = createArchivedSymphonyRunPlan({
    objective: 'fix login redirect bug',
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'auto',
    chat,
    thread,
    now: new Date('2026-04-02T00:00:00.000Z'),
    randomId: 'login-a',
  })

  const decision = triageSymphonyIssue({
    objective: 'fix login redirect bug and add regression test',
    chat,
    thread,
  })
  assert.equal(decision.action, 'update')
  assert.equal(decision.issue.uri, first.issue.uri)

  const second = createArchivedSymphonyRunPlan({
    objective: 'fix login redirect bug and add regression test',
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'auto',
    chat,
    thread,
    now: new Date('2026-04-02T00:01:00.000Z'),
    randomId: 'login-b',
  })

  assert.equal(second.issue.uri, first.issue.uri)
  assert.notEqual(second.task, first.task)
  assert.equal(second.taskRecord.issue, first.issue.uri)
  assert.equal(second.delivery.issue, first.issue.uri)
  assert.equal(second.session.issue, first.issue.uri)
  assert.match(second.delivery.projection.prompt, new RegExp(first.issue.uri))
  assert.doesNotMatch(second.delivery.projection.prompt, /issue_2026-04-02T00-01-00-000Z_login-b/)
  assert.deepEqual(second.issue.tasks, [first.task, second.task])
  assert.deepEqual(second.issue.deliveries, [first.delivery.uri, second.delivery.uri])
  assert.deepEqual(second.issue.sessions, [first.session.uri, second.session.uri])
  assert.equal(listSymphonyIssues().length, 1)
})

test('symphony archive does not merge closed or unrelated issues', async (t) => {
  const originalHome = process.env.HOME
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-no-merge-home-'))
  process.env.HOME = root

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

  const { createArchivedSymphonyRunPlan, listSymphonyIssues, triageSymphonyIssue, updateSymphonyIssueStatus } = module
  const first = createArchivedSymphonyRunPlan({
    objective: 'repair sync checkpoint restore',
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'auto',
    now: new Date('2026-04-02T00:00:00.000Z'),
    randomId: 'sync-a',
  })
  updateSymphonyIssueStatus(first.issue, 'closed', { closedAt: '2026-04-02T00:00:10.000Z' })

  const closedDecision = triageSymphonyIssue({
    objective: 'repair sync checkpoint restore',
  })
  assert.equal(closedDecision.action, 'create')

  const second = createArchivedSymphonyRunPlan({
    objective: 'repair sync checkpoint restore',
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'auto',
    now: new Date('2026-04-02T00:01:00.000Z'),
    randomId: 'sync-b',
  })
  assert.notEqual(second.issue.uri, first.issue.uri)

  const unrelatedDecision = triageSymphonyIssue({
    objective: 'design billing invoice export',
  })
  assert.equal(unrelatedDecision.action, 'create')
  assert.notEqual(unrelatedDecision.issue?.uri, second.issue.uri)

  const third = createArchivedSymphonyRunPlan({
    objective: 'design billing invoice export',
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'auto',
    now: new Date('2026-04-02T00:02:00.000Z'),
    randomId: 'billing',
  })
  assert.notEqual(third.issue.uri, first.issue.uri)
  assert.notEqual(third.issue.uri, second.issue.uri)
  assert.equal(listSymphonyIssues().length, 3)
})

test('symphony dispatch bridges non-dry-run plans into the auto-mode runtime and records completion', async (t) => {
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
  const projectionCalls = []
  const mirrorCalls = []
  let autoSessions = []
  const plan = await module.runSymphony({
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
    async persistSymphonyProjectionToPod(plan, options) {
      if (projectionCalls.length === 0) {
        assert.equal(existsSync(join(root, '.linx', 'symphony')), false)
      }
      projectionCalls.push({ plan, stage: options?.stage })
      const chat = 'https://alice.example/.data/chat/__symphony__/index.ttl#this'
      const thread = 'https://alice.example/.data/chat/__symphony__/index.ttl#thread-bridge'
      const messages = ['https://alice.example/.data/chat/__symphony__/2026/04/02/messages.ttl#bridge-planned']
      const workers = plan.workers.map((worker) => ({
        task: worker.task,
        taskRecord: { ...worker.taskRecord, chat, thread, messages },
        delivery: { ...worker.delivery, chat, thread, messages },
        session: { ...worker.session, chat, thread, messages },
      }))
      const primary = workers[0]
      return {
        plan: {
          issue: {
            ...plan.issue,
            chat,
            thread,
            messages,
          },
          task: primary?.task ?? plan.task,
          delivery: primary?.delivery ?? { ...plan.delivery, chat, thread, messages },
          session: primary?.session ?? { ...plan.session, chat, thread, messages },
          workers,
        },
        chat,
        thread,
        messages,
      }
    },
    async mirrorSymphonyProjectionJsonLdFromPod(result) {
      mirrorCalls.push(result)
      const dir = join(root, '.linx', 'symphony', 'jsonld')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `mirror-${mirrorCalls.length}.jsonld`), `${JSON.stringify({
        '@context': {},
        '@id': result.thread,
        status: result.plan.session.status,
      })}\n`)
    },
  })

  assert.equal(runCalls.length, 1)
  assert.equal(runCalls[0].backend, 'codex')
  assert.equal(runCalls[0].mode, 'off')
  assert.equal(runCalls[0].autoEnabled, true)
  assert.equal(runCalls[0].cwd, '/tmp/linx')
  assert.equal(runCalls[0].model, 'gpt-5.5')
  assert.match(runCalls[0].prompt, /# LinX Symphony Task/)
  assert.match(runCalls[0].prompt, /bridge runtime/)
  assert.match(runCalls[0].prompt, /runtime called/)
  assert.equal(runCalls[0].metadata?.symphony?.issue, plan.issue.uri)
  assert.equal(runCalls[0].metadata?.symphony?.delivery, plan.delivery.uri)
  assert.equal(runCalls[0].metadata?.reconciler?.policyKind, 'symphony')
  assert.equal(runCalls[0].metadata?.reconciler?.eventType, 'delivery.submitted')
  assert.equal(runCalls[0].metadata?.reconciler?.thread, 'https://alice.example/.data/chat/__symphony__/index.ttl#thread-bridge')
  assert.equal(runCalls[0].metadata?.reconciler?.wakeJobs?.[0]?.targetAgent, 'codex-worker')
  assert.equal(runCalls[0].metadata?.scheduler?.wakeRecord?.status, 'running')
  assert.equal(runCalls[0].metadata?.scheduler?.wakeRecord?.targetRole, 'worker')

  assert.equal(plan.issue.status, 'resolved')
  assert.equal(plan.delivery.status, 'completed')
  assert.equal(plan.delivery.autoModeSessionId, 'auto_bridge_123')
  assert.equal(plan.session.status, 'completed')
  assert.equal(plan.session.mode, 'off')
  assert.equal(plan.session.secretaryAutoEnabled, true)
  assert.equal(plan.session.autoModeSessionId, 'auto_bridge_123')
  assert.equal(plan.session.exitCode, 0)
  assert.equal(plan.delivery.reconciler?.decisions.at(-1)?.eventType, 'delivery.completed')
  assert.equal(plan.delivery.reconciler?.decisions.at(-1)?.wakeJobs?.[0]?.targetAgent, '__secretary__')
  assert.equal(plan.session.reconciler?.decisions.at(-1)?.eventType, 'delivery.completed')
  assert.deepEqual(projectionCalls.map((call) => call.stage), ['planned', 'running', 'running', 'completed'])
  assert.equal(mirrorCalls.length, 4)
  assert.equal(existsSync(join(root, '.linx', 'symphony')), true)
  assert.equal(existsSync(join(root, '.linx', 'symphony', 'issues')), false)
  assert.equal(existsSync(join(root, '.linx', 'symphony', 'jsonld', 'mirror-4.jsonld')), true)
  assert.equal(plan.issue.chat, 'https://alice.example/.data/chat/__symphony__/index.ttl#this')
  assert.equal(plan.delivery.thread, 'https://alice.example/.data/chat/__symphony__/index.ttl#thread-bridge')
  assert.deepEqual(plan.session.messages, ['https://alice.example/.data/chat/__symphony__/2026/04/02/messages.ttl#bridge-planned'])
})

test('symphony dispatch can run quiet one-shot workers for TUI-verifiable delegation', async (t) => {
  const originalHome = process.env.HOME
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-oneshot-home-'))
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
  const projectionStages = []
  let autoSessions = []
  const plan = await module.runSymphony({
    objective: ['reply', 'exactly', 'symphony-ok'],
    backend: 'codex',
    auto: true,
    cwd: '/tmp/linx',
    workerGoalMode: false,
    quietWorkers: true,
  }, {
    async runAutoMode(options) {
      runCalls.push(options)
      autoSessions = [{
        id: 'auto_oneshot_123',
        backend: 'codex',
        runtime: 'local',
        transport: 'acp',
        mode: 'off',
        cwd: '/tmp/linx',
        passthroughArgs: [],
        credentialSource: 'cloud',
        command: 'codex-acp',
        args: [],
        status: 'completed',
        startedAt: '2026-04-02T00:00:01.000Z',
        archiveDir: '/tmp/auto_oneshot_123',
        eventsFile: '/tmp/auto_oneshot_123/events.jsonl',
      }]
      return 0
    },
    listAutoModeSessions() {
      return autoSessions
    },
    async persistSymphonyProjectionToPod(plan, options) {
      projectionStages.push(options?.stage)
      return {
        plan,
        chat: plan.issue.chat,
        thread: plan.issue.thread,
        messages: [],
      }
    },
    async mirrorSymphonyProjectionJsonLdFromPod() {},
  })

  assert.equal(runCalls.length, 1)
  assert.equal(runCalls[0].goalMode, false)
  assert.equal(runCalls[0].quiet, true)
  assert.equal(runCalls[0].plain, false)
  assert.equal(plan.issue.status, 'resolved')
  assert.equal(plan.delivery.status, 'completed')
  assert.equal(plan.session.autoModeSessionId, 'auto_oneshot_123')
  assert.deepEqual(projectionStages, ['planned', 'running', 'running', 'completed'])
})

test('symphony dispatch uses the worker session workspace resolved by control records', async (t) => {
  const originalHome = process.env.HOME
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-worker-workspace-home-'))
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

  const secretaryWorkspace = '/tmp/secretary-linx'
  const workerWorkspace = '/tmp/worker-linx'
  const runCalls = []
  let autoSessions = []
  const plan = await module.runSymphony({
    objective: ['use', 'worker', 'workspace'],
    backend: 'codex',
    auto: true,
    cwd: secretaryWorkspace,
  }, {
    async runAutoMode(options) {
      runCalls.push(options)
      autoSessions = [{
        id: 'auto_worker_workspace_123',
        startedAt: '2026-04-02T00:00:01.000Z',
      }]
      return 0
    },
    listAutoModeSessions() {
      return autoSessions
    },
    async persistSymphonyProjectionToPod(plan) {
      const workers = plan.workers.map((worker) => ({
        ...worker,
        session: {
          ...worker.session,
          cwd: workerWorkspace,
          workspace: {
            ...worker.session.workspace,
            path: workerWorkspace,
            workspaceUri: 'urn:undefineds:workspace:worker-linx',
            environment: {
              kind: 'remote-container',
              id: 'worker-container-a',
              label: 'Worker container checkout',
              runtime: worker.session.backend,
            },
          },
        },
      }))
      const primary = workers[0]
      return {
        plan: {
          ...plan,
          task: primary?.task ?? plan.task,
          taskRecord: primary?.taskRecord ?? plan.taskRecord,
          delivery: primary?.delivery ?? plan.delivery,
          session: primary?.session ?? plan.session,
          workers,
        },
        chat: 'https://alice.example/.data/chat/__symphony__/index.ttl#this',
        thread: 'https://alice.example/.data/chat/__symphony__/index.ttl#thread-worker-workspace',
        messages: ['https://alice.example/.data/chat/__symphony__/2026/04/02/messages.ttl#worker-workspace'],
      }
    },
  })

  assert.equal(runCalls.length, 1)
  assert.equal(runCalls[0].cwd, workerWorkspace)
  assert.notEqual(runCalls[0].cwd, secretaryWorkspace)
  assert.match(runCalls[0].prompt, /Workspace: \/tmp\/worker-linx/)
  assert.match(runCalls[0].prompt, /Workspace environment: remote-container runtime=codex id=worker-container-a label=Worker container checkout/)
  assert.equal(plan.session.cwd, workerWorkspace)
  assert.equal(plan.session.workspace.path, workerWorkspace)
  assert.equal(plan.session.workspace.workspaceUri, 'urn:undefineds:workspace:worker-linx')
  assert.equal(plan.session.autoModeSessionId, 'auto_worker_workspace_123')
})

test('symphony dispatch merges follow-up work against Pod issues before local cache fallback', async (t) => {
  const originalHome = process.env.HOME
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-pod-issue-home-'))
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

  const existingIssue = {
    uri: 'urn:undefineds:linx:issue:issue_existing_login',
    title: 'fix login redirect bug',
    description: 'redirect drops state',
    status: 'open',
    priority: 'high',
    source: 'cli',
    issuer: {
      source: 'user',
      webId: 'https://alice.example/profile/card#me',
      chat: 'https://alice.example/.data/chat/__secretary__/index.ttl#this',
      thread: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-login',
    },
    chat: 'https://alice.example/.data/chat/__secretary__/index.ttl#this',
    thread: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-login',
    tasks: ['https://alice.example/.data/task/index.ttl#task_existing_login'],
    deliveries: ['urn:undefineds:linx:delivery:delivery_existing_login'],
    sessions: ['urn:undefineds:linx:session:session_existing_login'],
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:01:00.000Z',
  }
  const runCalls = []
  const projectionCalls = []
  const mirrorCalls = []
  let autoSessions = []

  const plan = await module.runSymphony({
    objective: ['fix', 'login', 'redirect', 'bug'],
    backend: 'codex',
    auto: true,
    cwd: root,
  }, {
    async listOpenSymphonyIssuesFromPod() {
      return [existingIssue]
    },
    async runAutoMode(options) {
      runCalls.push(options)
      autoSessions = [{
        id: 'auto_pod_issue_merge',
        startedAt: '2026-04-02T00:02:00.000Z',
      }]
      return 0
    },
    listAutoModeSessions() {
      return autoSessions
    },
    async persistSymphonyProjectionToPod(plan, options) {
      if (projectionCalls.length === 0) {
        assert.equal(existsSync(join(root, '.linx', 'symphony')), false)
      }
      projectionCalls.push({ plan, stage: options?.stage })
      return {
        plan,
        chat: existingIssue.chat,
        thread: existingIssue.thread,
        messages: ['https://alice.example/.data/chat/__secretary__/2026/04/02/messages.ttl#merge'],
      }
    },
    async mirrorSymphonyProjectionJsonLdFromPod(result) {
      mirrorCalls.push(result)
      const dir = join(root, '.linx', 'symphony', 'jsonld')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `merge-${mirrorCalls.length}.jsonld`), `${JSON.stringify({
        '@context': {},
        '@id': result.thread,
        issue: result.plan.issue.uri,
      })}\n`)
    },
  })

  assert.equal(plan.issue.uri, existingIssue.uri)
  assert.equal(projectionCalls[0].plan.issue.uri, existingIssue.uri)
  assert.ok(projectionCalls[0].plan.issue.tasks.includes(existingIssue.tasks[0]))
  assert.ok(projectionCalls[0].plan.issue.deliveries.includes(existingIssue.deliveries[0]))
  assert.ok(projectionCalls[0].plan.issue.sessions.includes(existingIssue.sessions[0]))
  assert.match(runCalls[0].prompt, new RegExp(existingIssue.uri))
  assert.equal(existsSync(join(root, '.linx', 'symphony')), true)
  assert.equal(mirrorCalls.length, 4)
  assert.equal(existsSync(join(root, '.linx', 'symphony', 'issues')), false)
  assert.equal(existsSync(join(root, '.linx', 'symphony', 'jsonld', 'merge-4.jsonld')), true)
})

test('symphony run preserves caller-provided delegation target chat and thread', async (t) => {
  const originalHome = process.env.HOME
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-target-home-'))
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

  const target = {
    source: 'ai-contact',
    backend: 'codex',
    agent: 'codex-worker',
    chat: 'https://alice.example/.data/chat/codex-worker/index.ttl#this',
    thread: 'https://alice.example/.data/chat/codex-worker/index.ttl#thread-target',
    messages: ['https://alice.example/.data/chat/codex-worker/2026/04/02/messages.ttl#message-1'],
  }

  const plan = await module.runSymphony({
    objective: ['delegate', 'to', 'target', 'chat'],
    backend: 'codex',
    auto: true,
    dryRun: true,
    cwd: root,
    target,
  }, {
    async runAutoMode() {
      throw new Error('dry-run must not launch auto-mode')
    },
    listAutoModeSessions() {
      return []
    },
    async persistSymphonyProjectionToPod(plan) {
      return {
        plan,
        chat: target.chat,
        thread: target.thread,
        messages: target.messages,
      }
    },
  })

  assert.equal(plan.issue.chat, target.chat)
  assert.equal(plan.delivery.thread, target.thread)
  assert.deepEqual(plan.session.messages, target.messages)
  assert.deepEqual(plan.delivery.target, target)
  assert.deepEqual(plan.session.target, target)
})

test('symphony non-dry-run dispatches through auto-mode ACP and archives completion', async (t) => {
  const originalHome = process.env.HOME
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-integration-home-'))
  const binDir = join(root, 'bin')
  const autoModeHome = join(root, 'auto-mode-home')
  const fakeAcpLog = join(root, 'fake-codex-acp.jsonl')
  mkdirSync(binDir, { recursive: true })
  process.env.HOME = root

  t.after(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    rmSync(root, { recursive: true, force: true })
  })

  writeExecutable(join(binDir, 'codex-acp'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({
  kind: 'invoke',
  argv: process.argv.slice(2),
  openaiKey: process.env.OPENAI_API_KEY ?? null,
  codexKey: process.env.CODEX_API_KEY ?? null,
}) + '\\n')

const sessionId = 'sess_symphony_integration_123'
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId } })
    return
  }
  if (message.method === 'session/prompt') {
    appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({
      kind: 'prompt',
      prompt: message.params?.prompt?.[0]?.text ?? null,
    }) + '\\n')
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'symphony fake codex completed' },
        },
      },
    })
    write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module: symphonyModule, entryPath, cleanup } = await loadAutoModeModule('lib/symphony-command.ts')
  t.after(() => cleanup())
  const autoModeModule = await importCompiledSibling(entryPath, 'auto-mode/index.js')
  t.mock.method(autoModeModule.autoModeRuntime, 'promptText', async (prompt) => {
    if (prompt === 'you> ') {
      return '/exit'
    }
    return ''
  })

  t.mock.method(autoModeModule.autoModeRuntime, 'loadPodBackendCredential', async (backend) => {
    assert.equal(backend, 'codex')
    return {
      backend: 'codex',
      provider: 'openai',
      env: {
        CODEX_API_KEY: 'sk-symphony-integration',
      },
    }
  })
  t.mock.method(autoModeModule.autoModeRuntime, 'persistAutoModeConversationToPod', async () => {})

  const mirrorCalls = []
  const persistSymphonyProjectionToPod = async (plan, options) => {
    const stage = options?.stage ?? 'planned'
    const chat = 'https://alice.example/.data/chat/__symphony__/index.ttl#this'
    const thread = 'https://alice.example/.data/chat/__symphony__/index.ttl#thread-integration'
    const messages = [`https://alice.example/.data/chat/__symphony__/2026/04/02/messages.ttl#${stage}`]
    const workers = plan.workers.map((worker) => ({
      task: worker.task,
      taskRecord: { ...worker.taskRecord, chat, thread, messages },
      delivery: { ...worker.delivery, chat, thread, messages },
      session: { ...worker.session, chat, thread, messages },
    }))
    const primary = workers[0]
    return {
      plan: {
        issue: { ...plan.issue, chat, thread, messages },
        task: primary?.task ?? plan.task,
        delivery: primary?.delivery ?? { ...plan.delivery, chat, thread, messages },
        session: primary?.session ?? { ...plan.session, chat, thread, messages },
        workers,
      },
      chat,
      thread,
      messages,
    }
  }
  const mirrorSymphonyProjectionJsonLdFromPod = async (result) => {
    mirrorCalls.push(result)
    const dir = join(root, '.linx', 'symphony', 'jsonld')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `integration-${mirrorCalls.length}.jsonld`), `${JSON.stringify({
      '@context': {},
      '@id': result.thread,
      issue: result.plan.issue.uri,
      sessionStatus: result.plan.session.status,
      deliveryStatus: result.plan.delivery.status,
      autoModeSessionId: result.plan.session.autoModeSessionId,
    })}\n`)
  }

  let plan
  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: fakeAcpLog,
  }, async () => {
    plan = await symphonyModule.runSymphony({
      objective: ['verify', 'symphony', 'integration'],
      backend: 'codex',
      auto: true,
      plain: true,
      cwd: root,
      acceptance: ['auto-mode receives projected prompt', 'archives completed records'],
    }, {
      runAutoMode(options) {
        return autoModeModule.runAutoMode({
          ...options,
          commandOverride: join(binDir, 'codex-acp'),
        })
      },
      listAutoModeSessions: autoModeModule.listArchivedAutoModeSessions,
      persistSymphonyProjectionToPod,
      mirrorSymphonyProjectionJsonLdFromPod,
    })
  })

  assert.equal(plan.issue.status, 'resolved')
  assert.equal(plan.delivery.status, 'completed')
  assert.equal(plan.delivery.autoModeSessionId, 'sess_symphony_integration_123')
  assert.equal(plan.session.status, 'completed')
  assert.equal(plan.session.autoModeSessionId, 'sess_symphony_integration_123')
  assert.equal(plan.session.exitCode, 0)
  assert.equal(plan.issue.chat, 'https://alice.example/.data/chat/__symphony__/index.ttl#this')
  assert.equal(plan.delivery.thread, 'https://alice.example/.data/chat/__symphony__/index.ttl#thread-integration')
  assert.deepEqual(plan.session.messages, ['https://alice.example/.data/chat/__symphony__/2026/04/02/messages.ttl#completed'])

  const symphonyHome = join(root, '.linx', 'symphony')
  const finalMirrorFile = readFileSync(join(symphonyHome, 'jsonld', 'integration-4.jsonld'), 'utf-8')
  assert.equal(mirrorCalls.length, 4)
  assert.equal(existsSync(join(symphonyHome, 'issues')), false)
  assert.match(finalMirrorFile, /"sessionStatus":"completed"/)
  assert.match(finalMirrorFile, /"deliveryStatus":"completed"/)
  assert.match(finalMirrorFile, /"autoModeSessionId":"sess_symphony_integration_123"/)

  const autoSession = JSON.parse(readFileSync(join(autoModeHome, 'sessions', 'sess_symphony_integration_123', 'session.json'), 'utf-8'))
  assert.equal(autoSession.backend, 'codex')
  assert.equal(autoSession.mode, 'off')
  assert.equal(autoSession.autoEnabled, true)
  assert.equal(autoSession.status, 'completed')
  assert.equal(autoSession.credentialSource, 'cloud')
  assert.equal(autoSession.resolvedCredentialSource, 'cloud')
  assert.equal(autoSession.transport, 'acp')
  assert.equal(autoSession.goalMode, true)

  const events = readFileSync(join(autoModeHome, 'sessions', 'sess_symphony_integration_123', 'events.jsonl'), 'utf-8')
  assert.match(events, /verify symphony integration/)
  assert.match(events, /symphony fake codex completed/)

  const logLines = readFileSync(fakeAcpLog, 'utf-8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.equal(logLines[0].openaiKey, null)
  assert.equal(logLines[0].codexKey, 'sk-symphony-integration')
  assert.match(logLines.find((entry) => entry.kind === 'prompt')?.prompt ?? '', /# LinX Symphony Task/)
  assert.match(logLines.find((entry) => entry.kind === 'prompt')?.prompt ?? '', /Task URI: urn:undefineds:linx:task:/)
  assert.equal(readdirSync(join(autoModeHome, 'sessions')).length, 1)
})

test('symphony launches Claude Code alias model as a router-backed goal worker so Secretary can keep steering after dispatch', async (t) => {
  const originalHome = process.env.HOME
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-goal-home-'))
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
  const autoSessions = []
  const plan = await module.runSymphony({
    objective: ['ship', 'goal', 'session'],
    backend: 'claude',
    auto: true,
    cwd: root,
    secretaryModel: 'gpt-5.5',
    workerModel: 'opus',
    credentialSource: 'local',
    workerSupervisorIntervalMs: 600000,
    commandOverride: '/tmp/fake-claude-code-acp',
    acceptance: ['Claude Code receives a goal prompt', 'Secretary can continue steering'],
  }, {
    async runAutoMode(options) {
      runCalls.push(options)
      autoSessions.push({
        id: 'auto_goal_session_123',
        startedAt: '2026-04-18T00:00:00.000Z',
      })
      return 0
    },
    listAutoModeSessions() {
      return autoSessions
    },
  })

  assert.equal(runCalls.length, 1)
  assert.equal(runCalls[0].backend, 'claude')
  assert.equal(runCalls[0].mode, 'off')
  assert.equal(runCalls[0].autoEnabled, true)
  assert.equal(runCalls[0].model, 'opus')
  assert.equal(runCalls[0].credentialSource, 'local')
  assert.equal(runCalls[0].goalMode, true)
  assert.equal(runCalls[0].commandOverride, '/tmp/fake-claude-code-acp')
  assert.equal(runCalls[0].commandEnv, undefined)
  assert.deepEqual(runCalls[0].metadata?.symphony?.agentRuntime, {
    backend: 'linx',
    credentialSource: 'cloud',
    model: 'gpt-5.5',
  })
  assert.equal(runCalls[0].metadata?.symphony?.workerModel, 'opus')
  assert.equal(runCalls[0].metadata?.symphony?.supervisor?.strategy, 'interval')
  assert.equal(runCalls[0].metadata?.symphony?.supervisor?.intervalMs, 600000)
  assert.deepEqual(runCalls[0].metadata?.symphony?.supervisor?.immediateWakeKinds, ['approval', 'question', 'blocked', 'failed', 'completed'])
  assert.match(runCalls[0].prompt, /# LinX Symphony Task/)
  assert.match(runCalls[0].prompt, /Start and maintain this as the active goal/)
  assert.match(runCalls[0].prompt, /later Secretary messages/)
  assert.equal(plan.session.model, 'opus')
  assert.equal(plan.session.supervisor?.intervalMs, 600000)
  assert.equal(plan.issue.status, 'resolved')
  assert.equal(plan.delivery.autoModeSessionId, 'auto_goal_session_123')
  assert.equal(plan.session.autoModeSessionId, 'auto_goal_session_123')
})

test('symphony rejects codex worker with provider-routed deepseek model', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/symphony-command.ts')
  t.after(() => cleanup())

  let runCalled = false
  await assert.rejects(
    module.runSymphony({
      objective: ['ship', 'invalid', 'worker'],
      backend: 'codex',
      auto: true,
      cwd: process.cwd(),
      workerModel: 'deepseek-v4',
      quietProjectionErrors: true,
      print: false,
    }, {
      async runAutoMode() {
        runCalled = true
        return 0
      },
      listAutoModeSessions() {
        return []
      },
    }),
    /codex backend cannot run worker model deepseek-v4/,
  )
  assert.equal(runCalled, false)
})

test('symphony rejects Claude Code worker with direct provider-routed deepseek model', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/symphony-command.ts')
  t.after(() => cleanup())

  let runCalled = false
  await assert.rejects(
    module.runSymphony({
      objective: ['ship', 'invalid', 'claude', 'worker'],
      backend: 'claude',
      auto: true,
      cwd: process.cwd(),
      workerModel: 'deepseek-v4',
      quietProjectionErrors: true,
      print: false,
    }, {
      async runAutoMode() {
        runCalled = true
        return 0
      },
      listAutoModeSessions() {
        return []
      },
    }),
    /claude backend cannot set provider-routed worker model deepseek-v4/,
  )
  assert.equal(runCalled, false)
})

test('symphony launches LinX native worker with deepseek-v4 goal model', async (t) => {
  const originalHome = process.env.HOME
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-linx-goal-home-'))
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
  const autoSessions = []
  const plan = await module.runSymphony({
    objective: ['ship', 'linx', 'native', 'worker'],
    backend: 'linx',
    auto: true,
    cwd: root,
    secretaryModel: 'gpt-5.5',
    workerModel: 'deepseek-v4',
    workerSupervisorIntervalMs: 600000,
    acceptance: ['LinX native worker receives a goal prompt'],
  }, {
    async runAutoMode(options) {
      runCalls.push(options)
      autoSessions.push({
        id: 'auto_linx_goal_session_123',
        startedAt: '2026-04-18T00:00:00.000Z',
      })
      return 0
    },
    listAutoModeSessions() {
      return autoSessions
    },
  })

  assert.equal(runCalls.length, 1)
  assert.equal(runCalls[0].backend, 'linx')
  assert.equal(runCalls[0].mode, 'off')
  assert.equal(runCalls[0].autoEnabled, true)
  assert.equal(runCalls[0].model, 'deepseek-v4')
  assert.equal(runCalls[0].goalMode, true)
  assert.deepEqual(runCalls[0].metadata?.symphony?.agentRuntime, {
    backend: 'linx',
    credentialSource: 'cloud',
    model: 'gpt-5.5',
  })
  assert.equal(runCalls[0].metadata?.symphony?.workerModel, 'deepseek-v4')
  assert.equal(runCalls[0].metadata?.symphony?.supervisor?.strategy, 'interval')
  assert.equal(runCalls[0].metadata?.symphony?.supervisor?.intervalMs, 600000)
  assert.match(runCalls[0].prompt, /# LinX Symphony Task/)
  assert.match(runCalls[0].prompt, /Start and maintain this as the active goal/)
  assert.equal(plan.session.backend, 'linx')
  assert.equal(plan.session.model, 'deepseek-v4')
  assert.equal(plan.session.supervisor?.intervalMs, 600000)
  assert.equal(plan.delivery.autoModeSessionId, 'auto_linx_goal_session_123')
  assert.equal(plan.session.autoModeSessionId, 'auto_linx_goal_session_123')
})
