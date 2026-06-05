import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

let persistenceModule
let cleanup

function createRecord(overrides = {}) {
  return {
    id: 'auto_2026-03-18T00-00-00-000Z_deadbeef',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
autoEnabled: true,
mode: 'auto',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    prompt: 'inspect workspace',
    passthroughArgs: [],
    credentialSource: 'cloud',
    resolvedCredentialSource: 'cloud',
    command: 'codex-acp',
    args: [],
    status: 'completed',
    startedAt: '2026-03-18T00:00:00.000Z',
    endedAt: '2026-03-18T00:01:00.000Z',
    archiveDir: '/tmp/demo/.linx/auto-mode/auto_2026-03-18T00-00-00-000Z_deadbeef',
    eventsFile: '/tmp/demo/.linx/auto-mode/auto_2026-03-18T00-00-00-000Z_deadbeef/events.jsonl',
    backendSessionId: 'sess_codex_123',
    ...overrides,
  }
}

test.before(async () => {
  const loaded = await loadAutoModeModule('lib/auto-mode/pod-persistence.ts')
  persistenceModule = loaded.module
  cleanup = loaded.cleanup
})

test.after(() => {
  cleanup?.()
})

test('buildAutoModeConversationMessages maps archived transcript into standard Pod message rows', () => {
  const rows = persistenceModule.__podPersistenceInternal.buildAutoModeConversationMessages(
    createRecord(),
    'https://alice.example/profile/card#me',
    [
      {
        timestamp: '2026-03-18T00:00:00.000Z',
        stream: 'system',
        line: JSON.stringify({ type: 'user.turn', text: 'inspect workspace' }),
        events: [],
      },
      {
        timestamp: '2026-03-18T00:00:01.000Z',
        stream: 'stdout',
        line: JSON.stringify({ type: 'session/update' }),
        events: [{ type: 'assistant.done', text: 'I found two issues.' }],
      },
      {
        timestamp: '2026-03-18T00:00:01.500Z',
        stream: 'stdout',
        line: JSON.stringify({ type: 'session/update' }),
        events: [{ type: 'approval.required', message: 'Allow bash?' }],
      },
      {
        timestamp: '2026-03-18T00:00:02.000Z',
        stream: 'stdout',
        line: JSON.stringify({ type: 'session/update' }),
        events: [{ type: 'tool.call', name: 'bash', arguments: { command: 'pwd' } }],
      },
    ],
  )

  assert.deepEqual(rows.map((row) => ({
    id: row.id,
    chat: row.chat,
    thread: row.thread,
    maker: row.maker,
    role: row.role,
    content: row.content,
    senderName: row.senderName,
    routedBy: row.routedBy,
    routeTargetAgent: row.routeTargetAgent,
    coordinationId: row.coordinationId,
  })), [
    {
      id: 'auto_2026-03-18T00-00-00-000Z_deadbeef-m0001',
      chat: 'linx-auto-mode-codex',
      thread: 'auto_2026-03-18T00-00-00-000Z_deadbeef',
      maker: 'https://alice.example/profile/card#me',
      role: 'user',
      content: 'inspect workspace',
      senderName: 'User',
      routedBy: undefined,
      routeTargetAgent: undefined,
      coordinationId: 'auto_2026-03-18T00-00-00-000Z_deadbeef',
    },
    {
      id: 'auto_2026-03-18T00-00-00-000Z_deadbeef-m0002',
      chat: 'linx-auto-mode-codex',
      thread: 'auto_2026-03-18T00-00-00-000Z_deadbeef',
      maker: 'https://alice.example/agents/linx-auto-mode-codex-agent/',
      role: 'assistant',
      content: 'I found two issues.',
      senderName: 'Codex',
      routedBy: undefined,
      routeTargetAgent: undefined,
      coordinationId: 'auto_2026-03-18T00-00-00-000Z_deadbeef',
    },
    {
      id: 'auto_2026-03-18T00-00-00-000Z_deadbeef-m0003',
      chat: 'linx-auto-mode-codex',
      thread: 'auto_2026-03-18T00-00-00-000Z_deadbeef',
      maker: 'https://alice.example/agents/__secretary__/',
      role: 'system',
      content: '[approval] Allow bash?',
      senderName: 'AI Secretary',
      routedBy: 'https://alice.example/agents/__secretary__/',
      routeTargetAgent: 'https://alice.example/agents/linx-auto-mode-codex-agent/',
      coordinationId: 'auto_2026-03-18T00-00-00-000Z_deadbeef',
    },
    {
      id: 'auto_2026-03-18T00-00-00-000Z_deadbeef-m0004',
      chat: 'linx-auto-mode-codex',
      thread: 'auto_2026-03-18T00-00-00-000Z_deadbeef',
      maker: 'https://alice.example/agents/linx-auto-mode-codex-agent/',
      role: 'system',
      content: '[tool] bash {"command":"pwd"}',
      senderName: 'Codex Tool',
      routedBy: 'https://alice.example/agents/linx-auto-mode-codex-agent/',
      routeTargetAgent: 'https://alice.example/agents/linx-auto-mode-codex-agent/',
      coordinationId: 'auto_2026-03-18T00-00-00-000Z_deadbeef',
    },
  ])
})

