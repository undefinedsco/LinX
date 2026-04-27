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
  })), [
    {
      id: 'watch_2026-03-18T00-00-00-000Z_deadbeef-m0001',
      chat: 'linx-watch',
      thread: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
      maker: 'https://alice.example/profile/card#me',
      role: 'user',
      content: 'inspect workspace',
    },
    {
      id: 'watch_2026-03-18T00-00-00-000Z_deadbeef-m0002',
      chat: 'linx-watch',
      thread: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
      maker: 'https://alice.example/.data/agents/linx-watch-assistant.ttl',
      role: 'assistant',
      content: 'I found two issues.',
    },
    {
      id: 'watch_2026-03-18T00-00-00-000Z_deadbeef-m0003',
      chat: 'linx-watch',
      thread: 'watch_2026-03-18T00-00-00-000Z_deadbeef',
      maker: 'https://alice.example/.data/agents/linx-watch-assistant.ttl',
      role: 'system',
      content: '[tool] bash {"command":"pwd"}',
    },
  ])
})

test('persistWatchConversationToPod is skipped when linx login credentials are unavailable', async () => {
  const persisted = await persistenceModule.persistWatchConversationToPod(createRecord(), {
    loadCredentials: () => null,
  })

  assert.equal(persisted, false)
})
