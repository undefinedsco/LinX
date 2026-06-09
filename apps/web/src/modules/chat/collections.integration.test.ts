// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import {
  chatTable,
  aiProviderTable,
  credentialTable,
  threadTable,
  messageTable,
  solidSchema,
  extractChatIdFromChatRef,
  aiConfigProviderRef,
  getDefaultAIConfigCredentialId,
} from '@undefineds.co/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '../../test/xpod-integration'
import { chatOps, initializeChatCollections } from './collections'

let context: XpodIntegrationContext<typeof solidSchema> | null = null

function chatResourceId(key: string): string {
  return chatTable.buildId({ id: key })
}

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
    tables: [chatTable, threadTable, messageTable, aiProviderTable, credentialTable],
  })
  initializeChatCollections(context.db)
  return context
}

afterAll(async () => {
  await context?.stop()
}, 90000)

describe('chat collections integration', () => {
  it('insert chat and SELECT back via SPARQL', { timeout: 90000 }, async () => {
    const { db: database, webId } = await getContext()

    const id = `chat-${Date.now()}`
    const resourceId = chatResourceId(id)
    const [created] = await database.insert(chatTable).values({
      id: resourceId,
      title: 'Integration Chat',
      description: 'chat insert test',
      participants: [webId],
    }).execute()

    expect(created).toBeDefined()

    // Round-trip: SELECT back via SPARQL endpoint
    const row = await (database as any).findById(chatTable as any, resourceId)
    expect(row).toBeTruthy()
    expect(row?.title).toBe('Integration Chat')
  })

  it('round-trips group chat participants and metadata object', { timeout: 90000 }, async () => {
    const { db: database, webId } = await getContext()

    const id = `group-chat-${Date.now()}`
    const podBase = webId.replace('/profile/card#me', '')
    const assistantUri = `${podBase}/agents/assistant-${id}/profile/card#me`
    const metadata = {
      memberRoles: {
        [webId]: 'owner',
        [assistantUri]: 'member',
      },
    } as const

    const resourceId = chatResourceId(id)
    await database.insert(chatTable).values({
      id: resourceId,
      title: 'Group Round Trip',
      participants: [webId, assistantUri],
      metadata,
    }).execute()

    const chats = await chatOps.fetchChats()
    const roundTripped = chats.find((row) => row.id === id || extractChatIdFromChatRef(row.id) === id)
    expect(roundTripped).toBeDefined()
    expect(roundTripped?.participants).toEqual(expect.arrayContaining([assistantUri]))
    expect(roundTripped?.metadata).toMatchObject(metadata)

    await (database as any).deleteById(chatTable as any, resourceId)
  })

  it('insert thread/message and SELECT back', { timeout: 90000 }, async () => {
    const { db: database, webId } = await getContext()

    const chatId = `chat-thread-${Date.now()}`
    const chatResource = chatResourceId(chatId)
    await database.insert(chatTable).values({
      id: chatResource,
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
    const messageIri = (message as Record<string, unknown>)['@id']
    const roundTripped = msgRows.find((row) => row.id === message.id || (row as Record<string, unknown>)['@id'] === messageIri)
    expect(roundTripped).toBeDefined()
    expect(roundTripped?.content).toBe('hello from integration test')
  })

  it('resolves AI credential through provider resource refs', { timeout: 90000 }, async () => {
    const { db: database } = await getContext()
    const suffix = crypto.randomUUID()
    const providerId = `openai-${suffix}`
    const credentialId = getDefaultAIConfigCredentialId(providerId)

    await database.insert(aiProviderTable).values({
      id: providerId,
      baseUrl: 'https://api.openai.example/v1',
    }).execute()

    await database.insert(credentialTable).values({
      id: credentialId,
      provider: aiConfigProviderRef(providerId),
      service: 'ai',
      status: 'active',
      isDefault: true,
      apiKey: 'sk-openai-test',
    }).execute()

    await expect(chatOps.getCredential(providerId)).resolves.toEqual({
      apiKey: 'sk-openai-test',
      baseUrl: 'https://api.openai.example/v1',
    })

    await (database as any).deleteById(credentialTable as any, credentialId)
    await (database as any).deleteById(aiProviderTable as any, providerId)
  })

  it('delete chat and verify via SELECT', { timeout: 90000 }, async () => {
    const { db: database, webId } = await getContext()

    const id = `chat-del-${Date.now()}`
    const resourceId = chatResourceId(id)
    await database.insert(chatTable).values({
      id: resourceId,
      title: 'Delete Me',
      participants: [webId],
    }).execute()

    await (database as any).deleteById(chatTable as any, resourceId)

    // Verify deletion via SPARQL SELECT
    const row = await (database as any).findById(chatTable as any, resourceId)
    expect(row).toBeNull()
  })
})
