// @vitest-environment node
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, eq, type SolidDatabase } from '@undefineds.co/drizzle-solid'
import { chatTable, threadTable, messageTable, linxSchema } from '@linx/models'

// Load .env from project root (../../ from this file)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = resolve(__dirname, '../../../../../.env')
dotenv.config({ path: envPath })

const env = {
  webId: process.env.SOLID_WEBID,
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER,
}

console.log('[Integration Test] Environment:', {
  webId: env.webId ? 'SET' : 'MISSING',
  clientId: env.clientId ? 'SET' : 'MISSING',
  clientSecret: env.clientSecret ? 'SET' : 'MISSING',
  oidcIssuer: env.oidcIssuer || 'MISSING',
})

const hasEnv = Boolean(env.webId && env.clientId && env.clientSecret && env.oidcIssuer)

// Check if Pod server is reachable before running integration tests
let podReachable = false
if (hasEnv && env.oidcIssuer) {
  try {
    const probeUrl = new URL('.well-known/openid-configuration', env.oidcIssuer).href
    console.log('[Integration Test] Probing Pod server:', probeUrl)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    await fetch(probeUrl, { signal: ctrl.signal }).then(() => {
      podReachable = true
      console.log('[Integration Test] Pod server is reachable')
    })
    clearTimeout(timer)
  } catch (err) {
    console.log('[Integration Test] Pod server probe failed:', err instanceof Error ? err.message : String(err))
  }
}
const canRun = hasEnv && podReachable
console.log('[Integration Test] hasEnv:', hasEnv, 'podReachable:', podReachable, 'canRun:', canRun)

let session: Session | null = null
let db: SolidDatabase | null = null
let loginFailed = false

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
    return db
  } catch (e) {
    console.log('[Test] Login failed:', (e as Error).message)
    loginFailed = true
    return null
  }
}

afterAll(async () => {
  if (session) await session.logout()
}, 30000)

describe('chat collections integration', () => {
  it.skipIf(!canRun)('insert chat and SELECT back via SPARQL', { timeout: 30000 }, async () => {
    const database = await getDb()
    if (!database) return

    const id = `chat-${Date.now()}`
    const [created] = await database.insert(chatTable).values({
      id,
      title: 'Integration Chat',
      description: 'chat insert test',
      participants: [env.webId!],
    }).execute()

    expect(created).toBeDefined()

    // Round-trip: SELECT back via SPARQL endpoint
    const rows = await database.select().from(chatTable).where(eq(chatTable.id, id)).execute()
    expect(rows.length).toBe(1)
    expect(rows[0]?.title).toBe('Integration Chat')
  })

  it.skipIf(!canRun)('round-trips group chat participants and metadata object', { timeout: 30000 }, async () => {
    const database = await getDb()
    if (!database || !env.webId) return

    const id = `group-chat-${Date.now()}`
    const podBase = env.webId.replace('/profile/card#me', '')
    const assistantUri = `${podBase}/.data/agents/assistant-${id}.ttl#this`
    const metadata = {
      memberRoles: {
        [env.webId]: 'owner',
        [assistantUri]: 'member',
      },
    } as const

    await database.insert(chatTable).values({
      id,
      title: 'Group Round Trip',
      participants: [env.webId, assistantUri],
      metadata,
    }).execute()

    const rows = await database.select().from(chatTable).where(eq(chatTable.id, id)).execute()
    expect(rows.length).toBe(1)
    expect(rows[0]?.participants).toEqual([env.webId, assistantUri])
    expect(rows[0]?.metadata).toEqual(metadata)

    await database.delete(chatTable).where(eq(chatTable.id, id)).execute()
  })

  it.skipIf(!canRun)('insert thread/message and SELECT back', { timeout: 30000 }, async () => {
    const database = await getDb()
    if (!database) return

    const chatId = `chat-thread-${Date.now()}`
    const threadId = `thread-${Date.now()}`
    const messageId = `msg-${Date.now()}`

    await database.insert(chatTable).values({
      id: chatId,
      title: 'Thread Test Chat',
      participants: [env.webId!],
    }).execute()

    const [thread] = await database.insert(threadTable).values({
      id: threadId,
      chatId,
      title: 'Thread One',
    } as any).execute()
    expect(thread).toBeDefined()

    const [message] = await database.insert(messageTable).values({
      id: messageId,
      chatId,
      threadId,
      maker: env.webId!,
      role: 'user',
      content: 'hello from integration test',
      status: 'sent',
    } as any).execute()
    expect(message).toBeDefined()

    // Round-trip: SELECT messages back via SPARQL
    // inverse() columns (threadId/chatId) should now work correctly with the
    // executeMultiPatternJoin fix in QuintQuerySource.
    const msgRows = await database.select().from(messageTable).where(eq(messageTable.id, messageId)).execute()
    expect(msgRows.length).toBe(1)
    expect(msgRows[0]?.content).toBe('hello from integration test')
  })

  it.skipIf(!canRun)('delete chat and verify via SELECT', { timeout: 30000 }, async () => {
    const database = await getDb()
    if (!database) return

    const id = `chat-del-${Date.now()}`
    await database.insert(chatTable).values({
      id,
      title: 'Delete Me',
      participants: [env.webId!],
    }).execute()

    await database.delete(chatTable).where(eq(chatTable.id, id)).execute()

    // Verify deletion via SPARQL SELECT
    const rows = await database.select().from(chatTable).where(eq(chatTable.id, id)).execute()
    expect(rows.length).toBe(0)
  })
})
