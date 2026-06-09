import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agentResourceId, agentTable, chatTable, contactTable, messageTable, threadTable } from '@undefineds.co/models'

const {
  collectionStates,
  createCollectionMock,
  invalidateQueriesMock,
} = vi.hoisted(() => {
  const collectionStates = new Map<string, Map<string, Record<string, unknown>>>()
  const invalidateQueriesMock = vi.fn()

  function createCollectionMock(options: { queryKey?: string[] }) {
    const key = options.queryKey?.join('/') || `collection-${collectionStates.size}`
    const state = new Map<string, Record<string, unknown>>()
    collectionStates.set(key, state)

    const collection = {
      state,
      _state: {
        syncedData: state,
        syncedKeys: new Set<string>(),
        optimisticDeletes: new Set<string>(),
        optimisticUpserts: new Map<string, unknown>(),
        size: 0,
      },
      get: vi.fn((id: string) => state.get(id)),
      isReady: vi.fn(() => true),
      preload: vi.fn(async () => undefined),
      insert: vi.fn((row: Record<string, unknown>) => {
        const id = typeof row.id === 'string' ? row.id : crypto.randomUUID()
        state.set(id, { ...row, id })
        return { isPersisted: { promise: Promise.resolve() } }
      }),
      update: vi.fn((id: string, updater: (draft: Record<string, unknown>) => void) => {
        const next = { ...(state.get(id) ?? { id }) }
        updater(next)
        state.set(id, next)
        return { isPersisted: { promise: Promise.resolve() } }
      }),
      delete: vi.fn((id: string) => {
        state.delete(id)
        return { isPersisted: { promise: Promise.resolve() } }
      }),
      fetch: vi.fn(async () => Array.from(state.values())),
      subscribeToPod: vi.fn(async () => () => undefined),
      utils: {
        writeUpsert: vi.fn((row: Record<string, unknown>) => {
          if (typeof row.id === 'string') {
            state.set(row.id, row)
          }
        }),
      },
    }

    return collection
  }

  return { collectionStates, createCollectionMock, invalidateQueriesMock }
})

vi.mock('@/lib/data/pod-collection', () => ({
  createPodCollection: vi.fn(createCollectionMock),
}))

vi.mock('@/providers/query-provider', () => ({
  queryClient: {
    invalidateQueries: invalidateQueriesMock,
  },
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: null }),
}))

import { chatOps, initializeChatCollections, LINX_DEFAULT_SECRETARY } from './collections'

