// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import {
  chatResource,
  aiProviderResource,
  credentialResource,
  threadResource,
  messageResource,
  solidSchema,
  extractChatIdFromChatRef,
  aiConfigProviderRef,
  getDefaultAIConfigCredentialId,
} from '@undefineds.co/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '../../test/xpod-integration'
import {
  chatCollection,
  chatOps,
  configureChatContactsPort,
  initializeChatCollections,
  LINX_DEFAULT_SECRETARY,
  messageCollection,
} from './collections'
import {
  agentCollection,
  contactCollection,
  initializeContactCollections,
} from '@/modules/contacts/data/collections'

let context: XpodIntegrationContext<typeof solidSchema> | null = null

function chatResourceId(key: string): string {
  return chatResource.buildId({ id: key })
}

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
    resources: [chatResource, threadResource, messageResource, aiProviderResource, credentialResource],
  })
  initializeContactCollections(context.db)
  configureChatContactsPort({ agentCollection, contactCollection })
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
    const [created] = await database.insert(chatResource).values({
      id: resourceId,
      title: 'Integration Chat',
      description: 'chat insert test',
      participants: [webId],
    }).execute()

    expect(created).toBeDefined()

    // Round-trip: SELECT back via SPARQL endpoint
    const row = await (database as any).findById(chatResource as any, resourceId)
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
    await database.insert(chatResource).values({
      id: resourceId,
      title: 'Group Round Trip',
      participants: [webId, assistantUri],
      metadata,
    }).execute()

    const chats = await chatCollection.fetch({ refetch: true })
    const roundTripped = chats.find((row) => row.id === id || extractChatIdFromChatRef(row.id) === id)
    expect(roundTripped).toBeDefined()
    expect(roundTripped?.participants).toEqual(expect.arrayContaining([assistantUri]))
    expect(roundTripped?.metadata).toMatchObject(metadata)

    await (database as any).deleteById(chatResource as any, resourceId)
  })

  it('insert thread/message and SELECT back', { timeout: 90000 }, async () => {
    const { db: database, webId } = await getContext()

    const chatId = `chat-thread-${Date.now()}`
    const chatRecordId = chatResourceId(chatId)
    await database.insert(chatResource).values({
      id: chatRecordId,
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

    const msgRows = (await messageCollection.fetch({ refetch: true }))
      .filter((row) => row.thread === thread.id || row.thread?.includes(thread.id))
    const messageIri = (message as Record<string, unknown>)['@id']
    const roundTripped = msgRows.find((row) => row.id === message.id || (row as Record<string, unknown>)['@id'] === messageIri)
    expect(roundTripped).toBeDefined()
    expect(roundTripped?.content).toBe('hello from integration test')

    const fetchFn = (database as any).getDialect?.()?.getAuthenticatedFetch?.()
    expect(fetchFn).toBeTypeOf('function')
    const response = await fetchFn(new URL(`.data/chat/${chatId}/index.ttl`, context!.podUrl).toString(), {
      headers: { Accept: 'text/turtle, */*;q=0.1' },
    })
    const body = await response.text()
    expect(response.ok, body).toBe(true)
    expect(body).toContain('Thread Test Chat')
    expect(body).toContain('Thread One')
  })

  it('keeps the Secretary chat subject when the default thread is created', { timeout: 90000 }, async () => {
    const { db: database, podUrl } = await getContext()

    await chatOps.ensureLinxWelcome({ force: true })
    const thread = await chatOps.createThread(LINX_DEFAULT_SECRETARY.chatId, LINX_DEFAULT_SECRETARY.threadTitle)
    expect(thread.title).toBe(LINX_DEFAULT_SECRETARY.threadTitle)

    const fetchFn = (database as any).getDialect?.()?.getAuthenticatedFetch?.()
    expect(fetchFn).toBeTypeOf('function')
    const response = await fetchFn(new URL('.data/chat/__secretary__/index.ttl', podUrl).toString(), {
      headers: { Accept: 'text/turtle, */*;q=0.1' },
    })
    const body = await response.text()
    expect(response.ok, body).toBe(true)
    expect(body).toContain(LINX_DEFAULT_SECRETARY.title)
    expect(body).toContain(LINX_DEFAULT_SECRETARY.threadTitle)
  })

  it('resolves AI credential through provider resource refs', { timeout: 90000 }, async () => {
    const { db: database } = await getContext()
    const suffix = crypto.randomUUID()
    const providerId = `openai-${suffix}`
    const credentialId = getDefaultAIConfigCredentialId(providerId)
    const providerResourceId = aiProviderResource.buildId({ id: providerId })
    const credentialResourceId = credentialResource.buildId({ id: credentialId })

    await database.insert(aiProviderResource).values({
      id: providerResourceId,
      baseUrl: 'https://api.openai.example/v1',
    }).execute()

    await database.insert(credentialResource).values({
      id: credentialResourceId,
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

    await (database as any).deleteById(credentialResource as any, credentialResourceId)
    await (database as any).deleteById(aiProviderResource as any, providerResourceId)
  })

  it('delete chat and verify via SELECT', { timeout: 90000 }, async () => {
    const { db: database, webId } = await getContext()

    const id = `chat-del-${Date.now()}`
    const resourceId = chatResourceId(id)
    await database.insert(chatResource).values({
      id: resourceId,
      title: 'Delete Me',
      participants: [webId],
    }).execute()

    await (database as any).deleteById(chatResource as any, resourceId)

    // Verify deletion via SPARQL SELECT
    const row = await (database as any).findById(chatResource as any, resourceId)
    expect(row).toBeNull()
  })
})
