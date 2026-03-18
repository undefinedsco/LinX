import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

let approvalModule
let cleanup

function createRecord(overrides = {}) {
  return {
    id: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
    mode: 'manual',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    prompt: 'inspect workspace',
    passthroughArgs: [],
    credentialSource: 'local',
    resolvedCredentialSource: 'local',
    approvalSource: 'remote',
    command: 'codex-acp',
    args: [],
    status: 'running',
    startedAt: '2026-03-18T00:00:00.000Z',
    archiveDir: '/tmp/demo/.linx/watch/watch_2026-03-18T00-00-00-000Z_deadbeef',
    eventsFile: '/tmp/demo/.linx/watch/watch_2026-03-18T00-00-00-000Z_deadbeef/events.jsonl',
    backendSessionId: 'sess_codex_123',
    ...overrides,
  }
}

function createRuntime(module) {
  const approvals = []
  const audits = []
  const inbox = []
  const webId = 'https://alice.example/profile/card#me'

  const runtime = {
    loadCredentials: () => ({
      url: 'https://id.undefineds.co',
      webId,
      authType: 'client_credentials',
      sourceDir: '/tmp/.linx',
      secrets: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
    }),
    getClientCredentials: () => ({
      clientId: 'client-id',
      clientSecret: 'client-secret',
    }),
    authenticate: async () => ({
      session: {
        info: { webId },
        logout: async () => {},
      },
    }),
    createStore: () => ({
      listApprovals: async () => approvals,
      insertApproval: async (row) => {
        approvals.push({ ...row })
      },
      updateApproval: async (id, patch) => {
        const row = approvals.find((entry) => entry.id === id)
        if (row) {
          Object.assign(row, patch)
        }
      },
      listAudits: async () => audits,
      insertAudit: async (row) => {
        audits.push({ ...row })
      },
      insertInboxNotification: async (row) => {
        inbox.push({ ...row })
      },
    }),
    sleep: async () => {},
    now: () => new Date('2026-03-18T00:00:00.000Z'),
  }

  return {
    runtime,
    approvals,
    audits,
    inbox,
    webId,
    encodeDecisionReason: module.__podApprovalInternal.encodeDecisionReason,
  }
}

test.before(async () => {
  const loaded = await loadWatchModule('lib/watch/pod-approval.ts')
  approvalModule = loaded.module
  cleanup = loaded.cleanup
})

test.after(() => {
  cleanup?.()
})

test('requestRemoteWatchApproval writes pending approval rows and waits for remote decision', async () => {
  const state = createRuntime(approvalModule)
  let sleepCalls = 0

  state.runtime.sleep = async () => {
    sleepCalls += 1
    if (sleepCalls === 1) {
      state.approvals[0].status = 'approved'
      state.approvals[0].decisionBy = state.webId
      state.approvals[0].reason = state.encodeDecisionReason('accept_for_session', 'delegate to this session')
      state.approvals[0].resolvedAt = '2026-03-18T00:00:05.000Z'
    }
  }

  const decision = await approvalModule.requestRemoteWatchApproval({
    record: createRecord(),
    request: {
      kind: 'command-approval',
      message: 'pwd',
      command: 'pwd',
      cwd: '/tmp/demo',
      raw: {
        params: {
          toolCall: {
            toolCallId: 'tool_1',
          },
        },
      },
    },
    runtime: state.runtime,
    pollMs: 1,
  })

  assert.equal(decision, 'accept_for_session')
  assert.equal(state.approvals.length, 1)
  assert.equal(state.approvals[0].toolCallId, 'tool_1')
  assert.equal(state.approvals[0].status, 'approved')
  assert.equal(state.audits.length, 1)
  assert.equal(state.audits[0].action, 'approval_requested')
  assert.equal(state.inbox.length, 1)
})

test('resolveRemoteWatchApproval updates Pod approval state and listRemoteWatchApprovals reads the enriched summary', async () => {
  const state = createRuntime(approvalModule)

  state.approvals.push({
    id: 'approval_123',
    session: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_2026-03-18T00-00-00-000Z_deadbeef',
    toolCallId: 'tool_rm_1',
    toolName: 'commandExecution',
    target: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_2026-03-18T00-00-00-000Z_deadbeef',
    action: 'https://undefineds.co/ns#commandExecution',
    risk: 'high',
    status: 'pending',
    assignedTo: state.webId,
    policyVersion: 'linx-watch-remote-approval/v1',
    createdAt: '2026-03-18T00:00:00.000Z',
  })

  state.audits.push({
    id: 'audit_requested_123',
    action: 'approval_requested',
    actor: 'https://alice.example/.data/agents/linx-watch-assistant.ttl',
    actorRole: 'secretary',
    onBehalfOf: state.webId,
    session: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_2026-03-18T00-00-00-000Z_deadbeef',
    toolCallId: 'tool_rm_1',
    approval: 'https://alice.example/.data/approvals/approval_123.ttl',
    context: JSON.stringify({
      kind: 'command-approval',
      message: 'rm -rf dist',
      command: 'rm -rf dist',
      cwd: '/tmp/demo',
      backend: 'codex',
      sessionId: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
    }),
    policyVersion: 'linx-watch-remote-approval/v1',
    createdAt: '2026-03-18T00:00:00.000Z',
  })

  const resolved = await approvalModule.resolveRemoteWatchApproval({
    approvalId: 'approval_123',
    decision: 'decline',
    note: 'unsafe command',
    runtime: state.runtime,
  })

  assert.equal(resolved.decision, 'decline')
  assert.equal(state.approvals[0].status, 'rejected')
  assert.equal(state.audits.at(-1).action, 'approval_rejected')

  const listed = await approvalModule.listRemoteWatchApprovals({
    status: 'all',
    runtime: state.runtime,
  })

  assert.equal(listed.length, 1)
  assert.equal(listed[0].message, 'rm -rf dist')
  assert.equal(listed[0].command, 'rm -rf dist')
  assert.equal(listed[0].cwd, '/tmp/demo')
  assert.equal(listed[0].decision, 'decline')
})
