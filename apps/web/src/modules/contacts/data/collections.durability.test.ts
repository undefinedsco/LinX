import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown> & { id: string }

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  contacts: new Map<string, Row>(),
  agents: new Map<string, Row>(),
  chats: new Map<string, Row>(),
  homes: new Set<string>(),
  nextChatError: null as Error | null,
  nextContactError: null as Error | null,
  contactIndex: 0,
  chatIndex: 0,
}))

function persistedTx(promise: Promise<void> = Promise.resolve()) {
  return { isPersisted: { promise } }
}

vi.mock('@/lib/data/pod-collection', () => ({
  createPodCollection: vi.fn((options: { queryKey: string[] }) => {
    const rows = options.queryKey[0] === 'agents' ? mocks.agents : mocks.contacts
    return {
      state: rows,
      insert: vi.fn((row: Row) => {
        rows.set(row.id, row)
        return persistedTx()
      }),
      update: vi.fn(() => persistedTx()),
      delete: vi.fn((id: string) => {
        mocks.events.push(`contact:delete:${id}`)
        rows.delete(id)
        return persistedTx()
      }),
      fetch: vi.fn(async () => Array.from(rows.values())),
      subscribeToPod: vi.fn(async () => () => {}),
    }
  }),
}))

vi.mock('@/lib/data/direct-chat-records', () => ({
  createAgentContactRecords: vi.fn(async (_db: unknown, input: Record<string, string>) => {
    if (mocks.nextContactError) {
      const error = mocks.nextContactError
      mocks.nextContactError = null
      throw error
    }
    const contactId = `agent-contact-${++mocks.contactIndex}`
    const agentId = input.agentId
    const agent = { id: agentId, name: input.name }
    const contact = {
      id: contactId,
      name: input.name,
      about: `https://pod.example/agents/${agentId}`,
      contactType: 'agent',
    }
    mocks.events.push(`contact:create:${contactId}`)
    mocks.contacts.set(contactId, contact)
    return {
      agent,
      contact,
      agentId,
      contactId,
      contactUri: `https://pod.example/.data/contacts/${contactId}.ttl#this`,
    }
  }),
  createSolidContactRecord: vi.fn(async (_db: unknown, input: Record<string, string>) => {
    const contactId = `friend-${++mocks.contactIndex}`
    const contact = { id: contactId, name: input.name, about: input.webId, contactType: 'solid' }
    mocks.events.push(`contact:create:${contactId}`)
    mocks.contacts.set(contactId, contact)
    return {
      contact,
      contactId,
      contactUri: `https://pod.example/.data/contacts/${contactId}.ttl#this`,
    }
  }),
  createGroupContactRecord: vi.fn(async (_db: unknown, input: Record<string, string>) => {
    const contactId = `group-${++mocks.contactIndex}`
    const contact = { id: contactId, name: input.name, about: input.about, contactType: 'solid' }
    mocks.events.push(`contact:create:${contactId}`)
    mocks.contacts.set(contactId, contact)
    return {
      contact,
      contactId,
      contactUri: `https://pod.example/.data/contacts/${contactId}.ttl#this`,
    }
  }),
  writeCollectionRow: vi.fn((collection: { state?: Map<string, Row> }, row: Row, id?: string) => {
    collection.state?.set(id ?? row.id, row)
  }),
}))

vi.mock('@/lib/data/agent-home', () => ({
  createAgentHome: vi.fn(async (_db: unknown, input: { agentId: string }) => {
    mocks.events.push(`agent:create:${input.agentId}`)
    mocks.homes.add(input.agentId)
    return {
      created: true,
      rollback: async () => {
        mocks.events.push(`agent:delete:${input.agentId}`)
        mocks.homes.delete(input.agentId)
      },
    }
  }),
}))

vi.mock('@/providers/query-provider', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}))

import {
  configureContactsChatPort,
  contactOps,
  setContactsDatabaseGetter,
} from './collections'
import { createAgentHome } from '@/lib/data/agent-home'

const chatCollection = {
  state: mocks.chats,
  insert: vi.fn((row: Row) => {
    const id = row.id || `chat-${++mocks.chatIndex}`
    mocks.events.push(`chat:create:${id}`)
    mocks.chats.set(id, row)
    const error = mocks.nextChatError
    mocks.nextChatError = null
    mocks.nextContactError = null
    const persistence = error
      ? Promise.reject(error).catch((cause) => {
          mocks.chats.delete(id)
          throw cause
        })
      : Promise.resolve()
    return persistedTx(persistence)
  }),
  update: vi.fn(() => persistedTx()),
  delete: vi.fn((id: string) => {
    mocks.chats.delete(id)
    return persistedTx()
  }),
}

