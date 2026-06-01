import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chatResourceId, chatTable, messageTable, threadTable } from '@undefineds.co/models'

const mocked = vi.hoisted(() => {
  const states = new Map<string, Map<string, Record<string, unknown>>>()

  function collectionState(key: string[]): Map<string, Record<string, unknown>> {
    const id = key.join('/')
    const existing = states.get(id)
    if (existing) return existing
    const next = new Map<string, Record<string, unknown>>()
    states.set(id, next)
    return next
  }

  return {
    states,
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    createPodCollection: vi.fn((options: { queryKey: string[] }) => {
      const state = collectionState(options.queryKey)
      return {
        state,
        get: (id: string) => state.get(id) ?? null,
        isReady: () => true,
        preload: vi.fn().mockResolvedValue(undefined),
        insert: vi.fn((row: Record<string, unknown>) => {
          if (typeof row.id === 'string') state.set(row.id, row)
          return { isPersisted: { promise: Promise.resolve() } }
        }),
        update: vi.fn((id: string, updater: (draft: Record<string, unknown>) => void) => {
          const current = state.get(id) ?? { id }
          const draft = { ...current }
          updater(draft)
          state.set(id, draft)
          return { isPersisted: { promise: Promise.resolve() } }
        }),
        delete: vi.fn((id: string) => {
          state.delete(id)
          return { isPersisted: { promise: Promise.resolve() } }
        }),
        fetch: vi.fn().mockResolvedValue([]),
        subscribeToPod: vi.fn().mockResolvedValue(() => undefined),
        utils: {
          writeUpsert: vi.fn((row: Record<string, unknown>) => {
            if (typeof row.id === 'string') state.set(row.id, row)
          }),
        },
      }
    }),
  }
})

vi.mock('@/lib/data/pod-collection', () => ({
  createPodCollection: mocked.createPodCollection,
}))

vi.mock('@/providers/query-provider', () => ({
  queryClient: {
    invalidateQueries: mocked.invalidateQueries,
  },
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: null }),
}))

vi.mock('@/modules/favorites/collections', () => ({
  favoriteHooks: {
    onStarredChange: vi.fn(),
  },
}))

vi.mock('@/lib/data/direct-chat-records', () => ({
  createAgentContactRecords: vi.fn(async (_db: unknown, input: Record<string, unknown>) => ({
    agentId: 'agent-1',
    contactId: 'contact-1',
    contactUri: 'https://alice.example/.data/contacts/contact-1.ttl',
    agent: {
      id: 'agent-1',
      name: input.name,
      provider: input.provider,
      model: input.model,
      instructions: input.instructions,
    },
    contact: {
      id: 'contact-1',
      name: input.name,
      contactType: 'agent',
      entity: 'agent-1',
    },
  })),
  writeCollectionRow: vi.fn((collection: any, row: Record<string, unknown>, key?: string) => {
    if (typeof collection?.utils?.writeUpsert === 'function') {
      collection.utils.writeUpsert({ ...row, id: key ?? row.id })
    }
  }),
}))

vi.mock('./agent-home', () => ({
  ensureAgentHome: vi.fn().mockResolvedValue(undefined),
}))

import {
  chatOps,
  clearChatOpsSyncResults,
  getChatOpsSyncResults,
  initializeChatCollections,
} from './collections'

type InsertRecord = {
  table: unknown
  values: Record<string, unknown>
}

function createMockDb() {
  const inserts: InsertRecord[] = []
  const rows = new Map<unknown, Array<Record<string, unknown>>>()

  function tableRows(table: unknown): Array<Record<string, unknown>> {
    const existing = rows.get(table)
    if (existing) return existing
    const next: Array<Record<string, unknown>> = []
    rows.set(table, next)
    return next
  }

  function resolveMockRowIri(table: unknown, row: Record<string, unknown>) {
    const id = String(row.id ?? '')
    if (id.includes('.ttl#')) {
      return table === chatTable
        ? `https://alice.example/.data/chat/${id}`
        : `https://alice.example/.data/${id}`
    }
    if (table === threadTable) {
      return `https://alice.example/.data/chat/${row.chat}/index.ttl#${row.id}`
    }
    if (table === messageTable) {
      return `https://alice.example/.data/chat/${row.chat}/2026/03/18/messages.ttl#${row.id}`
    }
    return `https://alice.example/.data/chat/${row.id}/index.ttl#this`
  }

  return {
    db: {
      insert(table: unknown) {
        return {
          values(values: Record<string, unknown>) {
            inserts.push({ table, values })
            tableRows(table).push(values)
            return {
              execute: vi.fn().mockResolvedValue([values]),
            }
          },
        }
      },
      findById(table: unknown, id: string) {
        return Promise.resolve(tableRows(table).find((row) => row.id === id) ?? null)
      },
      updateById(table: unknown, id: string, update: Record<string, unknown>) {
        const rowsForTable = tableRows(table)
        const index = rowsForTable.findIndex((row) => row.id === id)
        if (index === -1) {
          const row = { id, ...update }
          rowsForTable.push(row)
          return Promise.resolve(row)
        }

        rowsForTable[index] = { ...rowsForTable[index], ...update }
        return Promise.resolve(rowsForTable[index])
      },
      updateByIri(table: unknown, iri: string, update: Record<string, unknown>) {
        const rowsForTable = tableRows(table)
        const index = rowsForTable.findIndex((row) => resolveMockRowIri(table, row) === iri)
        if (index === -1) {
          return Promise.resolve(null)
        }

        rowsForTable[index] = { ...rowsForTable[index], ...update }
        return Promise.resolve(rowsForTable[index])
      },
      resolveRowIri(table: unknown, row: Record<string, unknown>) {
        return resolveMockRowIri(table, row)
      },
    },
    inserts,
  }
}

