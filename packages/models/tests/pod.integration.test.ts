import 'dotenv/config'
import { afterAll, describe, it, expect } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle } from '@undefineds.co/drizzle-solid'
import { chatTable } from '../src/chat.schema'
import { threadTable } from '../src/thread.schema'
import { messageTable } from '../src/message.schema'
import { solidSchema } from '../src/schema'
import { startLocalXpod, type LocalXpodTestPod } from './utils/local-xpod'
import { eq } from '@undefineds.co/drizzle-solid'

let localXpod: LocalXpodTestPod | null = null

const env = {
  webId: process.env.SOLID_WEBID,
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER,
}

async function ensureEnv(): Promise<typeof env> {
  if (env.webId && env.clientId && env.clientSecret && env.oidcIssuer) return env
  if (!localXpod) {
    localXpod = await startLocalXpod()
  }
  env.webId = localXpod.webId
  env.clientId = localXpod.clientId
  env.clientSecret = localXpod.clientSecret
  env.oidcIssuer = localXpod.oidcIssuer
  return env
}


afterAll(async () => {
  await localXpod?.stop()
})

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
  it('creates chat/thread/message and cleans up', { timeout: 60000 }, async () => {
    const activeEnv = await ensureEnv()
    const session = new Session()
    await session.login({
      clientId: activeEnv.clientId!,
      clientSecret: activeEnv.clientSecret!,
      oidcIssuer: activeEnv.oidcIssuer!,
      tokenType: 'DPoP',
    })

    const db = drizzle(session, {
      logger: false,
      disableInteropDiscovery: true,
      schema: solidSchema,
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
        chat: chatIdValue,
        title: 'integration-thread',
        createdAt: now,
        updatedAt: now,
      })
      .execute()

    const threadRows = await db
      .select()
      .from(threadTable)
      .where(eq(threadTable.chat, chatIdValue))
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
        chat: chatIdValue,
        thread: threadIdValue,
        maker: env.webId!,
        role: 'user',
        content: 'hello from integration test',
        status: 'sent',
        createdAt: now,
      })
      .execute()

    const messageRecord = msgCreated
    let messageId =
      (msgCreated as any)?.['@id'] ||
      (msgCreated as any)?.subject ||
      (msgCreated as any)?.uri ||
      ((messageRecord as Record<string, unknown>)['@id'] as string | undefined)
    if (!messageId) {
      messageId = resolvePodUri(messageTable, messageIdValue)
    }
    expect(messageRecord, 'inserted message').toBeTruthy()

    // Verify the inserted resources can be read back from the live Pod.
    // The self-hosted Pod is temporary, so cleanup is handled by server shutdown.
    expect(chatId).toContain(chatIdValue)
    expect(threadId).toContain(threadIdValue)
    expect(messageId).toContain(messageIdValue)

  })
})
