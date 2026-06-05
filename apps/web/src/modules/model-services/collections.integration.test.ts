// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import type { SolidDatabase } from '@undefineds.co/drizzle-solid'
import { extractPodResourceTemplateValue } from '@undefineds.co/drizzle-solid'
import {
  aiModelTable,
  aiProviderTable,
  credentialTable,
  solidSchema,
} from '@undefineds.co/models'
import {
  initializeModelCollections,
  credentialCollection,
} from './collections'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'

let context: XpodIntegrationContext<typeof solidSchema> | null = null
const createdSubjects: Array<{ table: 'credential' | 'provider' | 'model'; id: string }> = []

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
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
      provider: '/settings/providers/openai.ttl',
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

    const created = await (database as any).findById(credentialTable as any, id)
    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push({ table: 'credential', id: subject })
    expect(created?.id).toContain(`#${id}`)
    expect(extractPodResourceTemplateValue(credentialTable as any, created?.id)).toBe(id)
    expect(created?.provider).toContain('/settings/providers/openai.ttl')
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
      hasModel: `/settings/providers/${providerId}.ttl#${modelId}`,
    } as any).execute()

    const modelLocator = { id: modelId, isProvidedBy: providerId }
    const modelResourceId = aiModelTable.buildId(modelLocator)
    await database.insert(aiModelTable).values({
      id: modelResourceId,
      displayName: modelId,
      modelType: 'chat',
      isProvidedBy: providerId,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).execute()

    const createdProvider = await (database as any).findById(aiProviderTable as any, providerId)
    const createdModel = await (database as any).findById(aiModelTable as any, modelResourceId)
    expect(createdProvider?.baseUrl).toBe('https://api.example.com/v1')
    expect(createdModel?.status).toBe('active')

    const providerSubject = (createdProvider as any)?.['@id']
    const modelSubject = (createdModel as any)?.['@id']
    if (providerSubject) createdSubjects.push({ table: 'provider', id: providerSubject })
    if (modelSubject) createdSubjects.push({ table: 'model', id: modelSubject })

    // UPDATE
    await (database as any).updateById(aiProviderTable as any, providerId, {
      baseUrl: 'https://api.changed.com/v1',
    })
    await (database as any).updateById(aiModelTable as any, modelResourceId, {
      status: 'inactive',
    })

    const updatedProvider = await (database as any).findById(aiProviderTable as any, providerId)
    const updatedModel = await (database as any).findById(aiModelTable as any, modelResourceId)
    expect(updatedProvider?.baseUrl).toBe('https://api.changed.com/v1')
    expect(updatedModel?.status).toBe('inactive')

    // DELETE
    await (database as any).deleteById(aiModelTable as any, modelResourceId)
    await (database as any).deleteById(aiProviderTable as any, providerId)

    const providerRow = await (database as any).findById(aiProviderTable as any, providerId)
    const modelRow = await (database as any).findById(aiModelTable as any, modelResourceId)
    expect(providerRow).toBeNull()
    expect(modelRow).toBeNull()
  })
})