test('buildAutoModeConversationChatRow stores auto-mode as a group chat', () => {
  const row = persistenceModule.__podPersistenceInternal.buildAutoModeConversationChatRow(
    createRecord(),
    'https://alice.example/profile/card#me',
    'Last line',
  )

  assert.equal(row.id, 'linx-auto-mode-codex')
  assert.equal(row.title, 'LinX Auto Mode · Codex')
  assert.deepEqual(row.participants, [
    'https://alice.example/profile/card#me',
    'https://alice.example/agents/__secretary__/',
    'https://alice.example/agents/linx-auto-mode-codex-agent/',
  ])
  assert.equal(row.metadata.kind, 'auto-mode-group')
  assert.equal(row.metadata.backend, 'codex')
  assert.equal(row.metadata.secretaryAgent, 'https://alice.example/agents/__secretary__/')
  assert.equal(row.metadata.primaryAgent, 'https://alice.example/agents/linx-auto-mode-codex-agent/')
})

test('buildAutoModeConversationSessionRow stores auto-mode lifecycle as a Pod session projection', () => {
  const row = persistenceModule.__podPersistenceInternal.buildAutoModeConversationSessionRow(
    createRecord(),
    'https://alice.example/profile/card#me',
  )

  assert.equal(row.id, 'auto_2026-03-18T00-00-00-000Z_deadbeef')
  assert.equal(row.owner, 'https://alice.example/profile/card#me')
  assert.equal(row.chat, 'https://alice.example/.data/chat/linx-auto-mode-codex/index.ttl#this')
  assert.equal(row.thread, 'https://alice.example/.data/chat/linx-auto-mode-codex/index.ttl#auto_2026-03-18T00-00-00-000Z_deadbeef')
  assert.equal(row.sessionType, 'group')
  assert.equal(row.status, 'completed')
  assert.equal(row.tool, 'codex')
  assert.equal(row.policyVersion, 'linx-auto-mode-session/v1')
  assert.equal(row.metadata.backend, 'codex')
  assert.equal(row.metadata.backendSessionId, 'sess_codex_123')
  assert.equal(row.metadata.controlPlane.linxSession.autoEnabled, true)
  assert.equal(row.metadata.controlPlane.linxSession.updatedBy, 'cli')
  assert.equal(row.archivedAt.toISOString(), '2026-03-18T00:01:00.000Z')
})

test('auto-mode Pod resource URI builders resolve compound templates without placeholders', () => {
  const record = createRecord()
  const messageUri = persistenceModule.__podPersistenceInternal.buildAutoModeMessageUri(
    'https://alice.example/profile/card#me',
    record,
    {
      id: `${record.id}-m0001`,
      createdAt: new Date('2026-03-18T00:00:02.000Z'),
    },
  )

  assert.equal(
    persistenceModule.__podPersistenceInternal.buildAutoModeThreadUri('https://alice.example/profile/card#me', record),
    'https://alice.example/.data/chat/linx-auto-mode-codex/index.ttl#auto_2026-03-18T00-00-00-000Z_deadbeef',
  )
  assert.equal(
    persistenceModule.__podPersistenceInternal.buildAutoModeSessionUri('https://alice.example/profile/card#me', record),
    'https://alice.example/.data/sessions/2026/03/18/auto_2026-03-18T00-00-00-000Z_deadbeef.ttl',
  )
  assert.equal(
    messageUri,
    'https://alice.example/.data/chat/linx-auto-mode-codex/2026/03/18/messages.ttl#auto_2026-03-18T00-00-00-000Z_deadbeef-m0001',
  )
  assert.equal(/[{}]/.test(messageUri), false)
})

