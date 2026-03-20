// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import type { SolidDatabase } from '@undefineds.co/drizzle-solid'
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
        await (db as any).deleteByIri(credentialTable as any, entry.id)
      } else if (entry.table === 'provider') {
        await (db as any).deleteByIri(aiProviderTable as any, entry.id)
      } else {
        await (db as any).deleteByIri(aiModelTable as any, entry.id)
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

    const created = await (database as any).findByLocator(credentialTable as any, { id } as any)
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

    const createdProvider = await (database as any).findByLocator(aiProviderTable as any, { id: providerId } as any)
    const createdModel = await (database as any).findByLocator(aiModelTable as any, { id: modelId } as any)
    expect(createdProvider?.baseUrl).toBe('https://api.example.com/v1')
    expect(createdModel?.status).toBe('active')

    const providerSubject = (createdProvider as any)?.['@id']
    const modelSubject = (createdModel as any)?.['@id']
    if (providerSubject) createdSubjects.push({ table: 'provider', id: providerSubject })
    if (modelSubject) createdSubjects.push({ table: 'model', id: modelSubject })

    // UPDATE
    await (database as any).updateByLocator(aiProviderTable as any, { id: providerId } as any, {
      baseUrl: 'https://api.changed.com/v1',
    })
    await (database as any).updateByLocator(aiModelTable as any, { id: modelId } as any, {
      status: 'inactive',
    })

    const updatedProvider = await (database as any).findByLocator(aiProviderTable as any, { id: providerId } as any)
    const updatedModel = await (database as any).findByLocator(aiModelTable as any, { id: modelId } as any)
    expect(updatedProvider?.baseUrl).toBe('https://api.changed.com/v1')
    expect(updatedModel?.status).toBe('inactive')

    // DELETE
    await (database as any).deleteByLocator(aiModelTable as any, { id: modelId } as any)
    await (database as any).deleteByLocator(aiProviderTable as any, { id: providerId } as any)

    const providerRow = await (database as any).findByLocator(aiProviderTable as any, { id: providerId } as any)
    const modelRow = await (database as any).findByLocator(aiModelTable as any, { id: modelId } as any)
    expect(providerRow).toBeNull()
    expect(modelRow).toBeNull()
  })
})
