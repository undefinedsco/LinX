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
  const grants = []
  const inbox = []
  const webId = 'https://alice.example/profile/card#me'
  const storeInputs = []
  const credentials = {
    url: 'https://id.undefineds.co',
    webId,
    authType: 'client_credentials',
    sourceDir: '/tmp/.linx',
    secrets: {
      clientId: 'client-id',
      clientSecret: 'client-secret',
    },
  }
  const podSession = {
    credentials,
    webId,
    fetch: async () => new Response(null, { status: 200 }),
    close: async () => {},
  }
  let sessionCalls = 0

  const runtime = {
    getPodDataSession: async () => {
      sessionCalls += 1
      return podSession
    },
    createStore: (storeWebId, fetcher) => {
      storeInputs.push({ webId: storeWebId, fetcher })
      return {
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
        listGrants: async () => grants,
        insertGrant: async (row) => {
          grants.push({ ...row })
        },
        insertInboxNotification: async (row) => {
          inbox.push({ ...row })
        },
      }
    },
    sleep: async () => {},
    now: () => new Date('2026-03-18T00:00:00.000Z'),
  }

  return {
    runtime,
    approvals,
    audits,
    grants,
    inbox,
    webId,
    storeInputs,
    podSession,
    get sessionCalls() {
      return sessionCalls
    },
    encodeDecisionReason: module.__podApprovalInternal.encodeDecisionReason,
  }
}

function createOidcRuntime(module) {
  const state = createRuntime(module)

  state.podSession.credentials = {
    url: 'https://id.undefineds.co',
    webId: state.webId,
    authType: 'oidc_oauth',
    sourceDir: '/tmp/.linx',
    secrets: {
      oidcAccessToken: 'oidc-access-token',
      oidcRefreshToken: 'oidc-refresh-token',
      oidcExpiresAt: '2026-03-18T01:00:00.000Z',
    },
  }

  return state
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
  assert.equal(state.sessionCalls, 1)
  assert.equal(state.storeInputs.length, 1)
  assert.equal(state.storeInputs.every((input) => input.webId === state.webId), true)
  assert.equal(state.storeInputs.every((input) => typeof input.fetcher === 'function'), true)
  assert.equal(state.approvals.length, 1)
  assert.equal(state.approvals[0].toolCallId, 'tool_1')
  assert.equal(state.approvals[0].status, 'approved')
  assert.equal(state.audits.length, 1)
  assert.equal(state.audits[0].action, 'approval_requested')
  assert.equal(state.grants.length, 0)
  assert.equal(state.inbox.length, 1)
})

test('requestRemoteWatchApproval accepts OIDC-only credentials', async () => {
  const state = createOidcRuntime(approvalModule)
  let sleepCalls = 0

  state.runtime.sleep = async () => {
    sleepCalls += 1
    if (sleepCalls === 1) {
      state.approvals[0].status = 'approved'
      state.approvals[0].decisionBy = state.webId
      state.approvals[0].reason = state.encodeDecisionReason('accept', 'approve once')
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
            toolCallId: 'tool_oidc_1',
          },
        },
      },
    },
    runtime: state.runtime,
    pollMs: 1,
  })

  assert.equal(decision, 'accept')
  assert.equal(state.sessionCalls, 1)
  assert.equal(state.storeInputs.length, 1)
  assert.equal(state.storeInputs.every((input) => input.webId === state.webId), true)
  assert.equal(state.storeInputs.every((input) => typeof input.fetcher === 'function'), true)
  assert.equal(state.approvals.length, 1)
  assert.equal(state.approvals[0].toolCallId, 'tool_oidc_1')
  assert.equal(state.audits.length, 1)
  assert.equal(state.inbox.length, 1)
})