test('persistAutoModeConversationToPod is skipped when linx login credentials are unavailable', async () => {
  const persisted = await persistenceModule.persistAutoModeConversationToPod(createRecord(), {
    getPodDataSession: async () => null,
  })

  assert.equal(persisted, false)
})

test('persistAutoModeConversationToPod upserts group chat, participants, agents, thread, and sender metadata', async () => {
  const inserts = []
  const findIds = []
  const checkpoints = []
  const resources = {
    chat: {
      name: 'chat',
      resolveUri: (id) => `/.data/chat/${id}/index.ttl#this`,
    },
    thread: {
      name: 'thread',
      resolveUri: (id) => `/.data/chat/{chat|id}/index.ttl#${id}`,
    },
    message: {
      name: 'message',
      resolveUri: (id) => `/.data/chat/{chat|id}/{yyyy}/{MM}/{dd}/messages.ttl#${id}`,
    },
    session: {
      name: 'session',
      resolveUri: (id) => `/.data/sessions/{yyyy}/{MM}/{dd}/${id}.ttl`,
    },
    agent: {
      name: 'agent',
      buildId: ({ id }) => `${id}/`,
      resolveUri: (id) => `/agents/${id}/`,
    },
  }
  const db = {
    init: async () => undefined,
    findById: async (_resource, id) => {
      findIds.push(id)
      return null
    },
    updateById: async () => {
      throw new Error('unexpected update')
    },
    insert(resource) {
      return {
        values(value) {
          inserts.push({ resource, value })
          return {
            execute: async () => undefined,
          }
        },
      }
    },
    update() {
      throw new Error('unexpected update')
    },
    select() {
      throw new Error('unexpected select')
    },
  }

  const persisted = await persistenceModule.persistAutoModeConversationToPod(createRecord(), {
    getPodDataSession: async () => ({
      webId: 'https://alice.example/profile/card#me',
    }),
    createDb: () => db,
    chatResource: resources.chat,
    threadResource: resources.thread,
    messageResource: resources.message,
    sessionResource: resources.session,
    agentResource: resources.agent,
    loadAutoModeEvents: () => [
      {
        timestamp: '2026-03-18T00:00:00.000Z',
        stream: 'system',
        line: JSON.stringify({ type: 'user.turn', text: 'inspect workspace' }),
        events: [],
      },
      {
        timestamp: '2026-03-18T00:00:01.000Z',
        stream: 'stdout',
        line: JSON.stringify({ type: 'session/update' }),
        events: [{ type: 'assistant.done', text: 'I found two issues.' }],
      },
    ],
    writeSyncCheckpoint: async (_record, checkpoint) => {
      checkpoints.push(checkpoint)
    },
  })

  assert.equal(persisted, true)
  assert.equal(checkpoints.length, 1)
  assert.equal(checkpoints[0].id, 'auto-mode-archive:pod:projection')
  assert.equal(checkpoints[0].status, 'completed')
  assert.equal(checkpoints[0].metadata.sessionId, 'auto_2026-03-18T00-00-00-000Z_deadbeef')
  assert.equal(checkpoints[0].metadata.backend, 'codex')
  assert.ok(findIds.includes('linx-auto-mode-codex'))
  assert.ok(findIds.includes('auto_2026-03-18T00-00-00-000Z_deadbeef'))
  assert.ok(findIds.includes('auto_2026-03-18T00-00-00-000Z_deadbeef-m0001'))
  assert.equal(findIds.some((id) => /[{}]/.test(id)), false)

  const chat = inserts.find((item) => item.resource === resources.chat)?.value
  assert.equal(chat.id, 'linx-auto-mode-codex')
  assert.deepEqual(chat.participants, [
    'https://alice.example/profile/card#me',
    'https://alice.example/agents/__secretary__/',
    'https://alice.example/agents/linx-auto-mode-codex-agent/',
  ])
  assert.equal(chat.metadata.kind, 'auto-mode-group')

  const agentIds = inserts
    .filter((item) => item.resource === resources.agent)
    .map((item) => item.value.id)
    .sort()
  assert.deepEqual(agentIds, [
    '__secretary__/',
    'linx-auto-mode-codex-agent/',
  ])

  const thread = inserts.find((item) => item.resource === resources.thread)?.value
  assert.equal(thread.chat, 'linx-auto-mode-codex')
  assert.equal(thread.metadata.kind, 'auto-mode')
  assert.equal(thread.metadata.chatId, 'linx-auto-mode-codex')

  const session = inserts.find((item) => item.resource === resources.session)?.value
  assert.equal(session.id, 'auto_2026-03-18T00-00-00-000Z_deadbeef')
  assert.equal(session.chat, 'https://alice.example/.data/chat/linx-auto-mode-codex/index.ttl#this')
  assert.equal(session.thread, 'https://alice.example/.data/chat/linx-auto-mode-codex/index.ttl#auto_2026-03-18T00-00-00-000Z_deadbeef')
  assert.equal(session.status, 'completed')
  assert.equal(session.tool, 'codex')
  assert.equal(session.metadata.backendSessionId, 'sess_codex_123')
  assert.equal(session.metadata.controlPlane.linxSession.autoEnabled, true)

  const messages = inserts
    .filter((item) => item.resource === resources.message)
    .map((item) => item.value)
  assert.equal(messages[0].senderName, 'User')
  assert.equal(messages[1].maker, 'https://alice.example/agents/linx-auto-mode-codex-agent/')
  assert.equal(messages[1].senderName, 'Codex')
  assert.equal(messages[1].coordinationId, 'auto_2026-03-18T00-00-00-000Z_deadbeef')
})

