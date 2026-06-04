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
    const contactIri = `${podBase}.data/contacts/__secretary__.ttl`
    const agentIri = `${podBase}.data/agents/__secretary__/index.ttl#this`
    const contactRow = {
      id: LINX_DEFAULT_SECRETARY.contactId,
      '@id': contactIri,
      name: LINX_DEFAULT_SECRETARY.title,
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
      id: 'welcome-message',
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
  } = {}) {
    const rows = options.rows ?? createSecretaryRows()
    const findByIdMock = vi.fn(async (table: unknown, id: string) => {
      if (/^https?:\/\//.test(id)) {
        throw new Error('findById requires a base-relative resource id. Use findByIri(resource, iri) for full IRIs.')
      }
      if (table === chatTable && id === LINX_DEFAULT_SECRETARY.chatId) {
        return rows.chatRow
      }
      if (table === threadTable && id === LINX_DEFAULT_SECRETARY.threadId) {
        return rows.threadRow
      }
      return null
    })
    const findByIriMock = vi.fn(async (table: unknown, iri: string) => {
      if (table === contactTable && iri === rows.contactIri) return rows.contactRow
      if (table === agentTable && iri === rows.agentIri) return rows.agentRow
      return null
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => rows.podBase,
        getWebId: () => rows.webId,
        getAuthenticatedFetch: () => options.fetchImpl ?? vi.fn(async () => new Response('', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle' },
        })),
      }),
      findById: findByIdMock,
      findByIri: findByIriMock,
      resolveRowIri: vi.fn((table: unknown, row: Record<string, unknown>) => {
        if (table === chatTable) {
          if (typeof row.id === 'string' && /^https?:\/\//.test(row.id)) return row.id
          return rows.chatIri
        }
        if (table === threadTable) {
          if (typeof row.id === 'string' && /^https?:\/\//.test(row.id)) return row.id
          return rows.threadIri
        }
        return null
      }),
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

    return { db, findByIdMock, findByIriMock, rows }
  }

  it('uses base-relative row ids instead of full RDF subjects for existing resources', async () => {
    const { db, findByIdMock, findByIriMock, rows } = createSecretaryDb()

    initializeChatCollections(db as any)

    const result = await chatOps.ensureLinxWelcome({ force: true })

    expect(result).toEqual({
      chatId: LINX_DEFAULT_SECRETARY.chatId,
      threadId: LINX_DEFAULT_SECRETARY.threadId,
      created: false,
    })
    expect(findByIdMock.mock.calls.map(([, id]) => id)).not.toContain(rows.chatIri)
    expect(findByIdMock.mock.calls.map(([, id]) => id)).not.toContain(rows.threadIri)
    expect(findByIdMock.mock.calls.map(([, id]) => id)).not.toContain(rows.contactIri)
    expect(findByIdMock.mock.calls.map(([, id]) => id)).not.toContain(rows.agentIri)
    expect(findByIriMock).toHaveBeenCalledWith(contactTable, rows.contactIri)
    expect(findByIriMock).toHaveBeenCalledWith(agentTable, rows.agentIri)
    expect(findByIdMock.mock.calls.every(([, id]) => !String(id).startsWith('https://'))).toBe(true)
  })

  it('requires the Secretary agent row id instead of deriving it from the Agent IRI', async () => {
    const rows = createSecretaryRows()
    const { db } = createSecretaryDb({
      rows: {
        ...rows,
        agentRow: {
          ...rows.agentRow,
          id: undefined,
        },
      } as any,
    })
    initializeChatCollections(db as any)

    await expect(chatOps.ensureLinxWelcome({ force: true })).rejects.toThrow('AI Secretary agent is missing row.id.')
  })

  it('does not hide Pod chat query failures behind cached collection rows', async () => {
    const { db, rows } = createSecretaryDb({
      chatSelectError: new Error('SPARQL unavailable'),
    })
    collectionStates.get('chats')?.set(LINX_DEFAULT_SECRETARY.chatId, rows.chatRow)
    initializeChatCollections(db as any)

    await expect(chatOps.ensureLinxWelcome({ force: true })).rejects.toThrow('SPARQL unavailable')
  })

  it('fails bootstrap when existing Secretary Agent Home cannot be created', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response('', { status: 404 })
      return new Response('', { status: 403 })
    })
    const { db } = createSecretaryDb({ fetchImpl: fetchMock })
    initializeChatCollections(db as any)

    await expect(chatOps.ensureLinxWelcome({ force: true })).rejects.toThrow(
      'Failed to create Pod container https://node-0000.undefineds.co/alice/.data/agents/__secretary__/: HTTP 403',
    )
  })
})