describe('chatOps sync projection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.states.forEach((state) => state.clear())
    clearChatOpsSyncResults()
    initializeChatCollections(null)
  })

  it('models direct thread and message writes as local-to-core Pod projections', async () => {
    const { db, inserts } = createMockDb()
    initializeChatCollections(db as any)

    await (db as any).insert(chatTable).values({
      id: chatResourceId('chat-1'),
      title: 'Existing Chat',
    }).execute()

    const thread = await chatOps.createThread('chat-1', 'Thread One')
    const message = await chatOps.createUserMessage('chat-1', thread.id, 'hello', 'https://alice.example/profile/card#me')

    expect(inserts.filter((item) => item.table === threadTable)).toHaveLength(1)
    expect(inserts.filter((item) => item.table === messageTable)).toHaveLength(1)
    const messageInsert = inserts.find((item) => item.table === messageTable)
    expect(messageInsert?.values).toMatchObject({
      id: expect.stringMatching(new RegExp(`^chat/chat-1/\\d{4}/\\d{2}/\\d{2}/messages\\.ttl#${message.id}$`)),
      chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
      thread: `https://alice.example/.data/chat/chat-1/index.ttl#${thread.id}`,
      role: 'user',
      content: 'hello',
    })

    expect(getChatOpsSyncResults()).toHaveLength(3)
    expect(getChatOpsSyncResults()[0]).toMatchObject({
      source: 'app-chat-ops',
      target: 'pod',
      direction: 'local-to-core',
      plane: 'projection',
      authority: 'core',
      status: 'completed',
      metadata: {
        action: 'thread.create',
        resourceBindings: {
          chat: {
            uri: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
            local: 'chat-1',
          },
          thread: {
            uri: `https://alice.example/.data/chat/chat-1/index.ttl#${thread.id}`,
            local: thread.id,
          },
        },
      },
    })
    expect(getChatOpsSyncResults()[1]).toMatchObject({
      source: 'app-chat-ops',
      target: 'pod',
      direction: 'local-to-core',
      plane: 'projection',
      authority: 'core',
      status: 'completed',
      metadata: {
        action: 'message.create',
        resourceBindings: {
          chat: {
            uri: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
            local: 'chat-1',
          },
          thread: {
            uri: `https://alice.example/.data/chat/chat-1/index.ttl#${thread.id}`,
            local: thread.id,
          },
          message: {
            uri: `https://alice.example/.data/${messageInsert?.values.id}`,
            local: message.id,
          },
        },
        role: 'user',
      },
    })
    expect(getChatOpsSyncResults()[2]).toMatchObject({
      source: 'app-chat-ops',
      target: 'pod',
      direction: 'local-to-core',
      plane: 'projection',
      authority: 'core',
      status: 'completed',
      metadata: {
        action: 'chat.update',
        resourceBindings: {
          chat: {
            uri: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
            local: 'chat-1',
          },
        },
        fieldKeys: ['lastActiveAt', 'lastMessage', 'lastMessagePreview'],
      },
    })
  })

  it('models AI chat creation with returned chat, agent, and contact ids', async () => {
    const { db } = createMockDb()
    initializeChatCollections(db as any)

    const chat = await chatOps.createAIChat({
      title: 'Coder',
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'Help with code.',
    })

    expect(chat.id).toEqual(expect.any(String))
    expect(chat).toMatchObject({
      agentId: 'agent-1',
      contactId: 'contact-1',
    })
    expect(getChatOpsSyncResults()).toHaveLength(1)
    expect(getChatOpsSyncResults()[0]).toMatchObject({
      source: 'app-chat-ops',
      target: 'pod',
      direction: 'local-to-core',
      plane: 'projection',
      authority: 'core',
      status: 'completed',
      metadata: {
        action: 'ai-chat.create',
        resourceBindings: {
          chat: {
            uri: `https://alice.example/.data/chat/${chat.id}/index.ttl#this`,
            local: chat.id,
          },
          agent: {
            uri: 'agent-1',
            local: 'agent-1',
          },
          contact: {
            uri: 'https://alice.example/.data/contacts/contact-1.ttl',
            local: 'contact-1',
          },
        },
        provider: 'openai',
        model: 'gpt-4o',
      },
    })
  })
})
