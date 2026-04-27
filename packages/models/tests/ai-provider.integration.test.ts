import 'dotenv/config'
import { afterAll, describe, expect, it } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, eq, type SolidDatabase } from '@undefineds.co/drizzle-solid'
import { aiProviderTable } from '../src/ai-provider.schema'
import { solidSchema } from '../src/schema'
import { startLocalXpod, type LocalXpodTestPod } from './utils/local-xpod'

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

let session: Session | null = null
let db: SolidDatabase | null = null
const createdIds: string[] = []

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
  await db.init([aiProviderTable])
  return db
}

afterAll(async () => {
  if (!db) {
    await localXpod?.stop()
    return
  }
  for (const id of createdIds) {
    try {
      await db.delete(aiProviderTable).whereByIri(id).execute()
    } catch {
      // ignore cleanup errors
    }
  }

  await localXpod?.stop()
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

    const rows = await database
      .select()
      .from(aiProviderTable)
      .where(eq(aiProviderTable.id, providerId))
      .execute()

    expect(rows.length).toBeGreaterThanOrEqual(1)
    const record = rows[0]

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

    await database
      .update(aiProviderTable)
      .set({
        baseUrl: 'https://api.updated.com/v1',
      })
      .where(eq(aiProviderTable.id, providerId))
      .execute()

    const updatedRows = await database
      .select()
      .from(aiProviderTable)
      .where(eq(aiProviderTable.id, providerId))
      .execute()

    expect(updatedRows[0]?.baseUrl).toBe('https://api.updated.com/v1')

    await database.delete(aiProviderTable).where(eq(aiProviderTable.id, providerId)).execute()

    const afterDelete = await database
      .select()
      .from(aiProviderTable)
      .where(eq(aiProviderTable.id, providerId))
      .execute()

    expect(afterDelete.length).toBe(0)
  })
})
