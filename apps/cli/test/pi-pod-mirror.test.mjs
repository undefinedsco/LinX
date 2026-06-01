import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

function createSessionManager() {
  const entries = []
  return {
    getSessionId() {
      return '019df000-aaaa-bbbb-cccc-000000000001'
    },
    getSessionFile() {
      return '/tmp/demo/session.jsonl'
    },
    getSessionName() {
      return undefined
    },
    getEntries() {
      return entries
    },
    appendTestEntry(entry) {
      entries.push(entry)
    },
  }
}

function createFakePodRuntime() {
  const rows = new Map()
  const writes = []
  const webId = 'https://id.undefineds.co/alice/profile/card#me'
  const podBase = 'https://id.undefineds.co/alice'
  const tableName = (table) => table?.config?.name ?? 'unknown'
  const dateParts = (value, includeDay = false) => {
    const date = value instanceof Date ? value : new Date(value)
    const yyyy = String(date.getUTCFullYear())
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(date.getUTCDate()).padStart(2, '0')
    return includeDay ? { yyyy, mm, dd } : { yyyy, mm }
  }
  const chatIdFromRef = (ref) => {
    const value = String(ref ?? '')
    const match = value.match(/\/\.data\/chat\/([^/]+)\/index\.ttl/)
    return match ? decodeURIComponent(match[1]) : value
  }
  const resolveLocatorIri = (table, locator) => {
    const name = tableName(table)
    if (name === 'chats') {
      return `${podBase}/.data/chat/${encodeURIComponent(locator.id)}/index.ttl#this`
    }
    if (name === 'thread') {
      const chatId = chatIdFromRef(locator.chat)
      return `${podBase}/.data/chat/${encodeURIComponent(chatId)}/index.ttl#${encodeURIComponent(locator.id)}`
    }
    if (name === 'agent') {
      return `${podBase}/.data/agents/${encodeURIComponent(locator.id)}.ttl`
    }
    if (name === 'session') {
      const { yyyy, mm, dd } = dateParts(locator.createdAt, true)
      return `${podBase}/.data/sessions/${yyyy}/${mm}/${dd}/${encodeURIComponent(locator.id)}.ttl`
    }
    if (name === 'chat_message') {
      const chatId = chatIdFromRef(locator.chat)
      const { yyyy, mm, dd } = dateParts(locator.createdAt, true)
      return `${podBase}/.data/chat/${encodeURIComponent(chatId)}/${yyyy}/${mm}/${dd}/messages.ttl#${encodeURIComponent(locator.id)}`
    }
    if (name === 'audit') {
      const { yyyy, mm, dd } = dateParts(locator.createdAt, true)
      return `${podBase}/.data/audits/${yyyy}/${mm}/${dd}.ttl#${encodeURIComponent(locator.id)}`
    }
    throw new Error(`Unsupported table in fake Pod DB: ${name}`)
  }
  const rowLocator = (table, row) => {
    const name = tableName(table)
    if (name === 'thread') return { id: row.id, chat: row.chat }
    if (name === 'session') return { id: row.id, createdAt: row.createdAt }
    if (name === 'chat_message') return { id: row.id, chat: row.chat, createdAt: row.createdAt }
    if (name === 'audit') return { id: row.id, createdAt: row.createdAt }
    return { id: row.id }
  }
  const db = {
    async init() {},
    resolveLocatorIri,
    async findById(table, id) {
      const exact = [...rows.values()].find((row) => row.id === id)
      if (exact) return exact
      const suffix = `#${encodeURIComponent(id)}`
      const documentSuffix = `/${encodeURIComponent(id)}.ttl`
      return [...rows.entries()].find(([iri]) => iri.endsWith(suffix) || iri.endsWith(documentSuffix))?.[1] ?? null
    },
    async findByIri(_table, iri) {
      return rows.get(iri) ?? null
    },
    async updateById(table, id, patch) {
      const existing = await this.findById(table, id)
      const iri = existing?.['@id'] ?? existing?.subject ?? existing?.uri
      if (typeof iri !== 'string') return null
      const next = { ...existing, ...patch, '@id': iri, subject: iri, uri: iri }
      rows.set(iri, next)
      writes.push({ op: 'update', table: tableName(table), iri, row: next })
      return next
    },
    async updateByIri(table, iri, patch) {
      const existing = rows.get(iri)
      if (!existing) return null
      const next = { ...existing, ...patch, '@id': iri, subject: iri, uri: iri }
      rows.set(iri, next)
      writes.push({ op: 'update', table: tableName(table), iri, row: next })
      return next
    },
    insert(table) {
      return {
        values(row) {
          return {
            async execute() {
              const iri = resolveLocatorIri(table, rowLocator(table, row))
              const next = { ...row, '@id': iri, subject: iri, uri: iri }
              rows.set(iri, next)
              writes.push({ op: 'insert', table: tableName(table), iri, row: next })
              return [next]
            },
          }
        },
      }
    },
  }
  return {
    runtime: {
      async getPodDataSession() {
        return {
          credentials: {
            authType: 'oidc_oauth',
            url: 'https://id.undefineds.co/',
            webId,
          },
          webId,
          async close() {},
          async fetch() {
            return new Response('fake ORM runtime should not use raw fetch', { status: 500 })
          },
        }
      },
      createDb() {
        return db
      },
    },
    rows,
    writes,
  }
}

