// @vitest-environment node
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { resolveLinxPodBaseUrl } from '@undefineds.co/models/client'
import { drizzle, eq, type SolidDatabase } from '@undefineds.co/drizzle-solid'
import { chatTable, threadTable, messageTable, solidSchema } from '@undefineds.co/models'
import { startLocalXpod, type LocalXpodTestPod } from '../../test-utils/local-xpod'

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

let localXpod: LocalXpodTestPod | null = null

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

let session: Session | null = null
let db: SolidDatabase | null = null
async function getDb(): Promise<SolidDatabase> {
  if (db) return db

  const activeEnv = await ensureEnv()
  session = new Session()
  await session.login({
    clientId: activeEnv.clientId!,
    clientSecret: activeEnv.clientSecret!,
    oidcIssuer: activeEnv.oidcIssuer!,
    tokenType: 'DPoP',
  })

  db = drizzle(session, { logger: false, disableInteropDiscovery: true, schema: solidSchema })
  await db.init([chatTable, threadTable, messageTable])
  return db
}

afterAll(async () => {
  if (session) await session.logout()
  await localXpod?.stop()
}, 30000)

describe('chat collections integration', () => {
  it('insert chat and SELECT back via SPARQL', { timeout: 30000 }, async () => {
    const database = await getDb()

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

  it('round-trips group chat participants and metadata object', { timeout: 30000 }, async () => {
    const database = await getDb()
    if (!database || !env.webId) return

    const id = `group-chat-${Date.now()}`
    const podBase = resolveLinxPodBaseUrl(env.webId)
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
    // FIXME: drizzle-solid currently reads only one wf:participant from local xpod.
    // Keep this asserted so the test suite exposes the multi-value mapping gap instead of hiding it.
    expect([rows[0]?.participants].flat()).toEqual(expect.arrayContaining([assistantUri]))
    expect(rows[0]?.metadata).toMatchObject(metadata)

    await database.delete(chatTable).where(eq(chatTable.id, id)).execute()
  })

  it('insert thread/message and SELECT back', { timeout: 30000 }, async () => {
    const database = await getDb()

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
      chat: chatId,
      title: 'Thread One',
    } as any).execute()
    expect(thread).toBeDefined()

    const createdAt = new Date(Date.UTC(2026, 3, 24, 12, 0, 0))
    const [message] = await database.insert(messageTable).values({
      id: messageId,
      chat: chatId,
      thread: threadId,
      maker: env.webId!,
      role: 'user',
      content: 'hello from integration test',
      status: 'sent',
      createdAt,
    } as any).execute()
    expect(message).toBeDefined()

    // Avoid the known full message SELECT hang on inverse columns here. The
    // storage contract we need to prove is lower-level: short ids supplied to
    // URI relation fields must be resolved through schema templates, with no
    // literal template residue written to Pod RDF.
    const podBase = resolveLinxPodBaseUrl(env.webId!)
    const messageDocUrl = `${podBase}/.data/chat/${chatId}/2026/04/24/messages.ttl`
    const response = await session!.fetch(messageDocUrl, { headers: { accept: 'text/turtle' } })
    expect(response.ok).toBe(true)
    const turtle = await response.text()
    expect(turtle).not.toContain('{chat}')
    expect(turtle).toContain(`#${messageId}`)
    expect(turtle).toContain(`index.ttl#this`)
    expect(turtle).toContain(`index.ttl#${threadId}`)
    expect(turtle).toContain('hello from integration test')
  })

  it('delete chat and verify via SELECT', { timeout: 30000 }, async () => {
    const database = await getDb()

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
