// @vitest-environment node
import dotenv from 'dotenv'
import { afterAll, describe, expect, it } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, eq, type SolidDatabase } from '@undefineds.co/drizzle-solid'
import {
  aiModelTable,
  aiProviderTable,
  credentialTable,
  linxSchema,
} from '@linx/models'
import {
  initializeModelCollections,
  credentialCollection,
} from './collections'

dotenv.config({ path: '.env' })

const env = {
  webId: process.env.SOLID_WEBID,
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER,
}

const hasEnv = Boolean(env.webId && env.clientId && env.clientSecret && env.oidcIssuer)

// Check if Pod server is reachable before running integration tests
let podReachable = false
if (hasEnv && env.oidcIssuer) {
  try {
    const probeUrl = new URL('.well-known/openid-configuration', env.oidcIssuer).href
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    await fetch(probeUrl, { signal: ctrl.signal }).then(() => { podReachable = true })
    clearTimeout(timer)
  } catch { /* server not reachable */ }
}
const canRun = hasEnv && podReachable

let session: Session | null = null
let db: SolidDatabase | null = null
const createdSubjects: Array<{ table: 'credential' | 'provider' | 'model'; id: string }> = []

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
  await db.init([credentialTable, aiProviderTable, aiModelTable])
  initializeModelCollections(db)
  return db
}

async function cleanup() {
  if (!db) return

  for (const entry of createdSubjects) {
    try {
      if (entry.table === 'credential') {
        await db.delete(credentialTable).where({ '@id': entry.id } as any).execute()
      } else if (entry.table === 'provider') {
        await db.delete(aiProviderTable).where({ '@id': entry.id } as any).execute()
      } else {
        await db.delete(aiModelTable).where({ '@id': entry.id } as any).execute()
      }
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

describe('model services collections integration', () => {
  it.skipIf(!canRun)('credential collection optimistic insert persists', { timeout: 30000 }, async () => {
    const database = await getDb()

    const ready = new Promise<void>((resolve) => credentialCollection.onFirstReady(resolve))
    credentialCollection.startSyncImmediate()
    await ready

    const id = crypto.randomUUID()
    const newCredential = {
      id,
      provider: '/settings/ai/providers.ttl#openai',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      label: 'Test key',
    }

    let optimisticSeen = false
    const subscription = credentialCollection.subscribeChanges((changes) => {
      if (changes.some((change) => change.type === 'insert' && (change.value as any)?.id === id)) {
        optimisticSeen = true
      }
    })

    const tx = credentialCollection.insert(newCredential as any)
    const result = await Promise.race([
      waitFor(() => optimisticSeen).then((ok) => (ok ? 'optimistic' : 'timeout')),
      tx.isPersisted.promise.then(() => 'persisted'),
    ])

    subscription.unsubscribe()
    expect(result).toBe('optimistic')

    await tx.isPersisted.promise

    const rows = await database.select().from(credentialTable).where(eq(credentialTable.id, id)).execute()
    const created = rows[0]
    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push({ table: 'credential', id: subject })
    expect(created?.id).toBe(id)
    expect(created?.provider).toContain('#openai')
  })

  it.skipIf(!canRun)('provider/model CRUD via drizzle-solid persists to Pod', { timeout: 30000 }, async () => {
    const database = await getDb()

    const providerId = crypto.randomUUID()
    const modelId = `model-${crypto.randomUUID()}`

    // INSERT
    await database.insert(aiProviderTable).values({
      id: providerId,
      baseUrl: 'https://api.example.com/v1',
      proxyUrl: '',
      hasModel: `/settings/ai/models.ttl#${modelId}`,
    } as any).execute()

    await database.insert(aiModelTable).values({
      id: modelId,
      displayName: modelId,
      modelType: 'chat',
      isProvidedBy: `/settings/ai/providers.ttl#${providerId}`,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).execute()

    const [createdProvider] = await database.select().from(aiProviderTable).where(eq(aiProviderTable.id, providerId)).execute()
    const [createdModel] = await database.select().from(aiModelTable).where(eq(aiModelTable.id, modelId)).execute()
    expect(createdProvider?.baseUrl).toBe('https://api.example.com/v1')
    expect(createdModel?.status).toBe('active')

    const providerSubject = (createdProvider as any)?.['@id']
    const modelSubject = (createdModel as any)?.['@id']
    if (providerSubject) createdSubjects.push({ table: 'provider', id: providerSubject })
    if (modelSubject) createdSubjects.push({ table: 'model', id: modelSubject })

    // UPDATE
    await database.update(aiProviderTable).set({ baseUrl: 'https://api.changed.com/v1' } as any).where(eq(aiProviderTable.id, providerId)).execute()
    await database.update(aiModelTable).set({ status: 'inactive' } as any).where(eq(aiModelTable.id, modelId)).execute()

    const [updatedProvider] = await database.select().from(aiProviderTable).where(eq(aiProviderTable.id, providerId)).execute()
    const [updatedModel] = await database.select().from(aiModelTable).where(eq(aiModelTable.id, modelId)).execute()
    expect(updatedProvider?.baseUrl).toBe('https://api.changed.com/v1')
    expect(updatedModel?.status).toBe('inactive')

    // DELETE
    await database.delete(aiModelTable).where(eq(aiModelTable.id, modelId)).execute()
    await database.delete(aiProviderTable).where(eq(aiProviderTable.id, providerId)).execute()

    const providerRows = await database.select().from(aiProviderTable).where(eq(aiProviderTable.id, providerId)).execute()
    const modelRows = await database.select().from(aiModelTable).where(eq(aiModelTable.id, modelId)).execute()
    expect(providerRows.length).toBe(0)
    expect(modelRows.length).toBe(0)
  })
})