test('buildPodMessageRow maps Pi user and assistant messages into standard Pod message rows', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-mirror-mapping.ts')
  t.after(() => cleanup())

  const userRow = module.buildPodMessageRow(
    'https://id.undefineds.co/alice/profile/card#me',
    { sessionManager: createSessionManager() },
    {
      type: 'message',
      id: 'u1',
      parentId: null,
      timestamp: '2026-04-01T00:00:00.000Z',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'hello pod' }],
        timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
      },
    },
  )

  assert.equal(userRow.id, '019df000-aaaa-bbbb-cccc-000000000001-u1')
  assert.match(userRow.chat, /\/\.data\/chat\/ai-secretary\/index\.ttl#this$/)
  assert.match(userRow.thread, /\/\.data\/chat\/ai-secretary\/index\.ttl#019df000-aaaa-bbbb-cccc-000000000001$/)
  assert.equal(userRow.maker, 'https://id.undefineds.co/alice/profile/card#me')
  assert.equal(userRow.role, 'user')
  assert.equal(userRow.content, 'hello pod')
  assert.equal(userRow.status, 'sent')

  const assistantRow = module.buildPodMessageRow(
    'https://id.undefineds.co/alice/profile/card#me',
    { sessionManager: createSessionManager() },
    {
      type: 'message',
      id: 'a1',
      parentId: 'u1',
      timestamp: '2026-04-01T00:00:01.000Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'reasoning', thinkingSignature: 'reasoning_content' },
          { type: 'text', text: 'answer' },
          { type: 'toolCall', id: 'call_1', name: 'bash', arguments: { cmd: 'pwd' } },
        ],
        api: 'openai-completions',
        provider: 'undefineds',
        model: 'linx-lite',
        usage: {
          input: 10,
          output: 5,
          cacheRead: 2,
          cacheWrite: 0,
          totalTokens: 17,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'toolUse',
        timestamp: Date.parse('2026-04-01T00:00:01.000Z'),
      },
    },
  )

  assert.equal(assistantRow.maker, 'https://id.undefineds.co/alice/.data/agents/ai-secretary.ttl')
  assert.equal(assistantRow.role, 'assistant')
  assert.match(assistantRow.content, /answer/)
  assert.match(assistantRow.content, /tool-call:bash/)
})

