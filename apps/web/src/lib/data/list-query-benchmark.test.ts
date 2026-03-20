// @vitest-environment node
/**
 * List Query Performance Benchmark
 * 
 * This test measures the time consumption of list queries for all modules:
 * - Chat: chats, threads, messages
 * - Contacts: contacts, agents
 * - Model Services: providers
 * - Profile: single profile fetch
 */
import dotenv from 'dotenv'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, type SolidDatabase } from '@undefineds.co/drizzle-solid'
import {
  aiProviderTable,
  chatTable,
  threadTable,
  messageTable,
  contactTable,
  agentTable,
  solidProfileTable,
  linxSchema,
} from '@linx/models'

dotenv.config({ path: '../../.env' })

const env = {
  webId: process.env.SOLID_WEBID,
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER,
}

const hasEnv = Boolean(env.webId && env.clientId && env.clientSecret && env.oidcIssuer)

let session: Session | null = null
type BenchmarkDb = SolidDatabase<typeof linxSchema>

let db: BenchmarkDb | null = null

function requireDb(): BenchmarkDb {
  if (!db) {
    throw new Error('Benchmark database is not initialized')
  }
  return db
}

interface BenchmarkResult {
  module: string
  query: string
  timeMs: number
  rowCount: number
  error?: string
}

const results: BenchmarkResult[] = []