configureContactsChatPort({
  chatCollection,
  threadCollection: { state: new Map() },
  useSelectChat: () => vi.fn(),
  createMatrixGroupRoom: vi.fn(),
  loadMatrixChatRow: vi.fn(),
  loadMatrixThreadRow: vi.fn(),
})

describe('Contacts durable creation compensation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.events.length = 0
    mocks.contacts.clear()
    mocks.agents.clear()
    mocks.chats.clear()
    mocks.homes.clear()
    mocks.nextChatError = null
    mocks.contactIndex = 0
    mocks.chatIndex = 0
    setContactsDatabaseGetter(() => ({
      resolveRowIri: (_resource: unknown, row: Row) => `https://pod.example/.data/chat/${row.id}`,
    }) as any)
  })

  afterEach(() => {
    setContactsDatabaseGetter(() => null)
  })

  it('durably creates the Agent Home before Contact and Chat persistence', async () => {
    const result = await contactOps.createAgent({ name: 'Durable Agent' })

    expect(createAgentHome).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'Durable Agent' }),
    )
    expect(mocks.events.map((event) => event.split(':')[0])).toEqual(['agent', 'contact', 'chat'])
    expect(mocks.homes.size).toBe(1)
    expect(mocks.contacts.has(result.id)).toBe(true)
    expect(mocks.chats.has(result.chatId)).toBe(true)
  })

  it('rethrows a Chat persistence failure after reversing Contact and Agent Home writes', async () => {
    const persistenceError = new Error('chat persistence failed')
    mocks.nextChatError = persistenceError

    let surfacedError: unknown
    try {
      await contactOps.createAgent({ name: 'Rollback Agent' })
    } catch (error) {
      surfacedError = error
    }

    expect(surfacedError).toBe(persistenceError)
    expect(mocks.events.map((event) => event.split(':')[0])).toEqual([
      'agent',
      'contact',
      'chat',
      'contact',
      'agent',
    ])
    expect(mocks.contacts.size).toBe(0)
    expect(mocks.chats.size).toBe(0)
    expect(mocks.homes.size).toBe(0)
    expect(mocks.agents.size).toBe(0)
  })

  it('removes a newly-created Agent Home when Contact persistence fails', async () => {
    const persistenceError = new Error('contact persistence failed')
    mocks.nextContactError = persistenceError

    await expect(contactOps.createAgent({ name: 'Contact Failure Agent' }))
      .rejects.toBe(persistenceError)

    expect(mocks.events.map((event) => event.split(':')[0])).toEqual(['agent', 'agent'])
    expect(mocks.homes.size).toBe(0)
    expect(mocks.contacts.size).toBe(0)
    expect(mocks.agents.size).toBe(0)
  })

  it('does not leave duplicate artifacts when createAgent succeeds on retry', async () => {
    mocks.nextChatError = new Error('first chat write failed')
    await expect(contactOps.createAgent({ name: 'Retry Agent' })).rejects.toThrow('first chat write failed')

    const result = await contactOps.createAgent({ name: 'Retry Agent' })

    expect(Array.from(mocks.contacts.keys())).toEqual([result.id])
    expect(Array.from(mocks.chats.keys())).toEqual([result.chatId])
    expect(mocks.homes.size).toBe(1)
    expect(mocks.agents.size).toBe(1)
  })

  it('removes a persisted friend Contact when Chat persistence fails', async () => {
    const persistenceError = new Error('friend chat persistence failed')
    mocks.nextChatError = persistenceError

    await expect(contactOps.addFriend({
      name: 'Alice',
      webId: 'https://alice.example/profile/card#me',
    })).rejects.toBe(persistenceError)

    expect(mocks.contacts.size).toBe(0)
    expect(mocks.events.map((event) => event.split(':')[0])).toEqual(['contact', 'chat', 'contact'])
  })

  it('removes a persisted group Contact when Chat persistence fails', async () => {
    const persistenceError = new Error('group chat persistence failed')
    mocks.nextChatError = persistenceError

    await expect(contactOps.createGroupWithChat({
      name: 'Team',
      participants: ['member-1', 'member-2'],
    })).rejects.toBe(persistenceError)

    expect(mocks.contacts.size).toBe(0)
    expect(mocks.events.map((event) => event.split(':')[0])).toEqual(['contact', 'chat', 'contact'])
  })
})