describe('AI Secretary bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    collectionStates.forEach((state) => state.clear())
  })

  afterEach(() => {
    vi.useRealTimers()
    initializeChatCollections(null)
  })

  function createSecretaryRows(options: {
    podBase?: string
    webId?: string
  } = {}) {
    const podBase = options.podBase ?? 'https://node-0000.undefineds.co/alice/'
    const webId = options.webId ?? 'https://id.undefineds.co/alice/profile/card#me'
    const chatIri = `${podBase}.data/chat/__secretary__/index.ttl#this`
    const threadIri = `${podBase}.data/chat/__secretary__/index.ttl#default`
    const welcomeMessageIri = `${podBase}.data/chat/__secretary__/welcome.ttl#message`
    const contactIri = `${podBase}.data/contacts/__secretary__.ttl`
    const agentIri = `${podBase}agents/__secretary__/profile/card#me`
    const contactRow = {
      id: LINX_DEFAULT_SECRETARY.contactId,
      '@id': contactIri,
      name: LINX_DEFAULT_SECRETARY.title,
      entity: agentIri,
      entityUri: agentIri,
      contactType: 'agent',
    }
    const agentRow = {
      id: agentResourceId('__secretary__'),
      '@id': agentIri,
      name: LINX_DEFAULT_SECRETARY.title,
      provider: LINX_DEFAULT_SECRETARY.provider,
      model: LINX_DEFAULT_SECRETARY.model,
    }
    const chatRow = {
      id: LINX_DEFAULT_SECRETARY.chatId,
      '@id': chatIri,
      title: LINX_DEFAULT_SECRETARY.title,
      participants: [contactIri],
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
      updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    }
    const threadRow = {
      id: LINX_DEFAULT_SECRETARY.threadId,
      '@id': threadIri,
      chat: chatIri,
      title: LINX_DEFAULT_SECRETARY.threadTitle,
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
      updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    }
    const welcomeMessageRow = {
      id: LINX_DEFAULT_SECRETARY.welcomeMessageId,
      '@id': welcomeMessageIri,
      chat: chatIri,
      thread: threadIri,
      maker: webId,
      role: 'assistant',
      content: LINX_DEFAULT_SECRETARY.welcomeMessage,
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
    }

    return {
      podBase,
      webId,
      chatIri,
      threadIri,
      welcomeMessageIri,
      contactIri,
      agentIri,
      contactRow,
      agentRow,
      chatRow,
      threadRow,
      welcomeMessageRow,
    }
  }

  function createSecretaryDb(options: {
    rows?: ReturnType<typeof createSecretaryRows>
    fetchImpl?: typeof fetch
    chatSelectError?: Error
    existingResources?: boolean
    hangExactReads?: boolean
  } = {}) {
    const rows = options.rows ?? createSecretaryRows()
    const insertedRows: Array<{ table: unknown; row: Record<string, unknown> }> = []
    const findByIdMock = vi.fn(async (table: unknown, id: string) => {
      if (options.hangExactReads) {
        return await new Promise(() => {})
      }
      if (!options.existingResources) {
        return null
      }
      if (/^https?:\/\//.test(id)) {
        throw new Error('findById requires a base-relative resource id. Use findByIri(resource, iri) for full IRIs.')
      }
      if (table === agentTable && id === LINX_DEFAULT_SECRETARY.agentId) {
        return rows.agentRow
      }
      if (table === contactTable && id === LINX_DEFAULT_SECRETARY.contactResourceId) {
        return rows.contactRow
      }
      if (table === chatTable && id === LINX_DEFAULT_SECRETARY.chatId) {
        return rows.chatRow
      }
      if (table === chatTable && id === LINX_DEFAULT_SECRETARY.chatResourceId) {
        return rows.chatRow
      }
      if (table === threadTable && id === LINX_DEFAULT_SECRETARY.threadId) {
        return rows.threadRow
      }
      if (table === threadTable && id === LINX_DEFAULT_SECRETARY.threadResourceId) {
        return rows.threadRow
      }
      if (table === messageTable && id === LINX_DEFAULT_SECRETARY.welcomeMessageId) {
        return rows.welcomeMessageRow
      }
      return null
    })
    const findByIriMock = vi.fn(async (table: unknown, iri: string) => {
      if (table === contactTable && iri === rows.contactIri) return rows.contactRow
      if (table === agentTable && iri === rows.agentIri) return rows.agentRow
      return null
    })
    const insertMock = vi.fn((table: unknown) => ({
      values(row: Record<string, unknown>) {
        insertedRows.push({ table, row })
        return {
          execute: vi.fn(async () => [{ ...row }]),
        }
      },
    }))
    const defaultFetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'GET') {
        return new Response(buildSecretaryReadinessBody(String(input), rows), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle' },
        })
      }
      return new Response('', { status: 201 })
    })
    const fetchImpl = options.fetchImpl ?? defaultFetchMock
    const db = {
      getDialect: () => ({
        getPodUrl: () => rows.podBase,
        getWebId: () => rows.webId,
        getAuthenticatedFetch: () => fetchImpl,
      }),
      findById: findByIdMock,
      findByIri: findByIriMock,
      resolveRowIri: vi.fn((table: unknown, row: Record<string, unknown>) => {
        if (typeof row['@id'] === 'string') return row['@id']
        if (table === chatTable) {
          if (typeof row.id === 'string' && /^https?:\/\//.test(row.id)) return row.id
          return rows.chatIri
        }
        if (table === threadTable) {
          if (typeof row.id === 'string' && /^https?:\/\//.test(row.id)) return row.id
          return rows.threadIri
        }
        if (table === messageTable) {
          return rows.welcomeMessageIri
        }
        if (table === contactTable) {
          return rows.contactIri
        }
        if (table === agentTable) {
          return rows.agentIri
        }
        return null
      }),
      insert: insertMock,
      select: vi.fn(() => ({
        from(table: unknown) {
          const query = {
            where: vi.fn(() => query),
            orderBy: vi.fn(() => query),
            execute: vi.fn(async () => {
              if (table === chatTable) {
                if (options.chatSelectError) throw options.chatSelectError
                return [rows.chatRow]
              }
              if (table === threadTable) return [rows.threadRow]
              if (table === messageTable) return [rows.welcomeMessageRow]
              return []
            }),
          }
          return query
        },
      })),
      updateByIri: vi.fn(async (_table: unknown, iri: string, updates: Record<string, unknown>) => ({
        ...(iri === rows.chatIri ? rows.chatRow : {}),
        ...updates,
      })),
      updateById: vi.fn(async (_table: unknown, id: string, updates: Record<string, unknown>) => ({
        ...(id === LINX_DEFAULT_SECRETARY.chatId ? rows.chatRow : {}),
        ...updates,
      })),
    }

    return { db, fetchMock: fetchImpl, findByIdMock, findByIriMock, insertMock, insertedRows, rows }
  }

  it('writes fixed Secretary resources after bounded exact misses', async () => {
    const { db, fetchMock, findByIdMock, findByIriMock, insertedRows, rows } = createSecretaryDb()

    initializeChatCollections(db as any)

    const result = await chatOps.ensureLinxWelcome({ force: true })

    expect(result).toEqual({
      chatId: LINX_DEFAULT_SECRETARY.chatId,
      threadId: LINX_DEFAULT_SECRETARY.threadId,
      created: true,
    })
    expect(findByIdMock.mock.calls.map(([, id]) => id)).toEqual([
      LINX_DEFAULT_SECRETARY.agentId,
      LINX_DEFAULT_SECRETARY.contactResourceId,
      LINX_DEFAULT_SECRETARY.chatResourceId,
    ])
    expect(findByIriMock).not.toHaveBeenCalled()
    expect(db.select).not.toHaveBeenCalled()
    expect(insertedRows.map(({ table }) => table)).toEqual([
      agentTable,
      contactTable,
      chatTable,
      threadTable,
      messageTable,
    ])
    expect(insertedRows.find(({ table }) => table === agentTable)?.row).toMatchObject({
      id: LINX_DEFAULT_SECRETARY.agentId,
      '@id': rows.agentIri,
    })
    expect(insertedRows.find(({ table }) => table === contactTable)?.row).toMatchObject({
      id: LINX_DEFAULT_SECRETARY.contactId,
      '@id': rows.contactIri,
      entity: rows.agentIri,
    })
    expect(insertedRows.find(({ table }) => table === chatTable)?.row).toMatchObject({
      id: LINX_DEFAULT_SECRETARY.chatId,
      '@id': rows.chatIri,
      participants: [rows.contactIri],
    })
    expect(insertedRows.find(({ table }) => table === threadTable)?.row).toMatchObject({
      id: LINX_DEFAULT_SECRETARY.threadId,
      '@id': rows.threadIri,
      chat: rows.chatIri,
    })
    expect(insertedRows.find(({ table }) => table === messageTable)?.row).toMatchObject({
      id: LINX_DEFAULT_SECRETARY.welcomeMessageId,
      '@id': rows.welcomeMessageIri,
      chat: rows.chatIri,
      thread: rows.threadIri,
      maker: rows.agentIri,
    })
    expect((fetchMock as any).mock.calls.filter(([, init]: [unknown, RequestInit | undefined]) => init?.method === 'GET').map(([input]: [unknown]) => String(input))).toEqual([
      rows.agentIri.split('#')[0],
      rows.contactIri,
      rows.chatIri.split('#')[0],
      rows.welcomeMessageIri.split('#')[0],
    ])
  })

  it('serializes fixed Secretary resource writes during bootstrap', async () => {
    const { db, insertedRows, rows } = createSecretaryDb()
    const executeResolvers: Array<() => void> = []

    db.insert = vi.fn((table: unknown) => ({
      values(row: Record<string, unknown>) {
        insertedRows.push({ table, row })
        return {
          execute: vi.fn(async () => new Promise((resolve) => {
            executeResolvers.push(() => resolve([{ ...row }]))
          })),
        }
      },
    }))

    initializeChatCollections(db as any)

    const resultPromise = chatOps.ensureLinxWelcome({ force: true })

    await waitForInsertedCount(insertedRows, 1)
    expect(insertedRows.map(({ table }) => table)).toEqual([agentTable])
    expect(collectionStates.get('agents')?.get(LINX_DEFAULT_SECRETARY.agentId)).toMatchObject({
      id: LINX_DEFAULT_SECRETARY.agentId,
      '@id': rows.agentIri,
      name: LINX_DEFAULT_SECRETARY.title,
    })
    expect(collectionStates.get('contacts')?.get(LINX_DEFAULT_SECRETARY.contactId)).toMatchObject({
      id: LINX_DEFAULT_SECRETARY.contactId,
      '@id': rows.contactIri,
      entity: rows.agentIri,
    })
    expect(collectionStates.get('chats')?.get(LINX_DEFAULT_SECRETARY.chatId)).toMatchObject({
      id: LINX_DEFAULT_SECRETARY.chatId,
      '@id': rows.chatIri,
      participants: [rows.contactIri],
    })
    expect(collectionStates.get('threads')?.get(LINX_DEFAULT_SECRETARY.threadId)).toMatchObject({
      id: LINX_DEFAULT_SECRETARY.threadId,
      '@id': rows.threadIri,
      chat: rows.chatIri,
    })

    executeResolvers.shift()?.()
    await waitForInsertedCount(insertedRows, 2)
    expect(insertedRows.map(({ table }) => table)).toEqual([agentTable, contactTable])

    executeResolvers.shift()?.()
    await waitForInsertedCount(insertedRows, 3)
    expect(insertedRows.map(({ table }) => table)).toEqual([agentTable, contactTable, chatTable])

    executeResolvers.shift()?.()
    await waitForInsertedCount(insertedRows, 4)
    expect(insertedRows.map(({ table }) => table)).toEqual([
      agentTable,
      contactTable,
      chatTable,
      threadTable,
    ])

    executeResolvers.shift()?.()
    await waitForInsertedCount(insertedRows, 5)
    expect(insertedRows.map(({ table }) => table)).toEqual([
      agentTable,
      contactTable,
      chatTable,
      threadTable,
      messageTable,
    ])

    executeResolvers.shift()?.()
    await expect(resultPromise).resolves.toEqual({
      chatId: LINX_DEFAULT_SECRETARY.chatId,
      threadId: LINX_DEFAULT_SECRETARY.threadId,
      created: true,
    })
  })

  it('does not require full chat collection queries when fixed Secretary resources already exist', async () => {
    const { db, rows, insertedRows } = createSecretaryDb({
      chatSelectError: new Error('SPARQL unavailable'),
      existingResources: true,
    })
    collectionStates.get('chats')?.set(LINX_DEFAULT_SECRETARY.chatId, rows.chatRow)
    initializeChatCollections(db as any)

    await expect(chatOps.ensureLinxWelcome({ force: true })).resolves.toEqual({
      chatId: LINX_DEFAULT_SECRETARY.chatId,
      threadId: LINX_DEFAULT_SECRETARY.threadId,
      created: false,
    })
    expect(db.select).not.toHaveBeenCalled()
    expect(insertedRows).toEqual([])
  })

  it('continues bootstrap when missing exact reads hang', async () => {
    vi.useFakeTimers()
    const { db, insertedRows } = createSecretaryDb({
      hangExactReads: true,
    })
    initializeChatCollections(db as any)

    const resultPromise = chatOps.ensureLinxWelcome({ force: true })
    await vi.advanceTimersByTimeAsync(8_000)

    await expect(resultPromise).resolves.toEqual({
      chatId: LINX_DEFAULT_SECRETARY.chatId,
      threadId: LINX_DEFAULT_SECRETARY.threadId,
      created: true,
    })
    expect(insertedRows.map(({ table }) => table)).toEqual([
      agentTable,
      contactTable,
      chatTable,
      threadTable,
      messageTable,
    ])
    vi.useRealTimers()
  })

  it('returns the staged Secretary chat when the remote chat query is blocked by bootstrap persistence', async () => {
    const { db, insertedRows, rows } = createSecretaryDb()
    const executeResolvers: Array<() => void> = []

    db.insert = vi.fn((table: unknown) => ({
      values(row: Record<string, unknown>) {
        insertedRows.push({ table, row })
        return {
          execute: vi.fn(async () => new Promise((resolve) => {
            executeResolvers.push(() => resolve([{ ...row }]))
          })),
        }
      },
    }))
    db.select = vi.fn(() => ({
      from() {
        const query = {
          orderBy: vi.fn(() => query),
          where: vi.fn(() => query),
          execute: vi.fn(async () => new Promise(() => {})),
        }
        return query
      },
    }))

    initializeChatCollections(db as any)
    const bootstrapPromise = chatOps.ensureLinxWelcome({ force: true })
    await waitForInsertedCount(insertedRows, 1)

    const fetchPromise = chatOps.fetchChats()

    await expect(fetchPromise).resolves.toEqual([
      expect.objectContaining({
        id: LINX_DEFAULT_SECRETARY.chatId,
        '@id': rows.chatIri,
        title: LINX_DEFAULT_SECRETARY.title,
      }),
    ])
    expect(db.select).not.toHaveBeenCalled()
    expect(bootstrapPromise).toBeInstanceOf(Promise)
  })

  it('continues bootstrap when default Secretary Agent Home cannot be created', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const rows = createSecretaryRows()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'GET') {
        return new Response(buildSecretaryReadinessBody(url, rows), { status: 200 })
      }
      if (init?.method === 'HEAD') {
        return new Response('', { status: url === rows.podBase ? 200 : 404 })
      }
      if (url.includes('/.data/chat/__secretary__/')) {
        return new Response('', { status: 201 })
      }
      return new Response('', { status: 403 })
    })
    const { db } = createSecretaryDb({ rows, fetchImpl: fetchMock })
    initializeChatCollections(db as any)

    await expect(chatOps.ensureLinxWelcome({ force: true })).resolves.toEqual({
      chatId: LINX_DEFAULT_SECRETARY.chatId,
      threadId: LINX_DEFAULT_SECRETARY.threadId,
      created: true,
    })
    await vi.advanceTimersByTimeAsync(60_000)
    await waitForMockCall(fetchMock, (input) => String(input).includes('/agents/'))
    await waitForMockCall(warnSpy, ([message]) => String(message).includes('Agent Home'))
    warnSpy.mockRestore()
  })
})

