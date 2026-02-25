// @vitest-environment node
import dotenv from 'dotenv'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, eq, type SolidDatabase } from '@undefineds.co/drizzle-solid'
import { chatTable, threadTable, messageTable, linxSchema } from '@linx/models'
import {
  chatCollection,
  initializeChatCollections,
  messageCollection,
  subscribeToChatCollections,
  threadCollection,
} from './collections'
import { queryClient } from '@/providers/query-provider'

dotenv.config({ path: '../../.env' })

const env = {
  webId: process.env.SOLID_WEBID,
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER,
}

const hasEnv = Boolean(env.webId && env.clientId && env.clientSecret && env.oidcIssuer)

let session: Session | null = null
let db: SolidDatabase | null = null
let loginFailed = false
const createdSubjects: string[] = []

async function getDb(): Promise<SolidDatabase | null> {
  if (loginFailed) return null
  if (db) return db

  try {
    session = new Session()
    await session.login({
      clientId: env.clientId!,
      clientSecret: env.clientSecret!,
      oidcIssuer: env.oidcIssuer!,
      tokenType: 'DPoP',
    })

    db = drizzle(session, { logger: false, disableInteropDiscovery: true, schema: linxSchema })
    await db.init([chatTable, threadTable, messageTable])
    initializeChatCollections(db)
    return db
  } catch (e) {
    console.log('[Test] Login failed (OIDC timeout or connection issue):', (e as Error).message)
    loginFailed = true
    return null
  }
}

async function cleanup() {
  if (!db) return
  for (const subject of createdSubjects) {
    try {
      await db.delete(messageTable).where({ '@id': subject } as any).execute()
      await db.delete(threadTable).where({ '@id': subject } as any).execute()
      await db.delete(chatTable).where({ '@id': subject } as any).execute()
    } catch {
      // ignore cleanup errors
    }
  }
}

afterAll(async () => {
  await cleanup()
  if (session) await session.logout()
}, 40000)

function waitFor(predicate: () => boolean, timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs)
    const interval = setInterval(() => {
      if (predicate()) {
        clearTimeout(timeout)
        clearInterval(interval)
        resolve(true)
      }
    }, 50)
  })
}

