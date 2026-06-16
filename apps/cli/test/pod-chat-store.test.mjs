import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

function createMockDb() {
  const inserts = []
  const updates = []
  const rows = new Map()

  function tableRows(resource) {
    const existing = rows.get(resource)
    if (existing) return existing
    const next = []
    rows.set(resource, next)
    return next
  }

  const db = {
    insert(resource) {
      return {
        values(value) {
          inserts.push({ resource, value })
          tableRows(resource).push(value)
          return {
            async execute() {
              return [value]
            },
          }
        },
      }
    },
    async findById(resource, id) {
      return tableRows(resource).find((row) => row.id === id) ?? null
    },
    async updateById(resource, id, value) {
      updates.push({ resource, id, value })
      const entries = tableRows(resource)
      const index = entries.findIndex((row) => row.id === id)
      if (index === -1) {
        const row = { id, ...value }
        entries.push(row)
        return row
      }
      entries[index] = { ...entries[index], ...value }
      return entries[index]
    },
    resolveLocatorId(_resource, locator) {
      if (locator && typeof locator === 'object' && 'chat' in locator && 'id' in locator) {
        return `${locator.chat}/index.ttl#${locator.id}`
      }
      return String(locator?.id ?? locator)
    },
    select() {
      return {
        from(resource) {
          return {
            where() {
              return this
            },
            orderBy() {
              return this
            },
            async execute() {
              return [...tableRows(resource)]
            },
          }
        },
      }
    },
  }

  return { db, inserts, updates }
}

function createSession() {
  return {
    info: {
      webId: 'https://alice.example/profile/card#me',
    },
  }
}

test('pod chat store models CLI message persistence as local-to-core Pod sync', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-chat-store.ts')
  t.after(() => cleanup())
  t.after(() => module.__podChatStoreInternal.resetRuntime())

  const { db, inserts, updates } = createMockDb()
  const syncResults = []
  let uuid = 0
  module.__podChatStoreInternal.setRuntime({
    createDb: () => db,
    now: () => new Date('2026-05-21T00:00:00.000Z'),
    randomUUID: () => `uuid-${++uuid}`,
    onSyncResult: (result) => syncResults.push(result),
  })

  await db.insert(module.__podChatStoreInternal.resources.threadResource).values({
    id: 'chat/cli-default/index.ttl#thread-1',
    parent: 'https://alice.example/.data/chat/cli-default/index.ttl#this',
  }).execute()

  await module.saveUserMessage(createSession(), 'cli-default', 'thread-1', 'hello from cli')

  const messageInsert = inserts.find((entry) => entry.resource === module.__podChatStoreInternal.resources.messageResource)
  assert.deepEqual(messageInsert?.value, {
    id: 'uuid-1',
    chat: 'https://alice.example/.data/chat/cli-default/index.ttl#this',
    thread: 'https://alice.example/.data/chat/cli-default/index.ttl#thread-1',
    maker: 'https://alice.example/profile/card#me',
    role: 'user',
    content: 'hello from cli',
    status: 'sent',
    createdAt: new Date('2026-05-21T00:00:00.000Z'),
  })
  assert.equal(updates.length, 2)

  assert.deepEqual(syncResults.map((result) => result.metadata.action), [
    'message.create',
    'chat.activity.update',
    'thread.touch',
  ])
  assert.deepEqual(syncResults.map((result) => result.source), [
    'cli-chat-store',
    'cli-chat-store',
    'cli-chat-store',
  ])
  assert.deepEqual(syncResults.map((result) => result.target), ['pod', 'pod', 'pod'])
  assert.deepEqual(syncResults.map((result) => result.direction), [
    'local-to-core',
    'local-to-core',
    'local-to-core',
  ])
  assert.deepEqual(syncResults.map((result) => result.plane), [
    'projection',
    'projection',
    'projection',
  ])
  assert.deepEqual(syncResults.map((result) => result.authority), ['core', 'core', 'core'])
  assert.deepEqual(syncResults.map((result) => result.status), [
    'completed',
    'completed',
    'completed',
  ])
})

test('pod chat store retries transient Pod write failures', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-chat-store.ts')
  t.after(() => cleanup())
  t.after(() => module.__podChatStoreInternal.resetRuntime())

  const { db } = createMockDb()
  let uuid = 0
  let messageAttempts = 0
  const originalInsert = db.insert.bind(db)
  db.insert = (resource) => {
    const builder = originalInsert(resource)
    if (resource !== module.__podChatStoreInternal.resources.messageResource) {
      return builder
    }
    return {
      values(value) {
        const query = builder.values(value)
        return {
          async execute() {
            messageAttempts += 1
            if (messageAttempts === 1) {
              throw new Error('SPARQL UPDATE failed: 502 Bad Gateway')
            }
            return query.execute()
          },
        }
      },
    }
  }

  module.__podChatStoreInternal.setRuntime({
    createDb: () => db,
    now: () => new Date('2026-05-21T00:00:00.000Z'),
    randomUUID: () => `uuid-${++uuid}`,
  })

  await db.insert(module.__podChatStoreInternal.resources.threadResource).values({
    id: 'chat/cli-default/index.ttl#thread-1',
    parent: 'https://alice.example/.data/chat/cli-default/index.ttl#this',
  }).execute()

  await module.saveUserMessage(createSession(), 'cli-default', 'thread-1', 'hello after retry')

  assert.equal(messageAttempts, 2)
})

test('pod chat store creates default CLI chat and thread without Reconciler type metadata', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pod-chat-store.ts')
  t.after(() => cleanup())
  t.after(() => module.__podChatStoreInternal.resetRuntime())

  const { db, inserts } = createMockDb()
  let uuid = 0
  module.__podChatStoreInternal.setRuntime({
    createDb: () => db,
    now: () => new Date('2026-06-14T00:00:00.000Z'),
    randomUUID: () => `uuid-${++uuid}`,
  })

  const chatId = await module.getOrCreateDefaultChat(createSession())
  const threadId = await module.createThread(createSession(), chatId, '/tmp/workspace', 'CLI direct thread')

  assert.equal(chatId, 'cli-default')
  assert.equal(threadId, 'uuid-1')

  const chatInsert = inserts.find((entry) => entry.resource === module.__podChatStoreInternal.resources.chatResource)
  assert.equal(chatInsert?.value.metadata?.coordinationKind, undefined)
  assert.equal(chatInsert?.value.metadata?.reconcilerOwner, undefined)

  const threadInsert = inserts.find((entry) => entry.resource === module.__podChatStoreInternal.resources.threadResource)
  assert.equal(threadInsert?.value.metadata?.coordinationKind, undefined)
  assert.equal(threadInsert?.value.metadata?.reconcilerOwner, undefined)
  assert.equal(threadInsert?.value.workspace, '/tmp/workspace')
})
