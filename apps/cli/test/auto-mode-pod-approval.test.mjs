import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

let approvalModule
let cleanup

const AUTO_MODE_THREAD_URI = 'https://alice.example/.data/chat/linx-auto-mode-codex/index.ttl#auto_2026-03-18T00-00-00-000Z_deadbeef'

function createRecord(overrides = {}) {
  return {
    id: 'auto_2026-03-18T00-00-00-000Z_deadbeef',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
autoEnabled: false,
mode: 'off',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    prompt: 'inspect workspace',
    passthroughArgs: [],
    credentialSource: 'cloud',
    resolvedCredentialSource: 'cloud',
    approvalSource: 'hybrid',
    command: 'codex-acp',
    args: [],
    status: 'running',
    startedAt: '2026-03-18T00:00:00.000Z',
    archiveDir: '/tmp/demo/.linx/auto-mode/auto_2026-03-18T00-00-00-000Z_deadbeef',
    eventsFile: '/tmp/demo/.linx/auto-mode/auto_2026-03-18T00-00-00-000Z_deadbeef/events.jsonl',
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
  const grantCoverageInputs = []
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
    grantCoverageInputs,
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
  const loaded = await loadAutoModeModule('lib/auto-mode/pod-approval.ts')
  approvalModule = loaded.module
  cleanup = loaded.cleanup
})

test.after(() => {
  cleanup?.()
})

