import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agentTable, chatTable, contactTable, threadTable } from '@undefineds.co/models'
import { agentResourceId } from '@/lib/data/resource-identity'

const {
  collectionStates,
  createCollectionMock,
  invalidateQueriesMock,
} = vi.hoisted(() => {
  const collectionStates = new Map<string, Map<string, Record<string, unknown>>>()
  const invalidateQueriesMock = vi.fn()

  function createCollectionMock(options: {
    queryKey?: string[]
    table?: unknown
    resource?: unknown
    getDb?: () => {
      insert?: (resource: unknown) => {
        values: (row: Record<string, unknown>) => {
          execute: () => Promise<unknown>
        }
      }
    } | null
  }) {
    const key = options.queryKey?.join('/') || `collection-${collectionStates.size}`
    const state = new Map<string, Record<string, unknown>>()
    collectionStates.set(key, state)

    return {
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
        if (state.has(id)) {
          const error = new Error(`Cannot insert document with ID "${id}" because it already exists in the collection`)
          error.name = 'CollectionOperationError'
          throw error
        }
        const next = { ...row, id }
        state.set(id, next)
        const persistence = Promise.resolve().then(async () => {
          const db = options.getDb?.()
          const resource = options.resource ?? options.table
          if (!db?.insert || !resource) {
            return
          }
          await db.insert(resource).values(next).execute()
        })
        return { isPersisted: { promise: persistence } }
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
    const contactIri = `${podBase}.data/contacts/__secretary__.ttl`
    const agentIri = `${podBase}agents/__secretary__/`
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

    return {
      podBase,
      webId,
      chatIri,
      contactIri,
      agentIri,
      contactRow,
      agentRow,
      chatRow,
    }
  }

  function createSecretaryDb(options: {
    rows?: ReturnType<typeof createSecretaryRows>
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
      if (table === chatTable && id === LINX_DEFAULT_SECRETARY.chatResourceId) {
        return rows.chatRow
      }
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
    const db = {
      getDialect: () => ({
        getPodUrl: () => rows.podBase,
        getWebId: () => rows.webId,
        getAuthenticatedFetch: () => vi.fn(async () => new Response('', { status: 201 })),
      }),
      findById: findByIdMock,
      resolveRowIri: vi.fn((table: unknown, row: Record<string, unknown>) => {
        if (typeof row['@id'] === 'string') return row['@id']
        if (table === chatTable) return rows.chatIri
        if (table === contactTable) return rows.contactIri
        if (table === agentTable) return rows.agentIri
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

    return { db, findByIdMock, insertMock, insertedRows, rows }
  }

  it('writes Secretary contact and chat resources after bounded exact misses', async () => {
    const { db, findByIdMock, insertedRows, rows } = createSecretaryDb()

    initializeChatCollections(db as any)

    await expect(chatOps.ensureLinxWelcome({ force: true })).resolves.toEqual({
      chatId: LINX_DEFAULT_SECRETARY.chatId,
      created: true,
    })
    expect(findByIdMock.mock.calls.map(([, id]) => id)).toEqual([
      LINX_DEFAULT_SECRETARY.contactResourceId,
      LINX_DEFAULT_SECRETARY.chatResourceId,
    ])
    expect(db.select).not.toHaveBeenCalled()
    expect(insertedRows).toHaveLength(2)
    expect(insertedRows.some(({ table }) => table === contactTable)).toBe(true)
    expect(insertedRows.some(({ table }) => table === chatTable)).toBe(true)
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
    expect(collectionStates.get('agents')?.get(LINX_DEFAULT_SECRETARY.agentId)).toMatchObject({
      id: LINX_DEFAULT_SECRETARY.agentId,
      '@id': rows.agentIri,
      name: LINX_DEFAULT_SECRETARY.title,
    })
  })

  it('persists Secretary rows when an optimistic row is already staged locally', async () => {
    const { db, findByIdMock, insertedRows, rows } = createSecretaryDb()
    initializeChatCollections(db as any)
    collectionStates.get('chats')?.set(LINX_DEFAULT_SECRETARY.chatId, rows.chatRow)

    await expect(chatOps.ensureLinxWelcome({ force: true })).resolves.toEqual({
      chatId: LINX_DEFAULT_SECRETARY.chatId,
      created: true,
    })
    expect(findByIdMock.mock.calls.map(([, id]) => id)).toEqual([
      LINX_DEFAULT_SECRETARY.contactResourceId,
      LINX_DEFAULT_SECRETARY.chatResourceId,
    ])
    expect(insertedRows).toHaveLength(2)
    expect(insertedRows.some(({ table }) => table === contactTable)).toBe(true)
    expect(insertedRows.some(({ table }) => table === chatTable)).toBe(true)
    expect(insertedRows.find(({ table }) => table === chatTable)?.row).toMatchObject({
      id: LINX_DEFAULT_SECRETARY.chatId,
      '@id': rows.chatIri,
    })
  })

  it('does not require full chat collection queries when Secretary resources already exist', async () => {
    const { db, insertedRows } = createSecretaryDb({
      chatSelectError: new Error('SPARQL unavailable'),
      existingResources: true,
    })
    initializeChatCollections(db as any)

    await expect(chatOps.ensureLinxWelcome({ force: true })).resolves.toEqual({
      chatId: LINX_DEFAULT_SECRETARY.chatId,
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
    await vi.advanceTimersByTimeAsync(6_000)

    await expect(resultPromise).resolves.toEqual({
      chatId: LINX_DEFAULT_SECRETARY.chatId,
      created: true,
    })
    expect(insertedRows.map(({ table }) => table)).toEqual([
      contactTable,
      chatTable,
    ])
    vi.useRealTimers()
  })

  it('returns the staged Secretary chat while remote persistence is in flight', async () => {
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

    await expect(chatOps.fetchChats()).resolves.toEqual([
      expect.objectContaining({
        id: LINX_DEFAULT_SECRETARY.chatId,
        '@id': rows.chatIri,
        title: LINX_DEFAULT_SECRETARY.title,
      }),
    ])
    expect(db.select).not.toHaveBeenCalled()
    expect(insertedRows).toEqual([])
    expect(bootstrapPromise).toBeInstanceOf(Promise)
  })

  it('keeps the staged Secretary chat when an older remote chat query resolves empty', async () => {
    const { db, rows } = createSecretaryDb()
    let resolveChatSelect: ((rows: unknown[]) => void) | null = null
    let resolveContactInsert: (() => void) | null = null
    let resolveChatInsert: (() => void) | null = null

    db.insert = vi.fn((table: unknown) => ({
      values(row: Record<string, unknown>) {
        return {
          execute: vi.fn(async () => new Promise((resolve) => {
            const complete = () => resolve([{ ...row }])
            if (table === contactTable) {
              resolveContactInsert = complete
            } else if (table === chatTable) {
              resolveChatInsert = complete
            } else {
              complete()
            }
          })),
        }
      },
    }))
    db.select = vi.fn(() => ({
      from() {
        const query = {
          orderBy: vi.fn(() => query),
          where: vi.fn(() => query),
          execute: vi.fn(async () => new Promise((resolve) => {
            resolveChatSelect = resolve
          })),
        }
        return query
      },
    }))

    initializeChatCollections(db as any)
    const initialFetch = chatOps.fetchChats()
    const bootstrapPromise = chatOps.ensureLinxWelcome({ force: true })

    resolveChatSelect?.([])
    await expect(initialFetch).resolves.toEqual([
      expect.objectContaining({
        id: LINX_DEFAULT_SECRETARY.chatId,
        '@id': rows.chatIri,
        title: LINX_DEFAULT_SECRETARY.title,
      }),
    ])

    resolveContactInsert?.()
    resolveChatInsert?.()
    await expect(bootstrapPromise).resolves.toEqual({
      chatId: LINX_DEFAULT_SECRETARY.chatId,
      created: true,
    })
  })
})

describe('chat workspace persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    collectionStates.forEach((state) => state.clear())
  })

  afterEach(() => {
    initializeChatCollections(null)
  })

  function createWorkspaceDb(options: {
    threadWorkspace?: string
  } = {}) {
    const podBase = 'https://node-0000.undefineds.co/alice/'
    const threadRow = {
      id: 'thread-1/index.ttl#this',
      parent: `${podBase}.data/chat/__secretary__/index.ttl#this`,
      title: 'Default thread',
      workspace: options.threadWorkspace ?? null,
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
      updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    }
    const insertedRows: Array<{ table: unknown; row: Record<string, unknown> }> = []
    const findById = vi.fn(async (table: unknown, id: string) => {
      if (table === threadTable && id === threadRow.id) {
        return threadRow
      }
      return null
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => podBase,
        getWebId: () => `${podBase}profile/card#me`,
      }),
      findById,
      insert: vi.fn((table: unknown) => ({
        values(row: Record<string, unknown>) {
          insertedRows.push({ table, row })
          return {
            execute: vi.fn(async () => [{ ...row }]),
          }
        },
      })),
    }

    return { db, findById, insertedRows, threadRow }
  }

  it('binds the thread to the requested workspace URI without persisting a separate workspace resource', async () => {
    const { db, threadRow } = createWorkspaceDb()
    initializeChatCollections(db as any)

    const workspaceUri = 'linx://node-123/repo/linx'
    await expect(chatOps.ensureThreadWorkspace({
      threadId: threadRow.id,
      workspaceUri,
      title: 'LinX repo root',
      repoPath: '/repo/linx',
      folderPath: '/repo/linx',
      branch: 'main',
      baseRef: 'origin/main',
    })).resolves.toBe(workspaceUri)

    expect(collectionStates.get('workspaces')).toBeUndefined()
    expect(collectionStates.get('threads')?.get(threadRow.id)).toMatchObject({
      id: threadRow.id,
      workspace: workspaceUri,
    })
  })
})