test('requestRemoteWatchApproval writes audit entry pointers without embedding command context', async () => {
  const state = createRuntime(approvalModule)
  let sleepCalls = 0

  state.runtime.sleep = async () => {
    sleepCalls += 1
    if (sleepCalls === 1) {
      state.approvals[0].status = 'approved'
      state.approvals[0].decisionBy = state.webId
      state.approvals[0].reason = state.encodeDecisionReason('accept', 'approve once')
      state.approvals[0].resolvedAt = '2026-03-18T00:00:05.000Z'
    }
  }

  await approvalModule.requestRemoteWatchApproval({
    record: createRecord(),
    request: {
      kind: 'command-approval',
      message: 'large command',
      command: `node -e "${'x'.repeat(6000)}"`,
      cwd: '/tmp/demo',
      raw: {
        params: {
          toolCall: {
            toolCallId: 'tool_large_1',
          },
        },
      },
    },
    runtime: state.runtime,
    pollMs: 1,
  })

  assert.equal(state.audits.length, 1)
  assert.equal(state.audits[0].action, 'approval_requested')
  assert.equal(state.audits[0].session, 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_2026-03-18T00-00-00-000Z_deadbeef')
  assert.equal(state.audits[0].entry, state.audits[0].session)
  assert.equal(state.audits[0].toolCallId, 'tool_large_1')
  assert.equal(state.audits[0].toolName, 'commandExecution')
  assert.equal('context' in state.audits[0], false)
  assert.equal(JSON.stringify(state.audits[0]).includes('x'.repeat(100)), false)
})

test('requestRemoteWatchApproval short-circuits when an active grant already covers the request', async () => {
  const state = createRuntime(approvalModule)

  state.grants.push({
    id: 'grant_123',
    target: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_2026-03-18T00-00-00-000Z_deadbeef',
    action: 'https://undefineds.co/ns#commandExecution',
    effect: 'allow',
    riskCeiling: 'high',
    decisionBy: state.webId,
    decisionRole: 'human',
    onBehalfOf: state.webId,
    createdAt: '2026-03-18T00:00:00.000Z',
  })

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
  assert.equal(state.approvals.length, 0)
  assert.equal(state.audits.length, 0)
  assert.equal(state.inbox.length, 0)
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
    entry: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_2026-03-18T00-00-00-000Z_deadbeef',
    toolCallId: 'tool_rm_1',
    toolName: 'commandExecution',
    approval: 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_123',
    policyVersion: 'linx-watch-remote-approval/v1',
    createdAt: '2026-03-18T00:00:00.000Z',
  })

  const resolved = await approvalModule.resolveRemoteWatchApproval({
    approvalId: 'approval_123',
    decision: 'accept_for_session',
    note: 'delegate to this session',
    runtime: state.runtime,
  })

  assert.equal(resolved.decision, 'accept_for_session')
  assert.equal(state.approvals[0].status, 'approved')
  assert.equal(state.audits.at(-1).action, 'approval_approved')
  assert.equal(state.grants.length, 1)
  assert.equal(state.grants[0].target, 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_2026-03-18T00-00-00-000Z_deadbeef')
  assert.equal(state.grants[0].effect, 'allow')

  const listed = await approvalModule.listRemoteWatchApprovals({
    status: 'all',
    runtime: state.runtime,
  })

  assert.equal(listed.length, 1)
  assert.equal(listed[0].message, 'Command execution approval')
  assert.equal(listed[0].command, undefined)
  assert.equal(listed[0].cwd, undefined)
  assert.equal(listed[0].decision, 'accept_for_session')
})