test('persistAutoModeConversationToPod reuses canonical Secretary Agent without overwriting runtime config', async () => {
  const inserted = []
  const updates = []
  const resources = {
    chat: {
      name: 'chat',
      resolveUri: (id) => `/.data/chat/${id}/index.ttl#this`,
    },
    thread: {
      name: 'thread',
      resolveUri: (id) => `/.data/chat/{chat|id}/index.ttl#${id}`,
    },
    message: {
      name: 'message',
      resolveUri: (id) => `/.data/chat/{chat|id}/{yyyy}/{MM}/{dd}/messages.ttl#${id}`,
    },
    session: {
      name: 'session',
      resolveUri: (id) => `/.data/sessions/{yyyy}/{MM}/{dd}/${id}.ttl`,
    },
    agent: {
      name: 'agent',
      buildId: ({ id }) => `${id}/`,
      resolveUri: (id) => `/agents/${id}/`,
    },
  }
  const existingSecretary = {
    id: '__secretary__/',
    name: 'Canonical Secretary',
    provider: 'undefineds',
    model: 'linx-cloud-model',
    backend: 'linx',
  }
  const db = {
    init: async () => undefined,
    findById: async (resource, id) => {
      if (resource === resources.agent && id === '__secretary__/') {
        return existingSecretary
      }
      return null
    },
    updateById: async (resource, id, patch) => {
      updates.push({ resource, id, patch })
    },
    insert(resource) {
      return {
        values(value) {
          inserted.push({ resource, value })
          return {
            execute: async () => undefined,
          }
        },
      }
    },
    update() {
      throw new Error('unexpected update')
    },
    select() {
      throw new Error('unexpected select')
    },
  }

  const persisted = await persistenceModule.persistAutoModeConversationToPod(createRecord(), {
    getPodDataSession: async () => ({
      webId: 'https://alice.example/profile/card#me',
    }),
    createDb: () => db,
    chatResource: resources.chat,
    threadResource: resources.thread,
    messageResource: resources.message,
    sessionResource: resources.session,
    agentResource: resources.agent,
    loadAutoModeEvents: () => [],
  })

  assert.equal(persisted, true)
  assert.equal(inserted.some((item) => item.resource === resources.agent && item.value.id === '__secretary__/'), false)
  assert.equal(updates.some((item) => item.resource === resources.agent && item.id === '__secretary__/'), false)
  assert.equal(inserted.some((item) => item.resource === resources.agent && item.value.id === 'linx-auto-mode-codex-agent/'), true)
})
