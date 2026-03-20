// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { eq, type SolidDatabase } from '@undefineds.co/drizzle-solid'
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
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'

let context: XpodIntegrationContext<typeof linxSchema> | null = null
const createdSubjects: Array<{ table: 'credential' | 'provider' | 'model'; id: string }> = []

async function getContext(): Promise<XpodIntegrationContext<typeof linxSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: linxSchema,
    tables: [credentialTable, aiProviderTable, aiModelTable],
    initialize: (db) => {
      initializeModelCollections(db)
    },
  })
  return context
}

async function cleanup() {
  if (!context) return
  const db = context.db
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
  await context?.stop()
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
  it('credential collection optimistic insert persists', { timeout: 30000 }, async () => {
    const { db: database } = await getContext()

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

  it('provider/model CRUD via drizzle-solid persists to Pod', { timeout: 30000 }, async () => {
    const { db: database } = await getContext()

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