test('requestRemoteAutoModeApproval writes pending approval rows and waits for remote decision', async () => {
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

  const decision = await approvalModule.requestRemoteAutoModeApproval({
    record: createRecord(),
    request: {
      kind: 'command-approval',
      message: 'pwd',
      command: 'pwd',
      cwd: '/tmp/demo',
      approvalOptions: [
        { optionId: 'allow_once', label: 'Allow once', kind: 'allow_once' },
        { optionId: 'allow_always', label: 'Always allow', kind: 'allow_always' },
      ],
      timeoutMs: 45000,
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
  assert.equal(state.approvals[0].expiresAt.toISOString(), '2026-03-18T00:00:45.000Z')
  assert.deepEqual(JSON.parse(state.approvals[0].approvalOptions), [
    { optionId: 'allow_once', label: 'Allow once', kind: 'allow_once' },
    { optionId: 'allow_always', label: 'Always allow', kind: 'allow_always' },
  ])
  assert.equal(state.audits.length, 1)
  assert.equal(state.audits[0].action, 'approval_requested')
  assert.equal(state.grants.length, 1)
  assert.equal(state.grants[0].target, AUTO_MODE_THREAD_URI)
  assert.equal(state.grants[0].source, 'approval')
  assert.equal(state.inbox.length, 2)
})

test('requestRemoteAutoModeApproval accepts OIDC-only credentials', async () => {
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

  const decision = await approvalModule.requestRemoteAutoModeApproval({
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

test('requestRemoteAutoModeApproval writes audit entry pointers without embedding command context', async () => {
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

  await approvalModule.requestRemoteAutoModeApproval({
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
  assert.equal(state.audits[0].session, AUTO_MODE_THREAD_URI)
  assert.equal(state.audits[0].entry, state.audits[0].session)
  assert.equal(state.audits[0].toolCallId, 'tool_large_1')
  assert.equal(state.audits[0].toolName, 'commandExecution')
  assert.equal('context' in state.audits[0], false)
  assert.equal(JSON.stringify(state.audits[0]).includes('x'.repeat(100)), false)
})

test('requestRemoteAutoModeApproval short-circuits when an active grant already covers the request', async () => {
  const state = createRuntime(approvalModule)

  state.grants.push({
    id: 'grant_123',
    target: AUTO_MODE_THREAD_URI,
    action: 'https://undefineds.co/ns#commandExecution',
    effect: 'allow',
    riskCeiling: 'high',
    title: 'Session command delegation',
    summary: 'Session command delegation wiki page',
    body: 'Allow semantically equivalent safe command approvals in this auto-mode session.',
    schema: 'https://alice.example/settings/autonomy/schema/grant.ttl#GrantWikiPage',
    pageKind: 'autonomy-grant',
    wikiStatus: 'active',
    tags: JSON.stringify(['autonomy', 'grant', 'commandExecution']),
    policy: 'Allow semantically equivalent safe command approvals in this auto-mode session.',
    context: JSON.stringify({ cwd: '/tmp/demo', command: 'pwd' }),
    decisionBy: state.webId,
    decisionRole: 'human',
    onBehalfOf: state.webId,
    createdAt: '2026-03-18T00:00:00.000Z',
  })
  state.runtime.resolveGrantCoverage = async (input) => {
    state.grantCoverageInputs.push(input)
    return { covers: true, confidence: 0.91, reason: 'within the maintained session policy' }
  }

  const decision = await approvalModule.requestRemoteAutoModeApproval({
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
  assert.equal(state.grantCoverageInputs.length, 1)
  assert.equal(state.grantCoverageInputs[0].grant.id, 'grant_123')
  assert.equal(state.grantCoverageInputs[0].requestContext.target, AUTO_MODE_THREAD_URI)
  assert.equal(state.approvals.length, 0)
  assert.equal(state.audits.length, 0)
  assert.equal(state.inbox.length, 0)
})

test('requestRemoteAutoModeApproval does not use coarse grant matches without semantic coverage', async () => {
  const state = createRuntime(approvalModule)
  let sleepCalls = 0

  state.grants.push({
    id: 'grant_456',
    target: AUTO_MODE_THREAD_URI,
    action: 'https://undefineds.co/ns#commandExecution',
    effect: 'allow',
    riskCeiling: 'high',
    title: 'Session command delegation',
    summary: 'Session command delegation wiki page',
    body: 'Allow safe read-only inspection commands in this auto-mode session.',
    schema: 'https://alice.example/settings/autonomy/schema/grant.ttl#GrantWikiPage',
    pageKind: 'autonomy-grant',
    wikiStatus: 'active',
    tags: JSON.stringify(['autonomy', 'grant', 'commandExecution']),
    policy: 'Allow safe read-only inspection commands in this auto-mode session.',
    context: JSON.stringify({ cwd: '/tmp/demo', command: 'pwd' }),
    decisionBy: state.webId,
    decisionRole: 'human',
    onBehalfOf: state.webId,
    createdAt: '2026-03-18T00:00:00.000Z',
  })
  state.runtime.resolveGrantCoverage = async (input) => {
    state.grantCoverageInputs.push(input)
    return { covers: false, confidence: 0.88, reason: 'current request writes files' }
  }
  state.runtime.sleep = async () => {
    sleepCalls += 1
    if (sleepCalls === 1) {
      state.approvals[0].status = 'approved'
      state.approvals[0].decisionBy = state.webId
      state.approvals[0].reason = state.encodeDecisionReason('accept', 'approve once')
      state.approvals[0].resolvedAt = '2026-03-18T00:00:05.000Z'
    }
  }

  const decision = await approvalModule.requestRemoteAutoModeApproval({
    record: createRecord(),
    request: {
      kind: 'command-approval',
      message: 'write file',
      command: 'printf hi > out.txt',
      cwd: '/tmp/demo',
      raw: {
        params: {
          toolCall: {
            toolCallId: 'tool_2',
          },
        },
      },
    },
    runtime: state.runtime,
    pollMs: 1,
  })

  assert.equal(decision, 'accept')
  assert.equal(state.grantCoverageInputs.length, 1)
  assert.equal(state.approvals.length, 1)
  assert.equal(state.approvals[0].toolCallId, 'tool_2')
})

test('resolveRemoteAutoModeApproval updates only Pod approval state and listRemoteAutoModeApprovals reads the enriched summary', async () => {
  const state = createRuntime(approvalModule)

  state.approvals.push({
    id: 'approval_123',
    session: AUTO_MODE_THREAD_URI,
    toolCallId: 'tool_rm_1',
    toolName: 'commandExecution',
    target: AUTO_MODE_THREAD_URI,
    action: 'https://undefineds.co/ns#commandExecution',
    risk: 'high',
    status: 'pending',
    assignedTo: state.webId,
    approvalOptions: JSON.stringify([
      { optionId: 'allow_once', label: 'Allow once', kind: 'allow_once' },
      { optionId: 'allow_always', label: 'Always allow', kind: 'allow_always' },
    ]),
    policyVersion: 'linx-auto-mode-remote-approval/v1',
    createdAt: '2026-03-18T00:00:00.000Z',
    expiresAt: '2026-03-18T00:01:00.000Z',
  })

  state.audits.push({
    id: 'audit_requested_123',
    action: 'approval_requested',
    actor: 'https://alice.example/agents/__secretary__/',
    actorRole: 'secretary',
    onBehalfOf: state.webId,
    session: AUTO_MODE_THREAD_URI,
    entry: AUTO_MODE_THREAD_URI,
    toolCallId: 'tool_rm_1',
    toolName: 'commandExecution',
    approval: 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_123',
    policyVersion: 'linx-auto-mode-remote-approval/v1',
    createdAt: '2026-03-18T00:00:00.000Z',
  })

  const resolved = await approvalModule.resolveRemoteAutoModeApproval({
    approvalId: 'approval_123',
    decision: 'accept_for_session',
    note: 'delegate to this session',
    runtime: state.runtime,
  })

  assert.equal(resolved.decision, 'accept_for_session')
  assert.equal(state.approvals[0].status, 'approved')
  assert.equal(state.audits.at(-1).action, 'approval_approved')
  assert.equal(state.grants.length, 0)

  const listed = await approvalModule.listRemoteAutoModeApprovals({
    status: 'all',
    runtime: state.runtime,
  })

  assert.equal(listed.length, 1)
  assert.equal(listed[0].message, 'Command execution approval')
  assert.equal(listed[0].command, undefined)
  assert.equal(listed[0].cwd, undefined)
  assert.equal(listed[0].decision, 'accept_for_session')
  assert.equal(listed[0].expiresAt, '2026-03-18T00:01:00.000Z')
  assert.deepEqual(listed[0].approvalOptions, [
    { optionId: 'allow_once', label: 'Allow once', kind: 'allow_once' },
    { optionId: 'allow_always', label: 'Always allow', kind: 'allow_always' },
  ])
})

test('materializeRemoteAutoModeGrant creates a reusable grant only for auto-mode session decisions', async () => {
  const state = createRuntime(approvalModule)

  state.approvals.push({
    id: 'approval_123',
    approvalUri: 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_123',
    session: AUTO_MODE_THREAD_URI,
    toolCallId: 'tool_rm_1',
    toolName: 'commandExecution',
    target: AUTO_MODE_THREAD_URI,
    action: 'https://undefineds.co/ns#commandExecution',
    risk: 'high',
    status: 'approved',
    decisionBy: state.webId,
    decisionRole: 'human',
    reason: state.encodeDecisionReason('accept_for_session', 'delegate to this session'),
    policyVersion: 'linx-auto-mode-remote-approval/v1',
    createdAt: '2026-03-18T00:00:00.000Z',
    resolvedAt: '2026-03-18T00:00:05.000Z',
  })

  const grant = await approvalModule.materializeRemoteAutoModeGrant({
    approvalId: 'approval_123',
    approvalUri: 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_123',
    runtime: state.runtime,
  })

  assert.equal(grant.effect, 'allow')
  assert.equal(state.grants.length, 1)
  assert.equal(state.grants[0].target, AUTO_MODE_THREAD_URI)
  assert.equal(state.grants[0].effect, 'allow')
  assert.equal(state.grants[0].schema, 'https://alice.example/settings/autonomy/schema/grant.ttl#GrantWikiPage')
  assert.equal(state.grants[0].pageKind, 'autonomy-grant')
  assert.equal(state.grants[0].wikiStatus, 'active')
  assert.match(state.grants[0].title, /commandExecution grant wiki/)
  assert.match(state.grants[0].body, /LLM Wiki pattern/)
  assert.match(state.grants[0].context, /approval_123/)

  const repeated = await approvalModule.materializeRemoteAutoModeGrant({
    approvalId: 'approval_123',
    approvalUri: 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_123',
    runtime: state.runtime,
  })

  assert.equal(repeated.id, state.grants[0].id)
  assert.equal(state.grants.length, 1)
})

test('waitForRemoteAutoModeApproval direct-reads a known approval URI without listing approvals', async () => {
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
        session: AUTO_MODE_THREAD_URI,
        toolCallId: 'tool_direct_1',
        toolName: 'commandExecution',
        target: AUTO_MODE_THREAD_URI,
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

  const decision = await approvalModule.waitForRemoteAutoModeApproval({
    approvalId: 'approval_direct_1',
    approvalUri: 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_direct_1',
    runtime: state.runtime,
    pollMs: 1,
  })

  assert.equal(decision, 'accept')
  assert.equal(findCalls, 1)
  assert.equal(listCalls, 0)
})

test('waitForRemoteAutoModeApproval retries temporary direct-read misses without listing approvals', async () => {
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
        session: AUTO_MODE_THREAD_URI,
        toolCallId: 'tool_direct_retry_1',
        toolName: 'commandExecution',
        target: AUTO_MODE_THREAD_URI,
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

  const decision = await approvalModule.waitForRemoteAutoModeApproval({
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

test('shared model remote approval store uses ORM exact lookup and update paths', async () => {
  const webId = 'https://alice.example/profile/card#me'
  const approvalUri = 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_shared_1'
  const calls = []
  const row = {
    id: 'approval_shared_1',
    session: AUTO_MODE_THREAD_URI,
    toolCallId: 'tool_shared_1',
    toolName: 'commandExecution',
    target: AUTO_MODE_THREAD_URI,
    action: 'https://undefineds.co/ns#commandExecution',
    risk: 'medium',
    status: 'pending',
    assignedTo: webId,
    policyVersion: 'linx-auto-mode-remote-approval/v1',
    createdAt: '2026-03-18T00:00:00.000Z',
  }
  const db = {
    select() {
      return {
        from(resource) {
          return {
            async execute() {
              calls.push({ op: 'select', resource: resource.config?.name })
              return resource.config?.name === 'approval' ? [row] : []
            },
          }
        },
      }
    },
    async findByIri(resource, iri) {
      calls.push({ op: 'findByIri', resource: resource.config?.name, iri })
      return iri === approvalUri ? row : null
    },
    insert(resource) {
      return {
        values(value) {
          calls.push({ op: 'insert', resource: resource.config?.name, value })
          return {
            async execute() {},
          }
        },
      }
    },
    async updateByIri(resource, iri, patch) {
      calls.push({ op: 'updateByIri', resource: resource.config?.name, iri, patch })
      return { ...row, ...patch }
    },
  }

  const store = approvalModule.__podApprovalInternal.createSharedModelRemoteApprovalStore(webId, async () => db)

  await store.insertApproval({ ...row, approvalUri })
  const found = await store.findApproval('approval_shared_1', { resourceUri: approvalUri })
  await store.updateApproval('approval_shared_1', { status: 'approved', decisionBy: webId }, { resourceUri: approvalUri })

  assert.equal(found.approvalUri, approvalUri)
  assert.equal(calls.some((call) => call.op === 'insert' && call.resource === 'approval' && !('approvalUri' in call.value)), true)
  assert.equal(calls.some((call) => call.op === 'findByIri' && call.iri === approvalUri), true)
  assert.equal(calls.some((call) => call.op === 'updateByIri' && call.iri === approvalUri && call.patch.status === 'approved'), true)
  assert.equal(calls.some((call) => call.op === 'select' && call.resource === 'approval'), false)
})

test('shared model remote approval store uses ORM short-id lookup and update paths', async () => {
  const webId = 'https://alice.example/profile/card#me'
  const approvalUri = 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_shared_short_1'
  const approvalResourceId = '2026/03/18.ttl#approval_shared_short_1'
  const calls = []
  const row = {
    id: approvalResourceId,
    '@id': approvalUri,
    session: AUTO_MODE_THREAD_URI,
    toolCallId: 'tool_shared_short_1',
    toolName: 'commandExecution',
    target: AUTO_MODE_THREAD_URI,
    action: 'https://undefineds.co/ns#commandExecution',
    risk: 'medium',
    status: 'pending',
    assignedTo: webId,
    policyVersion: 'linx-auto-mode-remote-approval/v1',
    createdAt: '2026-03-18T00:00:00.000Z',
  }
  const db = {
    async findById(resource, id) {
      calls.push({ op: 'findById', resource: resource.config?.name, id })
      return id === approvalResourceId ? row : null
    },
    async updateById(resource, id, patch) {
      calls.push({ op: 'updateById', resource: resource.config?.name, id, patch })
      return id === approvalResourceId ? { ...row, ...patch } : null
    },
    select() {
      return {
        from(resource) {
          return {
            async execute() {
              calls.push({ op: 'select', resource: resource.config?.name })
              return []
            },
          }
        },
      }
    },
  }

  const store = approvalModule.__podApprovalInternal.createSharedModelRemoteApprovalStore(webId, async () => db)

  const found = await store.findApproval(approvalResourceId)
  await store.updateApproval(approvalResourceId, { status: 'approved', decisionBy: webId })

  assert.equal(found.approvalUri, approvalUri)
  assert.equal(calls.some((call) => call.op === 'findById' && call.id === approvalResourceId), true)
  assert.equal(calls.some((call) => call.op === 'updateById' && call.id === approvalResourceId && call.patch.status === 'approved'), true)
  assert.equal(calls.some((call) => call.op === 'select' && call.resource === 'approval'), false)
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
    session: 'https://alice.example/.data/chat/linx-auto-mode/index.ttl#auto_1',
    toolCallId: 'tool_1',
    toolName: 'commandExecution',
    target: 'https://alice.example/.data/chat/linx-auto-mode/index.ttl#auto_1',
    action: 'https://undefineds.co/ns#commandExecution',
    risk: 'medium',
    status: 'pending',
    assignedTo: webId,
    approvalOptions: JSON.stringify([
      { optionId: 'allow_once', label: 'Allow once', kind: 'allow_once' },
      { optionId: 'allow_always', label: 'Always allow', kind: 'allow_always' },
    ]),
    policyVersion: 'linx-auto-mode-remote-approval/v1',
    createdAt: '2026-03-18T00:00:00.000Z',
    expiresAt: '2026-03-18T00:00:45.000Z',
  })
  await store.insertAudit({
    id: 'audit_native_1',
    action: 'approval_requested',
    actor: 'https://alice.example/agents/__secretary__/',
    actorRole: 'secretary',
    onBehalfOf: webId,
    session: 'https://alice.example/.data/chat/linx-auto-mode/index.ttl#auto_1',
    entry: 'https://alice.example/.data/chat/linx-auto-mode/index.ttl#auto_1',
    toolCallId: 'tool_1',
    toolName: 'commandExecution',
    approval: 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_native_1',
    policyVersion: 'linx-auto-mode-remote-approval/v1',
    createdAt: '2026-03-18T00:00:00.000Z',
  })
  await store.insertGrant({
    id: 'grant_native_1',
    target: 'https://alice.example/.data/chat/linx-auto-mode/index.ttl#auto_1',
    action: 'https://undefineds.co/ns#commandExecution',
    title: 'Native grant',
    summary: 'Native grant summary',
    body: 'Native grant wiki body.',
    schema: 'https://alice.example/settings/autonomy/schema/grant.ttl#GrantWikiPage',
    pageKind: 'autonomy-grant',
    wikiStatus: 'active',
    tags: JSON.stringify(['native', 'grant']),
    source: 'approval',
    sourceHash: 'approval:native',
    compiledAt: '2026-03-18T00:00:01.000Z',
    compiledFrom: ['https://alice.example/.data/approvals/2026/03/18.ttl#approval_native_1'],
    related: ['https://alice.example/.data/chat/linx-auto-mode/index.ttl#auto_1'],
    effect: 'allow',
    riskCeiling: 'medium',
    policy: 'Allow semantically equivalent command approvals.',
    context: JSON.stringify({ approval: 'approval_native_1' }),
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
  assert.equal(approvals[0].expiresAt, '2026-03-18T00:00:45.000Z')
  assert.deepEqual(JSON.parse(approvals[0].approvalOptions), [
    { optionId: 'allow_once', label: 'Allow once', kind: 'allow_once' },
    { optionId: 'allow_always', label: 'Always allow', kind: 'allow_always' },
  ])
  assert.equal(audits.length, 1)
  assert.equal(audits[0].approval, 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_native_1')
  assert.equal(audits[0].entry, 'https://alice.example/.data/chat/linx-auto-mode/index.ttl#auto_1')
  assert.equal(audits[0].toolName, 'commandExecution')
  assert.equal(grants.length, 1)
  assert.equal(grants[0].effect, 'allow')
  assert.equal(grants[0].title, 'Native grant')
  assert.equal(grants[0].summary, 'Native grant summary')
  assert.equal(grants[0].body, 'Native grant wiki body.')
  assert.equal(grants[0].schema, 'https://alice.example/settings/autonomy/schema/grant.ttl#GrantWikiPage')
  assert.equal(grants[0].pageKind, 'autonomy-grant')
  assert.equal(grants[0].wikiStatus, 'active')
  assert.equal(grants[0].tags, JSON.stringify(['native', 'grant']))
  assert.equal(grants[0].source, 'approval')
  assert.equal(grants[0].sourceHash, 'approval:native')
  assert.deepEqual(grants[0].compiledFrom, ['https://alice.example/.data/approvals/2026/03/18.ttl#approval_native_1'])
  assert.deepEqual(grants[0].related, ['https://alice.example/.data/chat/linx-auto-mode/index.ttl#auto_1'])
  assert.equal(grants[0].policy, 'Allow semantically equivalent command approvals.')
  assert.equal(grants[0].context, JSON.stringify({ approval: 'approval_native_1' }))
  assert.equal(writes.some((write) => write.url.endsWith('/.data/approvals/2026/03/18.ttl')), true)
  assert.equal(writes.some((write) => write.url.endsWith('/.data/audits/2026/03/18.ttl')), true)
  assert.equal(writes.some((write) => write.url.endsWith('/settings/autonomy/grants/grant_native_1.ttl')), true)
})