test('buildPodMessageRow keeps tool results as system messages linked to the same chat/thread', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-mirror-mapping.ts')
  t.after(() => cleanup())

  const row = module.buildPodMessageRow(
    'https://id.undefineds.co/alice/profile/card#me',
    { sessionManager: createSessionManager() },
    {
      type: 'message',
      id: 't1',
      parentId: 'a1',
      timestamp: '2026-04-01T00:00:02.000Z',
      message: {
        role: 'toolResult',
        toolCallId: 'call_1',
        toolName: 'bash',
        content: [{ type: 'text', text: '/tmp/demo' }],
        isError: false,
        timestamp: Date.parse('2026-04-01T00:00:02.000Z'),
      },
    },
  )

  assert.match(row.chat, /\/\.data\/chat\/ai-secretary\/index\.ttl#this$/)
  assert.match(row.thread, /\/\.data\/chat\/ai-secretary\/index\.ttl#019df000-aaaa-bbbb-cccc-000000000001$/)
  assert.equal(row.role, 'system')
  assert.equal(row.content, '[tool:bash] /tmp/demo')
})

test('LinxPiPodMirror persists Pi session events into Pod tables', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-mirror.ts')
  t.after(() => cleanup())

  const sessionManager = createSessionManager()
  const message = {
    role: 'user',
    content: [{ type: 'text', text: 'persist through mirror' }],
    timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
  }
  sessionManager.appendTestEntry({
    type: 'message',
    id: 'u1',
    parentId: null,
    timestamp: '2026-04-01T00:00:00.000Z',
    message,
  })

  const { runtime, rows, writes } = createFakePodRuntime()
  const mirror = new module.LinxPiPodMirror({
    cwd: '/tmp/demo',
    sessionManager,
    runtime,
    syncConversationRoot: true,
  })

  mirror.handleEvent({ type: 'message_end', message })
  await mirror.flush()
  await mirror.close()

  const rowValues = [...rows.values()]
  assert.equal(rowValues.some((row) => row.title === 'AI Secretary'), true)
  assert.equal(rowValues.some((row) => row.name === 'LinX CLI Assistant'), true)
  assert.equal(rowValues.some((row) => row.tool === 'linx' && row.status === 'completed'), true)
  assert.equal(rowValues.some((row) => row.content === 'persist through mirror'), true)
  assert.equal(writes.some((write) => write.table === 'chats' && write.iri.endsWith('/.data/chat/ai-secretary/index.ttl#this')), true)
  assert.equal(writes.some((write) => write.table === 'session' && /\/\.data\/sessions\/2026\/04\/01\/[^/]+\.ttl$/.test(write.iri)), true)
  assert.equal(writes.filter((write) => write.table === 'session' && write.op === 'insert').length, 1)
  assert.equal(writes.filter((write) => write.table === 'session' && write.op === 'update').length, 1)
  assert.equal(writes.some((write) => write.table === 'chat_message' && /\/\.data\/chat\/ai-secretary\/2026\/04\/01\/messages\.ttl#/.test(write.iri)), true)
  assert.equal(writes.some((write) => write.table === 'audit'), false)
})

test('LinxPiPodMirror projects auto control-plane state into Pod session metadata', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-mirror.ts')
  t.after(() => cleanup())

  const sessionManager = createSessionManager()
  const { runtime, rows, writes } = createFakePodRuntime()
  const mirror = new module.LinxPiPodMirror({
    cwd: '/tmp/demo',
    sessionManager,
    runtime,
    autoEnabled: true,
  })

  await mirror.syncAutoControlState(false)

  const sessionRows = [...rows.values()].filter((row) => row.tool === 'linx')
  assert.equal(sessionRows.length, 1)
  assert.equal(sessionRows[0].metadata.controlPlane.linxSession.autoEnabled, false)
  assert.equal(sessionRows[0].metadata.controlPlane.linxSession.symphonyEnabled, false)
  assert.equal(sessionRows[0].metadata.controlPlane.linxSession.updatedBy, 'cli')
  assert.equal(writes.some((write) => write.table === 'session' && write.op === 'insert'), true)
  assert.equal(mirror.getSyncResults().at(-1).plane, 'control-plane')
})

test('LinxPiPodMirror projects symphony control-plane state into Pod session metadata', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-mirror.ts')
  t.after(() => cleanup())

  const sessionManager = createSessionManager()
  const { runtime, rows } = createFakePodRuntime()
  const mirror = new module.LinxPiPodMirror({
    cwd: '/tmp/demo',
    sessionManager,
    runtime,
    autoEnabled: true,
    symphonyEnabled: false,
  })

  await mirror.syncSymphonyControlState(true)

  const sessionRows = [...rows.values()].filter((row) => row.tool === 'linx')
  assert.equal(sessionRows.length, 1)
  assert.equal(sessionRows[0].metadata.controlPlane.linxSession.autoEnabled, true)
  assert.equal(sessionRows[0].metadata.controlPlane.linxSession.symphonyEnabled, true)
  assert.equal(sessionRows[0].metadata.controlPlane.linxSession.updatedBy, 'cli')
  assert.equal(mirror.getSyncResults().at(-1).plane, 'control-plane')
})

