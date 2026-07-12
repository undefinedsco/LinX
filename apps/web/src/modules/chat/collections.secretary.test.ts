import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agentResource, chatResource, contactResource, threadResource } from '@undefineds.co/models'
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
          const resource = options.resource
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

import {
  chatOps,
  configureChatContactsPort,
  initializeChatCollections,
  isLinxDefaultSecretaryBootstrapSettling,
  LINX_DEFAULT_SECRETARY,
  SECRETARY_BOOTSTRAP_TIMEOUT_MS,
} from './collections'

configureChatContactsPort({
  agentCollection: createCollectionMock({ queryKey: ['agents'] }) as any,
  contactCollection: createCollectionMock({ queryKey: ['contacts'] }) as any,
})

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
      about: agentIri,
      about: agentIri,
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
    const insertedRows: Array<{ resource: unknown; row: Record<string, unknown> }> = []
    const findByIdMock = vi.fn(async (resource: unknown, id: string) => {
      if (options.hangExactReads) {
        return await new Promise(() => {})
      }
      if (!options.existingResources) {
        return null
      }
      if (/^https?:\/\//.test(id)) {
        throw new Error('findById requires a base-relative resource id. Use findByIri(resource, iri) for full IRIs.')
      }
      if (resource === agentResource && id === LINX_DEFAULT_SECRETARY.agentId) {
        return rows.agentRow
      }
      if (resource === contactResource && id === LINX_DEFAULT_SECRETARY.contactResourceId) {
        return rows.contactRow
      }
      if (resource === chatResource && id === LINX_DEFAULT_SECRETARY.chatResourceId) {
        return rows.chatRow
      }
      return null
    })
    const insertMock = vi.fn((resource: unknown) => ({
      values(row: Record<string, unknown>) {
        insertedRows.push({ resource, row })
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
      resolveRowIri: vi.fn((resource: unknown, row: Record<string, unknown>) => {
        if (typeof row['@id'] === 'string') return row['@id']
        if (resource === chatResource) return rows.chatIri
        if (resource === contactResource) return rows.contactIri
        if (resource === agentResource) return rows.agentIri
        return null
      }),
      insert: insertMock,
      select: vi.fn(() => ({
        from(resource: unknown) {
          const query = {
            where: vi.fn(() => query),
            orderBy: vi.fn(() => query),
            execute: vi.fn(async () => {
              if (resource === chatResource) {
                if (options.chatSelectError) throw options.chatSelectError
                return [rows.chatRow]
              }
              return []
            }),
          }
          return query
        },
      })),
      updateByIri: vi.fn(async (_resource: unknown, iri: string, updates: Record<string, unknown>) => ({
        ...(iri === rows.chatIri ? rows.chatRow : {}),
        ...updates,
      })),
      updateById: vi.fn(async (_resource: unknown, id: string, updates: Record<string, unknown>) => ({
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
    expect(insertedRows.some(({ resource }) => resource === contactResource)).toBe(true)
    expect(insertedRows.some(({ resource }) => resource === chatResource)).toBe(true)
    expect(insertedRows.find(({ resource }) => resource === contactResource)?.row).toMatchObject({
      id: LINX_DEFAULT_SECRETARY.contactId,
      '@id': rows.contactIri,
      about: rows.agentIri,
    })
    expect(insertedRows.find(({ resource }) => resource === chatResource)?.row).toMatchObject({
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
    expect(insertedRows.some(({ resource }) => resource === contactResource)).toBe(true)
    expect(insertedRows.some(({ resource }) => resource === chatResource)).toBe(true)
    expect(insertedRows.find(({ resource }) => resource === chatResource)?.row).toMatchObject({
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
    expect(insertedRows.map(({ resource }) => resource)).toEqual([
      contactResource,
      chatResource,
    ])
    vi.useRealTimers()
  })

  it('times out never-settling persistence without dropping the local Secretary projection', async () => {
    vi.useFakeTimers()
    const { db, rows } = createSecretaryDb({
      chatSelectError: new Error('Collection queries over plain LDP are not supported'),
    })
    db.insert = vi.fn(() => ({
      values() {
        return {
          execute: vi.fn(async () => new Promise(() => {})),
        }
      },
    }))
    initializeChatCollections(db as any)

    const resultPromise = chatOps.ensureLinxWelcome({ force: true })
    const timeoutResult = expect(resultPromise).rejects.toMatchObject({
      kind: 'timeout',
      name: 'SecretaryBootstrapTimeoutError',
      recoverable: true,
    })

    expect(isLinxDefaultSecretaryBootstrapSettling()).toBe(true)
    await expect(chatOps.fetchChats()).resolves.toEqual([
      expect.objectContaining({
        id: LINX_DEFAULT_SECRETARY.chatId,
        '@id': rows.chatIri,
        title: LINX_DEFAULT_SECRETARY.title,
      }),
    ])

    await vi.advanceTimersByTimeAsync(SECRETARY_BOOTSTRAP_TIMEOUT_MS)

    await timeoutResult
    expect(isLinxDefaultSecretaryBootstrapSettling()).toBe(false)
    await expect(chatOps.fetchChats()).resolves.toEqual([
      expect.objectContaining({
        id: LINX_DEFAULT_SECRETARY.chatId,
        '@id': rows.chatIri,
        title: LINX_DEFAULT_SECRETARY.title,
      }),
    ])
  })

  it('does not publish an older account bootstrap after a new database is active', async () => {
    const firstRows = createSecretaryRows({
      podBase: 'https://node-0000.undefineds.co/alice/',
      webId: 'https://id.undefineds.co/alice/profile/card#me',
    })
    const secondRows = createSecretaryRows({
      podBase: 'https://node-0000.undefineds.co/bob/',
      webId: 'https://id.undefineds.co/bob/profile/card#me',
    })
    const { db: firstDb } = createSecretaryDb({ rows: firstRows })
    const { db: secondDb } = createSecretaryDb({ rows: secondRows })
    let resolveFirstContact: (() => void) | undefined
    let resolveFirstChat: (() => void) | undefined
    firstDb.insert = vi.fn((resource: unknown) => ({
      values(row: Record<string, unknown>) {
        return {
          execute: vi.fn(async () => new Promise((resolve) => {
            const complete = () => resolve([{ ...row }])
            if (resource === contactResource) {
              resolveFirstContact = complete
            } else if (resource === chatResource) {
              resolveFirstChat = complete
            }
          })),
        }
      },
    }))

    initializeChatCollections(firstDb as any)
    const firstBootstrap = chatOps.ensureLinxWelcome({ force: true })
    await vi.waitFor(() => {
      expect(resolveFirstContact).toBeTypeOf('function')
      expect(resolveFirstChat).toBeTypeOf('function')
    })

    initializeChatCollections(secondDb as any)
    await expect(chatOps.ensureLinxWelcome({ force: true })).resolves.toEqual({
      chatId: LINX_DEFAULT_SECRETARY.chatId,
      created: true,
    })
    expect(collectionStates.get('chats')?.get(LINX_DEFAULT_SECRETARY.chatId)).toMatchObject({
      '@id': secondRows.chatIri,
    })

    resolveFirstContact?.()
    resolveFirstChat?.()
    await expect(firstBootstrap).resolves.toEqual({
      chatId: LINX_DEFAULT_SECRETARY.chatId,
      created: true,
    })
    expect(collectionStates.get('chats')?.get(LINX_DEFAULT_SECRETARY.chatId)).toMatchObject({
      '@id': secondRows.chatIri,
    })
  })

  it('returns the staged Secretary chat while remote persistence is in flight', async () => {
    const { db, insertedRows, rows } = createSecretaryDb()
    const executeResolvers: Array<() => void> = []

    db.insert = vi.fn((resource: unknown) => ({
      values(row: Record<string, unknown>) {
        insertedRows.push({ resource, row })
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

    db.insert = vi.fn((resource: unknown) => ({
      values(row: Record<string, unknown>) {
        return {
          execute: vi.fn(async () => new Promise((resolve) => {
            const complete = () => resolve([{ ...row }])
            if (resource === contactResource) {
              resolveContactInsert = complete
            } else if (resource === chatResource) {
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
      chat: `${podBase}.data/chat/__secretary__/index.ttl#this`,
      title: 'Default thread',
      workspace: options.threadWorkspace ?? null,
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
      updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    }
    const insertedRows: Array<{ resource: unknown; row: Record<string, unknown> }> = []
    const findById = vi.fn(async (resource: unknown, id: string) => {
      if (resource === threadResource && id === threadRow.id) {
        return threadRow
      }
      return null
    })
    const updateById = vi.fn(async (resource: unknown, id: string, updates: Record<string, unknown>) => {
      if (resource === threadResource && id === threadRow.id) {
        Object.assign(threadRow, updates)
        return threadRow
      }
      throw new Error(`unexpected updateById target ${id}`)
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => podBase,
        getWebId: () => `${podBase}profile/card#me`,
      }),
      findById,
      updateById,
      insert: vi.fn((resource: unknown) => ({
        values(row: Record<string, unknown>) {
          insertedRows.push({ resource, row })
          return {
            execute: vi.fn(async () => [{ ...row }]),
          }
        },
      })),
    }

    return { db, findById, updateById, insertedRows, threadRow }
  }

  it('binds the thread to the requested workspace URI without persisting a separate workspace resource', async () => {
    const { db, threadRow, updateById } = createWorkspaceDb()
    initializeChatCollections(db as any)

    const workspaceUri = 'linx://device-123/repo/linx'
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
    expect(updateById).toHaveBeenCalledWith(
      threadResource,
      threadRow.id,
      expect.objectContaining({ workspace: workspaceUri }),
    )
  })
})
