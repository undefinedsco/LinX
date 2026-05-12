import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

let persistenceModule
let cleanup

function createRecord(overrides = {}) {
  return {
    id: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
    mode: 'smart',
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
    archiveDir: '/tmp/demo/.linx/watch/watch_2026-03-18T00-00-00-000Z_deadbeef',
    eventsFile: '/tmp/demo/.linx/watch/watch_2026-03-18T00-00-00-000Z_deadbeef/events.jsonl',
    backendSessionId: 'sess_codex_123',
    ...overrides,
  }
}

test.before(async () => {
  const loaded = await loadWatchModule('lib/watch/pod-persistence.ts')
  persistenceModule = loaded.module
  cleanup = loaded.cleanup
})

test.after(() => {
  cleanup?.()
})

test('buildWatchConversationMessages maps archived transcript into standard Pod message rows', () => {
  const rows = persistenceModule.__podPersistenceInternal.buildWatchConversationMessages(
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
    routeTargetAgentId: row.routeTargetAgentId,
    coordinationId: row.coordinationId,
  })), [
    {
      id: 'watch_2026-03-18T00-00-00-000Z_deadbeef-m0001',
      chat: 'linx-watch-codex',
      thread: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
      maker: 'https://alice.example/profile/card#me',
      role: 'user',
      content: 'inspect workspace',
      senderName: 'User',
      routedBy: undefined,
      routeTargetAgentId: undefined,
      coordinationId: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
    },
    {
      id: 'watch_2026-03-18T00-00-00-000Z_deadbeef-m0002',
      chat: 'linx-watch-codex',
      thread: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
      maker: 'https://alice.example/.data/agents/linx-watch-codex-agent.ttl',
      role: 'assistant',
      content: 'I found two issues.',
      senderName: 'Codex',
      routedBy: undefined,
      routeTargetAgentId: undefined,
      coordinationId: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
    },
    {
      id: 'watch_2026-03-18T00-00-00-000Z_deadbeef-m0003',
      chat: 'linx-watch-codex',
      thread: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
      maker: 'https://alice.example/.data/agents/linx-watch-assistant.ttl',
      role: 'system',
      content: '[approval] Allow bash?',
      senderName: 'AI Secretary',
      routedBy: 'https://alice.example/.data/agents/linx-watch-assistant.ttl',
      routeTargetAgentId: 'linx-watch-codex-agent',
      coordinationId: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
    },
    {
      id: 'watch_2026-03-18T00-00-00-000Z_deadbeef-m0004',
      chat: 'linx-watch-codex',
      thread: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
      maker: 'https://alice.example/.data/agents/linx-watch-codex-agent.ttl',
      role: 'system',
      content: '[tool] bash {"command":"pwd"}',
      senderName: 'Codex Tool',
      routedBy: 'https://alice.example/.data/agents/linx-watch-codex-agent.ttl',
      routeTargetAgentId: 'linx-watch-codex-agent',
      coordinationId: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
    },
  ])
})

test('buildWatchConversationChatRow stores watch as a backend group chat', () => {
  const row = persistenceModule.__podPersistenceInternal.buildWatchConversationChatRow(
    createRecord(),
    'https://alice.example/profile/card#me',
    'Last line',
  )

  assert.equal(row.id, 'linx-watch-codex')
  assert.equal(row.title, 'LinX Watch · Codex')
  assert.deepEqual(row.participants, [
    'https://alice.example/profile/card#me',
    'https://alice.example/.data/agents/linx-watch-assistant.ttl',
    'https://alice.example/.data/agents/linx-watch-codex-agent.ttl',
  ])
  assert.equal(row.metadata.kind, 'watch-group')
  assert.equal(row.metadata.backend, 'codex')
  assert.equal(row.metadata.secretaryAgent, 'https://alice.example/.data/agents/linx-watch-assistant.ttl')
  assert.equal(row.metadata.primaryAgent, 'https://alice.example/.data/agents/linx-watch-codex-agent.ttl')
})

test('persistWatchConversationToPod is skipped when linx login credentials are unavailable', async () => {
  const persisted = await persistenceModule.persistWatchConversationToPod(createRecord(), {
    getPodDataSession: async () => null,
  })

  assert.equal(persisted, false)
})

test('persistWatchConversationToPod upserts group chat, participants, agents, thread, and sender metadata', async () => {
  const inserts = []
  const tables = {
    chat: { name: 'chat' },
    thread: { name: 'thread' },
    message: { name: 'message' },
    agent: { name: 'agent' },
  }
  const db = {
    init: async () => undefined,
    findByIri: async () => null,
    findByLocator: async () => null,
    insert(table) {
      return {
        values(value) {
          inserts.push({ table, value })
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

  const persisted = await persistenceModule.persistWatchConversationToPod(createRecord(), {
    getPodDataSession: async () => ({
      webId: 'https://alice.example/profile/card#me',
    }),
    createDb: () => db,
    chatTable: tables.chat,
    threadTable: tables.thread,
    messageTable: tables.message,
    agentTable: tables.agent,
    loadWatchEvents: () => [
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
  })

  assert.equal(persisted, true)

  const chat = inserts.find((item) => item.table === tables.chat)?.value
  assert.equal(chat.id, 'linx-watch-codex')
  assert.deepEqual(chat.participants, [
    'https://alice.example/profile/card#me',
    'https://alice.example/.data/agents/linx-watch-assistant.ttl',
    'https://alice.example/.data/agents/linx-watch-codex-agent.ttl',
  ])
  assert.equal(chat.metadata.kind, 'watch-group')

  const agentIds = inserts
    .filter((item) => item.table === tables.agent)
    .map((item) => item.value.id)
    .sort()
  assert.deepEqual(agentIds, ['linx-watch-assistant', 'linx-watch-codex-agent'])

  const thread = inserts.find((item) => item.table === tables.thread)?.value
  assert.equal(thread.chat, 'linx-watch-codex')
  assert.equal(thread.metadata.kind, 'watch')
  assert.equal(thread.metadata.chatId, 'linx-watch-codex')

  const messages = inserts
    .filter((item) => item.table === tables.message)
    .map((item) => item.value)
  assert.equal(messages[0].senderName, 'User')
  assert.equal(messages[1].maker, 'https://alice.example/.data/agents/linx-watch-codex-agent.ttl')
  assert.equal(messages[1].senderName, 'Codex')
  assert.equal(messages[1].coordinationId, 'watch_2026-03-18T00-00-00-000Z_deadbeef')
})