function buildSecretaryReadinessBody(
  url: string,
  rows: {
    agentIri: string
    contactIri: string
    chatIri: string
    welcomeMessageIri: string
  },
): string {
  if (url === rows.agentIri.split('#')[0]) {
    return `<${rows.agentIri}> <http://xmlns.com/foaf/0.1/name> "AI Secretary" .`
  }
  if (url === rows.contactIri) {
    return `<${rows.contactIri}> <https://undefineds.co/ns#entity> <${rows.agentIri}> .`
  }
  if (url === rows.chatIri.split('#')[0]) {
    return `<${rows.chatIri}> <http://purl.org/dc/terms/title> "AI Secretary" .`
  }
  if (url === rows.welcomeMessageIri.split('#')[0]) {
    return `<${rows.welcomeMessageIri}> <https://undefineds.co/ns#content> "AI Secretary" .`
  }
  return 'AI Secretary'
}

async function waitForInsertedCount(
  insertedRows: Array<{ table: unknown; row: Record<string, unknown> }>,
  count: number,
): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    if (insertedRows.length >= count) return
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`Timed out waiting for ${count} inserted rows; got ${insertedRows.length}.`)
}

async function waitForMockCall(
  mock: { mock: { calls: unknown[][] } },
  predicate: (call: unknown[]) => boolean,
): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    if (mock.mock.calls.some(predicate)) return
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('Timed out waiting for expected mock call.')
}
