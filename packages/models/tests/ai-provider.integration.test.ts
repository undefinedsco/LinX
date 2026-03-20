import { afterAll, describe, expect, it } from 'vitest'
import type { SolidDatabase } from '@undefineds.co/drizzle-solid'
import { aiProviderTable } from '../src/ai-provider.schema'
import { linxSchema } from '../src/schema'
import {
  createXpodIntegrationContext,
  type XpodIntegrationContext,
} from './support/xpod-integration'

let context: XpodIntegrationContext<typeof linxSchema> | null = null
let db: SolidDatabase | null = null
const createdIds: string[] = []

async function getDb(): Promise<SolidDatabase> {
  if (db) return db

  context = await createXpodIntegrationContext({
    schema: linxSchema,
    tables: [aiProviderTable],
  })
  db = context.db
  return db
}

afterAll(async () => {
  if (!db) return
  for (const id of createdIds) {
    try {
      await (db as any).deleteByIri(aiProviderTable as any, id)
    } catch {
      // ignore cleanup errors
    }
  }
  await context?.stop()
})

describe('Solid Pod AIProvider CRUD', () => {
  it('creates and reads an AI provider', { timeout: 60000 }, async () => {
    const database = await getDb()
    const providerId = `test-provider-${Date.now()}`

    const [created] = await database
      .insert(aiProviderTable)
      .values({
        id: providerId,
        baseUrl: 'https://api.test.com/v1',
        proxyUrl: 'https://proxy.test.com/v1',
        hasModel: `/settings/ai/models.ttl#test-model`,
      })
      .execute()

    const subject = (created as any)?.['@id'] || (created as any)?.source
    if (subject) createdIds.push(subject)

    const record = await (database as any).findByLocator(aiProviderTable as any, { id: providerId } as any)
    expect(record).toBeTruthy()

    expect(record.id).toBe(providerId)
    expect(record.baseUrl).toBe('https://api.test.com/v1')
    expect(record.proxyUrl).toBe('https://proxy.test.com/v1')
    expect(record.hasModel).toContain('#test-model')
  })

  it('updates and deletes an AI provider', { timeout: 60000 }, async () => {
    const database = await getDb()
    const providerId = `update-provider-${Date.now()}`

    const [created] = await database
      .insert(aiProviderTable)
      .values({
        id: providerId,
        baseUrl: 'https://api.original.com/v1',
        proxyUrl: 'https://proxy.original.com/v1',
      })
      .execute()

    const subject = (created as any)?.['@id'] || (created as any)?.source
    if (subject) createdIds.push(subject)

    await (database as any).updateByLocator(aiProviderTable as any, { id: providerId } as any, {
      baseUrl: 'https://api.updated.com/v1',
    })

    const updatedRecord = await (database as any).findByLocator(aiProviderTable as any, { id: providerId } as any)

    expect(updatedRecord?.baseUrl).toBe('https://api.updated.com/v1')

    await (database as any).deleteByLocator(aiProviderTable as any, { id: providerId } as any)

    const afterDelete = await (database as any).findByLocator(aiProviderTable as any, { id: providerId } as any)

    expect(afterDelete).toBeNull()
  })
})