async function measure<T>(
  module: string,
  query: string,
  fn: () => Promise<T[]>
): Promise<T[]> {
  const start = performance.now()
  try {
    const data = await fn()
    const end = performance.now()
    results.push({
      module,
      query,
      timeMs: Math.round((end - start) * 100) / 100,
      rowCount: data.length,
    })
    return data
  } catch (error) {
    const end = performance.now()
    results.push({
      module,
      query,
      timeMs: Math.round((end - start) * 100) / 100,
      rowCount: 0,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

async function measureSingle<T>(
  module: string,
  query: string,
  fn: () => Promise<T | null>
): Promise<T | null> {
  const start = performance.now()
  try {
    const data = await fn()
    const end = performance.now()
    results.push({
      module,
      query,
      timeMs: Math.round((end - start) * 100) / 100,
      rowCount: data ? 1 : 0,
    })
    return data
  } catch (error) {
    const end = performance.now()
    results.push({
      module,
      query,
      timeMs: Math.round((end - start) * 100) / 100,
      rowCount: 0,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function printResults() {
  console.log('\n' + '='.repeat(80))
  console.log('LIST QUERY BENCHMARK RESULTS')
  console.log('='.repeat(80))
  
  // Group by module
  const byModule = results.reduce((acc, r) => {
    if (!acc[r.module]) acc[r.module] = []
    acc[r.module].push(r)
    return acc
  }, {} as Record<string, BenchmarkResult[]>)
  
  for (const [module, moduleResults] of Object.entries(byModule)) {
    console.log(`\n📦 ${module}`)
    console.log('-'.repeat(60))
    
    for (const r of moduleResults) {
      const status = r.error ? '❌' : '✅'
      const rows = r.error ? `Error: ${r.error}` : `${r.rowCount} rows`
      console.log(`  ${status} ${r.query.padEnd(30)} ${String(r.timeMs).padStart(8)}ms  (${rows})`)
    }
    
    const totalTime = moduleResults.reduce((sum, r) => sum + r.timeMs, 0)
    console.log(`  ${'─'.repeat(50)}`)
    console.log(`  Total: ${Math.round(totalTime * 100) / 100}ms`)
  }
  
  // Overall summary
  const totalTime = results.reduce((sum, r) => sum + r.timeMs, 0)
  const errorCount = results.filter(r => r.error).length
  
  console.log('\n' + '='.repeat(80))
  console.log(`SUMMARY: ${results.length} queries, ${errorCount} errors, Total time: ${Math.round(totalTime * 100) / 100}ms`)
  console.log('='.repeat(80) + '\n')
}

describe.skipIf(!hasEnv)('List Query Benchmark', () => {
  beforeAll(async () => {
    session = new Session()
    await session.login({
      clientId: env.clientId!,
      clientSecret: env.clientSecret!,
      oidcIssuer: env.oidcIssuer!,
      tokenType: 'DPoP',
    })
    
    const database = drizzle(session, {
      disableInteropDiscovery: true,
      schema: linxSchema,
    })
    db = database
    
    // Initialize all tables
    await (database as any).init([
      chatTable,
      threadTable,
      messageTable,
      contactTable,
      agentTable,
      aiProviderTable,
      solidProfileTable,
    ])
  }, 30000)

  afterAll(async () => {
    printResults()
    if (session) await session.logout()
  }, 10000)

  // ============================================================================
  // Chat Module Queries
  // ============================================================================
  
  it('chat.list - fetch all chats', { timeout: 30000 }, async () => {
    await measure('Chat', 'chatCollection.fetch()', async () => {
      return await requireDb().select().from(chatTable).execute()
    })
  })

  it('chat.list - fetch chats with columns', { timeout: 30000 }, async () => {
    await measure('Chat', 'chatTable (selected columns)', async () => {
      const rows = await requireDb().select().from(chatTable).execute()
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        avatarUrl: row.avatarUrl,
        starred: row.starred,
        muted: row.muted,
        unreadCount: row.unreadCount,
        lastActiveAt: row.lastActiveAt,
        lastMessagePreview: row.lastMessagePreview,
      }))
    })
  })

  it('thread.list - fetch all threads', { timeout: 30000 }, async () => {
    await measure('Chat', 'threadCollection.fetch()', async () => {
      return await requireDb().select().from(threadTable).execute()
    })
  })

  it('message.list - fetch all messages', { timeout: 30000 }, async () => {
    await measure('Chat', 'messageCollection.fetch()', async () => {
      return await requireDb().select().from(messageTable).execute()
    })
  })

  it('agent.list - fetch all agents (chat module)', { timeout: 30000 }, async () => {
    await measure('Chat', 'agentCollection.fetch()', async () => {
      return await requireDb().select().from(agentTable).execute()
    })
  })

  // ============================================================================
  // Contacts Module Queries
  // ============================================================================

  it('contact.list - fetch all contacts', { timeout: 30000 }, async () => {
    await measure('Contacts', 'contactCollection.fetch()', async () => {
      return await requireDb().select().from(contactTable).execute()
    })
  })

  it('contact.list - fetch contacts with order', { timeout: 30000 }, async () => {
    await measure('Contacts', 'contactTable (ordered by name)', async () => {
      return await requireDb().select().from(contactTable).orderBy('name', 'asc').execute()
    })
  })

  // ============================================================================
  // Model Services Module Queries
  // ============================================================================

  it('provider.list - fetch all providers', { timeout: 30000 }, async () => {
    await measure('ModelServices', 'providerCollection.fetch()', async () => {
      return await db!.select().from(aiProviderTable).execute()
    })
  })

  // ============================================================================
  // Profile Module Queries
  // ============================================================================

  it('profile.fetch - fetch current user profile', { timeout: 30000 }, async () => {
    await measureSingle('Profile', 'profileOps.fetch()', async () => {
      return await (db as any)!.findByIri(solidProfileTable as any, env.webId!)
    })
  })

  // ============================================================================
  // Cold vs Warm Cache Comparison
  // ============================================================================

  it('chat.list - second fetch (warm cache)', { timeout: 30000 }, async () => {
    await measure('Cache Test', 'chatTable (2nd fetch)', async () => {
      return await db!.select().from(chatTable).execute()
    })
  })

  it('contact.list - second fetch (warm cache)', { timeout: 30000 }, async () => {
    await measure('Cache Test', 'contactTable (2nd fetch)', async () => {
      return await db!.select().from(contactTable).execute()
    })
  })
})
