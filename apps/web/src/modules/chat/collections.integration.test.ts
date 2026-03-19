// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { eq } from '@undefineds.co/drizzle-solid'
import { chatTable, threadTable, messageTable, linxSchema } from '@linx/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '../../test/xpod-integration'
import { chatOps, initializeChatCollections } from './collections'

let context: XpodIntegrationContext<typeof linxSchema> | null = null

async function getContext(): Promise<XpodIntegrationContext<typeof linxSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: linxSchema,
    tables: [chatTable, threadTable, messageTable],
  })
  initializeChatCollections(context.db)
  return context
}

afterAll(async () => {
  await context?.stop()
}, 30000)

describe('chat collections integration', () => {
  it('insert chat and SELECT back via SPARQL', { timeout: 30000 }, async () => {
    const { db: database, webId } = await getContext()

    const id = `chat-${Date.now()}`
    const [created] = await database.insert(chatTable).values({
      id,
      title: 'Integration Chat',
      description: 'chat insert test',
      participants: [webId],
    }).execute()

    expect(created).toBeDefined()

    // Round-trip: SELECT back via SPARQL endpoint
    const rows = await database.select().from(chatTable).where(eq(chatTable.id, id)).execute()
    expect(rows.length).toBe(1)
    expect(rows[0]?.title).toBe('Integration Chat')
  })

  it('round-trips group chat participants and metadata object', { timeout: 30000 }, async () => {
    const { db: database, webId } = await getContext()

    const id = `group-chat-${Date.now()}`
    const podBase = webId.replace('/profile/card#me', '')
    const assistantUri = `${podBase}/.data/agents/assistant-${id}.ttl#this`
    const metadata = {
      memberRoles: {
        [webId]: 'owner',
        [assistantUri]: 'member',
      },
    } as const

    await database.insert(chatTable).values({
      id,
      title: 'Group Round Trip',
      participants: [webId, assistantUri],
      metadata,
    }).execute()

    const chats = await chatOps.fetchChats()
    const roundTripped = chats.find((row) => row.id === id)
    expect(roundTripped).toBeDefined()
    expect(roundTripped?.participants).toEqual([webId, assistantUri])
    expect(roundTripped?.metadata).toEqual(metadata)

    await database.delete(chatTable).where(eq(chatTable.id, id)).execute()
  })

  it('insert thread/message and SELECT back', { timeout: 30000 }, async () => {
    const { db: database, webId } = await getContext()

    const chatId = `chat-thread-${Date.now()}`
    await database.insert(chatTable).values({
      id: chatId,
      title: 'Thread Test Chat',
      participants: [webId],
    }).execute()

    const thread = await chatOps.createThread(chatId, 'Thread One')
    expect(thread).toBeDefined()

    const message = await chatOps.createUserMessage(
      chatId,
      thread.id,
      'hello from integration test',
      webId,
    )
    expect(message).toBeDefined()

    const msgRows = await chatOps.fetchMessages(thread.id, chatId)
    const roundTripped = msgRows.find((row) => row.id === message.id)
    expect(roundTripped).toBeDefined()
    expect(roundTripped?.content).toBe('hello from integration test')
  })

  it('delete chat and verify via SELECT', { timeout: 30000 }, async () => {
    const { db: database, webId } = await getContext()

    const id = `chat-del-${Date.now()}`
    await database.insert(chatTable).values({
      id,
      title: 'Delete Me',
      participants: [webId],
    }).execute()

    await database.delete(chatTable).where(eq(chatTable.id, id)).execute()

    // Verify deletion via SPARQL SELECT
    const rows = await database.select().from(chatTable).where(eq(chatTable.id, id)).execute()
    expect(rows.length).toBe(0)
  })
})