test('LinxPiPodMirror keeps auto control-plane state while updating runtime session projection', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-mirror.ts')
  t.after(() => cleanup())

  const sessionManager = createSessionManager()
  const message = {
    role: 'user',
    content: [{ type: 'text', text: 'auto metadata stays' }],
    timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
  }
  sessionManager.appendTestEntry({
    type: 'message',
    id: 'u1',
    parentId: null,
    timestamp: '2026-04-01T00:00:00.000Z',
    message,
  })

  const { runtime, rows } = createFakePodRuntime()
  const mirror = new module.LinxPiPodMirror({
    cwd: '/tmp/demo',
    sessionManager,
    runtime,
    autoEnabled: true,
  })

  mirror.handleEvent({ type: 'message_end', message })
  await mirror.flush()

  const sessionRow = [...rows.values()].find((row) => row.tool === 'linx')
  assert.equal(sessionRow.metadata.controlPlane.linxSession.autoEnabled, true)
  assert.equal(sessionRow.metadata.controlPlane.linxSession.symphonyEnabled, false)
})

test('LinxPiPodMirror writes tool execution audits to Pod tables', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-mirror.ts')
  t.after(() => cleanup())

  const sessionManager = createSessionManager()
  const { runtime, rows } = createFakePodRuntime()
  const mirror = new module.LinxPiPodMirror({
    cwd: '/tmp/demo',
    sessionManager,
    runtime,
    syncConversationRoot: true,
  })

  mirror.handleEvent({
    type: 'tool_execution_start',
    toolCallId: 'call-1',
    toolName: 'bash',
    args: { command: 'pwd' },
  })
  mirror.handleEvent({
    type: 'tool_execution_end',
    toolCallId: 'call-1',
    toolName: 'bash',
    result: { content: [{ type: 'text', text: '/tmp/demo' }] },
    isError: false,
  })

  await mirror.flush()
  await mirror.close()

  const auditRows = [...rows.entries()].filter(([iri, row]) => iri.includes('/.data/audits/') && row.toolCallId === 'call-1')
  assert.equal(auditRows.length, 2)
  assert.equal(auditRows.every(([iri]) => /\/\.data\/audits\/\d{4}\/\d{2}\/\d{2}\.ttl#/.test(iri)), true)
  assert.equal(auditRows.some(([iri]) => iri.includes(sessionManager.getSessionId())), false)
  assert.equal(auditRows.some(([iri]) => iri.includes('call-1')), false)
  assert.equal(auditRows.some(([, row]) => row.action === 'tool_execution_started'), true)
  assert.equal(auditRows.some(([, row]) => row.action === 'tool_execution_completed'), true)
  assert.equal(auditRows.every(([, row]) => row.toolName === 'bash'), true)
  assert.equal(auditRows.every(([, row]) => !('context' in row)), true)
  assert.equal(auditRows.every(([, row]) => JSON.stringify(row).includes('pwd') === false), true)
})

test('LinxPiPodMirror records failed streaming projection checkpoints', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/pod-mirror.ts')
  t.after(() => cleanup())

  const sessionManager = createSessionManager()
  const message = {
    role: 'user',
    content: [{ type: 'text', text: 'fail checkpoint' }],
    timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
  }
  sessionManager.appendTestEntry({
    type: 'message',
    id: 'u1',
    parentId: null,
    timestamp: '2026-04-01T00:00:00.000Z',
    message,
  })

  const errors = []
  const mirror = new module.LinxPiPodMirror({
    cwd: '/tmp/demo',
    sessionManager,
    runtime: {
      async getPodDataSession() {
        return {
          webId: 'https://id.undefineds.co/alice/profile/card#me',
          async fetch() {
            return new Response('', { status: 500 })
          },
        }
      },
      createDb() {
        return {
          insert() {
            return {
              values() {
                return {
                  async execute() {
                    throw new Error('pod write failed')
                  },
                }
              },
            }
          },
          async findByIri() {
            return null
          },
          resolveLocatorIri() {
            return 'https://id.undefineds.co/alice/.data/fake.ttl#id'
          },
        }
      },
    },
    onError(error) {
      errors.push(error)
    },
  })

  mirror.handleEvent({ type: 'message_end', message })
  await mirror.flush()

  assert.equal(errors.length, 1)
  const checkpoints = mirror.getSyncCheckpoints()
  assert.equal(checkpoints.length, 1)
  assert.equal(checkpoints[0].status, 'failed')
  assert.deepEqual(checkpoints[0].metadata.resourceBindings.session, {
    uri: 'https://id.undefineds.co/alice/.data/fake.ttl#id',
    local: sessionManager.getSessionId(),
  })
  assert.deepEqual(checkpoints[0].metadata.resourceBindings.thread, {
    uri: 'https://id.undefineds.co/alice/.data/fake.ttl#id',
    local: sessionManager.getSessionId(),
  })
  assert.deepEqual(checkpoints[0].metadata.resourceBindings.chat, {
    uri: 'https://id.undefineds.co/alice/.data/fake.ttl#id',
    local: 'ai-secretary',
  })
  assert.match(checkpoints[0].failures[0].message, /pod write failed/)
})

