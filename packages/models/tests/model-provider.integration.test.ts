import 'dotenv/config'
import { describe, it, expect, afterAll } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, type SolidDatabase } from 'drizzle-solid'
import { modelProviderTable } from '../src/model-provider.schema'
import { linxSchema } from '../src/schema'
import { eq } from 'drizzle-solid'

const env = {
  webId: process.env.SOLID_WEBID,
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER,
}

const hasEnv = Boolean(env.webId && env.clientId && env.clientSecret && env.oidcIssuer)

let session: Session | null = null
let db: SolidDatabase | null = null
const createdIds: string[] = []

async function getDb(): Promise<SolidDatabase> {
  if (db) return db
  
  session = new Session()
  await session.login({
    clientId: env.clientId!,
    clientSecret: env.clientSecret!,
    oidcIssuer: env.oidcIssuer!,
    tokenType: 'DPoP',
  })
  db = drizzle(session, { logger: false, disableInteropDiscovery: true, schema: linxSchema })
  await db.init([modelProviderTable])
  return db
}

afterAll(async () => {
  if (!db) return
  for (const id of createdIds) {
    try {
      await db.delete(modelProviderTable).where({ '@id': id } as any).execute()
    } catch (e) { /* ignore */ }
  }
})

describe('Solid Pod ModelProvider CRUD', () => {
  
  it.skipIf(!hasEnv)('creates and reads a model provider', { timeout: 60000 }, async () => {
    const database = await getDb()
    const providerId = `test-provider-${Date.now()}`

    // CREATE
    const [created] = await database
      .insert(modelProviderTable)
      .values({
        id: providerId,
        enabled: true,
        apiKey: 'sk-test-api-key',
        baseUrl: 'https://api.test.com/v1',
        models: [{ id: 'model-1', name: 'model-1', group: 'default' }, { id: 'model-2', name: 'model-2', group: 'default' }],
      })
      .execute()

    const subject = (created as any)?.['@id'] || (created as any)?.source
    if (subject) createdIds.push(subject)

    // READ
    const rows = await database
      .select()
      .from(modelProviderTable)
      .where(eq(modelProviderTable.id, providerId))
      .execute()
    
    expect(rows.length).toBeGreaterThanOrEqual(1)
    const record = rows[0]
    
    expect(record.id).toBe(providerId)
    expect(record.enabled).toBe(true)
    expect(record.apiKey).toBe('sk-test-api-key')
    expect(record.baseUrl).toBe('https://api.test.com/v1')
  })

  it.skipIf(!hasEnv)('updates and deletes a model provider', { timeout: 60000 }, async () => {
    const database = await getDb()
    const providerId = `update-provider-${Date.now()}`

    const [created] = await database
      .insert(modelProviderTable)
      .values({
        id: providerId,
        enabled: true,
        apiKey: 'sk-original',
        baseUrl: 'https://api.original.com/v1',
        models: [{ id: 'model-1', name: 'model-1', group: 'default' }],
      })
      .execute()

    const subject = (created as any)?.['@id'] || (created as any)?.source
    if (subject) createdIds.push(subject)

    await database
      .update(modelProviderTable)
      .set({
        enabled: false,
        apiKey: 'sk-updated',
      })
      .where(eq(modelProviderTable.id, providerId))
      .execute()

    const updatedRows = await database
      .select()
      .from(modelProviderTable)
      .where(eq(modelProviderTable.id, providerId))
      .execute()

    expect(updatedRows[0]?.enabled).toBe(false)
    expect(updatedRows[0]?.apiKey).toBe('sk-updated')

    await database.delete(modelProviderTable).where(eq(modelProviderTable.id, providerId)).execute()

    const afterDelete = await database
      .select()
      .from(modelProviderTable)
      .where(eq(modelProviderTable.id, providerId))
      .execute()

    expect(afterDelete.length).toBe(0)
  })

  it.skipIf(!hasEnv)('creates multiple providers', { timeout: 60000 }, async () => {
    const database = await getDb()
    const testPrefix = `multi-${Date.now()}`

    // Create OpenAI provider
    const [openai] = await database
      .insert(modelProviderTable)
      .values({
        id: `${testPrefix}-openai`,
        enabled: true,
        apiKey: 'sk-openai-key',
        baseUrl: 'https://api.openai.com/v1',
        models: [{ id: 'gpt-4', name: 'gpt-4', group: 'default' }, { id: 'gpt-3.5-turbo', name: 'gpt-3.5-turbo', group: 'default' }],
      })
      .execute()
    
    const openaiSubject = (openai as any)?.['@id'] || (openai as any)?.source
    if (openaiSubject) createdIds.push(openaiSubject)

    // Create Anthropic provider
    const [anthropic] = await database
      .insert(modelProviderTable)
      .values({
        id: `${testPrefix}-anthropic`,
        enabled: false,
        apiKey: 'sk-anthropic-key',
        baseUrl: 'https://api.anthropic.com/v1',
        models: [{ id: 'claude-3-opus', name: 'claude-3-opus', group: 'default' }, { id: 'claude-3-sonnet', name: 'claude-3-sonnet', group: 'default' }],
      })
      .execute()

    const anthropicSubject = (anthropic as any)?.['@id'] || (anthropic as any)?.source
    if (anthropicSubject) createdIds.push(anthropicSubject)

    // READ all and filter
    const allRows = await database
      .select()
      .from(modelProviderTable)
      .execute()
    
    const testProviders = allRows.filter(p => p.id?.startsWith(testPrefix))
    expect(testProviders.length).toBeGreaterThanOrEqual(2)
    
    const openaiRecord = testProviders.find(p => p.id?.includes('openai'))
    const anthropicRecord = testProviders.find(p => p.id?.includes('anthropic'))
    
    expect(openaiRecord?.enabled).toBe(true)
    expect(anthropicRecord?.enabled).toBe(false)
  })

  it.skipIf(!hasEnv)('lists all model providers', { timeout: 60000 }, async () => {
    const database = await getDb()

    const allRows = await database
      .select()
      .from(modelProviderTable)
      .execute()
    
    expect(allRows.length).toBeGreaterThanOrEqual(0)
    
    for (const provider of allRows) {
      expect(provider.id).toBeTruthy()
    }
  })
})
