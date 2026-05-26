import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatTable, messageTable, threadTable } from '@undefineds.co/models'
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

    const threadInsert = inserts.find((entry) => entry.table === threadTable)?.values
    const messageInsert = inserts.find((entry) => entry.table === messageTable)?.values

    expect(threadInsert?.id).toBe('thread-sp-routing')
    expect(messageInsert?.id).toBe('message-sp-routing')
    expect(message.chat).toBe(`${SELECTED_SP_POD_URL}.data/chat/${chatId}/index.ttl#this`)
    expect(message.thread).toBe(`${SELECTED_SP_POD_URL}.data/chat/${chatId}/index.ttl#thread-sp-routing`)
    expect(message.maker).toBe(CLOUD_WEB_ID)
    expect(messageInsert?.chat).toBe(message.chat)
    expect(messageInsert?.thread).toBe(message.thread)
    expect(messageInsert?.maker).toBe(CLOUD_WEB_ID)
    expect(updates.find((entry) => entry.table === chatTable)?.id).toBe(chatId)

    const persisted = JSON.stringify({
      inserts: inserts.map((entry) => entry.values),
      updates: updates.map((entry) => entry.values),
    })
    expect(persisted).toContain(SELECTED_SP_POD_URL)
    expect(persisted).not.toContain(CLOUD_DATA_PREFIX)
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
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = []
  const updates: Array<{ table: unknown; id: string; values: Record<string, unknown> }> = []

  const db = {
    getDialect: () => ({
      getPodUrl: () => SELECTED_SP_POD_URL,
      getWebId: () => CLOUD_WEB_ID,
    }),
    resolveRowIri: vi.fn((table: unknown, row: Record<string, unknown>) => {
      if (table === chatTable) {
        return `${SELECTED_SP_POD_URL}.data/chat/${row.id}/index.ttl#this`
      }
      if (table === threadTable) {
        return `${SELECTED_SP_POD_URL}.data/chat/${row.chat}/index.ttl#${row.id}`
      }
      return null
    }),
    findById: vi.fn(async (table: unknown, id: string) => {
      if (table === chatTable && id === chatId) {
        return chatRow
      }
      return null
    }),
    insert: vi.fn((table: unknown) => ({
      values(values: Record<string, unknown>) {
        inserts.push({ table, values })
        return {
          execute: vi.fn(async () => [values]),
        }
      },
    })),
    updateById: vi.fn(async (table: unknown, id: string, values: Record<string, unknown>) => {
      updates.push({ table, id, values })
      return { id, ...values }
    }),
    select: vi.fn(() => ({
      from(table: unknown) {
        const query = {
          where: vi.fn(() => query),
          orderBy: vi.fn(() => query),
          execute: vi.fn(async () => (table === chatTable ? [chatRow] : [])),
        }
        return query
      },
    })),
  }

  return { db, inserts, updates }
}
