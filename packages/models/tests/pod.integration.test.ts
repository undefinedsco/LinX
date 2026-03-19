import 'dotenv/config'
import { describe, it, expect } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle } from '@undefineds.co/drizzle-solid'
import { chatTable } from '../src/chat.schema'
import { threadTable } from '../src/thread.schema'
import { messageTable } from '../src/message.schema'
import { linxSchema } from '../src/schema'
import { eq } from '@undefineds.co/drizzle-solid'

const env = {
  webId: process.env.SOLID_WEBID,
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER,
}

const hasEnv = Boolean(env.webId && env.clientId && env.clientSecret && env.oidcIssuer)

function resolvePodUri(table: { resolveUri: (id: string) => string }, id: string) {
  if (!env.webId) return table.resolveUri(id)
  const relative = table.resolveUri(id)
  if (relative.startsWith('http://') || relative.startsWith('https://')) {
    return relative
  }
  const webIdUrl = new URL(env.webId)
  const baseRoot = webIdUrl.pathname.split('/profile/')[0] + '/'
  const podBase = `${webIdUrl.origin}${baseRoot}`
  return new URL(relative, podBase).toString()
}

describe('Solid Pod live CRUD (chat)', () => {
  it.skipIf(!hasEnv)('creates chat/thread/message and cleans up', { timeout: 60000 }, async () => {
    const session = new Session()
    await session.login({
      clientId: env.clientId!,
      clientSecret: env.clientSecret!,
      oidcIssuer: env.oidcIssuer!,
      tokenType: 'DPoP',
    })

    const db = drizzle(session, {
      logger: false,
      disableInteropDiscovery: true,
      schema: linxSchema,
    })

    // Ensure containers/resources exist (will create containers if missing)
    await db.init([chatTable, threadTable, messageTable])

    const chatIdValue = crypto.randomUUID()
    const threadIdValue = crypto.randomUUID()
    const messageIdValue = crypto.randomUUID()
    const title = `integration-chat-${Date.now()}`
    const description = `integration-desc-${chatIdValue}`
    const now = new Date()

    const [created] = await db
      .insert(chatTable)
      .values({
        id: chatIdValue,
        title,
        description,
        provider: 'openai',
        model: 'gpt-4o-mini',
        participants: [env.webId!],
        createdAt: now,
        updatedAt: now,
      })
      .execute()

    const chatRows = await db.select().from(chatTable).where(eq(chatTable.description, description)).execute()
    const chatRecord = chatRows[0] ?? created
    let chatId =
      (created as any)?.['@id'] ||
      (created as any)?.subject ||
      (created as any)?.uri ||
      ((chatRecord as Record<string, unknown>)['@id'] as string | undefined)
    if (!chatId) {
      const allChats = await db.select().from(chatTable).execute()
      const match = allChats.find(
        (row) =>
          (row as any).id === chatIdValue ||
          (row as any)['@id']?.includes?.(chatIdValue),
      )
      chatId = (match as any)?.['@id']
    }
    if (!chatId) {
      chatId = resolvePodUri(chatTable, chatIdValue)
    }
    expect(chatRecord, 'inserted chat').toBeTruthy()

    // Create thread
    const [threadCreated] = await db
      .insert(threadTable)
      .values({
        id: threadIdValue,
        chatId: chatId ?? chatIdValue,
        title: 'integration-thread',
        createdAt: now,
        updatedAt: now,
      })
      .execute()

    const threadRows = await db
      .select()
      .from(threadTable)
      .where(eq(threadTable.chatId, chatId ?? chatIdValue))
      .execute()
    const threadRecord = threadRows[0] ?? threadCreated
    let threadId =
      (threadCreated as any)?.['@id'] ||
      (threadCreated as any)?.subject ||
      (threadCreated as any)?.uri ||
      ((threadRecord as Record<string, unknown>)['@id'] as string | undefined)
    if (!threadId) {
      const allThreads = await db.select().from(threadTable).execute()
      const match = allThreads.find(
        (row) =>
          (row as any).id === threadIdValue ||
          (row as any)['@id']?.includes?.(threadIdValue),
      )
      threadId = (match as any)?.['@id']
    }
    if (!threadId) {
      threadId = resolvePodUri(threadTable, threadIdValue)
    }
    expect(threadRecord, 'inserted thread').toBeTruthy()

    // Create message (document mode with date partition)
    const [msgCreated] = await db
      .insert(messageTable)
      .values({
        id: messageIdValue,
        chat: chatId ?? chatIdValue,
        thread: threadId ?? threadIdValue,
        maker: env.webId!,
        role: 'user',
        content: 'hello from integration test',
        status: 'sent',
        createdAt: now,
      })
      .execute()

    const messageRows = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.thread, threadId ?? threadIdValue))
      .execute()
    const messageRecord = messageRows[0] ?? msgCreated
    let messageId =
      (msgCreated as any)?.['@id'] ||
      (msgCreated as any)?.subject ||
      (msgCreated as any)?.uri ||
      ((messageRecord as Record<string, unknown>)['@id'] as string | undefined)
    if (!messageId) {
      const allMessages = await db.select().from(messageTable).execute()
      const match = allMessages.find(
        (row) =>
          (row as any).id === messageIdValue ||
          (row as any)['@id']?.includes?.(messageIdValue),
      )
      messageId = (match as any)?.['@id']
    }
    if (!messageId) {
      messageId = resolvePodUri(messageTable, messageIdValue)
    }
    expect(messageRecord, 'inserted message').toBeTruthy()

    // Update chat/thread/message
    const updatedTitle = `${title}-updated`
    await db
      .update(chatTable)
      .set({ title: updatedTitle })
      .where({ '@id': chatId } as any)
      .execute()

    const updatedThreadTitle = 'integration-thread-updated'
    await db
      .update(threadTable)
      .set({ title: updatedThreadTitle })
      .where({ '@id': threadId } as any)
      .execute()

    await db
      .update(messageTable)
      .set({ content: 'updated message content', status: 'edited' })
      .where({ '@id': messageId } as any)
      .execute()

    await db.select().from(threadTable).where({ '@id': threadId } as any).execute()
    await db.select().from(messageTable).where({ '@id': messageId } as any).execute()

    // Cleanup (message -> thread -> chat)
    if (threadId ?? threadIdValue) {
      await db.delete(messageTable).where(eq(messageTable.thread, threadId ?? threadIdValue)).execute()
      await db.delete(threadTable).where({ '@id': threadId ?? threadIdValue } as any).execute()
    }
    if (chatId ?? chatIdValue) {
      await db.delete(chatTable).where({ '@id': chatId ?? chatIdValue } as any).execute()
    }
  })
})
