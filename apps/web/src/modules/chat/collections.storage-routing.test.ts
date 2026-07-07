import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatResource, messageResource, threadResource } from '@undefineds.co/models'
import { chatOps, initializeChatCollections } from './collections'

const SELECTED_SP_POD_URL = 'https://node-0000.undefineds.co/alice/'
const CLOUD_WEB_ID = 'https://id.undefineds.co/alice/profile/card#me'
const CLOUD_DATA_PREFIX = 'https://id.undefineds.co/alice/.data/'

describe('chatOps storage routing', () => {
  afterEach(() => {
    initializeChatCollections(null)
    vi.restoreAllMocks()
  })

  it('writes post-login chat data to the selected SP while keeping the Cloud WebID as maker', async () => {
    const chatId = `chat-sp-routing-${Date.now()}`
    const { db, inserts, updates } = createSelectedSpDb(chatId)
    initializeChatCollections(db as any)

    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('thread-sp-routing')
      .mockReturnValueOnce('message-sp-routing')

    const thread = await chatOps.createThread(chatId, 'SP routing')
    const message = await chatOps.createUserMessage(
      chatId,
      thread.id,
      'hello selected sp',
      CLOUD_WEB_ID,
    )

    const threadInsert = inserts.find((entry) => entry.resource === threadResource)?.values
    const messageInsert = inserts.find((entry) => entry.resource === messageResource)?.values

    expect(threadInsert?.id).toBe(thread.id)
    expect(messageInsert?.id).toBe(message.id)
    expect(thread.id).toBe(`chat/${chatId}/index.ttl#thread-sp-routing`)
    expect(message.id).toContain('#message-sp-routing')
    expect(message.chat).toBe(`${SELECTED_SP_POD_URL}.data/chat/${chatId}/index.ttl#this`)
    expect(message.thread).toBe(`${SELECTED_SP_POD_URL}.data/chat/${chatId}/index.ttl#thread-sp-routing`)
    expect(message.maker).toBe(CLOUD_WEB_ID)
    expect(messageInsert?.chat).toBe(message.chat)
    expect(messageInsert?.thread).toBe(message.thread)
    expect(messageInsert?.maker).toBe(CLOUD_WEB_ID)
    expect((messageInsert?.metadata as any)?.reconciler?.latest?.eventType).toBe('message.appended')
    expect((messageInsert?.metadata as any)?.reconciler?.latest?.wakeJobs?.[0]?.targetRole).toBe('primary-agent')
    expect((messageInsert?.metadata as any)?.reconciler?.latest?.wakeJobs?.[0]?.sourceResource).toBe(`${SELECTED_SP_POD_URL}.data/${message.id}`)
    expect(updates.find((entry) => entry.resource === chatResource)?.id).toBe(`${chatId}/index.ttl#this`)

    const persisted = JSON.stringify({
      inserts: inserts.map((entry) => entry.values),
      updates: updates.map((entry) => entry.values),
    })
    expect(persisted).toContain(SELECTED_SP_POD_URL)
    expect(persisted).not.toContain(CLOUD_DATA_PREFIX)
  })

  it('updates the persisted chat resource after appending a message with a created thread id', async () => {
    const chatId = `chat-message-resource-id-${Date.now()}`
    const { db, inserts, updates } = createSelectedSpDb(chatId)
    initializeChatCollections(db as any)

    const thread = await chatOps.createThread(chatId, 'Resource id thread', { threadId: 'thread-resource-id' })
    const message = await chatOps.createAssistantMessage(
      chatId,
      thread.id,
      'assistant message with resource thread id',
      CLOUD_WEB_ID,
      JSON.stringify({ items: [] }),
      { messageId: 'message-resource-id' },
    )

    const messageInsert = inserts.find((entry) => entry.resource === messageResource)?.values

    expect(thread.id).toBe(`chat/${chatId}/index.ttl#thread-resource-id`)
    expect(message.thread).toBe(`${SELECTED_SP_POD_URL}.data/chat/${chatId}/index.ttl#thread-resource-id`)
    expect(messageInsert?.thread).toBe(message.thread)
    expect(updates.find((entry) => entry.resource === chatResource)?.id).toBe(`${chatId}/index.ttl#this`)
  })
})

function createSelectedSpDb(chatId: string) {
  const chatRow = {
    id: chatId,
    title: 'Selected SP Chat',
    participants: [CLOUD_WEB_ID],
    metadata: {
      memberRoles: {
        [CLOUD_WEB_ID]: 'owner',
      },
    },
    createdAt: new Date('2026-05-26T00:00:00.000Z'),
    updatedAt: new Date('2026-05-26T00:00:00.000Z'),
  }
  const inserts: Array<{ resource: unknown; values: Record<string, unknown> }> = []
  const updates: Array<{ resource: unknown; id: string; values: Record<string, unknown> }> = []

  const db = {
    getDialect: () => ({
      getPodUrl: () => SELECTED_SP_POD_URL,
      getWebId: () => CLOUD_WEB_ID,
    }),
    resolveRowIri: vi.fn((resource: unknown, row: Record<string, unknown>) => {
      if (resource === chatResource) {
        return `${SELECTED_SP_POD_URL}.data/chat/${row.id}`
      }
      if (resource === threadResource) {
        return `${SELECTED_SP_POD_URL}.data/${row.id}`
      }
      if (resource === messageResource) {
        return `${SELECTED_SP_POD_URL}.data/${row.id}`
      }
      return null
    }),
    findById: vi.fn(async (resource: unknown, id: string) => {
      if (resource === chatResource && id === chatId) {
        return chatRow
      }
      return null
    }),
    insert: vi.fn((resource: unknown) => ({
      values(values: Record<string, unknown>) {
        inserts.push({ resource, values })
        return {
          execute: vi.fn(async () => [values]),
        }
      },
    })),
    updateById: vi.fn(async (resource: unknown, id: string, values: Record<string, unknown>) => {
      updates.push({ resource, id, values })
      return { id, ...values }
    }),
    select: vi.fn(() => ({
      from(resource: unknown) {
        const query = {
          where: vi.fn(() => query),
          orderBy: vi.fn(() => query),
          execute: vi.fn(async () => (resource === chatResource ? [chatRow] : [])),
        }
        return query
      },
    })),
  }

  return { db, inserts, updates }
}