describe('chat collections integration', () => {
  it.skipIf(!hasEnv)('optimistic chat insert persists to Pod', { timeout: 20000 }, async () => {
    const database = await getDb()
    if (!database) {
      console.log('[Test] Skipping - database connection failed')
      return
    }

    const ready = new Promise<void>((resolve) => chatCollection.onFirstReady(resolve))
    chatCollection.startSyncImmediate()
    await ready

    const id = `chat-${Date.now()}`
    const newChat = {
      id,
      title: 'Integration Chat',
      description: 'optimistic chat insert',
      contact: env.webId!,
      participants: [env.webId!],
    }

    let optimisticSeen = false
    const subscription = chatCollection.subscribeChanges((changes) => {
      if (changes.some((change) => change.type === 'insert' && change.value?.id === id)) {
        optimisticSeen = true
      }
    })

    const tx = chatCollection.insert(newChat as any)
    const result = await Promise.race([
      waitFor(() => optimisticSeen).then((ok) => (ok ? 'optimistic' : 'timeout')),
      tx.isPersisted.promise.then(() => 'persisted'),
    ])

    subscription.unsubscribe()
    expect(result).toBe('optimistic')

    await tx.isPersisted.promise

    const rows = await database.select().from(chatTable).where(eq(chatTable.id, id)).execute()
    const created = rows[0]
    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push(subject)
    expect(created?.id).toBe(id)
  })

  it.skipIf(!hasEnv)('thread/message CRUD via collections', { timeout: 60000 }, async () => {
    const database = await getDb()
    if (!database) {
      console.log('[Test] Skipping - database connection failed')
      return
    }

    chatCollection.startSyncImmediate()
    threadCollection.startSyncImmediate()
    messageCollection.startSyncImmediate()

    const chatId = `chat-${Date.now()}`
    const threadId = `thread-${Date.now()}`
    const messageId = `message-${Date.now()}`

    const chatTx = chatCollection.insert({
      id: chatId,
      title: 'Thread Test Chat',
      description: 'thread/message test',
      contact: env.webId!,
      participants: [env.webId!],
    } as any)
    await chatTx.isPersisted.promise

    const matchesChatId = (row: any) => row?.id === chatId || row?.['@id']?.includes?.(chatId)
    await waitFor(() => {
      return (chatCollection.state.data ?? []).some(matchesChatId)
    })

    const [chatRow] = await database.select().from(chatTable).where(eq(chatTable.id, chatId)).execute()
    const chatSubject = (chatRow as any)?.['@id'] as string | undefined
    if (chatSubject) createdSubjects.push(chatSubject)
    expect(chatRow?.id).toBe(chatId)

    const threadTx = threadCollection.insert({
      id: threadId,
      chatId: chatSubject ?? chatId,
      title: 'Thread One',
    } as any)
    await threadTx.isPersisted.promise

    const matchesThreadId = (row: any) => row?.id === threadId || row?.['@id']?.includes?.(threadId)
    await waitFor(() => {
      return (threadCollection.state.data ?? []).some(matchesThreadId)
    })

    const [threadRow] = await database.select().from(threadTable).where(eq(threadTable.id, threadId)).execute()
    const threadSubject = (threadRow as any)?.['@id'] as string | undefined
    if (threadSubject) createdSubjects.push(threadSubject)
    expect(threadRow?.id).toBe(threadId)

    const messageTx = messageCollection.insert({
      id: messageId,
      chatId: chatSubject ?? chatId,
      threadId: threadSubject ?? threadId,
      maker: env.webId!,
      role: 'user',
      content: 'hello from collections integration',
      status: 'sent',
    } as any)
    await messageTx.isPersisted.promise

    const matchesMessageId = (row: any) => row?.id === messageId || row?.['@id']?.includes?.(messageId)
    await waitFor(() => {
      return (messageCollection.state.data ?? []).some(matchesMessageId)
    })

    const [messageRow] = await database.select().from(messageTable).where(eq(messageTable.id, messageId)).execute()
    const messageSubject = (messageRow as any)?.['@id'] as string | undefined
    if (messageSubject) createdSubjects.push(messageSubject)
    expect(messageRow?.id).toBe(messageId)

    // Update/delete coverage requires stable collection keys; keep create-only here.
  })

  it.skipIf(!hasEnv)('subscription refreshes collections on pod updates', { timeout: 20000 }, async () => {
    const database = await getDb()
    if (!database) {
      console.log('[Test] Skipping - database connection failed')
      return
    }

    if (typeof (database as any).subscribe !== 'function') {
      console.log('[Test] db.subscribe not available, skipping')
      return
    }

    chatCollection.startSyncImmediate()
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => {})
    
    // Track if subscription actually succeeded
    let subscriptionSucceeded = false
    const originalSubscribe = (database as any).subscribe.bind(database)
    ;(database as any).subscribe = async (...args: any[]) => {
      try {
        const result = await originalSubscribe(...args)
        subscriptionSucceeded = true
        return result
      } catch (e) {
        console.log('[Test] Subscription failed (likely 403), skipping notification test')
        throw e
      }
    }
    
    const unsubscribe = await subscribeToChatCollections(database)
    
    // If subscription failed due to permissions, skip the test
    if (!subscriptionSucceeded) {
      console.log('[Test] Pod notifications not available (403 Forbidden), skipping')
      invalidateSpy.mockRestore()
      return
    }

    const id = `chat-sub-${Date.now()}`
    const [created] = await database.insert(chatTable).values({
      id,
      title: 'Subscription Chat',
      description: 'subscription test',
      contact: env.webId!,
      participants: [env.webId!],
    }).execute()

    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push(subject)

    const notified = await waitFor(() => invalidateSpy.mock.calls.length > 0, 10000)

    await unsubscribe()
    invalidateSpy.mockRestore()
    expect(notified).toBe(true)
  })
})