test('file sync checkpoint store persists queryable checkpoints across instances', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/sync-checkpoint-store.ts')
  t.after(() => cleanup())

  const dir = mkdtempSync(join(tmpdir(), 'linx-sync-checkpoints-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const first = module.createFileSyncCheckpointStore({ dir })
  first.writeCheckpoint({
    id: 'checkpoint/one',
    source: 'pi-runtime',
    target: 'pod',
    direction: 'local-to-core',
    plane: 'projection',
    authority: 'core',
    status: 'failed',
    attempted: 1,
    applied: 0,
    skipped: 0,
    failed: 1,
    failures: [{ operationId: 'op', message: 'pod unavailable' }],
    startedAt: '2026-04-01T00:00:00.000Z',
    completedAt: '2026-04-01T00:00:01.000Z',
    metadata: { resourceBindings: { session: { local: 's1' } } },
  })

  const second = module.createFileSyncCheckpointStore({ dir })
  assert.equal(readdirSync(dir).length, 1)
  assert.equal(second.readCheckpoint('checkpoint/one').status, 'failed')
  assert.deepEqual(second.listCheckpoints({ status: 'failed', metadata: { resourceBindings: { session: { local: 's1' } } } }).map((item) => item.id), [
    'checkpoint/one',
  ])
})

test('LinxPiPodMirror persists failed streaming projection checkpoints to disk', async (t) => {
  const { module: mirrorModule, cleanup: cleanupMirror } = await loadAutoModeModule('lib/pi-adapter/pod-mirror.ts')
  const { module: storeModule, cleanup: cleanupStore } = await loadAutoModeModule('lib/sync-checkpoint-store.ts')
  t.after(() => {
    cleanupMirror()
    cleanupStore()
  })

  const dir = mkdtempSync(join(tmpdir(), 'linx-pi-mirror-checkpoints-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const sessionManager = createSessionManager()
  const message = {
    role: 'user',
    content: [{ type: 'text', text: 'persist failed checkpoint' }],
    timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
  }
  sessionManager.appendTestEntry({
    type: 'message',
    id: 'u1',
    parentId: null,
    timestamp: '2026-04-01T00:00:00.000Z',
    message,
  })

  const checkpointStore = storeModule.createFileSyncCheckpointStore({ dir })
  const mirror = new mirrorModule.LinxPiPodMirror({
    cwd: '/tmp/demo',
    sessionManager,
    checkpointStore,
    runtime: {
      async getPodDataSession() {
        return {
          webId: 'https://id.undefineds.co/alice/profile/card#me',
          async fetch() {
            return new Response('', { status: 500 })
          },
        }
      },
      createDb() {
        return {
          insert() {
            return {
              values() {
                return {
                  async execute() {
                    throw new Error('pod write failed')
                  },
                }
              },
            }
          },
          async findByIri() {
            return null
          },
          resolveLocatorIri() {
            return 'https://id.undefineds.co/alice/.data/fake.ttl#id'
          },
        }
      },
    },
  })

  mirror.handleEvent({ type: 'message_end', message })
  await mirror.flush()

  const reloaded = storeModule.createFileSyncCheckpointStore({ dir })
  const pending = reloaded.listCheckpoints({
    source: 'pi-runtime',
    target: 'pod',
    plane: 'projection',
    status: 'failed',
    metadata: { resourceBindings: { session: { local: sessionManager.getSessionId() } } },
  })
  assert.equal(pending.length, 1)
  assert.match(pending[0].id, new RegExp(`^pi-pod-mirror:${sessionManager.getSessionId()}:`))
  assert.match(pending[0].failures[0].message, /pod write failed/)
})

test('LinxPiPodMirror replays pending failed projections from the local session archive', async (t) => {
  const { module: mirrorModule, cleanup: cleanupMirror } = await loadAutoModeModule('lib/pi-adapter/pod-mirror.ts')
  const { module: storeModule, cleanup: cleanupStore } = await loadAutoModeModule('lib/sync-checkpoint-store.ts')
  t.after(() => {
    cleanupMirror()
    cleanupStore()
  })

  const dir = mkdtempSync(join(tmpdir(), 'linx-pi-mirror-replay-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const sessionManager = createSessionManager()
  const message = {
    role: 'user',
    content: [{ type: 'text', text: 'retry me from local archive' }],
    timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
  }
  sessionManager.appendTestEntry({
    type: 'message',
    id: 'u1',
    parentId: null,
    timestamp: '2026-04-01T00:00:00.000Z',
    message,
  })

  let failWrites = true
  const { runtime, rows, writes } = createFakePodRuntime()
  const checkpointStore = storeModule.createFileSyncCheckpointStore({ dir })
  const mirror = new mirrorModule.LinxPiPodMirror({
    cwd: '/tmp/demo',
    sessionManager,
    checkpointStore,
    runtime: {
      ...runtime,
      createDb(session) {
        const db = runtime.createDb(session)
        return {
          ...db,
          insert(table) {
            const insert = db.insert(table)
            return {
              values(row) {
                const values = insert.values(row)
                return {
                  async execute() {
                    if (failWrites) {
                      throw new Error('pod write failed')
                    }
                    return values.execute()
                  },
                }
              },
            }
          },
        }
      },
    },
  })

  mirror.handleEvent({ type: 'message_end', message })
  await mirror.flush()

  assert.equal(checkpointStore.listCheckpoints({ status: 'failed' }).length, 1)
  assert.equal(rows.size, 0)

  failWrites = false
  const replayResults = await mirror.replayPendingSync()

  assert.equal(replayResults.length, 1)
  assert.equal(replayResults[0].status, 'completed')
  assert.equal(checkpointStore.listCheckpoints({ status: 'failed' }).length, 0)
  assert.equal([...rows.values()].some((row) => row.content === 'retry me from local archive'), true)
  assert.equal(writes.filter((write) => write.table === 'chat_message' && write.op === 'insert').length, 1)
})

test('LinxPiPodMirror does not clear non-replayable pending tool checkpoints during message replay', async (t) => {
  const { module: mirrorModule, cleanup: cleanupMirror } = await loadAutoModeModule('lib/pi-adapter/pod-mirror.ts')
  const { module: storeModule, cleanup: cleanupStore } = await loadAutoModeModule('lib/sync-checkpoint-store.ts')
  t.after(() => {
    cleanupMirror()
    cleanupStore()
  })

  const dir = mkdtempSync(join(tmpdir(), 'linx-pi-mirror-replay-tool-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const sessionManager = createSessionManager()
  const checkpointStore = storeModule.createFileSyncCheckpointStore({ dir })
  const sessionId = sessionManager.getSessionId()
  checkpointStore.writeCheckpoint({
    id: `pi-pod-mirror:${sessionId}:tool`,
    source: 'pi-runtime',
    target: 'pod',
    direction: 'local-to-core',
    plane: 'projection',
    authority: 'core',
    status: 'failed',
    attempted: 1,
    applied: 0,
    skipped: 0,
    failed: 1,
    failures: [{ operationId: 'tool', message: 'tool audit failed' }],
    startedAt: '2026-04-01T00:00:00.000Z',
    completedAt: '2026-04-01T00:00:01.000Z',
    metadata: {
      resourceBindings: {
        session: {
          local: sessionId,
        },
      },
      syncTaskDescription: 'tool_execution_start',
    },
  })

  const { runtime } = createFakePodRuntime()
  const mirror = new mirrorModule.LinxPiPodMirror({
    cwd: '/tmp/demo',
    sessionManager,
    checkpointStore,
    runtime,
  })

  const replayResults = await mirror.replayPendingSync()

  assert.deepEqual(replayResults, [])
  assert.equal(checkpointStore.listCheckpoints({ status: 'failed' }).length, 1)
})