test('waitForRemoteWatchApproval direct-reads a known approval URI without listing approvals', async () => {
  const state = createRuntime(approvalModule)
  let findCalls = 0
  let listCalls = 0

  state.runtime.createStore = () => ({
    async findApproval(id, options) {
      findCalls += 1
      assert.equal(id, 'approval_direct_1')
      assert.equal(options.resourceUri, 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_direct_1')
      return {
        id,
        approvalUri: options.resourceUri,
        session: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_2026-03-18T00-00-00-000Z_deadbeef',
        toolCallId: 'tool_direct_1',
        toolName: 'commandExecution',
        target: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_2026-03-18T00-00-00-000Z_deadbeef',
        action: 'https://undefineds.co/ns#commandExecution',
        risk: 'medium',
        status: 'approved',
        reason: state.encodeDecisionReason('accept'),
        createdAt: '2026-03-18T00:00:00.000Z',
        resolvedAt: '2026-03-18T00:00:01.000Z',
      }
    },
    async listApprovals() {
      listCalls += 1
      throw new Error('known approval URI should not list approvals')
    },
    async insertApproval() {},
    async updateApproval() {},
    async listAudits() { return [] },
    async insertAudit() {},
    async listGrants() { return [] },
    async insertGrant() {},
    async insertInboxNotification() {},
  })

  const decision = await approvalModule.waitForRemoteWatchApproval({
    approvalId: 'approval_direct_1',
    approvalUri: 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_direct_1',
    runtime: state.runtime,
    pollMs: 1,
  })

  assert.equal(decision, 'accept')
  assert.equal(findCalls, 1)
  assert.equal(listCalls, 0)
})

test('waitForRemoteWatchApproval retries temporary direct-read misses without listing approvals', async () => {
  const state = createRuntime(approvalModule)
  let findCalls = 0
  let listCalls = 0
  let sleepCalls = 0

  state.runtime.createStore = () => ({
    async findApproval(id, options) {
      findCalls += 1
      assert.equal(id, 'approval_direct_retry_1')
      assert.equal(options.resourceUri, 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_direct_retry_1')
      if (findCalls === 1) {
        return null
      }
      return {
        id,
        approvalUri: options.resourceUri,
        session: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_2026-03-18T00-00-00-000Z_deadbeef',
        toolCallId: 'tool_direct_retry_1',
        toolName: 'commandExecution',
        target: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_2026-03-18T00-00-00-000Z_deadbeef',
        action: 'https://undefineds.co/ns#commandExecution',
        risk: 'medium',
        status: 'approved',
        reason: state.encodeDecisionReason('accept_for_session'),
        createdAt: '2026-03-18T00:00:00.000Z',
        resolvedAt: '2026-03-18T00:00:01.000Z',
      }
    },
    async listApprovals() {
      listCalls += 1
      throw new Error('known approval URI should not list approvals')
    },
    async insertApproval() {},
    async updateApproval() {},
    async listAudits() { return [] },
    async insertAudit() {},
    async listGrants() { return [] },
    async insertGrant() {},
    async insertInboxNotification() {},
  })
  state.runtime.sleep = async () => {
    sleepCalls += 1
  }

  const decision = await approvalModule.waitForRemoteWatchApproval({
    approvalId: 'approval_direct_retry_1',
    approvalUri: 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_direct_retry_1',
    runtime: state.runtime,
    pollMs: 1,
  })

  assert.equal(decision, 'accept_for_session')
  assert.equal(findCalls, 2)
  assert.equal(sleepCalls, 1)
  assert.equal(listCalls, 0)
})

test('native remote approval store writes and reads approval grant audit resources as Pod TTL', async () => {
  const resources = new Map()
  const writes = []
  const webId = 'https://alice.example/profile/card#me'

  const store = approvalModule.__podApprovalInternal.createNativeRemoteApprovalStore(webId, async (url, init = {}) => {
    const method = init.method ?? 'GET'
    if (method === 'GET') {
      if (resources.has(url)) {
        return new Response(resources.get(url), { status: 200, headers: { 'Content-Type': 'text/turtle' } })
      }
      const children = [...resources.keys()]
        .filter((entry) => entry.startsWith(url) && entry !== url)
        .map((entry) => `<${entry}> .`)
      if (children.length > 0 || url.endsWith('/')) {
        return new Response(children.join('\n'), { status: 200, headers: { 'Content-Type': 'text/turtle' } })
      }
      return new Response('missing', { status: 404 })
    }
    if (method === 'HEAD') {
      return new Response(null, { status: resources.has(url) || url.endsWith('/') ? 200 : 404 })
    }
    if (method === 'PUT') {
      const body = typeof init.body === 'string' ? init.body : ''
      resources.set(url, body)
      writes.push({ url, body })
      return new Response(null, { status: 201 })
    }
    return new Response(null, { status: 405 })
  })

  await store.insertApproval({
    id: 'approval_native_1',
    session: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_1',
    toolCallId: 'tool_1',
    toolName: 'commandExecution',
    target: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_1',
    action: 'https://undefineds.co/ns#commandExecution',
    risk: 'medium',
    status: 'pending',
    assignedTo: webId,
    policyVersion: 'linx-watch-remote-approval/v1',
    createdAt: '2026-03-18T00:00:00.000Z',
  })
  await store.insertAudit({
    id: 'audit_native_1',
    action: 'approval_requested',
    actor: 'https://alice.example/.data/agents/linx-watch-assistant.ttl',
    actorRole: 'secretary',
    onBehalfOf: webId,
    session: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_1',
    entry: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_1',
    toolCallId: 'tool_1',
    toolName: 'commandExecution',
    approval: 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_native_1',
    policyVersion: 'linx-watch-remote-approval/v1',
    createdAt: '2026-03-18T00:00:00.000Z',
  })
  await store.insertGrant({
    id: 'grant_native_1',
    target: 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_1',
    action: 'https://undefineds.co/ns#commandExecution',
    effect: 'allow',
    riskCeiling: 'medium',
    decisionBy: webId,
    decisionRole: 'human',
    onBehalfOf: webId,
    createdAt: '2026-03-18T00:00:01.000Z',
  })
  await store.updateApproval('approval_native_1', {
    status: 'approved',
    decisionBy: webId,
    decisionRole: 'human',
    onBehalfOf: webId,
    reason: approvalModule.__podApprovalInternal.encodeDecisionReason('accept_for_session'),
    resolvedAt: '2026-03-18T00:00:02.000Z',
  })

  const [approvals, audits, grants] = await Promise.all([
    store.listApprovals(),
    store.listAudits(),
    store.listGrants(),
  ])

  assert.equal(approvals.length, 1)
  assert.equal(approvals[0].status, 'approved')
  assert.equal(approvals[0].toolCallId, 'tool_1')
  assert.equal(audits.length, 1)
  assert.equal(audits[0].approval, 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_native_1')
  assert.equal(audits[0].entry, 'https://alice.example/.data/chat/linx-watch/index.ttl#watch_1')
  assert.equal(audits[0].toolName, 'commandExecution')
  assert.equal(grants.length, 1)
  assert.equal(grants[0].effect, 'allow')
  assert.equal(writes.some((write) => write.url.endsWith('/.data/approvals/2026/03/18.ttl')), true)
  assert.equal(writes.some((write) => write.url.endsWith('/.data/audits/2026/03/18.ttl')), true)
  assert.equal(writes.some((write) => write.url.endsWith('/settings/autonomy/grants.ttl')), true)
})
