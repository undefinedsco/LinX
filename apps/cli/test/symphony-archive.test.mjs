import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
    createArchivedSymphonyRunPlan,
    listSymphonyDeliveries,
    listSymphonyIssues,
    listSymphonySessions,
    loadSymphonyDelivery,
    loadSymphonyIssue,
    loadSymphonySession,
    resolveSymphonyRecord,
    updateSymphonyDeliveryStatus,
    updateSymphonySessionStatus,
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
  const session = updateSymphonySessionStatus(plan.session, 'running', { dryRun: false })

  assert.equal(delivery.status, 'dispatched')
  assert.equal(session.status, 'running')
  assert.equal(session.dryRun, false)

  assert.equal(listSymphonyIssues().length, 1)
  assert.equal(listSymphonyDeliveries().length, 1)
  assert.equal(listSymphonySessions().length, 1)
  assert.equal(loadSymphonyIssue(plan.issue.uri)?.uri, plan.issue.uri)
  assert.equal(loadSymphonyDelivery('delivery_2026-04-02T00-00-00-000Z')?.uri, plan.delivery.uri)
  assert.equal(loadSymphonySession(plan.session.uri)?.uri, plan.session.uri)

  assert.deepEqual(plan.issue.tasks, [plan.task])
  assert.equal(plan.delivery.issue, plan.issue.uri)
  assert.equal(plan.session.issue, plan.issue.uri)
  assert.equal(plan.session.delivery, plan.delivery.uri)
  assert.equal(plan.delivery.task, plan.task)
  assert.equal(plan.session.task, plan.task)
  assert.equal(plan.delivery.session, plan.session.uri)
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

  const issueKey = 'issue_2026-04-02T00-00-00-000Z_archive'
  const deliveryKey = 'delivery_2026-04-02T00-00-00-000Z_archive'
  const sessionKey = 'session_2026-04-02T00-00-00-000Z_archive'
  const issueFile = readFileSync(join(symphonyHome, 'issues', issueKey, 'issue.json'), 'utf-8')
  const deliveryFile = readFileSync(join(symphonyHome, 'deliveries', deliveryKey, 'delivery.json'), 'utf-8')
  const sessionFile = readFileSync(join(symphonyHome, 'sessions', sessionKey, 'session.json'), 'utf-8')
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
    mode: 'manual',
    randomId: 'home',
  })

  assert.equal(getSymphonyHome().startsWith(legacyHome), false)
  assert.equal(getSymphonyHome(), join(tempHome, '.linx', 'symphony'))
  assert.equal(plan.issue.uri.startsWith('urn:undefineds:linx:issue:'), true)
  assert.equal(plan.task.startsWith('urn:undefineds:linx:task:'), true)
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

  assert.equal(plan.issue.status, 'resolved')
  assert.equal(plan.delivery.status, 'completed')
  assert.equal(plan.delivery.autoModeSessionId, 'auto_bridge_123')
  assert.equal(plan.session.status, 'completed')
  assert.equal(plan.session.autoModeSessionId, 'auto_bridge_123')
  assert.equal(plan.session.exitCode, 0)
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
    })
  })

  assert.equal(plan.issue.status, 'resolved')
  assert.equal(plan.delivery.status, 'completed')
  assert.equal(plan.delivery.autoModeSessionId, 'sess_symphony_integration_123')
  assert.equal(plan.session.status, 'completed')
  assert.equal(plan.session.autoModeSessionId, 'sess_symphony_integration_123')
  assert.equal(plan.session.exitCode, 0)
  assert.equal(Object.hasOwn(plan.issue, 'chat'), false)
  assert.equal(Object.hasOwn(plan.delivery, 'thread'), false)
  assert.equal(Object.hasOwn(plan.session, 'messages'), false)

  const symphonyHome = join(root, '.linx', 'symphony')
  const issueFile = readFileSync(join(symphonyHome, 'issues', plan.issue.uri.split(':').at(-1), 'issue.json'), 'utf-8')
  const deliveryFile = readFileSync(join(symphonyHome, 'deliveries', plan.delivery.uri.split(':').at(-1), 'delivery.json'), 'utf-8')
  const sessionFile = readFileSync(join(symphonyHome, 'sessions', plan.session.uri.split(':').at(-1), 'session.json'), 'utf-8')
  assert.match(issueFile, /"status": "resolved"/)
  assert.match(deliveryFile, /"status": "completed"/)
  assert.match(sessionFile, /"status": "completed"/)
  assert.match(sessionFile, /"autoModeSessionId": "sess_symphony_integration_123"/)

  const autoSession = JSON.parse(readFileSync(join(autoModeHome, 'sessions', 'sess_symphony_integration_123', 'session.json'), 'utf-8'))
  assert.equal(autoSession.backend, 'codex')
  assert.equal(autoSession.mode, 'auto')
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

test('symphony launches codex as a goal session so Secretary can keep steering after dispatch', async (t) => {
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
    backend: 'codex',
    auto: true,
    cwd: root,
    acceptance: ['Codex receives a goal prompt', 'Secretary can continue steering'],
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
  assert.equal(runCalls[0].backend, 'codex')
  assert.equal(runCalls[0].mode, 'auto')
  assert.equal(runCalls[0].autoModeEnabled, true)
  assert.equal(runCalls[0].goalMode, true)
  assert.match(runCalls[0].prompt, /# LinX Symphony Task/)
  assert.match(runCalls[0].prompt, /Start and maintain this as the active goal/)
  assert.match(runCalls[0].prompt, /later Secretary messages/)
  assert.equal(plan.issue.status, 'resolved')
  assert.equal(plan.delivery.autoModeSessionId, 'auto_goal_session_123')
  assert.equal(plan.session.autoModeSessionId, 'auto_goal_session_123')
})
